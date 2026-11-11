import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { generateOfferLetterReference } from '@/lib/offerLetterId';
import { VALID_CANDIDATE_TITLES } from '@/types/offerLetter';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status')?.trim();
    const offerType = searchParams.get('offerType')?.trim();
    const candidateId = searchParams.get('candidateId')?.trim();

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    const query: any = { organizationId: orgId };

    if (status && status !== 'All') query.status = status;
    if (offerType && offerType !== 'All') query.offerType = offerType;
    if (candidateId) query.candidateId = candidateId;

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { referenceNumber: regex },
        { 'candidate.candidateName': regex },
        { 'candidate.email': regex },
        { position: regex },
        { department: regex },
      ];
    }

    const totalCount = await db.collection('offer_letters').countDocuments(query);
    const rawOffers = await db
      .collection('offer_letters')
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    const offerLetters = rawOffers.map((o) => ({
      ...o,
      id: o._id.toString(),
    }));

    return NextResponse.json({
      success: true,
      data: offerLetters,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching offer letters:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch offer letters.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    if (auth.role === 'EMPLOYEE') {
      return NextResponse.json({ success: false, message: 'Employees are not authorized to create offer letters.' }, { status: 403 });
    }

    const body = await req.json();

    const candidateObj = body.candidate || {};
    const candidateName = (body.candidateName || candidateObj.candidateName || candidateObj.name || '').trim();
    const candidateEmail = (body.candidateEmail || candidateObj.email || candidateObj.candidateEmail || '').trim().toLowerCase();
    const candidatePhone = (body.candidatePhone || candidateObj.phone || '').trim();
    const candidateAddress = (body.candidateAddress || candidateObj.address || '').trim();
    const collegeName = (body.collegeName || candidateObj.collegeName || '').trim();
    const employeeId = (body.employeeId || candidateObj.employeeId || '').trim();

    const {
      candidateId,
      offerType = 'INTERNSHIP',
      position,
      department,
      location = 'Udaipur, Rajasthan',
      joiningDate,
      offerDate = new Date().toISOString().split('T')[0],
      expiryDate,
      durationMonths = 3,
      stipendType = 'NON_STIPENDIARY',
      salaryStipend = 0,
      probationPeriod = '3 Months',
      noticePeriod = '15 Days',
      workingHours = '9:30 AM - 6:30 PM (Mon-Sat)',
      reportingManager,
      requiredDocuments = [
        'Education Qualification Certificates',
        'e-Aadhar',
        'PAN Card',
        'Recent Professional Passport Size Photographs',
      ],
      additionalTerms,
      company,
    } = body;

    const trimmedPosition = (position || '').trim();
    const trimmedJoiningDate = (joiningDate || '').trim();

    // 1. Required fields check
    if (!candidateName || !candidateEmail || !trimmedPosition || !trimmedJoiningDate) {
      return NextResponse.json(
        { success: false, message: 'Candidate Name, Email, Position, and Joining Date are required.' },
        { status: 400 }
      );
    }

    // 2. Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(candidateEmail)) {
      return NextResponse.json(
        { success: false, message: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    // 3. Candidate Title / Salutation validation
    const rawTitle =
      body.candidateTitle !== undefined
        ? body.candidateTitle
        : body.salutation !== undefined
        ? body.salutation
        : candidateObj.candidateTitle !== undefined
        ? candidateObj.candidateTitle
        : candidateObj.salutation;
    const candidateTitle = rawTitle ? String(rawTitle).trim() : 'None';

    if (candidateTitle && !VALID_CANDIDATE_TITLES.includes(candidateTitle as any)) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid title/salutation "${candidateTitle}". Allowed options: ${VALID_CANDIDATE_TITLES.join(', ')}.`,
        },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    // Fetch org settings default if company details not explicitly provided
    let companyDetails = company;
    if (!companyDetails || !companyDetails.companyName) {
      const orgDoc = await db.collection('organizations').findOne({ organizationId: orgId });
      companyDetails = {
        companyName: orgDoc?.companyName || 'INFINITIVE CLOUD',
        registeredOffice: orgDoc?.registeredOffice || 'Kankroli,Rajasthan,313324',
        officeAddress: orgDoc?.officeAddress || 'Udaipur Rajasthan,313001',
        phone: orgDoc?.phone || '+91 8690393087',
        email: orgDoc?.email || 'cloudinfinitive@gmail.com',
        cin: orgDoc?.cin || 'U62020RJ2025PTC109151',
        logoUrl: orgDoc?.logoUrl || '',
      };
    }

    const referenceNumber = await generateOfferLetterReference(db, orgId, companyDetails.companyName.split(' ')[0]);

    const defaultTerms =
      offerType === 'INTERNSHIP'
        ? [
            `The Internship duration shall be for ${durationMonths} months; the internship period is subject to reduction / extension according to performance evaluation.`,
            'Upon successful completion of the internship, and subject to fulfilling the required attendance criteria and performance standards, an Internship Completion Certificate will be issued. Absences will only be permitted under exceptional and valid circumstances with prior approval.',
            stipendType === 'NON_STIPENDIARY'
              ? 'Please note that this is a non-stipendiary internship, and no monetary compensation will be provided during the training period.'
              : `Monthly stipend compensation of ₹${(salaryStipend || 0).toLocaleString('en-IN')} will be disbursed based on verified attendance and performance.`,
            'The company reserves the right to relieve at any point of time during training if any of the training instructions are not fulfilled, the same shall be briefed to you on the first day of your training.',
            "This offer is a valid subject to reference check. Please sign a copy of this 'Internship Offer Letter' as a token of your acceptance. We wish you wonderful learning with organization and expect a long and fulfilling career with us after successful training.",
          ]
        : [
            `You will be on probation for a period of ${probationPeriod} from your date of joining. Upon successful completion, your employment will be confirmed in writing.`,
            `Notice period required from either party for separation is ${noticePeriod}.`,
            `Your working hours will be ${workingHours}.`,
            'You will be governed by the standard rules, code of conduct, confidentiality agreements, and HR policies of the company.',
            'This offer is contingent upon successful verification of your educational qualifications, background check, and reference verification.',
          ];

    const now = new Date();
    const newOfferDoc = {
      organizationId: orgId,
      referenceNumber,
      candidateId: candidateId || `cand-${Date.now()}`,
      candidateTitle: candidateTitle || 'None',
      salutation: candidateTitle || 'None',
      candidate: {
        candidateTitle: candidateTitle || 'None',
        salutation: candidateTitle || 'None',
        candidateName,
        email: candidateEmail,
        phone: candidatePhone || '',
        address: candidateAddress || '',
        collegeName: collegeName || '',
        employeeId: employeeId || undefined,
      },
      company: companyDetails,
      offerType,
      position: trimmedPosition,
      department: (department || 'Engineering').trim(),
      location: location.trim(),
      offerDate: offerDate || now.toISOString().split('T')[0],
      joiningDate: trimmedJoiningDate,
      expiryDate: expiryDate || undefined,
      durationMonths: Number(durationMonths) || 3,
      stipendType,
      salaryStipend: Number(salaryStipend) || 0,
      probationPeriod,
      noticePeriod,
      workingHours,
      reportingManager: reportingManager?.trim() || '',
      requiredDocuments: Array.isArray(requiredDocuments) ? requiredDocuments : [],
      termsAndConditions: defaultTerms,
      additionalTerms: additionalTerms?.trim() || '',
      version: 1,
      status: 'DRAFT',
      history: [
        {
          version: 1,
          action: 'OFFER_CREATED',
          performedBy: auth.name || auth.userId,
          timestamp: now.toISOString(),
        },
      ],
      createdBy: auth.name || auth.userId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const insertResult = await db.collection('offer_letters').insertOne(newOfferDoc);
    const createdOffer = {
      ...newOfferDoc,
      id: insertResult.insertedId.toString(),
    };

    await logAuditEvent(req, 'OFFER_CREATED', {
      details: { referenceNumber, candidateName, candidateTitle, position, offerType },
    });

    return NextResponse.json({
      success: true,
      message: 'Offer letter created successfully.',
      data: createdOffer,
    });
  } catch (error: any) {
    console.error('Error creating offer letter:', error);
    return NextResponse.json({ success: false, message: 'Failed to create offer letter.' }, { status: 500 });
  }
}
