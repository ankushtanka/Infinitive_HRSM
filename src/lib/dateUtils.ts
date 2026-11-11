/**
 * Centralized India Standard Time (IST - Asia/Kolkata) Date & Time Utilities
 */

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Parses any valid input (Date, ISO string, epoch millis, or formatted string) into a valid Date object.
 */
export function parseDateInput(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // ISO string or full date string parseable directly by Date constructor
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;

    // Handle "YYYY-MM-DD" string
    const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const [, y, m, day] = dateMatch;
      const parsed = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(day, 10));
      return isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

/**
 * Returns current or specified date formatted as YYYY-MM-DD in India Standard Time (Asia/Kolkata).
 */
export function getISTDateString(value: unknown = new Date()): string {
  const d = parseDateInput(value) || new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: IST_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch (err) {
    console.error('Error formatting IST date string:', err);
  }

  return d.toISOString().split('T')[0];
}

/**
 * Returns current or specified time formatted as "hh:mm AM/PM" in India Standard Time (Asia/Kolkata).
 */
export function getISTTimeString(value: unknown = new Date()): string {
  const d = parseDateInput(value) || new Date();
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: IST_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch (err) {
    console.error('Error formatting IST time string:', err);
    return '--:--';
  }
}

/**
 * Formats any date/timestamp or time string safely into "hh:mm AM/PM" in IST.
 * If given a legacy string like "09:30 AM" or "9:30 AM", formats cleanly without double conversion.
 */
export function formatISTTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return '--:--';

  // If already a clean 12-hour AM/PM string like "09:30 AM" or "9:30 AM" or "1:00 PM"
  if (typeof value === 'string') {
    const ampmMatch = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if (ampmMatch) {
      const [, h, m, mod] = ampmMatch;
      const formattedH = h.padStart(2, '0');
      return `${formattedH}:${m} ${mod.toUpperCase()}`;
    }

    // 24-hour time string like "09:30" or "18:30"
    const hhmmMatch = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (hhmmMatch) {
      let h = parseInt(hhmmMatch[1], 10);
      const m = hhmmMatch[2];
      const mod = h >= 12 ? 'PM' : 'AM';
      if (h > 12) h -= 12;
      if (h === 0) h = 12;
      const formattedH = String(h).padStart(2, '0');
      return `${formattedH}:${m} ${mod}`;
    }
  }

  // Try parsing as Date / ISO timestamp
  const dateObj = parseDateInput(value);
  if (dateObj) {
    return getISTTimeString(dateObj);
  }

  return String(value);
}

/**
 * Formats any date/timestamp safely into "YYYY-MM-DD" in IST.
 */
export function formatISTDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '--';
  const dateObj = parseDateInput(value);
  if (dateObj) {
    return getISTDateString(dateObj);
  }
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return value;
  }
  return String(value);
}

/**
 * Returns date formatted as YYYY-MM in India Standard Time for month filtering.
 */
export function getISTMonthString(value: unknown = new Date()): string {
  const d = parseDateInput(value) || new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: IST_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(d);

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;

    if (year && month) {
      return `${year}-${month}`;
    }
  } catch (err) {
    console.error('Error formatting IST month string:', err);
  }
  return d.toISOString().substring(0, 7);
}

/**
 * Calculates working hours accurately from checkInTime and checkOutTime timestamps.
 * Returns duration in hours rounded to 1 decimal place (e.g. 8.5).
 */
export function calculateWorkingHours(
  checkInTime?: unknown,
  checkOutTime?: unknown,
  fallbackCheckInStr?: string,
  fallbackCheckOutStr?: string
): number {
  const inDate = parseDateInput(checkInTime);
  const outDate = parseDateInput(checkOutTime);

  if (inDate && outDate) {
    const diffMs = outDate.getTime() - inDate.getTime();
    if (diffMs > 0) {
      const hours = diffMs / (1000 * 60 * 60);
      return Math.max(0.1, Math.round(hours * 10) / 10);
    }
  }

  // Fallback: Try parsing formatted time strings if timestamps are absent
  if (fallbackCheckInStr && fallbackCheckOutStr) {
    try {
      const parseTimeStrToMinutes = (str: string): number | null => {
        const match = str.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
        if (!match) return null;
        let [, hStr, mStr, mod] = match;
        let h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        if (mod) {
          const isPM = mod.toUpperCase() === 'PM';
          if (isPM && h < 12) h += 12;
          if (!isPM && h === 12) h = 0;
        }
        return h * 60 + m;
      };

      const inMins = parseTimeStrToMinutes(fallbackCheckInStr);
      const outMins = parseTimeStrToMinutes(fallbackCheckOutStr);

      if (inMins !== null && outMins !== null && outMins > inMins) {
        const diffMins = outMins - inMins;
        const hours = diffMins / 60;
        return Math.max(0.1, Math.round(hours * 10) / 10);
      }
    } catch {
      // Fallback ignore error
    }
  }

  return 0;
}

/**
 * Formats working hours into a clean string with a single "hrs" suffix (e.g. "8.5 hrs" or "0 hrs").
 */
export function formatWorkingHours(hours?: unknown): string {
  if (hours === null || hours === undefined || hours === '') return '--';
  const num = typeof hours === 'number' ? hours : parseFloat(String(hours).replace(/[^\d.]/g, ''));
  if (isNaN(num) || num < 0) return '--';
  const rounded = Math.round(num * 10) / 10;
  return `${rounded} hrs`;
}
