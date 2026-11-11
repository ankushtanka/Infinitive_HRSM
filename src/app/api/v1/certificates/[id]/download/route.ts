import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, getGridFSBucket } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// GET /api/v1/certificates/[id]/download - Stream stored internship certificate PDF from GridFS
export async function GET(
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
    const orgId = auth.organizationId;

    let query: any = { _id: new ObjectId(id) };
    if (auth.role !== 'SUPER_ADMIN' && orgId) {
      query.organizationId = orgId;
    }

    const cert = await db.collection('internship_certificates').findOne(query);
    if (!cert) {
      return NextResponse.json({ success: false, message: 'Certificate record not found.' }, { status: 404 });
    }

    if (!cert.fileId) {
      return NextResponse.json({ success: false, message: 'Certificate PDF has not been generated yet.' }, { status: 404 });
    }

    const bucket = await getGridFSBucket('documents');
    const fileId = new ObjectId(cert.fileId);

    const downloadStream = bucket.openDownloadStream(fileId);
    const chunks: Buffer[] = [];

    for await (const chunk of downloadStream) {
      chunks.push(Buffer.from(chunk));
    }

    const pdfBuffer = Buffer.concat(chunks);
    const fileName = cert.fileName || `Internship_Certificate_${cert.referenceNumber.replace(/[\/\\]/g, '_')}.pdf`;

    await logAuditEvent(req, 'CERTIFICATE_DOWNLOADED', {
      details: { referenceNumber: cert.referenceNumber, certId: id, internName: cert.internName },
    });

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (error: any) {
    console.error('Error downloading certificate PDF:', error);
    return NextResponse.json({ success: false, message: 'Failed to download certificate PDF.' }, { status: 500 });
  }
}
