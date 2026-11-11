export interface PayslipCompanyInfo {
  name: string;
  tagline?: string;
  registeredOffice: string;
  officeAddress: string;
  phone: string;
  email: string;
  cin: string;
  logoUrl?: string;
}

export interface PayslipEmployeeInfo {
  name: string;
  employeeNo: string;
  joiningDate: string;
  designation: string;
  department: string;
  location: string;
  effectiveWorkDays: number;
  paidDays: number;
  lop: number;
  bankName: string;
  bankAccountNo: string; // Masked
  panNumber: string;     // Masked
  pfNo: string;
  pfUan: string;
  email?: string;
}

export interface PayslipEarningsItem {
  name: string;
  master: number;
  actual: number;
}

export interface PayslipDeductionsItem {
  name: string;
  actual: number;
}

export interface PayslipBreakdownSummaryItem {
  component: string;
  monthlyAmount: number;
  percentage: string;
  description?: string;
}

export interface PayslipSalaryBreakdown {
  earnings: PayslipEarningsItem[];
  deductions: PayslipDeductionsItem[];
  totalEarningsMaster: number;
  totalEarningsActual: number;
  totalDeductionsActual: number;
  netPay: number;
  netPayInWords: string;
  breakdownSummary?: PayslipBreakdownSummaryItem[];
}

export interface PayslipData {
  id: string;
  payslipNumber: string;
  payPeriod: string;
  payPeriodTitle: string;
  status: string;
  paidAt?: string | null;
  company: PayslipCompanyInfo;
  employee: PayslipEmployeeInfo;
  salary: PayslipSalaryBreakdown;
  payrollRecord?: any;
}
