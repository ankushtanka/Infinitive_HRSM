export type EmployeeSalutation = 'Mr.' | 'Ms.' | 'Mrs.' | 'Mx.' | 'Dr.' | 'None' | '';
export type EmployeePronounPreference = 'he/him' | 'she/her' | 'they/them' | 'neutral' | '';


export interface ExperienceLetterRecord {
  id: string;
  _id?: string;
  referenceNumber: string; // e.g. ICS/EXP/2026/001
  organizationId: string;
  employeeId: string;
  employeeName: string;
  employeeEmail?: string; // Official employee email for letter delivery
  salutation?: EmployeeSalutation;
  pronouns?: EmployeePronounPreference;
  guardianName?: string; // e.g. "Mr. Naresh"
  guardianRelation?: 'S/o' | 'D/o' | 'W/o' | '';
  letterTitle?: string; // e.g. "EXPERIENCE CUM RELIEVING LETTER"
  department: string;
  designation: string;
  joiningDate: string; // YYYY-MM-DD
  relievingDate: string; // YYYY-MM-DD (Last working day)
  issueDate: string; // YYYY-MM-DD
  conductRemark?: string; // e.g. "During his tenure, he was dedicated and committed to his work..."
  reasonForLeaving?: string;
  signatoryName: string; // e.g. "Ankush Ranka"
  signatoryDesignation: string; // e.g. "Founder & CEO"
  companyName: string;
  registeredOffice?: string;
  officeAddress?: string;
  phone?: string;
  email?: string; // Company contact email
  cin?: string;
  website?: string;
  fileId?: string; // MongoDB GridFS ObjectId
  fileName?: string;
  fileSize?: number;
  status: 'ISSUED' | 'DRAFT' | 'REVOKED';
  emailSent?: boolean;
  emailSentAt?: string;
  emailSentTo?: string;
  emailMessageId?: string;
  createdBy: string;
  createdByName?: string;
  issuedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExperienceLetterCompanyInfo {
  companyName: string;
  registeredOffice: string;
  officeAddress: string;
  phone: string;
  email: string;
  cin: string;
  website: string;
}

export const DEFAULT_EXPERIENCE_COMPANY: ExperienceLetterCompanyInfo = {
  companyName: 'INFINITIVE CLOUD',
  registeredOffice: 'Kankroli,Rajasthan,313324',
  officeAddress: 'Udaipur Rajasthan,313001',
  phone: '+91 8690393087',
  email: 'cloudinfinitive@gmail.com',
  cin: 'U62020RJ2025PTC109151',
  website: 'https://infinitivecloud.com',
};

export const PREDEFINED_CONDUCT_REMARKS = [
  'During his/her tenure, he/she was dedicated and committed to his/her work. All the tasks assigned to him/her were accomplished to the satisfaction. He/She was an excellent team member.',
  'During his/her association with the company, he/she performed his/her responsibilities with diligence, high professional standards, and exemplary technical competence.',
  'He/She demonstrated exceptional problem-solving abilities, teamwork, and strong commitment to organizational goals. His/Her overall performance was satisfactory and commendable.',
  'He/She maintained an excellent track record of punctuality, professionalism, and collaboration across cross-functional teams.',
];

