/**
 * Pushes an intern's internship end date out by a number of days (WFH rejected and not in office,
 * leave over the monthly limit, ...). Every extension is recorded once per source, so running the same
 * rule twice never extends twice.
 */
import type { Db } from 'mongodb';
import { isInternRecord, isValidIsoDate } from '@/lib/employmentType';

export interface InternshipExtensionEntry {
  days: number;
  reason: string;
  sourceType: string;
  sourceId: string;
  previousEndDate: string;
  newEndDate: string;
  createdAt: Date;
}

/** YYYY-MM-DD plus `days` calendar days. */
export function addDaysToIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Sum of all recorded extension days. */
export function totalExtensionDays(extensions: unknown): number {
  if (!Array.isArray(extensions)) return 0;
  return extensions.reduce((sum: number, e: any) => sum + (Number(e?.days) > 0 ? Number(e.days) : 0), 0);
}

export type ExtensionResult =
  | { applied: true; newEndDate: string; previousEndDate: string }
  | { applied: false; reason: 'NOT_INTERN' | 'NO_END_DATE' | 'ALREADY_APPLIED' | 'NOT_FOUND' };

export async function extendInternship(
  db: Db,
  params: { organizationId: string; employeeId: string; days: number; reason: string; sourceType: string; sourceId: string; now?: Date }
): Promise<ExtensionResult> {
  const { organizationId, employeeId, days, reason, sourceType, sourceId } = params;
  const now = params.now || new Date();
  const employee: any = await db.collection('employees').findOne({ organizationId, employeeId });
  if (!employee) return { applied: false, reason: 'NOT_FOUND' };
  if (!isInternRecord(employee)) return { applied: false, reason: 'NOT_INTERN' };

  const internship = employee.internship || {};
  const existing: InternshipExtensionEntry[] = Array.isArray(internship.extensions) ? internship.extensions : [];
  if (existing.some((e) => e.sourceType === sourceType && e.sourceId === sourceId)) {
    return { applied: false, reason: 'ALREADY_APPLIED' };
  }

  if (!isValidIsoDate(internship.endDate)) return { applied: false, reason: 'NO_END_DATE' };
  const currentEnd = isValidIsoDate(internship.extendedEndDate) ? internship.extendedEndDate : internship.endDate;

  // Extended end = planned end + all extension days, so editing the planned end date later keeps the extensions
  const totalDays = totalExtensionDays(existing) + days;
  const newEndDate = addDaysToIsoDate(internship.endDate, totalDays);
  const entry: InternshipExtensionEntry = {
    days,
    reason,
    sourceType,
    sourceId,
    previousEndDate: currentEnd,
    newEndDate,
    createdAt: now,
  };

  await db.collection('employees').updateOne(
    { _id: employee._id },
    {
      $set: {
        'internship.extendedEndDate': newEndDate,
        'internship.extensions': [...existing, entry],
        updatedAt: now,
      },
    }
  );
  return { applied: true, newEndDate, previousEndDate: currentEnd };
}