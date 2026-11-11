import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/assets/my-assets
 * Returns hardware assets, software licenses, and past assignment history
 * for the currently logged-in employee.
 * Strictly redacts internal financial costs and license keys.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId || 'org-default';

    // Resolve employee identifier
    let employeeId = auth.employeeId;
    if (!employeeId && auth.userId) {
      const emp = await db.collection('employees').findOne({
        organizationId: orgId,
        $or: [
          { userId: auth.userId },
          { _id: ObjectId.isValid(auth.userId) ? new ObjectId(auth.userId) : undefined },
          { email: auth.email?.toLowerCase() },
        ].filter(Boolean),
      });
      if (emp) {
        employeeId = emp.employeeId || emp._id.toString();
      }
    }

    if (!employeeId) {
      return NextResponse.json({
        success: true,
        data: {
          activeAssets: [],
          softwareLicenses: [],
          pastAssignments: [],
        },
      });
    }

    // 1. Fetch active assigned assets
    const rawAssets = await db
      .collection('assets')
      .find({
        organizationId: orgId,
        isArchived: { $ne: true },
        status: 'ASSIGNED',
        'assignedTo.employeeId': employeeId,
      })
      .toArray();

    // Redact sensitive financial data from employee view
    const activeAssets = rawAssets.map((asset) => {
      const {
        purchaseCost,
        currency,
        invoiceNumber,
        vendor,
        ...safeAsset
      } = asset;
      return safeAsset;
    });

    // 2. Fetch allocated software licenses
    const rawLicenses = await db
      .collection('software_licenses')
      .find({
        organizationId: orgId,
        status: { $ne: 'RETIRED' },
        'allocations.employeeId': employeeId,
      })
      .toArray();

    const softwareLicenses = rawLicenses.map((lic) => {
      const userAllocation = lic.allocations?.find((a: any) => a.employeeId === employeeId);
      return {
        _id: lic._id,
        name: lic.name,
        vendor: lic.vendor,
        licenseType: lic.licenseType,
        assignedAt: userAllocation?.assignedAt,
        expiryDate: lic.expiryDate,
        renewalStatus: lic.renewalStatus,
        notes: userAllocation?.notes,
      };
    });

    // 3. Fetch past assignment history (already returned)
    const pastAssignments = await db
      .collection('asset_assignments')
      .find({
        organizationId: orgId,
        employeeId,
        status: 'RETURNED',
      })
      .sort({ returnedAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      data: {
        activeAssets,
        softwareLicenses,
        pastAssignments,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/assets/my-assets:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to fetch employee assets' },
      { status: 500 }
    );
  }
}
