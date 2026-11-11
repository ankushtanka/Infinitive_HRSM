import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const body = await req.json();
    const {
      bulk,
      assignAllStandard,
      employeeIds,
      employeeId,
      salaryStructureId,
      basicSalary,
      hra,
      conveyance,
      medical,
      specialAllowance,
      otherAllowances,
      bonus,
      effectiveFrom,
      effectiveTo,
      bankName,
      bankAccountNo,
      accountNumber,
      panNumber,
      pfNo,
      pfNumber,
      pfUan,
      uan,
    } = body;

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;
    const now = new Date();

    // BULK SALARY ASSIGNMENT
    if (bulk === true || assignAllStandard === true || (Array.isArray(employeeIds) && employeeIds.length > 0)) {
      const fromDate = effectiveFrom ? new Date(effectiveFrom) : new Date(Date.UTC(now.getFullYear(), 0, 1));
      
      const orgFilter = (orgId === 'org-default' || !orgId)
        ? { $or: [{ organizationId: 'org-default' }, { organizationId: { $exists: false } }, { organizationId: null }] }
        : { organizationId: orgId };

      const empQuery: any = {
        ...orgFilter,
        status: { $nin: ['Terminated', 'Former Employee', 'Inactive'] },
      };

      if (Array.isArray(employeeIds) && employeeIds.length > 0) {
        empQuery.$or = [
          { employeeId: { $in: employeeIds } },
          { id: { $in: employeeIds } },
        ];
      }

      const activeEmployees = await db.collection('employees').find(empQuery).toArray();
      if (activeEmployees.length === 0) {
        return NextResponse.json({ success: false, message: 'No eligible active employees found to assign salaries.' }, { status: 400 });
      }

      const parsedBasic = Number(basicSalary) || 12500;
      const parsedHra = hra !== undefined ? Number(hra) : 3750;
      const parsedConveyance = conveyance !== undefined ? Number(conveyance) : 2353;
      const parsedMedical = medical !== undefined ? Number(medical) : 0;
      const parsedSpecial = specialAllowance !== undefined ? Number(specialAllowance) : 6397;
      const parsedBonus = bonus !== undefined ? Number(bonus) : 0;
      const structId = salaryStructureId || 'struct-std';

      const bulkOps: any[] = [];
      const assignedEmpIds: string[] = [];

      for (const emp of activeEmployees) {
        const canonicalEmpId = String(emp.employeeId || emp.id || emp._id.toString());
        const allIds = Array.from(new Set([
          canonicalEmpId,
          String(emp.employeeId || ''),
          String(emp.id || ''),
          emp._id?.toString(),
        ].filter(Boolean)));

        // Supercede previous active assignments
        await db.collection('salary_assignments').updateMany(
          { organizationId: orgId, employeeId: { $in: allIds }, status: 'Active' },
          { $set: { status: 'Superceded', effectiveTo: fromDate, updatedAt: now } }
        );

        bulkOps.push({
          organizationId: orgId,
          employeeId: canonicalEmpId,
          salaryStructureId: structId,
          basicSalary: parsedBasic,
          hra: parsedHra,
          conveyance: parsedConveyance,
          medical: parsedMedical,
          specialAllowance: parsedSpecial,
          otherAllowances: 0,
          bonus: parsedBonus,
          effectiveFrom: fromDate,
          effectiveTo: null,
          status: 'Active',
          assignedBy: auth.email || auth.userId,
          createdAt: now,
          updatedAt: now,
        });
        assignedEmpIds.push(canonicalEmpId);
      }

      if (bulkOps.length > 0) {
        await db.collection('salary_assignments').insertMany(bulkOps);
      }

      await logAuditEvent(req, 'BULK_ASSIGN_SALARY', { details: { count: bulkOps.length, employees: assignedEmpIds } });

      return NextResponse.json({
        success: true,
        message: `Standard salary structure (₹25,000 gross: Basic ₹12,500, HRA ₹3,750, Conveyance ₹2,353, Special ₹6,397) assigned to ${bulkOps.length} employee(s).`,
        count: bulkOps.length,
        assignedEmployees: assignedEmpIds,
      });
    }

    if (!employeeId) {
      return NextResponse.json({ success: false, message: 'Employee ID is required.' }, { status: 400 });
    }

    const fromDate = effectiveFrom ? new Date(effectiveFrom) : now;
    const toDate = effectiveTo ? new Date(effectiveTo) : undefined;

    // Look up employee doc to obtain canonical employeeId and all ID aliases
    const empDoc = await db.collection('employees').findOne({
      organizationId: orgId,
      $or: [
        { employeeId },
        { id: employeeId },
      ],
    });

    const canonicalEmpId = empDoc?.employeeId || employeeId;
    const allMatchingEmpIds = Array.from(new Set([
      employeeId,
      canonicalEmpId,
      empDoc?.id,
      empDoc?._id?.toString(),
    ].filter(Boolean)));

    // Supercede previous active assignments for this employee
    await db.collection('salary_assignments').updateMany(
      { organizationId: orgId, employeeId: { $in: allMatchingEmpIds }, status: 'Active' },
      { $set: { status: 'Superceded', effectiveTo: fromDate, updatedAt: now } }
    );

    const parsedBasic = Number(basicSalary);
    if (!Number.isFinite(parsedBasic) || parsedBasic <= 0) {
      return NextResponse.json({ success: false, message: 'Valid basic salary amount is required.' }, { status: 400 });
    }

    const assignmentDoc = {
      organizationId: orgId,
      employeeId: canonicalEmpId,
      salaryStructureId: salaryStructureId || 'struct-custom',
      basicSalary: parsedBasic,
      hra: Math.max(0, Number(hra) || 0),
      conveyance: Math.max(0, Number(conveyance) || 0),
      medical: Math.max(0, Number(medical) || 0),
      specialAllowance: Math.max(0, Number(specialAllowance) || 0),
      otherAllowances: Math.max(0, Number(otherAllowances) || 0),
      bonus: Math.max(0, Number(bonus) || 0),
      effectiveFrom: fromDate,
      effectiveTo: toDate,
      status: 'Active',
      assignedBy: auth.email || auth.userId,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('salary_assignments').insertOne(assignmentDoc);

    // Sync bank and statutory details into employees collection
    const finalBankAccount = bankAccountNo || accountNumber;
    const finalPf = pfNo || pfNumber;
    const finalUan = pfUan || uan;

    if (bankName || finalBankAccount || panNumber || finalPf || finalUan) {
      const empUpdate: any = { updatedAt: now };
      if (bankName !== undefined) empUpdate.bankName = bankName;
      if (finalBankAccount !== undefined) {
        empUpdate.accountNumber = finalBankAccount;
        empUpdate.bankAccountNo = finalBankAccount;
      }
      if (panNumber !== undefined) empUpdate.panNumber = panNumber;
      if (finalPf !== undefined) {
        empUpdate.pfNumber = finalPf;
        empUpdate.pfNo = finalPf;
      }
      if (finalUan !== undefined) {
        empUpdate.uan = finalUan;
        empUpdate.pfUan = finalUan;
      }

      await db.collection('employees').updateOne(
        { organizationId: orgId, $or: [{ employeeId: { $in: allMatchingEmpIds } }, { id: { $in: allMatchingEmpIds } }] },
        { $set: empUpdate }
      );
    }

    await logAuditEvent(req, 'ASSIGN_EMPLOYEE_SALARY', { employeeId, details: assignmentDoc });

    return NextResponse.json({
      success: true,
      message: 'Salary structure assigned successfully with effective dating.',
      data: assignmentDoc,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Failed to assign salary' }, { status: 500 });
  }
}
