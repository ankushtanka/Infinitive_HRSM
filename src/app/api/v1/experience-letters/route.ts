import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { generateExperienceLetterReference } from '@/lib/experienceLetterId';
import { DEFAULT_EXPERIENCE_COMPANY } from '@/types/experienceLetter';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// GET /api/v1/experience-letters - Fetch list of experience letters with search, filter, and RBAC
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '15', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status')?.trim() || 'All';
    const employeeIdParam = searchParams.get('employeeId')?.trim() || '';

    const orgId = auth.organizationId || 'org-default';
    const query: any = {};

    // Multi-tenant organization isolation
    if (auth.role !== 'SUPER_ADMIN') {
      query.organizationId = orgId;
    }

    // Role-based Access Control
    if (auth.role === 'EMPLOYEE') {
      const empId = auth.employeeId || auth.userId;
      query.employeeId = empId;
      query.status = 'ISSUED'; // Employees can only see officially issued letters
    } else if (auth.role === 'MANAGER') {
      // Managers can see letters for their team or their own
      const managerEmpId = auth.employeeId || auth.userId;
      const teamEmployees = await db
        .collection('employees')
        .find({
          organizationId: orgId,
          $or: [{ managerId: managerEmpId }, { reportingTo: managerEmpId }, { employeeId: managerEmpId }],
        }, { projection: { employeeId: 1 } })
        .toArray();
      const teamEmpIds = teamEmployees.map((e: any) => e.employeeId);
      query.employeeId = { $in: teamEmpIds };
    }

    if (employeeIdParam) {
      query.employeeId = employeeIdParam;
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { employeeName: regex },
        { employeeId: regex },
        { referenceNumber: regex },
        { designation: regex },
        { department: regex },
      ];
    }

    // Counts for KPIs
    const baseOrgFilter = auth.role === 'SUPER_ADMIN' ? {} : { organizationId: orgId };
    const [totalCount, totalIssued, totalDraft, totalRevoked] = await Promise.all([
      db.collection('experience_letters').countDocuments(query),
      db.collection('experience_letters').countDocuments({ ...baseOrgFilter, status: 'ISSUED' }),
      db.collection('experience_letters').countDocuments({ ...baseOrgFilter, status: 'DRAFT' }),
      db.collection('experience_letters').countDocuments({ ...baseOrgFilter, status: 'REVOKED' }),
    ]);

    const skip = (page - 1) * limit;
    const records = await db
      .collection('experience_letters')
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const mapped = records.map((doc: any) => ({
      ...doc,
      id: doc._id.toString(),
      _id: doc._id.toString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        letters: mapped,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit) || 1,
        },
        kpis: {
          total: totalIssued + totalDraft + totalRevoked,
          issued: totalIssued,
          draft: totalDraft,
          revoked: totalRevoked,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching experience letters:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load experience letters.' },
      { status: 500 }
    );
  }
}

// POST /api/v1/experience-letters - Create a new experience letter record
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json();
    const {
      employeeId,
      employeeName,
      employeeEmail,
      salutation,
      pronouns,
      guardianName,
      guardianRelation,
      letterTitle = 'EXPERIENCE CUM RELIEVING LETTER',
      department,
      designation,
      joiningDate,
      relievingDate,
      issueDate,
      conductRemark,
      reasonForLeaving,
      signatoryName = 'Ankush Ranka',
      signatoryDesignation = 'Founder & CEO',
      referenceNumber: customRef,
      status = 'DRAFT',
    } = body;

    if (!employeeId || !employeeId.trim()) {
      return NextResponse.json({ success: false, message: 'Employee ID is required.' }, { status: 400 });
    }
    if (!joiningDate) {
      return NextResponse.json({ success: false, message: 'Joining date is required.' }, { status: 400 });
    }
    if (!relievingDate) {
      return NextResponse.json({ success: false, message: 'Relieving / last working date is required.' }, { status: 400 });
    }
    if (new Date(joiningDate) > new Date(relievingDate)) {
      return NextResponse.json(
        { success: false, message: 'Joining date cannot be after relieving date.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId || 'org-default';

    // Verify employee against database
    const empDoc = await db.collection('employees').findOne({
      employeeId: employeeId.trim(),
      ...(auth.role !== 'SUPER_ADMIN' ? { organizationId: orgId } : {}),
    });

    if (!empDoc) {
      return NextResponse.json(
        { success: false, message: `Employee with ID "${employeeId}" not found in database.` },
        { status: 404 }
      );
    }

    const resolvedName = employeeName?.trim() || `${empDoc.firstName || ''} ${empDoc.lastName || ''}`.trim();
    const resolvedDept = department?.trim() || empDoc.department || 'General';
    const resolvedDesig = designation?.trim() || empDoc.designation || 'Staff Member';

    // Fetch org company details
    const orgSettingsDoc: any = await db.collection('organization_settings').findOne({
      $or: [{ organizationId: orgId }, { organizationId: 'org-default' }],
    });
    const orgInfo = orgSettingsDoc?.organization || {};

    // Generate authoritative reference number if not supplied
    let referenceNumber = customRef?.trim();
    if (!referenceNumber) {
      referenceNumber = await generateExperienceLetterReference(db, orgId);
    }

    const genderLower = (empDoc.gender || '').toLowerCase();
    const verifiedSalutation =
      salutation !== undefined && salutation !== null
        ? salutation
        : genderLower === 'female'
        ? 'Ms.'
        : genderLower === 'male'
        ? 'Mr.'
        : 'None';

    const verifiedPronouns =
      pronouns ||
      (genderLower === 'female' ? 'she/her' : genderLower === 'male' ? 'he/him' : 'neutral');

    const now = new Date().toISOString();
    const newDoc: any = {
      referenceNumber,
      organizationId: orgId,
      employeeId: employeeId.trim(),
      employeeName: resolvedName,
      employeeEmail: employeeEmail?.trim() || empDoc.email || undefined,
      salutation: verifiedSalutation,
      pronouns: verifiedPronouns,
      guardianName: guardianName?.trim() || undefined,
      guardianRelation: guardianRelation || undefined,
      letterTitle: letterTitle?.trim() || 'EXPERIENCE CUM RELIEVING LETTER',
      department: resolvedDept,
      designation: resolvedDesig,
      joiningDate: joiningDate.split('T')[0],
      relievingDate: relievingDate.split('T')[0],
      issueDate: (issueDate || now).split('T')[0],
      conductRemark: conductRemark?.trim() || 'We found her/him to be dedicated, sincere, and hardworking. Conduct and character were exemplary throughout employment.',
      reasonForLeaving: reasonForLeaving?.trim() || undefined,
      signatoryName: signatoryName?.trim() || 'Ankush Ranka',
      signatoryDesignation: signatoryDesignation?.trim() || 'Founder & CEO',
      companyName: DEFAULT_EXPERIENCE_COMPANY.companyName,
      registeredOffice: DEFAULT_EXPERIENCE_COMPANY.registeredOffice,
      officeAddress: DEFAULT_EXPERIENCE_COMPANY.officeAddress,
      phone: DEFAULT_EXPERIENCE_COMPANY.phone,
      email: DEFAULT_EXPERIENCE_COMPANY.email,
      cin: DEFAULT_EXPERIENCE_COMPANY.cin,
      website: DEFAULT_EXPERIENCE_COMPANY.website,
      status: status === 'ISSUED' ? 'ISSUED' : 'DRAFT',
      createdBy: auth.userId,
      createdByName: auth.name || auth.userId,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('experience_letters').insertOne(newDoc);
    const createdId = result.insertedId.toString();

    await logAuditEvent(req, 'CREATE_EXPERIENCE_LETTER', {
      details: {
        letterId: createdId,
        referenceNumber,
        employeeId: newDoc.employeeId,
        employeeName: newDoc.employeeName,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Experience letter record created successfully.',
      data: {
        ...newDoc,
        id: createdId,
        _id: createdId,
      },
    });
  } catch (error: any) {
    console.error('Error creating experience letter:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create experience letter.' },
      { status: 500 }
    );
  }
}

