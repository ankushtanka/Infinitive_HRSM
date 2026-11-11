import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, getGridFSBucket } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// GET /api/v1/experience-letters/[id]/download - Stream stored experience letter PDF from GridFS
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
      return NextResponse.json({ success: false, message: 'Experience letter not found.' }, { status: 404 });
    }

    // Role-based Access Enforcement
    if (auth.role === 'EMPLOYEE') {
      const currentEmpId = auth.employeeId || auth.userId;
      if (letter.employeeId !== currentEmpId || letter.status !== 'ISSUED') {
        return NextResponse.json(
          { success: false, message: 'Forbidden: You can only download your own officially issued experience letter.' },
          { status: 403 }
        );
      }
    } else if (auth.role === 'MANAGER') {
      const managerEmpId = auth.employeeId || auth.userId;
      const isSelf = letter.employeeId === managerEmpId;
      if (!isSelf) {
        const isTeamMember = await db.collection('employees').findOne({
          employeeId: letter.employeeId,
          organizationId: orgId,
          $or: [{ managerId: managerEmpId }, { reportingTo: managerEmpId }],
        });
        if (!isTeamMember) {
          return NextResponse.json(
            { success: false, message: 'Forbidden: You can only download experience letters for your direct reports.' },
            { status: 403 }
          );
        }
      }
    }

    if (!letter.fileId) {
      return NextResponse.json(
        { success: false, message: 'Official PDF document has not been generated and issued yet.' },
        { status: 404 }
      );
    }

    const bucket = await getGridFSBucket('documents');
    const fileId = new ObjectId(letter.fileId);

    const downloadStream = bucket.openDownloadStream(fileId);
    const chunks: Buffer[] = [];

    for await (const chunk of downloadStream) {
      chunks.push(Buffer.from(chunk));
    }

    const pdfBuffer = Buffer.concat(chunks);
    const cleanRef = (letter.referenceNumber || 'EXP').replace(/[\/\\]/g, '_');
    const cleanName = (letter.employeeName || 'Employee').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName =
      letter.fileName || `Experience_Cum_Relieving_Letter_${letter.employeeId || 'EMP'}_${cleanName}_${cleanRef}.pdf`;

    await logAuditEvent(req, 'EXPERIENCE_LETTER_DOWNLOADED', {
      details: {
        letterId: id,
        referenceNumber: letter.referenceNumber,
        employeeId: letter.employeeId,
        downloadedBy: auth.userId,
        role: auth.role,
      },
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
    console.error('Error downloading experience letter PDF:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to download experience letter PDF.' },
      { status: 500 }
    );
  }
}

