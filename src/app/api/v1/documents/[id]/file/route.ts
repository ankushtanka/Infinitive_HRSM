import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, getFileStreamFromGridFS } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function GET(
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

    let doc: any = null;
    let targetGridFsId: string | null = null;
    let isMessageAttachment = false;
    let messageAttachmentInfo: any = null;

    if (ObjectId.isValid(id)) {
      doc = await db.collection('documents').findOne({
        _id: new ObjectId(id),
        organizationId: auth.organizationId,
      });
    }

    if (doc) {
      targetGridFsId = doc.gridFsFileId || doc.fileId || id;
    } else {
      // Check if `id` is a GridFS file ID associated with an internal message attachment
      const messageWithAttachment = await db.collection('messages').findOne({
        organizationId: auth.organizationId,
        'attachments.fileId': id,
      });

      if (messageWithAttachment) {
        isMessageAttachment = true;
        const matchingAttachment = (messageWithAttachment.attachments || []).find((att: any) => att.fileId === id);
        messageAttachmentInfo = matchingAttachment;

        // Verify conversation access authorization
        const conversation = await db.collection('conversations').findOne({
          id: messageWithAttachment.conversationId,
          organizationId: auth.organizationId,
        });

        if (!conversation) {
          return NextResponse.json({ success: false, message: 'Attachment conversation thread not found' }, { status: 404 });
        }

        if (auth.role === 'EMPLOYEE') {
          const empId = auth.employeeId || auth.userId;
          if (conversation.employeeId !== empId && conversation.employeeId !== auth.userId && conversation.employeeId !== auth.employeeId) {
            return NextResponse.json({ success: false, message: 'Forbidden. Access restricted to conversation participants.' }, { status: 403 });
          }
        } else if (auth.role === 'MANAGER') {
          const managerEmpId = auth.employeeId;
          if (!managerEmpId) {
            return NextResponse.json({ success: false, message: 'Forbidden. Manager profile missing.' }, { status: 403 });
          }

          const isTeamMember = await db.collection('employees').findOne({
            organizationId: auth.organizationId,
            $or: [{ employeeId: conversation.employeeId }, { id: conversation.employeeId }],
            $and: [
              { $or: [{ managerId: managerEmpId }, { reportingTo: managerEmpId }] },
            ],
          });

          const isCreator = conversation.createdBy === auth.userId || conversation.createdBy === managerEmpId;

          if (!isTeamMember && !isCreator) {
            return NextResponse.json({ success: false, message: 'Forbidden. File does not belong to an authorized team conversation.' }, { status: 403 });
          }
        }

        targetGridFsId = id;
      }
    }

    if (!targetGridFsId) {
      return NextResponse.json({ success: false, message: 'Document file not found or access denied' }, { status: 404 });
    }

    // Role verification for regular documents in `documents` collection
    if (doc && !isMessageAttachment) {
      if (auth.role === 'EMPLOYEE' && auth.employeeId && doc.employeeId !== auth.employeeId) {
        const allowedRoles = ['Employee', 'Public', 'HR & Admin'];
        if (!allowedRoles.includes(doc.accessRole)) {
          return NextResponse.json({ success: false, message: 'Forbidden. Access restricted.' }, { status: 403 });
        }
      }

      if (auth.role === 'MANAGER' && doc.employeeId && doc.employeeId !== auth.employeeId) {
        // Being a manager does not automatically grant access to arbitrary private HR documents
        const isTeamMemberDoc = await db.collection('employees').findOne({
          organizationId: auth.organizationId,
          $or: [{ employeeId: doc.employeeId }, { id: doc.employeeId }],
          $and: [
            { $or: [{ managerId: auth.employeeId }, { reportingTo: auth.employeeId }] },
          ],
        });

        const allowedManagerRoles = ['Manager', 'Public', 'HR & Admin'];
        if (!isTeamMemberDoc || !allowedManagerRoles.includes(doc.accessRole)) {
          return NextResponse.json({ success: false, message: 'Forbidden. Document access restricted.' }, { status: 403 });
        }
      }
    }

    const fileResult = await getFileStreamFromGridFS(targetGridFsId, 'documents');
    if (!fileResult) {
      return NextResponse.json({ success: false, message: 'File binary not found in MongoDB GridFS' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const isDownload = searchParams.get('download') === 'true';

    const filename = doc?.originalFileName || doc?.fileName || messageAttachmentInfo?.fileName || fileResult.filename || 'document.pdf';
    const contentType = doc?.mimeType || messageAttachmentInfo?.mimeType || fileResult.contentType || 'application/pdf';

    const disposition = isDownload
      ? `attachment; filename="${encodeURIComponent(filename)}"`
      : `inline; filename="${encodeURIComponent(filename)}"`;

    return new NextResponse(fileResult.stream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Cache-Control': 'public, max-age=3600, must-revalidate',
      },
    });
  } catch (error: any) {
    console.error('Error streaming document file from MongoDB GridFS:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Error streaming document file' },
      { status: 500 }
    );
  }
}
