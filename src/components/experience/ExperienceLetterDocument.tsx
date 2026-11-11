'use client';

import React, { forwardRef } from 'react';
import { ExperienceLetterRecord, DEFAULT_EXPERIENCE_COMPANY } from '@/types/experienceLetter';

export interface ExperienceLetterDocumentProps {
  letter: Partial<ExperienceLetterRecord>;
  className?: string;
}

export interface ResolvedGrammar {
  fullNameWithTitle: string;
  pronounSubject: string;
  pronounSubjectLower: string;
  pronounObject: string;
  pronounPossessive: string;
  relievingDateIntro: string;
  defaultConduct: string;
  defaultWishes: string;
}

// Automatically and respectfully determines title & pronouns from verified employee profile
export const resolveEmployeeGrammar = (
  employeeName: string,
  salutationRaw?: string,
  pronounsRaw?: string,
  guardianRelationRaw?: string
): ResolvedGrammar => {
  const cleanName = (employeeName || 'Employee').trim();
  const sal = (salutationRaw || '').trim();
  const pro = (pronounsRaw || '').trim().toLowerCase();
  const rel = (guardianRelationRaw || '').trim().toLowerCase();

  let mode: 'male' | 'female' | 'neutral' = 'neutral';

  if (rel === 'd/o' || rel === 'w/o') {
    mode = 'female';
  } else if (sal === 'Ms.' || sal === 'Mrs.' || sal.toLowerCase() === 'ms' || sal.toLowerCase() === 'mrs') {
    mode = 'female';
  } else if (pro === 'she/her' || pro === 'she' || pro === 'female') {
    mode = 'female';
  } else if (rel === 's/o') {
    mode = 'male';
  } else if (sal === 'Mr.' || sal.toLowerCase() === 'mr') {
    mode = 'male';
  } else if (pro === 'he/him' || pro === 'he' || pro === 'male') {
    mode = 'male';
  } else if (pro === 'they/them' || pro === 'neutral' || pro === 'they') {
    mode = 'neutral';
  } else {
    mode = 'neutral';
  }

  if (mode === 'male') {
    const title = sal && sal !== 'None' ? sal : 'Mr.';
    return {
      fullNameWithTitle: `${title} ${cleanName}`,
      pronounSubject: 'He',
      pronounSubjectLower: 'he',
      pronounObject: 'him',
      pronounPossessive: 'his',
      relievingDateIntro: 'His date of relieving from Infinitive Cloud ',
      defaultConduct: `During his tenure, he was dedicated and committed to his work. All the task assigned to him were accomplished to the satisfaction. He was an excellent team member.`,
      defaultWishes: `We wish him success for all his future endeavor and bright career ahead.`,
    };
  }

  if (mode === 'female') {
    const title = sal && sal !== 'None' && sal !== 'Mr.' ? sal : 'Ms.';
    return {
      fullNameWithTitle: `${title} ${cleanName}`,
      pronounSubject: 'She',
      pronounSubjectLower: 'she',
      pronounObject: 'her',
      pronounPossessive: 'her',
      relievingDateIntro: 'Her date of relieving from Infinitive Cloud ',
      defaultConduct: `During her tenure, she was dedicated and committed to her work. All the task assigned to her were accomplished to the satisfaction. She was an excellent team member.`,
      defaultWishes: `We wish her success for all her future endeavor and bright career ahead.`,
    };
  }

  const titlePrefix = sal === 'Mx.' || sal === 'Dr.' ? `${sal} ` : '';
  return {
    fullNameWithTitle: `${titlePrefix}${cleanName}`,
    pronounSubject: cleanName,
    pronounSubjectLower: cleanName,
    pronounObject: 'them',
    pronounPossessive: 'their',
    relievingDateIntro: 'The date of relieving from Infinitive Cloud ',
    defaultConduct: `During the employment period, ${cleanName} demonstrated commitment to assigned responsibilities. All assigned tasks were accomplished to satisfaction. ${cleanName} was an excellent team member.`,
    defaultWishes: `We wish ${cleanName} success for all future endeavors and a bright career ahead.`,
  };
};

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

const REF_MONTH_NAMES = [
  'Jan', 'Feb', 'March', 'April', 'May', 'June',
  'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
];

// Formats date into { day: "09", ordinal: "th", rest: "Feb 2026" }
export const formatReferenceDate = (dateStr?: string): { day: string; ordinal: string; rest: string } => {
  if (!dateStr) return { day: '', ordinal: '', rest: '' };
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const dayNum = parseInt(parts[2], 10);
      const dayStr = String(dayNum).padStart(2, '0');
      const ordinal = getOrdinal(dayNum);
      const month = REF_MONTH_NAMES[monthIdx] || parts[1];
      return { day: dayStr, ordinal, rest: `${month} ${year}` };
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const dayNum = d.getDate();
      const dayStr = String(dayNum).padStart(2, '0');
      const ordinal = getOrdinal(dayNum);
      return { day: dayStr, ordinal, rest: `${REF_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` };
    }
  } catch {}
  return { day: dateStr, ordinal: '', rest: '' };
};

// Formats issue date into e.g. "Jul 24,2026"
export const formatIssueDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const dayNum = parseInt(parts[2], 10);
      return `${monthNames[monthIdx]} ${dayNum},${year}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return `${monthNames[d.getMonth()]} ${d.getDate()},${d.getFullYear()}`;
    }
  } catch {}
  return dateStr;
};

const supStyle: React.CSSProperties = { fontSize: '0.72em', verticalAlign: 'super', lineHeight: 0 };

export const ExperienceLetterDocument = forwardRef<HTMLDivElement, ExperienceLetterDocumentProps>(
  ({ letter, className = '' }, ref) => {
    const companyName = DEFAULT_EXPERIENCE_COMPANY.companyName;
    const registeredOffice = DEFAULT_EXPERIENCE_COMPANY.registeredOffice;
    const officeAddress = DEFAULT_EXPERIENCE_COMPANY.officeAddress;
    const phone = DEFAULT_EXPERIENCE_COMPANY.phone;
    const email = DEFAULT_EXPERIENCE_COMPANY.email;
    const cin = DEFAULT_EXPERIENCE_COMPANY.cin;

    const employeeName = letter.employeeName || 'Gauransh Jaroli';
    const designation = letter.designation || 'Software Developer Engineer';

    const joining = formatReferenceDate(letter.joiningDate || '2026-02-09');
    const relieving = formatReferenceDate(letter.relievingDate || '2026-07-09');
    const issueDateFormatted = formatIssueDate(letter.issueDate || '2026-07-24');

    const grammar = resolveEmployeeGrammar(
      employeeName,
      letter.salutation,
      letter.pronouns,
      letter.guardianRelation
    );

    // Guardian formatting (e.g. "S/o Mr. Naresh" or "D/o Mr. Manohar Singh")
    let guardianText = '';
    if (letter.guardianName && letter.guardianName.trim()) {
      const rawGName = letter.guardianName.trim();
      const titleCasedGName = rawGName
        .split(' ')
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
        .join(' ');
      const hasPrefix =
        titleCasedGName.toLowerCase().startsWith('mr.') ||
        titleCasedGName.toLowerCase().startsWith('ms.') ||
        titleCasedGName.toLowerCase().startsWith('dr.');
      const formattedGName = hasPrefix ? titleCasedGName : `Mr. ${titleCasedGName}`;
      const defaultRel = grammar.pronounPossessive === 'her' ? 'D/o' : grammar.pronounPossessive === 'his' ? 'S/o' : 'C/o';
      const rel = letter.guardianRelation || defaultRel;
      guardianText = `${rel} ${formattedGName}`;
    }

    // Conduct text
    let conductText = letter.conductRemark?.trim() || grammar.defaultConduct;
    if (grammar.pronounSubject === 'He') {
      conductText = conductText
        .replace(/\bHe\/She\b/g, 'He')
        .replace(/\bhe\/she\b/g, 'he')
        .replace(/\bHis\/Her\b/g, 'His')
        .replace(/\bhis\/her\b/g, 'his')
        .replace(/\bHim\/Her\b/g, 'Him')
        .replace(/\bhim\/her\b/g, 'him');
    } else if (grammar.pronounSubject === 'She') {
      conductText = conductText
        .replace(/\bHe\/She\b/g, 'She')
        .replace(/\bhe\/she\b/g, 'she')
        .replace(/\bHis\/Her\b/g, 'Her')
        .replace(/\bhis\/her\b/g, 'her')
        .replace(/\bHim\/Her\b/g, 'Her')
        .replace(/\bhim\/her\b/g, 'her');
    } else {
      conductText = conductText
        .replace(/\bHe\/She\b/g, employeeName)
        .replace(/\bhe\/she\b/g, employeeName)
        .replace(/\bHis\/Her\b/g, 'Their')
        .replace(/\bhis\/her\b/g, 'their')
        .replace(/\bHim\/Her\b/g, 'Them')
        .replace(/\bhim\/her\b/g, 'them');
    }

    const signatoryName = letter.signatoryName || 'Ankush Ranka';
    const signatoryDesignation = letter.signatoryDesignation || 'Founder & CEO';

    const ARIAL = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

    return (
      <div
        ref={ref}
        id="experience-letter-print-sheet"
        className={`bg-white text-black font-sans relative box-border ${className}`}
        style={{
          width: '210mm',
          height: '297mm',
          minHeight: '297mm',
          maxHeight: '297mm',
          paddingTop: '6mm',
          paddingLeft: '14mm',
          paddingRight: '14mm',
          paddingBottom: '20mm',
          boxSizing: 'border-box',
          fontFamily: ARIAL,
          backgroundColor: '#ffffff',
          color: '#000000',
          overflow: 'hidden',
          display: 'block',
        }}
      >
        {/* 1. TOP COMPANY HEADER */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            paddingBottom: '2.5mm',
          }}
        >
          <div style={{ flexShrink: 0, paddingTop: '1mm' }}>
            <img
              src="/infinitive_cloud_logo.png"
              alt={companyName}
              style={{
                height: '24mm',
                width: 'auto',
                maxWidth: '82mm',
                display: 'block',
              }}
              className="object-contain"
              crossOrigin="anonymous"
            />
          </div>

          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              paddingTop: '1mm',
            }}
          >
            <div style={{ display: 'inline-block' }}>
              <p
                style={{
                  textAlign: 'center',
                  fontWeight: 'bold',
                  fontSize: '10.5pt',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  color: '#000000',
                  margin: '0 0 2px 0',
                }}
              >
                {companyName}
              </p>
              <div
                style={{
                  textAlign: 'left',
                  fontSize: '8pt',
                  lineHeight: '1.3',
                  color: '#000000',
                  fontFamily: ARIAL,
                }}
              >
                <p style={{ margin: '0' }}>
                  <span style={{ fontWeight: 'bold' }}>Registered Office:</span> {(registeredOffice || '').trim()}
                </p>
                <p style={{ margin: '0' }}>
                  <span style={{ fontWeight: 'bold' }}>Office Address:</span> {(officeAddress || '').trim()}
                </p>
                <p style={{ margin: '0' }}>
                  <span style={{ fontWeight: 'bold' }}>Phone No:</span> {(phone || '').trim()}
                </p>
                <p style={{ margin: '0' }}>
                  <span style={{ fontWeight: 'bold' }}>Email:</span>
                  <span style={{ color: '#0066cc' }}>{(email || '').trim()}</span>
                </p>
                <p style={{ margin: '0' }}>
                  <span style={{ fontWeight: 'bold' }}>CIN No:</span>{(cin || '').trim()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Thin black horizontal line directly beneath the header extending across the page */}
        <div
          style={{
            marginLeft: '-14mm',
            marginRight: '-14mm',
            width: 'calc(100% + 28mm)',
            borderBottom: '1px solid #000000',
            marginTop: '1.5mm',
            marginBottom: '24mm',
          }}
        />

        {/* 2. HEADINGS — Arial Bold 14pt, uppercase, underlined, centered, dark black */}
        <div style={{ textAlign: 'center', marginBottom: '10mm' }}>
          <h1
            style={{
              fontFamily: ARIAL,
              fontSize: '14pt',
              fontWeight: 800,
              textTransform: 'uppercase',
              textDecoration: 'underline',
              textDecorationColor: '#000000',
              textDecorationThickness: '2px',
              textUnderlineOffset: '4px',
              letterSpacing: '0.2px',
              margin: '0',
              color: '#000000',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              textRendering: 'geometricPrecision',
              textShadow: '0 0 0.4px #000000, 0 0 0.4px #000000',
            }}
          >
            EXPERIENCE CUM RELIEVING LETTER
          </h1>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '16mm' }}>
          <h2
            style={{
              fontFamily: ARIAL,
              fontSize: '14pt',
              fontWeight: 800,
              textTransform: 'uppercase',
              textDecoration: 'underline',
              textDecorationColor: '#000000',
              textDecorationThickness: '2px',
              textUnderlineOffset: '4px',
              letterSpacing: '0.2px',
              margin: '0',
              color: '#000000',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              textRendering: 'geometricPrecision',
              textShadow: '0 0 0.4px #000000, 0 0 0.4px #000000',
            }}
          >
            TO WHOM SO EVER IT MAY CONCERN
          </h2>
        </div>

        {/* 3. MAIN BODY — Arial 11pt, line spacing 1.38, left aligned */}
        <div
          style={{
            fontFamily: ARIAL,
            fontSize: '11pt',
            lineHeight: 1.38,
            color: '#000000',
            textAlign: 'left',
          }}
        >
          {/* Paragraph 1: Employment Confirmation */}
          <p style={{ margin: '0 0 14pt 0', textAlign: 'left' }}>
            This is to certify that <strong>{grammar.fullNameWithTitle}</strong>{' '}
            {guardianText ? `${guardianText} ` : ''}had been part of Infinitive Cloud team as a{' '}
            <strong>{designation}</strong> from{' '}
            <strong>
              {joining.day}
              <sup style={supStyle}>{joining.ordinal}</sup>{' '}
              {joining.rest} to {relieving.day}
              <sup style={supStyle}>{relieving.ordinal}</sup>{' '}
              {relieving.rest}
            </strong>
            .
          </p>

          {/* Paragraph 2: Conduct */}
          <p style={{ margin: '0 0 14pt 0', textAlign: 'left' }}>{conductText}</p>

          {/* Paragraph 3: Relieving date (date in bold) */}
          <p style={{ margin: '0 0 14pt 0', textAlign: 'left' }}>
            {grammar.relievingDateIntro}is{' '}
            <strong>
              {relieving.day}
              <sup style={supStyle}>{relieving.ordinal}</sup>{' '}
              {relieving.rest}
            </strong>
            .
          </p>

          {/* Paragraph 4: Wishes */}
          <p style={{ margin: '0 0 18mm 0', textAlign: 'left' }}>{grammar.defaultWishes}</p>
        </div>

        {/* 4. SIGNATORY SECTION */}
        <div style={{ textAlign: 'left', fontFamily: ARIAL }}>
          <p style={{ fontWeight: 'bold', fontSize: '11pt', color: '#000000', margin: '0' }}>
            For Infinitive Cloud
          </p>

          {/* Blank signature space matching the reference image */}
          <div
            style={{
              height: '24mm',
              minHeight: '24mm',
              display: 'block',
            }}
          />

          <div
            style={{
              fontSize: '11pt',
              lineHeight: 1.35,
              color: '#000000',
              fontFamily: ARIAL,
            }}
          >
            <p style={{ margin: '0' }}>{signatoryName}</p>
            <p style={{ margin: '0' }}>{signatoryDesignation}</p>
            <p style={{ margin: '0' }}>{issueDateFormatted}</p>
          </div>
        </div>
      </div>
    );
  }
);

ExperienceLetterDocument.displayName = 'ExperienceLetterDocument';