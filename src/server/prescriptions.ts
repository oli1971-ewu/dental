import { Router, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import {
  applicationFeatureFlags,
  prescriptions,
  prescriptionMedicines,
  prescriptionTreatmentPlans,
  prescriptionAdvisedTests,
  doctorClinicalHeadings,
  prescriptionCustomSections,
  prescriptionRevisions,
  prescriptionAuditLogs,
  patients,
  visits,
  treatments,
  diagnosticTests,
  appointments,
  users,
  systemSettings,
} from '../db/schema.ts';
import {
  authenticateToken,
  requireRoles,
  logAudit,
  AuthenticatedRequest,
} from './auth.ts';
import { recalculatePatientFinancials } from './financials.ts';
import { generatePrescriptionPdfBuffer } from './prescriptionPdfService.ts';
import { checkUserFeatureAccess } from './featureControl.ts';
import { eq, desc, asc, and, or, sql, inArray } from 'drizzle-orm';

export const prescriptionsRouter = Router();

export const PRESCRIPTION_FEATURE_KEY = 'prescription_management';
export const FEATURE_DISABLED_MESSAGE =
  'Prescription Management is currently disabled by the system developer.';

async function getPrescriptionFeatureFlag() {
  const rows = await db
    .select()
    .from(applicationFeatureFlags)
    .where(eq(applicationFeatureFlags.featureKey, PRESCRIPTION_FEATURE_KEY));

  if (rows.length > 0) {
    return rows[0];
  }

  // Fallback self-heal insert if table was freshly created
  const [inserted] = await db
    .insert(applicationFeatureFlags)
    .values({
      featureKey: PRESCRIPTION_FEATURE_KEY,
      featureName: 'Prescription Management',
      description:
        'Controls access to digital dental prescriptions, dynamic medicine entries, patient prescription history, revision workflows, and A4 PDF generation across all doctor portals.',
      isEnabled: true,
    })
    .onConflictDoNothing({ target: applicationFeatureFlags.featureKey })
    .returning();

  if (inserted) return inserted;
  const retry = await db
    .select()
    .from(applicationFeatureFlags)
    .where(eq(applicationFeatureFlags.featureKey, PRESCRIPTION_FEATURE_KEY));
  return retry[0];
}

// Middleware: Validates 3-Layer Feature Authorization (Global Flag + Package Entitlement + Role) on EVERY prescription request
export async function requirePrescriptionFeature(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const check = await checkUserFeatureAccess(PRESCRIPTION_FEATURE_KEY, req.user?.role || '');
    if (!check.allowed) {
      return res.status(403).json({
        error: check.reason || FEATURE_DISABLED_MESSAGE,
        code: check.code || 'FEATURE_DISABLED',
      });
    }
    next();
  } catch (error) {
    console.error('Feature flag verification error:', error);
    return res.status(500).json({ error: 'Failed to verify Prescription Management feature status' });
  }
}

async function generateUniquePrescriptionNumber(tx: any): Promise<string> {
  const existing = await tx
    .select({ prescriptionNumber: prescriptions.prescriptionNumber })
    .from(prescriptions);

  let maxNum = 1000;
  for (const row of existing) {
    const match = /^RX-(\d+)$/.exec(row.prescriptionNumber);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `RX-${maxNum + 1}`;
}

async function generateRevisionNumber(tx: any, origNumber: string, targetRevNum: number): Promise<string> {
  const base = origNumber.replace(/-R\d+$/, '');
  let candidate = `${base}-R${targetRevNum}`;
  const conflict = await tx
    .select({ id: prescriptions.id })
    .from(prescriptions)
    .where(eq(prescriptions.prescriptionNumber, candidate));

  if (conflict.length === 0) return candidate;

  // Fallback with incrementing suffix if collision exists
  let counter = targetRevNum + 1;
  while (true) {
    const nextCandidate = `${base}-R${counter}`;
    const check = await tx
      .select({ id: prescriptions.id })
      .from(prescriptions)
      .where(eq(prescriptions.prescriptionNumber, nextCandidate));
    if (check.length === 0) return nextCandidate;
    counter++;
  }
}

async function writePrescriptionAudit(
  tx: any,
  user: AuthenticatedRequest['user'],
  prescriptionId: number | null,
  prescriptionNumber: string,
  action: string,
  details: string
) {
  if (!user) return;
  await tx.insert(prescriptionAuditLogs).values({
    prescriptionId,
    prescriptionNumber,
    userId: user.id,
    userRole: user.role,
    action,
    details,
  });
}

async function getClinicProfileSettings() {
  const rows = await db.select().from(systemSettings);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    clinicName: map.clinic_name || 'Dental Care',
    clinicAddress: map.clinic_address || 'House 42, Road 11, Banani, Dhaka-1213, Bangladesh',
    clinicPhone: map.clinic_phone || '+880 2-9876543, +880 1711-234567',
  };
}

function parseOptionalCost(raw: any, label: string): string | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const num = Number(String(raw).replace(/,/g, '').trim());
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${label} cost must be a valid non-negative number.`);
  }
  return num.toFixed(2);
}

function normalizeOptionalPlanItems(rawItems: any) {
  if (!Array.isArray(rawItems)) return [];
  const filtered = rawItems.filter(
    (it) =>
      it &&
      (String(it.treatmentName || '').trim() ||
        String(it.toothNumber || '').trim() ||
        (it.cost !== undefined && it.cost !== null && String(it.cost).trim() !== '') ||
        String(it.notes || '').trim())
  );
  return filtered.map((it, idx) => {
    const treatmentName = String(it.treatmentName || '').trim();
    if (!treatmentName) {
      throw new Error(`Treatment plan row #${idx + 1} must include a Treatment Name.`);
    }
    return {
      sortOrder: idx + 1,
      treatmentName,
      toothNumber: it.toothNumber ? String(it.toothNumber).trim() || null : null,
      cost: parseOptionalCost(it.cost, `Treatment "${treatmentName}"`),
      notes: it.notes ? String(it.notes).trim() || null : null,
    };
  });
}

function normalizeOptionalAdvisedTests(rawTests: any) {
  if (!Array.isArray(rawTests)) return [];
  const filtered = rawTests.filter(
    (it) =>
      it &&
      (String(it.testName || '').trim() ||
        (it.cost !== undefined && it.cost !== null && String(it.cost).trim() !== '') ||
        String(it.notes || '').trim())
  );
  return filtered.map((it, idx) => {
    const testName = String(it.testName || '').trim();
    if (!testName) {
      throw new Error(`Advised test row #${idx + 1} must include a Test Name.`);
    }
    return {
      sortOrder: idx + 1,
      testName,
      category: it.category ? String(it.category).trim() || null : null,
      cost: parseOptionalCost(it.cost, `Advised test "${testName}"`),
      notes: it.notes ? String(it.notes).trim() || null : null,
    };
  });
}

function normalizeCustomSections(rawSections: any) {
  if (!Array.isArray(rawSections)) return [];
  const filtered = rawSections.filter(
    (s) => s && String(s.content || '').trim().length > 0
  );
  return filtered.map((s, idx) => {
    const heading = String(s.heading || '').trim();
    const content = String(s.content || '').trim();
    if (!heading) {
      throw new Error(`Personalized clinical section #${idx + 1} must include a Heading title.`);
    }
    return {
      sortOrder: idx + 1,
      heading,
      content,
    };
  });
}

function normalizeDoctorHeadings(rawHeadings: any) {
  if (!Array.isArray(rawHeadings)) return [];
  const seen = new Set<string>();
  const cleaned: { sortOrder: number; heading: string; defaultPlaceholder: string | null }[] = [];
  for (const item of rawHeadings) {
    const headingText =
      typeof item === 'string' ? item.trim() : String(item?.heading || '').trim();
    if (!headingText) continue;
    const key = headingText.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({
      sortOrder: cleaned.length + 1,
      heading: headingText,
      defaultPlaceholder:
        typeof item === 'object' && item?.defaultPlaceholder
          ? String(item.defaultPlaceholder).trim() || null
          : null,
    });
  }
  return cleaned;
}

async function hydratePrescriptionsList(rxRows: any[]) {
  if (rxRows.length === 0) return [];

  const rxIds = rxRows.map((r) => r.id);
  const patientIds = Array.from(new Set(rxRows.map((r) => r.patientId)));
  const doctorIds = Array.from(new Set(rxRows.map((r) => r.doctorId)));
  const visitIds = Array.from(new Set(rxRows.map((r) => r.visitId)));

  const [medRows, planRows, testRows, customSectionRows, patRows, docRows, visitRows] =
    await Promise.all([
      db
        .select()
        .from(prescriptionMedicines)
        .where(inArray(prescriptionMedicines.prescriptionId, rxIds))
        .orderBy(asc(prescriptionMedicines.sortOrder), asc(prescriptionMedicines.id)),
      db
        .select()
        .from(prescriptionTreatmentPlans)
        .where(inArray(prescriptionTreatmentPlans.prescriptionId, rxIds))
        .orderBy(asc(prescriptionTreatmentPlans.sortOrder), asc(prescriptionTreatmentPlans.id)),
      db
        .select()
        .from(prescriptionAdvisedTests)
        .where(inArray(prescriptionAdvisedTests.prescriptionId, rxIds))
        .orderBy(asc(prescriptionAdvisedTests.sortOrder), asc(prescriptionAdvisedTests.id)),
      db
        .select()
        .from(prescriptionCustomSections)
        .where(inArray(prescriptionCustomSections.prescriptionId, rxIds))
        .orderBy(asc(prescriptionCustomSections.sortOrder), asc(prescriptionCustomSections.id)),
      db.select().from(patients).where(inArray(patients.id, patientIds)),
      db
        .select({
          id: users.id,
          fullName: users.fullName,
          specialization: users.specialization,
          qualifications: users.qualifications,
          registrationNumber: users.registrationNumber,
          phone: users.phone,
          email: users.email,
        })
        .from(users)
        .where(inArray(users.id, doctorIds)),
      db
        .select({
          id: visits.id,
          visitId: visits.visitId,
          visitDate: visits.visitDate,
          complaints: visits.complaints,
          diagnosis: visits.diagnosis,
        })
        .from(visits)
        .where(inArray(visits.id, visitIds)),
    ]);

  const medsByRx = new Map<number, any[]>();
  for (const m of medRows) {
    const arr = medsByRx.get(m.prescriptionId) || [];
    arr.push(m);
    medsByRx.set(m.prescriptionId, arr);
  }

  const plansByRx = new Map<number, any[]>();
  for (const p of planRows) {
    const arr = plansByRx.get(p.prescriptionId) || [];
    arr.push(p);
    plansByRx.set(p.prescriptionId, arr);
  }

  const testsByRx = new Map<number, any[]>();
  for (const t of testRows) {
    const arr = testsByRx.get(t.prescriptionId) || [];
    arr.push(t);
    testsByRx.set(t.prescriptionId, arr);
  }

  const customByRx = new Map<number, any[]>();
  for (const c of customSectionRows) {
    const arr = customByRx.get(c.prescriptionId) || [];
    arr.push(c);
    customByRx.set(c.prescriptionId, arr);
  }

  const patMap = new Map<number, any>(patRows.map((p) => [p.id, p]));
  const docMap = new Map<number, any>(docRows.map((d) => [d.id, d]));
  const visitMap = new Map<number, any>(visitRows.map((v) => [v.id, v]));

  return rxRows.map((rx) => {
    const p = patMap.get(rx.patientId);
    const d = docMap.get(rx.doctorId);
    const v = visitMap.get(rx.visitId);
    const meds = medsByRx.get(rx.id) || [];

    return {
      ...rx,
      patientCode: p?.patientId || '',
      patientName: p?.name || '',
      patientAge: p?.age ?? null,
      patientGender: p?.gender || '',
      patientPhone: p?.phone || '',
      patientAddress: p?.address || null,
      patientAllergies: p?.allergies || null,
      patientExistingDiseases: p?.existingDiseases || null,
      patientMedicalHistory: p?.medicalHistory || null,
      doctorName: d?.fullName || '',
      doctorDesignation: d?.specialization || 'Dental Surgeon',
      doctorQualification: d?.qualifications || null,
      doctorRegistrationNumber: d?.registrationNumber || null,
      doctorPhone: d?.phone || null,
      doctorEmail: d?.email || null,
      visitCode: v?.visitId || '',
      visitDate: v?.visitDate || '',
      medicines: meds,
      treatmentPlanItems: plansByRx.get(rx.id) || [],
      advisedTests: testsByRx.get(rx.id) || [],
      customSections: customByRx.get(rx.id) || [],
    };
  });
}

async function generateUniqueVisitCode(tx: any): Promise<string> {
  const existing = await tx
    .select({ id: visits.id, visitId: visits.visitId })
    .from(visits)
    .orderBy(desc(visits.id));

  let maxNum = 1000;
  for (const row of existing) {
    if (row.id && 1000 + row.id > maxNum) {
      maxNum = 1000 + row.id;
    }
    const match = /^VST-(\d+)$/.exec(row.visitId || '');
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `VST-${maxNum + 1}`;
}

const ALLOWED_DIAGNOSTIC_TEST_CATEGORIES = new Set([
  'Dental X-ray',
  'OPG',
  'IOPA',
  'CBCT',
  'Other',
]);

async function syncPrescriptionClinicalRecords(
  tx: any,
  params: {
    rxId: number;
    prescriptionNumber: string;
    patientId: number;
    visitId: number;
    doctorId: number;
    txDate: string;
    followUpDate?: string | null;
    chiefComplaints?: string | null;
    diagnosis?: string | null;
    syncToPatientRecords: boolean;
    treatmentPlanItems?: {
      sortOrder: number;
      treatmentName: string;
      toothNumber: string | null;
      cost: string | null;
      notes: string | null;
    }[];
    advisedTests?: {
      sortOrder: number;
      testName: string;
      category: string | null;
      cost: string | null;
      notes: string | null;
    }[];
    patientMedicalHistory?: string;
    patientExistingDiseases?: string;
    patientAllergies?: string;
    createdAutoVisit?: boolean;
  }
) {
  // 1. Update patient past / medical / allergy history whenever supplied
  const patientPatch: Record<string, any> = {};
  if (params.patientMedicalHistory !== undefined) {
    patientPatch.medicalHistory = params.patientMedicalHistory.trim() || null;
  }
  if (params.patientExistingDiseases !== undefined) {
    patientPatch.existingDiseases = params.patientExistingDiseases.trim() || null;
  }
  if (params.patientAllergies !== undefined) {
    patientPatch.allergies = params.patientAllergies.trim() || null;
  }
  if (Object.keys(patientPatch).length > 0) {
    await tx
      .update(patients)
      .set({ ...patientPatch, updatedAt: new Date() })
      .where(eq(patients.id, params.patientId));
  }

  // 2. Fill blank visit complaints / diagnosis / follow-up date if not already set on existing visit
  if (!params.createdAutoVisit) {
    const [existingVisit] = await tx
      .select()
      .from(visits)
      .where(eq(visits.id, params.visitId));
    if (existingVisit) {
      const visitPatch: Record<string, any> = {};
      if (!existingVisit.complaints && params.chiefComplaints?.trim()) {
        visitPatch.complaints = params.chiefComplaints.trim();
      }
      if (!existingVisit.diagnosis && params.diagnosis?.trim()) {
        visitPatch.diagnosis = params.diagnosis.trim();
      }
      if (!existingVisit.nextFollowUpDate && params.followUpDate?.trim()) {
        visitPatch.nextFollowUpDate = params.followUpDate.trim();
      }
      if (Object.keys(visitPatch).length > 0) {
        await tx
          .update(visits)
          .set({ ...visitPatch, updatedAt: new Date() })
          .where(eq(visits.id, params.visitId));
      }
    }
  }

  // 3. Upsert follow-up appointment if followUpDate is set & sync is enabled
  if (params.syncToPatientRecords && params.followUpDate && params.followUpDate.trim()) {
    const cleanDate = params.followUpDate.trim();
    const existingAppt = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.patientId, params.patientId),
          eq(appointments.followUpDate, cleanDate)
        )
      )
      .limit(1);

    if (existingAppt.length === 0) {
      await tx.insert(appointments).values({
        patientId: params.patientId,
        visitId: params.visitId,
        doctorId: params.doctorId,
        followUpDate: cleanDate,
        reason: `Follow-up (${params.prescriptionNumber})${
          params.diagnosis?.trim() ? ` - ${params.diagnosis.trim()}` : ''
        }`,
        status: 'Scheduled',
        notes: `Synced from Prescription ${params.prescriptionNumber}`,
      });
    }
  }

  // 4. Sync Planned Treatments -> Treatment History (treatments table)
  if (!params.syncToPatientRecords || params.treatmentPlanItems !== undefined) {
    await tx
      .delete(treatments)
      .where(eq(treatments.sourcePrescriptionId, params.rxId));

    if (
      params.syncToPatientRecords &&
      params.treatmentPlanItems &&
      params.treatmentPlanItems.length > 0
    ) {
      await tx.insert(treatments).values(
        params.treatmentPlanItems.map((item) => ({
          visitId: params.visitId,
          patientId: params.patientId,
          doctorId: params.doctorId,
          sourcePrescriptionId: params.rxId,
          treatmentName: item.treatmentName,
          toothNumber: item.toothNumber,
          cost: item.cost ?? '0.00',
          status: 'Planned',
          notes: item.notes || `From Rx ${params.prescriptionNumber}`,
          treatmentDate: params.txDate,
        }))
      );
    }
  }

  // 5. Sync Advised Tests -> Test & X-ray History (diagnostic_tests table)
  if (!params.syncToPatientRecords || params.advisedTests !== undefined) {
    await tx
      .delete(diagnosticTests)
      .where(eq(diagnosticTests.sourcePrescriptionId, params.rxId));

    if (
      params.syncToPatientRecords &&
      params.advisedTests &&
      params.advisedTests.length > 0
    ) {
      await tx.insert(diagnosticTests).values(
        params.advisedTests.map((t) => {
          const validCat =
            t.category && ALLOWED_DIAGNOSTIC_TEST_CATEGORIES.has(t.category)
              ? t.category
              : 'Other';
          const fallbackNote =
            t.category && !ALLOWED_DIAGNOSTIC_TEST_CATEGORIES.has(t.category)
              ? `${t.category} • From Rx ${params.prescriptionNumber}`
              : `From Rx ${params.prescriptionNumber}`;
          return {
            visitId: params.visitId,
            patientId: params.patientId,
            doctorId: params.doctorId,
            sourcePrescriptionId: params.rxId,
            testName: t.testName,
            category: validCat,
            cost: t.cost ?? '0.00',
            status: 'Requested',
            notes: t.notes || fallbackNote,
            testDate: params.txDate,
          };
        })
      );
    }
  }

  // 6. Recalculate cumulative visit & patient financials cleanly inside transaction
  await recalculatePatientFinancials(params.patientId, tx);
}

// ==========================================
// 2. PRESCRIPTION MODULE ROUTES (ALL GUARDED BY FEATURE FLAG)
// ==========================================

// Autocomplete suggestions from previously entered medicines across clinic prescriptions
prescriptionsRouter.get(
  '/prescriptions/medicines/suggestions',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

      const allMeds = await db
        .select({
          medicineName: prescriptionMedicines.medicineName,
          genericName: prescriptionMedicines.genericName,
          strength: prescriptionMedicines.strength,
          dosage: prescriptionMedicines.dosage,
          frequency: prescriptionMedicines.frequency,
          duration: prescriptionMedicines.duration,
          quantity: prescriptionMedicines.quantity,
          mealInstructions: prescriptionMedicines.mealInstructions,
          id: prescriptionMedicines.id,
        })
        .from(prescriptionMedicines)
        .orderBy(desc(prescriptionMedicines.id))
        .limit(200);

      // Deduplicate by normalized medicineName + strength while keeping most recent preset values
      const seen = new Map<string, any>();
      for (const m of allMeds) {
        const nameLower = (m.medicineName || '').toLowerCase();
        const genLower = (m.genericName || '').toLowerCase();
        if (query && !nameLower.includes(query) && !genLower.includes(query)) {
          continue;
        }
        const dedupeKey = `${nameLower}::${(m.strength || '').toLowerCase()}`;
        if (!seen.has(dedupeKey)) {
          seen.set(dedupeKey, {
            medicineName: m.medicineName,
            genericName: m.genericName || '',
            strength: m.strength || '',
            dosage: m.dosage || '',
            frequency: m.frequency || '',
            duration: m.duration || '',
            quantity: m.quantity || '',
            mealInstructions: m.mealInstructions || '',
          });
        }
      }

      res.json(Array.from(seen.values()).slice(0, 15));
    } catch (error) {
      console.error('Failed to fetch medicine suggestions:', error);
      res.status(500).json({ error: 'Failed to load medicine suggestions' });
    }
  }
);

// Personalized Clinical Headings per Doctor (Get & Save Default Headings)
prescriptionsRouter.get(
  '/prescriptions/headings',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const isSuper = user.role === 'main_doctor' || user.role === 'developer';
      const requestedDoctorId =
        isSuper && typeof req.query.doctorId === 'string' && req.query.doctorId.trim()
          ? parseInt(req.query.doctorId, 10)
          : user.id;
      const targetDoctorId = Number.isFinite(requestedDoctorId) ? requestedDoctorId : user.id;

      const rows = await db
        .select()
        .from(doctorClinicalHeadings)
        .where(eq(doctorClinicalHeadings.doctorId, targetDoctorId))
        .orderBy(asc(doctorClinicalHeadings.sortOrder), asc(doctorClinicalHeadings.id));

      res.json(rows);
    } catch (error) {
      console.error('Failed to load doctor personalized headings:', error);
      res.status(500).json({ error: 'Failed to load personalized headings' });
    }
  }
);

prescriptionsRouter.put(
  '/prescriptions/headings',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const isSuper = user.role === 'main_doctor' || user.role === 'developer';
      const { headings, doctorId } = req.body;
      const targetDoctorId =
        isSuper && doctorId ? parseInt(String(doctorId), 10) || user.id : user.id;

      const normalized = normalizeDoctorHeadings(headings);

      const savedRows = await db.transaction(async (tx) => {
        await tx
          .delete(doctorClinicalHeadings)
          .where(eq(doctorClinicalHeadings.doctorId, targetDoctorId));

        if (normalized.length === 0) return [];

        return tx
          .insert(doctorClinicalHeadings)
          .values(
            normalized.map((h) => ({
              doctorId: targetDoctorId,
              sortOrder: h.sortOrder,
              heading: h.heading,
              defaultPlaceholder: h.defaultPlaceholder,
            }))
          )
          .returning();
      });

      await logAudit(
        user,
        'UPDATE_DOCTOR_PRESCRIPTION_HEADINGS',
        `Doctor ID ${targetDoctorId}`,
        `Saved ${savedRows.length} personalized clinical heading(s)`
      );

      res.json({ success: true, headings: savedRows });
    } catch (error) {
      console.error('Failed to save doctor personalized headings:', error);
      res.status(500).json({ error: 'Failed to save personalized headings' });
    }
  }
);

// List Prescriptions with Role Scoping & Multi-Criteria Filtering
prescriptionsRouter.get(
  '/prescriptions',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { patientId, visitId, doctorId, status, fromDate, toDate, search } = req.query;
      const user = req.user!;
      const isSuper = user.role === 'main_doctor' || user.role === 'developer';

      const conditions = [];

      if (patientId && typeof patientId === 'string') {
        conditions.push(eq(prescriptions.patientId, parseInt(patientId, 10)));
      }
      if (visitId && typeof visitId === 'string') {
        conditions.push(eq(prescriptions.visitId, parseInt(visitId, 10)));
      }

      // RBAC:
      // - main_doctor & developer: can view all clinic prescriptions or filter by doctorId
      // - doctor: when viewing a specific patient's history (?patientId=...), allowed via shared clinic patient access;
      //           otherwise globally scoped to their own prescriptions (doctorId = user.id).
      if (isSuper) {
        if (doctorId && typeof doctorId === 'string' && doctorId !== 'All') {
          conditions.push(eq(prescriptions.doctorId, parseInt(doctorId, 10)));
        }
      } else {
        if (!patientId) {
          conditions.push(eq(prescriptions.doctorId, user.id));
        } else if (doctorId && typeof doctorId === 'string' && doctorId !== 'All') {
          conditions.push(eq(prescriptions.doctorId, parseInt(doctorId, 10)));
        }
      }

      if (status && typeof status === 'string' && status !== 'All') {
        conditions.push(eq(prescriptions.status, status));
      }
      if (fromDate && typeof fromDate === 'string' && fromDate.trim()) {
        conditions.push(sql`${prescriptions.prescriptionDate} >= ${fromDate.trim()}`);
      }
      if (toDate && typeof toDate === 'string' && toDate.trim()) {
        conditions.push(sql`${prescriptions.prescriptionDate} <= ${toDate.trim()}`);
      }

      const rawList =
        conditions.length > 0
          ? await db
              .select()
              .from(prescriptions)
              .where(and(...conditions))
              .orderBy(desc(prescriptions.prescriptionDate), desc(prescriptions.id))
          : await db
              .select()
              .from(prescriptions)
              .orderBy(desc(prescriptions.prescriptionDate), desc(prescriptions.id));

      let hydrated = await hydratePrescriptionsList(rawList);

      if (search && typeof search === 'string' && search.trim()) {
        const q = search.trim().toLowerCase();
        hydrated = hydrated.filter(
          (rx) =>
            rx.prescriptionNumber.toLowerCase().includes(q) ||
            rx.patientName.toLowerCase().includes(q) ||
            rx.patientCode.toLowerCase().includes(q) ||
            rx.patientPhone.toLowerCase().includes(q) ||
            rx.doctorName.toLowerCase().includes(q) ||
            rx.visitCode.toLowerCase().includes(q) ||
            (rx.diagnosis || '').toLowerCase().includes(q) ||
            (rx.customSections || []).some(
              (s: any) =>
                s.heading.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)
            )
        );
      }

      res.json(hydrated);
    } catch (error) {
      console.error('Error fetching prescriptions:', error);
      res.status(500).json({ error: 'Failed to load prescriptions' });
    }
  }
);

// Get Single Prescription (Full Clinical & Print Details + Revision Lineage + Audit Logs)
prescriptionsRouter.get(
  '/prescriptions/:id',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid prescription ID' });

      const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
      if (!rx) return res.status(404).json({ error: 'Prescription not found' });

      const [hydrated] = await hydratePrescriptionsList([rx]);
      const clinic = await getClinicProfileSettings();

      const rootId = rx.rootPrescriptionId || rx.id;
      const [revisionRecords, lineageRows, rxAuditRows] = await Promise.all([
        db
          .select({
            id: prescriptionRevisions.id,
            prescriptionId: prescriptionRevisions.prescriptionId,
            previousPrescriptionId: prescriptionRevisions.previousPrescriptionId,
            revisionNumber: prescriptionRevisions.revisionNumber,
            revisionReason: prescriptionRevisions.revisionReason,
            createdBy: prescriptionRevisions.createdBy,
            createdByName: users.fullName,
            createdAt: prescriptionRevisions.createdAt,
          })
          .from(prescriptionRevisions)
          .leftJoin(users, eq(prescriptionRevisions.createdBy, users.id))
          .where(
            or(
              eq(prescriptionRevisions.prescriptionId, rx.id),
              eq(prescriptionRevisions.previousPrescriptionId, rx.id)
            )
          )
          .orderBy(asc(prescriptionRevisions.revisionNumber), asc(prescriptionRevisions.id)),
        db
          .select({
            id: prescriptions.id,
            prescriptionNumber: prescriptions.prescriptionNumber,
            revisionNumber: prescriptions.revisionNumber,
            status: prescriptions.status,
            prescriptionDate: prescriptions.prescriptionDate,
            createdAt: prescriptions.createdAt,
          })
          .from(prescriptions)
          .where(or(eq(prescriptions.id, rootId), eq(prescriptions.rootPrescriptionId, rootId)))
          .orderBy(asc(prescriptions.revisionNumber), asc(prescriptions.id)),
        db
          .select({
            id: prescriptionAuditLogs.id,
            action: prescriptionAuditLogs.action,
            userRole: prescriptionAuditLogs.userRole,
            userName: users.fullName,
            details: prescriptionAuditLogs.details,
            createdAt: prescriptionAuditLogs.createdAt,
          })
          .from(prescriptionAuditLogs)
          .leftJoin(users, eq(prescriptionAuditLogs.userId, users.id))
          .where(eq(prescriptionAuditLogs.prescriptionId, rx.id))
          .orderBy(desc(prescriptionAuditLogs.id)),
      ]);

      res.json({
        ...hydrated,
        clinic,
        revisions: revisionRecords,
        revisionLineage: lineageRows,
        auditLogs: rxAuditRows,
      });
    } catch (error) {
      console.error('Error loading prescription detail:', error);
      res.status(500).json({ error: 'Failed to load prescription details' });
    }
  }
);

// Create New Prescription (Draft or Finalized; auto-creates Clinic Visit if visitId is omitted or 'auto')
prescriptionsRouter.post(
  '/prescriptions',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        patientId,
        visitId,
        doctorId,
        prescriptionDate,
        status,
        chiefComplaints,
        clinicalFindings,
        diagnosis,
        treatmentPlan,
        showPlanCosts,
        syncToPatientRecords,
        treatmentPlanItems,
        advisedTests,
        customSections,
        followUpDate,
        oralHygieneInstructions,
        toothBrushingInstructions,
        mouthwashRecommendations,
        postExtractionInstructions,
        postTreatmentPrecautions,
        dietaryRecommendations,
        additionalClinicalAdvice,
        medicines,
        patientMedicalHistory,
        patientExistingDiseases,
        patientAllergies,
        idempotencyKey,
      } = req.body;

      if (!patientId) {
        return res.status(400).json({ error: 'Patient ID is required.' });
      }

      const patIdNum = parseInt(patientId, 10);
      if (isNaN(patIdNum)) {
        return res.status(400).json({ error: 'Invalid Patient ID.' });
      }

      const shouldAutoCreateVisit =
        visitId === undefined ||
        visitId === null ||
        String(visitId).trim() === '' ||
        String(visitId).trim().toLowerCase() === 'auto' ||
        Number(visitId) <= 0;
      const visitIdNum = shouldAutoCreateVisit ? null : parseInt(String(visitId), 10);
      if (!shouldAutoCreateVisit && (visitIdNum === null || isNaN(visitIdNum))) {
        return res.status(400).json({ error: 'Invalid Associated Visit ID.' });
      }

      // Idempotency protection against accidental double-clicks
      if (idempotencyKey && typeof idempotencyKey === 'string') {
        const existingDup = await db
          .select()
          .from(prescriptions)
          .where(eq(prescriptions.idempotencyKey, idempotencyKey));
        if (existingDup.length > 0) {
          const [hydrated] = await hydratePrescriptionsList(existingDup);
          return res.status(200).json(hydrated);
        }
      }

      // Verify patient exists (and visit if explicitly supplied)
      const [pat] = await db.select().from(patients).where(eq(patients.id, patIdNum));
      if (!pat) return res.status(404).json({ error: 'Patient record not found.' });

      let existingVst: any = null;
      if (!shouldAutoCreateVisit && visitIdNum) {
        const [vst] = await db.select().from(visits).where(eq(visits.id, visitIdNum));
        if (!vst || vst.patientId !== pat.id) {
          return res.status(400).json({ error: 'Selected visit does not belong to this patient.' });
        }
        existingVst = vst;
      }

      // Server-side RBAC for doctor ownership
      const user = req.user!;
      const isSuper = user.role === 'main_doctor' || user.role === 'developer';
      const targetDoctorId =
        isSuper && doctorId ? parseInt(doctorId, 10) : user.id;

      const targetStatus = status === 'Finalized' ? 'Finalized' : 'Draft';
      const shouldSyncRecords =
        syncToPatientRecords !== undefined ? Boolean(syncToPatientRecords) : true;
      const medList: any[] = Array.isArray(medicines) ? medicines : [];

      for (const m of medList) {
        if (!m.medicineName || !String(m.medicineName).trim()) {
          return res.status(400).json({ error: 'Every medicine row must include a Medicine Name.' });
        }
      }

      let normalizedPlans: ReturnType<typeof normalizeOptionalPlanItems> = [];
      let normalizedTests: ReturnType<typeof normalizeOptionalAdvisedTests> = [];
      let normalizedCustomSections: ReturnType<typeof normalizeCustomSections> = [];
      try {
        normalizedPlans = normalizeOptionalPlanItems(treatmentPlanItems);
        normalizedTests = normalizeOptionalAdvisedTests(advisedTests);
        normalizedCustomSections = normalizeCustomSections(customSections);
      } catch (valErr: any) {
        return res.status(400).json({ error: valErr.message || 'Invalid clinical section, treatment plan, or test entry.' });
      }

      if (targetStatus === 'Finalized') {
        const hasClinical =
          Boolean(diagnosis?.trim()) ||
          Boolean(chiefComplaints?.trim()) ||
          Boolean(clinicalFindings?.trim()) ||
          Boolean(treatmentPlan?.trim()) ||
          normalizedCustomSections.length > 0 ||
          medList.length > 0 ||
          normalizedPlans.length > 0 ||
          normalizedTests.length > 0;
        if (!hasClinical) {
          return res.status(400).json({
            error:
              'Cannot finalize an empty prescription. Add clinical details, personalized sections, planned treatments, advised tests, or at least one medicine.',
          });
        }
      }

      const txDate = prescriptionDate?.trim() || new Date().toISOString().split('T')[0];

      const { createdRx, linkedVisitCode, createdAutoVisit } = await db.transaction(async (tx) => {
        let targetVisitRow = existingVst;
        let wasAutoCreated = false;

        if (!targetVisitRow) {
          const generatedVisitCode = await generateUniqueVisitCode(tx);
          const nowTime = new Date().toTimeString().slice(0, 5);
          const [autoVisit] = await tx
            .insert(visits)
            .values({
              visitId: generatedVisitCode,
              patientId: pat.id,
              doctorId: targetDoctorId,
              visitDate: txDate,
              visitTime: nowTime,
              complaints: chiefComplaints?.trim() || null,
              diagnosis: diagnosis?.trim() || null,
              notes: 'Auto-created from Prescription',
              nextFollowUpDate: followUpDate?.trim() || null,
              totalTreatmentCost: '0.00',
              totalTestCost: '0.00',
              additionalCharges: '0.00',
              discount: '0.00',
              totalCost: '0.00',
              amountPaid: '0.00',
              outstandingDue: '0.00',
              status: 'Completed',
            })
            .returning();
          targetVisitRow = autoVisit;
          wasAutoCreated = true;
        }

        const rxNumber = await generateUniquePrescriptionNumber(tx);

        const [inserted] = await tx
          .insert(prescriptions)
          .values({
            prescriptionNumber: rxNumber,
            patientId: pat.id,
            doctorId: targetDoctorId,
            visitId: targetVisitRow.id,
            revisionNumber: 1,
            status: targetStatus,
            prescriptionDate: txDate,
            chiefComplaints: chiefComplaints?.trim() || null,
            clinicalFindings: clinicalFindings?.trim() || null,
            diagnosis: diagnosis?.trim() || null,
            treatmentPlan: treatmentPlan?.trim() || null,
            showPlanCosts: showPlanCosts !== undefined ? Boolean(showPlanCosts) : true,
            syncToPatientRecords: shouldSyncRecords,
            followUpDate: followUpDate?.trim() || null,
            oralHygieneInstructions: oralHygieneInstructions?.trim() || null,
            toothBrushingInstructions: toothBrushingInstructions?.trim() || null,
            mouthwashRecommendations: mouthwashRecommendations?.trim() || null,
            postExtractionInstructions: postExtractionInstructions?.trim() || null,
            postTreatmentPrecautions: postTreatmentPrecautions?.trim() || null,
            dietaryRecommendations: dietaryRecommendations?.trim() || null,
            additionalClinicalAdvice: additionalClinicalAdvice?.trim() || null,
            idempotencyKey: idempotencyKey?.trim() || null,
            finalizedAt: targetStatus === 'Finalized' ? new Date() : null,
            finalizedBy: targetStatus === 'Finalized' ? user.id : null,
          })
          .returning();

        const childInserts: Promise<any>[] = [];

        if (medList.length > 0) {
          childInserts.push(
            tx.insert(prescriptionMedicines).values(
              medList.map((m, index) => ({
                prescriptionId: inserted.id,
                medicineId: m.medicineId ? parseInt(String(m.medicineId), 10) || null : null,
                sortOrder: index + 1,
                medicineName: String(m.medicineName).trim(),
                genericName: m.genericName?.trim() || null,
                strength: m.strength?.trim() || null,
                dosageType: m.dosageType?.trim() || null,
                manufacturer: m.manufacturer?.trim() || null,
                packageMark: m.packageMark?.trim() || null,
                dosage: m.dosage?.trim() || null,
                frequency: m.frequency?.trim() || null,
                duration: m.duration?.trim() || null,
                quantity: null,
                mealInstructions: m.mealInstructions?.trim() || null,
                additionalNotes: m.additionalNotes?.trim() || null,
              }))
            )
          );
        }

        if (normalizedPlans.length > 0) {
          childInserts.push(
            tx.insert(prescriptionTreatmentPlans).values(
              normalizedPlans.map((p) => ({
                prescriptionId: inserted.id,
                ...p,
              }))
            )
          );
        }

        if (normalizedTests.length > 0) {
          childInserts.push(
            tx.insert(prescriptionAdvisedTests).values(
              normalizedTests.map((t) => ({
                prescriptionId: inserted.id,
                ...t,
              }))
            )
          );
        }

        if (normalizedCustomSections.length > 0) {
          childInserts.push(
            tx.insert(prescriptionCustomSections).values(
              normalizedCustomSections.map((s) => ({
                prescriptionId: inserted.id,
                ...s,
              }))
            )
          );
        }

        if (childInserts.length > 0) {
          await Promise.all(childInserts);
        }

        await syncPrescriptionClinicalRecords(tx, {
          rxId: inserted.id,
          prescriptionNumber: inserted.prescriptionNumber,
          patientId: pat.id,
          visitId: targetVisitRow.id,
          doctorId: targetDoctorId,
          txDate,
          followUpDate,
          chiefComplaints,
          diagnosis,
          syncToPatientRecords: shouldSyncRecords,
          treatmentPlanItems: normalizedPlans,
          advisedTests: normalizedTests,
          patientMedicalHistory,
          patientExistingDiseases,
          patientAllergies,
          createdAutoVisit: wasAutoCreated,
        });

        await writePrescriptionAudit(
          tx,
          user,
          inserted.id,
          inserted.prescriptionNumber,
          targetStatus === 'Finalized' ? 'CREATE_AND_FINALIZE_PRESCRIPTION' : 'CREATE_PRESCRIPTION_DRAFT',
          `Created ${targetStatus} prescription ${inserted.prescriptionNumber} for ${pat.name} (${pat.patientId}) linked to ${targetVisitRow.visitId}${wasAutoCreated ? ' (auto-created visit)' : ''} with ${medList.length} medicine(s), ${normalizedPlans.length} planned treatment(s), ${normalizedTests.length} advised test(s), ${normalizedCustomSections.length} custom heading(s).`
        );

        return {
          createdRx: inserted,
          linkedVisitCode: targetVisitRow.visitId,
          createdAutoVisit: wasAutoCreated,
        };
      });

      logAudit(
        user,
        targetStatus === 'Finalized' ? 'FINALIZE_PRESCRIPTION' : 'CREATE_PRESCRIPTION_DRAFT',
        `Prescription ${createdRx.prescriptionNumber} (${pat.patientId})`,
        `Linked to Visit ${linkedVisitCode}${createdAutoVisit ? ' (Auto-Created)' : ''}; ${medList.length} medicines, ${normalizedPlans.length} planned treatments, ${normalizedTests.length} advised tests, ${normalizedCustomSections.length} custom headings`
      ).catch((e) => console.error('Audit log error:', e));

      const [hydrated] = await hydratePrescriptionsList([createdRx]);
      res.status(201).json(hydrated);
    } catch (error: any) {
      console.error('Error creating prescription:', error);
      res.status(500).json({ error: error.message || 'Failed to create prescription' });
    }
  }
);

// Update Draft Prescription (Finalized & Revised prescriptions are immutable)
prescriptionsRouter.put(
  '/prescriptions/:id',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid prescription ID' });

      const [existing] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
      if (!existing) return res.status(404).json({ error: 'Prescription not found' });

      const user = req.user!;
      const isSuper = user.role === 'main_doctor' || user.role === 'developer';
      if (!isSuper && existing.doctorId !== user.id) {
        return res.status(403).json({
          error: 'Permission denied. Doctors can only edit their own draft prescriptions.',
        });
      }

      if (existing.status !== 'Draft') {
        return res.status(400).json({
          error:
            'Finalized or revised prescriptions cannot be edited directly. Create a revision instead.',
        });
      }

      const {
        visitId,
        prescriptionDate,
        chiefComplaints,
        clinicalFindings,
        diagnosis,
        treatmentPlan,
        showPlanCosts,
        syncToPatientRecords,
        treatmentPlanItems,
        advisedTests,
        customSections,
        followUpDate,
        oralHygieneInstructions,
        toothBrushingInstructions,
        mouthwashRecommendations,
        postExtractionInstructions,
        postTreatmentPrecautions,
        dietaryRecommendations,
        additionalClinicalAdvice,
        medicines,
        patientMedicalHistory,
        patientExistingDiseases,
        patientAllergies,
        finalizeNow,
      } = req.body;

      let targetVisitId = existing.visitId;
      if (visitId && String(visitId).trim().toLowerCase() !== 'auto' && Number(visitId) > 0) {
        const parsedVisit = parseInt(String(visitId), 10);
        const [vst] = await db.select().from(visits).where(eq(visits.id, parsedVisit));
        if (!vst || vst.patientId !== existing.patientId) {
          return res.status(400).json({ error: 'Selected visit does not belong to this patient.' });
        }
        targetVisitId = vst.id;
      }

      const medList: any[] = Array.isArray(medicines) ? medicines : [];
      for (const m of medList) {
        if (!m.medicineName || !String(m.medicineName).trim()) {
          return res.status(400).json({ error: 'Every medicine row must include a Medicine Name.' });
        }
      }

      let normalizedPlans: ReturnType<typeof normalizeOptionalPlanItems> = [];
      let normalizedTests: ReturnType<typeof normalizeOptionalAdvisedTests> = [];
      let normalizedCustomSections: ReturnType<typeof normalizeCustomSections> = [];
      try {
        normalizedPlans = normalizeOptionalPlanItems(treatmentPlanItems);
        normalizedTests = normalizeOptionalAdvisedTests(advisedTests);
        normalizedCustomSections = normalizeCustomSections(customSections);
      } catch (valErr: any) {
        return res.status(400).json({ error: valErr.message || 'Invalid clinical section, treatment plan, or test entry.' });
      }

      const willFinalize = Boolean(finalizeNow);
      if (willFinalize) {
        const hasClinical =
          Boolean(diagnosis?.trim()) ||
          Boolean(chiefComplaints?.trim()) ||
          Boolean(clinicalFindings?.trim()) ||
          Boolean(treatmentPlan?.trim()) ||
          normalizedCustomSections.length > 0 ||
          medList.length > 0 ||
          normalizedPlans.length > 0 ||
          normalizedTests.length > 0;
        if (!hasClinical) {
          return res.status(400).json({
            error:
              'Cannot finalize an empty prescription. Add clinical details, personalized sections, planned treatments, advised tests, or at least one medicine.',
          });
        }
      }

      const nextSyncFlag =
        syncToPatientRecords !== undefined
          ? Boolean(syncToPatientRecords)
          : existing.syncToPatientRecords;
      const nextTxDate = prescriptionDate?.trim() || existing.prescriptionDate;

      const updatedRx = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(prescriptions)
          .set({
            visitId: targetVisitId,
            prescriptionDate: nextTxDate,
            chiefComplaints: chiefComplaints?.trim() || null,
            clinicalFindings: clinicalFindings?.trim() || null,
            diagnosis: diagnosis?.trim() || null,
            treatmentPlan: treatmentPlan?.trim() || null,
            showPlanCosts:
              showPlanCosts !== undefined ? Boolean(showPlanCosts) : existing.showPlanCosts,
            syncToPatientRecords: nextSyncFlag,
            followUpDate: followUpDate?.trim() || null,
            oralHygieneInstructions: oralHygieneInstructions?.trim() || null,
            toothBrushingInstructions: toothBrushingInstructions?.trim() || null,
            mouthwashRecommendations: mouthwashRecommendations?.trim() || null,
            postExtractionInstructions: postExtractionInstructions?.trim() || null,
            postTreatmentPrecautions: postTreatmentPrecautions?.trim() || null,
            dietaryRecommendations: dietaryRecommendations?.trim() || null,
            additionalClinicalAdvice: additionalClinicalAdvice?.trim() || null,
            status: willFinalize ? 'Finalized' : 'Draft',
            finalizedAt: willFinalize ? new Date() : existing.finalizedAt,
            finalizedBy: willFinalize ? user.id : existing.finalizedBy,
            updatedAt: new Date(),
          })
          .where(eq(prescriptions.id, id))
          .returning();

        // Replace medicine items cleanly
        await tx
          .delete(prescriptionMedicines)
          .where(eq(prescriptionMedicines.prescriptionId, id));

        if (medList.length > 0) {
          await tx.insert(prescriptionMedicines).values(
            medList.map((m, index) => ({
              prescriptionId: id,
              medicineId: m.medicineId ? parseInt(String(m.medicineId), 10) || null : null,
              sortOrder: index + 1,
              medicineName: String(m.medicineName).trim(),
              genericName: m.genericName?.trim() || null,
              strength: m.strength?.trim() || null,
              dosageType: m.dosageType?.trim() || null,
              manufacturer: m.manufacturer?.trim() || null,
              packageMark: m.packageMark?.trim() || null,
              dosage: m.dosage?.trim() || null,
              frequency: m.frequency?.trim() || null,
              duration: m.duration?.trim() || null,
              quantity: null,
              mealInstructions: m.mealInstructions?.trim() || null,
              additionalNotes: m.additionalNotes?.trim() || null,
            }))
          );
        }

        // Replace treatment plan items & advised tests cleanly when provided in payload
        if (Array.isArray(treatmentPlanItems)) {
          await tx
            .delete(prescriptionTreatmentPlans)
            .where(eq(prescriptionTreatmentPlans.prescriptionId, id));
          if (normalizedPlans.length > 0) {
            await tx.insert(prescriptionTreatmentPlans).values(
              normalizedPlans.map((p) => ({
                prescriptionId: id,
                ...p,
              }))
            );
          }
        }

        if (Array.isArray(advisedTests)) {
          await tx
            .delete(prescriptionAdvisedTests)
            .where(eq(prescriptionAdvisedTests.prescriptionId, id));
          if (normalizedTests.length > 0) {
            await tx.insert(prescriptionAdvisedTests).values(
              normalizedTests.map((t) => ({
                prescriptionId: id,
                ...t,
              }))
            );
          }
        }

        if (Array.isArray(customSections)) {
          await tx
            .delete(prescriptionCustomSections)
            .where(eq(prescriptionCustomSections.prescriptionId, id));
          if (normalizedCustomSections.length > 0) {
            await tx.insert(prescriptionCustomSections).values(
              normalizedCustomSections.map((s) => ({
                prescriptionId: id,
                ...s,
              }))
            );
          }
        }

        // Synchronize central clinical tables (patient medical history, treatment history, test history, follow-up, financials)
        // If syncToPatientRecords toggled to true without resending items, read existing plan/test items from DB
        let syncPlansArg = Array.isArray(treatmentPlanItems) ? normalizedPlans : undefined;
        let syncTestsArg = Array.isArray(advisedTests) ? normalizedTests : undefined;
        if (nextSyncFlag && !existing.syncToPatientRecords) {
          if (syncPlansArg === undefined) {
            syncPlansArg = await tx
              .select()
              .from(prescriptionTreatmentPlans)
              .where(eq(prescriptionTreatmentPlans.prescriptionId, id));
          }
          if (syncTestsArg === undefined) {
            syncTestsArg = await tx
              .select()
              .from(prescriptionAdvisedTests)
              .where(eq(prescriptionAdvisedTests.prescriptionId, id));
          }
        }

        await syncPrescriptionClinicalRecords(tx, {
          rxId: id,
          prescriptionNumber: existing.prescriptionNumber,
          patientId: existing.patientId,
          visitId: targetVisitId,
          doctorId: existing.doctorId,
          txDate: nextTxDate,
          followUpDate,
          chiefComplaints,
          diagnosis,
          syncToPatientRecords: nextSyncFlag,
          treatmentPlanItems: syncPlansArg,
          advisedTests: syncTestsArg,
          patientMedicalHistory,
          patientExistingDiseases,
          patientAllergies,
        });

        await writePrescriptionAudit(
          tx,
          user,
          id,
          existing.prescriptionNumber,
          willFinalize ? 'FINALIZE_PRESCRIPTION' : 'UPDATE_PRESCRIPTION_DRAFT',
          `${willFinalize ? 'Finalized' : 'Updated draft'} ${existing.prescriptionNumber} with ${medList.length} medicine(s), ${normalizedPlans.length} planned treatment(s), ${normalizedTests.length} advised test(s), ${normalizedCustomSections.length} custom heading(s).`
        );

        return updated;
      });

      logAudit(
        user,
        willFinalize ? 'FINALIZE_PRESCRIPTION' : 'UPDATE_PRESCRIPTION_DRAFT',
        `Prescription ${existing.prescriptionNumber}`,
        willFinalize ? 'Transitioned from Draft to Finalized' : `Updated draft (${medList.length} medicines)`
      ).catch((e) => console.error('Audit log error:', e));

      const [hydrated] = await hydratePrescriptionsList([updatedRx]);
      res.json(hydrated);
    } catch (error) {
      console.error('Error updating prescription:', error);
      res.status(500).json({ error: 'Failed to update prescription' });
    }
  }
);

// Finalize Draft Prescription
prescriptionsRouter.post(
  '/prescriptions/:id/finalize',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid prescription ID' });

      const [existing] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
      if (!existing) return res.status(404).json({ error: 'Prescription not found' });

      const user = req.user!;
      const isSuper = user.role === 'main_doctor' || user.role === 'developer';
      if (!isSuper && existing.doctorId !== user.id) {
        return res.status(403).json({
          error: 'Permission denied. Doctors can only finalize their own prescriptions.',
        });
      }

      if (existing.status !== 'Draft') {
        return res.status(400).json({ error: `Prescription is already ${existing.status}.` });
      }

      const [meds, planItems, advisedTestItems, customSectionItems] = await Promise.all([
        db
          .select()
          .from(prescriptionMedicines)
          .where(eq(prescriptionMedicines.prescriptionId, id)),
        db
          .select()
          .from(prescriptionTreatmentPlans)
          .where(eq(prescriptionTreatmentPlans.prescriptionId, id)),
        db
          .select()
          .from(prescriptionAdvisedTests)
          .where(eq(prescriptionAdvisedTests.prescriptionId, id)),
        db
          .select()
          .from(prescriptionCustomSections)
          .where(eq(prescriptionCustomSections.prescriptionId, id)),
      ]);

      const hasClinical =
        Boolean(existing.diagnosis?.trim()) ||
        Boolean(existing.chiefComplaints?.trim()) ||
        Boolean(existing.clinicalFindings?.trim()) ||
        Boolean(existing.treatmentPlan?.trim()) ||
        customSectionItems.length > 0 ||
        meds.length > 0 ||
        planItems.length > 0 ||
        advisedTestItems.length > 0;

      if (!hasClinical) {
        return res.status(400).json({
          error:
            'Cannot finalize an empty prescription. Please add clinical findings, personalized headings, treatment plan, advised tests, or at least one medicine.',
        });
      }

      const [finalized] = await db
        .update(prescriptions)
        .set({
          status: 'Finalized',
          finalizedAt: new Date(),
          finalizedBy: user.id,
          updatedAt: new Date(),
        })
        .where(eq(prescriptions.id, id))
        .returning();

      await writePrescriptionAudit(
        db,
        user,
        id,
        finalized.prescriptionNumber,
        'FINALIZE_PRESCRIPTION',
        `Finalized ${finalized.prescriptionNumber}; record is now locked.`
      );

      await logAudit(
        user,
        'FINALIZE_PRESCRIPTION',
        `Prescription ${finalized.prescriptionNumber}`,
        'Finalized and locked dental prescription'
      );

      const [hydrated] = await hydratePrescriptionsList([finalized]);
      res.json(hydrated);
    } catch (error) {
      console.error('Error finalizing prescription:', error);
      res.status(500).json({ error: 'Failed to finalize prescription' });
    }
  }
);

// Revise a Finalized Prescription (Preserves original as 'Revised' + stores snapshot + creates new Draft revision)
prescriptionsRouter.post(
  '/prescriptions/:id/revise',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid prescription ID' });

      const { revisionReason } = req.body;
      const [existing] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
      if (!existing) return res.status(404).json({ error: 'Prescription not found' });

      const user = req.user!;
      const isSuper = user.role === 'main_doctor' || user.role === 'developer';
      if (!isSuper && existing.doctorId !== user.id) {
        return res.status(403).json({
          error: 'Permission denied. Doctors can only revise their own finalized prescriptions.',
        });
      }

      if (existing.status === 'Draft') {
        return res.status(400).json({
          error: 'Draft prescriptions can be edited directly without creating a revision.',
        });
      }

      if (existing.status === 'Revised') {
        return res.status(400).json({
          error: 'This prescription version has already been superseded by a newer revision.',
        });
      }

      const result = await db.transaction(async (tx) => {
        const [origMeds, origPlans, origTests, origCustomSections] = await Promise.all([
          tx
            .select()
            .from(prescriptionMedicines)
            .where(eq(prescriptionMedicines.prescriptionId, existing.id))
            .orderBy(asc(prescriptionMedicines.sortOrder), asc(prescriptionMedicines.id)),
          tx
            .select()
            .from(prescriptionTreatmentPlans)
            .where(eq(prescriptionTreatmentPlans.prescriptionId, existing.id))
            .orderBy(asc(prescriptionTreatmentPlans.sortOrder), asc(prescriptionTreatmentPlans.id)),
          tx
            .select()
            .from(prescriptionAdvisedTests)
            .where(eq(prescriptionAdvisedTests.prescriptionId, existing.id))
            .orderBy(asc(prescriptionAdvisedTests.sortOrder), asc(prescriptionAdvisedTests.id)),
          tx
            .select()
            .from(prescriptionCustomSections)
            .where(eq(prescriptionCustomSections.prescriptionId, existing.id))
            .orderBy(asc(prescriptionCustomSections.sortOrder), asc(prescriptionCustomSections.id)),
        ]);

        const nextRevNum = (existing.revisionNumber || 1) + 1;
        const newRxNumber = await generateRevisionNumber(tx, existing.prescriptionNumber, nextRevNum);
        const rootId = existing.rootPrescriptionId || existing.id;

        // Mark original finalized prescription as 'Revised' (preserved permanently)
        await tx
          .update(prescriptions)
          .set({
            status: 'Revised',
            updatedAt: new Date(),
          })
          .where(eq(prescriptions.id, existing.id));

        // Create new Draft revision linked to original & root
        const [revisedRx] = await tx
          .insert(prescriptions)
          .values({
            prescriptionNumber: newRxNumber,
            patientId: existing.patientId,
            doctorId: isSuper ? existing.doctorId : user.id,
            visitId: existing.visitId,
            parentPrescriptionId: existing.id,
            rootPrescriptionId: rootId,
            revisionNumber: nextRevNum,
            status: 'Draft',
            prescriptionDate: new Date().toISOString().split('T')[0],
            chiefComplaints: existing.chiefComplaints,
            clinicalFindings: existing.clinicalFindings,
            diagnosis: existing.diagnosis,
            treatmentPlan: existing.treatmentPlan,
            showPlanCosts: existing.showPlanCosts,
            syncToPatientRecords: existing.syncToPatientRecords,
            followUpDate: existing.followUpDate,
            oralHygieneInstructions: existing.oralHygieneInstructions,
            toothBrushingInstructions: existing.toothBrushingInstructions,
            mouthwashRecommendations: existing.mouthwashRecommendations,
            postExtractionInstructions: existing.postExtractionInstructions,
            postTreatmentPrecautions: existing.postTreatmentPrecautions,
            dietaryRecommendations: existing.dietaryRecommendations,
            additionalClinicalAdvice: existing.additionalClinicalAdvice,
          })
          .returning();

        const revChildOps: Promise<any>[] = [];

        if (origMeds.length > 0) {
          revChildOps.push(
            tx.insert(prescriptionMedicines).values(
              origMeds.map((m, idx) => ({
                prescriptionId: revisedRx.id,
                medicineId: m.medicineId ?? null,
                sortOrder: idx + 1,
                medicineName: m.medicineName,
                genericName: m.genericName,
                strength: m.strength,
                dosageType: m.dosageType ?? null,
                manufacturer: m.manufacturer ?? null,
                packageMark: m.packageMark ?? null,
                dosage: m.dosage,
                frequency: m.frequency,
                duration: m.duration,
                quantity: m.quantity,
                mealInstructions: m.mealInstructions,
                additionalNotes: m.additionalNotes,
              }))
            )
          );
        }

        if (origPlans.length > 0) {
          revChildOps.push(
            tx.insert(prescriptionTreatmentPlans).values(
              origPlans.map((p, idx) => ({
                prescriptionId: revisedRx.id,
                sortOrder: idx + 1,
                treatmentName: p.treatmentName,
                toothNumber: p.toothNumber,
                cost: p.cost,
                notes: p.notes,
              }))
            )
          );
        }

        if (origTests.length > 0) {
          revChildOps.push(
            tx.insert(prescriptionAdvisedTests).values(
              origTests.map((t, idx) => ({
                prescriptionId: revisedRx.id,
                sortOrder: idx + 1,
                testName: t.testName,
                category: t.category,
                cost: t.cost,
                notes: t.notes,
              }))
            )
          );
        }

        if (origCustomSections.length > 0) {
          revChildOps.push(
            tx.insert(prescriptionCustomSections).values(
              origCustomSections.map((s, idx) => ({
                prescriptionId: revisedRx.id,
                sortOrder: idx + 1,
                heading: s.heading,
                content: s.content,
              }))
            )
          );
        }

        // Transfer synced central clinical history rows to the new revision so it never double-bills
        revChildOps.push(
          tx
            .update(treatments)
            .set({ sourcePrescriptionId: revisedRx.id })
            .where(eq(treatments.sourcePrescriptionId, existing.id)),
          tx
            .update(diagnosticTests)
            .set({ sourcePrescriptionId: revisedRx.id })
            .where(eq(diagnosticTests.sourcePrescriptionId, existing.id)),
          tx.insert(prescriptionRevisions).values({
            prescriptionId: revisedRx.id,
            previousPrescriptionId: existing.id,
            revisionNumber: nextRevNum,
            revisionReason: revisionReason?.trim() || 'Clinical adjustment / revision created',
            snapshotJson: JSON.stringify({
              prescription: existing,
              medicines: origMeds,
              treatmentPlanItems: origPlans,
              advisedTests: origTests,
              customSections: origCustomSections,
            }),
            createdBy: user.id,
          }),
          writePrescriptionAudit(
            tx,
            user,
            existing.id,
            existing.prescriptionNumber,
            'SUPERSEDED_BY_REVISION',
            `Marked ${existing.prescriptionNumber} as Revised -> new revision ${revisedRx.prescriptionNumber} (v${nextRevNum}). Reason: ${revisionReason || 'Clinical update'}`
          ),
          writePrescriptionAudit(
            tx,
            user,
            revisedRx.id,
            revisedRx.prescriptionNumber,
            'CREATE_REVISION',
            `Created Revision v${nextRevNum} (${revisedRx.prescriptionNumber}) from ${existing.prescriptionNumber}.`
          )
        );

        await Promise.all(revChildOps);

        return revisedRx;
      });

      logAudit(
        user,
        'REVISE_PRESCRIPTION',
        `Prescription ${existing.prescriptionNumber} -> ${result.prescriptionNumber}`,
        revisionReason?.trim() || `Created Revision v${result.revisionNumber}`
      ).catch((e) => console.error('Audit log error:', e));

      const [hydrated] = await hydratePrescriptionsList([result]);
      res.status(201).json(hydrated);
    } catch (error) {
      console.error('Error creating prescription revision:', error);
      res.status(500).json({ error: 'Failed to create prescription revision' });
    }
  }
);

// Clone Previous Prescription as a New Independent Draft Template (Associated with current/chosen Visit)
prescriptionsRouter.post(
  '/prescriptions/:id/clone',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid prescription ID' });

      const { visitId } = req.body;
      const [source] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
      if (!source) return res.status(404).json({ error: 'Source prescription not found' });

      const user = req.user!;

      // Determine target visit (auto-create new visit by default when omitted or 'auto')
      const shouldAutoCreateVisit =
        visitId === undefined ||
        visitId === null ||
        String(visitId).trim() === '' ||
        String(visitId).trim().toLowerCase() === 'auto';

      let explicitVisitId: number | null = null;
      if (!shouldAutoCreateVisit) {
        const parsed = parseInt(String(visitId), 10);
        const [vst] = await db.select().from(visits).where(eq(visits.id, parsed));
        if (!vst || vst.patientId !== source.patientId) {
          return res.status(400).json({ error: 'Selected visit does not belong to this patient.' });
        }
        explicitVisitId = vst.id;
      }

      const cloned = await db.transaction(async (tx) => {
        const todayStr = new Date().toISOString().split('T')[0];
        let targetVisitId = explicitVisitId;

        if (!targetVisitId) {
          const generatedVisitCode = await generateUniqueVisitCode(tx);
          const nowTime = new Date().toTimeString().slice(0, 5);
          const [autoVisit] = await tx
            .insert(visits)
            .values({
              visitId: generatedVisitCode,
              patientId: source.patientId,
              doctorId: user.id,
              visitDate: todayStr,
              visitTime: nowTime,
              complaints: source.chiefComplaints || null,
              diagnosis: source.diagnosis || null,
              notes: `Auto-created from Prescription template ${source.prescriptionNumber}`,
              nextFollowUpDate: null,
              totalTreatmentCost: '0.00',
              totalTestCost: '0.00',
              additionalCharges: '0.00',
              discount: '0.00',
              totalCost: '0.00',
              amountPaid: '0.00',
              outstandingDue: '0.00',
              status: 'Completed',
            })
            .returning();
          targetVisitId = autoVisit.id;
        }

        const [sourceMeds, sourcePlans, sourceTests, sourceCustomSections] = await Promise.all([
          tx
            .select()
            .from(prescriptionMedicines)
            .where(eq(prescriptionMedicines.prescriptionId, source.id))
            .orderBy(asc(prescriptionMedicines.sortOrder), asc(prescriptionMedicines.id)),
          tx
            .select()
            .from(prescriptionTreatmentPlans)
            .where(eq(prescriptionTreatmentPlans.prescriptionId, source.id))
            .orderBy(asc(prescriptionTreatmentPlans.sortOrder), asc(prescriptionTreatmentPlans.id)),
          tx
            .select()
            .from(prescriptionAdvisedTests)
            .where(eq(prescriptionAdvisedTests.prescriptionId, source.id))
            .orderBy(asc(prescriptionAdvisedTests.sortOrder), asc(prescriptionAdvisedTests.id)),
          tx
            .select()
            .from(prescriptionCustomSections)
            .where(eq(prescriptionCustomSections.prescriptionId, source.id))
            .orderBy(asc(prescriptionCustomSections.sortOrder), asc(prescriptionCustomSections.id)),
        ]);

        const newNumber = await generateUniquePrescriptionNumber(tx);

        const [inserted] = await tx
          .insert(prescriptions)
          .values({
            prescriptionNumber: newNumber,
            patientId: source.patientId,
            doctorId: user.id,
            visitId: targetVisitId,
            templateSourceId: source.id,
            revisionNumber: 1,
            status: 'Draft',
            prescriptionDate: todayStr,
            chiefComplaints: source.chiefComplaints,
            clinicalFindings: source.clinicalFindings,
            diagnosis: source.diagnosis,
            treatmentPlan: source.treatmentPlan,
            showPlanCosts: source.showPlanCosts,
            followUpDate: null,
            oralHygieneInstructions: source.oralHygieneInstructions,
            toothBrushingInstructions: source.toothBrushingInstructions,
            mouthwashRecommendations: source.mouthwashRecommendations,
            postExtractionInstructions: source.postExtractionInstructions,
            postTreatmentPrecautions: source.postTreatmentPrecautions,
            dietaryRecommendations: source.dietaryRecommendations,
            additionalClinicalAdvice: source.additionalClinicalAdvice,
          })
          .returning();

        if (sourceMeds.length > 0) {
          await tx.insert(prescriptionMedicines).values(
            sourceMeds.map((m, idx) => ({
              prescriptionId: inserted.id,
              medicineId: m.medicineId ?? null,
              sortOrder: idx + 1,
              medicineName: m.medicineName,
              genericName: m.genericName,
              strength: m.strength,
              dosageType: m.dosageType ?? null,
              manufacturer: m.manufacturer ?? null,
              packageMark: m.packageMark ?? null,
              dosage: m.dosage,
              frequency: m.frequency,
              duration: m.duration,
              quantity: null,
              mealInstructions: m.mealInstructions,
              additionalNotes: m.additionalNotes,
            }))
          );
        }

        if (sourcePlans.length > 0) {
          await tx.insert(prescriptionTreatmentPlans).values(
            sourcePlans.map((p, idx) => ({
              prescriptionId: inserted.id,
              sortOrder: idx + 1,
              treatmentName: p.treatmentName,
              toothNumber: p.toothNumber,
              cost: p.cost,
              notes: p.notes,
            }))
          );
        }

        if (sourceTests.length > 0) {
          await tx.insert(prescriptionAdvisedTests).values(
            sourceTests.map((t, idx) => ({
              prescriptionId: inserted.id,
              sortOrder: idx + 1,
              testName: t.testName,
              category: t.category,
              cost: t.cost,
              notes: t.notes,
            }))
          );
        }

        if (sourceCustomSections.length > 0) {
          await tx.insert(prescriptionCustomSections).values(
            sourceCustomSections.map((s, idx) => ({
              prescriptionId: inserted.id,
              sortOrder: idx + 1,
              heading: s.heading,
              content: s.content,
            }))
          );
        }

        await writePrescriptionAudit(
          tx,
          user,
          inserted.id,
          inserted.prescriptionNumber,
          'CLONE_PRESCRIPTION_TEMPLATE',
          `Created new draft ${inserted.prescriptionNumber} using ${source.prescriptionNumber} as template.`
        );

        return inserted;
      });

      await logAudit(
        user,
        'CLONE_PRESCRIPTION_TEMPLATE',
        `Prescription ${cloned.prescriptionNumber} (from ${source.prescriptionNumber})`,
        `Cloned previous prescription into new draft for Visit ID ${cloned.visitId}`
      );

      const [hydrated] = await hydratePrescriptionsList([cloned]);
      res.status(201).json(hydrated);
    } catch (error) {
      console.error('Error cloning prescription template:', error);
      res.status(500).json({ error: 'Failed to create prescription from template' });
    }
  }
);

// Delete Draft Prescription ONLY (Finalized & Revised cannot be deleted)
prescriptionsRouter.delete(
  '/prescriptions/:id',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid prescription ID' });

      const [existing] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
      if (!existing) return res.status(404).json({ error: 'Prescription not found' });

      const user = req.user!;
      const isSuper = user.role === 'main_doctor' || user.role === 'developer';
      if (!isSuper && existing.doctorId !== user.id) {
        return res.status(403).json({
          error: 'Permission denied. Doctors can only delete their own draft prescriptions.',
        });
      }

      if (existing.status !== 'Draft') {
        return res.status(403).json({
          error: 'Finalized or revised prescriptions cannot be deleted to preserve medical records.',
        });
      }

      await db.transaction(async (tx) => {
        await tx.delete(treatments).where(eq(treatments.sourcePrescriptionId, id));
        await tx.delete(diagnosticTests).where(eq(diagnosticTests.sourcePrescriptionId, id));
        await writePrescriptionAudit(
          tx,
          user,
          null,
          existing.prescriptionNumber,
          'DELETE_PRESCRIPTION_DRAFT',
          `Deleted draft prescription ${existing.prescriptionNumber}.`
        );
        await tx.delete(prescriptions).where(eq(prescriptions.id, id));
        await recalculatePatientFinancials(existing.patientId, tx);
      });

      logAudit(
        user,
        'DELETE_PRESCRIPTION_DRAFT',
        `Prescription ${existing.prescriptionNumber}`,
        'Deleted draft prescription and removed synced treatment/test items'
      ).catch((e) => console.error('Audit log error:', e));

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting draft prescription:', error);
      res.status(500).json({ error: 'Failed to delete draft prescription' });
    }
  }
);

// Log PDF Download or Print Action for Audit Trail
prescriptionsRouter.post(
  '/prescriptions/:id/log-export',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid prescription ID' });

      const { mode } = req.body; // 'pdf' | 'print'
      const [existing] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
      if (!existing) return res.status(404).json({ error: 'Prescription not found' });

      const action = mode === 'print' ? 'PRINT_PRESCRIPTION' : 'DOWNLOAD_PRESCRIPTION_PDF';
      await writePrescriptionAudit(
        db,
        req.user!,
        existing.id,
        existing.prescriptionNumber,
        action,
        `${req.user!.fullName} triggered ${mode === 'print' ? 'print' : 'A4 PDF download'} for ${existing.prescriptionNumber}.`
      );

      await logAudit(
        req.user,
        action,
        `Prescription ${existing.prescriptionNumber}`,
        `${mode === 'print' ? 'Printed' : 'Downloaded A4 PDF of'} prescription`
      );

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to record export log' });
    }
  }
);

// Generate & Download A4 PDF with embedded Noto Sans + Noto Sans Bengali fonts
prescriptionsRouter.get(
  '/prescriptions/:id/pdf',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid prescription ID' });

      const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
      if (!rx) return res.status(404).json({ error: 'Prescription not found' });

      const [hydrated] = await hydratePrescriptionsList([rx]);
      const clinic = await getClinicProfileSettings();
      const fullRx = { ...hydrated, clinic };

      const pdfBuffer = await generatePrescriptionPdfBuffer(fullRx);

      await writePrescriptionAudit(
        db,
        req.user!,
        rx.id,
        rx.prescriptionNumber,
        'DOWNLOAD_PRESCRIPTION_PDF',
        `${req.user!.fullName} downloaded A4 PDF (Bangla+English Unicode) for ${rx.prescriptionNumber}.`
      );

      await logAudit(
        req.user,
        'DOWNLOAD_PRESCRIPTION_PDF',
        `Prescription ${rx.prescriptionNumber}`,
        'Generated and downloaded A4 prescription PDF'
      );

      const cleanPatient = (hydrated.patientName || 'Patient').replace(/[^a-zA-Z0-9_-]+/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${rx.prescriptionNumber}_${cleanPatient}.pdf"`
      );
      res.setHeader('Cache-Control', 'no-store');
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('Error generating prescription PDF:', error);
      res.status(500).json({ error: error.message || 'Failed to generate prescription PDF' });
    }
  }
);

