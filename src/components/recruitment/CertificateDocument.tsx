'use client';

import React, { forwardRef } from 'react';
import { InternshipCertificateRecord } from '@/types/certificate';

export interface CertificateDocumentProps {
  certificate: Partial<InternshipCertificateRecord>;
  className?: string;
}

// Ordinal indicator helper ('st' | 'nd' | 'rd' | 'th')
export const getOrdinal = (n: number): string => {
  const k = n % 100;
  if (k >= 11 && k <= 13) return 'th';
  const j = n % 10;
  if (j === 1) return 'st';
  if (j === 2) return 'nd';
  if (j === 3) return 'rd';
  return 'th';
};

// Formats date into "03rd Oct, 2026" or "12th Sept. 2026"
export const formatCertificateDate = (dateStr?: string, withPeriodForSept: boolean = false): string => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const dayNum = parseInt(parts[2], 10);
      const dayPadded = String(dayNum).padStart(2, '0');
      const ordinal = getOrdinal(dayNum);
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', withPeriodForSept ? 'Sept.' : 'Sept', 'Oct', 'Nov', 'Dec'
      ];
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${dayPadded}${ordinal} ${months[monthIdx]} ${year}`;
      }
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dayNum = d.getDate();
    const dayPadded = String(dayNum).padStart(2, '0');
    const ordinal = getOrdinal(dayNum);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', withPeriodForSept ? 'Sept.' : 'Sept', 'Oct', 'Nov', 'Dec'
    ];
    return `${dayPadded}${ordinal} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
};

export const CertificateDocument = forwardRef<HTMLDivElement, CertificateDocumentProps>(
  ({ certificate, className = '' }, ref) => {
    const companyName = certificate.companyName || 'INFINITIVE CLOUD';
    const registeredOffice = certificate.registeredOffice || 'Kankroli,Rajasthan,313324';
    const officeAddress = certificate.officeAddress || 'Udaipur Rajasthan,313001';
    const phone = certificate.phone || '+91 8690393087';
    const email = certificate.email || 'cloudinfinitive@gmail.com';
    const cin = certificate.cin || 'U62020RJ2025PTC109151';

    const internName = certificate.internName || 'Karishma Panwar';
    const salutation = certificate.salutation ? certificate.salutation.trim() : 'Ms.';
    const degreeCourse = certificate.degreeCourse || 'B.Tech';
    const collegeName = certificate.collegeName || 'Institute of Engineering and Technology, MLSU, Udaipur (Raj)';
    const internshipRole = certificate.internshipRole || 'Cloud & DevOps Intern';

    const formattedStartDate = formatCertificateDate(certificate.startDate || '2026-06-08');
    const formattedCompletionDate = formatCertificateDate(certificate.completionDate || '2026-09-12', true);
    const formattedIssueDate = formatCertificateDate(certificate.issueDate || '2026-10-03');

    // Dynamic pronouns based on salutation
    const isFemale = salutation.toLowerCase().includes('ms') || salutation.toLowerCase().includes('mrs');
    const pronounSubject = isFemale ? 'She' : 'He';
    const pronounPossessive = isFemale ? 'her' : 'his';

    return (
      <div
        ref={ref}
        className={`bg-white text-black font-sans relative box-border ${className}`}
        style={{
          width: '210mm',
          height: '297mm',
          minHeight: '297mm',
          maxHeight: '297mm',
          padding: '12mm 15mm 15mm 15mm',
          boxSizing: 'border-box',
          fontFamily: "Arial, 'Segoe UI', Calibri, sans-serif",
          backgroundColor: '#ffffff',
          color: '#000000',
          overflow: 'hidden',
        }}
      >
        {/* 1. COMPANY LETTERHEAD HEADER */}
        <div className="flex items-center justify-between pb-[3mm]">
          {/* Header Left: Official Company Logo */}
          <div className="shrink-0 flex items-center">
            <img
              src="/infinitive_cloud_logo.png"
              alt={companyName}
              style={{ height: '33mm', width: 'auto', maxWidth: '92mm' }}
              className="object-contain"
              crossOrigin="anonymous"
            />
          </div>

          {/* Header Right: Company Registration & Contact Info */}
          <div
            className="text-right text-[9pt] leading-[1.35] text-black font-normal"
            style={{ fontFamily: 'Calibri, Arial, sans-serif' }}
          >
            <p className="font-bold text-[10.5pt] uppercase tracking-wide text-black">{companyName}</p>
            <p><span className="font-bold">Registered Office:</span> {registeredOffice}</p>
            <p><span className="font-bold">Office Address:</span> {officeAddress}</p>
            <p><span className="font-bold">Phone No:</span> {phone}</p>
            <p>
              <span className="font-bold">Email:</span>{' '}
              <span className="text-[#0066cc] underline">{email}</span>
            </p>
            <p><span className="font-bold">CIN No:</span> {cin}</p>
          </div>
        </div>

        {/* Header Divider Line */}
        <div className="w-full border-b-[1.5px] border-black" />

        {/* 2. DATE (Right aligned below header divider) */}
        <div
          className="text-right font-bold text-[10.5pt] text-black"
          style={{ fontFamily: 'Calibri, Arial, sans-serif', marginTop: '4mm' }}
        >
          Date: {formattedIssueDate}
        </div>

        {/* 3. CERTIFICATE HEADINGS (Positioned ~100-120px below divider line) */}
        <div style={{ marginTop: '22mm' }} className="text-center">
          <h2
            className="text-[13.5pt] font-black tracking-wider text-black uppercase underline decoration-[1.5px] underline-offset-[5px]"
            style={{ fontFamily: 'Calibri, Arial, sans-serif' }}
          >
            INTERNSHIP CERTIFICATE
          </h2>
          <h3
            style={{ marginTop: '7mm', fontFamily: 'Arial, Calibri, sans-serif' }}
            className="text-[10pt] font-black tracking-wider text-black uppercase underline decoration-[1.5px] underline-offset-[4px]"
          >
            TO WHOM SO EVER IT MAY CONCERN
          </h3>
        </div>

        {/* 4. CERTIFICATE BODY CONTENT (Positioned 35-45px below subtitle with consistent 16-22px paragraph spacing) */}
        <div
          style={{ marginTop: '10.5mm', fontFamily: 'Arial, sans-serif' }}
          className="text-[10pt] text-black leading-[1.65] font-normal"
        >
          <p style={{ marginBottom: '4.8mm' }} className="text-justify">
            This is to certify that{' '}
            <strong className="font-bold text-black">
              {salutation} {internName}
            </strong>
            , a student of{' '}
            <strong className="font-bold text-black">{degreeCourse}</strong> at{' '}
            <strong className="font-bold text-black">{collegeName}</strong>, has completed an
            internship as an{' '}
            <strong className="font-bold text-black">{internshipRole}</strong> at{' '}
            <strong className="font-bold text-black">{companyName}</strong>, during the period
            from <strong className="font-bold text-black">{formattedStartDate}</strong> to{' '}
            <strong className="font-bold text-black">{formattedCompletionDate}</strong>.
          </p>

          <p style={{ marginBottom: '4.8mm' }} className="text-justify">
            {pronounSubject} has completed training successfully on{' '}
            <strong className="font-bold text-black">{formattedCompletionDate}</strong>.
          </p>

          <p className="text-justify">
            We wish {pronounPossessive} continued success in {pronounPossessive} future endeavors
            and a bright and successful career ahead.
          </p>
        </div>

        {/* 5. AUTHORIZED SIGNATORY SECTION (Left-aligned, clean spacing without stamp/seal) */}
        <div style={{ marginTop: '13.5mm' }} className="text-left">
          <p
            className="text-[11pt] font-bold text-black"
            style={{ fontFamily: 'Calibri, Arial, sans-serif' }}
          >
            For {companyName}
          </p>

          <div style={{ fontFamily: 'Calibri, Arial, sans-serif', marginTop: '10mm' }}>
            <p className="text-[11pt] font-bold text-black leading-tight">
              {certificate.signatoryName || 'Ankush Ranka'}
            </p>
            <p className="text-[10.5pt] font-bold text-black leading-tight mt-[1mm]">
              {certificate.signatoryDesignation || 'Founder & CEO'}
            </p>
          </div>
        </div>
      </div>
    );
  }
);

CertificateDocument.displayName = 'CertificateDocument';
