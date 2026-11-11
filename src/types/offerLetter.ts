export type OfferType = 'INTERNSHIP' | 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';

export type OfferStatus =
  | 'DRAFT'
  | 'GENERATED'
  | 'SENT'
  | 'VIEWED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED';

export const VALID_CANDIDATE_TITLES = [
  'None',
  'Mr.',
  'Ms.',
  'Mrs.',
  'Miss',
  'Dr.',
  'Prof.',
] as const;

export type CandidateTitle = (typeof VALID_CANDIDATE_TITLES)[number];

export function formatCandidateFullName(
  title?: string | null,
  name?: string | null
): string {
  const cleanName = (name || '').trim();
  const cleanTitle = (title || '').trim();
  if (!cleanTitle || cleanTitle.toLowerCase() === 'none') {
    return cleanName;
  }
  return `${cleanTitle} ${cleanName}`.trim();
}

export interface CompanySnapshot {
  companyName: string;
  registeredOffice: string;
  officeAddress: string;
  phone: string;
  email: string;
  cin: string;
  logoUrl?: string;
}

export interface CandidateSnapshot {
  candidateTitle?: CandidateTitle | string;
  salutation?: CandidateTitle | string;
  candidateName: string;
  email: string;
  phone: string;
  address: string;
  collegeName?: string;
  employeeId?: string;
}

export interface OfferLetterRecord {
  id: string;
  _id?: string;
  organizationId: string;
  referenceNumber: string;
  candidateId: string;
  candidateTitle?: CandidateTitle | string;
  salutation?: CandidateTitle | string;
  candidate: CandidateSnapshot;
  company: CompanySnapshot;
  offerType: OfferType;
  position: string;
  department: string;
  location: string;
  offerDate: string;
  joiningDate: string;
  expiryDate?: string;
  durationMonths?: number;
  stipendType?: 'STIPENDIARY' | 'NON_STIPENDIARY';
  salaryStipend?: number;
  probationPeriod?: string;
  noticePeriod?: string;
  workingHours?: string;
  reportingManager?: string;
  requiredDocuments: string[];
  termsAndConditions: string[];
  additionalTerms?: string;
  fileId?: string;
  fileName?: string;
  version: number;
  status: OfferStatus;
  sentAt?: string;
  viewedAt?: string;
  acceptedAt?: string;
  declinedAt?: string;
  history?: Array<{
    version: number;
    action: string;
    fileId?: string;
    performedBy: string;
    timestamp: string;
  }>;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}
