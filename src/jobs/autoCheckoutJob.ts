import cron, { ScheduledTask } from 'node-cron';
import { connectToDatabase } from '@/lib/mongodb';
import {
  getISTDateString,
  formatISTTime,
  calculateWorkingHours,
} from '@/lib/dateUtils';
import { loadAttendanceRules } from '@/lib/geo';

export interface AutoCheckoutResult {
  success: boolean;
  message: string;
  processedCount: number;
  updatedCount: number;
  records: Array<{
    id: string;
    employeeId: string;
    date: string;
    clockIn: string;
    clockOut: string;
    workingHours: number;
  }>;
}

/**
 * Performs auto-checkout for all unclosed shifts strictly in the past (date < todayIST).
 * Cleans up open records where checkIn exists but checkOut was never recorded.
 *
 * @param options.targetDate Optional specific date (YYYY-MM-DD) to clean up. Defaults to all dates before today.
 * @param options.organizationId Optional orgId filter.
 */
export async function performAutoCheckout(options?: {
  targetDate?: string;
  organizationId?: string;
}): Promise<AutoCheckoutResult> {
  const { db } = await connectToDatabase();
  const now = new Date();
  const todayIST = getISTDateString(now);

  const query: any = {
    $or: [
      { checkIn: { $exists: true, $nin: ['', null] } },
      { clockIn: { $exists: true, $nin: ['', null] } },
    ],
    $and: [
      { $or: [{ checkOut: { $exists: false } }, { checkOut: '' }, { checkOut: null }] },
      { $or: [{ clockOut: { $exists: false } }, { clockOut: '' }, { clockOut: null }] },
    ],
    status: { $nin: ['On Leave', 'Absent', 'on_leave', 'absent'] },
  };

  if (options?.targetDate) {
    query.date = options.targetDate;
  } else {
    // Only clean up shifts from past dates (strictly before today IST)
    query.date = { $lt: todayIST };
  }

  if (options?.organizationId) {
    query.organizationId = options.organizationId;
  }

  const unclosedDocs = await db.collection('attendance').find(query).toArray();

  if (unclosedDocs.length === 0) {
    return {
      success: true,
      message: 'No unclosed shifts found to clean up.',
      processedCount: 0,
      updatedCount: 0,
      records: [],
    };
  }

  // Cache organization rules to avoid redundant queries
  const orgRulesCache = new Map<string, any>();

  const updatedRecords: AutoCheckoutResult['records'] = [];

  for (const doc of unclosedDocs) {
    try {
      const orgId = doc.organizationId || 'default-org';
      if (!orgRulesCache.has(orgId)) {
        const rules = await loadAttendanceRules(db, orgId);
        orgRulesCache.set(orgId, rules);
      }
      const rules = orgRulesCache.get(orgId);

      // Determine the designated auto-checkout time (e.g. "11:59 PM" or shift's "06:00 PM")
      const autoCheckoutTimeStr = rules?.autoCheckoutTime || rules?.workEndTime || '11:59 PM';
      const formattedCheckoutTime = formatISTTime(autoCheckoutTimeStr);

      const checkInVal = doc.checkIn || doc.clockIn;
      const checkInTimeObj = doc.checkInTime || doc.createdAt || `${doc.date}T09:00:00+05:30`;

      // Build checkout ISO timestamp on that specific record's date in IST (+05:30)
      const is1159 = autoCheckoutTimeStr.includes('11:59');
      const checkoutTimeIso = is1159
        ? `${doc.date}T23:59:00+05:30`
        : `${doc.date}T18:00:00+05:30`;
      const checkoutDateObj = new Date(checkoutTimeIso);

      // Calculate working hours safely
      const computedHours = calculateWorkingHours(
        checkInTimeObj,
        checkoutDateObj,
        checkInVal,
        formattedCheckoutTime
      );

      const roundedHours = Math.round(computedHours * 10) / 10;

      // Update the attendance record with auto-checkout details
      await db.collection('attendance').updateOne(
        { _id: doc._id },
        {
          $set: {
            checkOut: formattedCheckoutTime,
            clockOut: formattedCheckoutTime,
            checkOutTime: checkoutDateObj,
            workingHours: roundedHours,
            isAutoCheckedOut: true,
            autoCheckedOutAt: now,
            remarks: doc.remarks
              ? `${doc.remarks} • System auto-checkout at midnight (Shift unclosed)`
              : 'System auto-checkout at midnight (Shift unclosed)',
            updatedAt: now,
          },
        }
      );

      updatedRecords.push({
        id: doc._id.toString(),
        employeeId: doc.employeeId,
        date: doc.date,
        clockIn: checkInVal,
        clockOut: formattedCheckoutTime,
        workingHours: roundedHours,
      });
    } catch (docErr) {
      console.error(`[AutoCheckout] Failed to process record ${doc._id}:`, docErr);
    }
  }

  return {
    success: true,
    message: `Auto-checkout successfully closed ${updatedRecords.length} unclosed shift(s).`,
    processedCount: unclosedDocs.length,
    updatedCount: updatedRecords.length,
    records: updatedRecords,
  };
}

// Global singleton reference for Next.js hot-reloads in development
declare global {
  // eslint-disable-next-line no-var
  var __autoCheckoutCronJob: ScheduledTask | undefined;
}

/**
 * Initializes and starts the daily midnight auto-checkout background job via node-cron.
 * Runs every day at 00:00:00 (Midnight) India Standard Time (Asia/Kolkata).
 */
export function startAutoCheckoutCronJob(): ScheduledTask {
  if (globalThis.__autoCheckoutCronJob) {
    return globalThis.__autoCheckoutCronJob;
  }

  // Cron Expression: "0 0 * * *" -> At 00:00:00 every day
  const task = cron.schedule(
    '0 0 * * *',
    async () => {
      console.log(`[AutoCheckout] Running daily midnight auto-checkout job at ${new Date().toISOString()}...`);
      try {
        const result = await performAutoCheckout();
        console.log(`[AutoCheckout] Finished daily job: ${result.message}`);
      } catch (error) {
        console.error('[AutoCheckout] Unhandled error during midnight cron job:', error);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  globalThis.__autoCheckoutCronJob = task;
  console.log('[AutoCheckout] Midnight auto-checkout cron job registered (0 0 * * * Asia/Kolkata).');

  return task;
}

