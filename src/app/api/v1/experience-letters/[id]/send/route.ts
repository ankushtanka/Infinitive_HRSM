import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, getGridFSBucket } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { sendExperienceLetterEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// POST /api/v1/experience-letters/[id]/send - Send official experience letter PDF via Gmail SMTP
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    if (auth.role === 'EMPLOYEE') {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 403 });
    }

    const { id } = params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid experience letter ID.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId || 'org-default';

    const query: any = { _id: new ObjectId(id) };
    if (auth.role !== 'SUPER_ADMIN') {
      query.organizationId = orgId;
    }

    const letter = await db.collection('experience_letters').findOne(query);
    if (!letter) {
      return NextResponse.json({ success: false, message: 'Experience letter record not found.' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { pdfBase64, customSubject, customMessage } = body;

    // 1. Authoritatively fetch employee registered email from MongoDB employees collection
    let finalRecipientEmail = '';
    let empDoc: any = null;

    if (letter.employeeId) {
      empDoc = await db.collection('employees').findOne({
        employeeId: letter.employeeId,
        ...(auth.role !== 'SUPER_ADMIN' ? { organizationId: letter.organizationId || orgId } : {}),
      });
      if (empDoc && empDoc.email) {
        finalRecipientEmail = String(empDoc.email).trim();
      }
    }

    // Fallback to letter.employeeEmail if not recorded on employee profile
    if (!finalRecipientEmail && letter.employeeEmail) {
      finalRecipientEmail = String(letter.employeeEmail).trim();
    }

    if (!finalRecipientEmail) {
      return NextResponse.json(
        {
          success: false,
          message: `No registered email address found for employee ${letter.employeeName || letter.employeeId}. Please ensure the employee profile has a valid email address.`,
        },
        { status: 400 }
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(finalRecipientEmail)) {
      return NextResponse.json(
        { success: false, message: `"${finalRecipientEmail}" is not a valid email address.` },
        { status: 400 }
      );
    }

    // 2. Resolve PDF Attachment Buffer
    let pdfBuffer: Buffer | undefined;
    const sanitizedEmpName = (letter.employeeName || 'Employee').replace(/[^a-zA-Z0-9_-]/g, '_');
    let pdfFileName = letter.fileName || `Experience_Cum_Relieving_Letter_${letter.employeeId || 'EMP'}_${sanitizedEmpName}.pdf`;
    if (!pdfFileName.toLowerCase().endsWith('.pdf')) {
      pdfFileName += '.pdf';
    }

    if (pdfBase64 && typeof pdfBase64 === 'string') {
      const commaIdx = pdfBase64.indexOf(',');
      const cleanBase64 = (commaIdx !== -1 ? pdfBase64.slice(commaIdx + 1) : pdfBase64).trim();
      pdfBuffer = Buffer.from(cleanBase64, 'base64');
    } else if (letter.fileId) {
      try {
        const bucket = await getGridFSBucket('documents');
        const fileObjectId = ObjectId.isValid(letter.fileId) ? new ObjectId(letter.fileId) : letter.fileId;
        const downloadStream = bucket.openDownloadStream(fileObjectId);
        const chunks: Buffer[] = [];
        for await (const chunk of downloadStream) {
          chunks.push(Buffer.from(chunk));
        }
        pdfBuffer = Buffer.concat(chunks);
      } catch (err) {
        console.error('[Experience Letter Send] GridFS download stream error:', err);
      }
    }

    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Letter PDF attachment is missing or empty. Please preview or issue the letter before emailing.',
        },
        { status: 400 }
      );
    }

    // Verify PDF header magic bytes
    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    if (!pdfHeader.startsWith('%PDF')) {
      return NextResponse.json(
        {
          success: false,
          message: 'PDF attachment file signature is corrupt or invalid.',
        },
        { status: 400 }
      );
    }

    const employeeDisplayName = letter.employeeName || (empDoc ? `${empDoc.firstName || ''} ${empDoc.lastName || ''}`.trim() : 'Employee');
    const emailSubject = customSubject || `Experience Cum Relieving Letter – ${employeeDisplayName}`;
    const emailMessage = customMessage || `Dear ${employeeDisplayName},\n\nPlease find attached your official Experience Cum Relieving Letter from Infinitive Cloud.\n\nWe thank you for your contributions and dedicated service during your tenure with us. We wish you immense success in all your future endeavors and a bright career ahead.\n\nBest regards,\nInfinitive Cloud HR Team`;

    // 3. Dispatch Email via Centralized Mailer Service
    const dispatchResult = await sendExperienceLetterEmail({
      to: finalRecipientEmail,
      employeeName: employeeDisplayName,
      designation: letter.designation,
      companyName: letter.companyName || 'Infinitive Cloud',
      pdfBuffer,
      pdfFileName,
      subject: emailSubject,
      customMessage: emailMessage,
    });

    if (!dispatchResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: dispatchResult.error || 'Failed to dispatch email via SMTP server.',
        },
        { status: 502 }
      );
    }

    const nowIso = new Date().toISOString();

    // 4. Update Experience Letter Record with Email Timestamp
    await db.collection('experience_letters').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          employeeEmail: finalRecipientEmail,
          emailSent: true,
          emailSentAt: nowIso,
          emailSentTo: finalRecipientEmail,
          emailMessageId: dispatchResult.messageId,
          updatedBy: auth.name || auth.userId,
          updatedAt: nowIso,
        },
      }
    );

    // 5. Audit Log Entry
    await logAuditEvent(req, 'EMAIL_EXPERIENCE_LETTER', {
      employeeId: letter.employeeId,
      organizationId: letter.organizationId || orgId,
      details: {
        letterId: id,
        referenceNumber: letter.referenceNumber,
        employeeName: letter.employeeName,
        recipientEmail: finalRecipientEmail,
        messageId: dispatchResult.messageId,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Experience letter sent successfully to ${finalRecipientEmail}`,
      emailSentAt: nowIso,
      emailSentTo: finalRecipientEmail,
      messageId: dispatchResult.messageId,
    });
  } catch (error: any) {
    console.error('Error sending experience letter email:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error while sending email.' },
      { status: 500 }
    );
  }
}

