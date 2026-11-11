import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
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

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    let query: any = {};

    // Organization scope
    if (auth.role !== 'SUPER_ADMIN') {
      if (orgId === 'org-default' || !orgId) {
        query.$or = [
          { organizationId: 'org-default' },
          { organizationId: { $exists: false } },
          { organizationId: null },
        ];
      } else {
        query.organizationId = orgId;
      }
    }

    // Role-based scoping
    if (auth.role === 'EMPLOYEE' && auth.employeeId) {
      const empFilter: any = {
        $or: [
          { employeeId: auth.employeeId },
          { email: auth.email?.toLowerCase() },
        ],
      };
      query = query.$or ? { $and: [query, empFilter] } : { ...query, ...empFilter };
    } else if (auth.role === 'MANAGER' && auth.employeeId) {
      // Find team members
      const teamQuery: any = {
        $or: [
          { managerId: auth.employeeId },
          { reportingTo: auth.employeeId },
          { employeeId: auth.employeeId },
        ],
      };
      if (orgId && orgId !== 'org-default') {
        teamQuery.organizationId = orgId;
      }
      const team = await db.collection('employees').find(teamQuery).toArray();
      const teamEmpIds = team.map((e) => e.employeeId || e._id.toString());
      query.employeeId = { $in: teamEmpIds };
    }

    const rawReviews = await db
      .collection('performance_reviews')
      .find(query)
      .sort({ reviewDate: -1, createdAt: -1 })
      .toArray();

    // Normalize review fields for universal compatibility across Admin, Manager, and Employee
    const reviews = rawReviews.map((rev: any) => {
      const cycleTitle = rev.cycle || rev.reviewPeriod || 'H2 2026 Performance Cycle';
      const computedFallback = ((Number(rev.selfRating || 0) + Number(rev.managerRating || 0)) / 2) || 4.0;
      const finalRatingNum = Number(
        rev.finalRating !== undefined
          ? rev.finalRating
          : (rev.rating !== undefined ? rev.rating : (rev.score !== undefined ? rev.score : computedFallback))
      );
      const selfRatingNum = Number(rev.selfRating ?? (rev.rating ?? 4.0));
      const managerRatingNum = Number(rev.managerRating ?? (rev.rating ?? 4.0));

      return {
        id: rev.id || rev._id.toString(),
        _id: rev._id.toString(),
        organizationId: rev.organizationId || orgId || 'org-default',
        employeeId: rev.employeeId || '',
        employeeName: rev.employeeName || 'Employee',
        avatar: rev.avatar || rev.photoUrl || '',
        department: rev.department || 'General',
        cycle: cycleTitle,
        reviewPeriod: cycleTitle,
        reviewDate: rev.reviewDate || (rev.createdAt ? new Date(rev.createdAt).toISOString().split('T')[0] : '2026-09-01'),
        selfRating: selfRatingNum,
        managerRating: managerRatingNum,
        finalRating: finalRatingNum,
        rating: finalRatingNum,
        score: finalRatingNum,
        status: rev.status || 'Self Review',
        feedback: rev.feedback || rev.managerNotes || '',
        goals: Array.isArray(rev.goals) ? rev.goals : [],
        reviewer: rev.reviewer || 'Manager',
        createdAt: rev.createdAt || new Date().toISOString(),
        updatedAt: rev.updatedAt || new Date().toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      data: reviews,
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/performance:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch performance reviews' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json();
    const { employeeId, employeeName, reviewPeriod, cycle, rating, finalRating, selfRating, managerRating, feedback, goals, department, avatar, status } = body;

    if (!employeeId || !String(employeeId).trim()) {
      return NextResponse.json({ success: false, message: 'Employee ID is required.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId || 'org-default';
    const now = new Date();

    // Verification for MANAGER role (Can only submit/update reviews for direct reports in authorized team)
    if (auth.role === 'MANAGER' && auth.employeeId) {
      const isTeamMember = await db.collection('employees').findOne({
        employeeId,
        $or: [{ managerId: auth.employeeId }, { reportingTo: auth.employeeId }],
      });
      if (!isTeamMember) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized: You can only submit performance reviews for direct reports in your team.' },
          { status: 403 }
        );
      }
    }

    const cleanEmpId = String(employeeId).trim();
    const cycleTitle = cycle?.trim() || reviewPeriod?.trim() || 'H2 2026 Performance Cycle';

    const selfNum = Number(selfRating !== undefined ? selfRating : (rating !== undefined ? rating : 4.0));
    const mgrNum = Number(managerRating !== undefined ? managerRating : (rating !== undefined ? rating : 4.0));
    const finalNum = Number(
      finalRating !== undefined
        ? finalRating
        : (rating !== undefined ? rating : parseFloat(((selfNum + mgrNum) / 2).toFixed(1)))
    );

    const reviewDoc = {
      organizationId: orgId,
      employeeId: cleanEmpId,
      employeeName: employeeName?.trim() || 'Employee',
      avatar: avatar || '',
      department: department?.trim() || 'General',
      reviewer: auth.name || auth.email || 'Admin',
      reviewPeriod: cycleTitle,
      cycle: cycleTitle,
      reviewDate: body.reviewDate || now.toISOString().split('T')[0],
      rating: finalNum,
      finalRating: finalNum,
      selfRating: selfNum,
      managerRating: mgrNum,
      score: finalNum,
      feedback: feedback || body.managerNotes || '',
      goals: Array.isArray(goals) ? goals : [],
      status: status || body.status || 'Goal Setting',
      updatedAt: now,
    };

    const targetId = body.id || body.reviewId;
    if (targetId) {
      const idFilters: any[] = [{ id: targetId }];
      if (ObjectId.isValid(targetId)) {
        idFilters.push({ _id: new ObjectId(targetId) });
      }
      await db.collection('performance_reviews').updateOne(
        { $or: idFilters },
        { $set: reviewDoc, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
      (reviewDoc as any).id = targetId;
    } else {
      const newId = `perf-${Date.now()}`;
      (reviewDoc as any).id = newId;
      (reviewDoc as any).createdAt = now;
      await db.collection('performance_reviews').insertOne(reviewDoc);
    }

    await logAuditEvent(req, 'SUBMIT_PERFORMANCE_REVIEW', { employeeId: cleanEmpId, details: reviewDoc });

    return NextResponse.json({
      success: true,
      message: 'Performance review submitted successfully.',
      data: reviewDoc,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/performance:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to save performance review' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id')?.trim();

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id?.trim() || body?.reviewId?.trim();
      } catch {
        // body might be empty or invalid json
      }
    }

    if (!id) {
      return NextResponse.json({ success: false, message: 'Review ID is required for deletion.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    const idFilters: any[] = [
      { id },
      { reviewId: id },
    ];
    if (ObjectId.isValid(id)) {
      idFilters.push({ _id: new ObjectId(id) });
    }

    let filter: any;
    if (auth.role === 'SUPER_ADMIN') {
      filter = { $or: idFilters };
    } else if (orgId === 'org-default' || !orgId) {
      filter = {
        $and: [
          { $or: idFilters },
          {
            $or: [
              { organizationId: 'org-default' },
              { organizationId: { $exists: false } },
              { organizationId: null },
            ],
          },
        ],
      };
    } else {
      filter = {
        $and: [
          { $or: idFilters },
          { organizationId: orgId },
        ],
      };
    }

    const result = await db.collection('performance_reviews').deleteOne(filter);

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: 'Performance record not found or already deleted.' }, { status: 404 });
    }

    await logAuditEvent(req, 'DELETE_PERFORMANCE_REVIEW', { details: { reviewId: id } });

    return NextResponse.json({
      success: true,
      message: 'Performance review record deleted successfully.',
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/v1/performance:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to delete performance review' }, { status: 500 });
  }
}
