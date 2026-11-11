import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { getISTDateString } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

// GET /api/v1/manager/communication - Manager Team Communication Hub API
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['MANAGER']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const managerEmpId = auth.employeeId;
    if (!managerEmpId) {
      return NextResponse.json(
        { success: false, message: 'Manager employee profile not found in session' },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();

    // 1. Fetch Manager's Authorized Team Members (Direct Reports ONLY)
    const teamMemberDocs = await db
      .collection('employees')
      .find({
        organizationId: auth.organizationId,
        $or: [{ managerId: managerEmpId }, { reportingTo: managerEmpId }],
      })
      .toArray();

    const teamEmpIds = teamMemberDocs
      .map((doc) => doc.employeeId || doc.id || doc._id.toString())
      .filter(Boolean);

    const authorizedTeam = teamMemberDocs.map((emp) => ({
      id: emp.id || emp._id.toString(),
      employeeId: emp.employeeId || emp.id,
      fullName: emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Employee',
      firstName: emp.firstName || '',
      lastName: emp.lastName || '',
      email: emp.email || '',
      department: emp.department || 'General',
      designation: emp.designation || 'Team Member',
      photo: emp.photo || emp.avatar || null,
      avatar: emp.photo || emp.avatar || null,
    }));

    // 2. Parse Query Params (Search, Filter, Pagination)
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    // 3. Construct Manager Team Scoped Query
    const baseTeamQuery: any = {
      organizationId: auth.organizationId,
      $or: [
        { employeeId: { $in: teamEmpIds } },
        { createdBy: auth.userId },
        { createdBy: auth.employeeId },
      ],
    };

    let finalQuery: any = baseTeamQuery;

    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const searchConditions = {
        $or: [
          { employeeName: searchRegex },
          { employeeId: searchRegex },
          { employeeEmail: searchRegex },
          { department: searchRegex },
          { subject: searchRegex },
          { lastMessage: searchRegex },
        ],
      };
      finalQuery = {
        $and: [baseTeamQuery, searchConditions],
      };
    }

    // 4. Fetch Conversations List
    const [rawConversations, totalCount] = await Promise.all([
      db
        .collection('conversations')
        .find(finalQuery)
        .sort({ updatedAt: -1, lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('conversations').countDocuments(finalQuery),
    ]);

    const conversations = rawConversations.map((c) => ({
      id: c.id || c._id.toString(),
      organizationId: c.organizationId,
      employeeId: c.employeeId,
      employeeName: c.employeeName || 'Employee',
      employeeAvatar: c.employeeAvatar || '',
      employeeEmail: c.employeeEmail || '',
      department: c.department || '',
      subject: c.subject || 'Team Message',
      lastMessage: c.lastMessage || '',
      lastMessageAt: c.lastMessageAt || c.createdAt || new Date().toISOString(),
      unreadCountHr: c.unreadCountHr || 0,
      unreadCountEmployee: c.unreadCountEmployee || 0,
      createdBy: c.createdBy || '',
      createdAt: c.createdAt || new Date().toISOString(),
      updatedAt: c.updatedAt || new Date().toISOString(),
    }));

    // 5. Compute Real Manager Team Communication KPIs
    const totalConversations = await db.collection('conversations').countDocuments(baseTeamQuery);

    const unreadConversations = await db.collection('conversations').countDocuments({
      ...baseTeamQuery,
      unreadCountHr: { $gt: 0 },
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const activeConversations = await db.collection('conversations').countDocuments({
      ...baseTeamQuery,
      updatedAt: { $gte: thirtyDaysAgo },
    });

    // Messages Sent/Received Today in IST
    const todayStr = getISTDateString();
    const startOfDay = `${todayStr}T00:00:00.000Z`;

    const convIdsInTeam = (
      await db
        .collection('conversations')
        .find(baseTeamQuery, { projection: { id: 1 } })
        .toArray()
    ).map((c) => c.id);

    let messagesToday = 0;
    if (convIdsInTeam.length > 0) {
      messagesToday = await db.collection('messages').countDocuments({
        organizationId: auth.organizationId,
        conversationId: { $in: convIdsInTeam },
        createdAt: { $gte: startOfDay },
      });
    }

    return NextResponse.json({
      success: true,
      kpis: {
        totalConversations,
        unreadConversations,
        activeConversations,
        messagesToday,
      },
      authorizedTeam,
      conversations,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (error: any) {
    console.error('Error in Manager Communication API:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to fetch manager communication data' },
      { status: 500 }
    );
  }
}
