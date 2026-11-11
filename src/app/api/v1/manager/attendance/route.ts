import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import {
  getISTDateString,
  formatISTTime,
  formatISTDate,
  calculateWorkingHours,
} from '@/lib/dateUtils';
import { loadAttendanceRules, getGeofenceConfig, evaluateGeofence } from '@/lib/geo';
import { calculateOverdueTime } from '@/utils/attendanceOverdue';
import { startAutoCheckoutCronJob } from '@/jobs/autoCheckoutJob';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    // Role Security Check
    if (auth.role === 'EMPLOYEE') {
      return NextResponse.json(
        { success: false, message: 'Access Denied: Manager authorization required.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.max(1, Math.min(100, parseInt(limitParam, 10))) : 10;
    
    const search = searchParams.get('search')?.trim() || '';
    const dateParam = searchParams.get('date')?.trim() || '';
    const monthParam = searchParams.get('month')?.trim() || '';
    const department = searchParams.get('department')?.trim() || 'All';
    const designation = searchParams.get('designation')?.trim() || 'All';
    const statusParam = searchParams.get('status')?.trim() || 'All';
    const attendanceStatusFilter = searchParams.get('attendanceStatus')?.trim() || 'All';

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();
    const todayIST = getISTDateString(now);
    const rules = await loadAttendanceRules(db, orgId);
    const fence = getGeofenceConfig(rules);

    // Initialize daily auto-checkout background job
    startAutoCheckoutCronJob();

    // Date vs Month Precedence:
    // 1. If dateParam is specified (e.g. 2026-09-21), query specific IST date.
    // 2. If monthParam is specified (e.g. 2026-09) and dateParam is empty, query IST month regex.
    // 3. If neither is specified, default to today IST.
    let targetDate: string | null = null;
    let targetMonth: string | null = null;

    if (dateParam) {
      targetDate = dateParam;
    } else if (monthParam) {
      targetMonth = monthParam;
    } else {
      targetDate = todayIST;
    }

    // 1. Resolve manager identity & team scope (strict server-side enforcement)
    const managerEmpId = auth.employeeId || auth.userId;
    let baseTeamQuery: any = { organizationId: orgId };

    if (auth.role === 'MANAGER' && managerEmpId) {
      baseTeamQuery.$or = [
        { managerId: managerEmpId },
        { reportingTo: managerEmpId },
        { employeeId: managerEmpId },
      ];
    }

    const projection = {
      _id: 1,
      employeeId: 1,
      firstName: 1,
      lastName: 1,
      name: 1,
      email: 1,
      phone: 1,
      department: 1,
      designation: 1,
      status: 1,
      photoUrl: 1,
      avatar: 1,
    };

    // Fetch all team members for KPI computation & filter options
    const allTeamDocs = await db.collection('employees').find(baseTeamQuery, { projection }).toArray();
    const teamEmpIds = allTeamDocs.map((e: any) => e.employeeId || e._id.toString());

    // Query manager's own attendance for today IST
    const managerTodayDoc = await db.collection('attendance').findOne({
      organizationId: orgId,
      employeeId: managerEmpId,
      date: todayIST,
    });

    const isManagerCheckedIn = Boolean(managerTodayDoc?.checkIn || managerTodayDoc?.checkInTime);
    const isManagerCheckedOut = Boolean(managerTodayDoc?.checkOut || managerTodayDoc?.checkOutTime);
    const managerClockIn = managerTodayDoc?.checkIn ? formatISTTime(managerTodayDoc.checkInTime || managerTodayDoc.checkIn) : null;
    const managerClockOut = managerTodayDoc?.checkOut ? formatISTTime(managerTodayDoc.checkOutTime || managerTodayDoc.checkOut) : null;
    let managerWorkHours: string | null = null;
    if (managerTodayDoc?.workingHours != null) {
      managerWorkHours = `${Number(managerTodayDoc.workingHours).toFixed(1)} hrs`;
    }

    const managerAttendance = {
      employeeId: managerEmpId,
      name: auth.name || 'Manager',
      date: todayIST,
      isCheckedIn: isManagerCheckedIn,
      isCheckedOut: isManagerCheckedOut,
      clockIn: managerClockIn,
      clockOut: managerClockOut,
      workingHours: managerWorkHours,
      status: managerTodayDoc?.status || (isManagerCheckedIn ? 'Present' : 'Not Marked'),
    };

    if (teamEmpIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          manager: {
            name: auth.name || 'Manager',
            email: auth.email || '',
            role: auth.role || 'MANAGER',
            employeeId: managerEmpId,
            organizationId: orgId,
          },
          managerAttendance,
          targetDate: targetDate || targetMonth || todayIST,
          kpis: {
            totalTeamMembers: 0,
            presentCount: 0,
            lateCount: 0,
            onLeaveCount: 0,
            absentNotMarkedCount: 0,
            attendanceRate: 0,
          },
          filters: {
            departments: [],
            designations: [],
            statuses: [],
          },
          records: [],
          pagination: {
            total: 0,
            page: 1,
            limit,
            totalPages: 1,
          },
        },
      });
    }

    // 2. Fetch Attendance Records for Team Members
    let attendanceQuery: any = {
      organizationId: orgId,
      employeeId: { $in: teamEmpIds },
    };

    if (targetDate) {
      attendanceQuery.date = targetDate;
    } else if (targetMonth) {
      attendanceQuery.date = { $regex: `^${targetMonth}` };
    }

    const rawAttendanceDocs = await db.collection('attendance').find(attendanceQuery).sort({ date: -1, createdAt: -1 }).toArray();

    // 3. Fetch Approved Leaves for Team Members
    let leaveQuery: any = {
      organizationId: orgId,
      employeeId: { $in: teamEmpIds },
      status: { $in: ['Approved', 'approved'] },
    };

    const rawLeaveDocs = await db.collection('leaves').find(leaveQuery).toArray();

    // Build Maps for efficient reconciliation
    // Key: `${employeeId}_${date}`
    const attendanceMap = new Map<string, any>();
    rawAttendanceDocs.forEach((att: any) => {
      const key = `${att.employeeId}_${att.date}`;
      if (!attendanceMap.has(key)) {
        attendanceMap.set(key, att);
      }
    });

    const leaveMap = new Map<string, any>();
    rawLeaveDocs.forEach((lv: any) => {
      const empId = lv.employeeId;
      const startDateStr = lv.startDate ? getISTDateString(new Date(lv.startDate)) : '';
      const endDateStr = lv.endDate ? getISTDateString(new Date(lv.endDate)) : startDateStr;
      
      // Map leave for the active date scope
      if (targetDate) {
        if (targetDate >= startDateStr && targetDate <= endDateStr) {
          leaveMap.set(`${empId}_${targetDate}`, lv);
        }
      } else {
        leaveMap.set(empId, lv);
      }
    });

    // Helper to format attendance record
    const processMemberAttendance = (emp: any, dateStr: string) => {
      const empId = emp.employeeId || emp._id.toString();
      const key = `${empId}_${dateStr}`;
      const att = attendanceMap.get(key);
      const lv = leaveMap.get(key) || leaveMap.get(empId);

      let attStatus = 'Not Marked';
      let clockIn: string | null = null;
      let clockOut: string | null = null;
      let workHoursNum = 0;
      let workHoursStr = '--';
      let method = att?.method || att?.type || 'Web Portal';
      let location = att?.location || att?.ipAddress || 'Office / Remote';
      let remarks = att?.remarks || att?.notes || att?.reason || null;

      if (lv) {
        attStatus = 'On Leave';
        remarks = remarks || `Approved Leave: ${lv.leaveType || lv.type || 'Leave'}`;
      } else if (att) {
        const rawStatus = (att.status || '').toLowerCase();
        if (rawStatus === 'present') attStatus = 'Present';
        else if (rawStatus === 'late') attStatus = 'Late';
        else if (rawStatus === 'half_day' || rawStatus === 'half-day' || rawStatus === 'half day') attStatus = 'Half Day';
        else if (rawStatus === 'absent') attStatus = 'Absent';
        else if (rawStatus === 'leave' || rawStatus === 'on_leave') attStatus = 'On Leave';
        else attStatus = att.status || 'Present';

        const checkInVal = att.checkIn || att.clockIn;
        const checkOutVal = att.checkOut || att.clockOut;

        if (checkInVal) clockIn = formatISTTime(att.checkInTime || checkInVal);
        if (checkOutVal) clockOut = formatISTTime(att.checkOutTime || checkOutVal);

        // Safe Working Hours Calculation
        let computed = att.workingHours || att.totalHours;
        if (computed === undefined || computed === null || computed === 0) {
          if (checkInVal && checkOutVal) {
            computed = calculateWorkingHours(
              att.checkInTime || att.createdAt,
              att.checkOutTime || att.updatedAt,
              checkInVal,
              checkOutVal
            );
          }
        }

        if (typeof computed === 'number' && !isNaN(computed) && isFinite(computed)) {
          workHoursNum = Math.round(computed * 10) / 10;
          workHoursStr = `${workHoursNum.toFixed(1)} hrs`;
        } else if (typeof computed === 'string' && computed) {
          workHoursStr = computed.includes('hrs') ? computed : `${computed} hrs`;
        }
      }

      const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Employee';

      return {
        id: att?._id?.toString() || `${empId}_${dateStr}`,
        employeeId: empId,
        employeeName: fullName,
        firstName: emp.firstName || '',
        lastName: emp.lastName || '',
        email: emp.email || '',
        phone: emp.phone || '',
        department: emp.department || 'General',
        designation: emp.designation || 'Staff Member',
        employmentStatus: emp.status || 'Active',
        photoUrl: emp.photoUrl || emp.avatar || null,
        date: dateStr,
        formattedDate: formatISTDate(dateStr),
        clockIn,
        clockOut,
        workingHours: workHoursStr,
        status: attStatus,
        method,
        location,
        remarks,
      };
    };

    // Build complete record set for target Date or Month
    let allRecords: any[] = [];

    if (targetDate) {
      allRecords = allTeamDocs.map((emp) => processMemberAttendance(emp, targetDate));
    } else if (targetMonth) {
      // Month mode: combine attendance records for the month with team profiles
      if (rawAttendanceDocs.length > 0) {
        allRecords = rawAttendanceDocs.map((att: any) => {
          const emp = allTeamDocs.find((e) => (e.employeeId || e._id.toString()) === att.employeeId);
          if (emp) {
            return processMemberAttendance(emp, att.date);
          }
          return {
            id: att._id.toString(),
            employeeId: att.employeeId,
            employeeName: att.employeeName || att.employeeId,
            email: att.email || '',
            department: att.department || 'General',
            designation: att.designation || 'Staff Member',
            employmentStatus: 'Active',
            photoUrl: null,
            date: att.date,
            formattedDate: formatISTDate(att.date),
            clockIn: att.checkIn ? formatISTTime(att.checkIn) : '--:--',
            clockOut: att.checkOut ? formatISTTime(att.checkOut) : '--:--',
            workingHours: att.workingHours ? `${Number(att.workingHours).toFixed(1)} hrs` : '--',
            status: att.status || 'Present',
            method: att.method || 'Web Portal',
            location: att.location || 'Office / Remote',
            remarks: att.remarks || null,
          };
        });
      } else {
        // If no attendance logs in month yet, generate for today IST as fallback
        allRecords = allTeamDocs.map((emp) => processMemberAttendance(emp, todayIST));
      }
    }

    // 4. Compute Real Team KPIs
    const totalTeamMembers = allTeamDocs.length;
    let presentCount = 0;
    let lateCount = 0;
    let onLeaveCount = 0;
    let absentNotMarkedCount = 0;

    allRecords.forEach((r) => {
      const s = r.status.toLowerCase();
      if (s === 'present') presentCount++;
      else if (s === 'late') {
        presentCount++;
        lateCount++;
      } else if (s === 'half day' || s === 'half_day') presentCount++;
      else if (s === 'on leave' || s === 'leave') onLeaveCount++;
      else absentNotMarkedCount++;
    });

    const attendanceRate = totalTeamMembers > 0
      ? Math.round((presentCount / totalTeamMembers) * 1000) / 10
      : 0;

    // Dynamic Filter Option Lists
    const availableDepartments = Array.from(
      new Set(allTeamDocs.map((m) => m.department).filter(Boolean))
    ).sort();
    const availableDesignations = Array.from(
      new Set(allTeamDocs.map((m) => m.designation).filter(Boolean))
    ).sort();
    const availableStatuses = Array.from(
      new Set(allTeamDocs.map((m) => m.status).filter(Boolean))
    ).sort();

    // 5. Apply Search & Filters safely ($and logic)
    let filteredRecords = allRecords;

    if (department !== 'All') {
      filteredRecords = filteredRecords.filter((r) => r.department === department);
    }
    if (designation !== 'All') {
      filteredRecords = filteredRecords.filter((r) => r.designation === designation);
    }
    if (statusParam !== 'All') {
      filteredRecords = filteredRecords.filter(
        (r) => r.employmentStatus.toLowerCase() === statusParam.toLowerCase()
      );
    }
    if (attendanceStatusFilter !== 'All') {
      filteredRecords = filteredRecords.filter(
        (r) => r.status.toLowerCase() === attendanceStatusFilter.toLowerCase()
      );
    }
    if (search) {
      const q = search.toLowerCase();
      filteredRecords = filteredRecords.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.employeeId.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.designation.toLowerCase().includes(q)
      );
    }

    const totalFilteredCount = filteredRecords.length;

    // 6. Pagination Slicing
    const totalPages = Math.ceil(totalFilteredCount / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedRecords = filteredRecords.slice(startIndex, startIndex + limit);

    // 7. Compute Live Attendance Exceptions (ignoring active check-ins until shift end + 30m grace)
    const exceptions: any[] = [];
    const shiftEndTime = rules?.workEndTime || '06:00 PM';
    const gracePeriodMinutes = 30; // 30-minute grace period before check-out is overdue

    allRecords.forEach((r) => {
      const cleanClockIn = r.clockIn && r.clockIn !== '--:--' ? r.clockIn : null;
      const cleanClockOut = r.clockOut && r.clockOut !== '--:--' ? r.clockOut : null;

      if (cleanClockIn && !cleanClockOut && r.status !== 'On Leave' && r.status !== 'Absent') {
        const overdue = calculateOverdueTime({
          clockIn: cleanClockIn,
          clockOut: cleanClockOut,
          date: r.date,
          shiftEndTime,
          gracePeriodMinutes,
          currentTime: now,
          timeZone: 'Asia/Kolkata',
        });

        // Only flag if overdue time calculation is true (shift end time + 30m grace period have passed)
        if (overdue.isOverdue) {
          exceptions.push({
            id: `ex-missing-${r.employeeId}-${r.date}`,
            employeeId: r.employeeId,
            employeeName: r.employeeName,
            photoUrl: r.photoUrl,
            type: 'Missing Check-out',
            timestamp: `${r.formattedDate} • ${r.clockIn}`,
            detail: overdue.formattedOverdue || 'Overdue check-out',
            severity: 'error',
          });
        }
      } else if (r.status.toLowerCase() === 'late') {
        let lateDetail = 'Late Arrival';
        if (cleanClockIn) {
          const startTimeStr = rules?.workStartTime || '09:00 AM';
          const matchStart = startTimeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
          const matchIn = cleanClockIn.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
          if (matchStart && matchIn) {
            let startH = parseInt(matchStart[1], 10);
            const startM = parseInt(matchStart[2], 10);
            if (matchStart[3]?.toUpperCase() === 'PM' && startH < 12) startH += 12;
            if (matchStart[3]?.toUpperCase() === 'AM' && startH === 12) startH = 0;

            let inH = parseInt(matchIn[1], 10);
            const inM = parseInt(matchIn[2], 10);
            if (matchIn[3]?.toUpperCase() === 'PM' && inH < 12) inH += 12;
            if (matchIn[3]?.toUpperCase() === 'AM' && inH === 12) inH = 0;

            const diffMins = (inH * 60 + inM) - (startH * 60 + startM);
            if (diffMins > 0) {
              const h = Math.floor(diffMins / 60);
              const m = diffMins % 60;
              lateDetail = h > 0 ? `${h}h ${m}m late` : `${m}m late`;
            }
          }
        }
        exceptions.push({
          id: `ex-late-${r.employeeId}-${r.date}`,
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          photoUrl: r.photoUrl,
          type: 'Late Arrival',
          timestamp: `${r.formattedDate} • ${r.clockIn || '--'}`,
          detail: lateDetail,
          severity: 'warning',
        });
      } else if (r.status.toLowerCase() === 'half day' || r.status.toLowerCase() === 'half_day') {
        exceptions.push({
          id: `ex-early-${r.employeeId}-${r.date}`,
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          photoUrl: r.photoUrl,
          type: 'Check-out Early',
          timestamp: `${r.formattedDate} • ${r.clockOut || r.clockIn || '--'}`,
          detail: 'Shift ended early (< 4 hrs)',
          severity: 'info',
        });
      }
    });

    // 8. Compute Real-time Activity Timeline
    const recentActivity: any[] = [];
    allRecords.forEach((r) => {
      if (r.clockIn) {
        recentActivity.push({
          id: `act-in-${r.employeeId}`,
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          action: `Checked in at ${r.clockIn}`,
          type: 'check_in',
          dotColor: 'emerald',
        });
      }
      if (r.clockOut) {
        recentActivity.push({
          id: `act-out-${r.employeeId}`,
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          action: `Checked out at ${r.clockOut}`,
          type: 'check_out',
          dotColor: 'purple',
        });
      }
    });

    // Compute accurate team location summary from live tracking sessions & GPS records
    const activeSessions = await db.collection('tracking_sessions').find({
      organizationId: orgId,
      employeeId: { $in: teamEmpIds },
      date: todayIST,
      status: 'ACTIVE',
    }).toArray();
    const activeSessionMap = new Map<string, any>(activeSessions.map((s: any) => [s.employeeId, s]));

    let atOfficeCount = 0;
    let onLocationCount = 0;
    let outsideGeofenceCount = 0;

    allRecords.forEach((r) => {
      const sess = activeSessionMap.get(r.employeeId);
      const rawGeo = r.geo || r.checkInGeo;
      const lat = Number(sess?.lastLat ?? rawGeo?.latitude ?? r.latitude);
      const lng = Number(sess?.lastLng ?? rawGeo?.longitude ?? r.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
        if (fence) {
          const evalRes = evaluateGeofence({ lat, lng, accuracy: sess?.lastAccuracy ?? rawGeo?.accuracy }, fence);
          if (evalRes.withinGeofence) atOfficeCount++;
          else outsideGeofenceCount++;
        } else {
          onLocationCount++;
        }
      }
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          manager: {
            name: auth.name || 'Manager',
            email: auth.email || '',
            role: auth.role || 'MANAGER',
            employeeId: managerEmpId,
            organizationId: orgId,
          },
          managerAttendance,
          targetDate: targetDate || targetMonth || todayIST,
          officeLocation: {
            lat: Number.isFinite(Number(rules?.officeLat)) && Number(rules?.officeLat) !== 0 ? Number(rules?.officeLat) : 24.5845267,
            lng: Number.isFinite(Number(rules?.officeLng)) && Number(rules?.officeLng) !== 0 ? Number(rules?.officeLng) : 73.7314268,
            radiusMeters: Number(rules?.geofenceRadiusMeters) || 200,
            name: rules?.officeName || 'Head Office HQ',
            geofenceEnabled: rules?.geofenceEnabled !== false,
            geofenceEnforce: Boolean(rules?.geofenceEnforce),
          },
          geofence: {
            lat: Number.isFinite(Number(rules?.officeLat)) && Number(rules?.officeLat) !== 0 ? Number(rules?.officeLat) : 24.5845267,
            lng: Number.isFinite(Number(rules?.officeLng)) && Number(rules?.officeLng) !== 0 ? Number(rules?.officeLng) : 73.7314268,
            radiusMeters: Number(rules?.geofenceRadiusMeters) || 200,
            name: rules?.officeName || 'Head Office HQ',
            enforce: Boolean(rules?.geofenceEnforce),
            geofenceEnabled: rules?.geofenceEnabled !== false,
          },
          kpis: {
            totalTeamMembers,
            presentCount,
            lateCount,
            onLeaveCount,
            absentNotMarkedCount,
            attendanceRate,
          },
          filters: {
            departments: availableDepartments,
            designations: availableDesignations,
            statuses: availableStatuses,
          },
          records: paginatedRecords,
          exceptions: exceptions.slice(0, 5),
          recentActivity: recentActivity.slice(0, 6),
          locationSummary: {
            atOffice: atOfficeCount,
            onLocation: onLocationCount,
            outsideGeofence: outsideGeofenceCount,
          },
          pagination: {
            total: totalFilteredCount,
            page,
            limit,
            totalPages,
          },
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (error: any) {
    console.error('Error fetching manager attendance data:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load team attendance records.' },
      { status: 500 }
    );
  }
}
