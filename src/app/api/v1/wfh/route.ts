import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { getISTDateString } from '@/lib/dateUtils';
import { isValidIsoDate } from '@/lib/employmentType';
import { addDaysToIsoDate } from '@/lib/internshipExtension';
import {
  WFH_MAX_DAYS_AHEAD,
  createWfhRequest,
  findWfhRequestForDate,
  processRejectedWfhAbsences,
  toWfhView,
} from '@/lib/wfh';

export const dynamic = 'force-dynamic';

/** GET /api/v1/wfh - the signed-in person's own Work From Home requests (latest first). */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }
    if (!auth.employeeId) {
      return NextResponse.json({ success: true, data: [] });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    // Rejected WFH days that are over: apply the "did not come to office" rule (also runs nightly)
    await processRejectedWfhAbsences(db, { today: getISTDateString(new Date()), organizationId: orgId }).catch((err) =>
      console.warn('[WFH] Rejected-day check skipped:', err)
    );

    const rows = await db
      .collection('wfh_requests')
      .find({ organizationId: orgId, employeeId: auth.employeeId })
      .sort({ date: -1, createdAt: -1 })
      .limit(30)
      .toArray();

    return NextResponse.json({ success: true, data: rows.map(toWfhView) });
  } catch (error: any) {
    console.error('Error in GET /api/v1/wfh:', error);
    return NextResponse.json({ success: false, message: 'Failed to load Work From Home requests.' }, { status: 500 });
  }
}

/** POST /api/v1/wfh - ask in advance to work from home on a date (tomorrow or later). */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }
    if (!auth.employeeId) {
      return NextResponse.json({ success: false, message: 'Your account is not linked to an employee profile.' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const date = typeof body.date === 'string' ? body.date.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    const today = getISTDateString(new Date());
    const tomorrow = addDaysToIsoDate(today, 1);
    const lastAllowed = addDaysToIsoDate(today, WFH_MAX_DAYS_AHEAD);
    if (!isValidIsoDate(date)) {
      return NextResponse.json({ success: false, message: 'Choose a valid date.' }, { status: 400 });
    }
    if (date < tomorrow) {
      return NextResponse.json(
        { success: false, message: 'Request Work From Home at least one day before. For today, choose Work From Home when you check in.' },
        { status: 400 }
      );
    }
    if (date > lastAllowed) {
      return NextResponse.json({ success: false, message: `You can request up to ${WFH_MAX_DAYS_AHEAD} days ahead.` }, { status: 400 });
    }
    if (reason.length < 5 || reason.length > 300) {
      return NextResponse.json({ success: false, message: 'Write a reason (5 to 300 characters).' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    const employee: any = await db.collection('employees').findOne({ organizationId: orgId, employeeId: auth.employeeId });
    if (!employee) {
      return NextResponse.json({ success: false, message: 'Employee profile not found.' }, { status: 404 });
    }

    const existing = await findWfhRequestForDate(db, orgId, auth.employeeId, date);
    if (existing) {
      return NextResponse.json(
        { success: false, message: `You already have a ${String(existing.status).toLowerCase()} Work From Home request for ${date}.` },
        { status: 409 }
      );
    }

    const onLeave = await db.collection('leaves').findOne({
      organizationId: orgId,
      employeeId: auth.employeeId,
      status: { $in: ['Approved', 'APPROVED', 'Pending'] },
      startDate: { $lte: date },
      endDate: { $gte: date },
      $or: [{ durationType: 'FULL_DAY' }, { durationDays: { $gte: 1 } }],
    });
    if (onLeave) {
      return NextResponse.json({ success: false, message: `You have a leave request for ${date}.` }, { status: 409 });
    }

    const doc = await createWfhRequest(db, {
      organizationId: orgId,
      employee,
      date,
      reason,
      source: 'ADVANCE',
      requestedBy: { name: auth.name || auth.email || auth.employeeId, userId: auth.userId, role: auth.role },
    });

    await logAuditEvent(req, 'WFH_REQUESTED', { employeeId: auth.employeeId, details: { date, reason } });

    return NextResponse.json({
      success: true,
      message: `Work From Home request for ${date} sent to your mentor / HR.`,
      data: toWfhView(doc),
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/wfh:', error);
    return NextResponse.json({ success: false, message: 'Failed to send the Work From Home request.' }, { status: 500 });
  }
}