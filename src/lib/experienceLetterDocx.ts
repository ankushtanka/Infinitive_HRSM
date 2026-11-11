import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  convertMillimetersToTwip,
} from 'docx';
import {
  formatReferenceDate,
  formatIssueDate,
  resolveEmployeeGrammar,
} from '@/components/experience/ExperienceLetterDocument';
import { ExperienceLetterRecord } from '@/types/experienceLetter';

export interface GenerateDocxOptions {
  letter?: Partial<ExperienceLetterRecord>;
  employeeName?: string;
  fatherName?: string;
  designation?: string;
  joiningDate?: string;
  relievingDate?: string;
  issueDate?: string;
  gender?: 'male' | 'female';
  signatoryName?: string;
  signatoryTitle?: string;
}

export async function createExperienceLetterDocxBlob(options: GenerateDocxOptions = {}): Promise<Blob> {
  const employeeName = options.employeeName || options.letter?.employeeName || 'Gauransh Jaroli';
  const fatherName = options.fatherName || options.letter?.guardianName || 'Naresh';
  const designation = options.designation || options.letter?.designation || 'Software Developer Engineer';
  const rawJoining = options.joiningDate || options.letter?.joiningDate || '2026-02-09';
  const rawRelieving = options.relievingDate || options.letter?.relievingDate || '2026-07-09';
  const rawIssue = options.issueDate || options.letter?.issueDate || '2026-07-24';

  const joining = formatReferenceDate(rawJoining);
  const relieving = formatReferenceDate(rawRelieving);
  const formattedIssueDate = formatIssueDate(rawIssue);

  const grammar = resolveEmployeeGrammar(
    employeeName,
    options.letter?.salutation,
    options.letter?.pronouns,
    options.letter?.guardianRelation
  );

  const isFemale =
    options.gender === 'female' ||
    grammar.pronounSubject === 'She' ||
    grammar.pronounPossessive === 'her';

  const titleSalutation = isFemale ? 'Ms.' : 'Mr.';
  const relationPrefix = isFemale ? 'D/o' : 'S/o';
  const pronounSubject = isFemale ? 'She' : 'He';
  const pronounSubjectLower = isFemale ? 'she' : 'he';
  const pronounObject = isFemale ? 'her' : 'him';
  const pronounPossessive = isFemale ? 'her' : 'his';
  const pronounPossessiveCap = isFemale ? 'Her' : 'His';

  const signatoryName = options.signatoryName || options.letter?.signatoryName || 'Ankush Ranka';
  const signatoryTitle = options.signatoryTitle || options.letter?.signatoryDesignation || 'Founder & CEO';

  // No border style helper
  const noBorder = {
    style: BorderStyle.NONE,
    size: 0,
    color: 'FFFFFF',
  };
  const tableBorders = {
    top: noBorder,
    bottom: noBorder,
    left: noBorder,
    right: noBorder,
    insideHorizontal: noBorder,
    insideVertical: noBorder,
  };

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              // A4: 210mm x 297mm
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              // 2.0 cm top/bottom, 2.5 cm left/right
              top: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(25),
              right: convertMillimetersToTwip(25),
            },
          },
        },
        children: [
          // ===================================================================
          // HEADER (two columns, no table borders)
          // ===================================================================
          new Table({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            borders: tableBorders,
            rows: [
              new TableRow({
                children: [
                  // Left column: logo text + tagline
                  new TableCell({
                    width: {
                      size: 50,
                      type: WidthType.PERCENTAGE,
                    },
                    borders: tableBorders,
                    margins: { top: 0, bottom: 0, left: 0, right: 100 },
                    children: [
                      new Paragraph({
                        spacing: { before: 0, after: 30, line: 240 },
                        children: [
                          new TextRun({
                            text: 'Infinitive Cloud',
                            font: 'Arial',
                            size: 20, // 10 pt
                            bold: true,
                            color: '000000',
                          }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { before: 0, after: 0, line: 240 },
                        children: [
                          new TextRun({
                            text: 'Limitless Solution for Cloud and Web Hosting',
                            font: 'Arial',
                            size: 14, // 7 pt
                            color: '555555',
                          }),
                        ],
                      }),
                    ],
                  }),

                  // Right column: company details
                  new TableCell({
                    width: {
                      size: 50,
                      type: WidthType.PERCENTAGE,
                    },
                    borders: tableBorders,
                    margins: { top: 0, bottom: 0, left: 100, right: 0 },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 0, after: 60, line: 240 },
                        children: [
                          new TextRun({
                            text: 'INFINITIVE CLOUD',
                            font: 'Arial',
                            size: 20, // 10 pt
                            bold: true,
                            color: '000000',
                          }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { before: 0, after: 30, line: 240 },
                        children: [
                          new TextRun({
                            text: 'Registered Office: ',
                            font: 'Arial',
                            size: 16, // 8 pt
                            bold: true,
                          }),
                          new TextRun({
                            text: 'Kankroli,Rajasthan,313324',
                            font: 'Arial',
                            size: 16,
                          }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { before: 0, after: 30, line: 240 },
                        children: [
                          new TextRun({
                            text: 'Office Address: ',
                            font: 'Arial',
                            size: 16,
                            bold: true,
                          }),
                          new TextRun({
                            text: 'Udaipur Rajasthan,313001',
                            font: 'Arial',
                            size: 16,
                          }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { before: 0, after: 30, line: 240 },
                        children: [
                          new TextRun({
                            text: 'Phone No: ',
                            font: 'Arial',
                            size: 16,
                            bold: true,
                          }),
                          new TextRun({
                            text: '+91 8690393087',
                            font: 'Arial',
                            size: 16,
                          }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { before: 0, after: 30, line: 240 },
                        children: [
                          new TextRun({
                            text: 'Email: ',
                            font: 'Arial',
                            size: 16,
                            bold: true,
                          }),
                          new TextRun({
                            text: 'cloudinfinitive@gmail.com',
                            font: 'Arial',
                            size: 16,
                            color: '0066CC',
                            underline: {},
                          }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { before: 0, after: 0, line: 240 },
                        children: [
                          new TextRun({
                            text: 'CIN No: ',
                            font: 'Arial',
                            size: 16,
                            bold: true,
                          }),
                          new TextRun({
                            text: 'U62020RJ2025PTC109151',
                            font: 'Arial',
                            size: 16,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          // ===================================================================
          // TITLE SECTION (3 blank lines before, 1 between)
          // ===================================================================
          new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [] }),
          new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [] }),
          new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [] }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0, line: 240 },
            children: [
              new TextRun({
                text: 'EXPERIENCE CUM RELIEVING LETTER',
                font: 'Arial',
                size: 28, // 14 pt
                bold: true,
                underline: {},
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [] }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 240, line: 240 }, // space after title
            children: [
              new TextRun({
                text: 'TO WHOM SO EVER IT MAY CONCERN',
                font: 'Arial',
                size: 28, // 14 pt
                bold: true,
                underline: {},
              }),
            ],
          }),

          // ===================================================================
          // BODY (Arial, 11 pt, black, left aligned, line spacing 1.15, 12 pt after)
          // ===================================================================

          // Para 1
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 240, line: 276 }, // 12pt after, 1.15 line
            children: [
              new TextRun({ text: 'This is to certify that ', font: 'Arial', size: 22 }),
              new TextRun({ text: `${titleSalutation} ${employeeName}`, font: 'Arial', size: 22, bold: true }),
              new TextRun({
                text: ` ${relationPrefix} Mr. ${fatherName} had been part of Infinitive Cloud team as a `,
                font: 'Arial',
                size: 22,
              }),
              new TextRun({ text: designation, font: 'Arial', size: 22, bold: true }),
              new TextRun({ text: ' from ', font: 'Arial', size: 22 }),
              new TextRun({ text: joining.day, font: 'Arial', size: 22, bold: true }),
              new TextRun({ text: joining.ordinal, font: 'Arial', size: 22, bold: true, superScript: true }),
              new TextRun({ text: ` ${joining.rest} to `, font: 'Arial', size: 22, bold: true }),
              new TextRun({ text: relieving.day, font: 'Arial', size: 22, bold: true }),
              new TextRun({ text: relieving.ordinal, font: 'Arial', size: 22, bold: true, superScript: true }),
              new TextRun({ text: ` ${relieving.rest}.`, font: 'Arial', size: 22, bold: true }),
            ],
          }),

          // Para 2
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 240, line: 276 },
            children: [
              new TextRun({
                text: `During ${pronounPossessive} tenure, ${pronounSubjectLower} was dedicated and committed to ${pronounPossessive} work. All the task assigned to ${pronounObject} were accomplished to the satisfaction. ${pronounSubject} was an excellent team member.`,
                font: 'Arial',
                size: 22,
              }),
            ],
          }),

          // Para 3
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 240, line: 276 },
            children: [
              new TextRun({
                text: `${pronounPossessiveCap} date of relieving from Infinitive Cloud  is `,
                font: 'Arial',
                size: 22,
              }),
              new TextRun({ text: relieving.day, font: 'Arial', size: 22, bold: true }),
              new TextRun({ text: relieving.ordinal, font: 'Arial', size: 22, bold: true, superScript: true }),
              new TextRun({ text: ` ${relieving.rest}.`, font: 'Arial', size: 22, bold: true }),
            ],
          }),

          // Para 4
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 240, line: 276 },
            children: [
              new TextRun({
                text: `We wish ${pronounObject} success for all ${pronounPossessive} future endeavor and bright career ahead.`,
                font: 'Arial',
                size: 22,
              }),
            ],
          }),

          // ===================================================================
          // SIGNATURE BLOCK (Left aligned, Arial)
          // ===================================================================
          new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [] }),
          new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [] }),

          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 0, line: 240 },
            children: [
              new TextRun({
                text: 'For Infinitive Cloud',
                font: 'Arial',
                size: 22, // 11 pt
                bold: true,
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [] }),
          new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [] }),
          new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [] }),

          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 30, line: 276 },
            children: [
              new TextRun({
                text: signatoryName,
                font: 'Arial',
                size: 22, // 11 pt
              }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 30, line: 276 },
            children: [
              new TextRun({
                text: signatoryTitle,
                font: 'Arial',
                size: 22,
              }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 0, line: 276 },
            children: [
              new TextRun({
                text: formattedIssueDate,
                font: 'Arial',
                size: 22,
              }),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function downloadExperienceLetterDocx(
  options: GenerateDocxOptions = {},
  filename = 'Experience_Cum_Relieving_Letter.docx'
): Promise<void> {
  const blob = await createExperienceLetterDocxBlob(options);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

