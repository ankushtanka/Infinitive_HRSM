'use client';

import React, { forwardRef } from 'react';
import { PayslipData } from '@/types/payslip';
import { INFINITIVE_CLOUD_LOGO_BASE64, INFINITIVE_CLOUD_COMPANY_NAME } from '@/lib/payslipLogo';

export interface SalarySlipDocumentProps {
  data: PayslipData;
  className?: string;
  isPrintView?: boolean;
}

export const SalarySlipDocument = forwardRef<HTMLDivElement, SalarySlipDocumentProps>(
  ({ data, className = '', isPrintView = false }, ref) => {
    const { company, employee, salary, payslipNumber, payPeriodTitle } = data;

    const companyName = company?.name?.trim() || INFINITIVE_CLOUD_COMPANY_NAME;
    const logoSrc = company?.logoUrl && !company.logoUrl.includes('api/v1/settings/organization/logo')
      ? company.logoUrl
      : INFINITIVE_CLOUD_LOGO_BASE64;

    // Normalize office address (strictly office address only; no CIN, email, registration info)
    const rawAddress = company?.officeAddress || 'Udaipur Rajasthan,313001';
    const cleanAddress = rawAddress.replace(/^Office\s*Address\s*:\s*/i, '').trim() || 'Udaipur Rajasthan,313001';

    // Normalize payslip title dynamically derived from selected payroll record
    const payMonthYear = data.payPeriod || 'June 2026';
    let titleText = payPeriodTitle?.trim() || `Payslip for the month of ${payMonthYear}`;
    if (!titleText.toLowerCase().startsWith('payslip for the month of')) {
      titleText = `Payslip for the month of ${titleText}`;
    }

    // Align earnings and deductions rows (pad shorter column with empty rows so both columns match in height)
    const earningsList = salary?.earnings || [];
    const deductionsList = salary?.deductions || [];
    const maxRows = Math.max(earningsList.length, deductionsList.length, 4);

    const paddedEarnings = Array.from({ length: maxRows }, (_, idx) => earningsList[idx] || null);
    const paddedDeductions = Array.from({ length: maxRows }, (_, idx) => deductionsList[idx] || null);

    return (
      <div
        ref={ref}
        className={`bg-white text-black mx-auto select-none ${className}`}
        style={{
          width: '210mm',
          minHeight: '297mm',
          padding: '12mm 14mm',
          boxSizing: 'border-box',
          fontFamily: "'Times New Roman', Times, Georgia, serif",
          backgroundColor: '#ffffff',
          color: '#000000',
        }}
      >
        {/* MAIN OUTER BORDER (Matches Grras reference rectangular border) */}
        <div
          style={{
            border: '1.5px solid #000000',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {/* 1. HEADER SECTION: LOGO ON FAR LEFT (Vertically Centered) & CENTERED COMPANY INFO / TITLE ACROSS FULL WIDTH */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              padding: '12px 16px',
              boxSizing: 'border-box',
              borderBottom: '1px solid #000000',
              backgroundColor: '#ffffff',
              minHeight: '28mm',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {/* Left side: Official Infinitive Cloud logo (vertically centered, aspect ratio preserved) */}
            <div
              style={{
                position: 'absolute',
                left: '14px',
                top: '0',
                bottom: '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                pointerEvents: 'none',
              }}
            >
              <img
                src={logoSrc}
                alt={companyName}
                style={{
                  height: '20mm',
                  maxHeight: '76px',
                  width: 'auto',
                  maxWidth: '46mm',
                  objectFit: 'contain',
                  display: 'block',
                }}
                crossOrigin="anonymous"
              />
            </div>

            {/* Center section: Company name, Office Address, and Payslip title horizontally centered across full header width */}
            <div
              style={{
                width: '100%',
                textAlign: 'center',
                boxSizing: 'border-box',
                paddingLeft: '44mm',
                paddingRight: '44mm',
                margin: '0 auto',
              }}
            >
              {/* Company name in bold, uppercase serif typography */}
              <div
                style={{
                  fontWeight: 'bold',
                  fontSize: '12pt',
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                  lineHeight: '1.25',
                  color: '#000000',
                  fontFamily: "'Times New Roman', Times, Georgia, serif",
                  whiteSpace: 'nowrap',
                }}
              >
                {companyName}
              </div>

              {/* Office Address only (no CIN, email, registration etc.) in smaller serif typography */}
              <div
                style={{
                  fontSize: '9pt',
                  lineHeight: '1.35',
                  color: '#000000',
                  marginTop: '3px',
                  fontFamily: "'Times New Roman', Times, Georgia, serif",
                }}
              >
                Office Address: {cleanAddress}
              </div>

              {/* Payslip Title in bold serif typography */}
              <div
                style={{
                  fontWeight: 'bold',
                  fontSize: '11.5pt',
                  letterSpacing: '0.2px',
                  lineHeight: '1.3',
                  color: '#000000',
                  marginTop: '9px',
                  fontFamily: "'Times New Roman', Times, Georgia, serif",
                }}
              >
                {titleText}
              </div>
            </div>
          </div>

          {/* 2. EMPLOYEE DETAILS BLOCK (2 Columns divided by vertical border) */}
          <div
            style={{
              display: 'flex',
              fontSize: '9.5pt',
              lineHeight: '1.5',
            }}
          >
            {/* Left Column */}
            <div
              style={{
                width: '50%',
                padding: '6px 10px',
                borderRight: '1px solid #000000',
                boxSizing: 'border-box',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ width: '40%', padding: '2px 0', verticalAlign: 'top' }}>Name:</td>
                    <td style={{ width: '60%', padding: '2px 0', fontWeight: 'bold', verticalAlign: 'top' }}>
                      {employee?.name || '—'}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>Joining Date:</td>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{employee?.joiningDate || '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>Designation:</td>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{employee?.designation || 'Staff'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>Department:</td>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{employee?.department || 'General'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>Location:</td>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{employee?.location || 'Udaipur'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>Effective Work Days:</td>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{employee?.effectiveWorkDays ?? 30}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>LOP:</td>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{employee?.lop ?? 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Right Column */}
            <div
              style={{
                width: '50%',
                padding: '6px 10px',
                boxSizing: 'border-box',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ width: '42%', padding: '2px 0', verticalAlign: 'top' }}>Employee No:</td>
                    <td style={{ width: '58%', padding: '2px 0', fontWeight: 'bold', verticalAlign: 'top' }}>
                      {employee?.employeeNo || 'EMP1004'}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>Bank Name:</td>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{employee?.bankName || 'HDFC Bank'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>Bank Account No:</td>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>
                      {employee?.bankAccountNo || 'N/A'}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>PAN Number:</td>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>
                      {employee?.panNumber || 'N/A'}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>PF No:</td>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{employee?.pfNo || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>PF UAN:</td>
                    <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{employee?.pfUan || 'N/A'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. STRUCTURED SALARY TABLE (Earnings & Deductions side-by-side) */}
          <div style={{ borderTop: '1px solid #000000' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '9.5pt',
                lineHeight: '1.45',
              }}
            >
              {/* Table Column Headers */}
              <thead>
                <tr style={{ borderBottom: '1px solid #000000', fontWeight: 'bold' }}>
                  <th style={{ textAlign: 'left', padding: '5px 8px', width: '28%' }}>Earnings</th>
                  <th style={{ textAlign: 'right', padding: '5px 8px', width: '11%', borderRight: '1px solid #000000' }}>Master</th>
                  <th style={{ textAlign: 'right', padding: '5px 8px', width: '11%', borderRight: '1px solid #000000' }}>Actual</th>
                  <th style={{ textAlign: 'left', padding: '5px 8px', width: '38%' }}>Deductions</th>
                  <th style={{ textAlign: 'right', padding: '5px 8px', width: '12%' }}>Actual</th>
                </tr>
              </thead>

              {/* Data Rows */}
              <tbody>
                {paddedEarnings.map((earnItem, idx) => {
                  const dedItem = paddedDeductions[idx];
                  return (
                    <tr key={idx} style={{ height: '22px' }}>
                      {/* Earnings Title */}
                      <td style={{ padding: '2px 8px', verticalAlign: 'middle', textTransform: 'uppercase' }}>
                        {earnItem ? earnItem.name : ''}
                      </td>
                      {/* Master Amount */}
                      <td
                        style={{
                          padding: '2px 8px',
                          textAlign: 'right',
                          verticalAlign: 'middle',
                          borderRight: '1px solid #000000',
                        }}
                      >
                        {earnItem ? earnItem.master.toLocaleString('en-IN') : ''}
                      </td>
                      {/* Actual Amount */}
                      <td
                        style={{
                          padding: '2px 8px',
                          textAlign: 'right',
                          verticalAlign: 'middle',
                          borderRight: '1px solid #000000',
                        }}
                      >
                        {earnItem ? earnItem.actual.toLocaleString('en-IN') : ''}
                      </td>

                      {/* Deductions Title */}
                      <td style={{ padding: '2px 8px', verticalAlign: 'middle', textTransform: 'uppercase' }}>
                        {dedItem ? dedItem.name : ''}
                      </td>
                      {/* Deductions Actual Amount */}
                      <td style={{ padding: '2px 8px', textAlign: 'right', verticalAlign: 'middle' }}>
                        {dedItem ? dedItem.actual.toLocaleString('en-IN') : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Totals Row */}
              <tfoot>
                <tr style={{ borderTop: '1px solid #000000', fontWeight: 'bold' }}>
                  <td style={{ padding: '5px 8px' }}>Total Earnings:INR.</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', borderRight: '1px solid #000000' }}>
                    {salary?.totalEarningsMaster ? salary.totalEarningsMaster.toLocaleString('en-IN') : '0'}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', borderRight: '1px solid #000000' }}>
                    {salary?.totalEarningsActual ? salary.totalEarningsActual.toLocaleString('en-IN') : '0'}
                  </td>
                  <td style={{ padding: '5px 8px' }}>Total Deductions:INR.</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                    {salary?.totalDeductionsActual ? salary.totalDeductionsActual.toLocaleString('en-IN') : '0'}
                  </td>
                </tr>

                {/* Net Pay Row (Full Width spanning) */}
                <tr style={{ borderTop: '1px solid #000000' }}>
                  <td colSpan={5} style={{ padding: '7px 8px' }}>
                    <div style={{ fontSize: '10pt' }}>
                      <span>Net Pay for the month ( Total Earnings - Total Deductions): </span>
                      <span style={{ fontWeight: 'bold', marginLeft: '6px' }}>
                        {salary?.netPay ? salary.netPay.toLocaleString('en-IN') : '0'}
                      </span>
                    </div>
                    <div style={{ fontStyle: 'italic', fontSize: '9.5pt', marginTop: '2px', color: '#111827' }}>
                      ({salary?.netPayInWords ? `Rupees ${salary.netPayInWords} Only` : 'Rupees Zero Only'})
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* 4. FOOTER NOTE OUTSIDE TABLE (Centered, exactly as in reference image) */}
        <div
          style={{
            textAlign: 'center',
            fontSize: '9pt',
            marginTop: '8px',
            color: '#111827',
          }}
        >
          This is a system generated payslip and does not require signature.
        </div>
      </div>
    );
  }
);

SalarySlipDocument.displayName = 'SalarySlipDocument';
