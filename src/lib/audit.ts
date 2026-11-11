import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext } from '@/lib/auth';

export interface AuditLogEntry {
  organizationId: string;
  employeeId?: string;
  performedBy: string;
  performedByName?: string;
  role: string;
  action: string;
  details?: Record<string, any>;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Sanitizes object by removing sensitive fields (passwords, secrets, tokens).
 */
export function sanitizePayload(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload);

  const sanitized: Record<string, any> = {};
  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'hash',
    'salt',
    'otp',
    'creditcard',
    'accountnumber',
    'bankaccount',
    'aadhaarno',
    'aadhaar',
    'pannumber',
    'passportno',
    'cvv',
    'pin',
  ];

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizePayload(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export async function logAuditEvent(
  req: NextRequest,
  action: string,
  options?: {
    employeeId?: string;
    details?: Record<string, any>;
    oldValue?: Record<string, any>;
    newValue?: Record<string, any>;
    /** Organization the action applied to, when it differs from the actor's own (Super Admin cross-org actions). */
    organizationId?: string;
  }
): Promise<boolean> {
  try {
    const auth = await getAuthContext(req);
    const { db } = await connectToDatabase();

    const auditEntry: AuditLogEntry = {
      organizationId: options?.organizationId || auth.organizationId,
      employeeId: options?.employeeId || auth.employeeId,
      performedBy: auth.email || auth.userId,
      performedByName: auth.name,
      role: auth.role,
      action,
      details: sanitizePayload(options?.details),
      oldValue: sanitizePayload(options?.oldValue),
      newValue: sanitizePayload(options?.newValue),
      timestamp: new Date(),
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1',
      userAgent: req.headers.get('user-agent') || 'Unknown',
    };

    await db.collection('audit_logs').insertOne(auditEntry);
    return true;
  } catch (error) {
    console.error('Failed to log audit event:', error);
    return false;
  }
}
