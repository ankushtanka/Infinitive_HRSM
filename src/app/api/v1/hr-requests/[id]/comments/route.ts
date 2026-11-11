import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, uploadFileToGridFS } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { HrTicketComment, MessageAttachment } from '@/types/admin';
import { validateFileMagicBytes } from '@/lib/fileValidation';
import { getSafeErrorMessage } from '@/lib/errorSanitizer';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { id } = params;
    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    const ticketDoc = await db.collection('hr_requests').findOne({
      organizationId: orgId,
      $or: [{ id }, { ticketNo: id }],
    });

    if (!ticketDoc) {
      return NextResponse.json({ success: false, message: 'HR Support Ticket not found' }, { status: 404 });
    }

    // Access control for Employees
    if (auth.role === 'EMPLOYEE') {
      const empId = auth.employeeId || auth.userId;
      if (ticketDoc.employeeId !== empId && ticketDoc.employeeId !== auth.userId && ticketDoc.employeeId !== auth.employeeId) {
        return NextResponse.json({ success: false, message: 'Forbidden. Access restricted.' }, { status: 403 });
      }
    }

    // Access control for Managers
    if (auth.role === 'MANAGER') {
      const managerEmpId = auth.employeeId;
      if (!managerEmpId) {
        return NextResponse.json({ success: false, message: 'Forbidden. Manager employee profile missing.' }, { status: 403 });
      }

      const isTeamMember = await db.collection('employees').findOne({
        organizationId: orgId,
        $or: [{ employeeId: ticketDoc.employeeId }, { id: ticketDoc.employeeId }],
        $and: [
          { $or: [{ managerId: managerEmpId }, { reportingTo: managerEmpId }] },
        ],
      });

      const isAssigned = ticketDoc.assignedToId === managerEmpId || ticketDoc.assignedToId === auth.userId;

      if (!isTeamMember && !isAssigned) {
        return NextResponse.json({ success: false, message: 'Forbidden. You can only comment on tickets for your authorized team members.' }, { status: 403 });
      }
    }

    const contentType = req.headers.get('content-type') || '';
    let commentText = '';
    let isInternal = false;
    let attachments: MessageAttachment[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      commentText = (formData.get('comment') as string) || '';
      isInternal = formData.get('isInternal') === 'true';

      const file = formData.get('file') as File | null;
      if (file && file.size > 0) {
        if (file.size > 10 * 1024 * 1024) {
          return NextResponse.json({ success: false, message: 'Attachment file size exceeds maximum limit of 10MB' }, { status: 400 });
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const validation = validateFileMagicBytes(buffer, file.name);
        if (!validation.valid) {
          return NextResponse.json({ success: false, message: validation.error || 'Invalid attachment file.' }, { status: 400 });
        }
        const fileId = await uploadFileToGridFS(file.name, file.type || 'application/octet-stream', buffer, 'documents');
        attachments.push({
          fileId,
          fileName: file.name,
          fileSize: `${(file.size / 1024).toFixed(1)} KB`,
          fileSizeBytes: file.size,
          mimeType: file.type || 'application/octet-stream',
          fileUrl: `/api/v1/documents/${fileId}/file`,
        });
      }
    } else {
      const body = await req.json();
      commentText = body.comment || '';
      isInternal = Boolean(body.isInternal);
      attachments = body.attachments || [];
    }

    if (!commentText.trim() && attachments.length === 0) {
      return NextResponse.json({ success: false, message: 'Comment body or attachment is required' }, { status: 400 });
    }

    // Strict rule: Employees & Managers CANNOT post internal HR notes unless authorized HR/Admin
    if (auth.role === 'EMPLOYEE' || auth.role === 'MANAGER') {
      isInternal = false;
    }

    const nowISO = new Date().toISOString();
    const commentId = `cmt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const newComment: HrTicketComment = {
      id: commentId,
      requestId: ticketDoc.id || id,
      organizationId: orgId,
      authorId: auth.userId || auth.employeeId || 'user',
      authorName: auth.name || 'User',
      authorRole: auth.role,
      comment: commentText.trim(),
      isInternal,
      attachments,
      createdAt: nowISO,
    };

    await db.collection('hr_request_comments').insertOne(newComment as any);

    // Update ticket timestamp
    await db.collection('hr_requests').updateOne(
      { _id: ticketDoc._id },
      {
        $set: { updatedAt: nowISO },
        $push: {
          history: {
            action: `Comment added by ${auth.name || 'User'} (${auth.role})`,
            performedBy: auth.name || 'User',
            timestamp: nowISO,
          },
        } as any,
      }
    );

    // Audit event
    await logAuditEvent(req, 'ADD_HR_TICKET_COMMENT', {
      employeeId: ticketDoc.employeeId,
      details: {
        ticketNo: ticketDoc.ticketNo,
        commentId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Comment added successfully',
      comment: newComment,
    });
  } catch (error: any) {
    console.error('Error posting comment:', error);
    return NextResponse.json({ success: false, message: getSafeErrorMessage(error, 'Failed to post comment') }, { status: 500 });
  }
}
