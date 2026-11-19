/**
 * Employment type + internship helpers, shared by API routes and client forms.
 *
 * Stored data uses several spellings ("Full-time" / "Full Time", "Intern" / "Internship"),
 * and some records mark interns through `status: 'Intern'` instead of the employment type.
 * Everything that needs to know "is this person an intern?" should go through these helpers.
 */
import type { EmploymentType } from '@/types/admin';
import { isInternRole } from '@/lib/roleUtils';

/** Stored on employee records whose employment type is Intern (`employee.internship`). */
export interface InternshipDetails {
  /** YYYY-MM-DD */
  startDate: string;
  /** Planned end date, YYYY-MM-DD */
  endDate: string;
  /** System-managed: end date after leave-based extensions, YYYY-MM-DD */
  extendedEndDate?: string;
  /** College / institute */
  institute?: string;
  /** Monthly stipend in INR */
  stipend?: number;
}

export const EMPLOYMENT_TYPES: EmploymentType[] = ['Full-time', 'Part-time', 'Contract', 'Intern', 'Temporary'];

const EMPLOYMENT_TYPE_ALIASES: Record<string, EmploymentType> = {
  fulltime: 'Full-time',
  permanent: 'Full-time',
  parttime: 'Part-time',
  contract: 'Contract',
  contractual: 'Contract',
  intern: 'Intern',
  internship: 'Intern',
  temporary: 'Temporary',
  temp: 'Temporary',
};

/** Canonical employment type for any stored/submitted spelling, or null when unrecognised. */
export function normalizeEmploymentType(value: unknown): EmploymentType | null {
  if (typeof value !== 'string') return null;
  const key = value.toLowerCase().replace(/[^a-z]/g, '');
  return EMPLOYMENT_TYPE_ALIASES[key] ?? null;
}

/** True for interns: role INTERN, employment type Intern (any spelling), or the legacy 'Intern' status. */
export function isInternRecord(
  emp: { employmentType?: unknown; status?: unknown; role?: unknown } | null | undefined
): boolean {
  if (!emp) return false;
  if (typeof emp.role === 'string' && isInternRole(emp.role)) return true;
  if (normalizeEmploymentType(emp.employmentType) === 'Intern') return true;
  return typeof emp.status === 'string' && emp.status.trim().toLowerCase() === 'intern';
}

/** Regex per canonical type that matches every stored spelling (used for MongoDB filters). */
const EMPLOYMENT_TYPE_PATTERNS: Record<EmploymentType, string> = {
  'Full-time': '^\\s*(full[\\s_-]*time|permanent)\\s*$',
  'Part-time': '^\\s*part[\\s_-]*time\\s*$',
  Contract: '^\\s*contract(ual)?\\s*$',
  Intern: '^\\s*intern(ship)?\\s*$',
  Temporary: '^\\s*temp(orary)?\\s*$',
};

/**
 * MongoDB condition selecting employees of the given type, whatever spelling they were saved with.
 * Interns also include records with role INTERN or the legacy `status: 'Intern'`. Returns null for unknown types.
 */
export function employmentTypeMongoFilter(value: unknown): Record<string, any> | null {
  const type = normalizeEmploymentType(value);
  if (!type) return null;
  const typeCondition = { employmentType: { $regex: EMPLOYMENT_TYPE_PATTERNS[type], $options: 'i' } };
  if (type === 'Intern') {
    return {
      $or: [
        typeCondition,
        { role: { $regex: '^\\s*intern(ship)?\\s*$', $options: 'i' } },
        { status: { $regex: '^\\s*intern\\s*$', $options: 'i' } },
      ],
    };
  }
  return typeCondition;
}

// ---------------------------------------------------------------------------
// Internship details
// ---------------------------------------------------------------------------

/** Form-friendly shape (all strings) used by the intern forms. */
export interface InternshipDraft {
  startDate: string;
  endDate: string;
  institute: string;
  stipend: string;
}

export const EMPTY_INTERNSHIP_DRAFT: InternshipDraft = { startDate: '', endDate: '', institute: '', stipend: '' };

export function internshipToDraft(details?: Partial<InternshipDetails> | null): InternshipDraft {
  return {
    startDate: details?.startDate || '',
    endDate: details?.endDate || '',
    institute: details?.institute || '',
    stipend: details?.stipend !== undefined && details?.stipend !== null ? String(details.stipend) : '',
  };
}

const MAX_INTERNSHIP_DAYS = 730;
const MAX_INSTITUTE_LENGTH = 150;
const MAX_STIPEND = 10_000_000;

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Whole days from `start` to `end` (both YYYY-MM-DD); negative when end is before start. */
export function daysBetween(start: string, end: string): number {
  const ms = new Date(`${end}T00:00:00.000Z`).getTime() - new Date(`${start}T00:00:00.000Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** Default internship length used when no custom end date is chosen. */
export const DEFAULT_INTERNSHIP_MONTHS = 3;

/**
 * Same calendar day `months` later (YYYY-MM-DD). When that day does not exist,
 * the last day of the month is used (30 Nov + 3 months = 28 Feb). Null for an invalid date.
 */
export function addMonthsToIsoDate(iso: string, months: number): string | null {
  if (!isValidIsoDate(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const monthIndex = month - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

/** Default end date for an internship starting on `startDate`: 3 months later. */
export function defaultInternshipEndDate(startDate: string): string | null {
  return addMonthsToIsoDate(startDate, DEFAULT_INTERNSHIP_MONTHS);
}

/** Readable length, e.g. "3 months", "3 months 10 days", "45 days". Null when the dates are invalid. */
export function describeInternshipDuration(startDate: string, endDate: string): string | null {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || endDate <= startDate) return null;
  let months = 0;
  while (months < 36) {
    const next = addMonthsToIsoDate(startDate, months + 1);
    if (!next || next > endDate) break;
    months++;
  }
  const anchor = months ? addMonthsToIsoDate(startDate, months) || startDate : startDate;
  const days = daysBetween(anchor, endDate);
  const parts: string[] = [];
  if (months) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export type InternshipValidation =
  | { ok: true; value: InternshipDetails }
  | { ok: false; message: string };

/**
 * Validates and cleans submitted internship details. A missing end date defaults to 3 months after the start.
 * `extendedEndDate` is never taken from input — it is system-managed (leave-based extension).
 */
export function sanitizeInternship(input: unknown, fallbackStartDate?: string): InternshipValidation {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: 'Internship details are required for interns.' };
  }
  const raw = input as Record<string, unknown>;

  const startCandidate = typeof raw.startDate === 'string' && raw.startDate.trim() ? raw.startDate.trim() : fallbackStartDate;
  if (!isValidIsoDate(startCandidate)) {
    return { ok: false, message: 'Internship start date is required (YYYY-MM-DD).' };
  }
  const startDate = startCandidate;

  // No end date chosen: default to 3 months after the start date
  const submittedEnd = typeof raw.endDate === 'string' ? raw.endDate.trim() : '';
  const endDate = submittedEnd || defaultInternshipEndDate(startDate) || '';
  if (!isValidIsoDate(endDate)) {
    return { ok: false, message: 'Internship end date is not a valid date (YYYY-MM-DD).' };
  }
  const span = daysBetween(startDate, endDate);
  if (span <= 0) {
    return { ok: false, message: 'Internship end date must be after the start date.' };
  }
  if (span > MAX_INTERNSHIP_DAYS) {
    return { ok: false, message: 'Internship duration cannot be longer than 2 years. Please check the dates.' };
  }

  const institute = typeof raw.institute === 'string' ? raw.institute.trim() : '';
  if (institute.length > MAX_INSTITUTE_LENGTH) {
    return { ok: false, message: `College / institute name must be at most ${MAX_INSTITUTE_LENGTH} characters.` };
  }

  let stipend: number | undefined;
  const rawStipend = raw.stipend;
  if (rawStipend !== undefined && rawStipend !== null && String(rawStipend).trim() !== '') {
    const n = Number(String(rawStipend).replace(/,/g, '').trim());
    if (!Number.isFinite(n) || n < 0 || n > MAX_STIPEND) {
      return { ok: false, message: 'Monthly stipend must be a valid non-negative amount.' };
    }
    stipend = Math.round(n * 100) / 100;
  }

  return {
    ok: true,
    value: {
      startDate,
      endDate,
      ...(institute ? { institute } : {}),
      ...(stipend !== undefined ? { stipend } : {}),
    },
  };
}

/** The date the internship actually ends: the extended date when leave pushed it out, else the planned one. */
export function effectiveInternshipEndDate(details?: Partial<InternshipDetails> | null): string | null {
  if (!details) return null;
  return details.extendedEndDate || details.endDate || null;
}