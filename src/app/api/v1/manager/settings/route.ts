import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { loadAttendanceRules } from '@/lib/geo';

export const dynamic = 'force-dynamic';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80';

// GET /api/v1/manager/settings - Load authenticated manager's profile, security, and preferences
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['MANAGER', 'ADMIN', 'SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const cleanEmail = (auth.email || '').toLowerCase().trim();
    const emailRegex = cleanEmail
      ? { $regex: new RegExp(`^${cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      : null;

    // 1. Fetch user doc
    const userFilter: any = {
      $or: [
        ...(auth.userId ? [{ userId: auth.userId }, { id: auth.userId }] : []),
        ...(ObjectId.isValid(auth.userId) ? [{ _id: new ObjectId(auth.userId) }] : []),
        ...(auth.employeeId ? [{ employeeId: auth.employeeId }] : []),
        ...(emailRegex ? [{ email: emailRegex }] : []),
      ].filter(Boolean),
    };
    const userDoc: any = await db.collection('users').findOne(userFilter);

    // 2. Fetch employee doc for HR-managed official fields
    const empIdToMatch = userDoc?.employeeId || auth.employeeId;
    const empFilter: any = {
      $or: [
        ...(empIdToMatch ? [{ employeeId: empIdToMatch }] : []),
        ...(emailRegex ? [{ email: emailRegex }] : []),
      ].filter(Boolean),
    };
    const empDoc: any = await db.collection('employees').findOne(empFilter);

    const fullName =
      userDoc?.name ||
      userDoc?.fullName ||
      empDoc?.name ||
      (empDoc?.firstName ? `${empDoc.firstName} ${empDoc.lastName || ''}`.trim() : null) ||
      auth.name ||
      'Manager';

    const employeeId =
      empDoc?.employeeId ||
      userDoc?.employeeId ||
      auth.employeeId ||
      'MGR1001';

    const department =
      empDoc?.department ||
      userDoc?.department ||
      'Engineering & IT';

    const designation =
      empDoc?.designation ||
      userDoc?.designation ||
      'Engineering Manager';

    const phone = userDoc?.phone || empDoc?.phone || '';
    const avatar = userDoc?.avatar || empDoc?.avatar || empDoc?.photoUrl || DEFAULT_AVATAR;
    const joiningDate = empDoc?.joiningDate || userDoc?.joiningDate || '2024-08-01';
    const status = empDoc?.status || userDoc?.status || 'Active';

    // 3. User-specific notification preferences
    const notifications = {
      emailNotifications: userDoc?.preferences?.notifications?.emailNotifications ?? true,
      inAppNotifications: userDoc?.preferences?.notifications?.inAppNotifications ?? true,
      teamAttendanceAlerts: userDoc?.preferences?.notifications?.teamAttendanceAlerts ?? true,
      leaveRequestAlerts: userDoc?.preferences?.notifications?.leaveRequestAlerts ?? true,
      goalKpiUpdates: userDoc?.preferences?.notifications?.goalKpiUpdates ?? true,
      performanceReviewReminders: userDoc?.preferences?.notifications?.performanceReviewReminders ?? true,
      importantTeamUpdates: userDoc?.preferences?.notifications?.importantTeamUpdates ?? true,
    };

    // 4. User-specific workspace preferences
    const workspace = {
      teamAttendanceAlerts: userDoc?.preferences?.workspace?.teamAttendanceAlerts ?? true,
      goalKpiUpdates: userDoc?.preferences?.workspace?.goalKpiUpdates ?? true,
      leaveRequestNotifications: userDoc?.preferences?.workspace?.leaveRequestNotifications ?? true,
      weeklyTeamSummary: userDoc?.preferences?.workspace?.weeklyTeamSummary ?? true,
      performanceReviewReminders: userDoc?.preferences?.workspace?.performanceReviewReminders ?? true,
      defaultDashboardView: userDoc?.preferences?.workspace?.defaultDashboardView || 'OVERVIEW',
      recordsPerPage: userDoc?.preferences?.workspace?.recordsPerPage || 10,
    };

    // 5. Organization attendance rules & office location (admin managed)
    const attRules = await loadAttendanceRules(db, auth.organizationId || 'org-default');

    const officeLocation = {
      lat: Number(attRules.officeLat) || 24.5845267,
      lng: Number(attRules.officeLng) || 73.7314268,
      radiusMeters: Number(attRules.geofenceRadiusMeters) || 200,
      name: attRules.officeName || 'Head Office HQ',
      geofenceEnabled: attRules.geofenceEnabled !== false,
      geofenceEnforce: Boolean(attRules.geofenceEnforce),
      workStartTime: attRules.workStartTime || '09:00 AM',
      workEndTime: attRules.workEndTime || '06:00 PM',
      gracePeriodMinutes: Number(attRules.gracePeriodMinutes) || 15,
      workingDaysPerWeek: Number(attRules.workingDaysPerWeek) || 5,
      autoCheckoutEnabled: Boolean(attRules.autoCheckoutEnabled),
      autoCheckoutTime: attRules.autoCheckoutTime || '11:59 PM',
    };

    return NextResponse.json(
      {
        success: true,
        data: {
          profile: {
            userId: userDoc?.userId || userDoc?.id || auth.userId,
            employeeId,
            name: fullName,
            email: cleanEmail,
            department,
            designation,
            phone,
            avatar,
            profilePhotoId: userDoc?.profilePhotoId || null,
            joiningDate,
            status,
            role: userDoc?.role || auth.role || 'MANAGER',
          },
          security: {
            isTwoFactorEnabled: Boolean(userDoc?.isTwoFactorEnabled),
            lastPasswordChange: userDoc?.passwordUpdatedAt || userDoc?.updatedAt || null,
          },
          notifications,
          workspace,
          officeLocation,
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
    console.error('Error in GET /api/v1/manager/settings:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch manager settings.' },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/manager/settings - Update profile, 2FA, notification channels, or workspace preferences
export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['MANAGER', 'ADMIN', 'SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json();
    const { section, data } = body;

    if (!section || !data) {
      return NextResponse.json(
        { success: false, message: 'Invalid payload: section and data are required.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const cleanEmail = (auth.email || '').toLowerCase().trim();
    const emailRegex = cleanEmail
      ? { $regex: new RegExp(`^${cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      : null;
    const now = new Date();

    const userFilter: any = {
      $or: [
        ...(auth.userId ? [{ userId: auth.userId }, { id: auth.userId }] : []),
        ...(ObjectId.isValid(auth.userId) ? [{ _id: new ObjectId(auth.userId) }] : []),
        ...(auth.employeeId ? [{ employeeId: auth.employeeId }] : []),
        ...(emailRegex ? [{ email: emailRegex }] : []),
      ].filter(Boolean),
    };

    if (section === 'profile') {
      const updateFields: any = { updatedAt: now };

      // Allow editing contact phone
      const rawPhone = data.phone !== undefined ? data.phone : (data.mobile !== undefined ? data.mobile : data.contactPhone);
      if (rawPhone !== undefined) {
        updateFields.phone = String(rawPhone).trim();
      }

      // Allow updating display name if provided (support both name and fullName)
      const rawName = data.name !== undefined ? data.name : data.fullName;
      let targetName: string | undefined = undefined;
      if (typeof rawName === 'string' && rawName.trim().length > 0) {
        targetName = rawName.trim();
        updateFields.name = targetName;
        updateFields.fullName = targetName;
      }

      // Ensure HR-managed official fields are protected and NOT overwritten by manager
      // (employeeId, email, department, designation are immutable for manager)

      let userUpdateResult = await db.collection('users').updateOne(userFilter, { $set: updateFields });
      if (userUpdateResult.matchedCount === 0 && emailRegex) {
        userUpdateResult = await db.collection('users').updateOne({ email: emailRegex }, { $set: updateFields });
      }

      if (userUpdateResult.matchedCount === 0) {
        console.error('PATCH manager/settings: no user document matched', userFilter);
        return NextResponse.json(
          { success: false, message: 'Manager user record not found in database.' },
          { status: 404 }
        );
      }

      // Authoritatively fetch the updated user document to guarantee database persistence
      const updatedUserDoc: any = await db.collection('users').findOne(userFilter);
      const finalSavedName = updatedUserDoc?.name || updatedUserDoc?.fullName || targetName || auth.name;
      const finalSavedPhone = updatedUserDoc?.phone !== undefined ? updatedUserDoc.phone : (updateFields.phone || '');

      // Synchronize phone and name to employee document if available
      const empIdToMatch = updatedUserDoc?.employeeId || auth.employeeId;
      const empFilter: any = {
        $or: [
          ...(empIdToMatch ? [{ employeeId: empIdToMatch }] : []),
          ...(emailRegex ? [{ email: emailRegex }] : []),
        ].filter(Boolean),
      };
      const empUpdates: any = { updatedAt: now };
      if (updateFields.phone !== undefined) empUpdates.phone = updateFields.phone;
      if (targetName !== undefined) {
        const parts = targetName.split(' ');
        empUpdates.name = targetName;
        empUpdates.firstName = parts[0];
        empUpdates.lastName = parts.slice(1).join(' ') || '';
      }
      if (empFilter.$or.length > 0) {
        await db.collection('employees').updateOne(empFilter, { $set: empUpdates });
      }

      // Synchronize active user sessions so session tokens and getAuthContext reflect the updated name immediately
      if (targetName) {
        const sessionFilter: any = {
          $or: [
            ...(auth.userId ? [{ userId: auth.userId }] : []),
            ...(empIdToMatch ? [{ employeeId: empIdToMatch }] : []),
            ...(emailRegex ? [{ email: emailRegex }] : []),
          ].filter(Boolean),
        };
        await db.collection('user_sessions').updateMany(sessionFilter, {
          $set: { name: targetName, updatedAt: now },
        });
      }

      await logAuditEvent(req, 'MANAGER_PROFILE_UPDATED', {
        details: { userId: auth.userId, email: cleanEmail, updates: updateFields },
      });

      return NextResponse.json({
        success: true,
        message: 'Manager profile details saved successfully.',
        data: {
          name: finalSavedName,
          phone: finalSavedPhone,
          profile: {
            name: finalSavedName,
            phone: finalSavedPhone,
            userId: updatedUserDoc?.userId || updatedUserDoc?.id || auth.userId,
            employeeId: updatedUserDoc?.employeeId || auth.employeeId || 'MGR1001',
            email: updatedUserDoc?.email || cleanEmail,
            department: updatedUserDoc?.department || 'Engineering & IT',
            designation: updatedUserDoc?.designation || 'Engineering Manager',
            avatar: updatedUserDoc?.avatar || DEFAULT_AVATAR,
            status: updatedUserDoc?.status || 'Active',
            role: updatedUserDoc?.role || auth.role || 'MANAGER',
          },
        },
      });
    }

    if (section === 'security') {
      const isTwoFactorEnabled = Boolean(data.isTwoFactorEnabled);

      let secResult = await db.collection('users').updateOne(userFilter, {
        $set: {
          isTwoFactorEnabled,
          updatedAt: now,
        },
      });

      if (secResult.matchedCount === 0 && emailRegex) {
        secResult = await db.collection('users').updateOne({ email: emailRegex }, {
          $set: {
            isTwoFactorEnabled,
            updatedAt: now,
          },
        });
      }

      await logAuditEvent(req, 'MANAGER_2FA_TOGGLED', {
        details: { userId: auth.userId, email: cleanEmail, isTwoFactorEnabled },
      });

      return NextResponse.json({
        success: true,
        message: isTwoFactorEnabled
          ? 'Two-Factor Authentication (2FA) enabled. You will receive an email OTP upon future logins.'
          : 'Two-Factor Authentication (2FA) disabled.',
        data: { isTwoFactorEnabled },
      });
    }

    if (section === 'notifications') {
      const notifUpdates = {
        emailNotifications: Boolean(data.emailNotifications),
        inAppNotifications: Boolean(data.inAppNotifications),
        teamAttendanceAlerts: Boolean(data.teamAttendanceAlerts),
        leaveRequestAlerts: Boolean(data.leaveRequestAlerts),
        goalKpiUpdates: Boolean(data.goalKpiUpdates),
        performanceReviewReminders: Boolean(data.performanceReviewReminders),
        importantTeamUpdates: Boolean(data.importantTeamUpdates),
      };

      let notifResult = await db.collection('users').updateOne(userFilter, {
        $set: {
          'preferences.notifications': notifUpdates,
          updatedAt: now,
        },
      });

      if (notifResult.matchedCount === 0 && emailRegex) {
        notifResult = await db.collection('users').updateOne({ email: emailRegex }, {
          $set: {
            'preferences.notifications': notifUpdates,
            updatedAt: now,
          },
        });
      }

      await logAuditEvent(req, 'MANAGER_NOTIFICATIONS_UPDATED', {
        details: { userId: auth.userId, email: cleanEmail, preferences: notifUpdates },
      });

      return NextResponse.json({
        success: true,
        message: 'Notification preferences saved and synced.',
        data: notifUpdates,
      });
    }

    if (section === 'workspace') {
      const workspaceUpdates = {
        teamAttendanceAlerts: Boolean(data.teamAttendanceAlerts),
        goalKpiUpdates: Boolean(data.goalKpiUpdates),
        leaveRequestNotifications: Boolean(data.leaveRequestNotifications),
        weeklyTeamSummary: Boolean(data.weeklyTeamSummary),
        performanceReviewReminders: Boolean(data.performanceReviewReminders),
        defaultDashboardView: data.defaultDashboardView || 'OVERVIEW',
        recordsPerPage: Number(data.recordsPerPage) || 10,
      };

      let wsResult = await db.collection('users').updateOne(userFilter, {
        $set: {
          'preferences.workspace': workspaceUpdates,
          updatedAt: now,
        },
      });

      if (wsResult.matchedCount === 0 && emailRegex) {
        wsResult = await db.collection('users').updateOne({ email: emailRegex }, {
          $set: {
            'preferences.workspace': workspaceUpdates,
            updatedAt: now,
          },
        });
      }

      await logAuditEvent(req, 'MANAGER_WORKSPACE_PREFS_UPDATED', {
        details: { userId: auth.userId, email: cleanEmail, preferences: workspaceUpdates },
      });

      return NextResponse.json({
        success: true,
        message: 'Workspace preferences updated successfully.',
        data: workspaceUpdates,
      });
    }

    return NextResponse.json({ success: false, message: `Unknown section '${section}'` }, { status: 400 });
  } catch (error: any) {
    console.error('Error in PATCH /api/v1/manager/settings:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update manager settings.' },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/manager/settings - Bulk revoke all other active sessions for this manager
export async function DELETE(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['MANAGER', 'ADMIN', 'SUPER_ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'revokeOtherSessions') {
      const { db } = await connectToDatabase();
      const cleanEmail = (auth.email || '').toLowerCase().trim();

      const result = await db.collection('user_sessions').deleteMany({
        $or: [
          ...(auth.userId ? [{ userId: auth.userId }] : []),
          { email: cleanEmail },
        ],
        ...(auth.sessionId ? { sessionId: { $ne: auth.sessionId } } : {}),
      });

      await logAuditEvent(req, 'MANAGER_REVOKED_OTHER_SESSIONS', {
        details: { userId: auth.userId, email: cleanEmail, deletedCount: result.deletedCount },
      });

      return NextResponse.json({
        success: true,
        message: `Successfully logged out of ${result.deletedCount} other device session(s).`,
        deletedCount: result.deletedCount,
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action.' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in DELETE /api/v1/manager/settings:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to revoke other sessions.' },
      { status: 500 }
    );
  }
}

