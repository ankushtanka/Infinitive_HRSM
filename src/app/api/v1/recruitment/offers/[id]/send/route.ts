import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, getGridFSBucket } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { sendOfferLetterEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';
import { formatCandidateFullName } from '@/types/offerLetter';

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
      return NextResponse.json({ success: false, message: 'Invalid offer letter ID.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    const offer = await db.collection('offer_letters').findOne({
      _id: new ObjectId(id),
      organizationId: orgId,
    });

    if (!offer) {
      return NextResponse.json({ success: false, message: 'Offer letter not found.' }, { status: 404 });
    }

    const body = await req.json();
    const { customSubject, customMessage, pdfBase64 } = body;

    const recipientEmail = offer.candidate?.email;
    if (!recipientEmail) {
      return NextResponse.json({ success: false, message: 'Candidate email address is missing.' }, { status: 400 });
    }

    let pdfBuffer: Buffer | undefined;
    let pdfFileName = offer.fileName || `${(offer.candidate?.candidateName || 'Candidate').replace(/\s+/g, '_')}_Offer_Letter.pdf`;
    if (!pdfFileName.toLowerCase().endsWith('.pdf')) {
      pdfFileName += '.pdf';
    }

    if (pdfBase64 && typeof pdfBase64 === 'string') {
      const commaIdx = pdfBase64.indexOf(',');
      const cleanBase64 = (commaIdx !== -1 ? pdfBase64.slice(commaIdx + 1) : pdfBase64).trim();
      pdfBuffer = Buffer.from(cleanBase64, 'base64');
    } else if (offer.fileId) {
      try {
        const bucket = await getGridFSBucket('documents');
        const fileObjectId = ObjectId.isValid(offer.fileId) ? new ObjectId(offer.fileId) : offer.fileId;
        const downloadStream = bucket.openDownloadStream(fileObjectId);
        const chunks: Buffer[] = [];
        for await (const chunk of downloadStream) {
          chunks.push(Buffer.from(chunk));
        }
        pdfBuffer = Buffer.concat(chunks);
      } catch (err) {
        console.error('GridFS download stream failed for fileId:', offer.fileId, err);
      }
    }

    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Offer letter PDF attachment is missing or empty. Please generate the PDF letter before sending.',
        },
        { status: 400 }
      );
    }

    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    if (!pdfHeader.startsWith('%PDF')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Offer letter PDF file signature is corrupt or invalid.',
        },
        { status: 400 }
      );
    }

    const maskedEmail = recipientEmail.replace(/(.{2})(.*)(?=@)/, '$1***');
    console.log('[Offer Send Route] Diagnostic PDF verification:', {
      recipient: maskedEmail,
      attachmentCount: 1,
      filename: pdfFileName,
      contentType: 'application/pdf',
      bufferSize: pdfBuffer.length,
      signatureValid: true,
    });

    const candidateFullNameWithTitle = formatCandidateFullName(
      offer.candidate?.candidateTitle || (offer as any).candidateTitle || offer.candidate?.salutation || (offer as any).salutation,
      offer.candidate?.candidateName || 'Candidate'
    );

    const dispatchResult = await sendOfferLetterEmail({
      to: recipientEmail,
      candidateName: candidateFullNameWithTitle,
      position: offer.position,
      companyName: offer.company?.companyName || 'Infinitive Cloud',
      pdfBuffer,
      pdfFileName,
      subject: customSubject,
      customMessage,
    });

    const now = new Date();

    if (!dispatchResult.success) {
      await logAuditEvent(req, 'OFFER_SEND_FAILED', {
        details: { referenceNumber: offer.referenceNumber, recipientEmail, error: dispatchResult.error },
      });

      return NextResponse.json(
        {
          success: false,
          message: `Email failed to send: ${dispatchResult.error || 'SMTP delivery failure'}`,
        },
        { status: 500 }
      );
    }

    const newHistoryItem = {
      version: offer.version || 1,
      action: 'OFFER_SENT',
      performedBy: auth.name || auth.userId,
      timestamp: now.toISOString(),
    };

    await db.collection('offer_letters').updateOne(
      { _id: new ObjectId(id), organizationId: orgId },
      {
        $set: {
          status: 'SENT',
          sentAt: now.toISOString(),
          updatedBy: auth.name || auth.userId,
          updatedAt: now.toISOString(),
        },
        $push: { history: newHistoryItem } as any,
      }
    );

    // Also update candidate application status if applicable
    if (offer.candidateId) {
      await db.collection('recruitment_applications').updateOne(
        { _id: ObjectId.isValid(offer.candidateId) ? new ObjectId(offer.candidateId) : offer.candidateId, organizationId: orgId },
        { $set: { status: 'Offer Sent', offerLetterId: id } }
      );
    }

    await logAuditEvent(req, 'OFFER_SENT', {
      details: { referenceNumber: offer.referenceNumber, recipientEmail, messageId: dispatchResult.messageId },
    });

    return NextResponse.json({
      success: true,
      message: `Offer letter successfully sent to ${recipientEmail}.`,
      messageId: dispatchResult.messageId,
    });
  } catch (error: any) {
    console.error('Error sending offer letter email:', error);
    return NextResponse.json({ success: false, message: 'Failed to send offer letter email.' }, { status: 500 });
  }
}
