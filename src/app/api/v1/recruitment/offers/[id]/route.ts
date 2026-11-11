import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';
import { VALID_CANDIDATE_TITLES } from '@/types/offerLetter';

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

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const { id } = params;

    let offer: any = null;
    if (ObjectId.isValid(id)) {
      offer = await db.collection('offer_letters').findOne({ _id: new ObjectId(id), organizationId: orgId });
    }
    if (!offer) {
      offer = await db.collection('offer_letters').findOne({ referenceNumber: id, organizationId: orgId });
    }

    if (!offer) {
      return NextResponse.json({ success: false, message: 'Offer letter not found.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...offer,
        id: offer._id.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error getting offer letter detail:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch offer letter details.' }, { status: 500 });
  }
}

export async function PATCH(
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

    const existing = await db.collection('offer_letters').findOne({
      _id: new ObjectId(id),
      organizationId: orgId,
    });

    if (!existing) {
      return NextResponse.json({ success: false, message: 'Offer letter record not found.' }, { status: 404 });
    }

    const body = await req.json();

    const rawTitle =
      body.candidateTitle !== undefined
        ? body.candidateTitle
        : body.salutation !== undefined
        ? body.salutation
        : body.candidate?.candidateTitle !== undefined
        ? body.candidate.candidateTitle
        : body.candidate?.salutation;

    if (rawTitle !== undefined) {
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
    }

    const now = new Date();

    const newVersion = (existing.version || 1) + 1;
    const newHistoryItem = {
      version: newVersion,
      action: 'OFFER_UPDATED',
      performedBy: auth.name || auth.userId,
      timestamp: now.toISOString(),
    };

    const updatedFields: any = {
      version: newVersion,
      updatedBy: auth.name || auth.userId,
      updatedAt: now.toISOString(),
    };

    if (rawTitle !== undefined) {
      const cleanTitle = rawTitle ? String(rawTitle).trim() : 'None';
      updatedFields.candidateTitle = cleanTitle;
      updatedFields.salutation = cleanTitle;
    }

    const flatCandidateUpdates: any = {};
    if (body.candidateName !== undefined) flatCandidateUpdates.candidateName = body.candidateName.trim();
    if (body.candidateEmail !== undefined) flatCandidateUpdates.email = body.candidateEmail.trim().toLowerCase();
    if (body.candidatePhone !== undefined) flatCandidateUpdates.phone = body.candidatePhone.trim();
    if (body.candidateAddress !== undefined) flatCandidateUpdates.address = body.candidateAddress.trim();
    if (body.collegeName !== undefined) flatCandidateUpdates.collegeName = body.collegeName.trim();
    if (body.employeeId !== undefined) flatCandidateUpdates.employeeId = body.employeeId.trim();

    if (body.candidate || Object.keys(flatCandidateUpdates).length > 0) {
      updatedFields.candidate = {
        ...existing.candidate,
        ...flatCandidateUpdates,
        ...(body.candidate || {}),
      };
      if (rawTitle !== undefined) {
        const cleanTitle = rawTitle ? String(rawTitle).trim() : 'None';
        updatedFields.candidate.candidateTitle = cleanTitle;
        updatedFields.candidate.salutation = cleanTitle;
      }
    } else if (rawTitle !== undefined) {
      const cleanTitle = rawTitle ? String(rawTitle).trim() : 'None';
      updatedFields.candidate = {
        ...existing.candidate,
        candidateTitle: cleanTitle,
        salutation: cleanTitle,
      };
    }
    if (body.company) {
      updatedFields.company = {
        ...existing.company,
        ...body.company,
      };
    }
    if (body.offerType) updatedFields.offerType = body.offerType;
    if (body.position) updatedFields.position = body.position;
    if (body.department) updatedFields.department = body.department;
    if (body.location) updatedFields.location = body.location;
    if (body.offerDate) updatedFields.offerDate = body.offerDate;
    if (body.joiningDate) updatedFields.joiningDate = body.joiningDate;
    if (body.expiryDate !== undefined) updatedFields.expiryDate = body.expiryDate;
    if (body.durationMonths !== undefined) updatedFields.durationMonths = body.durationMonths;
    if (body.stipendType) updatedFields.stipendType = body.stipendType;
    if (body.salaryStipend !== undefined) updatedFields.salaryStipend = body.salaryStipend;
    if (body.probationPeriod) updatedFields.probationPeriod = body.probationPeriod;
    if (body.noticePeriod) updatedFields.noticePeriod = body.noticePeriod;
    if (body.workingHours) updatedFields.workingHours = body.workingHours;
    if (body.reportingManager !== undefined) updatedFields.reportingManager = body.reportingManager;
    if (Array.isArray(body.requiredDocuments)) updatedFields.requiredDocuments = body.requiredDocuments;
    if (Array.isArray(body.termsAndConditions)) updatedFields.termsAndConditions = body.termsAndConditions;
    if (body.additionalTerms !== undefined) updatedFields.additionalTerms = body.additionalTerms;
    if (body.status) updatedFields.status = body.status;

    await db.collection('offer_letters').updateOne(
      { _id: new ObjectId(id), organizationId: orgId },
      {
        $set: updatedFields,
        $push: { history: newHistoryItem } as any,
      }
    );

    const updatedDoc = await db.collection('offer_letters').findOne({ _id: new ObjectId(id) });

    await logAuditEvent(req, 'OFFER_UPDATED', {
      details: { referenceNumber: existing.referenceNumber, newVersion },
    });

    return NextResponse.json({
      success: true,
      message: `Offer letter updated to version ${newVersion}.`,
      data: {
        ...updatedDoc,
        id: updatedDoc?._id.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error updating offer letter:', error);
    return NextResponse.json({ success: false, message: 'Failed to update offer letter.' }, { status: 500 });
  }
}

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

    if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ADMIN' && auth.role !== 'HR') {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 403 });
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

    if (offer.status === 'SENT' || offer.status === 'ACCEPTED') {
      return NextResponse.json(
        { success: false, message: 'Sent or Accepted offer letters cannot be deleted. You can mark them as Expired.' },
        { status: 400 }
      );
    }

    await db.collection('offer_letters').deleteOne({ _id: new ObjectId(id), organizationId: orgId });

    return NextResponse.json({
      success: true,
      message: 'Offer letter draft deleted successfully.',
    });
  } catch (error: any) {
    console.error('Error deleting offer letter:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete offer letter.' }, { status: 500 });
  }
}
