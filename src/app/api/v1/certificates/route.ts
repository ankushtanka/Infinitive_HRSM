import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { generateCertificateReference } from '@/lib/certificateId';

export const dynamic = 'force-dynamic';

// GET /api/v1/certificates - Fetch internship certificates directory (HR/Admin/Super Admin only)
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '15', 10)));
    const search = searchParams.get('search')?.trim() || '';

    let query: any = {};
    if (auth.role !== 'SUPER_ADMIN' && orgId) {
      query.organizationId = orgId;
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { referenceNumber: regex },
        { internName: regex },
        { collegeName: regex },
        { internshipRole: regex },
      ];
    }

    const [total, certificates] = await Promise.all([
      db.collection('internship_certificates').countDocuments(query),
      db.collection('internship_certificates')
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ]);

    const formatted = certificates.map((doc) => ({
      ...doc,
      id: doc._id.toString(),
      _id: doc._id.toString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        certificates: formatted,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching certificates:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch internship certificates' },
      { status: 500 }
    );
  }
}

// POST /api/v1/certificates - Create a new internship certificate record
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
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

    // Server-side validations
    if (!internName || !internName.trim()) {
      return NextResponse.json({ success: false, message: 'Intern full name is required.' }, { status: 400 });
    }
    if (!collegeName || !collegeName.trim()) {
      return NextResponse.json({ success: false, message: 'College/Institute name is required.' }, { status: 400 });
    }
    if (!internshipRole || !internshipRole.trim()) {
      return NextResponse.json({ success: false, message: 'Internship role/domain is required.' }, { status: 400 });
    }
    if (!startDate || !completionDate || !issueDate) {
      return NextResponse.json({ success: false, message: 'Start date, completion date, and issue date are required.' }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(completionDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ success: false, message: 'Invalid start date or completion date format.' }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json({ success: false, message: 'Completion date cannot be earlier than internship start date.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId || 'org-default';

    // Duplicate check: Same intern name, college, role, and completion date
    const existingDuplicate = await db.collection('internship_certificates').findOne({
      organizationId: orgId,
      internName: internName.trim(),
      collegeName: collegeName.trim(),
      internshipRole: internshipRole.trim(),
      completionDate: completionDate.trim(),
    });

    if (existingDuplicate) {
      return NextResponse.json(
        {
          success: false,
          message: `An internship certificate already exists for "${internName.trim()}" (${internshipRole.trim()}) completed on ${completionDate}.`,
          certificateId: existingDuplicate._id.toString(),
        },
        { status: 409 }
      );
    }

    // Generate unique reference number server-side
    const referenceNumber = await generateCertificateReference(db, orgId);

    const now = new Date();
    const certDoc = {
      organizationId: orgId,
      referenceNumber,
      internName: internName.trim(),
      salutation: (salutation || 'Ms.').trim(),
      degreeCourse: (degreeCourse || 'B.Tech').trim(),
      collegeName: collegeName.trim(),
      internshipRole: internshipRole.trim(),
      internEmail: (internEmail || '').trim(),
      startDate: startDate.trim(),
      completionDate: completionDate.trim(),
      issueDate: issueDate.trim(),
      companyName: (companyName || 'INFINITIVE CLOUD').trim(),
      registeredOffice: (registeredOffice || 'Kankroli,Rajasthan,313324').trim(),
      officeAddress: (officeAddress || 'Udaipur Rajasthan,313001').trim(),
      phone: (phone || '+91 8690393087').trim(),
      email: (email || 'cloudinfinitive@gmail.com').trim(),
      cin: (cin || 'U62020RJ2025PTC109151').trim(),
      signatoryName: (signatoryName || 'Ankush Ranka').trim(),
      signatoryDesignation: (signatoryDesignation || 'Founder & CEO').trim(),
      status: 'DRAFT',
      createdBy: auth.userId,
      createdByName: auth.name || auth.userId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const insertResult = await db.collection('internship_certificates').insertOne(certDoc);
    const certId = insertResult.insertedId.toString();

    await logAuditEvent(req, 'CERTIFICATE_CREATED', {
      details: { referenceNumber, certId, internName: certDoc.internName, role: certDoc.internshipRole },
    });

    return NextResponse.json({
      success: true,
      message: 'Internship certificate record created successfully.',
      data: {
        ...certDoc,
        id: certId,
        _id: certId,
      },
    });
  } catch (error: any) {
    console.error('Error creating internship certificate:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create internship certificate record.' },
      { status: 500 }
    );
  }
}
