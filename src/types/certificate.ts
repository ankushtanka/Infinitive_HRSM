export interface InternshipCertificateRecord {
  id: string;
  _id?: string;
  referenceNumber: string;
  organizationId: string;
  internName: string;
  salutation: string; // 'Ms.' | 'Mr.' | 'Mx.'
  degreeCourse: string; // e.g. B.Tech
  collegeName: string; // e.g. Institute of Engineering and Technology, MLSU, Udaipur (Raj)
  internshipRole: string; // e.g. Cloud & DevOps Intern
  startDate: string; // YYYY-MM-DD
  completionDate: string; // YYYY-MM-DD
  issueDate: string; // YYYY-MM-DD
  companyName: string; // e.g. INFINITIVE CLOUD
  registeredOffice?: string; // e.g. Kankroli, Rajasthan, 313324
  officeAddress?: string; // e.g. Udaipur, Rajasthan, 313001
  phone?: string;
  email?: string;
  internEmail?: string;
  cin?: string;
  signatoryName: string; // e.g. Ankush Ranka
  signatoryDesignation: string; // e.g. Founder & CEO
  fileId?: string; // GridFS file ObjectId
  fileName?: string;
  status: 'ISSUED' | 'DRAFT' | 'REVOKED';
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InternshipCertificateCompany {
  companyName: string;
  registeredOffice: string;
  officeAddress: string;
  phone: string;
  email: string;
  cin: string;
}
