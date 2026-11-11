import { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { createNotification } from '@/lib/notifications/notificationService';
import { sendEmail, validateGmailConfig } from '@/lib/mailer';
import {
  getISTDateString,
  getISTTimeString,
  formatISTTime,
  parseDateInput,
} from '@/lib/dateUtils';
import { loadAttendanceRules } from '@/lib/geo';

export type AlertType = 'LATE_ARRIVAL' | 'ABSENT' | 'MISSED_CHECKOUT' | 'EARLY_DEPARTURE';
export type AlertStatus = 'PENDING' | 'SENT' | 'READ' | 'RESOLVED';

export interface AttendanceAlertDoc {
  _id?: any;
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
  managerId?: string;
  alertType: AlertType;
  date: string; // YYYY-MM-DD in IST
  time: string; // "hh:mm AM/PM"
  expectedTime?: string;
  actualTime?: string;
  diffMinutes?: number;
  message: string;
  status: AlertStatus;
  resolvedBy?: string;
  resolvedAt?: string | Date | null;
  resolutionNote?: string;
  notifiedVia: ('IN_APP' | 'EMAIL')[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AttendanceAlertStats {
  total: number;
  lateArrivals: number;
  absentEmployees: number;
  missedCheckouts: number;
  earlyDepartures: number;
  pending: number;
  resolved: number;
}

export interface DetectionResult {
  success: boolean;
  targetDate: string;
  organizationId: string;
  processedEmployees: number;
  createdAlerts: number;
  skippedAlerts: number;
  alerts: AttendanceAlertDoc[];
}

/**
 * Parses time string like "09:30 AM" or "18:00" to minutes from midnight
 */
export function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null;
  const trimmed = timeStr.trim();

  // 12-hour AM/PM format (e.g. "09:30 AM")
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const modifier = ampmMatch[3]?.toUpperCase();

    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  // 24-hour format (e.g. "17:30")
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    return hours * 60 + minutes;
  }

  return null;
}

/**
 * Format minutes into hours & mins (e.g. "25 mins" or "1 hr 15 mins")
 */
export function formatDurationMinutes(minutes: number): string {
  const absMins = Math.abs(minutes);
  if (absMins < 60) return `${absMins} min${absMins === 1 ? '' : 's'}`;
  const hrs = Math.floor(absMins / 60);
  const remMins = absMins % 60;
  return remMins === 0 ? `${hrs} hr${hrs === 1 ? '' : 's'}` : `${hrs} hr${hrs === 1 ? '' : 's'} ${remMins} min${remMins === 1 ? '' : 's'}`;
}

/**
 * Checks if targetDate is a Sunday (standard weekly off)
 */
export function isWeeklyOff(dateStr: string): boolean {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.getDay() === 0; // Sunday
    }
  } catch {}
  return false;
}

/**
 * Ensures indexes exist on `attendance_alerts`
 */
export async function ensureAttendanceAlertIndexes(db: Db): Promise<void> {
  try {
    await db.collection('attendance_alerts').createIndex(
      { organizationId: 1, employeeId: 1, alertType: 1, date: 1 },
      { unique: true }
    );
    await db.collection('attendance_alerts').createIndex({ organizationId: 1, date: -1, status: 1 });
    await db.collection('attendance_alerts').createIndex({ organizationId: 1, alertType: 1 });
    await db.collection('attendance_alerts').createIndex({ organizationId: 1, managerId: 1 });
  } catch (err) {
    console.warn('[AttendanceAlerts] Index creation notice:', err);
  }
}

/**
 * Generates and dispatches a single attendance alert
 */
export async function createAttendanceAlert(
  db: Db,
  alertData: Omit<AttendanceAlertDoc, '_id' | 'id' | 'createdAt' | 'updatedAt' | 'notifiedVia'> & {
    employeeEmail?: string;
  }
): Promise<AttendanceAlertDoc | null> {
  await ensureAttendanceAlertIndexes(db);

  const {
    organizationId,
    employeeId,
    employeeName,
    employeeCode,
    department,
    designation,
    managerId,
    alertType,
    date,
    time,
    expectedTime,
    actualTime,
    diffMinutes,
    message,
    status = 'PENDING',
    employeeEmail,
  } = alertData;

  // 1. Duplicate check: strictly prevent multiple alerts of the same type for same employee & date
  const existingAlert = await db.collection('attendance_alerts').findOne({
    organizationId,
    employeeId,
    alertType,
    date,
  });

  if (existingAlert) {
    return null; // Already generated
  }

  const now = new Date();
  const alertId = `att-alert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const notifiedVia: ('IN_APP' | 'EMAIL')[] = ['IN_APP'];

  const alertDoc: AttendanceAlertDoc = {
    id: alertId,
    organizationId,
    employeeId,
    employeeName,
    employeeCode: employeeCode || employeeId,
    department: department || 'General',
    designation: designation || 'Staff',
    managerId,
    alertType,
    date,
    time,
    expectedTime,
    actualTime,
    diffMinutes,
    message,
    status,
    notifiedVia,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.collection('attendance_alerts').insertOne(alertDoc);
  } catch (insertErr: any) {
    // E11000 duplicate key caught gracefully
    if (insertErr?.code === 11000) {
      return null;
    }
    throw insertErr;
  }

  // 2. Dispatch In-App Notifications
  const alertTitles: Record<AlertType, string> = {
    LATE_ARRIVAL: 'Late Arrival Alert',
    ABSENT: 'Absence Alert',
    MISSED_CHECKOUT: 'Missed Check-out Alert',
    EARLY_DEPARTURE: 'Early Departure Alert',
  };

  const notificationTitle = alertTitles[alertType] || 'Attendance Alert';

  // Send to target employee
  try {
    await createNotification({
      organizationId,
      recipientType: 'EMPLOYEE',
      recipientId: employeeId,
      targetScope: 'USER',
      targetId: employeeId,
      eventType: `ATTENDANCE_ALERT_${alertType}`,
      eventId: `att-alert:${alertType}:${employeeId}:${date}`,
      category: 'ATTENDANCE',
      title: notificationTitle,
      message,
      priority: alertType === 'ABSENT' ? 'HIGH' : 'NORMAL',
      actionUrl: '/employee/attendance',
      metadata: {
        alertId,
        alertType,
        date,
        diffMinutes,
      },
    });
  } catch (err) {
    console.error(`[AttendanceAlerts] In-App notification to employee ${employeeId} failed:`, err);
  }

  // If employee has a manager, also notify their manager
  if (managerId && managerId !== employeeId) {
    try {
      await createNotification({
        organizationId,
        recipientType: 'MANAGER',
        recipientId: managerId,
        targetScope: 'USER',
        targetId: managerId,
        eventType: `TEAM_ATTENDANCE_ALERT_${alertType}`,
        eventId: `team-att-alert:${alertType}:${employeeId}:${date}`,
        category: 'ATTENDANCE',
        title: `Team Member: ${notificationTitle}`,
        message: `${employeeName} (${employeeCode || employeeId}): ${message}`,
        priority: 'NORMAL',
        actionUrl: '/admin/attendance/alerts',
        metadata: {
          alertId,
          employeeId,
          alertType,
          date,
        },
      });
    } catch (err) {
      console.error(`[AttendanceAlerts] In-App notification to manager ${managerId} failed:`, err);
    }
  }

  // 3. Dispatch Email Notification if configured
  if (employeeEmail && validateGmailConfig().valid) {
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div style="background-color: #0f172a; padding: 16px 20px; border-radius: 6px; margin-bottom: 20px;">
            <h2 style="color: #ffffff; margin: 0; font-size: 18px;">Infinitive Cloud HRMS - Attendance Notification</h2>
          </div>
          <p style="font-size: 15px; color: #1e293b;">Dear <strong>${employeeName}</strong>,</p>
          <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #334155; font-size: 16px;">${notificationTitle}</p>
            <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.5;">${message}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; width: 140px;">Employee ID:</td>
              <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${employeeCode || employeeId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Date:</td>
              <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${date}</td>
            </tr>
            ${expectedTime ? `<tr><td style="padding: 8px 0; color: #64748b;">Scheduled Time:</td><td style="padding: 8px 0; color: #1e293b;">${expectedTime}</td></tr>` : ''}
            ${actualTime ? `<tr><td style="padding: 8px 0; color: #64748b;">Recorded Time:</td><td style="padding: 8px 0; color: #1e293b;">${actualTime}</td></tr>` : ''}
          </table>
          <p style="font-size: 13px; color: #64748b;">If you believe this alert was generated in error or requires regularization, please submit an attendance regularize request or contact your reporting manager.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">Infinitive Cloud HRMS Automated Attendance Monitoring</p>
        </div>
      `;

      await sendEmail({
        to: employeeEmail,
        subject: `[Attendance Alert] ${notificationTitle} - ${date}`,
        html: emailHtml,
        text: `Dear ${employeeName},\n\n${notificationTitle}\n${message}\n\nDate: ${date}\nEmployee ID: ${employeeCode || employeeId}`,
      });

      // Update notifiedVia in DB
      await db.collection('attendance_alerts').updateOne(
        { id: alertId },
        { $addToSet: { notifiedVia: 'EMAIL' } }
      );
      alertDoc.notifiedVia.push('EMAIL');
    } catch (emailErr) {
      console.warn(`[AttendanceAlerts] Email notification to ${employeeEmail} failed:`, emailErr);
    }
  }

  return alertDoc;
}

/**
 * Main Attendance Detection Engine
 * Inspects all attendance rules, active employees, leaves, and holidays to generate alerts.
 */
export async function detectAttendanceAlerts(options?: {
  organizationId?: string;
  targetDate?: string;
  dryRun?: boolean;
}): Promise<DetectionResult> {
  const { db } = await connectToDatabase();
  const now = new Date();
  const todayIST = getISTDateString(now);
  const currentTimeIST = getISTTimeString(now);
  const currentMinutesIST = parseTimeToMinutes(currentTimeIST) || 0;

  const targetDate = options?.targetDate || todayIST;
  const isTargetToday = targetDate === todayIST;
  const isPastDate = targetDate < todayIST;

  const orgId = options?.organizationId && options.organizationId !== 'ALL'
    ? options.organizationId
    : 'org-default';

  // 1. Load attendance rules
  const attRules = await loadAttendanceRules(db, orgId);
  const workStartTime = attRules.workStartTime || '09:30 AM';
  const workEndTime = attRules.workEndTime || '06:30 PM';
  const graceMinutes = Number(attRules.gracePeriodMinutes ?? 15);
  const absentCutoffTime = attRules.cutoffTime || attRules.absentCutoffTime || '11:30 AM';
  const missedCheckoutBufferMinutes = Number(attRules.missedCheckoutBufferMinutes ?? 60);

  const shiftStartMins = parseTimeToMinutes(workStartTime) || 570; // 09:30 AM
  const shiftEndMins = parseTimeToMinutes(workEndTime) || 1110;    // 06:30 PM
  const cutoffMins = parseTimeToMinutes(absentCutoffTime) || 690;  // 11:30 AM

  // 2. Check if targetDate is Sunday or Holiday
  const isSunday = isWeeklyOff(targetDate);
  let isHoliday = false;

  const holidayDoc = await db.collection('holidays').findOne({
    $or: [{ organizationId: orgId }, { organizationId: 'org-default' }],
    date: targetDate,
    status: { $ne: 'INACTIVE' },
  });
  if (holidayDoc) {
    isHoliday = true;
  }

  // 3. Query Active Employees
  const employeeQuery: any = {
    status: { $in: ['Active', 'ACTIVE', 'active'] },
  };
  if (orgId && orgId !== 'ALL') {
    employeeQuery.organizationId = orgId;
  }

  const employees = await db.collection('employees').find(employeeQuery).toArray();

  // 4. Query Attendance Records for targetDate
  const attendanceQuery: any = { date: targetDate };
  if (orgId && orgId !== 'ALL') {
    attendanceQuery.organizationId = orgId;
  }
  const attendanceDocs = await db.collection('attendance').find(attendanceQuery).toArray();
  const attendanceByEmpId = new Map<string, any>();
  for (const doc of attendanceDocs) {
    attendanceByEmpId.set(doc.employeeId, doc);
  }

  // 5. Query Approved Leaves covering targetDate
  const leaveQuery: any = {
    status: { $in: ['APPROVED', 'Approved', 'approved'] },
    startDate: { $lte: targetDate },
    endDate: { $gte: targetDate },
  };
  if (orgId && orgId !== 'ALL') {
    leaveQuery.organizationId = orgId;
  }
  const approvedLeaves = await db.collection('leaves').find(leaveQuery).toArray();
  const leaveEmpIds = new Set(approvedLeaves.map((l) => l.employeeId));

  const createdAlerts: AttendanceAlertDoc[] = [];
  let skippedAlerts = 0;

  for (const emp of employees) {
    const empId = emp.employeeId || emp._id.toString();
    const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Employee';
    const empCode = emp.employeeId || emp.code || empId;
    const dept = emp.department || 'General';
    const desig = emp.designation || 'Staff';
    const managerId = emp.managerId || emp.reportingTo;
    const empEmail = emp.email;
    const empOrgId = emp.organizationId || orgId;

    const attRecord = attendanceByEmpId.get(empId);
    const hasCheckIn = Boolean(attRecord && (attRecord.checkIn || attRecord.clockIn || attRecord.checkInTime));
    const hasCheckOut = Boolean(attRecord && (attRecord.checkOut || attRecord.clockOut || attRecord.checkOutTime));

    const isOnApprovedLeave = leaveEmpIds.has(empId) || attRecord?.status === 'On Leave';

    // ----------------------------------------------------
    // CHECK 1: Late Arrival
    // ----------------------------------------------------
    if (hasCheckIn) {
      const checkInVal = attRecord.checkIn || attRecord.clockIn;
      const checkInTimeStr = formatISTTime(attRecord.checkInTime || checkInVal);
      const checkInMins = parseTimeToMinutes(checkInTimeStr);

      if (checkInMins !== null) {
        const allowedStartMins = shiftStartMins + graceMinutes;
        if (checkInMins > allowedStartMins) {
          const diffMins = checkInMins - shiftStartMins;
          const formattedDuration = formatDurationMinutes(diffMins);
          const message = `Employee arrived late: checked in at ${checkInTimeStr} (${formattedDuration} after scheduled shift start ${workStartTime} with ${graceMinutes}m grace).`;

          if (!options?.dryRun) {
            const created = await createAttendanceAlert(db, {
              organizationId: empOrgId,
              employeeId: empId,
              employeeName: empName,
              employeeCode: empCode,
              department: dept,
              designation: desig,
              managerId,
              alertType: 'LATE_ARRIVAL',
              date: targetDate,
              time: checkInTimeStr,
              expectedTime: workStartTime,
              actualTime: checkInTimeStr,
              diffMinutes: diffMins,
              message,
              status: 'PENDING',
              employeeEmail: empEmail,
            });
            if (created) createdAlerts.push(created);
            else skippedAlerts++;
          }
        }
      }
    }

    // ----------------------------------------------------
    // CHECK 2: Absent Employee
    // ----------------------------------------------------
    // Condition: Non-holiday, non-weekly-off, not on approved leave, and no check-in recorded.
    // If targetDate is today: only flag if current time is past cutoff time (e.g. 11:30 AM).
    // If targetDate is in past: flag since whole day passed without check-in.
    const isWorkingDay = !isSunday && !isHoliday && !isOnApprovedLeave;
    const canCheckAbsence = isPastDate || (isTargetToday && currentMinutesIST >= cutoffMins);

    if (isWorkingDay && !hasCheckIn && canCheckAbsence) {
      const message = isTargetToday
        ? `Employee has not marked attendance by the ${absentCutoffTime} cutoff time.`
        : `Employee was marked absent: no attendance was recorded for working day ${targetDate}.`;

      if (!options?.dryRun) {
        const created = await createAttendanceAlert(db, {
          organizationId: empOrgId,
          employeeId: empId,
          employeeName: empName,
          employeeCode: empCode,
          department: dept,
          designation: desig,
          managerId,
          alertType: 'ABSENT',
          date: targetDate,
          time: isTargetToday ? absentCutoffTime : '06:30 PM',
          expectedTime: workStartTime,
          message,
          status: 'PENDING',
          employeeEmail: empEmail,
        });
        if (created) createdAlerts.push(created);
        else skippedAlerts++;
      }
    }

    // ----------------------------------------------------
    // CHECK 3: Missed Check-Out
    // ----------------------------------------------------
    // Condition: Check-in exists, but no check-out recorded.
    // Past date: definitely missed check-out.
    // Today: flag if current time is past shift end + buffer minutes (e.g. 06:30 PM + 60m = 07:30 PM).
    const isPastShiftEndBuffer = currentMinutesIST >= (shiftEndMins + missedCheckoutBufferMinutes);
    const shouldCheckMissedCheckout = isPastDate || (isTargetToday && isPastShiftEndBuffer);

    if (hasCheckIn && !hasCheckOut && shouldCheckMissedCheckout) {
      const checkInVal = formatISTTime(attRecord.checkIn || attRecord.clockIn || attRecord.checkInTime);
      const message = `Employee checked in at ${checkInVal} but failed to record a check-out before shift closure.`;

      if (!options?.dryRun) {
        const created = await createAttendanceAlert(db, {
          organizationId: empOrgId,
          employeeId: empId,
          employeeName: empName,
          employeeCode: empCode,
          department: dept,
          designation: desig,
          managerId,
          alertType: 'MISSED_CHECKOUT',
          date: targetDate,
          time: workEndTime,
          expectedTime: workEndTime,
          message,
          status: 'PENDING',
          employeeEmail: empEmail,
        });
        if (created) createdAlerts.push(created);
        else skippedAlerts++;
      }
    }

    // ----------------------------------------------------
    // CHECK 4: Early Departure
    // ----------------------------------------------------
    // Condition: Check-out recorded before scheduled shift end time.
    if (hasCheckOut) {
      const checkOutVal = attRecord.checkOut || attRecord.clockOut;
      const checkOutTimeStr = formatISTTime(attRecord.checkOutTime || checkOutVal);
      const checkOutMins = parseTimeToMinutes(checkOutTimeStr);

      if (checkOutMins !== null && checkOutMins < shiftEndMins) {
        const diffMins = shiftEndMins - checkOutMins;
        const formattedDuration = formatDurationMinutes(diffMins);
        const message = `Employee departed early: checked out at ${checkOutTimeStr} (${formattedDuration} before scheduled shift end ${workEndTime}).`;

        if (!options?.dryRun) {
          const created = await createAttendanceAlert(db, {
            organizationId: empOrgId,
            employeeId: empId,
            employeeName: empName,
            employeeCode: empCode,
            department: dept,
            designation: desig,
            managerId,
            alertType: 'EARLY_DEPARTURE',
            date: targetDate,
            time: checkOutTimeStr,
            expectedTime: workEndTime,
            actualTime: checkOutTimeStr,
            diffMinutes: diffMins,
            message,
            status: 'PENDING',
            employeeEmail: empEmail,
          });
          if (created) createdAlerts.push(created);
          else skippedAlerts++;
        }
      }
    }
  }

  return {
    success: true,
    targetDate,
    organizationId: orgId,
    processedEmployees: employees.length,
    createdAlerts: createdAlerts.length,
    skippedAlerts,
    alerts: createdAlerts,
  };
}

