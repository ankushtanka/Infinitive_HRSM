import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, uploadFileToGridFS } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
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
    const { pdfBase64, fileName: customFileName } = body;

    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      return NextResponse.json({ success: false, message: 'PDF document payload is required.' }, { status: 400 });
    }

    // Clean base64 string robustly by stripping any Data URI prefix
    const commaIdx = pdfBase64.indexOf(',');
    const cleanBase64 = (commaIdx !== -1 ? pdfBase64.slice(commaIdx + 1) : pdfBase64).trim();
    const pdfBuffer = Buffer.from(cleanBase64, 'base64');

    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      return NextResponse.json({ success: false, message: 'Invalid or corrupt PDF buffer.' }, { status: 400 });
    }

    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    if (!pdfHeader.startsWith('%PDF')) {
      console.error('[Generate Route] Generated PDF signature check failed:', pdfHeader);
      return NextResponse.json(
        { success: false, message: 'Generated PDF is invalid before GridFS storage. File signature does not start with %PDF.' },
        { status: 400 }
      );
    }

    const sanitizedCandidateName = (offer.candidate?.candidateName || 'Candidate').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = customFileName || `${sanitizedCandidateName}_Offer_Letter.pdf`;

    console.log('[Generate Route] Diagnostic PDF verification before GridFS storage:', {
      filename: fileName,
      contentType: 'application/pdf',
      bufferSize: pdfBuffer.length,
      signatureValid: true,
    });

    // Store in GridFS
    const fileId = await uploadFileToGridFS(fileName, 'application/pdf', pdfBuffer);

    const now = new Date();
    const newHistoryItem = {
      version: offer.version || 1,
      action: 'OFFER_GENERATED',
      fileId,
      performedBy: auth.name || auth.userId,
      timestamp: now.toISOString(),
    };

    await db.collection('offer_letters').updateOne(
      { _id: new ObjectId(id), organizationId: orgId },
      {
        $set: {
          fileId,
          fileName,
          status: 'GENERATED',
          updatedBy: auth.name || auth.userId,
          updatedAt: now.toISOString(),
        },
        $push: { history: newHistoryItem } as any,
      }
    );

    // Also register in general documents collection for document management audit
    await db.collection('documents').insertOne({
      organizationId: orgId,
      employeeId: offer.candidate?.employeeId || offer.candidateId,
      candidateId: offer.candidateId,
      title: `Offer Letter — ${offer.position}`,
      category: 'Offer Letter',
      fileName,
      fileId,
      fileSize: pdfBuffer.length,
      mimeType: 'application/pdf',
      uploadedBy: auth.userId,
      uploadedByName: auth.name,
      referenceNumber: offer.referenceNumber,
      uploadedAt: now.toISOString(),
    });

    await logAuditEvent(req, 'OFFER_GENERATED', {
      details: { referenceNumber: offer.referenceNumber, fileId, fileName },
    });

    return NextResponse.json({
      success: true,
      message: 'Offer letter PDF generated and stored in secure GridFS storage successfully.',
      fileId,
      fileName,
    });
  } catch (error: any) {
    console.error('Error generating offer letter PDF:', error);
    return NextResponse.json({ success: false, message: 'Failed to store generated offer letter PDF.' }, { status: 500 });
  }
}
