import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(customParseFormat);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(utc);
dayjs.extend(timezone);

export interface OverdueCalculationParams {
  clockIn: string | null | undefined;
  clockOut: string | null | undefined;
  date: string; // YYYY-MM-DD
  shiftEndTime?: string; // e.g. "06:00 PM" or "18:00"
  gracePeriodMinutes?: number; // default: 30 minutes
  currentTime?: Date | string | dayjs.Dayjs; // defaults to current time
  timeZone?: string; // default: 'Asia/Kolkata'
}

export interface OverdueCalculationResult {
  isOverdue: boolean;
  overdueMinutes: number;
  formattedOverdue: string;
  status: 'In Progress' | 'Completed' | 'Missing Check-out' | 'Not Marked';
  shiftEndTimeFormatted: string;
  graceCutoffFormatted: string;
}

/**
 * Parses a shift end time string (12-hour or 24-hour) into hour and minute components.
 */
export function parseShiftEndTime(timeStr?: string): { hour: number; minute: number } {
  const normalized = (timeStr || '06:00 PM').trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) {
    return { hour: 18, minute: 0 };
  }

  let [, h, m, mod] = match;
  let hour = parseInt(h, 10);
  const minute = parseInt(m, 10);

  if (mod) {
    const isPM = mod.toUpperCase() === 'PM';
    const isAM = mod.toUpperCase() === 'AM';
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
  }

  return {
    hour: Math.min(23, Math.max(0, hour)),
    minute: Math.min(59, Math.max(0, minute)),
  };
}

/**
 * Accurately determines if an employee's check-out is overdue and calculates overdue time.
 * An active check-in is NOT flagged as overdue until the shift end time and grace period have passed.
 *
 * @param params OverdueCalculationParams
 * @returns OverdueCalculationResult
 */
export function calculateOverdueTime({
  clockIn,
  clockOut,
  date,
  shiftEndTime = '06:00 PM',
  gracePeriodMinutes = 30,
  currentTime,
  timeZone = 'Asia/Kolkata',
}: OverdueCalculationParams): OverdueCalculationResult {
  const cleanClockIn = typeof clockIn === 'string' ? clockIn.trim() : '';
  const cleanClockOut = typeof clockOut === 'string' ? clockOut.trim() : '';

  // 1. If employee already clocked out, shift is completed (not overdue)
  if (cleanClockOut && cleanClockOut !== '--:--') {
    return {
      isOverdue: false,
      overdueMinutes: 0,
      formattedOverdue: '',
      status: 'Completed',
      shiftEndTimeFormatted: shiftEndTime,
      graceCutoffFormatted: '',
    };
  }

  // 2. If employee never clocked in, no check-in occurred
  if (!cleanClockIn || cleanClockIn === '--:--') {
    return {
      isOverdue: false,
      overdueMinutes: 0,
      formattedOverdue: '',
      status: 'Not Marked',
      shiftEndTimeFormatted: shiftEndTime,
      graceCutoffFormatted: '',
    };
  }

  // 3. Resolve shift end time and cutoff time with grace period in the target timezone
  const { hour, minute } = parseShiftEndTime(shiftEndTime);
  const pad = (n: number) => String(n).padStart(2, '0');

  // Build Day.js object anchored to the record's date and shift end time
  const shiftEnd = dayjs.tz(`${date} ${pad(hour)}:${pad(minute)}:00`, 'YYYY-MM-DD HH:mm:ss', timeZone);
  const graceCutoff = shiftEnd.add(gracePeriodMinutes, 'minute');
  const now = currentTime ? dayjs(currentTime).tz(timeZone) : dayjs().tz(timeZone);

  // 4. Shift is still ongoing: now is strictly before the shift end time + grace period
  if (now.isBefore(graceCutoff)) {
    return {
      isOverdue: false,
      overdueMinutes: 0,
      formattedOverdue: '',
      status: 'In Progress',
      shiftEndTimeFormatted: shiftEnd.format('hh:mm A'),
      graceCutoffFormatted: graceCutoff.format('hh:mm A'),
    };
  }

  // 5. Shift end time + grace period has passed: calculate overdue time
  const overdueMinutes = Math.max(0, now.diff(shiftEnd, 'minute'));
  const hours = Math.floor(overdueMinutes / 60);
  const mins = overdueMinutes % 60;
  const formattedOverdue = hours > 0 ? `${hours}h ${mins}m overdue` : `${mins}m overdue`;

  return {
    isOverdue: true,
    overdueMinutes,
    formattedOverdue,
    status: 'Missing Check-out',
    shiftEndTimeFormatted: shiftEnd.format('hh:mm A'),
    graceCutoffFormatted: graceCutoff.format('hh:mm A'),
  };
}

