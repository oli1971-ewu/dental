import { db } from '../db/index.ts';
import { visits, treatments, diagnosticTests, payments } from '../db/schema.ts';
import { eq, asc, sql } from 'drizzle-orm';

export interface VisitFinancialSnapshot {
  visitId: number;
  visitCode: string;
  treatmentCost: number;
  testCost: number;
  additionalCharges: number;
  discount: number;
  totalCost: number; // This visit's net bill (Treatments + Tests + Additional - Discount)
  amountPaid: number; // Payments recorded on this visit
  previousCarriedDue: number; // Unpaid balance carried forward from previous visits
  cumulativePayable: number; // previousCarriedDue + totalCost
  balanceAfterVisit: number; // Math.max(0, cumulativePayable - amountPaid)
  outstandingDue: number; // Active collectible due (consolidated on latest visit)
  isLatestVisit: boolean;
}

// Helper to recalculate all visits for a patient chronologically so carried-forward partial payment dues + new visit charges are 100% accurate
// High-performance batch implementation: fetches all visits, treatment sums, test sums, and payments in parallel,
// calculates cumulative balances in-memory, and only writes to the DB if visit figures changed.
export async function recalculatePatientFinancials(
  patientId: number,
  executor: any = db
): Promise<Map<number, VisitFinancialSnapshot>> {
  const [patientVisits, treatmentRows, testRows, paymentRows] = await Promise.all([
    executor
      .select()
      .from(visits)
      .where(eq(visits.patientId, patientId))
      .orderBy(asc(visits.visitDate), asc(visits.id)),
    executor
      .select({
        visitId: treatments.visitId,
        total: sql<string>`COALESCE(SUM(${treatments.cost}), 0)`,
      })
      .from(treatments)
      .where(eq(treatments.patientId, patientId))
      .groupBy(treatments.visitId),
    executor
      .select({
        visitId: diagnosticTests.visitId,
        total: sql<string>`COALESCE(SUM(${diagnosticTests.cost}), 0)`,
      })
      .from(diagnosticTests)
      .where(eq(diagnosticTests.patientId, patientId))
      .groupBy(diagnosticTests.visitId),
    executor
      .select({
        visitId: payments.visitId,
        total: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
      })
      .from(payments)
      .where(eq(payments.patientId, patientId))
      .groupBy(payments.visitId),
  ]);

  const snapshotMap = new Map<number, VisitFinancialSnapshot>();
  if (patientVisits.length === 0) return snapshotMap;

  const treatmentMap = new Map<number, number>();
  for (const r of treatmentRows) {
    treatmentMap.set(r.visitId, Number(parseFloat(r.total || '0').toFixed(2)));
  }

  const testMap = new Map<number, number>();
  for (const r of testRows) {
    testMap.set(r.visitId, Number(parseFloat(r.total || '0').toFixed(2)));
  }

  const paymentMap = new Map<number, number>();
  for (const r of paymentRows) {
    paymentMap.set(r.visitId, Number(parseFloat(r.total || '0').toFixed(2)));
  }

  let runningBalanceDue = 0;
  const updatesToRun: Promise<any>[] = [];

  for (let idx = 0; idx < patientVisits.length; idx++) {
    const v = patientVisits[idx];
    const isLatestVisit = idx === patientVisits.length - 1;

    const treatmentCost = treatmentMap.get(v.id) || 0;
    const testCost = testMap.get(v.id) || 0;
    const additionalCharges = Number(parseFloat(v.additionalCharges || '0').toFixed(2));
    const discount = Number(parseFloat(v.discount || '0').toFixed(2));

    // Net Visit Bill = Treatments + Tests + Additional Charges - Discount
    const totalCost = Math.max(
      0,
      Number((treatmentCost + testCost + additionalCharges - discount).toFixed(2))
    );
    const amountPaid = paymentMap.get(v.id) || 0;

    // Cumulative Running Formula:
    // Previous Carried-Forward Due + This Visit Net Cost - This Visit Payments = Balance After Visit
    const previousCarriedDue = runningBalanceDue;
    const cumulativePayable = Number((previousCarriedDue + totalCost).toFixed(2));
    const balanceAfterVisit = Math.max(0, Number((cumulativePayable - amountPaid).toFixed(2)));
    runningBalanceDue = balanceAfterVisit;

    // Only the latest visit holds the active collectible due (since earlier unpaid balances are carried forward)
    const outstandingDue = isLatestVisit ? balanceAfterVisit : 0;

    const treatmentCostStr = treatmentCost.toFixed(2);
    const testCostStr = testCost.toFixed(2);
    const totalCostStr = totalCost.toFixed(2);
    const amountPaidStr = amountPaid.toFixed(2);
    const outstandingDueStr = outstandingDue.toFixed(2);

    // Only update DB if fields actually changed to eliminate redundant network write cycles
    const needsUpdate =
      v.totalTreatmentCost !== treatmentCostStr ||
      v.totalTestCost !== testCostStr ||
      v.totalCost !== totalCostStr ||
      v.amountPaid !== amountPaidStr ||
      v.outstandingDue !== outstandingDueStr;

    if (needsUpdate) {
      updatesToRun.push(
        executor
          .update(visits)
          .set({
            totalTreatmentCost: treatmentCostStr,
            totalTestCost: testCostStr,
            totalCost: totalCostStr,
            amountPaid: amountPaidStr,
            outstandingDue: outstandingDueStr,
            updatedAt: new Date(),
          })
          .where(eq(visits.id, v.id))
      );
    }

    snapshotMap.set(v.id, {
      visitId: v.id,
      visitCode: v.visitId,
      treatmentCost,
      testCost,
      additionalCharges,
      discount,
      totalCost,
      amountPaid,
      previousCarriedDue,
      cumulativePayable,
      balanceAfterVisit,
      outstandingDue,
      isLatestVisit,
    });
  }

  if (updatesToRun.length > 0) {
    await Promise.all(updatesToRun);
  }

  return snapshotMap;
}

// Helper to recalculate visit financials (and synchronize the patient's entire visit chain)
export async function recalculateVisitFinancials(visitId: number, executor: any = db) {
  const [currentVisit] = await executor
    .select({ id: visits.id, patientId: visits.patientId })
    .from(visits)
    .where(eq(visits.id, visitId));

  if (!currentVisit) return null;

  const snapshotMap = await recalculatePatientFinancials(currentVisit.patientId, executor);
  return snapshotMap.get(visitId) || null;
}
