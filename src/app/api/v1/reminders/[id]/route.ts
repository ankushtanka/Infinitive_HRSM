import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { calculateProbationEndDate } from '@/lib/employeeReminders';

export const dynamic = 'force-dynamic';

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
    const { db } = await connectToDatabase();

    const query: any = ObjectId.isValid(id)
      ? { $or: [{ id }, { _id: new ObjectId(id) }] }
      : { id };
    if (auth.role !== 'SUPER_ADMIN') {
      query.organizationId = auth.organizationId;
    }

    const reminder = await db.collection('employee_reminders').findOne(query);
    if (!reminder) {
      return NextResponse.json({ success: false, message: 'Reminder not found' }, { status: 404 });
    }

    // RBAC: Employee can only see own
    if (auth.role === 'EMPLOYEE' && reminder.employeeId !== auth.employeeId) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: reminder });
  } catch (error: any) {
    console.error('Error in GET /api/v1/reminders/[id]:', error);
    return NextResponse.json({ success: false, message: error.message || 'Error fetching reminder' }, { status: 500 });
  }
}

export async function PATCH(
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
    const body = await req.json();
    const { action, note, extensionMonths, newExpiryDate, checklist, onboardingStatus, status } = body;

    const { db } = await connectToDatabase();
    const query: any = ObjectId.isValid(id)
      ? { $or: [{ id }, { _id: new ObjectId(id) }] }
      : { id };
    if (auth.role !== 'SUPER_ADMIN') {
      query.organizationId = auth.organizationId;
    }

    const reminder = await db.collection('employee_reminders').findOne(query);
    if (!reminder) {
      return NextResponse.json({ success: false, message: 'Reminder not found' }, { status: 404 });
    }

    // Only HR, Admin, Super Admin or assigned manager can perform actions
    const isElevated = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(auth.role);
    const isManager = auth.role === 'MANAGER' && reminder.managerId === auth.employeeId;

    if (!isElevated && !isManager && action !== 'MARK_READ') {
      return NextResponse.json({ success: false, message: 'Forbidden. Action requires HR, Admin, or Manager permission.' }, { status: 403 });
    }

    const now = new Date();
    const updateDoc: any = {
      updatedAt: now,
      actionAt: now,
      actionBy: auth.name || auth.email,
    };
    if (note) updateDoc.actionNote = note.trim();

    // 1. PROBATION_COMPLETE
    if (action === 'PROBATION_COMPLETE') {
      updateDoc.status = 'COMPLETED';
      updateDoc.actionTaken = 'COMPLETED';
      updateDoc.probationStatus = 'Completed';

      await db.collection('employees').updateOne(
        { employeeId: reminder.employeeId, organizationId: reminder.organizationId },
        { $set: { probationStatus: 'Completed', updatedAt: now } }
      );
    }
    // 2. PROBATION_CONFIRM
    else if (action === 'PROBATION_CONFIRM') {
      updateDoc.status = 'RESOLVED';
      updateDoc.actionTaken = 'CONFIRMED';
      updateDoc.probationStatus = 'Confirmed';

      await db.collection('employees').updateOne(
        { employeeId: reminder.employeeId, organizationId: reminder.organizationId },
        { $set: { probationStatus: 'Confirmed', status: 'Active', updatedAt: now } }
      );
    }
    // 3. PROBATION_EXTEND
    else if (action === 'PROBATION_EXTEND') {
      const extMonths = Number(extensionMonths || 3);
      const currentEnd = reminder.probationEndDate || reminder.targetDate;
      const newEndDate = calculateProbationEndDate(currentEnd, extMonths);

      updateDoc.status = 'UPCOMING';
      updateDoc.actionTaken = 'EXTENDED';
      updateDoc.probationStatus = 'Extended';
      if (newEndDate) {
        updateDoc.probationEndDate = newEndDate;
        updateDoc.targetDate = newEndDate;
      }

      await db.collection('employees').updateOne(
        { employeeId: reminder.employeeId, organizationId: reminder.organizationId },
        {
          $set: {
            probationStatus: 'Extended',
            probationEndDate: newEndDate || currentEnd,
            updatedAt: now,
          },
        }
      );
    }
    // 4. DOCUMENT_RENEW
    else if (action === 'DOCUMENT_RENEW') {
      if (!newExpiryDate) {
        return NextResponse.json({ success: false, message: 'New document expiry date is required.' }, { status: 400 });
      }

      updateDoc.status = 'RESOLVED';
      updateDoc.actionTaken = 'RENEWED';
      updateDoc.targetDate = newExpiryDate;

      if (reminder.documentId) {
        const docFilter: any = ObjectId.isValid(reminder.documentId)
          ? { _id: new ObjectId(reminder.documentId) }
          : { id: reminder.documentId };

        await db.collection('documents').updateOne(
          docFilter,
          {
            $set: {
              expiryDate: newExpiryDate,
              validUntil: newExpiryDate,
              updatedAt: now.toISOString(),
            },
          }
        );
      }
    }
    // 5. UPDATE_ONBOARDING
    else if (action === 'UPDATE_ONBOARDING') {
      if (checklist) updateDoc.onboardingChecklist = checklist;
      if (onboardingStatus) {
        updateDoc.onboardingStatus = onboardingStatus;
        if (onboardingStatus === 'COMPLETED') {
          updateDoc.status = 'COMPLETED';
          updateDoc.actionTaken = 'ONBOARDING_COMPLETED';
        }
      }

      const empUpdate: any = { updatedAt: now };
      if (checklist) empUpdate.onboardingChecklist = checklist;
      if (onboardingStatus) empUpdate.onboardingStatus = onboardingStatus;

      await db.collection('employees').updateOne(
        { employeeId: reminder.employeeId, organizationId: reminder.organizationId },
        { $set: empUpdate }
      );
    }
    // 6. Generic Status / Resolve
    else if (status || action === 'RESOLVE') {
      updateDoc.status = status || 'RESOLVED';
      updateDoc.actionTaken = action || 'RESOLVED';
    }

    await db.collection('employee_reminders').updateOne(
      { _id: reminder._id },
      { $set: updateDoc }
    );

    await logAuditEvent(req, 'EMPLOYEE_REMINDER_ACTION', {
      employeeId: reminder.employeeId,
      details: {
        reminderId: reminder.id,
        category: reminder.category,
        action: action || status,
        note,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Reminder updated successfully.',
      data: { ...reminder, ...updateDoc },
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/v1/reminders/[id]:', error);
    return NextResponse.json({ success: false, message: error.message || 'Error updating reminder' }, { status: 500 });
  }
}
