import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * GET /api/v1/assets/export
 * Generates an authorized CSV export of the organization's asset inventory.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category')?.trim();
    const status = searchParams.get('status')?.trim();

    const { db } = await connectToDatabase();
    const orgId = auth.role === 'SUPER_ADMIN' && searchParams.get('organizationId')?.trim()
      ? searchParams.get('organizationId')!.trim()
      : auth.organizationId || 'org-default';

    const filter: any = { organizationId: orgId, isArchived: { $ne: true } };
    if (category && category !== 'All') filter.category = category;
    if (status && status !== 'All') filter.status = status;

    const assets = await db
      .collection('assets')
      .find(filter)
      .sort({ category: 1, assetTag: 1 })
      .toArray();

    const headers = [
      'Asset Tag',
      'Name',
      'Category',
      'Brand',
      'Model',
      'Serial Number',
      'Condition',
      'Status',
      'Location',
      'Assigned Employee ID',
      'Assigned Employee Name',
      'Assigned Employee Email',
      'Assigned Date',
      'Expected Return Date',
      'Purchase Date',
      'Purchase Cost',
      'Currency',
      'Warranty Expiry',
      'Vendor',
      'Invoice Number',
      'Notes',
    ];

    const rows = assets.map((a) => [
      a.assetTag || '',
      a.name || '',
      a.category || '',
      a.brand || '',
      a.model || '',
      a.serialNumber || '',
      a.condition || '',
      a.status || '',
      a.location || '',
      a.assignedTo?.employeeId || '',
      a.assignedTo?.employeeName || '',
      a.assignedTo?.employeeEmail || '',
      a.assignedTo?.assignedAt ? new Date(a.assignedTo.assignedAt).toISOString().split('T')[0] : '',
      a.assignedTo?.expectedReturnDate || '',
      a.purchaseDate || '',
      a.purchaseCost !== undefined ? a.purchaseCost : '',
      a.currency || '',
      a.warrantyExpiry || '',
      a.vendor || '',
      a.invoiceNumber || '',
      a.notes || '',
    ]);

    const csvContent = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    ].join('\r\n');

    await logAuditEvent(req, 'ASSET_INVENTORY_EXPORTED', {
      details: {
        recordCount: assets.length,
        filterCategory: category,
        filterStatus: status,
      },
      organizationId: orgId,
    });

    const timestamp = new Date().toISOString().split('T')[0];
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="infinitive-assets-${timestamp}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/assets/export:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to export assets' },
      { status: 500 }
    );
  }
}
