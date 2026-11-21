import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { loadAttendanceRules } from '@/lib/geo';
import { getOfficeLocations, isOfficeLocationRequired, sanitizeOfficeLocations } from '@/lib/officeAttendance';

export const dynamic = 'force-dynamic';

/** GET /api/v1/settings/attendance/offices - saved office locations and whether office check-in needs them. */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const rules = await loadAttendanceRules(db, auth.organizationId);

    return NextResponse.json({
      success: true,
      data: {
        offices: getOfficeLocations(rules),
        requireOfficeLocation: isOfficeLocationRequired(rules),
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/settings/attendance/offices:', error);
    return NextResponse.json({ success: false, message: 'Failed to load office locations.' }, { status: 500 });
  }
}

/** PUT /api/v1/settings/attendance/offices - replace the office list and the office check-in rule. */
export async function PUT(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const checked = sanitizeOfficeLocations(body.offices);
    if (!checked.ok) {
      return NextResponse.json({ success: false, message: checked.message }, { status: 400 });
    }
    const offices = checked.value;
    const requireOfficeLocation = Boolean(body.requireOfficeLocation) && offices.length > 0;
    if (Boolean(body.requireOfficeLocation) && offices.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Add at least one office before switching on the office location check.' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();
    const first = offices[0];

    await db.collection('organization_settings').updateOne(
      { organizationId: orgId },
      {
        $set: {
          'attendance.offices': offices,
          'attendance.geofenceEnabled': offices.length > 0,
          'attendance.geofenceEnforce': requireOfficeLocation,
          // Older single-office fields, used by the live tracking map
          'attendance.officeLat': first ? first.lat : 0,
          'attendance.officeLng': first ? first.lng : 0,
          'attendance.geofenceRadiusMeters': first ? first.radiusMeters : 200,
          updatedAt: now,
        },
      },
      { upsert: true }
    );

    await logAuditEvent(req, 'UPDATE_OFFICE_LOCATIONS', {
      details: {
        organizationId: orgId,
        requireOfficeLocation,
        offices: offices.map((o) => ({ name: o.name, radiusMeters: o.radiusMeters })),
      },
    });

    return NextResponse.json({
      success: true,
      message: requireOfficeLocation
        ? 'Office locations saved. Office check-in now works only inside an office area.'
        : 'Office locations saved. The office location check is switched off.',
      data: { offices, requireOfficeLocation },
    });
  } catch (error: any) {
    console.error('Error in PUT /api/v1/settings/attendance/offices:', error);
    return NextResponse.json({ success: false, message: 'Failed to save office locations.' }, { status: 500 });
  }
}