import { Db } from 'mongodb';

/**
 * Generates an authoritative server-side unique reference number for internship certificates.
 * Format: CERT/YYYY/COUNTER (e.g., CERT/2026/1001)
 */
export async function generateCertificateReference(
  db: Db,
  organizationId: string,
  prefix: string = 'CERT'
): Promise<string> {
  const year = String(new Date().getFullYear());
  const cleanPrefix = (prefix || 'CERT').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const pattern = new RegExp(`^${cleanPrefix}/${year}/`);

  const count = await db.collection('internship_certificates').countDocuments({
    organizationId,
    referenceNumber: { $regex: pattern },
  });

  const nextSeq = 1001 + count;
  return `${cleanPrefix}/${year}/${nextSeq}`;
}
