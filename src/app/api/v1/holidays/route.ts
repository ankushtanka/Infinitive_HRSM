import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { HolidayRepository } from '@/modules/holidays/holiday.repository';
import { QueryHolidayFilterDto } from '@/modules/holidays/holiday.dto';

export const dynamic = 'force-dynamic';

const repository = new HolidayRepository();

// GET /api/v1/holidays
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const filter: QueryHolidayFilterDto = {
      year: searchParams.get('year') ? Number(searchParams.get('year')) : undefined,
      country: searchParams.get('country') || undefined,
      category: (searchParams.get('category') as any) || undefined,
      state: searchParams.get('state') || undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 50,
    };

    const result = await repository.findAll(filter, auth.organizationId);
    return NextResponse.json({
      success: true,
      data: result.items,
      pagination: {
        page: filter.page || 1,
        limit: filter.limit || 50,
        total: result.total,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to fetch holidays' },
      { status: 500 }
    );
  }
}

// POST /api/v1/holidays (Authorized Admin/HR/Super Admin only)
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json();
    if (!body.name || !body.date) {
      return NextResponse.json(
        { success: false, message: 'Holiday name and valid YYYY-MM-DD date are required.' },
        { status: 400 }
      );
    }

    const created = await repository.create(body, auth.organizationId);
    return NextResponse.json({ success: true, message: 'Holiday created successfully.', data: created }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || 'Invalid request body' },
      { status: 400 }
    );
  }
}
