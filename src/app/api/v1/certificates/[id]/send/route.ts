import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, getGridFSBucket } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { sendCertificateEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

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
      return NextResponse.json({ success: false, message: 'Invalid certificate ID.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    let query: any = { _id: new ObjectId(id) };
    if (auth.role !== 'SUPER_ADMIN' && orgId) {
      query.organizationId = orgId;
    }

    const cert = await db.collection('internship_certificates').findOne(query);
    if (!cert) {
      return NextResponse.json({ success: false, message: 'Certificate record not found.' }, { status: 404 });
    }

    const body = await req.json();
    const { recipientEmail: payloadEmail, customSubject, customMessage, pdfBase64 } = body;

    const recipientEmail = (payloadEmail || cert.internEmail || cert.email)?.trim();
    if (!recipientEmail) {
      return NextResponse.json(
        { success: false, message: 'Recipient email address is required to send certificate via Gmail.' },
        { status: 400 }
      );
    }

    let pdfBuffer: Buffer | undefined;
    let pdfFileName = cert.fileName || `Internship_Certificate_${(cert.internName || 'Intern').replace(/\s+/g, '_')}.pdf`;
    if (!pdfFileName.toLowerCase().endsWith('.pdf')) {
      pdfFileName += '.pdf';
    }

    if (pdfBase64 && typeof pdfBase64 === 'string') {
      const commaIdx = pdfBase64.indexOf(',');
      const cleanBase64 = (commaIdx !== -1 ? pdfBase64.slice(commaIdx + 1) : pdfBase64).trim();
      pdfBuffer = Buffer.from(cleanBase64, 'base64');
    } else if (cert.fileId) {
      try {
        const bucket = await getGridFSBucket('documents');
        const fileObjectId = ObjectId.isValid(cert.fileId) ? new ObjectId(cert.fileId) : cert.fileId;
        const downloadStream = bucket.openDownloadStream(fileObjectId);
        const chunks: Buffer[] = [];
        for await (const chunk of downloadStream) {
          chunks.push(Buffer.from(chunk));
        }
        pdfBuffer = Buffer.concat(chunks);
      } catch (err) {
        console.error('GridFS download stream failed for certificate fileId:', cert.fileId, err);
      }
    }

    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Certificate PDF attachment is missing or empty. Please render/generate the certificate PDF before sending.',
        },
        { status: 400 }
      );
    }

    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    if (!pdfHeader.startsWith('%PDF')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Certificate PDF file signature is corrupt or invalid.',
        },
        { status: 400 }
      );
    }

    const dispatchResult = await sendCertificateEmail({
      to: recipientEmail,
      internName: cert.internName || 'Intern',
      internshipRole: cert.internshipRole || 'Internship',
      companyName: cert.companyName || 'Infinitive Cloud',
      pdfBuffer,
      pdfFileName,
      subject: customSubject,
      customMessage,
    });

    const now = new Date();

    if (!dispatchResult.success) {
      await logAuditEvent(req, 'CERTIFICATE_SEND_FAILED', {
        details: { referenceNumber: cert.referenceNumber, recipientEmail, error: dispatchResult.error },
      });

      return NextResponse.json(
        {
          success: false,
          message: `Email failed to send: ${dispatchResult.error || 'Gmail SMTP delivery failure'}`,
        },
        { status: 500 }
      );
    }

    await db.collection('internship_certificates').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          sentAt: now.toISOString(),
          sentTo: recipientEmail,
          updatedBy: auth.name || auth.userId,
          updatedAt: now.toISOString(),
        },
      }
    );

    await logAuditEvent(req, 'CERTIFICATE_SENT', {
      details: { referenceNumber: cert.referenceNumber, recipientEmail, messageId: dispatchResult.messageId },
    });

    return NextResponse.json({
      success: true,
      message: `Internship Completion Certificate successfully sent to ${recipientEmail}.`,
      messageId: dispatchResult.messageId,
    });
  } catch (error: any) {
    console.error('Error sending certificate email:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to send certificate email.' }, { status: 500 });
  }
}
