import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, uploadFileToGridFS } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { ConversationThread, InternalMessage, MessageAttachment } from '@/types/admin';
import { validateFileMagicBytes } from '@/lib/fileValidation';
import { getSafeErrorMessage } from '@/lib/errorSanitizer';

export const dynamic = 'force-dynamic';

// GET /api/v1/messages/conversations - List conversations
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const targetEmployeeId = searchParams.get('employeeId');

    const { db } = await connectToDatabase();

    const query: any = { organizationId: auth.organizationId };

    if (auth.role === 'EMPLOYEE') {
      // Employees can ONLY see conversations where they are the employee participant
      const empId = auth.employeeId || auth.userId;
      query.$or = [{ employeeId: empId }, { employeeId: auth.userId }, { employeeId: auth.employeeId }];
    } else if (auth.role === 'MANAGER') {
      // Managers can ONLY see conversations involving direct reports in their team or created by them
      const managerEmpId = auth.employeeId;
      if (!managerEmpId) {
        return NextResponse.json({ success: false, message: 'Manager employee ID missing' }, { status: 403 });
      }

      const teamDocs = await db
        .collection('employees')
        .find({
          organizationId: auth.organizationId,
          $or: [{ managerId: managerEmpId }, { reportingTo: managerEmpId }],
        }, { projection: { employeeId: 1, id: 1 } })
        .toArray();

      const teamEmpIds = teamDocs
        .map((doc) => doc.employeeId || doc.id || doc._id.toString())
        .filter(Boolean);

      if (targetEmployeeId) {
        if (!teamEmpIds.includes(targetEmployeeId) && targetEmployeeId !== managerEmpId) {
          return NextResponse.json({ success: true, conversations: [] });
        }
        query.employeeId = targetEmployeeId;
      } else {
        query.$or = [
          { employeeId: { $in: teamEmpIds } },
          { createdBy: auth.userId },
          { createdBy: auth.employeeId },
        ];
      }
    } else if (targetEmployeeId) {
      // HR, Admin, Super Admin can inspect by targetEmployeeId or view all org conversations
      query.employeeId = targetEmployeeId;
    }

    const rawConversations = await db
      .collection('conversations')
      .find(query)
      .sort({ updatedAt: -1 })
      .toArray();

    const conversations: ConversationThread[] = rawConversations.map((c) => ({
      id: c.id || c._id.toString(),
      organizationId: c.organizationId,
      employeeId: c.employeeId,
      employeeName: c.employeeName || 'Employee',
      employeeAvatar: c.employeeAvatar || '',
      employeeEmail: c.employeeEmail || '',
      department: c.department || '',
      subject: c.subject || 'No Subject',
      lastMessage: c.lastMessage || '',
      lastMessageAt: c.lastMessageAt || c.createdAt || new Date().toISOString(),
      unreadCountHr: c.unreadCountHr || 0,
      unreadCountEmployee: c.unreadCountEmployee || 0,
      createdBy: c.createdBy || '',
      createdAt: c.createdAt || new Date().toISOString(),
      updatedAt: c.updatedAt || new Date().toISOString(),
    }));

    return NextResponse.json({ success: true, conversations });
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

// POST /api/v1/messages/conversations - Create new conversation thread
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const contentType = req.headers.get('content-type') || '';
    let employeeId = '';
    let subject = '';
    let messageText = '';
    let attachments: MessageAttachment[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      employeeId = (formData.get('employeeId') as string) || '';
      subject = (formData.get('subject') as string) || '';
      messageText = (formData.get('message') as string) || '';

      const file = formData.get('file') as File | null;
      if (file && file.size > 0) {
        if (file.size > 10 * 1024 * 1024) {
          return NextResponse.json(
            { success: false, message: 'File size exceeds maximum allowed limit of 10MB' },
            { status: 400 }
          );
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
      employeeId = body.employeeId || '';
      subject = body.subject || '';
      messageText = body.message || '';
      attachments = body.attachments || [];
    }

    if (!employeeId || !subject || !messageText) {
      return NextResponse.json(
        { success: false, message: 'employeeId, subject, and message are required fields' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Verification for MANAGER role: recipient must be a direct report in manager's team
    if (auth.role === 'MANAGER') {
      const managerEmpId = auth.employeeId;
      if (!managerEmpId) {
        return NextResponse.json(
          { success: false, message: 'Forbidden. Manager employee profile missing.' },
          { status: 403 }
        );
      }

      const isTeamMember = await db.collection('employees').findOne({
        organizationId: auth.organizationId,
        $or: [{ employeeId: employeeId }, { id: employeeId }],
        $and: [
          {
            $or: [{ managerId: managerEmpId }, { reportingTo: managerEmpId }],
          },
        ],
      });

      if (!isTeamMember) {
        return NextResponse.json(
          { success: false, message: 'Forbidden. Target employee is not in your authorized team.' },
          { status: 403 }
        );
      }
    }

    // Fetch target employee details
    const employeeDoc = await db.collection('employees').findOne({
      organizationId: auth.organizationId,
      $or: [{ employeeId }, { id: employeeId }, { userId: employeeId }],
    });

    const empName = employeeDoc?.fullName || `${employeeDoc?.firstName || ''} ${employeeDoc?.lastName || ''}`.trim() || 'Employee';
    const empAvatar = employeeDoc?.photo || employeeDoc?.avatar || '';
    const empEmail = employeeDoc?.email || '';
    const empDept = employeeDoc?.department || '';
    const targetUserId = employeeDoc?.userId || employeeDoc?.employeeId || employeeId;

    const convId = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowISO = new Date().toISOString();

    const senderDisplayName = auth.role === 'MANAGER' ? (auth.name || 'Manager') : (auth.name || 'HR Admin');

    const conversationDoc: ConversationThread = {
      id: convId,
      organizationId: auth.organizationId,
      employeeId,
      employeeName: empName,
      employeeAvatar: empAvatar,
      employeeEmail: empEmail,
      department: empDept,
      subject,
      lastMessage: messageText,
      lastMessageAt: nowISO,
      unreadCountHr: 0,
      unreadCountEmployee: 1,
      createdBy: auth.userId,
      createdAt: nowISO,
      updatedAt: nowISO,
    };

    const initialMessage: InternalMessage = {
      id: msgId,
      conversationId: convId,
      organizationId: auth.organizationId,
      senderId: auth.userId,
      senderRole: auth.role,
      senderName: senderDisplayName,
      senderAvatar: '',
      receiverId: employeeId,
      message: messageText,
      attachments,
      readAt: null,
      createdAt: nowISO,
    };

    await db.collection('conversations').insertOne(conversationDoc as any);
    await db.collection('messages').insertOne(initialMessage as any);

    // Create in-app notification for Employee
    const notificationTitle = auth.role === 'MANAGER' ? `New message from Manager: ${subject}` : `New message from HR: ${subject}`;
    const notificationDoc = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: targetUserId,
      employeeId,
      title: notificationTitle,
      message: messageText.length > 100 ? `${messageText.slice(0, 100)}...` : messageText,
      category: 'system',
      priority: 'high',
      isRead: false,
      link: '/employee/messages',
      createdAt: nowISO,
      updatedAt: nowISO,
    };
    await db.collection('notifications').insertOne(notificationDoc);

    return NextResponse.json({
      success: true,
      message: 'Message sent successfully',
      conversation: conversationDoc,
      initialMessage,
    });
  } catch (error: any) {
    console.error('Error creating conversation:', error);
    return NextResponse.json(
      { success: false, message: getSafeErrorMessage(error, 'Failed to send message') },
      { status: 500 }
    );
  }
}
