import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, getGridFSBucket } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

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

    if (!offer.fileId) {
      return NextResponse.json({ success: false, message: 'Offer letter PDF has not been generated yet.' }, { status: 404 });
    }

    const bucket = await getGridFSBucket('documents');
    const fileId = new ObjectId(offer.fileId);

    const downloadStream = bucket.openDownloadStream(fileId);
    const chunks: Buffer[] = [];

    for await (const chunk of downloadStream) {
      chunks.push(Buffer.from(chunk));
    }

    const pdfBuffer = Buffer.concat(chunks);
    const fileName = offer.fileName || `Offer_Letter_${offer.referenceNumber.replace(/[\/\\]/g, '_')}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (error: any) {
    console.error('Error downloading offer letter PDF:', error);
    return NextResponse.json({ success: false, message: 'Failed to download offer letter PDF.' }, { status: 500 });
  }
}
