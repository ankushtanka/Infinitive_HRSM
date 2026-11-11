import { Db } from 'mongodb';

export const CATEGORY_TAG_PREFIXES: Record<string, string> = {
  Laptop: 'AST-LPT',
  Desktop: 'AST-DSK',
  Monitor: 'AST-MON',
  Mobile: 'AST-MOB',
  Keyboard: 'AST-KBD',
  Mouse: 'AST-MOU',
  'ID Card': 'AST-IDC',
  SIM: 'AST-SIM',
  'Software Licenses': 'AST-LIC',
  Other: 'AST-GEN',
};

/**
 * Returns the standardized prefix for an asset category.
 */
export function getCategoryPrefix(category: string): string {
  return CATEGORY_TAG_PREFIXES[category] || 'AST-GEN';
}

/**
 * Generates the next sequential unique Asset Tag for an organization and category.
 * Format: AST-[CATEGORY]-[0001]
 * Example: AST-LPT-0001, AST-MOB-0002
 */
export async function generateNextAssetTag(
  db: Db,
  organizationId: string,
  category: string
): Promise<string> {
  const prefix = getCategoryPrefix(category);
  const regex = new RegExp(`^${prefix}-(\\d+)`, 'i');

  // Find all existing tags matching this prefix for the organization
  const matchingAssets = await db
    .collection('assets')
    .find(
      {
        organizationId,
        assetTag: { $regex: `^${prefix}-`, $options: 'i' },
      },
      { projection: { assetTag: 1 } }
    )
    .toArray();

  let maxNum = 0;
  for (const asset of matchingAssets) {
    if (asset.assetTag) {
      const match = asset.assetTag.match(regex);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  const nextNum = maxNum + 1;
  const padded = String(nextNum).padStart(4, '0');
  const candidateTag = `${prefix}-${padded}`;

  // Double check uniqueness just in case
  const exists = await db.collection('assets').findOne({
    organizationId,
    assetTag: candidateTag,
  });

  if (exists) {
    // If collision exists due to non-sequential tags, increment further
    const count = await db.collection('assets').countDocuments({
      organizationId,
      assetTag: { $regex: `^${prefix}-`, $options: 'i' },
    });
    const fallbackPadded = String(count + 1).padStart(4, '0');
    return `${prefix}-${fallbackPadded}`;
  }

  return candidateTag;
}

/**
 * Validates that an asset tag is unique within the organization.
 */
export async function isAssetTagUnique(
  db: Db,
  organizationId: string,
  assetTag: string,
  excludeAssetId?: string
): Promise<boolean> {
  const filter: any = {
    organizationId,
    assetTag: assetTag.trim().toUpperCase(),
  };

  if (excludeAssetId) {
    const { ObjectId } = require('mongodb');
    filter._id = { $ne: ObjectId.isValid(excludeAssetId) ? new ObjectId(excludeAssetId) : excludeAssetId };
  }

  const existing = await db.collection('assets').findOne(filter);
  return !existing;
}
