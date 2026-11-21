/**
 * Work From Home requests (collection: wfh_requests).
 *
 * - A request is made a day or more in advance from the Attendance page, or automatically when someone
 *   checks in as Work From Home without an approved request for that day.
 * - The mentor (reporting manager with the Manager role) or HR / Admin approves or rejects it in the Approval Center.
 * - Rejected for an intern who worked from home anyway (checked in as WFH), or who did not come to the office that
 *   day: the internship is extended by WFH_REJECT_EXTENSION_DAYS. The day is marked Absent.
 */
import type { Db } from 'mongodb';
import { createNotification } from '@/lib/notifications/notificationService';
import { extendInternship } from '@/lib/internshipExtension';
import { isInternRecord, isValidIsoDate } from '@/lib/employmentType';

export const WFH_REJECT_EXTENSION_DAYS = 2;
export const WFH_MAX_DAYS_AHEAD = 60;
export const WORK_SUMMARY_MIN_LENGTH = 20;
export const WORK_SUMMARY_MAX_LENGTH = 1500;

export type WfhStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

/** The live (not cancelled) WFH request of an employee for a date, if any. */
export async function findWfhRequestForDate(db: Db, organizationId: string, employeeId: string, date: string): Promise<any | null> {
  const rows = await db
    .collection('wfh_requests')
    .find({ organizationId, employeeId, date, status: { $in: ['Pending', 'Approved', 'Rejected'] } })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  return rows[0] || null;
}

const hasPunch = (value: unknown) =>
  typeof value === 'string' ? value.trim() !== '' && value.trim() !== '--:--' : Boolean(value);

async function notifySafely(options: Parameters<typeof createNotification>[0]) {
  try {
    await createNotification(options);
  } catch (err) {
    console.warn('[WFH] Notification skipped:', err);
  }
}

/** Creates a pending WFH request and tells the mentor / HR. */
export async function createWfhRequest(
  db: Db,
  params: {
    organizationId: string;
    employee: any;
    date: string;
    reason: string;
    source: 'ADVANCE' | 'CHECK_IN';
    requestedBy: { name: string; userId?: string; role?: string };
    now?: Date;
  }
): Promise<any> {
  const { organizationId, employee, date, reason, source, requestedBy } = params;
  const now = params.now || new Date();
  const employeeName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.name || employee.employeeId;
  const doc: Record<string, any> = {
    organizationId,
    employeeId: employee.employeeId,
    employeeName,
    department: employee.department || '',
    designation: employee.designation || '',
    managerId: employee.managerId || employee.reportingTo || '',
    isIntern: isInternRecord(employee),
    date,
    reason,
    source,
    status: 'Pending' as WfhStatus,
    history: [
      {
        action: 'SUBMITTED',
        performedBy: requestedBy.name,
        performedById: requestedBy.userId,
        role: requestedBy.role,
        timestamp: now.toISOString(),
        comments: source === 'CHECK_IN' ? 'Checked in as Work From Home' : reason,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  const inserted = await db.collection('wfh_requests').insertOne(doc);
  doc._id = inserted.insertedId;

  await notifySafely({
    organizationId,
    recipientType: 'ADMIN',
    recipientId: doc.managerId || 'usr-admin-1',
    eventType: 'wfh_submitted',
    eventId: `wfh:${String(inserted.insertedId)}:submitted`,
    category: 'ATTENDANCE',
    title: `Work From Home request: ${employeeName}`,
    message:
      source === 'CHECK_IN'
        ? `${employeeName} checked in as Work From Home on ${date} and needs approval.`
        : `${employeeName} asked to work from home on ${date}.${reason ? ` Reason: "${reason.slice(0, 100)}"` : ''}`,
    priority: source === 'CHECK_IN' ? 'HIGH' : 'NORMAL',
    actionUrl: '/admin/approvals',
    metadata: { wfhRequestId: String(inserted.insertedId), employeeId: employee.employeeId, date },
  });

  return doc;
}

export type WfhDecisionResult =
  | { ok: true; message: string; request: any; extendedTo?: string }
  | { ok: false; status: number; message: string };

/**
 * Approves or rejects a pending WFH request and updates that day's attendance.
 * Permission checks (self-approval, manager team scope) are done by the caller.
 */
export async function decideWfhRequest(
  db: Db,
  params: {
    organizationId: string;
    request: any;
    action: 'APPROVE' | 'REJECT';
    comments?: string;
    decidedBy: { name: string; userId?: string; role?: string };
    now?: Date;
  }
): Promise<WfhDecisionResult> {
  const { organizationId, request, action, decidedBy } = params;
  const now = params.now || new Date();
  const comments = typeof params.comments === 'string' ? params.comments.trim().slice(0, 500) : '';

  if (request.status !== 'Pending') {
    return { ok: false, status: 409, message: `This Work From Home request is already ${String(request.status).toLowerCase()}.` };
  }

  const newStatus: WfhStatus = action === 'APPROVE' ? 'Approved' : 'Rejected';
  const update: Record<string, any> = {
    status: newStatus,
    decidedBy: decidedBy.name,
    decidedById: decidedBy.userId,
    decidedAt: now,
    decisionComments: comments,
    updatedAt: now,
    history: [
      ...(Array.isArray(request.history) ? request.history : []),
      {
        action: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        performedBy: decidedBy.name,
        performedById: decidedBy.userId,
        role: decidedBy.role,
        timestamp: now.toISOString(),
        comments: comments || undefined,
      },
    ],
  };

  // That day's attendance, if the person already checked in as WFH
  const attendance: any = await db.collection('attendance').findOne({
    organizationId,
    employeeId: request.employeeId,
    date: request.date,
  });
  const workedFromHome = Boolean(attendance && attendance.workMode === 'WFH' && hasPunch(attendance.checkIn));

  if (workedFromHome) {
    await db.collection('attendance').updateOne(
      { _id: attendance._id },
      {
        $set:
          action === 'APPROVE'
            ? { wfhStatus: 'APPROVED', status: 'Work From Home', wfhRequestId: String(request._id), updatedAt: now }
            : {
                wfhStatus: 'REJECTED',
                status: 'Absent',
                notes: `Work From Home rejected by ${decidedBy.name}${comments ? `: ${comments}` : ''}`,
                wfhRequestId: String(request._id),
                updatedAt: now,
              },
      }
    );
  }

  // Rejected after working from home: the intern did not come to the office that day
  let extendedTo: string | undefined;
  if (action === 'REJECT' && workedFromHome) {
    const ext = await extendInternship(db, {
      organizationId,
      employeeId: request.employeeId,
      days: WFH_REJECT_EXTENSION_DAYS,
      reason: `Work From Home on ${request.date} was rejected`,
      sourceType: 'WFH_REJECTED',
      sourceId: String(request._id),
      now,
    });
    if (ext.applied) extendedTo = ext.newEndDate;
    update.extensionApplied = ext.applied;
    update.absenceChecked = true;
    if (ext.applied) update.extensionDays = WFH_REJECT_EXTENSION_DAYS;
  }

  await db.collection('wfh_requests').updateOne({ _id: request._id }, { $set: update });

  await notifySafely({
    organizationId,
    recipientType: 'EMPLOYEE',
    recipientId: request.employeeId,
    eventType: action === 'APPROVE' ? 'wfh_approved' : 'wfh_rejected',
    eventId: `wfh:${String(request._id)}:${action.toLowerCase()}`,
    category: 'ATTENDANCE',
    title: `Work From Home ${newStatus}`,
    message:
      action === 'APPROVE'
        ? `Your Work From Home for ${request.date} was approved.${comments ? ` Comments: ${comments}` : ''}`
        : `Your Work From Home for ${request.date} was rejected.${workedFromHome ? ' That day is marked Absent.' : ' Please work from the office that day.'}${
            extendedTo ? ` Your internship now ends on ${extendedTo}.` : ''
          }${comments ? ` Comments: ${comments}` : ''}`,
    priority: action === 'APPROVE' ? 'NORMAL' : 'HIGH',
    actionUrl: '/employee/attendance',
  });

  let message = `Work From Home for ${request.employeeName || request.employeeId} on ${request.date} ${newStatus.toLowerCase()}.`;
  if (action === 'REJECT' && workedFromHome) message += ' The day is marked Absent.';
  if (extendedTo) message += ` Internship extended by ${WFH_REJECT_EXTENSION_DAYS} days (now ends ${extendedTo}).`;

  return { ok: true, message, request: { ...request, ...update }, extendedTo };
}

/**
 * For rejected WFH days that are over: an intern who did not check in from the office that day
 * (and was not on approved leave) gets the internship extended. Safe to run many times.
 */
export async function processRejectedWfhAbsences(
  db: Db,
  params: { today: string; organizationId?: string; now?: Date }
): Promise<{ checked: number; extended: number }> {
  const now = params.now || new Date();
  const query: Record<string, any> = {
    status: 'Rejected',
    date: { $lt: params.today },
    absenceChecked: { $ne: true },
  };
  if (params.organizationId) query.organizationId = params.organizationId;

  const rows = await db.collection('wfh_requests').find(query).limit(500).toArray();
  let extended = 0;
  for (const request of rows) {
    if (!isValidIsoDate(request.date)) continue;
    const attendance: any = await db.collection('attendance').findOne({
      organizationId: request.organizationId,
      employeeId: request.employeeId,
      date: request.date,
    });
    const cameToOffice = Boolean(attendance && attendance.workMode !== 'WFH' && hasPunch(attendance.checkIn));
    const onLeave = await db.collection('leaves').findOne({
      organizationId: request.organizationId,
      employeeId: request.employeeId,
      status: { $in: ['Approved', 'APPROVED'] },
      startDate: { $lte: request.date },
      endDate: { $gte: request.date },
    });

    const set: Record<string, any> = { absenceChecked: true, updatedAt: now };
    if (!cameToOffice && !onLeave) {
      const ext = await extendInternship(db, {
        organizationId: request.organizationId,
        employeeId: request.employeeId,
        days: WFH_REJECT_EXTENSION_DAYS,
        reason: `Work From Home on ${request.date} was rejected and the intern did not come to the office`,
        sourceType: 'WFH_REJECTED',
        sourceId: String(request._id),
        now,
      });
      if (ext.applied) {
        extended++;
        set.extensionApplied = true;
        set.extensionDays = WFH_REJECT_EXTENSION_DAYS;
      }
    }
    await db.collection('wfh_requests').updateOne({ _id: request._id }, { $set: set });
  }
  return { checked: rows.length, extended };
}

/**
 * WFH check-ins that have no request yet (made before WFH requests existed): create the missing
 * requests so they can be approved or rejected in the Approval Center.
 */
export async function ensureWfhRequestsForCheckIns(db: Db, organizationId: string, now: Date = new Date()): Promise<number> {
  const orphans = await db
    .collection('attendance')
    .find({ organizationId, workMode: 'WFH', wfhStatus: 'PENDING', wfhRequestId: null })
    .limit(200)
    .toArray();
  let created = 0;
  for (const att of orphans) {
    const existing = await findWfhRequestForDate(db, organizationId, att.employeeId, att.date);
    let requestId = existing ? String(existing._id) : '';
    if (!existing) {
      const employee: any = await db.collection('employees').findOne({ organizationId, employeeId: att.employeeId });
      if (!employee) continue;
      const doc = await createWfhRequest(db, {
        organizationId,
        employee,
        date: att.date,
        reason: '',
        source: 'CHECK_IN',
        requestedBy: { name: att.employeeName || employee.employeeId },
        now,
      });
      requestId = String(doc._id);
      created++;
    }
    await db.collection('attendance').updateOne({ _id: att._id }, { $set: { wfhRequestId: requestId } });
  }
  return created;
}

/** Shape used by the Attendance page list and the WFH API. */
export function toWfhView(doc: any) {
  return {
    id: String(doc._id),
    employeeId: doc.employeeId,
    employeeName: doc.employeeName,
    date: doc.date,
    reason: doc.reason || '',
    source: doc.source,
    status: doc.status as WfhStatus,
    decidedBy: doc.decidedBy || null,
    decisionComments: doc.decisionComments || '',
    extensionDays: doc.extensionApplied ? doc.extensionDays || WFH_REJECT_EXTENSION_DAYS : 0,
    createdAt: doc.createdAt,
  };
}