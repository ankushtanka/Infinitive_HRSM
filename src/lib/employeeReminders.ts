import { Db, ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { createNotification } from '@/lib/notifications/notificationService';
import { sendEmail, validateGmailConfig } from '@/lib/mailer';
import { getISTDateString, parseDateInput } from '@/lib/dateUtils';

export type ReminderCategory = 'PROBATION' | 'BIRTHDAY' | 'ANNIVERSARY' | 'DOCUMENT_EXPIRY' | 'JOINING';

export type ReminderStatus =
  | 'UPCOMING'
  | 'PENDING'
  | 'SENT'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'RESOLVED';

export interface EmployeeReminderDoc {
  _id?: any;
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
  managerId?: string;
  avatar?: string;
  category: ReminderCategory;
  reminderType: string;
  targetDate: string; // YYYY-MM-DD
  reminderDate: string; // YYYY-MM-DD
  daysRemaining: number;
  title: string;
  message: string;
  status: ReminderStatus;
  // Category specific metadata
  documentId?: string;
  documentTitle?: string;
  documentCategory?: string;
  documentUrl?: string;
  yearsOfService?: number;
  joiningDate?: string;
  probationEndDate?: string;
  probationPeriodMonths?: number;
  probationStatus?: string;
  onboardingStatus?: string;
  onboardingChecklist?: Array<{ task: string; completed: boolean }>;
  actionTaken?: string | null;
  actionNote?: string | null;
  actionBy?: string | null;
  actionAt?: Date | null;
  notifiedVia: ('IN_APP' | 'EMAIL')[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ReminderStats {
  probation: {
    total: number;
    expiring30d: number;
    expiring7d: number;
    completed: number;
  };
  birthday: {
    today: number;
    upcoming30d: number;
  };
  anniversary: {
    today: number;
    upcoming30d: number;
  };
  documentExpiry: {
    total: number;
    expiringSoon: number;
    expired: number;
  };
  joining: {
    today: number;
    upcoming: number;
    onboardingPending: number;
  };
}

/**
 * Calculates day difference between two YYYY-MM-DD dates in IST
 * Returns positive if targetDate is in future, 0 if today, negative if in past.
 */
export function getDaysDifference(targetDateStr: string, baseDateStr: string): number {
  const [ty, tm, td] = targetDateStr.split('-').map(Number);
  const [by, bm, bd] = baseDateStr.split('-').map(Number);
  const targetUtc = Date.UTC(ty, tm - 1, td);
  const baseUtc = Date.UTC(by, bm - 1, bd);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((targetUtc - baseUtc) / msPerDay);
}

/**
 * Formats "X days remaining", "Today", or "X days overdue"
 */
export function formatDaysRemainingText(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow (1 day remaining)';
  if (days > 1) return `${days} days remaining`;
  if (days === -1) return '1 day overdue';
  return `${Math.abs(days)} days overdue`;
}

/**
 * Calculates next birthday date from DOB (handling leap years)
 */
export function getNextBirthdayDate(dobStr: string, todayStr: string): { birthdayDate: string; daysRemaining: number } | null {
  try {
    const parts = dobStr.split('-');
    if (parts.length !== 3) return null;
    const [, bMonth, bDay] = parts.map(Number);
    const [tYear] = todayStr.split('-').map(Number);

    // Try this year's birthday
    let candidateYear = tYear;
    let bDateObj = new Date(Date.UTC(candidateYear, bMonth - 1, bDay));

    // Handle Feb 29 on non-leap year (Date rolls to March 1)
    if (bMonth === 2 && bDay === 29 && bDateObj.getUTCMonth() !== 1) {
      bDateObj = new Date(Date.UTC(candidateYear, 1, 28)); // Feb 28
    }

    let candidateDateStr = bDateObj.toISOString().split('T')[0];
    let diff = getDaysDifference(candidateDateStr, todayStr);

    // If birthday already passed this year, look at next year
    if (diff < 0) {
      candidateYear += 1;
      bDateObj = new Date(Date.UTC(candidateYear, bMonth - 1, bDay));
      if (bMonth === 2 && bDay === 29 && bDateObj.getUTCMonth() !== 1) {
        bDateObj = new Date(Date.UTC(candidateYear, 1, 28));
      }
      candidateDateStr = bDateObj.toISOString().split('T')[0];
      diff = getDaysDifference(candidateDateStr, todayStr);
    }

    return {
      birthdayDate: candidateDateStr,
      daysRemaining: diff,
    };
  } catch {
    return null;
  }
}

/**
 * Calculates next work anniversary from joiningDate
 */
export function getNextAnniversaryDate(joiningDateStr: string, todayStr: string): {
  anniversaryDate: string;
  daysRemaining: number;
  yearsCompleted: number;
} | null {
  try {
    const parts = joiningDateStr.split('-');
    if (parts.length !== 3) return null;
    const [jYear, jMonth, jDay] = parts.map(Number);
    const [tYear] = todayStr.split('-').map(Number);

    if (jYear >= tYear && getDaysDifference(joiningDateStr, todayStr) > 0) {
      // Future joiner, not an anniversary yet
      return null;
    }

    let candidateYear = tYear;
    let annDateObj = new Date(Date.UTC(candidateYear, jMonth - 1, jDay));
    let candidateDateStr = annDateObj.toISOString().split('T')[0];
    let diff = getDaysDifference(candidateDateStr, todayStr);

    if (diff < 0) {
      candidateYear += 1;
      annDateObj = new Date(Date.UTC(candidateYear, jMonth - 1, jDay));
      candidateDateStr = annDateObj.toISOString().split('T')[0];
      diff = getDaysDifference(candidateDateStr, todayStr);
    }

    const yearsCompleted = candidateYear - jYear;
    if (yearsCompleted <= 0) return null;

    return {
      anniversaryDate: candidateDateStr,
      daysRemaining: diff,
      yearsCompleted,
    };
  } catch {
    return null;
  }
}

/**
 * Calculates probation end date from joining date and probation months
 */
export function calculateProbationEndDate(joiningDateStr: string, probationMonths = 3): string | null {
  try {
    const [y, m, d] = joiningDateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + probationMonths, d));
    return dt.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

/**
 * Ensure MongoDB indexes for `employee_reminders`
 */
export async function ensureReminderIndexes(db: Db): Promise<void> {
  try {
    await db.collection('employee_reminders').createIndex(
      { organizationId: 1, employeeId: 1, category: 1, reminderType: 1, targetDate: 1 },
      { unique: true }
    );
    await db.collection('employee_reminders').createIndex({ organizationId: 1, category: 1, status: 1 });
    await db.collection('employee_reminders').createIndex({ organizationId: 1, targetDate: 1 });
    await db.collection('employee_reminders').createIndex({ organizationId: 1, managerId: 1 });
  } catch (err) {
    console.warn('[EmployeeReminders] Index notice:', err);
  }
}

/**
 * Dispatches a single reminder: saves to DB, triggers in-app notification, and optional email
 */
export async function dispatchReminder(
  db: Db,
  reminderData: Omit<EmployeeReminderDoc, '_id' | 'id' | 'createdAt' | 'updatedAt' | 'notifiedVia'> & {
    employeeEmail?: string;
    managerEmail?: string;
  }
): Promise<EmployeeReminderDoc | null> {
  await ensureReminderIndexes(db);

  const {
    organizationId,
    employeeId,
    employeeName,
    employeeCode,
    department,
    designation,
    managerId,
    avatar,
    category,
    reminderType,
    targetDate,
    reminderDate,
    daysRemaining,
    title,
    message,
    status = 'PENDING',
    documentId,
    documentTitle,
    documentCategory,
    documentUrl,
    yearsOfService,
    joiningDate,
    probationEndDate,
    probationPeriodMonths,
    probationStatus,
    onboardingStatus,
    onboardingChecklist,
    employeeEmail,
  } = reminderData;

  // 1. Check for duplicate reminder
  const existing = await db.collection('employee_reminders').findOne({
    organizationId,
    employeeId,
    category,
    reminderType,
    targetDate,
  });

  if (existing) {
    return null;
  }

  const now = new Date();
  const reminderId = `rem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const notifiedVia: ('IN_APP' | 'EMAIL')[] = ['IN_APP'];

  const doc: EmployeeReminderDoc = {
    id: reminderId,
    organizationId,
    employeeId,
    employeeName,
    employeeCode: employeeCode || employeeId,
    department: department || 'General',
    designation: designation || 'Staff',
    managerId,
    avatar,
    category,
    reminderType,
    targetDate,
    reminderDate,
    daysRemaining,
    title,
    message,
    status,
    documentId,
    documentTitle,
    documentCategory,
    documentUrl,
    yearsOfService,
    joiningDate,
    probationEndDate,
    probationPeriodMonths,
    probationStatus,
    onboardingStatus,
    onboardingChecklist,
    notifiedVia,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.collection('employee_reminders').insertOne(doc);
  } catch (err: any) {
    if (err?.code === 11000) return null; // Duplicate caught safely
    throw err;
  }

  // 2. Dispatch In-App Notifications
  // Notify HR/Admin
  try {
    await createNotification({
      organizationId,
      recipientType: 'ADMIN',
      targetScope: 'ROLE',
      targetId: 'ADMIN',
      eventType: `REMINDER_${category}_${reminderType}`,
      eventId: `rem:${category}:${reminderType}:${employeeId}:${targetDate}`,
      category: category === 'DOCUMENT_EXPIRY' ? 'DOCUMENT' : 'HR_EMPLOYEE',
      title,
      message: `${employeeName}: ${message}`,
      priority: daysRemaining <= 1 ? 'HIGH' : 'NORMAL',
      actionUrl: '/admin/reminders',
      metadata: { reminderId, employeeId, category, targetDate },
    });
  } catch (notifErr) {
    console.error(`[EmployeeReminders] In-App notification failed:`, notifErr);
  }

  // Notify Reporting Manager (for Probation, Anniversary, Joining)
  if (managerId && managerId !== employeeId && (category === 'PROBATION' || category === 'ANNIVERSARY' || category === 'JOINING')) {
    try {
      await createNotification({
        organizationId,
        recipientType: 'MANAGER',
        recipientId: managerId,
        targetScope: 'USER',
        targetId: managerId,
        eventType: `TEAM_REMINDER_${category}_${reminderType}`,
        eventId: `team-rem:${category}:${reminderType}:${employeeId}:${targetDate}`,
        category: 'HR_EMPLOYEE',
        title: `Team Member: ${title}`,
        message: `${employeeName}: ${message}`,
        priority: 'NORMAL',
        actionUrl: '/admin/reminders',
        metadata: { reminderId, employeeId, category, targetDate },
      });
    } catch {}
  }

  // Notify Employee (for Birthday, Work Anniversary, Document Expiry)
  if (category === 'BIRTHDAY' || category === 'ANNIVERSARY' || category === 'DOCUMENT_EXPIRY') {
    try {
      await createNotification({
        organizationId,
        recipientType: 'EMPLOYEE',
        recipientId: employeeId,
        targetScope: 'USER',
        targetId: employeeId,
        eventType: `EMP_REMINDER_${category}_${reminderType}`,
        eventId: `emp-rem:${category}:${reminderType}:${employeeId}:${targetDate}`,
        category: category === 'DOCUMENT_EXPIRY' ? 'DOCUMENT' : 'HR_EMPLOYEE',
        title,
        message,
        priority: 'NORMAL',
        actionUrl: category === 'DOCUMENT_EXPIRY' ? '/employee/documents' : '/employee/dashboard',
        metadata: { reminderId, employeeId, category, targetDate },
      });
    } catch {}
  }

  // 3. Dispatch Email Notification if configured
  if (employeeEmail && validateGmailConfig().valid) {
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div style="background-color: #0f172a; padding: 16px 20px; border-radius: 6px; margin-bottom: 20px;">
            <h2 style="color: #ffffff; margin: 0; font-size: 18px;">Infinitive Cloud HRMS - Alert & Reminder</h2>
          </div>
          <p style="font-size: 15px; color: #1e293b;">Dear <strong>${employeeName}</strong>,</p>
          <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #334155; font-size: 16px;">${title}</p>
            <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.5;">${message}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; width: 140px;">Employee ID:</td>
              <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${employeeCode || employeeId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Event Date:</td>
              <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${targetDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Timeline:</td>
              <td style="padding: 8px 0; color: #1e293b;">${formatDaysRemainingText(daysRemaining)}</td>
            </tr>
          </table>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">Infinitive Cloud HRMS Automated Reminders System</p>
        </div>
      `;

      await sendEmail({
        to: employeeEmail,
        subject: `[EMS Alert] ${title}`,
        html: emailHtml,
        text: `${title}\n\n${message}\nDate: ${targetDate}\nTimeline: ${formatDaysRemainingText(daysRemaining)}`,
      });

      await db.collection('employee_reminders').updateOne(
        { id: reminderId },
        { $addToSet: { notifiedVia: 'EMAIL' } }
      );
      doc.notifiedVia.push('EMAIL');
    } catch (e) {
      console.warn(`[EmployeeReminders] Email delivery notice:`, e);
    }
  }

  return doc;
}

/**
 * Main Reminder Detection Engine
 * Inspects all 4 categories and generates alerts
 */
export async function detectEmployeeReminders(options?: {
  organizationId?: string;
  todayDate?: string;
  dryRun?: boolean;
}): Promise<{
  success: boolean;
  todayDate: string;
  organizationId: string;
  createdCount: number;
  skippedCount: number;
  reminders: EmployeeReminderDoc[];
}> {
  const { db } = await connectToDatabase();
  const now = new Date();
  const todayIST = options?.todayDate || getISTDateString(now);
  const orgId = options?.organizationId && options.organizationId !== 'ALL'
    ? options.organizationId
    : 'org-default';

  const createdReminders: EmployeeReminderDoc[] = [];
  let skippedCount = 0;

  // 1. Fetch active/valid employees
  const employeeQuery: any = {
    status: { $nin: ['Terminated', 'Resigned', 'Former Employee', 'Inactive'] },
  };
  if (orgId && orgId !== 'ALL') {
    employeeQuery.organizationId = orgId;
  }
  const employees = await db.collection('employees').find(employeeQuery).toArray();

  // Load organization settings for default probation period (default 3 months)
  const orgSettings = await db.collection('organization_settings').findOne({ organizationId: orgId });
  const defaultProbationMonths = Number(orgSettings?.probationPeriodMonths || 3);

  // ---------------------------------------------------------
  // CATEGORY 1: Probation-End Reminders
  // Intervals: 30, 15, 7, 1 day before, and 0 days (due)
  // ---------------------------------------------------------
  const PROBATION_INTERVALS = [30, 15, 7, 1, 0];

  for (const emp of employees) {
    const empId = emp.employeeId || emp._id.toString();
    const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Employee';
    const empCode = emp.employeeId || empId;
    const dept = emp.department || 'General';
    const desig = emp.designation || 'Staff';
    const managerId = emp.managerId || emp.reportingTo;
    const avatar = emp.avatar;
    const empEmail = emp.email;

    // Check probation status - stop if already completed, confirmed, or extended
    const probStatus = emp.probationStatus || (emp.status === 'Probation' ? 'In Probation' : 'In Probation');
    if (probStatus === 'Completed' || probStatus === 'Confirmed') {
      continue;
    }

    const joiningDate = emp.joiningDate || emp.dateOfJoining;
    if (!joiningDate) continue;

    const probMonths = Number(emp.probationPeriodMonths || defaultProbationMonths);
    const probationEndDate = emp.probationEndDate || calculateProbationEndDate(joiningDate, probMonths);

    if (probationEndDate) {
      const daysRemaining = getDaysDifference(probationEndDate, todayIST);

      if (PROBATION_INTERVALS.includes(daysRemaining) || (daysRemaining < 0 && daysRemaining >= -7)) {
        let reminderType = `PROBATION_${daysRemaining}D`;
        let status: ReminderStatus = 'UPCOMING';

        if (daysRemaining === 0) {
          reminderType = 'PROBATION_DUE';
          status = 'PENDING';
        } else if (daysRemaining < 0) {
          reminderType = 'PROBATION_OVERDUE';
          status = 'EXPIRED';
        } else if (daysRemaining <= 7) {
          status = 'EXPIRING_SOON';
        }

        const title = daysRemaining === 0
          ? `Probation Period Ends Today for ${empName}`
          : daysRemaining < 0
          ? `Probation Review Overdue for ${empName}`
          : `Probation Review Reminder (${daysRemaining} Days Remaining)`;

        const message = daysRemaining === 0
          ? `Probation period for ${empName} (${empCode}) ends today (${probationEndDate}). Please complete the probation review, extend, or initiate confirmation.`
          : daysRemaining < 0
          ? `Probation period for ${empName} ended on ${probationEndDate} (${Math.abs(daysRemaining)} days ago). Urgent confirmation or extension action required.`
          : `Probation period for ${empName} (${empCode}) ends on ${probationEndDate} (${daysRemaining} days remaining). Please prepare the performance review.`;

        if (!options?.dryRun) {
          const res = await dispatchReminder(db, {
            organizationId: emp.organizationId || orgId,
            employeeId: empId,
            employeeName: empName,
            employeeCode: empCode,
            department: dept,
            designation: desig,
            managerId,
            avatar,
            category: 'PROBATION',
            reminderType,
            targetDate: probationEndDate,
            reminderDate: todayIST,
            daysRemaining,
            title,
            message,
            status,
            joiningDate,
            probationEndDate,
            probationPeriodMonths: probMonths,
            probationStatus: probStatus,
            employeeEmail: empEmail,
          });
          if (res) createdReminders.push(res);
          else skippedCount++;
        }
      }
    }
  }

  // ---------------------------------------------------------
  // CATEGORY 2: Birthday & Work Anniversary Reminders
  // Intervals: 1 day before and on the day (0 days)
  // ---------------------------------------------------------
  const CELEBRATION_INTERVALS = [1, 0];

  for (const emp of employees) {
    const empId = emp.employeeId || emp._id.toString();
    const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Employee';
    const empCode = emp.employeeId || empId;
    const dept = emp.department || 'General';
    const desig = emp.designation || 'Staff';
    const managerId = emp.managerId || emp.reportingTo;
    const avatar = emp.avatar;
    const empEmail = emp.email;

    // 2a. Birthday Reminders
    const dob = emp.dateOfBirth || emp.dob;
    if (dob) {
      const bInfo = getNextBirthdayDate(dob, todayIST);
      if (bInfo && CELEBRATION_INTERVALS.includes(bInfo.daysRemaining)) {
        const reminderType = bInfo.daysRemaining === 0 ? 'BIRTHDAY_TODAY' : 'BIRTHDAY_EVE';
        const title = bInfo.daysRemaining === 0
          ? `Happy Birthday, ${empName}! 🎂`
          : `Upcoming Birthday: ${empName} Tomorrow! 🎉`;
        const message = bInfo.daysRemaining === 0
          ? `Wishing ${empName} (${dept}) a fantastic and joyous birthday today!`
          : `${empName} celebrates their birthday tomorrow (${bInfo.birthdayDate}). Get ready to send warm wishes!`;

        if (!options?.dryRun) {
          const res = await dispatchReminder(db, {
            organizationId: emp.organizationId || orgId,
            employeeId: empId,
            employeeName: empName,
            employeeCode: empCode,
            department: dept,
            designation: desig,
            managerId,
            avatar,
            category: 'BIRTHDAY',
            reminderType,
            targetDate: bInfo.birthdayDate,
            reminderDate: todayIST,
            daysRemaining: bInfo.daysRemaining,
            title,
            message,
            status: bInfo.daysRemaining === 0 ? 'SENT' : 'UPCOMING',
            employeeEmail: empEmail,
          });
          if (res) createdReminders.push(res);
          else skippedCount++;
        }
      }
    }

    // 2b. Work Anniversary Reminders
    const joiningDate = emp.joiningDate || emp.dateOfJoining;
    if (joiningDate) {
      const annInfo = getNextAnniversaryDate(joiningDate, todayIST);
      if (annInfo && CELEBRATION_INTERVALS.includes(annInfo.daysRemaining)) {
        const reminderType = annInfo.daysRemaining === 0 ? 'ANNIVERSARY_TODAY' : 'ANNIVERSARY_EVE';
        const title = annInfo.daysRemaining === 0
          ? `Happy ${annInfo.yearsCompleted}${getOrdinalSuffix(annInfo.yearsCompleted)} Work Anniversary, ${empName}! 🏆`
          : `Work Anniversary Tomorrow: ${empName} (${annInfo.yearsCompleted} Years)`;
        const message = annInfo.daysRemaining === 0
          ? `Congratulations to ${empName} on completing ${annInfo.yearsCompleted} year${annInfo.yearsCompleted === 1 ? '' : 's'} with Infinitive Cloud today!`
          : `${empName} marks their ${annInfo.yearsCompleted}${getOrdinalSuffix(annInfo.yearsCompleted)} work anniversary tomorrow. Celebrating dedication and excellence!`;

        if (!options?.dryRun) {
          const res = await dispatchReminder(db, {
            organizationId: emp.organizationId || orgId,
            employeeId: empId,
            employeeName: empName,
            employeeCode: empCode,
            department: dept,
            designation: desig,
            managerId,
            avatar,
            category: 'ANNIVERSARY',
            reminderType,
            targetDate: annInfo.anniversaryDate,
            reminderDate: todayIST,
            daysRemaining: annInfo.daysRemaining,
            title,
            message,
            status: annInfo.daysRemaining === 0 ? 'SENT' : 'UPCOMING',
            joiningDate,
            yearsOfService: annInfo.yearsCompleted,
            employeeEmail: empEmail,
          });
          if (res) createdReminders.push(res);
          else skippedCount++;
        }
      }
    }
  }

  // ---------------------------------------------------------
  // CATEGORY 3: Document Expiry Alerts
  // Intervals: 30, 15, 7, 1 day before, and overdue (<= 0)
  // ---------------------------------------------------------
  const DOC_INTERVALS = [30, 15, 7, 1, 0];
  const docQuery: any = {
    $or: [
      { expiryDate: { $exists: true, $nin: ['', null] } },
      { validUntil: { $exists: true, $nin: ['', null] } },
      { expiresAt: { $exists: true, $nin: ['', null] } },
    ],
  };
  if (orgId && orgId !== 'ALL') {
    docQuery.organizationId = orgId;
  }
  const documents = await db.collection('documents').find(docQuery).toArray();

  // Create lookup map for employees
  const empMap = new Map<string, any>();
  employees.forEach((e) => empMap.set(e.employeeId || e._id.toString(), e));

  for (const doc of documents) {
    const rawExpiry = doc.expiryDate || doc.validUntil || doc.expiresAt;
    const expiryStr = typeof rawExpiry === 'string' && rawExpiry.match(/^\d{4}-\d{2}-\d{2}/)
      ? rawExpiry.slice(0, 10)
      : null;

    if (!expiryStr) continue;

    const daysRemaining = getDaysDifference(expiryStr, todayIST);
    const emp = empMap.get(doc.employeeId) || {};
    const empName = doc.employeeName || emp.name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Employee';
    const empId = doc.employeeId || 'EMP-GEN';
    const docTitle = doc.title || doc.fileName || 'Employee Document';
    const docCategory = doc.category || 'Compliance';

    if (DOC_INTERVALS.includes(daysRemaining) || (daysRemaining < 0 && daysRemaining >= -30)) {
      let reminderType = `DOC_EXPIRY_${daysRemaining}D`;
      let status: ReminderStatus = 'UPCOMING';

      if (daysRemaining < 0) {
        reminderType = 'DOC_EXPIRED';
        status = 'EXPIRED';
      } else if (daysRemaining === 0) {
        reminderType = 'DOC_EXPIRY_TODAY';
        status = 'EXPIRED';
      } else if (daysRemaining <= 7) {
        status = 'EXPIRING_SOON';
      }

      const title = daysRemaining < 0
        ? `Expired Document: ${docTitle}`
        : daysRemaining === 0
        ? `Document Expires Today: ${docTitle}`
        : `Document Expiry Alert: ${docTitle} (${daysRemaining} Days Remaining)`;

      const message = daysRemaining < 0
        ? `${docTitle} for ${empName} expired on ${expiryStr} (${Math.abs(daysRemaining)} days ago). Please upload an updated renewal document immediately.`
        : daysRemaining === 0
        ? `${docTitle} for ${empName} expires today (${expiryStr}). Immediate renewal or verification required.`
        : `${docTitle} for ${empName} is scheduled to expire on ${expiryStr} (${daysRemaining} days remaining). Please prepare renewal paperwork.`;

      if (!options?.dryRun) {
        const res = await dispatchReminder(db, {
          organizationId: doc.organizationId || orgId,
          employeeId: empId,
          employeeName: empName,
          employeeCode: emp.employeeId || empId,
          department: emp.department || 'General',
          designation: emp.designation || 'Staff',
          managerId: emp.managerId || emp.reportingTo,
          avatar: emp.avatar,
          category: 'DOCUMENT_EXPIRY',
          reminderType,
          targetDate: expiryStr,
          reminderDate: todayIST,
          daysRemaining,
          title,
          message,
          status,
          documentId: doc._id.toString(),
          documentTitle: docTitle,
          documentCategory: docCategory,
          documentUrl: `/api/v1/documents/${doc._id.toString()}/file`,
          employeeEmail: emp.email,
        });
        if (res) createdReminders.push(res);
        else skippedCount++;
      }
    }
  }

  // ---------------------------------------------------------
  // CATEGORY 4: Joining-Date Reminders
  // Intervals: 1 day before and on joining date (0 days)
  // Only for upcoming / new joiners (joiningDate >= todayIST - 1 day)
  // ---------------------------------------------------------
  const JOINING_INTERVALS = [1, 0];

  for (const emp of employees) {
    const joiningDate = emp.joiningDate || emp.dateOfJoining;
    if (!joiningDate) continue;

    const diff = getDaysDifference(joiningDate, todayIST);
    // Only process new joiners who are joining tomorrow or today (or joined within past 3 days)
    if (JOINING_INTERVALS.includes(diff) || (diff < 0 && diff >= -3)) {
      const empId = emp.employeeId || emp._id.toString();
      const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'New Employee';
      const empCode = emp.employeeId || empId;
      const dept = emp.department || 'General';
      const desig = emp.designation || 'Staff';
      const managerId = emp.managerId || emp.reportingTo;
      const avatar = emp.avatar;
      const empEmail = emp.email;

      const reminderType = diff === 0 ? 'JOINING_TODAY' : diff === 1 ? 'JOINING_EVE' : 'JOINING_RECENT';
      const title = diff === 0
        ? `New Employee Joining Today: ${empName} 🚀`
        : diff === 1
        ? `New Employee Joining Tomorrow: ${empName}`
        : `Recent Joiner Onboarding: ${empName}`;

      const message = diff === 0
        ? `${empName} joins today as ${desig} in ${dept}. Please ensure workspace, credentials, and induction checklist are ready.`
        : `${empName} joins tomorrow (${joiningDate}) as ${desig} in ${dept}. Please verify onboarding checklist and system setup.`;

      const onboardingChecklist = emp.onboardingChecklist || [
        { task: 'ID & Document Verification', completed: Boolean(emp.documentsUploaded) },
        { task: 'Email & System Account Setup', completed: Boolean(emp.emailVerified) },
        { task: 'Company Induction & Policy Briefing', completed: false },
        { task: 'IT Hardware & Asset Allocation', completed: false },
        { task: 'Reporting Manager Introduction', completed: false },
      ];

      if (!options?.dryRun) {
        const res = await dispatchReminder(db, {
          organizationId: emp.organizationId || orgId,
          employeeId: empId,
          employeeName: empName,
          employeeCode: empCode,
          department: dept,
          designation: desig,
          managerId,
          avatar,
          category: 'JOINING',
          reminderType,
          targetDate: joiningDate,
          reminderDate: todayIST,
          daysRemaining: diff,
          title,
          message,
          status: diff === 0 ? 'PENDING' : 'UPCOMING',
          joiningDate,
          onboardingStatus: emp.onboardingStatus || 'IN_PROGRESS',
          onboardingChecklist,
          employeeEmail: empEmail,
        });
        if (res) createdReminders.push(res);
        else skippedCount++;
      }
    }
  }

  return {
    success: true,
    todayDate: todayIST,
    organizationId: orgId,
    createdCount: createdReminders.length,
    skippedCount,
    reminders: createdReminders,
  };
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

