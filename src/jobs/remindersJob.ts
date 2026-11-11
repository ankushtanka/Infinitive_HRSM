import cron, { ScheduledTask } from 'node-cron';
import { detectEmployeeReminders } from '@/lib/employeeReminders';

// Global singleton reference for Next.js hot-reloads in development
declare global {
  // eslint-disable-next-line no-var
  var __employeeRemindersCronJob: ScheduledTask | undefined;
}

/**
 * Runs the employee reminder check across organizations.
 */
export async function performEmployeeRemindersCheck(options?: {
  todayDate?: string;
  organizationId?: string;
}) {
  return await detectEmployeeReminders({
    todayDate: options?.todayDate,
    organizationId: options?.organizationId || 'org-default',
  });
}

/**
 * Initializes and starts the background daily employee reminders job via node-cron.
 * Runs every day at 00:05:00 (5 minutes past midnight) in India Standard Time (Asia/Kolkata).
 */
export function startEmployeeRemindersCronJob(): ScheduledTask {
  if (globalThis.__employeeRemindersCronJob) {
    return globalThis.__employeeRemindersCronJob;
  }

  // Cron Expression: "5 0 * * *" -> At 00:05 every day
  const task = cron.schedule(
    '5 0 * * *',
    async () => {
      console.log(`[EmployeeReminders] Running daily reminder check at ${new Date().toISOString()}...`);
      try {
        const result = await performEmployeeRemindersCheck();
        console.log(
          `[EmployeeReminders] Check finished: generated ${result.createdCount} new reminders (${result.skippedCount} skipped/duplicates).`
        );
      } catch (error) {
        console.error('[EmployeeReminders] Unhandled error during scheduled check:', error);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  globalThis.__employeeRemindersCronJob = task;
  console.log('[EmployeeReminders] Automated reminders cron job registered (5 0 * * * Asia/Kolkata).');

  return task;
}

