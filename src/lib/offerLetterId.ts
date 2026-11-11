import { Db } from 'mongodb';

/**
 * Generates an authoritative server-side unique reference number for offer letters.
 * Format: PREFIX/DDMMYYYY/COUNTER (e.g., INFINITIVE/01092026/10)
 */
export async function generateOfferLetterReference(
  db: Db,
  organizationId: string,
  prefix: string = 'INFINITIVE'
): Promise<string> {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());
  const dateStr = `${day}${month}${year}`;

  const cleanPrefix = (prefix || 'INFINITIVE')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  const datePattern = new RegExp(`^${cleanPrefix}/${dateStr}/`);

  const count = await db.collection('offer_letters').countDocuments({
    organizationId,
    referenceNumber: { $regex: datePattern },
  });

  const counter = String(count + 1).padStart(2, '0');
  return `${cleanPrefix}/${dateStr}/${counter}`;
}
