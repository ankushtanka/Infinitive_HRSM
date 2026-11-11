import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, uploadFileToGridFS } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// POST /api/v1/certificates/[id]/generate - Upload generated PDF base64 to GridFS & update certificate status
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

    const { id } = params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: 'Invalid certificate ID.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId || 'org-default';

    let query: any = { _id: new ObjectId(id) };
    if (auth.role !== 'SUPER_ADMIN' && orgId) {
      query.organizationId = orgId;
    }

    const cert = await db.collection('internship_certificates').findOne(query);
    if (!cert) {
      return NextResponse.json({ success: false, message: 'Certificate record not found.' }, { status: 404 });
    }

    const body = await req.json();
    const { pdfBase64, fileName: customFileName } = body;

    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      return NextResponse.json({ success: false, message: 'PDF document payload is required.' }, { status: 400 });
    }

    // Strip Data URI prefix if present
    const commaIdx = pdfBase64.indexOf(',');
    const cleanBase64 = (commaIdx !== -1 ? pdfBase64.slice(commaIdx + 1) : pdfBase64).trim();
    const pdfBuffer = Buffer.from(cleanBase64, 'base64');

    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      return NextResponse.json({ success: false, message: 'Invalid or empty PDF buffer.' }, { status: 400 });
    }

    // Validate PDF signature header
    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    if (!pdfHeader.startsWith('%PDF')) {
      console.error('[Certificate Generate] PDF signature check failed:', pdfHeader);
      return NextResponse.json(
        { success: false, message: 'Generated file is invalid before GridFS storage. File signature does not start with %PDF.' },
        { status: 400 }
      );
    }

    const sanitizedInternName = (cert.internName || 'Intern').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = customFileName || `Internship_Certificate_${sanitizedInternName}.pdf`;

    // Upload PDF binary to MongoDB GridFS
    const fileId = await uploadFileToGridFS(fileName, 'application/pdf', pdfBuffer);

    const now = new Date();

    // Update certificate metadata
    await db.collection('internship_certificates').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          fileId,
          fileName,
          status: 'ISSUED',
          updatedBy: auth.name || auth.userId,
          updatedAt: now.toISOString(),
        },
      }
    );

    // Register in general documents collection for document audit
    await db.collection('documents').insertOne({
      organizationId: cert.organizationId || orgId,
      employeeId: cert.internName,
      title: `Internship Certificate — ${cert.internName}`,
      category: 'Internship Certificate',
      fileName,
      fileId,
      fileSize: pdfBuffer.length,
      mimeType: 'application/pdf',
      uploadedBy: auth.userId,
      uploadedByName: auth.name || auth.userId,
      referenceNumber: cert.referenceNumber,
      uploadedAt: now.toISOString(),
    });

    await logAuditEvent(req, 'CERTIFICATE_GENERATED', {
      details: { referenceNumber: cert.referenceNumber, fileId, fileName, internName: cert.internName },
    });

    return NextResponse.json({
      success: true,
      message: 'Internship certificate PDF generated and stored in secure GridFS storage successfully.',
      fileId,
      fileName,
    });
  } catch (error: any) {
    console.error('Error generating certificate PDF:', error);
    return NextResponse.json({ success: false, message: 'Failed to store generated certificate PDF.' }, { status: 500 });
  }
}
