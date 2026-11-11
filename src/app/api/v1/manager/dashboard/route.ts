import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { getISTDateString, formatISTTime, formatISTDate } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

// Module-level in-memory cache for organization attendance settings (60s TTL)
let globalCachedOrgSettings: { orgId: string; data: any; expiry: number } | null = null;

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    // Role check: EMPLOYEE cannot access Manager Dashboard
    if (auth.role === 'EMPLOYEE') {
      return NextResponse.json(
        { success: false, message: 'Access Denied: Manager authorization required.' },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();
    const todayIST = getISTDateString(now);
    const managerEmpId = auth.employeeId || auth.userId;

    // 1. Resolve manager direct reports (excluding the manager themselves)
    let teamFilter: any = { organizationId: orgId };
    if (auth.role === 'MANAGER' && managerEmpId) {
      teamFilter.$or = [
        { managerId: managerEmpId },
        { reportingTo: managerEmpId },
      ];
      teamFilter.employeeId = { $ne: managerEmpId };
    }

    // In-memory cache for organization settings to eliminate redundant database calls (60s TTL)
    const nowMs = Date.now();
    let orgSettingsPromise: Promise<any>;
    if (globalCachedOrgSettings && globalCachedOrgSettings.orgId === orgId && globalCachedOrgSettings.expiry > nowMs) {
      orgSettingsPromise = Promise.resolve(globalCachedOrgSettings.data);
    } else {
      orgSettingsPromise = db.collection('organization_settings')
        .findOne({ organizationId: orgId }, { projection: { attendance: 1 } })
        .then((doc) => {
          globalCachedOrgSettings = { orgId, data: doc, expiry: nowMs + 60000 };
          return doc;
        })
        .catch(() => null);
    }

    // Parallel fetch Round 1: direct reports, manager profile, manager attendance, tracking session, org settings, manager notifications
    const [rawTeamEmployees, managerDoc, managerAttDoc, activeTrackSession, orgSettings, rawNotifs] = await Promise.all([
      db.collection('employees').find(teamFilter, {
        projection: {
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
          avatar: 1,
          photoUrl: 1,
          joiningDate: 1,
        },
      }).toArray(),
      db.collection('employees').findOne(
        { organizationId: orgId, $or: [{ employeeId: managerEmpId }, { email: auth.email }] },
        { projection: { firstName: 1, lastName: 1, name: 1, email: 1, department: 1, designation: 1 } }
      ),
      db.collection('attendance').findOne(
        { organizationId: orgId, employeeId: managerEmpId, date: todayIST },
        { projection: { checkIn: 1, checkInTime: 1, clockIn: 1, checkOut: 1, checkOutTime: 1, clockOut: 1, workingHours: 1, status: 1 } }
      ),
      db.collection('tracking_sessions').findOne(
        { organizationId: orgId, $or: [{ userId: auth.userId }, { employeeId: managerEmpId }], status: 'ACTIVE' },
        { projection: { _id: 1, status: 1 } }
      ),
      orgSettingsPromise,
      db.collection('notifications')
        .find(
          { organizationId: orgId, recipientId: auth.userId || managerEmpId, deletedAt: null },
          { projection: { title: 1, message: 1, category: 1, createdAt: 1, status: 1 } }
        )
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray(),
    ]);

    const attRules = orgSettings?.attendance || {};
    const officeLocation = {
      latitude: attRules.officeLat || attRules.officeLatitude || attRules.latitude || 24.58465,
      longitude: attRules.officeLng || attRules.officeLongitude || attRules.longitude || 73.73154,
      radius: attRules.geofenceRadiusMeters || attRules.geofenceRadius || attRules.radiusMeters || 100,
      name: attRules.officeName || 'Office HQ',
      geofenceEnabled: attRules.geofenceEnabled !== false,
      geofenceEnforce: Boolean(attRules.geofenceEnforce),
    };

    // Format manager self-attendance
    const rawSelfIn = managerAttDoc?.checkIn || managerAttDoc?.checkInTime || managerAttDoc?.clockIn;
    const rawSelfOut = managerAttDoc?.checkOut || managerAttDoc?.checkOutTime || managerAttDoc?.clockOut;
    const isSelfCheckedIn = Boolean(rawSelfIn);
    const isSelfCheckedOut = Boolean(rawSelfOut);
    const selfClockIn = rawSelfIn ? formatISTTime(managerAttDoc?.checkInTime || rawSelfIn) : null;
    const selfClockOut = rawSelfOut ? formatISTTime(managerAttDoc?.checkOutTime || rawSelfOut) : null;
    let selfWorkingHours = '--';
    if (managerAttDoc?.workingHours) {
      selfWorkingHours = `${Math.round(Number(managerAttDoc.workingHours) * 10) / 10} hrs`;
    } else if (isSelfCheckedIn && !isSelfCheckedOut) {
      selfWorkingHours = 'In Progress';
    }

    let selfStatus = 'Not Marked';
    if (isSelfCheckedIn && !isSelfCheckedOut) {
      selfStatus = 'Checked In';
    } else if (isSelfCheckedIn && isSelfCheckedOut) {
      selfStatus = 'Shift Finished';
    }

    const managerSelf = {
      employeeId: managerEmpId,
      name: managerDoc?.name || `${managerDoc?.firstName || ''} ${managerDoc?.lastName || ''}`.trim() || auth.name || 'Manager',
      email: managerDoc?.email || auth.email || '',
      department: managerDoc?.department || 'Management',
      designation: managerDoc?.designation || 'Team Lead',
      role: auth.role || 'MANAGER',
      isCheckedIn: isSelfCheckedIn,
      isCheckedOut: isSelfCheckedOut,
      clockIn: selfClockIn,
      clockOut: selfClockOut,
      workingHours: selfWorkingHours,
      status: selfStatus,
      isTracking: Boolean(activeTrackSession),
    };

    const teamEmployees = rawTeamEmployees.map((e: any) => ({
      id: e._id.toString(),
      employeeId: e.employeeId || e.id || e._id.toString(),
      name: `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.name || 'Team Member',
      firstName: e.firstName || '',
      lastName: e.lastName || '',
      email: e.email || '',
      phone: e.phone || '',
      department: e.department || 'General',
      designation: e.designation || 'Staff Member',
      status: e.status || 'Active',
      avatar: e.photoUrl || e.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80',
      joiningDate: e.joiningDate ? formatISTDate(e.joiningDate) : '',
    }));

    const teamEmpIds = teamEmployees.map((e) => e.employeeId);
    const totalTeamMembers = teamEmployees.length;

    // 2. Query team attendance, leaves, reviews, open tickets with strict projection
    const [rawAttendance, rawLeaves, rawReviews, openHelpdeskCount] = await Promise.all([
      teamEmpIds.length > 0
        ? db.collection('attendance').find(
            { organizationId: orgId, employeeId: { $in: teamEmpIds }, date: todayIST },
            { projection: { employeeId: 1, checkIn: 1, checkInTime: 1, clockIn: 1, checkOut: 1, checkOutTime: 1, clockOut: 1, workingHours: 1, status: 1 } }
          ).toArray()
        : Promise.resolve([]),
      teamEmpIds.length > 0
        ? db.collection('leaves').find(
            {
              organizationId: orgId,
              employeeId: { $in: teamEmpIds },
              status: { $in: ['Pending', 'Approved', 'pending', 'approved'] },
            },
            { projection: { employeeId: 1, employeeName: 1, department: 1, designation: 1, leaveType: 1, startDate: 1, endDate: 1, durationDays: 1, reason: 1, status: 1, createdAt: 1, requestedDate: 1 } }
          ).sort({ createdAt: -1 }).toArray()
        : Promise.resolve([]),
      teamEmpIds.length > 0
        ? db.collection('performance_reviews').find(
            { organizationId: orgId, employeeId: { $in: teamEmpIds } },
            { projection: { employeeId: 1, employeeName: 1, overallRating: 1, score: 1, status: 1, goals: 1, reviewPeriod: 1, reviewDate: 1 } }
          ).sort({ reviewDate: -1, createdAt: -1 }).toArray()
        : Promise.resolve([]),
      teamEmpIds.length > 0
        ? db.collection('hr_requests').countDocuments({
            organizationId: orgId,
            employeeId: { $in: teamEmpIds },
            status: { $in: ['Open', 'Assigned', 'In Progress', 'open', 'assigned', 'in progress'] },
          })
        : Promise.resolve(0),
    ]);

    // Format Today's Attendance Map & List
    const todayAttendanceMap = new Map<string, any>();
    rawAttendance.forEach((att: any) => {
      todayAttendanceMap.set(att.employeeId, att);
    });

    // Format Approved Leaves for today
    const approvedLeaveTodayMap = new Map<string, any>();
    let onLeaveTodayCount = 0;
    const pendingLeavesList: any[] = [];

    rawLeaves.forEach((lvl: any) => {
      const st = (lvl.status || '').toLowerCase();
      const startDate = formatISTDate(lvl.startDate);
      const endDate = formatISTDate(lvl.endDate);

      if (st === 'approved' && startDate <= todayIST && todayIST <= endDate) {
        approvedLeaveTodayMap.set(lvl.employeeId, lvl);
        onLeaveTodayCount += 1;
      }

      if (st === 'pending') {
        const emp = teamEmployees.find((e) => e.employeeId === lvl.employeeId);
        pendingLeavesList.push({
          id: lvl._id?.toString() || lvl.id,
          employeeId: lvl.employeeId,
          employeeName: lvl.employeeName || emp?.name || 'Team Member',
          department: emp?.department || lvl.department || 'General',
          designation: emp?.designation || lvl.designation || 'Staff Member',
          avatar: emp?.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80',
          leaveType: lvl.leaveType || 'General Leave',
          startDate,
          endDate,
          durationDays: lvl.durationDays || 1,
          reason: lvl.reason || 'No reason provided',
          requestedDate: formatISTDate(lvl.createdAt || lvl.requestedDate),
          status: 'Pending',
        });
      }
    });

    let presentTodayCount = 0;
    let lateArrivalsCount = 0;
    let absentTodayCount = 0;

    const todayAttendanceList = teamEmployees.map((emp) => {
      const att = todayAttendanceMap.get(emp.employeeId);
      const onLeave = approvedLeaveTodayMap.get(emp.employeeId);
      const rawIn = att?.checkIn || att?.checkInTime || att?.clockIn;
      const rawOut = att?.checkOut || att?.checkOutTime || att?.clockOut;

      const checkInFormatted = rawIn ? formatISTTime(att?.checkInTime || rawIn) : '--:--';
      const checkOutFormatted = rawOut ? formatISTTime(att?.checkOutTime || rawOut) : '--:--';

      let status = 'Not Marked';
      if (onLeave) {
        status = 'On Leave';
      } else if (att) {
        const rawStatus = (att.status || '').toUpperCase();
        if (rawStatus === 'LATE') {
          status = 'Late';
          lateArrivalsCount += 1;
          presentTodayCount += 1;
        } else if (rawStatus === 'PRESENT' || rawStatus === 'CHECKED OUT' || checkInFormatted !== '--:--') {
          status = 'Present';
          presentTodayCount += 1;
        } else if (rawStatus === 'ABSENT') {
          status = 'Absent';
          absentTodayCount += 1;
        } else {
          status = att.status || 'Present';
          presentTodayCount += 1;
        }
      } else {
        // If no attendance and no leave
        const currentHours = now.getHours();
        if (currentHours >= 18) {
          status = 'Absent';
          absentTodayCount += 1;
        } else {
          status = 'Not Marked';
        }
      }

      return {
        id: att?._id?.toString() || `att-${emp.employeeId}`,
        employeeId: emp.employeeId,
        employeeName: emp.name,
        designation: emp.designation,
        department: emp.department,
        avatar: emp.avatar,
        date: todayIST,
        checkIn: checkInFormatted,
        checkOut: checkOutFormatted,
        workingHours: att?.workingHours ? `${Math.round(Number(att.workingHours) * 10) / 10} hrs` : '--',
        status,
      };
    });

    // If absent hasn't been set by evening check, compute remaining unpunched members
    if (absentTodayCount === 0 && totalTeamMembers > (presentTodayCount + onLeaveTodayCount)) {
      absentTodayCount = Math.max(0, totalTeamMembers - presentTodayCount - onLeaveTodayCount);
    }

    const attendanceRate = totalTeamMembers > 0 ? Math.round((presentTodayCount / totalTeamMembers) * 100) : 0;

    // 3. Process Reviews, Goals & OKRs
    const employeeReviewMap = new Map<string, any>();
    let totalScoreSum = 0;
    let scoredReviewsCount = 0;
    let completedReviewsCount = 0;
    let activeReviewsCount = 0;

    let totalGoalsCount = 0;
    let completedGoalsCount = 0;
    let inProgressGoalsCount = 0;
    let notStartedGoalsCount = 0;
    const allExtractedGoals: any[] = [];
    const upcomingReviewsList: any[] = [];

    rawReviews.forEach((rev: any) => {
      const empId = rev.employeeId;
      if (!employeeReviewMap.has(empId)) {
        employeeReviewMap.set(empId, rev);
      }

      const st = (rev.status || '').toLowerCase();
      if (st === 'completed') {
        completedReviewsCount++;
      } else if (st === 'in progress' || st === 'in_progress' || st === 'submitted') {
        activeReviewsCount++;
      }

      const score = Number(rev.overallRating ?? rev.score);
      if (Number.isFinite(score) && score > 0) {
        totalScoreSum += score;
        scoredReviewsCount++;
      }

      // Extract Goals
      if (Array.isArray(rev.goals)) {
        rev.goals.forEach((g: any) => {
          totalGoalsCount++;
          const gst = (g.status || '').toLowerCase();
          if (gst === 'completed') completedGoalsCount++;
          else if (gst === 'in progress' || gst === 'in_progress') inProgressGoalsCount++;
          else notStartedGoalsCount++;

          allExtractedGoals.push({
            id: g.id || `goal-${totalGoalsCount}`,
            title: g.title || 'Team OKR Goal',
            employeeId: rev.employeeId,
            employeeName: rev.employeeName,
            status: g.status || 'In Progress',
            metric: g.metric || 'Deliver target milestones',
            dueDate: g.dueDate ? formatISTDate(g.dueDate) : 'End of Quarter',
          });
        });
      }

      // Check upcoming reviews
      if (st !== 'completed') {
        upcomingReviewsList.push({
          id: rev._id?.toString() || rev.id,
          employeeId: rev.employeeId,
          employeeName: rev.employeeName,
          reviewPeriod: rev.reviewPeriod || 'Quarterly Review',
          dueDate: rev.reviewDate ? formatISTDate(rev.reviewDate) : 'Upcoming',
          status: rev.status || 'Pending',
        });
      }
    });

    const averageTeamRating = scoredReviewsCount > 0 ? Math.round((totalScoreSum / scoredReviewsCount) * 10) / 10 : 0;
    const goalsCompletionRate = totalGoalsCount > 0 ? Math.round((completedGoalsCount / totalGoalsCount) * 100) : 0;
    const pendingReviewsCount = Math.max(0, totalTeamMembers - completedReviewsCount);

    // Attach performance details to each team member
    const teamMembersWithPerformance = teamEmployees.map((emp) => {
      const rev = employeeReviewMap.get(emp.employeeId);
      const att = todayAttendanceList.find((a) => a.employeeId === emp.employeeId);
      const empGoals = allExtractedGoals.filter((g) => g.employeeId === emp.employeeId);
      const empCompletedGoals = empGoals.filter((g) => g.status.toLowerCase() === 'completed').length;

      return {
        ...emp,
        rating: rev?.overallRating ? Number(rev.overallRating) : null,
        reviewStatus: rev?.status || 'Pending',
        completedGoals: empCompletedGoals,
        totalGoals: empGoals.length,
        todayAttendance: {
          status: att?.status || 'Not Marked',
          checkIn: att?.checkIn || '--:--',
          checkOut: att?.checkOut || '--:--',
          workingHours: att?.workingHours || '--',
        },
      };
    });

    // 4. Needs Attention Alerts
    const needsAttention: Array<{ id: string; type: string; title: string; description: string; count: number; link: string; severity: 'high' | 'medium' | 'info' }> = [];

    if (pendingLeavesList.length > 0) {
      needsAttention.push({
        id: 'pending-leaves',
        type: 'leave',
        title: `${pendingLeavesList.length} Pending Leave Approval${pendingLeavesList.length > 1 ? 's' : ''}`,
        description: 'Direct reports awaiting leave review and manager action.',
        count: pendingLeavesList.length,
        link: '/manager/leave',
        severity: 'high',
      });
    }

    if (lateArrivalsCount > 0) {
      needsAttention.push({
        id: 'late-arrivals',
        type: 'attendance',
        title: `${lateArrivalsCount} Late Arrival${lateArrivalsCount > 1 ? 's' : ''} Today`,
        description: 'Team members checked in after the official grace time.',
        count: lateArrivalsCount,
        link: '/manager/attendance',
        severity: 'medium',
      });
    }

    if (absentTodayCount > 0) {
      needsAttention.push({
        id: 'absent-members',
        type: 'attendance',
        title: `${absentTodayCount} Absent / Unpunched Member${absentTodayCount > 1 ? 's' : ''}`,
        description: 'Team members without check-in punch or approved leave today.',
        count: absentTodayCount,
        link: '/manager/attendance',
        severity: 'medium',
      });
    }

    if (pendingReviewsCount > 0) {
      needsAttention.push({
        id: 'pending-reviews',
        type: 'performance',
        title: `${pendingReviewsCount} Pending Appraisal Evaluation${pendingReviewsCount > 1 ? 's' : ''}`,
        description: 'Team performance appraisals awaiting manager scoring and submission.',
        count: pendingReviewsCount,
        link: '/manager/performance',
        severity: 'info',
      });
    }

    // Recent Notifications
    const notificationsList = rawNotifs.map((n: any) => ({
      id: n._id?.toString() || n.id,
      title: n.title || 'Notification',
      message: n.message || '',
      category: n.category || 'SYSTEM',
      createdAt: formatISTDate(n.createdAt),
      status: n.status || 'UNREAD',
    }));

    return NextResponse.json({
      success: true,
      data: {
        manager: {
          name: managerSelf.name,
          email: managerSelf.email,
          role: managerSelf.role,
          employeeId: managerEmpId,
          organizationId: orgId,
          department: managerSelf.department,
          designation: managerSelf.designation,
        },
        managerAttendance: managerSelf,
        officeLocation,
        kpis: {
          totalTeamMembers,
          presentTodayCount,
          absentTodayCount,
          onLeaveTodayCount,
          lateArrivalsCount,
          pendingLeavesCount: pendingLeavesList.length,
          attendanceRate,
          averageTeamRating,
          completedReviewsCount,
          totalGoalsCount,
          goalsCompletionRate,
          openHelpdeskCount,
        },
        todayAttendance: todayAttendanceList,
        teamMembers: teamMembersWithPerformance,
        pendingLeaves: pendingLeavesList,
        goalsSummary: {
          total: totalGoalsCount,
          completed: completedGoalsCount,
          inProgress: inProgressGoalsCount,
          notStarted: notStartedGoalsCount,
          completionRate: goalsCompletionRate,
          recentGoals: allExtractedGoals.slice(0, 5),
        },
        upcomingReviews: upcomingReviewsList.slice(0, 5),
        needsAttention,
        performanceSummary: {
          averageRating: averageTeamRating,
          activeReviews: activeReviewsCount,
          completedReviews: completedReviewsCount,
          pendingReviews: pendingReviewsCount,
        },
        recentNotifications: notificationsList,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/manager/dashboard:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch Manager Dashboard data.' },
      { status: 500 }
    );
  }
}
