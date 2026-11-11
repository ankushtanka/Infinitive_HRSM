import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { hashPassword } from '@/lib/cryptoAuth';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const requiredSecret = process.env.SUPER_ADMIN_BOOTSTRAP_SECRET;

    // Fail-Closed: Mandate configured bootstrap secret
    if (!requiredSecret || requiredSecret.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: 'Super Admin bootstrap is disabled. Secret key not configured.' },
        { status: 403 }
      );
    }

    const clientSecret = req.headers.get('x-bootstrap-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const body = await req.json().catch(() => ({}));
    const providedSecret = clientSecret || body.bootstrapSecret;

    if (providedSecret !== requiredSecret) {
      return NextResponse.json(
        { success: false, message: 'Super Admin bootstrap is no longer available or invalid secret provided.' },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();
    const now = new Date();

    // One-time Initialization Check: Block permanently if ANY Super Admin already exists
    const existingSuperAdmin = await db.collection('users').findOne({ role: 'SUPER_ADMIN' });
    if (existingSuperAdmin) {
      return NextResponse.json(
        { success: false, message: 'Super Admin bootstrap is no longer available.' },
        { status: 403 }
      );
    }

    const { name, email, password, organizationName } = body;
    const cleanEmail = email ? email.trim().toLowerCase() : null;

    if (!name || !cleanEmail || !password) {
      return NextResponse.json(
        { success: false, message: 'Name, official email address, and strong password are required for initial Super Admin setup.' },
        { status: 400 }
      );
    }

    if (password.length < 12) {
      return NextResponse.json(
        { success: false, message: 'Initial Super Admin password must be at least 12 characters long for security compliance.' },
        { status: 400 }
      );
    }

    const orgId = 'org-master';
    const orgTitle = organizationName || 'Master Organization';

    // Ensure Organization Record exists
    await db.collection('organizations').updateOne(
      { id: orgId },
      {
        $set: {
          id: orgId,
          name: orgTitle,
          code: 'MST',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );

    const employeeId = 'EMP-SA01';
    const { formatted, salt } = hashPassword(password);

    // Create Initial Super Admin User Document
    const superAdminUser = {
      id: `usr-sa-${Date.now()}`,
      employeeId,
      name: name.trim(),
      email: cleanEmail,
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80',
      role: 'SUPER_ADMIN',
      organizationId: orgId,
      department: 'Executive Board',
      designation: 'Super Administrator',
      passwordHash: formatted,
      salt,
      status: 'ACTIVE',
      emailVerified: true,
      emailVerificationStatus: 'VERIFIED',
      isTwoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('users').updateOne(
      { email: cleanEmail },
      { $setOnInsert: superAdminUser },
      { upsert: true }
    );

    await logAuditEvent(req, 'BOOTSTRAP_SUPER_ADMIN', {
      employeeId,
      details: { email: cleanEmail, organizationId: orgId },
    });

    return NextResponse.json({
      success: true,
      message: 'Initial Super Admin setup completed successfully.',
      user: {
        id: superAdminUser.id,
        email: cleanEmail,
        role: 'SUPER_ADMIN',
        organizationId: orgId,
      },
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/auth/bootstrap-super-admin:', error);
    return NextResponse.json(
      { success: false, message: 'Super Admin bootstrap failed.' },
      { status: 500 }
    );
  }
}
