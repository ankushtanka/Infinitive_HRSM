import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { getISTDateString, formatISTDate } from '@/lib/dateUtils';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    // Role Security Check: Strictly enforce MANAGER or administrative role access
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
    const statusFilter = searchParams.get('status')?.trim() || 'All';
    const reviewPeriodFilter = searchParams.get('reviewPeriod')?.trim() || 'All';
    const departmentFilter = searchParams.get('department')?.trim() || 'All';
    const designationFilter = searchParams.get('designation')?.trim() || 'All';

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();
    const todayIST = getISTDateString(now);

    // 1. Resolve Manager identity & Team Scope (strict server-derived enforcement)
    const managerEmpId = auth.employeeId || auth.userId;
    let baseTeamQuery: any = { organizationId: orgId };

    if (auth.role === 'MANAGER' && managerEmpId) {
      baseTeamQuery.$or = [
        { managerId: managerEmpId },
        { reportingTo: managerEmpId },
      ];
    }

    const projection = {
      _id: 1,
      employeeId: 1,
      firstName: 1,
      lastName: 1,
      name: 1,
      email: 1,
      department: 1,
      designation: 1,
      status: 1,
      photoUrl: 1,
      avatar: 1,
    };

    // Fetch direct reports matching team scope
    const allTeamDocs = await db.collection('employees').find(baseTeamQuery, { projection }).toArray();
    const teamEmpIds = allTeamDocs.map((e: any) => e.employeeId || e._id.toString());

    const emptyResponse = {
      manager: {
        name: auth.name || 'Manager',
        email: auth.email || '',
        role: auth.role || 'MANAGER',
        employeeId: managerEmpId,
        organizationId: orgId,
      },
      kpis: {
        totalTeamMembers: 0,
        activeReviewsCount: 0,
        completedReviewsCount: 0,
        pendingReviewsCount: 0,
        averagePerformanceScore: 0,
        totalGoalsCount: 0,
        goalsCompletedCount: 0,
        goalsCompletionRate: 0,
      },
      analytics: {
        trend: [],
        distribution: [
          { tier: 'Exceptional', label: '4.5 - 5.0 ★', count: 0, percentage: 0, color: '#10b981' },
          { tier: 'Exceeds', label: '4.0 - 4.4 ★', count: 0, percentage: 0, color: '#6366f1' },
          { tier: 'Meets', label: '3.0 - 3.9 ★', count: 0, percentage: 0, color: '#f59e0b' },
          { tier: 'Needs Improvement', label: '< 3.0 ★', count: 0, percentage: 0, color: '#ef4444' },
        ],
        totalReviewedEmployees: 0,
        departmentPerformance: [],
      },
      goalsSummary: {
        total: 0,
        completed: 0,
        inProgress: 0,
        notStarted: 0,
        completionRate: 0,
        recentGoals: [],
      },
      upcomingReviews: [],
      needsAttention: {
        overdueReviews: [],
        pendingEvaluations: [],
        goalsAtRisk: [],
      },
      appraisalHistory: [],
      teamMembers: [],
      filters: {
        departments: [],
        designations: [],
        statuses: ['Pending', 'In Progress', 'Submitted', 'Completed', 'Draft'],
        reviewPeriods: [],
      },
      reviews: [],
      pagination: {
        total: 0,
        page: 1,
        limit,
        totalPages: 1,
      },
    };

    if (teamEmpIds.length === 0) {
      return NextResponse.json({ success: true, data: emptyResponse });
    }

    // 2. Fetch all performance reviews for team members
    const allTeamReviews = await db
      .collection('performance_reviews')
      .find({ organizationId: orgId, employeeId: { $in: teamEmpIds } })
      .sort({ reviewDate: -1, createdAt: -1 })
      .toArray();

    // 3. Compute Real Team KPIs & Goals
    let activeReviewsCount = 0;
    let completedReviewsCount = 0;
    let pendingReviewsCount = 0;
    let totalRatingSum = 0;
    let ratedReviewsCount = 0;
    let totalGoalsCount = 0;
    let goalsCompletedCount = 0;
    let goalsInProgressCount = 0;
    let goalsNotStartedCount = 0;

    const reviewedEmpSet = new Set<string>();
    const allExtractedGoals: any[] = [];

    // Distribution counters
    let exceptionalCount = 0;
    let exceedsCount = 0;
    let meetsCount = 0;
    let needsImprovementCount = 0;

    // Cycle & Trend aggregation
    const cycleMap = new Map<string, { totalScore: number; count: number; date: string }>();

    allTeamReviews.forEach((rev: any) => {
      const st = (rev.status || '').toLowerCase();
      if (st === 'completed') {
        completedReviewsCount++;
      } else if (st === 'in progress' || st === 'in_progress' || st === 'submitted') {
        activeReviewsCount++;
      } else if (st === 'pending' || st === 'draft') {
        pendingReviewsCount++;
      }

      reviewedEmpSet.add(rev.employeeId);

      const ratingNum = Number(rev.rating || rev.score || rev.finalRating);
      if (!isNaN(ratingNum) && ratingNum > 0) {
        totalRatingSum += ratingNum;
        ratedReviewsCount++;

        if (ratingNum >= 4.5) exceptionalCount++;
        else if (ratingNum >= 4.0) exceedsCount++;
        else if (ratingNum >= 3.0) meetsCount++;
        else needsImprovementCount++;

        // Aggregate for trend
        const cycle = rev.reviewPeriod || rev.cycle || 'Q3 2026';
        const cur = cycleMap.get(cycle) || { totalScore: 0, count: 0, date: rev.reviewDate || rev.createdAt || '' };
        cur.totalScore += ratingNum;
        cur.count++;
        cycleMap.set(cycle, cur);
      }

      // Process Goals
      if (Array.isArray(rev.goals)) {
        rev.goals.forEach((g: any) => {
          totalGoalsCount++;
          const gst = typeof g === 'string' ? 'in progress' : String(g.status || '').toLowerCase();
          const gpct = Number(g.completionPercentage || g.progress || 0);

          const isDone = gst === 'completed' || gpct >= 100;
          const isInProg = !isDone && (gst === 'in progress' || gst === 'in_progress' || gpct > 0);

          if (isDone) goalsCompletedCount++;
          else if (isInProg) goalsInProgressCount++;
          else goalsNotStartedCount++;

          const emp = allTeamDocs.find((e) => (e.employeeId || e._id.toString()) === rev.employeeId);
          allExtractedGoals.push({
            title: typeof g === 'string' ? g : g.title || 'Goal',
            target: g.target || 'Target completion',
            status: isDone ? 'Completed' : isInProg ? 'In Progress' : 'Not Started',
            dueDate: g.dueDate || '2026-11-30',
            employeeId: rev.employeeId,
            employeeName: rev.employeeName || `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim() || 'Team Member',
          });
        });
      }
    });

    // Count team members without any review as pending reviews
    const unreviewedTeamMembers = allTeamDocs.filter((e) => !reviewedEmpSet.has(e.employeeId || e._id.toString()));
    pendingReviewsCount += unreviewedTeamMembers.length;

    const averagePerformanceScore = ratedReviewsCount > 0
      ? Math.round((totalRatingSum / ratedReviewsCount) * 10) / 10
      : 0;

    const goalsCompletionRate = totalGoalsCount > 0
      ? Math.round((goalsCompletedCount / totalGoalsCount) * 100)
      : 0;

    // 4. Performance Trend Data (Chronological)
    let trendData: Array<{ period: string; score: number; count: number }> = [];
    if (cycleMap.size > 0) {
      trendData = Array.from(cycleMap.entries()).map(([period, val]) => ({
        period,
        score: Math.round((val.totalScore / val.count) * 10) / 10,
        count: val.count,
      }));
    } else {
      // Default initial baseline point
      trendData = [{ period: 'Q3 2026', score: averagePerformanceScore || 4.0, count: 1 }];
    }

    // 5. Rating Distribution Data
    const totalRated = ratedReviewsCount || 1;
    const distributionData = [
      {
        tier: 'Exceptional',
        label: '4.5 - 5.0 ★',
        count: exceptionalCount,
        percentage: Math.round((exceptionalCount / totalRated) * 100),
        color: '#10b981',
      },
      {
        tier: 'Exceeds',
        label: '4.0 - 4.4 ★',
        count: exceedsCount,
        percentage: Math.round((exceedsCount / totalRated) * 100),
        color: '#6366f1',
      },
      {
        tier: 'Meets',
        label: '3.0 - 3.9 ★',
        count: meetsCount,
        percentage: Math.round((meetsCount / totalRated) * 100),
        color: '#f59e0b',
      },
      {
        tier: 'Needs Improvement',
        label: '< 3.0 ★',
        count: needsImprovementCount,
        percentage: Math.round((needsImprovementCount / totalRated) * 100),
        color: '#ef4444',
      },
    ];

    // 6. Department Performance Breakdown
    const deptMap = new Map<string, { totalRating: number; ratedCount: number; members: number }>();
    allTeamDocs.forEach((emp) => {
      const d = emp.department || 'General';
      const cur = deptMap.get(d) || { totalRating: 0, ratedCount: 0, members: 0 };
      cur.members++;
      deptMap.set(d, cur);
    });

    allTeamReviews.forEach((rev) => {
      const emp = allTeamDocs.find((e) => (e.employeeId || e._id.toString()) === rev.employeeId);
      const d = emp?.department || rev.department || 'General';
      const r = Number(rev.rating || rev.score || rev.finalRating);
      if (deptMap.has(d) && !isNaN(r) && r > 0) {
        const cur = deptMap.get(d)!;
        cur.totalRating += r;
        cur.ratedCount++;
      }
    });

    const departmentPerformance = Array.from(deptMap.entries()).map(([department, data]) => {
      const avg = data.ratedCount > 0 ? Math.round((data.totalRating / data.ratedCount) * 10) / 10 : averagePerformanceScore || 4.0;
      return {
        department,
        averageRating: avg,
        employeeCount: data.members,
        maxScore: 5.0,
      };
    });

    // 7. Upcoming Reviews Widget
    const upcomingReviews = unreviewedTeamMembers.map((emp) => {
      const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Team Member';
      return {
        employeeId: emp.employeeId || emp._id.toString(),
        employeeName: fullName,
        department: emp.department || 'General',
        designation: emp.designation || 'Staff',
        photoUrl: emp.photoUrl || emp.avatar || null,
        reviewCycle: 'Q4 2026',
        dueDate: '31 Oct 2026',
        daysRemaining: 18,
        status: 'Pending',
      };
    });

    // If all team members have reviews, add upcoming review cycle for the latest
    if (upcomingReviews.length === 0 && allTeamDocs.length > 0) {
      allTeamDocs.slice(0, 3).forEach((emp) => {
        const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Team Member';
        upcomingReviews.push({
          employeeId: emp.employeeId || emp._id.toString(),
          employeeName: fullName,
          department: emp.department || 'General',
          designation: emp.designation || 'Staff',
          photoUrl: emp.photoUrl || emp.avatar || null,
          reviewCycle: 'Q4 2026',
          dueDate: '15 Nov 2026',
          daysRemaining: 33,
          status: 'Upcoming',
        });
      });
    }

    // 8. Needs Attention Widget
    const needsAttention = {
      overdueReviews: allTeamReviews
        .filter((r) => (r.status || '').toLowerCase() === 'pending')
        .map((r) => ({
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          issue: 'Review pending evaluation',
          cycle: r.reviewPeriod || r.cycle,
        })),
      pendingEvaluations: unreviewedTeamMembers.map((emp) => ({
        employeeId: emp.employeeId || emp._id.toString(),
        employeeName: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name,
        issue: 'No appraisal conducted yet',
      })),
      goalsAtRisk: allExtractedGoals
        .filter((g) => g.status === 'In Progress')
        .slice(0, 3)
        .map((g) => ({
          employeeName: g.employeeName,
          goalTitle: g.title,
          status: 'In Progress (Target Pending)',
        })),
    };

    // 9. Appraisal History (Completed Reviews)
    const appraisalHistory = allTeamReviews
      .filter((r) => (r.status || '').toLowerCase() === 'completed')
      .map((r) => {
        const emp = allTeamDocs.find((e) => (e.employeeId || e._id.toString()) === r.employeeId);
        return {
          id: r._id.toString(),
          reviewId: r.id || r._id.toString(),
          employeeId: r.employeeId,
          employeeName: r.employeeName || `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim() || 'Employee',
          department: emp?.department || r.department || 'General',
          designation: emp?.designation || r.designation || 'Staff',
          rating: Number(r.rating || r.score || r.finalRating || 0),
          reviewPeriod: r.reviewPeriod || r.cycle || 'Q3 2026',
          reviewDate: r.reviewDate ? formatISTDate(r.reviewDate) : formatISTDate(r.createdAt),
          feedback: r.feedback || r.managerNotes || '',
          reviewer: r.reviewer || auth.name || 'Manager',
        };
      });

    // 10. Direct Reports Clean List for Modals
    const teamMembers = allTeamDocs.map((emp) => ({
      employeeId: emp.employeeId || emp._id.toString(),
      name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Team Member',
      department: emp.department || 'General',
      designation: emp.designation || 'Staff',
      photoUrl: emp.photoUrl || emp.avatar || null,
    }));

    // Dynamic Filter Lists
    const availableDepartments = Array.from(
      new Set(allTeamDocs.map((m) => m.department).filter(Boolean))
    ).sort();
    const availableDesignations = Array.from(
      new Set(allTeamDocs.map((m) => m.designation).filter(Boolean))
    ).sort();
    const availableReviewPeriods = Array.from(
      new Set(allTeamReviews.map((r) => r.reviewPeriod || r.cycle).filter(Boolean))
    ).sort();

    // 11. Safe $and Query Composition for Main List
    const andConditions: any[] = [
      { organizationId: orgId },
      { employeeId: { $in: teamEmpIds } },
    ];

    if (statusFilter !== 'All') {
      andConditions.push({ status: { $regex: `^${statusFilter}$`, $options: 'i' } });
    }

    if (reviewPeriodFilter !== 'All') {
      andConditions.push({
        $or: [
          { reviewPeriod: { $regex: reviewPeriodFilter, $options: 'i' } },
          { cycle: { $regex: reviewPeriodFilter, $options: 'i' } },
        ],
      });
    }

    if (departmentFilter !== 'All' || designationFilter !== 'All') {
      const filteredEmpDocs = allTeamDocs.filter((e) => {
        const matchesDept = departmentFilter === 'All' || e.department === departmentFilter;
        const matchesDesg = designationFilter === 'All' || e.designation === designationFilter;
        return matchesDept && matchesDesg;
      });
      const filteredEmpIds = filteredEmpDocs.map((e) => e.employeeId || e._id.toString());
      andConditions.push({ employeeId: { $in: filteredEmpIds } });
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      andConditions.push({
        $or: [
          { employeeName: regex },
          { employeeId: regex },
          { reviewer: regex },
          { reviewPeriod: regex },
          { feedback: regex },
        ],
      });
    }

    const performanceQuery = andConditions.length > 1 ? { $and: andConditions } : andConditions[0];

    const totalFilteredCount = await db.collection('performance_reviews').countDocuments(performanceQuery);
    const skip = (page - 1) * limit;

    const rawReviews = await db
      .collection('performance_reviews')
      .find(performanceQuery)
      .sort({ reviewDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Enrich performance records with employee profile details
    const formattedReviews = rawReviews.map((rev: any) => {
      const emp = allTeamDocs.find((e) => (e.employeeId || e._id.toString()) === rev.employeeId);
      const fullName = rev.employeeName || `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim() || emp?.name || 'Employee';

      const goalsList = Array.isArray(rev.goals)
        ? rev.goals.map((g: any) => (typeof g === 'string' ? { title: g, status: 'In Progress' } : g))
        : [];

      const completedGCount = goalsList.filter((g: any) => String(g.status || '').toLowerCase() === 'completed').length;

      return {
        id: rev._id.toString(),
        reviewId: rev.id || rev._id.toString(),
        employeeId: rev.employeeId,
        employeeName: fullName,
        email: emp?.email || '',
        department: emp?.department || 'General',
        designation: emp?.designation || 'Staff Member',
        photoUrl: emp?.photoUrl || emp?.avatar || null,
        reviewer: rev.reviewer || auth.name || 'Manager',
        reviewPeriod: rev.reviewPeriod || rev.cycle || 'Q3 2026',
        reviewDate: rev.reviewDate ? formatISTDate(rev.reviewDate) : formatISTDate(rev.createdAt),
        rating: Number(rev.rating || rev.score || rev.finalRating || 0),
        feedback: rev.feedback || rev.managerNotes || '',
        selfAssessment: rev.selfAssessment || '',
        strengths: rev.strengths || '',
        improvements: rev.improvements || '',
        status: rev.status || 'Completed',
        goals: goalsList,
        goalsCount: goalsList.length,
        goalsCompletedCount: completedGCount,
        competencies: rev.competencies || null,
        promotionRecommendation: rev.promotionRecommendation || null,
        updatedAt: rev.updatedAt ? formatISTDate(rev.updatedAt) : formatISTDate(rev.createdAt),
      };
    });

    const totalPages = Math.ceil(totalFilteredCount / limit) || 1;

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
        kpis: {
          totalTeamMembers: allTeamDocs.length,
          activeReviewsCount,
          completedReviewsCount,
          pendingReviewsCount,
          averagePerformanceScore,
          totalGoalsCount,
          goalsCompletedCount,
          goalsCompletionRate,
        },
        analytics: {
          trend: trendData,
          distribution: distributionData,
          totalReviewedEmployees: ratedReviewsCount,
          departmentPerformance,
        },
        goalsSummary: {
          total: totalGoalsCount,
          completed: goalsCompletedCount,
          inProgress: goalsInProgressCount,
          notStarted: goalsNotStartedCount,
          completionRate: goalsCompletionRate,
          recentGoals: allExtractedGoals.slice(0, 5),
        },
        upcomingReviews,
        needsAttention,
        appraisalHistory,
        teamMembers,
        filters: {
          departments: availableDepartments,
          designations: availableDesignations,
          statuses: ['Pending', 'In Progress', 'Submitted', 'Completed', 'Draft'],
          reviewPeriods: availableReviewPeriods,
        },
        reviews: formattedReviews,
        pagination: {
          total: totalFilteredCount,
          page,
          limit,
          totalPages,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching manager performance data:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load team performance records.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/manager/performance
 * Handles:
 * 1. SUBMIT_EVALUATION / Standard Appraisal Submission
 * 2. ASSIGN_GOAL: Add a new goal to team member
 * 3. RECOMMEND_PROMOTION: Recommend employee for promotion
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const { action = 'SUBMIT_EVALUATION', employeeId } = body;

    if (!employeeId || !String(employeeId).trim()) {
      return NextResponse.json({ success: false, message: 'Employee ID is required.' }, { status: 400 });
    }

    const cleanEmpId = String(employeeId).trim();
    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    if (!orgId && auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, message: 'Organization context is missing.' }, { status: 400 });
    }
    const now = new Date();

    // Verify manager ownership: manager must manage this employee within the authorized organization
    const managerEmpId = auth.employeeId || auth.userId;
    if (auth.role === 'MANAGER') {
      if (!managerEmpId) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized: Manager identity cannot be verified.' },
          { status: 403 }
        );
      }
      const teamQuery: any = {
        employeeId: cleanEmpId,
        $or: [{ managerId: managerEmpId }, { reportingTo: managerEmpId }],
      };
      if (orgId) {
        teamQuery.organizationId = orgId;
      }
      const isTeamMember = await db.collection('employees').findOne(teamQuery);
      if (!isTeamMember) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized: You can only manage performance for employees in your team.' },
          { status: 403 }
        );
      }
    }

    // Lookup employee profile for enriched naming with strict organization scope
    const empLookupQuery: any = { employeeId: cleanEmpId };
    if (orgId) {
      empLookupQuery.organizationId = orgId;
    }
    const empDoc = await db.collection('employees').findOne(empLookupQuery);
    if (!empDoc) {
      return NextResponse.json(
        { success: false, message: 'Employee not found in the authorized organization.' },
        { status: 404 }
      );
    }

    const empName = body.employeeName || `${empDoc.firstName || ''} ${empDoc.lastName || ''}`.trim() || empDoc.name || 'Employee';
    const dept = body.department || empDoc.department || 'General';

    // 1. Action: Assign Goal / OKR
    if (action === 'ASSIGN_GOAL') {
      const goalObj = body.goal || {
        title: body.title,
        target: body.metric || body.target,
        dueDate: body.dueDate,
        priority: body.priority,
      };

      if (!goalObj || !goalObj.title?.trim()) {
        return NextResponse.json({ success: false, message: 'Goal title is required.' }, { status: 400 });
      }

      const newGoalDoc = {
        title: goalObj.title.trim(),
        target: goalObj.target?.trim() || '100% completion',
        dueDate: goalObj.dueDate || '2026-11-30',
        priority: goalObj.priority || 'Medium',
        status: 'In Progress',
        progress: 0,
        assignedBy: auth.name || 'Manager',
        assignedAt: now,
      };

      // Find active review or create a new review record
      const existing = await db.collection('performance_reviews').findOne({
        employeeId: cleanEmpId,
        status: { $in: ['In Progress', 'Goal Setting', 'Draft', 'Pending'] },
      });

      if (existing) {
        await db.collection('performance_reviews').updateOne(
          { _id: existing._id },
          { $push: { goals: newGoalDoc } as any, $set: { updatedAt: now } }
        );
      } else {
        const newReview = {
          id: `perf-${Date.now()}`,
          organizationId: orgId,
          employeeId: cleanEmpId,
          employeeName: empName,
          department: dept,
          reviewer: auth.name || 'Manager',
          reviewPeriod: body.reviewPeriod || 'Q4 2026',
          cycle: body.reviewPeriod || 'Q4 2026',
          reviewDate: now.toISOString().split('T')[0],
          rating: 4.0,
          score: 4.0,
          status: 'In Progress',
          goals: [newGoalDoc],
          createdAt: now,
          updatedAt: now,
        };
        await db.collection('performance_reviews').insertOne(newReview);
      }

      await logAuditEvent(req, 'ASSIGN_PERFORMANCE_GOAL', { employeeId: cleanEmpId, details: newGoalDoc });
      return NextResponse.json({
        success: true,
        message: `Goal "${newGoalDoc.title}" assigned successfully to ${empName}.`,
        data: newGoalDoc,
      });
    }

    // 2. Action: Recommend Promotion
    if (action === 'RECOMMEND_PROMOTION') {
      const { proposedRole, justification, currentRating } = body;
      if (!proposedRole?.trim()) {
        return NextResponse.json({ success: false, message: 'Proposed role/designation is required.' }, { status: 400 });
      }

      const recommendationData = {
        recommended: true,
        proposedRole: proposedRole.trim(),
        justification: justification?.trim() || 'Exemplary performance and goal delivery.',
        currentRating: Number(currentRating) || 4.5,
        recommendedBy: auth.name || 'Manager',
        recommendedById: managerEmpId,
        recommendedAt: now,
        status: 'PENDING_HR_APPROVAL',
      };

      await db.collection('performance_reviews').updateMany(
        { employeeId: cleanEmpId },
        { $set: { promotionRecommendation: recommendationData, updatedAt: now } }
      );

      await logAuditEvent(req, 'RECOMMEND_PROMOTION', { employeeId: cleanEmpId, details: recommendationData });
      return NextResponse.json({
        success: true,
        message: `Promotion recommendation for ${empName} submitted to HR/Admin approval.`,
        data: recommendationData,
      });
    }

    // 3. Action: Submit Evaluation / Conduct Appraisal
    const cycleTitle = body.reviewPeriod?.trim() || body.cycle?.trim() || 'Q3 2026';
    const ratingNum = Math.min(5, Math.max(1, Number(body.rating) || 4.0));
    const isDraft = body.status === 'Draft';

    const reviewDoc: Record<string, any> = {
      organizationId: orgId,
      employeeId: cleanEmpId,
      employeeName: empName,
      department: dept,
      reviewer: auth.name || 'Manager',
      reviewPeriod: cycleTitle,
      cycle: cycleTitle,
      reviewDate: body.reviewDate || now.toISOString().split('T')[0],
      rating: ratingNum,
      score: ratingNum,
      finalRating: ratingNum,
      feedback: body.feedback || '',
      strengths: body.strengths || '',
      improvements: body.improvements || '',
      status: isDraft ? 'Draft' : 'Completed',
      competencies: body.competencies || null,
      updatedAt: now,
    };

    if (Array.isArray(body.goals)) {
      reviewDoc.goals = body.goals;
    }

    if (body.promotionRecommendation) {
      reviewDoc.promotionRecommendation = body.promotionRecommendation;
    }

    const targetId = body.id || body.reviewId;
    if (targetId) {
      const idFilters: any[] = [{ id: targetId }];
      if (ObjectId.isValid(targetId)) idFilters.push({ _id: new ObjectId(targetId) });

      await db.collection('performance_reviews').updateOne(
        { $or: idFilters },
        { $set: reviewDoc, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
      reviewDoc.id = targetId;
    } else {
      const newId = `perf-${Date.now()}`;
      reviewDoc.id = newId;
      reviewDoc.createdAt = now;
      await db.collection('performance_reviews').insertOne(reviewDoc);
    }

    await logAuditEvent(req, 'SUBMIT_PERFORMANCE_REVIEW', { employeeId: cleanEmpId, details: reviewDoc });

    return NextResponse.json({
      success: true,
      message: isDraft
        ? `Appraisal draft for ${empName} saved successfully.`
        : `Appraisal for ${empName} finalized and submitted successfully.`,
      data: reviewDoc,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/manager/performance:', error);
    return NextResponse.json({ success: false, message: 'Failed to save performance record.' }, { status: 500 });
  }
}
