import { Db } from 'mongodb';

/**
 * Generates an authoritative server-side unique reference number for Experience Letters.
 * Format: ICS/EXP/YYYY/NNN (e.g., ICS/EXP/2026/001)
 */
export async function generateExperienceLetterReference(
  db: Db,
  organizationId: string,
  prefix: string = 'ICS/EXP'
): Promise<string> {
  const year = String(new Date().getFullYear());
  const cleanPrefix = (prefix || 'ICS/EXP').toUpperCase().trim();

  const pattern = new RegExp(`^${cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${year}/`);

  const count = await db.collection('experience_letters').countDocuments({
    organizationId,
    referenceNumber: { $regex: pattern },
  });

  const nextSeq = String(count + 1).padStart(3, '0');
  let candidate = `${cleanPrefix}/${year}/${nextSeq}`;

  // Collision safety loop
  let attempt = 0;
  while (attempt < 50) {
    const exists = await db.collection('experience_letters').findOne(
      { organizationId, referenceNumber: candidate },
      { projection: { _id: 1 } }
    );
    if (!exists) return candidate;
    attempt++;
    const fallbackSeq = String(count + 1 + attempt).padStart(3, '0');
    candidate = `${cleanPrefix}/${year}/${fallbackSeq}`;
  }

  return `${cleanPrefix}/${year}/${Date.now().toString().slice(-4)}`;
}

