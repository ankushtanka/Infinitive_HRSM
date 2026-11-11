import { sendEmail, MailDispatchResult } from '@/lib/mailer';

export interface SendOtpEmailParams {
  to: string;
  otp: string;
  purpose?: string;
  userName?: string;
  organizationName?: string;
  role?: string;
}

export interface EmailDispatchResult {
  success: boolean;
  messageId?: string;
  provider?: 'Gmail_SMTP';
  error?: string;
}

/**
 * Subject & Title Mapping by Purpose
 */
function getEmailSubjectAndTitle(purpose: string, otp: string, role: string) {
  let subject = `EMS HRMS Verification Code: ${otp}`;
  let titleText = 'Account Verification';
  let bodyText = 'You requested a 6-digit verification code to access your EMS/HRMS account:';

  switch (purpose) {
    case 'ACCOUNT_INVITATION':
      subject = `EMS HRMS Account Invitation Code: ${otp}`;
      titleText = 'Account Setup Invitation';
      bodyText = `You have been officially invited to join EMS/HRMS as <strong>${role}</strong>. Please use the verification code below to complete your account setup:`;
      break;

    case 'EMAIL_VERIFICATION':
      subject = `EMS HRMS Email Verification Code: ${otp}`;
      titleText = 'Account Email Confirmation';
      bodyText = 'Your EMS/HRMS account has been created. Please use the 6-digit verification code below to confirm your email address:';
      break;

    case '2FA':
    case '2FA_OTP':
      subject = `EMS HRMS Two-Factor Authentication Code: ${otp}`;
      titleText = 'Two-Factor Authentication';
      bodyText = 'Use the security verification code below to complete 2FA authentication:';
      break;

    case 'PASSWORD_RESET':
      subject = `EMS HRMS Password Reset Code: ${otp}`;
      titleText = 'Password Reset Request';
      bodyText = 'You requested a password reset for your EMS/HRMS account. Use the code or reset token below to reset your password:';
      break;

    case 'LOGIN':
    case 'LOGIN_OTP':
    default:
      subject = `EMS HRMS Login Verification Code: ${otp}`;
      titleText = 'Login Authentication';
      bodyText = 'You requested a 6-digit verification code to sign in to your EMS/HRMS account:';
      break;
  }

  return { subject, titleText, bodyText };
}

/**
 * Builds professional responsive HTML email template for Gmail SMTP dispatch
 */
function buildOtpHtmlContent(
  to: string,
  otp: string,
  purpose: string,
  userName?: string,
  organizationName?: string,
  role = 'EMPLOYEE'
): { subject: string; htmlContent: string; textContent: string } {
  const { subject, titleText, bodyText } = getEmailSubjectAndTitle(purpose, otp, escapeHtml(role));
  const greetingName = escapeHtml(userName ? userName : 'Valued User');
  const orgDisplay = escapeHtml(organizationName || 'EMS / HRMS Enterprise');

  const isInvitation = purpose === 'ACCOUNT_INVITATION';
  const expirationNotice = isInvitation
    ? 'Your invitation code is valid for 24 hours.'
    : 'Your verification code is valid for 10 minutes.';

  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const encodedEmail = encodeURIComponent(to);
  const activationUrl = `${appBaseUrl}/complete-account?email=${encodedEmail}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#e2e8f0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 30px auto; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
        <!-- Header -->
        <tr>
          <td style="padding: 32px 32px 20px 32px; text-align: center; background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); border-bottom: 1px solid #334155;">
            <table align="center" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color: #4f46e5; border-radius: 12px; padding: 10px 18px; font-weight: 800; color: #ffffff; font-size: 18px; letter-spacing: 1px;">
                  ${orgDisplay}
                </td>
              </tr>
            </table>
            <h2 style="color: #ffffff; font-size: 20px; font-weight: 700; margin-top: 16px; margin-bottom: 4px;">EMS / HRMS Operations</h2>
            <p style="color: #94a3b8; font-size: 13px; margin: 0;">${titleText}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding: 32px;">
            <p style="color: #f1f5f9; font-size: 15px; margin-top: 0; margin-bottom: 16px;">Hello <strong>${greetingName}</strong>,</p>
            <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
              ${bodyText}
            </p>

            <!-- OTP Code Display -->
            <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
              <tr>
                <td align="center" style="background-color: #0f172a; border: 2px dashed #6366f1; border-radius: 12px; padding: 20px;">
                  <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #38bdf8; display: inline-block;">
                    ${otp}
                  </span>
                </td>
              </tr>
            </table>

            <p style="color: #94a3b8; font-size: 13px; margin-bottom: 8px;">
              ⏳ ${expirationNotice}
            </p>
            <p style="color: #94a3b8; font-size: 13px; margin-bottom: 24px;">
              🔒 For security, never share your verification code with anyone.
            </p>

            ${
              isInvitation
                ? `
            <!-- Activate & Complete Setup Button (Secure: Email parameter only, NO OTP in URL) -->
            <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
              <tr>
                <td align="center" style="background-color: #4f46e5; border-radius: 12px; padding: 14px 28px;">
                  <a href="${activationUrl}" target="_blank" style="color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; display: inline-block;">
                    Activate & Complete Setup &rarr;
                  </a>
                </td>
              </tr>
            </table>
            `
                : ''
            }

            <hr style="border: 0; border-top: 1px solid #334155; margin: 24px 0;" />

            <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
              If you did not request this verification code, please ignore this email or contact your HR/Admin team.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color: #0f172a; padding: 20px 32px; text-align: center; border-top: 1px solid #334155;">
            <p style="color: #64748b; font-size: 12px; margin: 0;">
              &copy; ${new Date().getFullYear()} ${orgDisplay}. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const textContent = isInvitation
    ? `Hello ${greetingName},\n\nYour account has been created on ${orgDisplay}.\nVerification Code: ${otp}\nThis code is valid for 24 hours.\n\nActivate & Complete Setup: ${activationUrl}\n\nNever share your verification code.`
    : `Hello ${greetingName},\n\n${subject}\nYour verification code is: ${otp}\n\nThis code will expire in 10 minutes.\nNever share this code with anyone.\n\nRegards,\n${orgDisplay} Team`;

  return { subject, htmlContent, textContent };
}

/**
 * Main Email Dispatch Function
 * Routes email sending exclusively through Nodemailer Gmail SMTP.
 */
export async function sendOtpEmail({
  to,
  otp,
  purpose = 'LOGIN',
  userName,
  organizationName,
  role = 'EMPLOYEE',
}: SendOtpEmailParams): Promise<EmailDispatchResult> {
  const { subject, htmlContent, textContent } = buildOtpHtmlContent(
    to,
    otp,
    purpose,
    userName,
    organizationName,
    role
  );

  const dispatchResult = await sendEmail({
    to,
    subject,
    html: htmlContent,
    text: textContent,
  });

  return {
    success: dispatchResult.success,
    messageId: dispatchResult.messageId,
    provider: 'Gmail_SMTP',
    error: dispatchResult.error,
  };
}

/**
 * Safely escapes HTML special characters to prevent HTML/XSS injection in email templates
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface SendOfferLetterEmailParams {
  to: string;
  candidateName: string;
  position: string;
  companyName: string;
  pdfBuffer?: Buffer;
  pdfFileName?: string;
  subject?: string;
  customMessage?: string;
}

/**
 * Sends official Offer Letter email to candidate via Gmail SMTP with PDF attachment
 */
export async function sendOfferLetterEmail({
  to,
  candidateName,
  position,
  companyName,
  pdfBuffer,
  pdfFileName = 'Offer_Letter.pdf',
  subject: customSubject,
  customMessage,
}: SendOfferLetterEmailParams): Promise<EmailDispatchResult> {
  const safePosition = escapeHtml(position || 'Position');
  const safeOrgName = escapeHtml(companyName || 'Infinitive Cloud');
  const safeCandidateName = escapeHtml(candidateName || 'Candidate');
  const finalPdfFileName = pdfFileName.toLowerCase().endsWith('.pdf') ? pdfFileName : `${pdfFileName}.pdf`;
  const safePdfFileName = escapeHtml(finalPdfFileName);

  const subject = customSubject || `Offer Letter — ${companyName} — ${position}`;

  const safeBodyContent = customMessage
    ? customMessage.split('\n').map((line) => escapeHtml(line)).join('<br>')
    : `We are pleased to share your official offer letter for the position of <strong>${safePosition}</strong> at <strong>${safeOrgName}</strong>.<br><br>Please review the attached document carefully for details regarding your joining date, terms, and required documents.`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(subject)}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#e2e8f0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 30px auto; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden;">
        <tr>
          <td style="padding: 24px; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); border-bottom: 1px solid #4338ca; text-align: center;">
            <h1 style="margin:0; font-size:20px; color:#ffffff; font-weight:800;">${safeOrgName}</h1>
            <p style="margin:4px 0 0 0; font-size:12px; color:#a5b4fc;">Official Employment / Internship Offer</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px 24px;">
            <p style="margin:0 0 16px 0; font-size:15px; color:#f8fafc;">Dear <strong>${safeCandidateName}</strong>,</p>
            <div style="font-size:14px; line-height:1.6; color:#cbd5e1;">${safeBodyContent}</div>
            <div style="margin-top: 24px; padding: 16px; background-color: #0f172a; border-radius: 12px; border: 1px solid #334155; text-align: center;">
              <p style="margin:0; font-size:12px; color:#94a3b8;">📄 Attached File: <strong style="color:#6366f1;">${safePdfFileName}</strong></p>
            </div>
            <p style="margin: 24px 0 0 0; font-size: 13px; color: #94a3b8;">
              Best regards,<br>
              <strong style="color: #f8fafc;">${safeOrgName} HR Team</strong>
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const textContent = `Dear ${candidateName},\n\nWe are pleased to share your offer letter for the position of ${position} at ${companyName}.\n\nPlease find the offer letter attached.\n\nRegards,\n${companyName} HR Team`;

  const hasValidBuffer = pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0;
  const attachments = hasValidBuffer
    ? [
        {
          filename: finalPdfFileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ]
    : undefined;

  const dispatchResult = await sendEmail({
    to,
    subject,
    html: htmlContent,
    text: textContent,
    attachments,
  });

  return {
    success: dispatchResult.success,
    messageId: dispatchResult.messageId,
    provider: 'Gmail_SMTP',
    error: dispatchResult.error,
  };
}

export interface SendCertificateEmailParams {
  to: string;
  internName: string;
  internshipRole: string;
  companyName: string;
  pdfBuffer?: Buffer;
  pdfFileName?: string;
  subject?: string;
  customMessage?: string;
}

/**
 * Sends official Internship Completion Certificate email to intern via Gmail SMTP with PDF attachment
 */
export async function sendCertificateEmail({
  to,
  internName,
  internshipRole,
  companyName,
  pdfBuffer,
  pdfFileName = 'Internship_Certificate.pdf',
  subject: customSubject,
  customMessage,
}: SendCertificateEmailParams): Promise<EmailDispatchResult> {
  const safeRole = escapeHtml(internshipRole || 'Internship');
  const safeOrgName = escapeHtml(companyName || 'Infinitive Cloud');
  const safeInternName = escapeHtml(internName || 'Intern');
  const finalPdfFileName = pdfFileName.toLowerCase().endsWith('.pdf') ? pdfFileName : `${pdfFileName}.pdf`;
  const safePdfFileName = escapeHtml(finalPdfFileName);

  const subject = customSubject || `Internship Completion Certificate — ${companyName} — ${internName}`;

  const safeBodyContent = customMessage
    ? customMessage.split('\n').map((line) => escapeHtml(line)).join('<br>')
    : `We are pleased to issue your official Internship Completion Certificate for completing your internship as <strong>${safeRole}</strong> at <strong>${safeOrgName}</strong>.<br><br>Please find your official certificate attached. We wish you continued success in your career ahead!`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(subject)}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#e2e8f0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 30px auto; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden;">
        <tr>
          <td style="padding: 24px; background: linear-gradient(135deg, #065f46 0%, #047857 100%); border-bottom: 1px solid #059669; text-align: center;">
            <h1 style="margin:0; font-size:20px; color:#ffffff; font-weight:800;">${safeOrgName}</h1>
            <p style="margin:4px 0 0 0; font-size:12px; color:#a7f3d0;">Official Internship Completion Certificate</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px 24px;">
            <p style="margin:0 0 16px 0; font-size:15px; color:#f8fafc;">Dear <strong>${safeInternName}</strong>,</p>
            <div style="font-size:14px; line-height:1.6; color:#cbd5e1;">${safeBodyContent}</div>
            <div style="margin-top: 24px; padding: 16px; background-color: #0f172a; border-radius: 12px; border: 1px solid #334155; text-align: center;">
              <p style="margin:0; font-size:12px; color:#94a3b8;">🎓 Attached Certificate: <strong style="color:#10b981;">${safePdfFileName}</strong></p>
            </div>
            <p style="margin: 24px 0 0 0; font-size: 13px; color: #94a3b8;">
              Best regards,<br>
              <strong style="color: #f8fafc;">${safeOrgName} HR Team</strong>
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const textContent = `Dear ${internName},\n\nCongratulations on completing your internship as ${internshipRole} at ${companyName}.\n\nPlease find your Internship Completion Certificate attached.\n\nRegards,\n${companyName} HR Team`;

  const hasValidBuffer = pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0;
  const attachments = hasValidBuffer
    ? [
        {
          filename: finalPdfFileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ]
    : undefined;

  const dispatchResult = await sendEmail({
    to,
    subject,
    html: htmlContent,
    text: textContent,
    attachments,
  });

  return {
    success: dispatchResult.success,
    messageId: dispatchResult.messageId,
    provider: 'Gmail_SMTP',
    error: dispatchResult.error,
  };
}

export interface SendPayslipEmailParams {
  to: string;
  employeeName: string;
  payPeriod: string;
  netSalary: number | string;
  payslipNumber?: string;
  companyName?: string;
  pdfBuffer?: Buffer;
  pdfFileName?: string;
  subject?: string;
  customMessage?: string;
}

/**
 * Sends official Salary Slip / Payslip email to employee via Gmail SMTP with PDF attachment
 */
export async function sendPayslipEmail({
  to,
  employeeName,
  payPeriod,
  netSalary,
  payslipNumber,
  companyName = 'INFINITIVE CLOUD PRIVATE LIMITED',
  pdfBuffer,
  pdfFileName,
  subject: customSubject,
  customMessage,
}: SendPayslipEmailParams): Promise<EmailDispatchResult> {
  const safeOrgName = escapeHtml(companyName);
  const safeEmployeeName = escapeHtml(employeeName || 'Employee');
  const safePayPeriod = escapeHtml(payPeriod || 'Current Period');
  const safePayslipNo = escapeHtml(payslipNumber || `PAY-${safePayPeriod}`);
  const formattedNet = typeof netSalary === 'number' ? `₹${netSalary.toLocaleString('en-IN')}` : String(netSalary);

  const fallbackFileName = `Salary_Slip_${safePayPeriod.replace(/[\s/]+/g, '_')}_${safeEmployeeName.replace(/\s+/g, '_')}.pdf`;
  const finalPdfFileName = pdfFileName
    ? (pdfFileName.toLowerCase().endsWith('.pdf') ? pdfFileName : `${pdfFileName}.pdf`)
    : fallbackFileName;
  const safePdfFileName = escapeHtml(finalPdfFileName);

  const subject = customSubject || `Salary Slip for ${payPeriod} — ${companyName}`;

  const safeBodyContent = customMessage
    ? customMessage.split('\n').map((line) => escapeHtml(line)).join('<br>')
    : `Please find attached your official salary payslip for the month of <strong>${safePayPeriod}</strong> from <strong>${safeOrgName}</strong>.<br><br>The net disbursed amount has been credited to your registered bank account. Kindly verify the earnings, statutory deductions, and tax withholdings.`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(subject)}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#e2e8f0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 30px auto; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
        <tr>
          <td style="padding: 24px; background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); border-bottom: 1px solid #334155; text-align: center;">
            <h1 style="margin:0; font-size:22px; color:#ffffff; font-weight:800; letter-spacing: 0.5px;">${safeOrgName}</h1>
            <p style="margin:6px 0 0 0; font-size:12px; color:#38bdf8; font-weight:600; text-transform: uppercase; letter-spacing: 1px;">Official Salary Slip • ${safePayPeriod}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px 24px;">
            <p style="margin:0 0 16px 0; font-size:15px; color:#f8fafc;">Dear <strong>${safeEmployeeName}</strong>,</p>
            <div style="font-size:14px; line-height:1.6; color:#cbd5e1;">${safeBodyContent}</div>

            <!-- Summary Card -->
            <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0; background-color: #0f172a; border-radius: 12px; border: 1px solid #334155; padding: 16px;">
              <tr>
                <td style="padding: 6px 12px; color: #94a3b8; font-size: 13px;">Payslip Number:</td>
                <td align="right" style="padding: 6px 12px; color: #f8fafc; font-size: 13px; font-weight: 700; font-family: monospace;">${safePayslipNo}</td>
              </tr>
              <tr>
                <td style="padding: 6px 12px; color: #94a3b8; font-size: 13px;">Payroll Period:</td>
                <td align="right" style="padding: 6px 12px; color: #f8fafc; font-size: 13px; font-weight: 600;">${safePayPeriod}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; color: #34d399; font-size: 14px; font-weight: 700; border-top: 1px solid #1e293b;">Net Disbursed Amount:</td>
                <td align="right" style="padding: 8px 12px; color: #34d399; font-size: 18px; font-weight: 800; border-top: 1px solid #1e293b;">${formattedNet}</td>
              </tr>
            </table>

            <div style="padding: 14px; background-color: #1e1b4b; border-radius: 10px; border: 1px solid #4338ca; text-align: center;">
              <p style="margin:0; font-size:13px; color:#c7d2fe;">
                📄 Attached Document: <strong style="color:#ffffff;">${safePdfFileName}</strong>
              </p>
            </div>

            <p style="margin: 20px 0 0 0; font-size: 12px; color: #64748b; line-height: 1.5;">
              🔒 <em>Confidentiality Notice: This document contains proprietary payroll and personal identity information. Do not forward or share this email.</em>
            </p>

            <p style="margin: 24px 0 0 0; font-size: 13px; color: #94a3b8;">
              Warm regards,<br>
              <strong style="color: #f8fafc;">${safeOrgName} Finance & HR Operations</strong>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background-color: #0f172a; padding: 16px 24px; text-align: center; border-top: 1px solid #334155;">
            <p style="color: #64748b; font-size: 11px; margin: 0;">
              &copy; ${new Date().getFullYear()} ${safeOrgName}. All rights reserved. System generated communication.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const textContent = `Dear ${employeeName},\n\nPlease find attached your salary slip for ${payPeriod} from ${companyName}.\nNet Pay: ${formattedNet}\nPayslip Number: ${safePayslipNo}\n\nRegards,\n${companyName} HR Team`;

  const hasValidBuffer = pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0;
  const attachments = hasValidBuffer
    ? [
        {
          filename: finalPdfFileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ]
    : undefined;

  const dispatchResult = await sendEmail({
    to,
    subject,
    html: htmlContent,
    text: textContent,
    attachments,
  });

  return {
    success: dispatchResult.success,
    messageId: dispatchResult.messageId,
    provider: 'Gmail_SMTP',
    error: dispatchResult.error,
  };
}

export interface SendExperienceLetterEmailParams {
  to: string;
  employeeName: string;
  designation?: string;
  companyName?: string;
  pdfBuffer?: Buffer;
  pdfFileName?: string;
  subject?: string;
  customMessage?: string;
}

/**
 * Sends official Experience Cum Relieving Letter to employee via Gmail SMTP with PDF attachment
 */
export async function sendExperienceLetterEmail({
  to,
  employeeName,
  designation,
  companyName = 'Infinitive Cloud',
  pdfBuffer,
  pdfFileName,
  subject: customSubject,
  customMessage,
}: SendExperienceLetterEmailParams): Promise<EmailDispatchResult> {
  const safeOrgName = escapeHtml(companyName);
  const safeEmployeeName = escapeHtml(employeeName || 'Employee');
  const safeDesignation = escapeHtml(designation || 'Team Member');

  const fallbackFileName = `Experience_Cum_Relieving_Letter_${safeEmployeeName.replace(/\s+/g, '_')}.pdf`;
  const finalPdfFileName = pdfFileName
    ? (pdfFileName.toLowerCase().endsWith('.pdf') ? pdfFileName : `${pdfFileName}.pdf`)
    : fallbackFileName;
  const safePdfFileName = escapeHtml(finalPdfFileName);

  const subject = customSubject || `Experience Cum Relieving Letter – ${employeeName}`;

  const defaultBody = `Please find attached your official Experience Cum Relieving Letter from <strong>${safeOrgName}</strong>.<br><br>We take this opportunity to thank you for your contributions and dedicated service during your tenure with us as <strong>${safeDesignation}</strong>. We wish you immense success in all your future endeavors and a bright career ahead.`;

  const safeBodyContent = customMessage
    ? customMessage.split('\n').map((line) => escapeHtml(line)).join('<br>')
    : defaultBody;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(subject)}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#e2e8f0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 30px auto; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
        <tr>
          <td style="padding: 24px; background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); border-bottom: 1px solid #334155; text-align: center;">
            <h1 style="margin:0; font-size:22px; color:#ffffff; font-weight:800; letter-spacing: 0.5px;">${safeOrgName}</h1>
            <p style="margin:6px 0 0 0; font-size:12px; color:#38bdf8; font-weight:600; text-transform: uppercase; letter-spacing: 1px;">Official Experience Cum Relieving Letter</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 32px 24px;">
            <p style="margin:0 0 16px 0; font-size:15px; color:#f8fafc;">Dear <strong>${safeEmployeeName}</strong>,</p>
            <div style="font-size:14px; line-height:1.6; color:#cbd5e1;">${safeBodyContent}</div>

            <div style="margin-top: 24px; padding: 14px; background-color: #1e1b4b; border-radius: 10px; border: 1px solid #4338ca; text-align: center;">
              <p style="margin:0; font-size:13px; color:#c7d2fe;">
                📄 Attached Document: <strong style="color:#ffffff;">${safePdfFileName}</strong>
              </p>
            </div>

            <p style="margin: 20px 0 0 0; font-size: 12px; color: #64748b; line-height: 1.5;">
              🔒 <em>Confidentiality Notice: This official letter contains private organizational and employment certification details. Please retain it securely for your records.</em>
            </p>

            <p style="margin: 24px 0 0 0; font-size: 13px; color: #94a3b8;">
              Warm regards,<br>
              <strong style="color: #f8fafc;">${safeOrgName} HR Team</strong>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background-color: #0f172a; padding: 16px 24px; text-align: center; border-top: 1px solid #334155;">
            <p style="color: #64748b; font-size: 11px; margin: 0;">
              &copy; ${new Date().getFullYear()} ${safeOrgName}. All rights reserved. System generated official communication.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const textContent = `Dear ${employeeName},\n\nPlease find attached your official Experience Cum Relieving Letter from ${companyName}.\n\nWe thank you for your contributions and dedicated service during your tenure with us as ${designation || 'team member'}. We wish you immense success in all your future endeavors and a bright career ahead.\n\nWarm regards,\n${companyName} HR Team`;

  const hasValidBuffer = pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0;
  const attachments = hasValidBuffer
    ? [
        {
          filename: finalPdfFileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ]
    : undefined;

  const dispatchResult = await sendEmail({
    to,
    subject,
    html: htmlContent,
    text: textContent,
    attachments,
  });

  return {
    success: dispatchResult.success,
    messageId: dispatchResult.messageId,
    provider: 'Gmail_SMTP',
    error: dispatchResult.error,
  };
}

