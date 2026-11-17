import express from 'express';
import { db } from '../db/index.ts';
import {
  users,
  visits,
  payments,
  doctorSalaries,
  doctorSalaryStructures,
  doctorSalaryStructureHistory,
  salaryPayments,
  salaryAdjustments,
  payrollAuditLogs,
  auditLogs,
} from '../db/schema.ts';
import { eq, desc } from 'drizzle-orm';
import { authenticateToken, AuthenticatedRequest } from './auth.ts';
import { requireFeatureAccess } from './featureControl.ts';

export const payrollRouter = express.Router();

function requirePayrollAdmin(req: any, res: any, next: any) {
  if (!req.user || (req.user.role !== 'main_doctor' && req.user.role !== 'developer')) {
    return res.status(403).json({
      error: 'Forbidden: Salary & Payroll Management is restricted to Developer and Super Admin (Main Doctor) accounts.',
    });
  }
  next();
}

let payrollSeeded = false;

export async function ensurePayrollSeeded() {
  if (payrollSeeded) return;
  try {
    const allUsers = await db.select().from(users);
    const doctors = allUsers.filter((u) => u.role === 'doctor' || u.role === 'main_doctor');
    const existingStructures = await db.select().from(doctorSalaryStructures);
    const structByDoc = new Map(existingStructures.map((s) => [s.doctorId, s]));

    const allSalaries = await db.select().from(doctorSalaries);
    const existingPayments = await db.select().from(salaryPayments);
    const paymentsBySalaryId = new Map<number, typeof existingPayments>();
    for (const p of existingPayments) {
      const list = paymentsBySalaryId.get(p.salaryId) || [];
      list.push(p);
      paymentsBySalaryId.set(p.salaryId, list);
    }

    // Backfill payrollMonth, payrollYear, grossSalary, and initial salary_payments non-destructively
    for (const sal of allSalaries) {
      const monthStr =
        sal.payrollMonth ||
        (sal.paymentDate ? sal.paymentDate.slice(0, 7) : new Date().toISOString().slice(0, 7));
      const yearNum = sal.payrollYear || Number(monthStr.slice(0, 4)) || new Date().getFullYear();
      const totalPayableNum = Number(sal.totalPayable) || 0;
      const bonusNum = Number(sal.bonusAmount) || 0;
      const deductionNum = Number(sal.deductionAmount) || 0;
      const grossNum = Number(sal.grossSalary) || Math.max(0, totalPayableNum - bonusNum + deductionNum);

      if (!sal.payrollMonth || !sal.payrollYear || Number(sal.grossSalary) === 0) {
        await db
          .update(doctorSalaries)
          .set({
            payrollMonth: monthStr,
            payrollYear: yearNum,
            grossSalary: grossNum.toFixed(2),
          })
          .where(eq(doctorSalaries.id, sal.id));
      }

      const paidNum = Number(sal.paidAmount) || 0;
      const existingSalPayments = paymentsBySalaryId.get(sal.id) || [];
      if (paidNum > 0 && existingSalPayments.length === 0) {
        const payCode = `SPAY-INIT-${sal.id}`;
        await db
          .insert(salaryPayments)
          .values({
            paymentCode: payCode,
            salaryId: sal.id,
            doctorId: sal.doctorId,
            amount: paidNum.toFixed(2),
            paymentDate: sal.paymentDate || new Date().toISOString().split('T')[0],
            paymentMethod: sal.paymentMethod || 'Cash',
            transactionRef: sal.transactionRef || null,
            notes: 'Initial salary payment record synced from existing payroll entry.',
            recordedBy: sal.recordedBy || null,
          })
          .onConflictDoNothing();
      }
    }

    // Seed initial salary structure for doctors if not present yet
    for (const doc of doctors) {
      if (!structByDoc.has(doc.id)) {
        const latestSal = allSalaries
          .filter((s) => s.doctorId === doc.id)
          .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''))[0];

        const salaryType = latestSal?.salaryType || 'Monthly';
        const baseRate = latestSal
          ? String(Number(latestSal.baseAmount) || 0)
          : doc.role === 'main_doctor'
          ? '50000.00'
          : '25000.00';
        const commRate = latestSal ? String(Number(latestSal.commissionRate) || 0) : '0.00';
        const allowances = latestSal ? String(Number(latestSal.bonusAmount) || 0) : '0.00';
        const deductions = latestSal ? String(Number(latestSal.deductionAmount) || 0) : '0.00';
        const structCode = `SSTRUCT-${doc.id}-${Date.now().toString().slice(-4)}`;

        const [inserted] = await db
          .insert(doctorSalaryStructures)
          .values({
            structureCode: structCode,
            doctorId: doc.id,
            salaryType,
            baseRate,
            commissionRate: commRate,
            commissionBasis: 'treatment_revenue',
            allowances,
            deductions,
            effectiveDate: '2026-01-01',
            notes: 'Default compensation structure initialized.',
            isActive: Boolean(doc.isActive),
          })
          .onConflictDoNothing()
          .returning();

        if (inserted) {
          await db.insert(doctorSalaryStructureHistory).values({
            structureId: inserted.id,
            doctorId: doc.id,
            salaryType,
            baseRate,
            commissionRate: commRate,
            commissionBasis: 'treatment_revenue',
            allowances,
            deductions,
            effectiveDate: '2026-01-01',
            changeReason: 'Initial salary structure baseline.',
          });
        }
      }
    }

    payrollSeeded = true;
  } catch (err) {
    console.error('Error seeding payroll structures:', err);
  }
}

/**
 * Compute live revenue, collected payments, eligible charges, and working days for a doctor in a month (YYYY-MM)
 */
export async function computeDoctorMonthlyMetrics(doctorId: number, payrollMonth?: string) {
  const allVisits = await db.select().from(visits).where(eq(visits.doctorId, doctorId));
  const filteredVisits = payrollMonth
    ? allVisits.filter((v) => (v.visitDate || '').startsWith(payrollMonth))
    : allVisits;

  const visitIds = new Set(filteredVisits.map((v) => v.id));
  const distinctDays = new Set(filteredVisits.map((v) => v.visitDate)).size;

  let treatmentRevenue = 0;
  let diagnosticCharges = 0;
  let eligibleCharges = 0;
  let collectedPayments = 0;

  for (const v of filteredVisits) {
    treatmentRevenue += Number(v.totalTreatmentCost) || 0;
    diagnosticCharges += Number(v.totalTestCost) || 0;
    eligibleCharges += Number(v.totalCost) || 0;
  }

  if (visitIds.size > 0) {
    const allPayments = await db.select().from(payments);
    for (const p of allPayments) {
      if (p.visitId && visitIds.has(p.visitId)) {
        collectedPayments += Math.max(0, Number(p.amount) || 0);
      }
    }
  }

  return {
    visitCount: filteredVisits.length,
    workingDaysCount: distinctDays,
    treatmentRevenue: Number(treatmentRevenue.toFixed(2)),
    diagnosticCharges: Number(diagnosticCharges.toFixed(2)),
    eligibleCharges: Number(eligibleCharges.toFixed(2)),
    collectedPayments: Number(collectedPayments.toFixed(2)),
  };
}

const payrollAuth = [authenticateToken, requirePayrollAdmin, requireFeatureAccess('salary_payroll')];

// GET /api/payroll/overview
payrollRouter.get('/payroll/overview', ...payrollAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await ensurePayrollSeeded();
    const { month } = req.query; // optional YYYY-MM

    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const doctors = allUsers.filter((u) => u.role === 'doctor' || u.role === 'main_doctor');

    const structures = await db.select().from(doctorSalaryStructures);
    const structMap = new Map(structures.map((s) => [s.doctorId, s]));

    const salaries = await db
      .select()
      .from(doctorSalaries)
      .orderBy(desc(doctorSalaries.paymentDate), desc(doctorSalaries.createdAt));

    const allSalPayments = await db
      .select()
      .from(salaryPayments)
      .orderBy(desc(salaryPayments.paymentDate), desc(salaryPayments.createdAt));

    const allAdjustments = await db
      .select()
      .from(salaryAdjustments)
      .orderBy(desc(salaryAdjustments.createdAt));

    const paymentsBySal = new Map<number, any[]>();
    for (const p of allSalPayments) {
      const list = paymentsBySal.get(p.salaryId) || [];
      list.push({
        ...p,
        amount: Number(p.amount) || 0,
        recordedByName: p.recordedBy ? userMap.get(p.recordedBy)?.fullName || 'Admin' : 'Admin',
      });
      paymentsBySal.set(p.salaryId, list);
    }

    const adjustmentsBySal = new Map<number, any[]>();
    for (const adj of allAdjustments) {
      const list = adjustmentsBySal.get(adj.salaryId) || [];
      list.push({
        ...adj,
        amount: Number(adj.amount) || 0,
        previousPayable: Number(adj.previousPayable) || 0,
        newPayable: Number(adj.newPayable) || 0,
        authorizedByName: adj.authorizedBy ? userMap.get(adj.authorizedBy)?.fullName || 'Admin' : 'Admin',
      });
      adjustmentsBySal.set(adj.salaryId, list);
    }

    const enrichedSalaries = salaries.map((s) => {
      const doc = userMap.get(s.doctorId);
      const rec = s.recordedBy ? userMap.get(s.recordedBy) : null;
      let snapshot = null;
      if (s.structureSnapshotJson) {
        try {
          snapshot = JSON.parse(s.structureSnapshotJson);
        } catch {
          snapshot = null;
        }
      }
      return {
        ...s,
        doctorName: doc?.fullName || `Doctor #${s.doctorId}`,
        doctorPhone: doc?.phone || '',
        doctorSpecialization: doc?.specialization || '',
        doctorRole: doc?.role || 'doctor',
        doctorStatus: doc?.isActive ? 'active' : 'inactive',
        recordedByName: rec?.fullName || 'Main Doctor',
        baseAmount: Number(s.baseAmount) || 0,
        daysWorked: Number(s.daysWorked) || 0,
        commissionSourceAmount: Number(s.commissionSourceAmount) || 0,
        commissionRate: Number(s.commissionRate) || 0,
        commissionEarned: Number(s.commissionEarned) || 0,
        bonusAmount: Number(s.bonusAmount) || 0,
        deductionAmount: Number(s.deductionAmount) || 0,
        grossSalary: Number(s.grossSalary) || 0,
        totalPayable: Number(s.totalPayable) || 0,
        paidAmount: Number(s.paidAmount) || 0,
        dueAmount: Number(s.dueAmount) || 0,
        payrollMonth: s.payrollMonth || (s.paymentDate ? s.paymentDate.slice(0, 7) : ''),
        payrollYear: s.payrollYear || Number((s.paymentDate || '').slice(0, 4)) || new Date().getFullYear(),
        payrollStatus: s.payrollStatus || 'Draft',
        structureSnapshot: snapshot,
        payments: paymentsBySal.get(s.id) || [],
        adjustments: adjustmentsBySal.get(s.id) || [],
      };
    });

    const enrichedStructures = [];
    for (const doc of doctors) {
      const st = structMap.get(doc.id);
      const metrics = await computeDoctorMonthlyMetrics(doc.id, month ? String(month) : undefined);
      enrichedStructures.push({
        doctorId: doc.id,
        doctorName: doc.fullName,
        doctorPhone: doc.phone,
        doctorRole: doc.role,
        doctorSpecialization: doc.specialization || 'Dental Surgeon',
        doctorStatus: doc.isActive ? 'active' : 'inactive',
        structureId: st?.id || null,
        structureCode: st?.structureCode || `SSTRUCT-${doc.id}`,
        salaryType: st?.salaryType || 'Monthly',
        baseRate: Number(st?.baseRate) || 0,
        commissionRate: Number(st?.commissionRate) || 0,
        commissionBasis: st?.commissionBasis || 'treatment_revenue',
        allowances: Number(st?.allowances) || 0,
        deductions: Number(st?.deductions) || 0,
        effectiveDate: st?.effectiveDate || '2026-01-01',
        reviewDate: st?.reviewDate || null,
        notes: st?.notes || '',
        isActive: st ? Boolean(st.isActive) : Boolean(doc.isActive),
        updatedAt: st?.updatedAt || null,
        liveMetrics: metrics,
      });
    }

    const auditList = await db
      .select()
      .from(payrollAuditLogs)
      .orderBy(desc(payrollAuditLogs.createdAt))
      .limit(100);

    res.json({
      structures: enrichedStructures,
      salaries: enrichedSalaries,
      allPayments: allSalPayments.map((p) => ({
        ...p,
        amount: Number(p.amount) || 0,
        doctorName: userMap.get(p.doctorId)?.fullName || `Doctor #${p.doctorId}`,
        recordedByName: p.recordedBy ? userMap.get(p.recordedBy)?.fullName || 'Admin' : 'Admin',
      })),
      auditLogs: auditList,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payroll/structures/:doctorId/history
payrollRouter.get('/payroll/structures/:doctorId/history', ...payrollAuth, async (req: AuthenticatedRequest, res) => {
  const doctorId = Number(req.params.doctorId);
  try {
    const history = await db
      .select()
      .from(doctorSalaryStructureHistory)
      .where(eq(doctorSalaryStructureHistory.doctorId, doctorId))
      .orderBy(desc(doctorSalaryStructureHistory.createdAt));

    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    res.json(
      history.map((h) => ({
        ...h,
        baseRate: Number(h.baseRate) || 0,
        commissionRate: Number(h.commissionRate) || 0,
        allowances: Number(h.allowances) || 0,
        deductions: Number(h.deductions) || 0,
        changedByName: h.changedBy ? userMap.get(h.changedBy)?.fullName || 'Admin' : 'System',
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payroll/structures (Create or update a doctor's salary structure)
payrollRouter.post('/payroll/structures', ...payrollAuth, async (req: AuthenticatedRequest, res) => {
  const {
    doctorId,
    salaryType,
    baseRate,
    commissionRate,
    commissionBasis,
    allowances,
    deductions,
    effectiveDate,
    reviewDate,
    notes,
    isActive,
    changeReason,
  } = req.body;

  if (!doctorId) {
    return res.status(400).json({ error: 'Doctor is required.' });
  }

  const validTypes = ['Monthly', 'Daily', 'Commission'];
  const normalizedType = validTypes.includes(salaryType) ? salaryType : 'Monthly';
  const validBases = ['treatment_revenue', 'collected_payments', 'eligible_charges'];
  const normalizedBasis = validBases.includes(commissionBasis) ? commissionBasis : 'treatment_revenue';

  const baseNum = Math.max(0, Number(baseRate) || 0);
  const commNum = Math.min(100, Math.max(0, Number(commissionRate) || 0));
  const allowNum = Math.max(0, Number(allowances) || 0);
  const deductNum = Math.max(0, Number(deductions) || 0);
  const effDate = effectiveDate || new Date().toISOString().split('T')[0];

  try {
    await ensurePayrollSeeded();
    const existing = await db
      .select()
      .from(doctorSalaryStructures)
      .where(eq(doctorSalaryStructures.doctorId, Number(doctorId)));

    const docUser = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(doctorId)));
    const doctorName = docUser[0]?.fullName || `Doctor #${doctorId}`;

    let structureId: number;

    if (existing.length > 0) {
      structureId = existing[0].id;
      await db
        .update(doctorSalaryStructures)
        .set({
          salaryType: normalizedType,
          baseRate: baseNum.toFixed(2),
          commissionRate: commNum.toFixed(2),
          commissionBasis: normalizedBasis,
          allowances: allowNum.toFixed(2),
          deductions: deductNum.toFixed(2),
          effectiveDate: effDate,
          reviewDate: reviewDate || null,
          notes: notes !== undefined ? String(notes).trim() : existing[0].notes,
          isActive: isActive !== undefined ? Boolean(isActive) : existing[0].isActive,
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(doctorSalaryStructures.id, structureId));
    } else {
      const structCode = `SSTRUCT-${doctorId}-${Date.now().toString().slice(-5)}`;
      const [inserted] = await db
        .insert(doctorSalaryStructures)
        .values({
          structureCode: structCode,
          doctorId: Number(doctorId),
          salaryType: normalizedType,
          baseRate: baseNum.toFixed(2),
          commissionRate: commNum.toFixed(2),
          commissionBasis: normalizedBasis,
          allowances: allowNum.toFixed(2),
          deductions: deductNum.toFixed(2),
          effectiveDate: effDate,
          reviewDate: reviewDate || null,
          notes: notes ? String(notes).trim() : null,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
          createdBy: req.user!.id,
          updatedBy: req.user!.id,
        })
        .returning();
      structureId = inserted.id;
    }

    await db.insert(doctorSalaryStructureHistory).values({
      structureId,
      doctorId: Number(doctorId),
      salaryType: normalizedType,
      baseRate: baseNum.toFixed(2),
      commissionRate: commNum.toFixed(2),
      commissionBasis: normalizedBasis,
      allowances: allowNum.toFixed(2),
      deductions: deductNum.toFixed(2),
      effectiveDate: effDate,
      reviewDate: reviewDate || null,
      changeReason: changeReason ? String(changeReason).trim() : 'Salary structure updated by administrator.',
      changedBy: req.user!.id,
    });

    await db.insert(payrollAuditLogs).values({
      doctorId: Number(doctorId),
      userId: req.user!.id,
      userRole: req.user!.role,
      action: 'UPDATE_SALARY_STRUCTURE',
      targetLabel: doctorName,
      details: `Configured ${normalizedType} structure for ${doctorName}: Base Tk ${baseNum.toFixed(2)}, Comm ${commNum}% (${normalizedBasis}), Allowances Tk ${allowNum.toFixed(2)}, Deductions Tk ${deductNum.toFixed(2)} (Effective: ${effDate}).`,
    });

    await db.insert(auditLogs).values({
      userId: req.user!.id,
      userRole: req.user!.role,
      action: 'UPDATE_DOCTOR_SALARY_STRUCTURE',
      affectedRecord: `Salary Structure (${doctorName})`,
      details: `Updated salary structure (${normalizedType}) for ${doctorName}`,
    });

    res.json({ success: true, structureId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payroll/generate-monthly (Auto-generate monthly payroll sheet entries from active structures)
payrollRouter.post('/payroll/generate-monthly', ...payrollAuth, async (req: AuthenticatedRequest, res) => {
  const { payrollMonth, paymentDate } = req.body; // payrollMonth e.g. "2026-11"
  if (!payrollMonth || !/^\d{4}-\d{2}$/.test(String(payrollMonth))) {
    return res.status(400).json({ error: 'Valid Payroll Month (YYYY-MM) is required.' });
  }

  try {
    await ensurePayrollSeeded();
    const monthStr = String(payrollMonth);
    const yearNum = Number(monthStr.slice(0, 4));
    const dateStr = paymentDate || `${monthStr}-${new Date().getDate().toString().padStart(2, '0')}`;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthIndex = Math.max(0, Math.min(11, Number(monthStr.slice(5, 7)) - 1));
    const periodLabel = `${monthNames[monthIndex]} ${yearNum}`;

    const allUsers = await db.select().from(users);
    const activeDoctors = allUsers.filter(
      (u) => (u.role === 'doctor' || u.role === 'main_doctor') && u.isActive
    );

    const structures = await db.select().from(doctorSalaryStructures);
    const structMap = new Map(structures.map((s) => [s.doctorId, s]));

    const existingSalaries = await db.select().from(doctorSalaries);
    const existingForMonth = new Set(
      existingSalaries
        .filter((s) => (s.payrollMonth || (s.paymentDate || '').slice(0, 7)) === monthStr)
        .map((s) => s.doctorId)
    );

    const createdRecords: any[] = [];
    const skippedDoctors: string[] = [];

    for (const doc of activeDoctors) {
      if (existingForMonth.has(doc.id)) {
        skippedDoctors.push(doc.fullName);
        continue;
      }

      const st = structMap.get(doc.id);
      if (!st || !st.isActive) {
        continue;
      }

      const metrics = await computeDoctorMonthlyMetrics(doc.id, monthStr);
      const salaryType = st.salaryType || 'Monthly';
      const baseRate = Number(st.baseRate) || 0;
      const commRate = Number(st.commissionRate) || 0;
      const commBasis = st.commissionBasis || 'treatment_revenue';
      const allowances = Number(st.allowances) || 0;
      const deductions = Number(st.deductions) || 0;

      let baseAmount = baseRate;
      let daysWorked = metrics.workingDaysCount;
      let eligibleRev = metrics.treatmentRevenue;
      let commEarned = 0;
      let grossSalary = 0;

      if (salaryType === 'Monthly') {
        grossSalary = baseAmount;
      } else if (salaryType === 'Daily') {
        daysWorked = metrics.workingDaysCount;
        grossSalary = baseAmount * daysWorked;
      } else if (salaryType === 'Commission') {
        if (commBasis === 'collected_payments') {
          eligibleRev = metrics.collectedPayments;
        } else if (commBasis === 'eligible_charges') {
          eligibleRev = metrics.eligibleCharges;
        } else {
          eligibleRev = metrics.treatmentRevenue;
        }
        commEarned = Number(((eligibleRev * commRate) / 100).toFixed(2));
        grossSalary = baseAmount + commEarned;
      }

      const totalPayable = Math.max(0, Number((grossSalary + allowances - deductions).toFixed(2)));
      const salaryCode = `SAL-${monthStr.replace('-', '')}-${doc.id}-${Math.floor(100 + Math.random() * 899)}`;

      const [inserted] = await db
        .insert(doctorSalaries)
        .values({
          salaryCode,
          doctorId: doc.id,
          salaryType,
          periodLabel,
          payrollMonth: monthStr,
          payrollYear: yearNum,
          periodStart: `${monthStr}-01`,
          periodEnd: `${monthStr}-28`,
          baseAmount: baseAmount.toFixed(2),
          daysWorked,
          commissionBasis: commBasis === 'collected_payments' ? 'collected' : commBasis === 'eligible_charges' ? 'billed' : 'treatment_revenue',
          commissionSourceAmount: eligibleRev.toFixed(2),
          commissionRate: commRate.toFixed(2),
          commissionEarned: commEarned.toFixed(2),
          grossSalary: grossSalary.toFixed(2),
          bonusAmount: allowances.toFixed(2),
          deductionAmount: deductions.toFixed(2),
          totalPayable: totalPayable.toFixed(2),
          paidAmount: '0.00',
          dueAmount: totalPayable.toFixed(2),
          payrollStatus: 'Draft',
          paymentStatus: 'Pending',
          paymentMethod: 'Cash',
          paymentDate: dateStr,
          notes: `Auto-generated ${salaryType} payroll for ${periodLabel} (${metrics.visitCount} visits, ${metrics.workingDaysCount} visit days).`,
          recordedBy: req.user!.id,
        })
        .returning();

      createdRecords.push(inserted);
    }

    if (createdRecords.length > 0) {
      await db.insert(payrollAuditLogs).values({
        userId: req.user!.id,
        userRole: req.user!.role,
        action: 'GENERATE_MONTHLY_PAYROLL',
        targetLabel: periodLabel,
        details: `Generated ${createdRecords.length} draft payroll record(s) for ${periodLabel}.`,
      });
    }

    res.json({
      success: true,
      createdCount: createdRecords.length,
      skippedCount: skippedDoctors.length,
      skippedDoctors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/doctor-salaries/:id/finalize (Finalize & lock immutable payroll snapshot)
payrollRouter.post('/doctor-salaries/:id/finalize', ...payrollAuth, async (req: AuthenticatedRequest, res) => {
  const salaryId = Number(req.params.id);
  try {
    const existing = await db
      .select()
      .from(doctorSalaries)
      .where(eq(doctorSalaries.id, salaryId));
    const sal = existing[0];
    if (!sal) {
      return res.status(404).json({ error: 'Payroll record not found.' });
    }

    const st = await db
      .select()
      .from(doctorSalaryStructures)
      .where(eq(doctorSalaryStructures.doctorId, sal.doctorId));

    const snapshot = {
      lockedAt: new Date().toISOString(),
      lockedBy: req.user!.fullName,
      salaryType: sal.salaryType,
      baseAmount: Number(sal.baseAmount) || 0,
      daysWorked: Number(sal.daysWorked) || 0,
      commissionRate: Number(sal.commissionRate) || 0,
      commissionBasis: st[0]?.commissionBasis || sal.commissionBasis || 'treatment_revenue',
      commissionSourceAmount: Number(sal.commissionSourceAmount) || 0,
      commissionEarned: Number(sal.commissionEarned) || 0,
      bonusAmount: Number(sal.bonusAmount) || 0,
      deductionAmount: Number(sal.deductionAmount) || 0,
      grossSalary: Number(sal.grossSalary) || 0,
      totalPayable: Number(sal.totalPayable) || 0,
    };

    const nextPayrollStatus =
      sal.paymentStatus === 'Paid'
        ? 'Paid'
        : sal.paymentStatus === 'Partial'
        ? 'Partially Paid'
        : 'Finalized';

    await db
      .update(doctorSalaries)
      .set({
        payrollStatus: nextPayrollStatus,
        structureSnapshotJson: JSON.stringify(snapshot),
        finalizedAt: new Date(),
        finalizedBy: req.user!.id,
        updatedAt: new Date(),
      })
      .where(eq(doctorSalaries.id, salaryId));

    await db.insert(payrollAuditLogs).values({
      salaryId,
      doctorId: sal.doctorId,
      userId: req.user!.id,
      userRole: req.user!.role,
      action: 'FINALIZE_PAYROLL_RECORD',
      targetLabel: sal.salaryCode,
      details: `Finalized payroll ${sal.salaryCode} with immutable snapshot (Net Payable: Tk ${Number(sal.totalPayable).toFixed(2)}).`,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/doctor-salaries/:id/payments (Record a partial or full salary payment)
payrollRouter.post('/doctor-salaries/:id/payments', ...payrollAuth, async (req: AuthenticatedRequest, res) => {
  const salaryId = Number(req.params.id);
  const { amount, paymentDate, paymentMethod, transactionRef, notes } = req.body;

  const payAmount = Number(amount) || 0;
  if (payAmount <= 0) {
    return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
  }

  try {
    const existing = await db
      .select()
      .from(doctorSalaries)
      .where(eq(doctorSalaries.id, salaryId));
    const sal = existing[0];
    if (!sal) {
      return res.status(404).json({ error: 'Payroll record not found.' });
    }

    const totalPayable = Number(sal.totalPayable) || 0;
    const currentPaid = Number(sal.paidAmount) || 0;
    const remainingDue = Number(Math.max(0, totalPayable - currentPaid).toFixed(2));

    if (payAmount > remainingDue + 0.01) {
      return res.status(400).json({
        error: `Payment amount (Tk ${payAmount.toFixed(2)}) exceeds remaining due balance (Tk ${remainingDue.toFixed(2)}). Overpayment is not allowed without an authorized adjustment.`,
      });
    }

    const newPaid = Number((currentPaid + payAmount).toFixed(2));
    const newDue = Number(Math.max(0, totalPayable - newPaid).toFixed(2));
    const newPaymentStatus = newDue <= 0 ? 'Paid' : 'Partial';
    const newPayrollStatus = newDue <= 0 ? 'Paid' : 'Partially Paid';

    const payCode = `SPAY-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 89)}`;
    const dateStr = paymentDate || new Date().toISOString().split('T')[0];

    await db.insert(salaryPayments).values({
      paymentCode: payCode,
      salaryId,
      doctorId: sal.doctorId,
      amount: payAmount.toFixed(2),
      paymentDate: dateStr,
      paymentMethod: paymentMethod || 'Cash',
      transactionRef: transactionRef ? String(transactionRef).trim() : null,
      notes: notes ? String(notes).trim() : null,
      recordedBy: req.user!.id,
    });

    await db
      .update(doctorSalaries)
      .set({
        paidAmount: newPaid.toFixed(2),
        dueAmount: newDue.toFixed(2),
        paymentMethod: paymentMethod || sal.paymentMethod,
        paymentDate: dateStr,
        paymentStatus: newPaymentStatus,
        payrollStatus: newPayrollStatus,
        updatedAt: new Date(),
      })
      .where(eq(doctorSalaries.id, salaryId));

    await db.insert(payrollAuditLogs).values({
      salaryId,
      doctorId: sal.doctorId,
      userId: req.user!.id,
      userRole: req.user!.role,
      action: 'RECORD_SALARY_PAYMENT',
      targetLabel: sal.salaryCode,
      details: `Recorded salary payment ${payCode} of Tk ${payAmount.toFixed(2)} via ${paymentMethod || 'Cash'}. Total Paid: Tk ${newPaid.toFixed(2)}, Due: Tk ${newDue.toFixed(2)}.`,
    });

    await db.insert(auditLogs).values({
      userId: req.user!.id,
      userRole: req.user!.role,
      action: 'RECORD_SALARY_PAYMENT',
      affectedRecord: `Salary ${sal.salaryCode}`,
      details: `Paid Tk ${payAmount.toFixed(2)} for salary ${sal.salaryCode}`,
    });

    res.json({
      success: true,
      paymentCode: payCode,
      paidAmount: newPaid,
      dueAmount: newDue,
      paymentStatus: newPaymentStatus,
      payrollStatus: newPayrollStatus,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/doctor-salaries/:id/adjustments (Authorized adjustment with mandatory reason)
payrollRouter.post('/doctor-salaries/:id/adjustments', ...payrollAuth, async (req: AuthenticatedRequest, res) => {
  const salaryId = Number(req.params.id);
  const { adjustmentType, amount, reason } = req.body;

  const adjAmount = Number(amount) || 0;
  if (adjAmount <= 0) {
    return res.status(400).json({ error: 'Adjustment amount must be greater than zero.' });
  }
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'A mandatory reason is required for any payroll adjustment.' });
  }

  try {
    const existing = await db
      .select()
      .from(doctorSalaries)
      .where(eq(doctorSalaries.id, salaryId));
    const sal = existing[0];
    if (!sal) {
      return res.status(404).json({ error: 'Payroll record not found.' });
    }

    const previousPayable = Number(sal.totalPayable) || 0;
    const currentBonus = Number(sal.bonusAmount) || 0;
    const currentDeduction = Number(sal.deductionAmount) || 0;
    const currentPaid = Number(sal.paidAmount) || 0;

    let newBonus = currentBonus;
    let newDeduction = currentDeduction;
    let newPayable = previousPayable;

    if (adjustmentType === 'Deduction') {
      newDeduction = Number((currentDeduction + adjAmount).toFixed(2));
      newPayable = Number(Math.max(currentPaid, previousPayable - adjAmount).toFixed(2));
    } else {
      newBonus = Number((currentBonus + adjAmount).toFixed(2));
      newPayable = Number((previousPayable + adjAmount).toFixed(2));
    }

    const newDue = Number(Math.max(0, newPayable - currentPaid).toFixed(2));
    const newPaymentStatus =
      newDue <= 0 && currentPaid > 0 ? 'Paid' : currentPaid > 0 ? 'Partial' : 'Pending';

    await db.insert(salaryAdjustments).values({
      salaryId,
      doctorId: sal.doctorId,
      adjustmentType: adjustmentType || 'Allowance',
      amount: adjAmount.toFixed(2),
      previousPayable: previousPayable.toFixed(2),
      newPayable: newPayable.toFixed(2),
      reason: String(reason).trim(),
      authorizedBy: req.user!.id,
    });

    await db
      .update(doctorSalaries)
      .set({
        bonusAmount: newBonus.toFixed(2),
        deductionAmount: newDeduction.toFixed(2),
        totalPayable: newPayable.toFixed(2),
        dueAmount: newDue.toFixed(2),
        paymentStatus: newPaymentStatus,
        updatedAt: new Date(),
      })
      .where(eq(doctorSalaries.id, salaryId));

    await db.insert(payrollAuditLogs).values({
      salaryId,
      doctorId: sal.doctorId,
      userId: req.user!.id,
      userRole: req.user!.role,
      action: 'AUTHORIZED_PAYROLL_ADJUSTMENT',
      targetLabel: sal.salaryCode,
      details: `Applied ${adjustmentType || 'Allowance'} adjustment of Tk ${adjAmount.toFixed(2)} on ${sal.salaryCode}. Payable changed from Tk ${previousPayable.toFixed(2)} to Tk ${newPayable.toFixed(2)}. Reason: ${String(reason).trim()}`,
    });

    res.json({
      success: true,
      previousPayable,
      newPayable,
      newDue,
      paymentStatus: newPaymentStatus,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
