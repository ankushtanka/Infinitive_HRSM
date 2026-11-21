import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import {
  getISTDateString,
  getISTTimeString,
  formatISTTime,
  formatISTDate,
  calculateWorkingHours,
} from '@/lib/dateUtils';
import {
  createAttendanceAlert,
  formatDurationMinutes,
  parseTimeToMinutes,
} from '@/lib/attendanceAlerts';
import { startAttendanceAlertsCronJob } from '@/jobs/attendanceAlertsJob';
import { parseGeo } from '@/lib/geo';
import {
  checkOfficeLocation,
  isLateCheckIn,
  loadShiftRules,
  normalizeWorkMode,
  shiftStartMinutes,
  summarizePunchGeo,
} from '@/lib/officeAttendance';
import {
  WORK_SUMMARY_MAX_LENGTH,
  WORK_SUMMARY_MIN_LENGTH,
  createWfhRequest,
  findWfhRequestForDate,
} from '@/lib/wfh';

export const dynamic = 'force-dynamic';

/** A real punch time (not empty and not the '--:--' placeholder used on leave days). */
function hasPunch(value: unknown): boolean {
  if (typeof value === 'string') {
    const text = value.trim();
    return text !== '' && text !== '--:--';
  }
  return Boolean(value);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    startAttendanceAlertsCronJob();

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const employeeId = searchParams.get('employeeId');
    const statusParam = searchParams.get('status');
    const monthParam = searchParams.get('month'); // YYYY-MM
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limitParam = searchParams.get('limit');
    const limit = Math.max(1, Math.min(100, parseInt(limitParam || '50', 10)));

    let query: any = { organizationId: orgId };
    if (date) query.date = date;
    if (monthParam) {
      query.date = { $regex: `^${monthParam}` };
    }
    if (employeeId) query.employeeId = employeeId;
    if (statusParam && statusParam !== 'All') query.status = statusParam;

    if (auth.role === 'EMPLOYEE' && auth.employeeId) {
      query.employeeId = auth.employeeId;
    } else if (auth.role === 'MANAGER' && auth.employeeId) {
      const team = await db.collection('employees').find({
        organizationId: orgId,
        $or: [{ managerId: auth.employeeId }, { reportingTo: auth.employeeId }, { employeeId: auth.employeeId }],
      }).toArray();
      const teamEmpIds = team.map((e) => e.employeeId || e._id.toString());
      query.employeeId = { $in: teamEmpIds };
    }

    const totalCount = await db.collection('attendance').countDocuments(query);

    let queryCursor = db.collection('attendance').find(query).sort({ date: -1, createdAt: -1 });
    if (limit > 0) {
      queryCursor = queryCursor.skip((page - 1) * limit).limit(limit);
    }

    const rawRecords = await queryCursor.toArray();
    const attendanceRecords = rawRecords.map((r) => {
      const formattedDate = formatISTDate(r.date || r.createdAt);
      const checkInVal = r.checkIn || r.clockIn;
      const checkOutVal = r.checkOut || r.clockOut;

      const checkInFormatted = checkInVal ? formatISTTime(r.checkInTime || checkInVal) : '--:--';
      const checkOutFormatted = checkOutVal ? formatISTTime(r.checkOutTime || checkOutVal) : '--:--';

      let computedWorkingHours = r.workingHours;
      if (computedWorkingHours === undefined || computedWorkingHours === null || computedWorkingHours === 0) {
        if (checkInVal && checkOutVal) {
          computedWorkingHours = calculateWorkingHours(
            r.checkInTime || r.createdAt,
            r.checkOutTime || r.updatedAt,
            checkInVal,
            checkOutVal
          );
        } else {
          computedWorkingHours = 0;
        }
      }

      return {
        ...r,
        // Listings carry only the location check result, never raw coordinates
        geo: summarizePunchGeo(r.geo),
        checkOutGeo: summarizePunchGeo(r.checkOutGeo),
        date: formattedDate,
        checkIn: checkInFormatted,
        checkOut: checkOutFormatted,
        workingHours: typeof computedWorkingHours === 'number' ? Math.round(computedWorkingHours * 10) / 10 : computedWorkingHours,
      };
    });

    return NextResponse.json({
      success: true,
      count: attendanceRecords.length,
      total: totalCount,
      page: limit > 0 ? page : 1,
      limit: limit > 0 ? limit : totalCount,
      totalPages: limit > 0 ? Math.ceil(totalCount / limit) : 1,
      data: attendanceRecords,
    });
  } catch (error: any) {
    console.error('Attendance API Error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch attendance records' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json();
    const { action, employeeId, date, checkIn, checkOut, status, method, location, geo } = body;

    const now = new Date();
    const today = getISTDateString(now);
    const isClockAction = action === 'CLOCK_IN' || action === 'CLOCK_OUT';
    const elevatedRoles = ['SUPER_ADMIN', 'ADMIN', 'HR'];
    const targetEmpId = ['EMPLOYEE', 'MANAGER'].includes(auth.role)
      ? (auth.employeeId || '')
      : (typeof employeeId === 'string' ? employeeId.trim() : '') || auth.employeeId || '';

    if (!targetEmpId) {
      return NextResponse.json({ success: false, message: 'A valid employee profile is required.' }, { status: 400 });
    }
    if (action && !isClockAction) {
      return NextResponse.json({ success: false, message: 'Unsupported attendance action.' }, { status: 400 });
    }
    if (!isClockAction && !elevatedRoles.includes(auth.role) && auth.role !== 'MANAGER') {
      return NextResponse.json({ success: false, message: 'Only HR, administrators, or managers may record manual attendance.' }, { status: 403 });
    }

    let targetDate = today;
    if (!isClockAction) {
      const manualDate = typeof date === 'string' ? date.trim() : '';
      const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(manualDate) ? new Date(`${manualDate}T00:00:00.000Z`) : null;
      if (!parsedDate || parsedDate.toISOString().slice(0, 10) !== manualDate || manualDate > today) {
        return NextResponse.json({ success: false, message: 'Attendance date must be a valid date no later than today.' }, { status: 400 });
      }
      targetDate = manualDate;
    }
    const nowTimeStr = getISTTimeString(now); // Formatted in Asia/Kolkata!

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const targetEmployee = await db.collection('employees').findOne({
      organizationId: orgId,
      $or: [{ employeeId: targetEmpId }, { id: targetEmpId }],
    });
    if (!targetEmployee) {
      return NextResponse.json({ success: false, message: 'Employee was not found in your organization.' }, { status: 404 });
    }
    if (auth.role === 'MANAGER' && !isClockAction && targetEmpId !== auth.employeeId) {
      const isTeamMember = targetEmployee.managerId === auth.employeeId || targetEmployee.reportingTo === auth.employeeId;
      if (!isTeamMember) {
        return NextResponse.json({ success: false, message: 'Managers may only record attendance for their team.' }, { status: 403 });
      }
    }

    const empName = `${targetEmployee.firstName || ''} ${targetEmployee.lastName || ''}`.trim() || targetEmployee.name || auth.name;

    // Handle Clock-In Action
    if (action === 'CLOCK_IN') {
      const workMode = normalizeWorkMode(body.workMode);

      // A full-day leave approved for today: nothing to punch in for
      const leaveToday = await db.collection('leaves').findOne({
        organizationId: orgId,
        employeeId: targetEmpId,
        status: { $in: ['Approved', 'APPROVED'] },
        startDate: { $lte: targetDate },
        endDate: { $gte: targetDate },
        $or: [{ durationType: 'FULL_DAY' }, { durationDays: { $gte: 1 } }],
      });
      if (leaveToday) {
        return NextResponse.json(
          { success: false, code: 'ON_LEAVE', message: `You are on approved ${leaveToday.leaveType || 'leave'} today, so check-in is not needed.` },
          { status: 400 }
        );
      }

      const existingToday = await db.collection('attendance').findOne({
        organizationId: orgId,
        employeeId: targetEmpId,
        date: targetDate,
      });
      const alreadyIn = hasPunch(existingToday?.checkIn) || hasPunch(existingToday?.checkInTime);
      const alreadyOut = hasPunch(existingToday?.checkOut) || hasPunch(existingToday?.checkOutTime);
      if (alreadyIn && !alreadyOut) {
        return NextResponse.json(
          { success: false, message: 'You are already checked in for today.' },
          { status: 400 }
        );
      }
      if (alreadyIn && alreadyOut) {
        // Checking in again would overwrite today's completed attendance
        return NextResponse.json(
          { success: false, code: 'DAY_COMPLETED', message: 'You have already checked in and checked out today.' },
          { status: 400 }
        );
      }

      const attRules = await loadShiftRules(db, orgId);

      // Office: must be at an office when the location rule is on. WFH: location is stored for the record only.
      let geoDoc: Record<string, any> | null = null;
      let officeName: string | null = null;
      if (workMode === 'OFFICE') {
        const officeCheck = checkOfficeLocation(attRules, geo, now);
        if (!officeCheck.ok) {
          return NextResponse.json(
            { success: false, code: officeCheck.code, message: officeCheck.message },
            { status: officeCheck.status }
          );
        }
        geoDoc = officeCheck.geoDoc;
        officeName = officeCheck.office?.name || null;
      } else {
        const wfhGeo = parseGeo(geo);
        geoDoc = wfhGeo ? { ...wfhGeo, capturedAt: now } : null;
      }

      // WFH approved in advance counts as approved; a rejected one means office only; otherwise it waits for mentor / HR
      let wfhStatus: 'APPROVED' | 'PENDING' | null = null;
      let wfhRequest: any = null;
      if (workMode === 'WFH') {
        wfhRequest = await findWfhRequestForDate(db, orgId, targetEmpId, targetDate);
        if (wfhRequest?.status === 'Rejected') {
          return NextResponse.json(
            {
              success: false,
              code: 'WFH_REJECTED',
              message: 'Your Work From Home request for today was rejected. Please check in from the office.',
            },
            { status: 400 }
          );
        }
        wfhStatus = wfhRequest?.status === 'Approved' ? 'APPROVED' : 'PENDING';
      }

      const isLate = isLateCheckIn(attRules, nowTimeStr);
      const calculatedStatus = workMode === 'WFH' ? 'Work From Home' : isLate ? 'Late' : 'Present';

      const clockInDoc: Record<string, any> = {
        organizationId: orgId,
        employeeId: targetEmpId,
        employeeName: empName || 'Employee',
        date: targetDate,
        checkIn: nowTimeStr,
        checkInTime: now,
        checkOut: '',
        checkOutTime: null,
        status: calculatedStatus,
        workMode,
        isLate,
        wfhStatus,
        wfhRequestId: wfhRequest ? String(wfhRequest._id) : null,
        method: method || 'Web',
        location: workMode === 'WFH' ? 'Work From Home' : officeName || 'Office HQ',
        geo: geoDoc,
        checkOutGeo: null,
        workingHours: 0,
        updatedAt: now,
      };

      await db.collection('attendance').updateOne(
        { organizationId: orgId, employeeId: targetEmpId, date: targetDate },
        { $set: clockInDoc, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );

      // Same-day WFH without a request: create one so it shows up in the Approval Center
      if (workMode === 'WFH' && !wfhRequest) {
        try {
          const created = await createWfhRequest(db, {
            organizationId: orgId,
            employee: targetEmployee,
            date: targetDate,
            reason: '',
            source: 'CHECK_IN',
            requestedBy: { name: auth.name || empName, userId: auth.userId, role: auth.role },
            now,
          });
          clockInDoc.wfhRequestId = String(created._id);
          await db.collection('attendance').updateOne(
            { organizationId: orgId, employeeId: targetEmpId, date: targetDate },
            { $set: { wfhRequestId: clockInDoc.wfhRequestId } }
          );
        } catch (wfhErr) {
          console.error('[Attendance] Could not create the WFH request:', wfhErr);
        }
      }

      await logAuditEvent(req, 'CLOCK_IN', { employeeId: targetEmpId, details: { ...clockInDoc, geo: summarizePunchGeo(geoDoc) } });

      if (isLate) {
        try {
          const workStartTime = attRules.workStartTime || '10:00 AM';
          const diffMins = Math.max(1, (parseTimeToMinutes(nowTimeStr) ?? 0) - shiftStartMinutes(attRules));
          const formattedDur = formatDurationMinutes(diffMins);

          createAttendanceAlert(db, {
            organizationId: orgId,
            employeeId: targetEmpId,
            employeeName: empName,
            employeeCode: targetEmployee.employeeId || targetEmpId,
            department: targetEmployee.department,
            designation: targetEmployee.designation,
            managerId: targetEmployee.managerId || targetEmployee.reportingTo,
            alertType: 'LATE_ARRIVAL',
            date: targetDate,
            time: nowTimeStr,
            expectedTime: workStartTime,
            actualTime: nowTimeStr,
            diffMinutes: diffMins,
            message: `Employee arrived late${workMode === 'WFH' ? ' (Work From Home)' : ''}: checked in at ${nowTimeStr} (${formattedDur} after scheduled start ${workStartTime}).`,
            status: 'PENDING',
            employeeEmail: targetEmployee.email,
          }).catch((err) => console.error('[Attendance] Auto late alert error:', err));
        } catch (e) {
          console.warn('[Attendance] Late alert generation warning:', e);
        }
      }

      let message = isLate ? `Checked in at ${nowTimeStr} (marked Late).` : `Checked in at ${nowTimeStr}.`;
      if (workMode === 'OFFICE' && officeName) message = `${message} Location: ${officeName}.`;
      if (workMode === 'WFH') {
        message = wfhStatus === 'APPROVED'
          ? `${message} Work From Home (already approved).`
          : `${message} Work From Home is waiting for approval from your mentor / HR.`;
      }

      return NextResponse.json({
        success: true,
        message,
        data: { ...clockInDoc, geo: summarizePunchGeo(geoDoc) },
      });
    }

    // Handle Clock-Out Action
    if (action === 'CLOCK_OUT') {
      const existingToday = await db.collection('attendance').findOne({
        organizationId: orgId,
        employeeId: targetEmpId,
        date: targetDate,
      });

      if (!existingToday || (!hasPunch(existingToday.checkIn) && !hasPunch(existingToday.checkInTime))) {
        return NextResponse.json(
          { success: false, message: 'Cannot check out without checking in first.' },
          { status: 400 }
        );
      }

      if (hasPunch(existingToday.checkOut) || hasPunch(existingToday.checkOutTime)) {
        return NextResponse.json(
          { success: false, message: 'You have already checked out for today.' },
          { status: 400 }
        );
      }

      // Work From Home days need a short note of the work done (seen by mentor / HR)
      const workSummary = typeof body.workSummary === 'string' ? body.workSummary.trim() : '';
      if (existingToday.workMode === 'WFH') {
        if (workSummary.length < WORK_SUMMARY_MIN_LENGTH) {
          return NextResponse.json(
            {
              success: false,
              code: 'WORK_SUMMARY_REQUIRED',
              message: `Write what you worked on today (at least ${WORK_SUMMARY_MIN_LENGTH} characters) to check out from Work From Home.`,
            },
            { status: 400 }
          );
        }
        if (workSummary.length > WORK_SUMMARY_MAX_LENGTH) {
          return NextResponse.json(
            { success: false, code: 'WORK_SUMMARY_TOO_LONG', message: `Keep the work summary under ${WORK_SUMMARY_MAX_LENGTH} characters.` },
            { status: 400 }
          );
        }
      }

      // Calculate working hours using timestamps as source of truth
      const hoursWorked = calculateWorkingHours(
        existingToday.checkInTime || existingToday.createdAt,
        now,
        existingToday.checkIn,
        nowTimeStr
      );

      const outGeo = parseGeo(geo);
      const updateData: Record<string, any> = {
        checkOut: nowTimeStr,
        checkOutTime: now,
        workingHours: hoursWorked,
        checkOutGeo: outGeo ? { ...outGeo, capturedAt: now } : null,
        ...(existingToday.workMode === 'WFH' ? { workSummary } : {}),
        updatedAt: now,
      };

      await db.collection('attendance').updateOne(
        { organizationId: orgId, employeeId: targetEmpId, date: targetDate },
        { $set: updateData }
      );

      await logAuditEvent(req, 'CLOCK_OUT', { employeeId: targetEmpId, details: { ...updateData, checkOutGeo: summarizePunchGeo(updateData.checkOutGeo) } });

      try {
        const attRules = await loadShiftRules(db, orgId);
        const workEndTime = attRules.workEndTime || '06:00 PM';
        const shiftEndMins = parseTimeToMinutes(workEndTime) || 1080;
        const [timePart, modifier] = nowTimeStr.split(' ');
        let [hours, minutes] = timePart.split(':').map(Number);
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        const checkOutMins = hours * 60 + minutes;

        if (checkOutMins < shiftEndMins) {
          const diffMins = shiftEndMins - checkOutMins;
          const formattedDur = formatDurationMinutes(diffMins);

          createAttendanceAlert(db, {
            organizationId: orgId,
            employeeId: targetEmpId,
            employeeName: empName,
            employeeCode: targetEmployee.employeeId || targetEmpId,
            department: targetEmployee.department,
            designation: targetEmployee.designation,
            managerId: targetEmployee.managerId || targetEmployee.reportingTo,
            alertType: 'EARLY_DEPARTURE',
            date: targetDate,
            time: nowTimeStr,
            expectedTime: workEndTime,
            actualTime: nowTimeStr,
            diffMinutes: diffMins,
            message: `Employee departed early: checked out at ${nowTimeStr} (${formattedDur} before scheduled shift end ${workEndTime}).`,
            status: 'PENDING',
            employeeEmail: targetEmployee.email,
          }).catch((err) => console.error('[Attendance] Auto early departure alert error:', err));
        }
      } catch (earlyErr) {
        console.warn('[Attendance] Early departure check notice:', earlyErr);
      }

      return NextResponse.json({
        success: true,
        message: `Checked out at ${nowTimeStr}.`,
        data: {
          ...existingToday,
          ...updateData,
          geo: summarizePunchGeo(existingToday.geo),
          checkOutGeo: summarizePunchGeo(updateData.checkOutGeo),
        },
      });
    }

    const allowedStatuses = ['Present', 'Absent', 'Late', 'Half Day', 'Early Leave', 'Work From Home', 'On Leave'];
    const manualStatus = typeof status === 'string' ? status : 'Present';
    const validTime = (value: unknown) => typeof value === 'string' && /^(0?[1-9]|1[0-2]):[0-5]\d\s?(AM|PM)$/i.test(value.trim());
    const checkInValue = typeof checkIn === 'string' ? checkIn.trim() : '09:00 AM';
    const checkOutValue = typeof checkOut === 'string' ? checkOut.trim() : '06:00 PM';
    const workingHoursValue = Number(body.workingHours ?? 8);
    if (!allowedStatuses.includes(manualStatus) || !validTime(checkInValue) || !validTime(checkOutValue) || !Number.isFinite(workingHoursValue) || workingHoursValue < 0 || workingHoursValue > 24) {
      return NextResponse.json({ success: false, message: 'Attendance status, time, or working-hours value is invalid.' }, { status: 400 });
    }

    // Direct manual attendance upsert (HR / Admin / Super Admin / permitted manager)
    const attendanceDoc = {
      organizationId: orgId,
      employeeId: targetEmployee.employeeId || targetEmpId,
      employeeName: empName || 'Employee',
      date: targetDate,
      checkIn: checkInValue,
      checkOut: checkOutValue,
      breakDuration: body.breakDuration || '1 hr',
      workingHours: workingHoursValue,
      status: manualStatus,
      workMode: manualStatus === 'Work From Home' ? 'WFH' : 'OFFICE',
      method: method || 'Web',
      location: location || (manualStatus === 'Work From Home' ? 'Work From Home' : 'Office HQ'),
      updatedAt: now,
    };

    await db.collection('attendance').updateOne(
      { organizationId: orgId, employeeId: targetEmployee.employeeId || targetEmpId, date: targetDate },
      { $set: attendanceDoc, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

    await logAuditEvent(req, 'RECORD_ATTENDANCE', { employeeId: targetEmpId, details: attendanceDoc });

    return NextResponse.json({
      success: true,
      message: 'Attendance record saved successfully.',
      data: attendanceDoc,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/attendance:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to save attendance' }, { status: 500 });
  }
}