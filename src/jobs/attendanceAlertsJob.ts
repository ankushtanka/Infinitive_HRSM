import cron, { ScheduledTask } from 'node-cron';
import { detectAttendanceAlerts, DetectionResult } from '@/lib/attendanceAlerts';

// Global singleton reference for Next.js hot-reloads in development
declare global {
  // eslint-disable-next-line no-var
  var __attendanceAlertsCronJob: ScheduledTask | undefined;
}

/**
 * Runs the attendance alert detection across organizations.
 */
export async function performAttendanceAlertsCheck(options?: {
  targetDate?: string;
  organizationId?: string;
}): Promise<DetectionResult> {
  return await detectAttendanceAlerts({
    targetDate: options?.targetDate,
    organizationId: options?.organizationId || 'org-default',
  });
}

/**
 * Initializes and starts the background attendance alerts detection job via node-cron.
 * Runs every 30 minutes (e.g. at :00 and :30) in India Standard Time (Asia/Kolkata).
 */
export function startAttendanceAlertsCronJob(): ScheduledTask {
  if (globalThis.__attendanceAlertsCronJob) {
    return globalThis.__attendanceAlertsCronJob;
  }

  // Cron Expression: "*/30 * * * *" -> Every 30 minutes
  const task = cron.schedule(
    '*/30 * * * *',
    async () => {
      console.log(`[AttendanceAlerts] Running automated attendance alert check at ${new Date().toISOString()}...`);
      try {
        const result = await performAttendanceAlertsCheck();
        console.log(
          `[AttendanceAlerts] Detection completed: processed ${result.processedEmployees} employees, generated ${result.createdAlerts} alerts (${result.skippedAlerts} skipped/duplicate).`
        );
      } catch (error) {
        console.error('[AttendanceAlerts] Unhandled error during scheduled check:', error);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  globalThis.__attendanceAlertsCronJob = task;
  console.log('[AttendanceAlerts] Automated attendance alerts cron job registered (*/30 * * * * Asia/Kolkata).');

  return task;
}

