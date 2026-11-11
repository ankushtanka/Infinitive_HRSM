import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { sendPayslipEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { id } = params;
    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    // Search query for payroll record with strict tenant isolation
    const orClauses: any[] = [
      { employeeId: id },
      { id: id },
    ];
    if (ObjectId.isValid(id)) {
      orClauses.push({ _id: new ObjectId(id) });
    }

    let baseFilter: any = { $or: orClauses };
    if (auth.role !== 'SUPER_ADMIN') {
      const activeOrgId = orgId || 'org-default';
      baseFilter = {
        $and: [
          { $or: orClauses },
          activeOrgId === 'org-default'
            ? { $or: [{ organizationId: 'org-default' }, { organizationId: { $exists: false } }, { organizationId: null }] }
            : { organizationId: activeOrgId }
        ]
      };
    }

    const record = await db.collection('payroll_records').findOne(baseFilter, {
      sort: { payYear: -1, payMonth: -1, updatedAt: -1, _id: -1 }
    });

    if (!record) {
      return NextResponse.json({ success: false, message: 'Payroll record not found.' }, { status: 404 });
    }

    // Role check: Employee can only email their own payslip
    if (auth.role === 'EMPLOYEE') {
      if (!auth.employeeId || record.employeeId !== auth.employeeId) {
        return NextResponse.json(
          { success: false, message: 'Forbidden. You can only email your own payslip.' },
          { status: 403 }
        );
      }
    }

    // Safeguard status check: Payroll approval rules cannot be bypassed by emailing
    const validStatuses = ['APPROVED', 'PAID', 'Approved', 'Paid', 'Processed', 'PROCESSED'];
    if (!validStatuses.includes(record.status)) {
      return NextResponse.json(
        { success: false, message: `Payslip cannot be emailed for payroll in '${record.status}' status. Payroll must be APPROVED or PAID.` },
        { status: 400 }
      );
    }

    // Fetch employee details from employees and users collections
    const empDoc = await db.collection('employees').findOne({
      $or: [
        { employeeId: record.employeeId },
        { id: record.employeeId },
      ]
    });
    const userDoc = !empDoc
      ? await db.collection('users').findOne({ employeeId: record.employeeId })
      : null;

    // Compile authorized registered official email addresses for this employee
    const registeredEmails: string[] = [
      empDoc?.officialEmail,
      empDoc?.email,
      userDoc?.email,
    ].filter(Boolean).map((e) => String(e).trim().toLowerCase());

    if (registeredEmails.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Employee has no registered official email address in records.' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { customSubject, customMessage, pdfBase64, recipientEmail: requestedRecipient } = body;

    // Security check: Recipient cannot be arbitrarily changed to unauthorized external addresses
    const defaultEmail = registeredEmails[0];
    const targetRecipient = requestedRecipient ? String(requestedRecipient).trim().toLowerCase() : defaultEmail;

    if (!registeredEmails.includes(targetRecipient)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized recipient address. For confidential salary protection, payslips can only be sent to the employee\'s verified official email address.',
        },
        { status: 403 }
      );
    }

    // Validate PDF attachment bytes
    let pdfBuffer: Buffer | undefined;
    if (pdfBase64 && typeof pdfBase64 === 'string') {
      const commaIdx = pdfBase64.indexOf(',');
      const cleanBase64 = (commaIdx !== -1 ? pdfBase64.slice(commaIdx + 1) : pdfBase64).trim();
      pdfBuffer = Buffer.from(cleanBase64, 'base64');
    }

    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Valid PDF payslip attachment is required to dispatch payslip email.',
        },
        { status: 400 }
      );
    }

    const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
    if (!pdfHeader.startsWith('%PDF')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid or corrupt PDF file signature. The payslip could not be attached.',
        },
        { status: 400 }
      );
    }

    // Fetch organization info for letterhead & branding
    const orgDoc: any = await db.collection('organization_settings').findOne({
      $or: [
        { organizationId: record.organizationId },
        { organizationId: orgId },
      ]
    });
    const companyName = (orgDoc?.organization?.name && orgDoc.organization.name !== 'INFINITIVE CLOUD' && orgDoc.organization.name !== 'Infinitive Cloud')
      ? orgDoc.organization.name
      : 'INFINITIVE CLOUD PRIVATE LIMITED';

    const employeeName = record.employeeName ||
      empDoc?.fullName ||
      `${empDoc?.firstName || userDoc?.name || ''} ${empDoc?.lastName || ''}`.trim() ||
      'Employee';

    const payPeriod = record.payrollPeriod || record.payPeriod || `${record.payYear}-${record.payMonth}`;
    const payslipNumber = `PAY-${record.payYear || new Date().getFullYear()}-${String(record.payMonth || 1).padStart(2, '0')}-${record.employeeId}`;

    const cleanEmpName = employeeName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanPeriod = payPeriod.replace(/[^a-zA-Z0-9_-]/g, '_');
    const pdfFileName = `Salary_Slip_${cleanPeriod}_${cleanEmpName}.pdf`;

    const emailResult = await sendPayslipEmail({
      to: targetRecipient,
      employeeName,
      payPeriod,
      netSalary: record.netSalary || 0,
      payslipNumber,
      companyName,
      pdfBuffer,
      pdfFileName,
      subject: customSubject,
      customMessage,
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { success: false, message: emailResult.error || 'Failed to dispatch payslip email via SMTP.' },
        { status: 502 }
      );
    }

    const maskedRecipient = targetRecipient.replace(/(.{2})(.*)(?=@)/, '$1***');
    await logAuditEvent(req, 'SEND_PAYSLIP_EMAIL', {
      employeeId: record.employeeId,
      details: {
        recipient: maskedRecipient,
        payPeriod,
        payslipNumber,
        pdfFileName,
        pdfSizeBytes: pdfBuffer.length,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Payslip sent successfully to verified address (${targetRecipient})`,
      messageId: emailResult.messageId,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/payroll/[id]/payslip/email:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error while sending payslip email.' },
      { status: 500 }
    );
  }
}
