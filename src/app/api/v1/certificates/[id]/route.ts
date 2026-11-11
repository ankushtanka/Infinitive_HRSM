import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, deleteFileFromGridFS } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// GET /api/v1/certificates/[id] - Fetch single certificate metadata
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

    return NextResponse.json({
      success: true,
      data: {
        ...cert,
        id: cert._id.toString(),
        _id: cert._id.toString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch certificate.' }, { status: 500 });
  }
}

// PUT /api/v1/certificates/[id] - Update internship certificate content
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
      return NextResponse.json({ success: false, message: 'Invalid certificate ID.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    let query: any = { _id: new ObjectId(id) };
    if (auth.role !== 'SUPER_ADMIN' && orgId) {
      query.organizationId = orgId;
    }

    const existing = await db.collection('internship_certificates').findOne(query);
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Certificate record not found.' }, { status: 404 });
    }

    const body = await req.json();
    const {
      internName,
      salutation,
      degreeCourse,
      collegeName,
      internshipRole,
      internEmail,
      startDate,
      completionDate,
      issueDate,
      companyName,
      registeredOffice,
      officeAddress,
      phone,
      email,
      cin,
      signatoryName,
      signatoryDesignation,
    } = body;

    // Date validations
    if (startDate && completionDate) {
      const start = new Date(startDate);
      const end = new Date(completionDate);
      if (end < start) {
        return NextResponse.json({ success: false, message: 'Completion date cannot be earlier than internship start date.' }, { status: 400 });
      }
    }

    const now = new Date();
    const updateDoc: Record<string, any> = {
      updatedAt: now.toISOString(),
      updatedBy: auth.name || auth.userId,
    };

    if (internName !== undefined) updateDoc.internName = internName.trim();
    if (salutation !== undefined) updateDoc.salutation = salutation.trim();
    if (degreeCourse !== undefined) updateDoc.degreeCourse = degreeCourse.trim();
    if (collegeName !== undefined) updateDoc.collegeName = collegeName.trim();
    if (internshipRole !== undefined) updateDoc.internshipRole = internshipRole.trim();
    if (internEmail !== undefined) updateDoc.internEmail = internEmail.trim();
    if (startDate !== undefined) updateDoc.startDate = startDate.trim();
    if (completionDate !== undefined) updateDoc.completionDate = completionDate.trim();
    if (issueDate !== undefined) updateDoc.issueDate = issueDate.trim();
    if (companyName !== undefined) updateDoc.companyName = companyName.trim();
    if (registeredOffice !== undefined) updateDoc.registeredOffice = registeredOffice.trim();
    if (officeAddress !== undefined) updateDoc.officeAddress = officeAddress.trim();
    if (phone !== undefined) updateDoc.phone = phone.trim();
    if (email !== undefined) updateDoc.email = email.trim();
    if (cin !== undefined) updateDoc.cin = cin.trim();
    if (signatoryName !== undefined) updateDoc.signatoryName = signatoryName.trim();
    if (signatoryDesignation !== undefined) updateDoc.signatoryDesignation = signatoryDesignation.trim();

    await db.collection('internship_certificates').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc }
    );

    const updatedCert = await db.collection('internship_certificates').findOne({ _id: new ObjectId(id) });

    await logAuditEvent(req, 'CERTIFICATE_UPDATED', {
      details: { referenceNumber: existing.referenceNumber, certId: id, internName: updatedCert?.internName },
    });

    return NextResponse.json({
      success: true,
      message: 'Certificate content updated successfully.',
      data: {
        ...updatedCert,
        id: updatedCert?._id.toString(),
        _id: updatedCert?._id.toString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Failed to update certificate.' }, { status: 500 });
  }
}

// DELETE /api/v1/certificates/[id] - Permanently delete certificate record & stored PDF
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

    // Clean up GridFS file if stored
    if (cert.fileId) {
      try {
        await deleteFileFromGridFS(cert.fileId);
      } catch (gridFsErr) {
        console.warn('Could not delete GridFS file binary during certificate deletion:', gridFsErr);
      }
    }

    // Delete document entry if registered
    if (cert.referenceNumber) {
      await db.collection('documents').deleteMany({ referenceNumber: cert.referenceNumber });
    }

    await db.collection('internship_certificates').deleteOne({ _id: new ObjectId(id) });

    await logAuditEvent(req, 'CERTIFICATE_DELETED', {
      details: { referenceNumber: cert.referenceNumber, certId: id, internName: cert.internName },
    });

    return NextResponse.json({
      success: true,
      message: 'Certificate record deleted successfully.',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Failed to delete certificate.' }, { status: 500 });
  }
}
