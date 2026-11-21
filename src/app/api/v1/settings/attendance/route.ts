import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { parseTimeToMinutes } from '@/lib/attendanceAlerts';

export const dynamic = 'force-dynamic';

const DEFAULT_ATTENDANCE_RULES = {
  workStartTime: '10:00 AM',
  workEndTime: '06:00 PM',
  gracePeriodMinutes: 15,
  lateMarkingEnabled: true,
  halfDayThresholdHours: 4,
  minHoursFullDay: 8,
  overtimeEnabled: true,
  overtimeMinMinutes: 60,
  workingDaysPerWeek: 5,
  autoCheckoutEnabled: false,
  autoCheckoutTime: '11:59 PM',
  attendanceMethod: 'WEB_BIOMETRIC',
  // Live GPS tracking / geofence
  geofenceEnabled: false,
  geofenceEnforce: false,
  officeLat: 0,
  officeLng: 0,
  geofenceRadiusMeters: 200,
  livePingIntervalSeconds: 30,
};

// GET /api/v1/settings/attendance - Fetch attendance rules
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json(
        { success: false, message: perm.message },
        { status: perm.statusCode }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    let orgDoc: any = await db.collection('organization_settings').findOne({ organizationId: orgId });

    if (!orgDoc || !orgDoc.attendance) {
      const updatedAttendance = DEFAULT_ATTENDANCE_RULES;
      await db.collection('organization_settings').updateOne(
        { organizationId: orgId },
        { $set: { attendance: updatedAttendance, updatedAt: new Date() } },
        { upsert: true }
      );
      if (!orgDoc) orgDoc = { attendance: updatedAttendance };
      else orgDoc.attendance = updatedAttendance;
    }

    return NextResponse.json({
      success: true,
      data: {
        organizationId: orgId,
        ...DEFAULT_ATTENDANCE_RULES,
        ...(orgDoc?.attendance || {}),
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/settings/attendance:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch attendance rules.' },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/settings/attendance - Update attendance rules
export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json(
        { success: false, message: perm.message },
        { status: perm.statusCode }
      );
    }

    const body = await req.json();
    const {
      workStartTime,
      workEndTime,
      gracePeriodMinutes,
      lateMarkingEnabled,
      halfDayThresholdHours,
      minHoursFullDay,
      overtimeEnabled,
      overtimeMinMinutes,
      workingDaysPerWeek,
      autoCheckoutEnabled,
      autoCheckoutTime,
      attendanceMethod,
      livePingIntervalSeconds,
    } = body;

    // Shift times must be readable, e.g. "10:00 AM" / "06:00 PM"
    const startText = typeof workStartTime === 'string' && workStartTime.trim() ? workStartTime.trim() : DEFAULT_ATTENDANCE_RULES.workStartTime;
    const endText = typeof workEndTime === 'string' && workEndTime.trim() ? workEndTime.trim() : DEFAULT_ATTENDANCE_RULES.workEndTime;
    const startMins = parseTimeToMinutes(startText);
    const endMins = parseTimeToMinutes(endText);
    if (startMins === null || endMins === null || startMins >= 24 * 60 || endMins >= 24 * 60) {
      return NextResponse.json(
        { success: false, message: 'Enter shift times like "10:00 AM" and "06:00 PM".' },
        { status: 400 }
      );
    }
    if (endMins <= startMins) {
      return NextResponse.json(
        { success: false, message: 'Shift end time must be after the shift start time.' },
        { status: 400 }
      );
    }

    const graceMin = Number(gracePeriodMinutes);
    if (isNaN(graceMin) || graceMin < 0 || graceMin > 180) {
      return NextResponse.json(
        { success: false, message: 'Grace period must be a positive number between 0 and 180 minutes.' },
        { status: 400 }
      );
    }

    const halfDayHrs = Number(halfDayThresholdHours);
    if (isNaN(halfDayHrs) || halfDayHrs < 1 || halfDayHrs > 12) {
      return NextResponse.json(
        { success: false, message: 'Half day threshold must be between 1 and 12 hours.' },
        { status: 400 }
      );
    }

    const minFullHrs = Number(minHoursFullDay);
    if (isNaN(minFullHrs) || minFullHrs < halfDayHrs || minFullHrs > 16) {
      return NextResponse.json(
        { success: false, message: 'Minimum full day hours must be equal to or greater than half day threshold.' },
        { status: 400 }
      );
    }

    // Live tracking / geofence validation
    const pingSeconds = Number(livePingIntervalSeconds ?? DEFAULT_ATTENDANCE_RULES.livePingIntervalSeconds);
    if (isNaN(pingSeconds) || pingSeconds < 15 || pingSeconds > 300) {
      return NextResponse.json(
        { success: false, message: 'Live location update interval must be between 15 and 300 seconds.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();

    // Office locations and the location rule are saved separately (/api/v1/settings/attendance/offices),
    // so saving these rules only updates the fields below and never clears saved offices.
    const updatedAttendanceRules = {
      workStartTime: startText,
      workEndTime: endText,
      gracePeriodMinutes: graceMin,
      lateMarkingEnabled: Boolean(lateMarkingEnabled),
      halfDayThresholdHours: halfDayHrs,
      minHoursFullDay: minFullHrs,
      overtimeEnabled: Boolean(overtimeEnabled),
      overtimeMinMinutes: Number(overtimeMinMinutes) || 60,
      workingDaysPerWeek: Number(workingDaysPerWeek) || 5,
      autoCheckoutEnabled: Boolean(autoCheckoutEnabled),
      autoCheckoutTime: autoCheckoutTime || '11:59 PM',
      attendanceMethod: attendanceMethod || 'WEB_BIOMETRIC',
      livePingIntervalSeconds: pingSeconds,
      updatedAt: now,
    };

    const fieldUpdates: Record<string, any> = { updatedAt: now };
    for (const [key, value] of Object.entries(updatedAttendanceRules)) {
      fieldUpdates[`attendance.${key}`] = value;
    }
    await db.collection('organization_settings').updateOne(
      { organizationId: orgId },
      { $set: fieldUpdates },
      { upsert: true }
    );

    await logAuditEvent(req, 'UPDATE_ATTENDANCE_SETTINGS', {
      details: { organizationId: orgId, rules: updatedAttendanceRules },
    });

    const saved: any = await db.collection('organization_settings').findOne({ organizationId: orgId });

    return NextResponse.json({
      success: true,
      message: 'Attendance rules updated successfully and applied to attendance calculations.',
      data: { ...DEFAULT_ATTENDANCE_RULES, ...(saved?.attendance || updatedAttendanceRules) },
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/v1/settings/attendance:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update attendance settings.' },
      { status: 500 }
    );
  }
}