export const VALID_CATEGORIES = [
  'Laptop',
  'Desktop',
  'Monitor',
  'Mobile',
  'Keyboard',
  'Mouse',
  'ID Card',
  'SIM',
  'Software Licenses',
  'Other',
] as const;

export type AssetCategory = typeof VALID_CATEGORIES[number];

export const VALID_STATUSES = [
  'AVAILABLE',
  'ASSIGNED',
  'UNDER_MAINTENANCE',
  'LOST',
  'RETIRED',
] as const;

export type AssetStatus = typeof VALID_STATUSES[number];

export const VALID_CONDITIONS = [
  'NEW',
  'EXCELLENT',
  'GOOD',
  'FAIR',
  'DAMAGED',
  'DEFECTIVE',
] as const;

export type AssetCondition = typeof VALID_CONDITIONS[number];

export const VALID_LICENSE_TYPES = [
  'PERPETUAL',
  'SUBSCRIPTION',
  'ENTERPRISE',
  'PER_SEAT',
] as const;

export type LicenseType = typeof VALID_LICENSE_TYPES[number];

export const VALID_RENEWAL_STATUSES = [
  'ACTIVE',
  'EXPIRING_SOON',
  'EXPIRED',
  'AUTO_RENEW',
] as const;

export type RenewalStatus = typeof VALID_RENEWAL_STATUSES[number];
