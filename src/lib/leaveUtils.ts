import { getISTDateString, parseDateInput } from './dateUtils';

export type LeaveDurationType = 'FULL_DAY' | 'HALF_DAY' | 'CUSTOM_HOURS';
export type HalfDaySession = 'FIRST_HALF' | 'SECOND_HALF';

export interface ShiftConfiguration {
  workStartTime: string;
  workEndTime: string;
  halfDayThresholdHours?: number;
  minHoursFullDay?: number;
  breakDurationMinutes?: number;
  lunchBreakDurationMins?: number;
  breakStartTime?: string;
  breakEndTime?: string;
}

export interface CalculatedLeaveDuration {
  isValid: boolean;
  durationDays: number;
  requestedHours: number;
  requestedStartTime?: string;
  requestedEndTime?: string;
  session?: HalfDaySession;
  durationType: LeaveDurationType;
  errorMessage?: string;
}

/**
 * Parses time string like "09:00 AM" or "18:00" into total minutes from midnight
 */
export function timeStringToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  const trimmed = timeStr.trim();

  // 12-hour format: "09:00 AM"
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let [, hStr, mStr, mod] = ampmMatch;
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const isPM = mod.toUpperCase() === 'PM';
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h * 60 + m;
  }

  // 24-hour format: "14:30"
  const hhmmMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    const h = parseInt(hhmmMatch[1], 10);
    const m = parseInt(hhmmMatch[2], 10);
    return h * 60 + m;
  }

  return null;
}

/**
 * Formats minutes from midnight to "hh:mm AM/PM"
 */
export function minutesToTimeString(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  let h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const mod = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm} ${mod}`;
}

/**
 * Calculates standard shift time slots and midpoint based on organization attendance settings.
 * Dynamically supports configured break times (breakStartTime, breakEndTime, lunchBreakDurationMins).
 */
export function getShiftTimeSlots(config?: Partial<ShiftConfiguration>) {
  const workStartTime = config?.workStartTime || '09:00 AM';
  const workEndTime = config?.workEndTime || '06:00 PM';

  const startMins = timeStringToMinutes(workStartTime) ?? 9 * 60; // 09:00 AM
  const endMins = timeStringToMinutes(workEndTime) ?? 18 * 60;    // 06:00 PM

  const totalSpanMins = Math.max(60, endMins - startMins);
  let firstHalfStart = minutesToTimeString(startMins);
  let firstHalfEnd = '';
  let secondHalfStart = '';
  let secondHalfEnd = minutesToTimeString(endMins);
  let midpointMins = startMins + Math.round(totalSpanMins / 2);
  let halfDayHours = 4;

  const breakStartMins = config?.breakStartTime ? timeStringToMinutes(config.breakStartTime) : null;
  const breakEndMins = config?.breakEndTime ? timeStringToMinutes(config.breakEndTime) : null;

  if (breakStartMins !== null && breakEndMins !== null && breakStartMins > startMins && breakEndMins < endMins && breakEndMins > breakStartMins) {
    // Explicit break interval configured (e.g. 01:00 PM - 02:00 PM)
    firstHalfEnd = minutesToTimeString(breakStartMins);
    secondHalfStart = minutesToTimeString(breakEndMins);
    midpointMins = Math.round((breakStartMins + breakEndMins) / 2);
    const mHours = (breakStartMins - startMins) / 60;
    const aHours = (endMins - breakEndMins) / 60;
    halfDayHours = Math.round(((mHours + aHours) / 2) * 10) / 10;
  } else {
    const breakDuration = config?.breakDurationMinutes ?? config?.lunchBreakDurationMins ?? 60;
    if (breakDuration > 0 && totalSpanMins > breakDuration + 60) {
      // Shift with break duration, split working time evenly around center
      const workingMins = totalSpanMins - breakDuration;
      const halfWorking = Math.round(workingMins / 2);
      const bStart = startMins + halfWorking;
      const bEnd = bStart + breakDuration;
      firstHalfEnd = minutesToTimeString(bStart);
      secondHalfStart = minutesToTimeString(bEnd);
      midpointMins = Math.round((bStart + bEnd) / 2);
      halfDayHours = Math.round((halfWorking / 60) * 10) / 10;
    } else {
      // Standard mathematical midpoint
      firstHalfEnd = minutesToTimeString(midpointMins);
      secondHalfStart = minutesToTimeString(midpointMins);
      halfDayHours = Math.round((totalSpanMins / 2 / 60) * 10) / 10;
    }
  }

  const fullDayHours = Math.round((totalSpanMins / 60) * 10) / 10;

  return {
    workStartTime: minutesToTimeString(startMins),
    workEndTime: minutesToTimeString(endMins),
    totalSpanHours: fullDayHours,
    halfDayHours,
    midpointTime: minutesToTimeString(midpointMins),
    firstHalf: {
      session: 'FIRST_HALF' as HalfDaySession,
      label: 'First Half (Morning Session)',
      startTime: firstHalfStart,
      endTime: firstHalfEnd,
      hours: halfDayHours,
    },
    secondHalf: {
      session: 'SECOND_HALF' as HalfDaySession,
      label: 'Second Half (Afternoon Session)',
      startTime: secondHalfStart,
      endTime: secondHalfEnd,
      hours: halfDayHours,
    },
  };
}

/**
 * Authoritative Server & Client Duration Calculator
 */
export function calculateAuthoritativeDuration(params: {
  durationType?: string;
  startDate: string;
  endDate: string;
  session?: string;
  customStartTime?: string;
  customEndTime?: string;
  shiftConfig?: Partial<ShiftConfiguration>;
}): CalculatedLeaveDuration {
  const normType: LeaveDurationType =
    params.durationType === 'HALF_DAY'
      ? 'HALF_DAY'
      : params.durationType === 'CUSTOM_HOURS'
      ? 'CUSTOM_HOURS'
      : 'FULL_DAY';

  const shiftSlots = getShiftTimeSlots(params.shiftConfig);

  // 1. HALF DAY
  if (normType === 'HALF_DAY') {
    const session: HalfDaySession =
      params.session === 'SECOND_HALF' ? 'SECOND_HALF' : 'FIRST_HALF';
    const slot = session === 'FIRST_HALF' ? shiftSlots.firstHalf : shiftSlots.secondHalf;

    return {
      isValid: true,
      durationType: 'HALF_DAY',
      session,
      durationDays: 0.5,
      requestedHours: slot.hours,
      requestedStartTime: slot.startTime,
      requestedEndTime: slot.endTime,
    };
  }

  // 2. CUSTOM HOURS
  if (normType === 'CUSTOM_HOURS') {
    const rawStart = params.customStartTime?.trim();
    const rawEnd = params.customEndTime?.trim();

    if (!rawStart || !rawEnd) {
      return {
        isValid: false,
        durationType: 'CUSTOM_HOURS',
        durationDays: 0,
        requestedHours: 0,
        errorMessage: 'Start time and end time are required for custom hours leave.',
      };
    }

    const startMins = timeStringToMinutes(rawStart);
    const endMins = timeStringToMinutes(rawEnd);

    if (startMins === null || endMins === null) {
      return {
        isValid: false,
        durationType: 'CUSTOM_HOURS',
        durationDays: 0,
        requestedHours: 0,
        errorMessage: 'Invalid time format. Use "hh:mm AM/PM".',
      };
    }

    if (endMins <= startMins) {
      return {
        isValid: false,
        durationType: 'CUSTOM_HOURS',
        durationDays: 0,
        requestedHours: 0,
        errorMessage: 'End time must be after start time.',
      };
    }

    const shiftStartMins = timeStringToMinutes(shiftSlots.workStartTime) ?? 9 * 60;
    const shiftEndMins = timeStringToMinutes(shiftSlots.workEndTime) ?? 18 * 60;

    if (startMins < shiftStartMins || endMins > shiftEndMins) {
      return {
        isValid: false,
        durationType: 'CUSTOM_HOURS',
        durationDays: 0,
        requestedHours: 0,
        errorMessage: `Requested time interval (${rawStart} - ${rawEnd}) must fall within your working shift (${shiftSlots.workStartTime} - ${shiftSlots.workEndTime}).`,
      };
    }

    const diffHours = (endMins - startMins) / 60;
    const roundedHours = Math.round(diffHours * 10) / 10;
    const totalWorkingHours = Math.max(1, (shiftEndMins - shiftStartMins) / 60);
    const fractionalDays = Math.max(0.1, Math.round((roundedHours / totalWorkingHours) * 100) / 100);

    return {
      isValid: true,
      durationType: 'CUSTOM_HOURS',
      durationDays: fractionalDays,
      requestedHours: roundedHours,
      requestedStartTime: minutesToTimeString(startMins),
      requestedEndTime: minutesToTimeString(endMins),
    };
  }

  // 3. FULL DAY
  const start = parseDateInput(params.startDate);
  const end = parseDateInput(params.endDate);

  if (!start || !end) {
    return {
      isValid: false,
      durationType: 'FULL_DAY',
      durationDays: 0,
      requestedHours: 0,
      errorMessage: 'Start date and end date are required.',
    };
  }

  if (end < start) {
    return {
      isValid: false,
      durationType: 'FULL_DAY',
      durationDays: 0,
      requestedHours: 0,
      errorMessage: 'End date cannot be prior to start date.',
    };
  }

  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1);
  const hours = days * (shiftSlots.totalSpanHours || 8);

  return {
    isValid: true,
    durationType: 'FULL_DAY',
    durationDays: days,
    requestedHours: hours,
  };
}

/**
 * Checks if a requested leave interval conflicts with existing pending or approved leaves
 */
export function checkLeaveDateOverlap(params: {
  existingLeaves: any[];
  startDate: string;
  endDate: string;
  durationType: LeaveDurationType;
  session?: HalfDaySession;
  excludeLeaveId?: string;
}): { hasConflict: boolean; conflictReason?: string } {
  const { existingLeaves, startDate, endDate, durationType, session, excludeLeaveId } = params;

  for (const existing of existingLeaves) {
    const existingId = existing._id?.toString() || existing.id;
    if (excludeLeaveId && existingId === excludeLeaveId) continue;

    const existingStatus = (existing.status || '').toLowerCase();
    if (existingStatus === 'rejected' || existingStatus === 'cancelled') continue;

    const exStart = existing.startDate;
    const exEnd = existing.endDate || existing.startDate;

    // Check if dates overlap at all
    const isDateOverlapping = !(endDate < exStart || startDate > exEnd);
    if (!isDateOverlapping) continue;

    const exType: LeaveDurationType = existing.durationType || 'FULL_DAY';

    // Conflict Case 1: Existing or new is FULL_DAY on overlapping dates
    if (exType === 'FULL_DAY' || durationType === 'FULL_DAY') {
      return {
        hasConflict: true,
        conflictReason: `Overlaps with an existing ${existing.status.toLowerCase()} leave request (${exStart} to ${exEnd}).`,
      };
    }

    // Conflict Case 2: Both are HALF_DAY on the exact same date
    if (exType === 'HALF_DAY' && durationType === 'HALF_DAY' && exStart === startDate) {
      const exSession = existing.session || 'FIRST_HALF';
      if (exSession === session) {
        return {
          hasConflict: true,
          conflictReason: `You already have an active leave request for the ${session === 'FIRST_HALF' ? 'First Half' : 'Second Half'} on ${startDate}.`,
        };
      }
      // If sessions are different (e.g. one FIRST_HALF and one SECOND_HALF), permitted!
      continue;
    }

    // Conflict Case 3: Overlapping custom hours or mixed half day on same date
    if (exStart === startDate) {
      return {
        hasConflict: true,
        conflictReason: `You already have an active leave request on ${startDate} for this time interval.`,
      };
    }
  }

  return { hasConflict: false };
}

/**
 * Formats a leave request duration into clean human-readable text
 */
export function formatLeaveDurationText(leave: {
  durationDays?: number | null;
  durationType?: string | null;
  session?: string | null;
  requestedHours?: number | null;
  requestedStartTime?: string | null;
  requestedEndTime?: string | null;
  [key: string]: any;
}): string {
  const type = leave.durationType || 'FULL_DAY';
  if (type === 'HALF_DAY') {
    const sessionLabel = leave.session === 'SECOND_HALF' ? 'Second Half' : 'First Half';
    const timeRange =
      leave.requestedStartTime && leave.requestedEndTime
        ? ` (${leave.requestedStartTime} - ${leave.requestedEndTime})`
        : '';
    return `0.5 Day • ${sessionLabel}${timeRange}`;
  }

  if (type === 'CUSTOM_HOURS') {
    const hrs = leave.requestedHours ? `${leave.requestedHours} hrs` : `${leave.durationDays || 0.5} day`;
    const timeRange =
      leave.requestedStartTime && leave.requestedEndTime
        ? ` (${leave.requestedStartTime} - ${leave.requestedEndTime})`
        : '';
    return `${hrs}${timeRange}`;
  }

  const days = Number(leave.durationDays) || 1;
  return `${days} Day${days > 1 ? 's' : ''}`;
}

/**
 * Reconciles attendance status for an employee on a specific date based on all active approved leaves.
 * Solves:
 * - Full day approved leave -> 'On Leave'
 * - Morning half-day approved leave -> 'Half Day' (Second Half work expectation)
 * - Afternoon half-day approved leave -> 'Half Day' (First Half work expectation)
 * - Both Morning and Afternoon half-day leaves approved on the same date -> 'On Leave' (Full Day absence)
 * - Cancellation of one half-day leave -> reverts cleanly to remaining approved leave
 * - Cancellation of all leaves -> restores attendance punch status cleanly
 */
export async function reconcileAttendanceForDate(params: {
  db: any;
  organizationId: string;
  employeeId: string;
  dateStr: string;
  employeeName?: string;
  now?: Date;
  shiftConfig?: Partial<ShiftConfiguration>;
}): Promise<{ status: string; notes?: string }> {
  const { db, organizationId, employeeId, dateStr, employeeName, shiftConfig } = params;
  const now = params.now || new Date();
  const shiftSlots = getShiftTimeSlots(shiftConfig);

  // 1. Fetch all approved leaves covering this date
  const approvedLeaves = await db.collection('leaves').find({
    organizationId,
    employeeId,
    status: { $in: ['Approved', 'APPROVED'] },
    startDate: { $lte: dateStr },
    endDate: { $gte: dateStr },
  }).toArray();

  const existingAtt = await db.collection('attendance').findOne({
    organizationId,
    employeeId,
    date: dateStr,
  });

  const resolvedName = employeeName || existingAtt?.employeeName || approvedLeaves[0]?.employeeName || 'Employee';

  // Case 1: No approved leaves for this date (e.g. leave cancelled or rejected)
  if (approvedLeaves.length === 0) {
    if (existingAtt) {
      const hadRealPunches = existingAtt.checkIn && existingAtt.checkIn !== '--:--' && existingAtt.location !== 'Leave';
      if (hadRealPunches) {
        await db.collection('attendance').updateOne(
          { _id: existingAtt._id },
          {
            $set: {
              status: 'Present',
              notes: 'Leave was cancelled - punch attendance active',
              updatedAt: now,
            },
            $unset: { leaveId: '' },
          }
        );
        return { status: 'Present', notes: 'Restored punch attendance' };
      } else {
        await db.collection('attendance').updateOne(
          { _id: existingAtt._id },
          {
            $set: {
              status: 'Absent',
              checkIn: '--:--',
              checkOut: '--:--',
              workingHours: 0,
              notes: 'Leave cancelled',
              updatedAt: now,
            },
            $unset: { leaveId: '' },
          }
        );
        return { status: 'Absent', notes: 'Leave cancelled' };
      }
    }
    return { status: 'None' };
  }

  // Case 2: At least one FULL_DAY leave approved
  const fullDayLeave = approvedLeaves.find((l: any) => l.durationType === 'FULL_DAY' || Number(l.durationDays) >= 1);
  if (fullDayLeave) {
    const leaveNotes = `Approved Leave: ${fullDayLeave.leaveType}`;
    if (existingAtt) {
      await db.collection('attendance').updateOne(
        { _id: existingAtt._id },
        {
          $set: {
            status: 'On Leave',
            leaveId: fullDayLeave._id.toString(),
            notes: leaveNotes,
            workingHours: 0,
            checkIn: '--:--',
            checkOut: '--:--',
            location: 'Leave',
            updatedAt: now,
          },
        }
      );
    } else {
      await db.collection('attendance').insertOne({
        organizationId,
        employeeId,
        employeeName: resolvedName,
        date: dateStr,
        checkIn: '--:--',
        checkOut: '--:--',
        workingHours: 0,
        status: 'On Leave',
        method: 'Web',
        location: 'Leave',
        leaveId: fullDayLeave._id.toString(),
        notes: leaveNotes,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { status: 'On Leave', notes: leaveNotes };
  }

  // Case 3: Partial / Half-Day leaves
  const firstHalfLeave = approvedLeaves.find(
    (l: any) => l.durationType === 'HALF_DAY' && (l.session === 'FIRST_HALF' || !l.session)
  );
  const secondHalfLeave = approvedLeaves.find(
    (l: any) => l.durationType === 'HALF_DAY' && l.session === 'SECOND_HALF'
  );
  const totalDuration = approvedLeaves.reduce((sum: number, l: any) => sum + (Number(l.durationDays) || 0.5), 0);

  // Both half-day sessions approved (or total duration >= 1 day) => resolves to 'On Leave' (Full Day absence)
  if ((firstHalfLeave && secondHalfLeave) || totalDuration >= 1.0) {
    const combinedLeaveId = [firstHalfLeave?._id?.toString(), secondHalfLeave?._id?.toString()].filter(Boolean).join(',');
    const combinedNotes = `Approved Combined Leave: Morning (${firstHalfLeave?.leaveType || 'Half Day'}) & Afternoon (${secondHalfLeave?.leaveType || 'Half Day'})`;

    if (existingAtt) {
      await db.collection('attendance').updateOne(
        { _id: existingAtt._id },
        {
          $set: {
            status: 'On Leave',
            leaveId: combinedLeaveId,
            notes: combinedNotes,
            workingHours: 0,
            checkIn: '--:--',
            checkOut: '--:--',
            location: 'Leave',
            updatedAt: now,
          },
        }
      );
    } else {
      await db.collection('attendance').insertOne({
        organizationId,
        employeeId,
        employeeName: resolvedName,
        date: dateStr,
        checkIn: '--:--',
        checkOut: '--:--',
        workingHours: 0,
        status: 'On Leave',
        method: 'Web',
        location: 'Leave',
        leaveId: combinedLeaveId,
        notes: combinedNotes,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { status: 'On Leave', notes: combinedNotes };
  }

  // Case 4: Exactly one Half-Day leave approved
  const singleHalfLeave = firstHalfLeave || secondHalfLeave || approvedLeaves[0];
  const session = singleHalfLeave.session === 'SECOND_HALF' ? 'SECOND_HALF' : 'FIRST_HALF';
  const sessionText = session === 'SECOND_HALF' ? 'Second Half' : 'First Half';
  const halfNotes = `Approved Half-Day Leave (${sessionText} - ${singleHalfLeave.leaveType})`;

  // When FIRST_HALF is on leave, employee is expected to work SECOND_HALF slot (e.g. 01:30 PM to 06:00 PM)
  // When SECOND_HALF is on leave, employee is expected to work FIRST_HALF slot (e.g. 09:00 AM to 01:30 PM)
  const expectedCheckIn = session === 'FIRST_HALF' ? shiftSlots.secondHalf.startTime : shiftSlots.firstHalf.startTime;
  const expectedCheckOut = session === 'FIRST_HALF' ? shiftSlots.secondHalf.endTime : shiftSlots.firstHalf.endTime;

  if (existingAtt) {
    const keepRealCheckIn = existingAtt.checkIn && existingAtt.checkIn !== '--:--' && existingAtt.location !== 'Leave';
    await db.collection('attendance').updateOne(
      { _id: existingAtt._id },
      {
        $set: {
          status: 'Half Day',
          leaveId: singleHalfLeave._id.toString(),
          notes: halfNotes,
          checkIn: keepRealCheckIn ? existingAtt.checkIn : expectedCheckIn,
          checkOut: keepRealCheckIn ? existingAtt.checkOut : expectedCheckOut,
          workingHours: keepRealCheckIn ? existingAtt.workingHours : shiftSlots.halfDayHours,
          updatedAt: now,
        },
      }
    );
  } else {
    await db.collection('attendance').insertOne({
      organizationId,
      employeeId,
      employeeName: resolvedName,
      date: dateStr,
      checkIn: expectedCheckIn,
      checkOut: expectedCheckOut,
      workingHours: shiftSlots.halfDayHours,
      status: 'Half Day',
      method: 'Web',
      location: 'Office HQ',
      leaveId: singleHalfLeave._id.toString(),
      notes: halfNotes,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { status: 'Half Day', notes: halfNotes };
}

/**
 * Reconciles attendance across a multi-day date range for an employee
 */
export async function reconcileAttendanceForLeaveRange(params: {
  db: any;
  organizationId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  employeeName?: string;
  now?: Date;
  shiftConfig?: Partial<ShiftConfiguration>;
}) {
  const start = parseDateInput(params.startDate);
  const end = parseDateInput(params.endDate || params.startDate);
  if (!start || !end) return;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    await reconcileAttendanceForDate({
      ...params,
      dateStr,
    });
  }
}

/**
 * Authoritative self-approval detection across all roles (Admin, HR, Manager, Super Admin)
 * Checks token employeeId, token userId, and queries employees collection for linked employee records.
 */
export async function checkIsSelfApproval(params: {
  auth: { employeeId?: string; userId?: string; email?: string; role?: string };
  targetEmployeeId: string;
  targetDoc?: any;
  db: any;
  organizationId: string;
}): Promise<boolean> {
  const { auth, targetEmployeeId, targetDoc, db, organizationId } = params;

  // 1. Direct match on employeeId from auth token
  if (auth.employeeId && auth.employeeId === targetEmployeeId) {
    return true;
  }

  // 2. Direct match on userId if doc specifies owner
  if (auth.userId && targetDoc) {
    if (targetDoc.userId === auth.userId || targetDoc.createdBy === auth.userId) {
      return true;
    }
  }

  // 3. Resolve linked employee record for Admin / HR users whose JWT lacks employeeId
  if (auth.userId || auth.email) {
    const employeeMatch = await db.collection('employees').findOne({
      organizationId,
      $or: [
        ...(auth.userId ? [{ userId: auth.userId }, { id: auth.userId }] : []),
        ...(auth.email ? [{ email: auth.email }] : []),
      ],
    });

    if (employeeMatch && employeeMatch.employeeId === targetEmployeeId) {
      return true;
    }
  }

  return false;
}

