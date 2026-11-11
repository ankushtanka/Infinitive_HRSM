import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { id } = params;
    const body = await req.json();
    const { basic, hra, conveyance, medical, specialAllowance, otherAllowances, bonus, pf, pt, tds, esi, status } = body;

    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    const orClauses: any[] = [
      { employeeId: id },
      { id: id },
    ];
    if (ObjectId.isValid(id)) {
      orClauses.push({ _id: new ObjectId(id) });
    }

    let query: any = { $or: orClauses };
    if (auth.role !== 'SUPER_ADMIN') {
      const activeOrgId = orgId || 'org-default';
      query = {
        $and: [
          { $or: orClauses },
          activeOrgId === 'org-default'
            ? { $or: [{ organizationId: 'org-default' }, { organizationId: { $exists: false } }, { organizationId: null }] }
            : { organizationId: activeOrgId }
        ]
      };
    }

    const existing = await db.collection('payroll_records').findOne(query);
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Payroll record not found.' }, { status: 404 });
    }

    const newBasic = basic !== undefined ? Number(basic) : (existing.basic || existing.basicSalary || 0);
    const newHra = hra !== undefined ? Number(hra) : (existing.allowances?.hra || existing.hra || 0);
    const newConveyance = conveyance !== undefined ? Number(conveyance) : (existing.allowances?.conveyance || existing.conveyance || 0);
    const newMedical = medical !== undefined ? Number(medical) : (existing.allowances?.medical || existing.medical || 0);
    const newSpecial = specialAllowance !== undefined ? Number(specialAllowance) : (existing.allowances?.specialAllowance || existing.specialAllowance || 0);
    const newOtherAllowances = otherAllowances !== undefined ? Number(otherAllowances) : (existing.allowances?.otherAllowances || existing.otherAllowances || 0);
    const newBonus = bonus !== undefined ? Number(bonus) : (existing.bonus || 0);
    const newOvertimePay = body.overtimePay !== undefined ? Number(body.overtimePay) : (existing.overtimePay || 0);
    const newOtherEarnings = body.otherEarnings !== undefined ? Number(body.otherEarnings) : (existing.otherEarnings || 0);

    const grossSalary = newBasic + newHra + newConveyance + newMedical + newSpecial + newOtherAllowances + newOvertimePay + newBonus + newOtherEarnings;

    const newPf = pf !== undefined ? Number(pf) : (existing.pf || existing.pfDeduction || 0);
    const newPt = pt !== undefined ? Number(pt) : (existing.pt || existing.ptDeduction || 0);
    const newTds = body.taxDeduction !== undefined ? Number(body.taxDeduction) : (tds !== undefined ? Number(tds) : (existing.tds || existing.taxDeduction || 0));
    const newEsi = esi !== undefined ? Number(esi) : (existing.esi || existing.esiDeduction || 0);
    const newLopDeduction = body.lopDeduction !== undefined ? Number(body.lopDeduction) : (existing.lopDeduction !== undefined ? Number(existing.lopDeduction) : (existing.lopDays > 0 ? Math.round((newBasic / (existing.workingDays || 26)) * existing.lopDays) : 0));
    const newOtherDeductions = body.otherDeductions !== undefined ? Number(body.otherDeductions) : (existing.otherDeductions || 0);

    const totalDeductions = newLopDeduction + newPf + newPt + newTds + newEsi + newOtherDeductions + (existing.loanDeduction || 0);
    const netSalary = Math.max(0, grossSalary - totalDeductions);

    const updatedDoc = {
      basic: newBasic,
      basicSalary: newBasic,
      hra: newHra,
      conveyance: newConveyance,
      medical: newMedical,
      specialAllowance: newSpecial,
      otherAllowances: newOtherAllowances,
      allowances: {
        hra: newHra,
        conveyance: newConveyance,
        medical: newMedical,
        specialAllowance: newSpecial,
        otherAllowances: newOtherAllowances,
      },
      bonus: newBonus,
      overtimePay: newOvertimePay,
      otherEarnings: newOtherEarnings,
      grossSalary,
      pf: newPf,
      pfDeduction: newPf,
      pt: newPt,
      ptDeduction: newPt,
      tds: newTds,
      taxDeduction: newTds,
      esi: newEsi,
      esiDeduction: newEsi,
      lopDeduction: newLopDeduction,
      otherDeductions: newOtherDeductions,
      totalDeductions,
      netSalary,
      status: status || existing.status || 'PROCESSED',
      updatedAt: new Date(),
    };

    await db.collection('payroll_records').updateOne({ _id: existing._id }, { $set: updatedDoc });

    await logAuditEvent(req, 'EDIT_PAYROLL_RECORD', { employeeId: existing.employeeId, oldValue: existing, newValue: updatedDoc });

    const freshRecord = await db.collection('payroll_records').findOne(query);

    return NextResponse.json({
      success: true,
      message: 'Payroll record updated successfully.',
      data: freshRecord,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Failed to update payroll record' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(req);
    const perm = checkPermissions(auth, ['SUPER_ADMIN', 'ADMIN', 'HR']);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { id } = params;
    const { db } = await connectToDatabase();
    const orgId = auth.organizationId;

    const orClauses: any[] = [
      { employeeId: id },
      { id: id },
    ];
    if (ObjectId.isValid(id)) {
      orClauses.push({ _id: new ObjectId(id) });
    }

    let query: any = { $or: orClauses };
    if (auth.role !== 'SUPER_ADMIN') {
      const activeOrgId = orgId || 'org-default';
      query = {
        $and: [
          { $or: orClauses },
          activeOrgId === 'org-default'
            ? { $or: [{ organizationId: 'org-default' }, { organizationId: { $exists: false } }, { organizationId: null }] }
            : { organizationId: activeOrgId }
        ]
      };
    }

    const existing = await db.collection('payroll_records').findOne(query);
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Payroll record not found.' }, { status: 404 });
    }

    await db.collection('payroll_records').deleteOne({ _id: existing._id });

    await logAuditEvent(req, 'DELETE_PAYROLL_RECORD', { employeeId: existing.employeeId, details: existing });

    return NextResponse.json({
      success: true,
      message: 'Payroll record deleted successfully.',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Failed to delete payroll record' }, { status: 500 });
  }
}
