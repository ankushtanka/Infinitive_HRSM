import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, uploadFileToGridFS } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// POST /api/v1/experience-letters/[id]/generate - Upload generated PDF base64 to GridFS & mark as ISSUED
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

    // Validate PDF magic bytes signature (%PDF)
    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    if (!pdfHeader.startsWith('%PDF')) {
      console.error('[Experience Letter Generate] PDF signature check failed:', pdfHeader);
      return NextResponse.json(
        {
          success: false,
          message: 'Generated file is invalid before GridFS storage. File signature does not start with %PDF.',
        },
        { status: 400 }
      );
    }

    const sanitizedEmpName = (letter.employeeName || 'Employee').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName =
      customFileName || `Experience_Letter_${letter.employeeId || 'EMP'}_${sanitizedEmpName}.pdf`;

    // Upload PDF binary to MongoDB GridFS in documents bucket
    const fileId = await uploadFileToGridFS(fileName, 'application/pdf', pdfBuffer);

    const now = new Date();
    const nowIso = now.toISOString();

    // Update experience letter metadata
    await db.collection('experience_letters').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          fileId,
          fileName,
          fileSize: pdfBuffer.length,
          status: 'ISSUED',
          issuedAt: nowIso,
          updatedBy: auth.name || auth.userId,
          updatedAt: nowIso,
        },
      }
    );

    // Register in documents collection for document audit & employee access
    await db.collection('documents').insertOne({
      organizationId: letter.organizationId || orgId,
      employeeId: letter.employeeId,
      employeeName: letter.employeeName,
      title: letter.letterTitle ? `${letter.letterTitle} — ${letter.employeeName}` : `Experience Cum Relieving Letter — ${letter.employeeName}`,
      category: 'Experience Letter',
      fileName,
      fileId,
      gridFsFileId: fileId,
      fileSize: `${(pdfBuffer.length / 1024).toFixed(1)} KB`,
      fileSizeBytes: pdfBuffer.length,
      mimeType: 'application/pdf',
      accessRole: 'Employee', // Allows employee to view and download
      uploadedBy: auth.userId,
      uploadedByName: auth.name || auth.userId,
      referenceNumber: letter.referenceNumber,
      uploadedAt: nowIso,
      createdAt: nowIso,
    });

    // Notify employee in-app
    const empUser = await db.collection('users').findOne({
      $or: [{ employeeId: letter.employeeId }, { email: letter.email }],
    });
    if (empUser) {
      await db.collection('notifications').insertOne({
        organizationId: letter.organizationId || orgId,
        recipientId: empUser.userId || empUser.employeeId || empUser._id.toString(),
        title: 'Experience Cum Relieving Letter Issued',
        message: `Your official Experience Cum Relieving Letter (${letter.referenceNumber}) has been issued and is available in your Documents.`,
        category: 'Documents',
        status: 'UNREAD',
        createdAt: nowIso,
      });
    }

    await logAuditEvent(req, 'ISSUE_EXPERIENCE_LETTER', {
      details: {
        letterId: id,
        referenceNumber: letter.referenceNumber,
        employeeId: letter.employeeId,
        fileId,
        fileName,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Experience Letter generated, officially issued, and stored successfully.',
      data: {
        fileId,
        fileName,
        fileSize: pdfBuffer.length,
        status: 'ISSUED',
        issuedAt: nowIso,
      },
    });
  } catch (error: any) {
    console.error('Error generating and storing experience letter PDF:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to generate and store experience letter.' },
      { status: 500 }
    );
  }
}

