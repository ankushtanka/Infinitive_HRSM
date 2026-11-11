import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { HolidayRepository } from '@/modules/holidays/holiday.repository';

export const dynamic = 'force-dynamic';

const repository = new HolidayRepository();

// GET /api/v1/holidays/:id
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const item = await repository.findById(params.id, auth.organizationId);
    if (!item) {
      return NextResponse.json({ success: false, message: 'Holiday not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: item });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || 'Failed to fetch holiday' }, { status: 500 });
  }
}

// PUT /api/v1/holidays/:id
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json();
    const updated = await repository.update(params.id, body, auth.organizationId);

    if (!updated) {
      return NextResponse.json({ success: false, message: 'Holiday not found or update failed.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Holiday updated successfully.', data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || 'Invalid request body' }, { status: 400 });
  }
}

// DELETE /api/v1/holidays/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const deleted = await repository.delete(params.id, auth.organizationId);
    if (!deleted) {
      return NextResponse.json({ success: false, message: 'Holiday not found or already deleted.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Holiday deleted successfully.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || 'Failed to delete holiday' }, { status: 500 });
  }
}
