/**
 * Standard Salary Breakdown Engine
 *
 * Requirements:
 * - Gross Salary: ₹25,000 (100%)
 * - Basic Salary: 50% of Gross = ₹12,500
 * - HRA: 30% of Basic (15% of Gross) = ₹3,750
 * - Conveyance: Retained at ₹2,353 (9.41% of Gross)
 * - Special Allowance: Remainder (₹25,000 - ₹12,500 - ₹3,750 - ₹2,353) = ₹6,397 (25.59% of Gross)
 */

export interface SalaryBreakdownComponent {
  component: string;
  monthlyAmount: number;
  percentageOfGross: number; // e.g. 50, 15, 9.41, 25.59
  percentageFormatted: string; // e.g. "50%", "15%", "9.41%", "25.59%"
  description: string;
}

export interface SalaryBreakdownResult {
  grossSalary: number;
  basicSalary: number;
  hra: number;
  conveyance: number;
  specialAllowance: number;
  components: SalaryBreakdownComponent[];
  percentages: {
    basic: number;
    hra: number;
    conveyance: number;
    specialAllowance: number;
  };
}

export const STANDARD_BREAKDOWN_25K: SalaryBreakdownResult = {
  grossSalary: 25000,
  basicSalary: 12500,
  hra: 3750,
  conveyance: 2353,
  specialAllowance: 6397,
  percentages: {
    basic: 50,
    hra: 15,
    conveyance: 9.41,
    specialAllowance: 25.59,
  },
  components: [
    {
      component: 'Basic Salary',
      monthlyAmount: 12500,
      percentageOfGross: 50,
      percentageFormatted: '50%',
      description: '50% of Gross Salary',
    },
    {
      component: 'HRA',
      monthlyAmount: 3750,
      percentageOfGross: 15,
      percentageFormatted: '15%',
      description: '30% of Basic Salary',
    },
    {
      component: 'Conveyance',
      monthlyAmount: 2353,
      percentageOfGross: 9.41,
      percentageFormatted: '9.41%',
      description: 'Fixed / retained monthly travel allowance',
    },
    {
      component: 'Special Allowance',
      monthlyAmount: 6397,
      percentageOfGross: 25.59,
      percentageFormatted: '25.59%',
      description: 'Balancing allowance (Gross - Basic - HRA - Conveyance)',
    },
  ],
};

/**
 * Calculates the salary component breakdown according to the revised enterprise formula:
 * 1. Basic: 50% of Gross
 * 2. HRA: 30% of Basic (15% of Gross)
 * 3. Conveyance: ₹2,353 (for gross >= ₹10,000, or proportional 9.412% if lower)
 * 4. Special Allowance: Gross - (Basic + HRA + Conveyance)
 */
export function calculateSalaryBreakdown(inputGross: number): SalaryBreakdownResult {
  const gross = Math.max(0, Math.round(Number(inputGross) || 0));

  if (gross <= 0) {
    return {
      grossSalary: 0,
      basicSalary: 0,
      hra: 0,
      conveyance: 0,
      specialAllowance: 0,
      percentages: { basic: 50, hra: 15, conveyance: 9.41, specialAllowance: 25.59 },
      components: [],
    };
  }

  // Exact standard match for 25,000
  if (gross === 25000) {
    return STANDARD_BREAKDOWN_25K;
  }

  const basicSalary = Math.round(gross * 0.50);
  const hra = Math.round(basicSalary * 0.30);
  const conveyance = gross >= 10000 ? 2353 : Math.min(2353, Math.round(gross * 0.09412));
  const specialAllowance = Math.max(0, gross - (basicSalary + hra + conveyance));

  const basicPct = Number(((basicSalary / gross) * 100).toFixed(2));
  const hraPct = Number(((hra / gross) * 100).toFixed(2));
  const convPct = Number(((conveyance / gross) * 100).toFixed(2));
  const specialPct = Number(((specialAllowance / gross) * 100).toFixed(2));

  return {
    grossSalary: gross,
    basicSalary,
    hra,
    conveyance,
    specialAllowance,
    percentages: {
      basic: basicPct,
      hra: hraPct,
      conveyance: convPct,
      specialAllowance: specialPct,
    },
    components: [
      {
        component: 'Basic Salary',
        monthlyAmount: basicSalary,
        percentageOfGross: basicPct,
        percentageFormatted: `${basicPct}%`,
        description: '50% of Gross Salary',
      },
      {
        component: 'HRA',
        monthlyAmount: hra,
        percentageOfGross: hraPct,
        percentageFormatted: `${hraPct}%`,
        description: '30% of Basic Salary',
      },
      {
        component: 'Conveyance',
        monthlyAmount: conveyance,
        percentageOfGross: convPct,
        percentageFormatted: `${convPct}%`,
        description: 'Fixed monthly conveyance allowance',
      },
      {
        component: 'Special Allowance',
        monthlyAmount: specialAllowance,
        percentageOfGross: specialPct,
        percentageFormatted: `${specialPct}%`,
        description: 'Balancing allowance (Gross - Basic - HRA - Conveyance)',
      },
    ],
  };
}
