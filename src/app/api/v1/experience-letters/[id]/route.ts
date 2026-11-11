import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, getGridFSBucket } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// GET /api/v1/experience-letters/[id] - Fetch single experience letter
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
    const query: any = { _id: new ObjectId(id) };

    if (auth.role !== 'SUPER_ADMIN') {
      query.organizationId = auth.organizationId || 'org-default';
    }

    // Role check: Employee can only view their own
    if (auth.role === 'EMPLOYEE') {
      const empId = auth.employeeId || auth.userId;
      query.employeeId = empId;
      query.status = 'ISSUED';
    }

    const doc = await db.collection('experience_letters').findOne(query);
    if (!doc) {
      return NextResponse.json(
        { success: false, message: 'Experience letter not found or unauthorized access.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...doc,
        id: doc._id.toString(),
        _id: doc._id.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error fetching experience letter:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch experience letter.' },
      { status: 500 }
    );
  }
}

// PUT /api/v1/experience-letters/[id] - Update experience letter details
export async function PUT(
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
    const query: any = { _id: new ObjectId(id) };
    if (auth.role !== 'SUPER_ADMIN') {
      query.organizationId = auth.organizationId || 'org-default';
    }

    const existing = await db.collection('experience_letters').findOne(query);
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Experience letter record not found.' }, { status: 404 });
    }

    const body = await req.json();
    const allowedFields = [
      'employeeName',
      'employeeEmail',
      'salutation',
      'pronouns',
      'guardianName',
      'guardianRelation',
      'letterTitle',
      'department',
      'designation',
      'joiningDate',
      'relievingDate',
      'issueDate',
      'conductRemark',
      'reasonForLeaving',
      'signatoryName',
      'signatoryDesignation',
      'companyName',
      'registeredOffice',
      'officeAddress',
      'phone',
      'email',
      'cin',
      'website',
      'status',
    ];

    const updateSet: any = {
      updatedAt: new Date().toISOString(),
      updatedBy: auth.userId,
    };

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updateSet[key] = body[key];
      }
    }

    await db.collection('experience_letters').updateOne({ _id: new ObjectId(id) }, { $set: updateSet });

    const updatedDoc = await db.collection('experience_letters').findOne({ _id: new ObjectId(id) });

    await logAuditEvent(req, 'UPDATE_EXPERIENCE_LETTER', {
      details: {
        letterId: id,
        referenceNumber: existing.referenceNumber,
        employeeId: existing.employeeId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Experience letter updated successfully.',
      data: {
        ...updatedDoc,
        id: updatedDoc!._id.toString(),
        _id: updatedDoc!._id.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error updating experience letter:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update experience letter.' },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/experience-letters/[id] - Delete or revoke experience letter
export async function DELETE(
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
    const query: any = { _id: new ObjectId(id) };
    if (auth.role !== 'SUPER_ADMIN') {
      query.organizationId = auth.organizationId || 'org-default';
    }

    const letter = await db.collection('experience_letters').findOne(query);
    if (!letter) {
      return NextResponse.json({ success: false, message: 'Experience letter not found.' }, { status: 404 });
    }

    // If letter has a stored GridFS file, clean it up
    if (letter.fileId && ObjectId.isValid(letter.fileId)) {
      try {
        const bucket = await getGridFSBucket('documents');
        await bucket.delete(new ObjectId(letter.fileId));
      } catch (e) {
        console.warn('GridFS delete warning:', e);
      }
    }

    // Remove from documents collection
    await db.collection('documents').deleteMany({
      organizationId: letter.organizationId,
      referenceNumber: letter.referenceNumber,
    });

    // Delete record from experience_letters
    await db.collection('experience_letters').deleteOne({ _id: new ObjectId(id) });

    await logAuditEvent(req, 'DELETE_EXPERIENCE_LETTER', {
      details: {
        letterId: id,
        referenceNumber: letter.referenceNumber,
        employeeId: letter.employeeId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Experience letter record removed successfully.',
    });
  } catch (error: any) {
    console.error('Error deleting experience letter:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete experience letter.' },
      { status: 500 }
    );
  }
}

