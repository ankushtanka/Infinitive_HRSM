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

export const dynamic = 'force-dynamic';

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
    const { action, employeeId, date, checkIn, checkOut, status, method, location } = body;

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
      const existingToday = await db.collection('attendance').findOne({
        organizationId: orgId,
        employeeId: targetEmpId,
        date: targetDate,
      });

      if (existingToday && (existingToday.checkIn || existingToday.checkInTime) && (!existingToday.checkOut && !existingToday.checkOutTime)) {
        return NextResponse.json(
          { success: false, message: 'You are already checked in for today.' },
          { status: 400 }
        );
      }

      // Calculate Late / Present in IST
      const orgSettings = await db.collection('organization_settings').findOne({ organizationId: orgId });
      const attRules = orgSettings?.attendance || { workStartTime: '09:00 AM', gracePeriodMinutes: 15, lateMarkingEnabled: true };

      let calculatedStatus = 'Present';
      try {
        const [timePart, modifier] = nowTimeStr.split(' ');
        let [hours, minutes] = timePart.split(':').map(Number);
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;

        const [shiftTimePart, shiftModifier] = (attRules.workStartTime || '09:00 AM').split(' ');
        let [shiftHours, shiftMinutes] = shiftTimePart.split(':').map(Number);
        if (shiftModifier === 'PM' && shiftHours < 12) shiftHours += 12;
        if (shiftModifier === 'AM' && shiftHours === 12) shiftHours = 0;

        const checkInMins = hours * 60 + minutes;
        const shiftMins = shiftHours * 60 + shiftMinutes;
        const graceMins = Number(attRules.gracePeriodMinutes) || 15;

        if (attRules.lateMarkingEnabled && checkInMins > shiftMins + graceMins) {
          calculatedStatus = 'Late';
        }
      } catch {
        calculatedStatus = 'Present';
      }

      const clockInDoc = {
        organizationId: orgId,
        employeeId: targetEmpId,
        employeeName: empName || 'Employee',
        date: targetDate,
        checkIn: nowTimeStr,
        checkInTime: now,
        checkOut: '',
        checkOutTime: null,
        status: calculatedStatus,
        method: method || 'Web',
        location: location || 'Office HQ',
        workingHours: 0,
        updatedAt: now,
      };

      await db.collection('attendance').updateOne(
        { organizationId: orgId, employeeId: targetEmpId, date: targetDate },
        { $set: clockInDoc, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );

      await logAuditEvent(req, 'CLOCK_IN', { employeeId: targetEmpId, details: clockInDoc });

      if (calculatedStatus === 'Late') {
        try {
          const [shiftTimePart, shiftModifier] = (attRules.workStartTime || '09:00 AM').split(' ');
          let [sHours, sMinutes] = shiftTimePart.split(':').map(Number);
          if (shiftModifier === 'PM' && sHours < 12) sHours += 12;
          if (shiftModifier === 'AM' && sHours === 12) sHours = 0;
          const [nowTimePart, nowModifier] = nowTimeStr.split(' ');
          let [nHours, nMinutes] = nowTimePart.split(':').map(Number);
          if (nowModifier === 'PM' && nHours < 12) nHours += 12;
          if (nowModifier === 'AM' && nHours === 12) nHours = 0;
          const diffMins = Math.max(1, (nHours * 60 + nMinutes) - (sHours * 60 + sMinutes));
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
            expectedTime: attRules.workStartTime || '09:00 AM',
            actualTime: nowTimeStr,
            diffMinutes: diffMins,
            message: `Employee arrived late: checked in at ${nowTimeStr} (${formattedDur} after scheduled start ${attRules.workStartTime || '09:00 AM'}).`,
            status: 'PENDING',
            employeeEmail: targetEmployee.email,
          }).catch((err) => console.error('[Attendance] Auto late alert error:', err));
        } catch (e) {
          console.warn('[Attendance] Late alert generation warning:', e);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Attendance checked in successfully.',
        data: clockInDoc,
      });
    }

    // Handle Clock-Out Action
    if (action === 'CLOCK_OUT') {
      const existingToday = await db.collection('attendance').findOne({
        organizationId: orgId,
        employeeId: targetEmpId,
        date: targetDate,
      });

      if (!existingToday || (!existingToday.checkIn && !existingToday.checkInTime)) {
        return NextResponse.json(
          { success: false, message: 'Cannot check out without checking in first.' },
          { status: 400 }
        );
      }

      if (existingToday.checkOut || existingToday.checkOutTime) {
        return NextResponse.json(
          { success: false, message: 'You have already checked out for today.' },
          { status: 400 }
        );
      }

      // Calculate working hours using timestamps as source of truth
      const hoursWorked = calculateWorkingHours(
        existingToday.checkInTime || existingToday.createdAt,
        now,
        existingToday.checkIn,
        nowTimeStr
      );

      const updateData = {
        checkOut: nowTimeStr,
        checkOutTime: now,
        workingHours: hoursWorked,
        updatedAt: now,
      };

      await db.collection('attendance').updateOne(
        { organizationId: orgId, employeeId: targetEmpId, date: targetDate },
        { $set: updateData }
      );

      await logAuditEvent(req, 'CLOCK_OUT', { employeeId: targetEmpId, details: updateData });

      try {
        const orgSettings = await db.collection('organization_settings').findOne({ organizationId: orgId });
        const attRules = orgSettings?.attendance || { workEndTime: '06:00 PM' };
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
        message: 'Attendance checked out successfully.',
        data: { ...existingToday, ...updateData },
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
      method: method || 'Web',
      location: location || 'Office HQ',
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
