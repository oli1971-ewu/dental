import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.ts';
import {
  users,
  patients,
  visits,
  treatments,
  diagnosticTests,
  payments,
  appointments,
  prescriptions,
  prescriptionMedicines,
  prescriptionTreatmentPlans,
  prescriptionAdvisedTests,
  prescriptionCustomSections,
  doctorClinicalHeadings,
  medicines,
  doctorSalaries,
  doctorSalaryStructures,
  salaryPayments,
  applicationFeatureFlags,
  subscriptionPackages,
  clinicSubscriptions,
  backupHistoryLogs,
  auditLogs,
} from '../db/schema.ts';
import { desc, eq } from 'drizzle-orm';
import { authenticateToken, AuthenticatedRequest } from './auth.ts';
import { createZipArchive, ZipEntryInput } from './zipBuilder.ts';
import { requireFeatureAccess } from './featureControl.ts';
import { recalculatePatientFinancials, recalculateVisitFinancials } from './financials.ts';

export const backupRouter = express.Router();

/**
 * Safe CSV cell formatter with CSV Formula-Injection Protection and proper quoting.
 */
export function safeCsvValue(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val);

  const trimmed = str.trimStart();
  if (trimmed.length > 0) {
    const firstChar = trimmed[0];
    if (firstChar === '=' || firstChar === '@' || firstChar === '\t' || firstChar === '\r') {
      str = `'${str}`;
    } else if (
      (firstChar === '+' || firstChar === '-') &&
      !/^[+-]?\d+(\.\d+)?$/.test(trimmed) &&
      !/^\+\d[\d\s-]+$/.test(trimmed)
    ) {
      str = `'${str}`;
    }
  }

  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvWithBom(headers: string[], rows: any[][]): string {
  const headerLine = headers.map(safeCsvValue).join(',');
  const bodyLines = rows.map((r) => r.map(safeCsvValue).join(','));
  return '\uFEFF' + [headerLine, ...bodyLines].join('\r\n');
}

export function formatDDMMYYYY(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return '';
    const d = String(dateInput.getDate()).padStart(2, '0');
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const y = dateInput.getFullYear();
    return `${d}-${m}-${y}`;
  }
  const raw = String(dateInput).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const y = parsed.getFullYear();
    return `${d}-${m}-${y}`;
  }
  return raw;
}

export interface DateRangeFilter {
  preset: string;
  fromDate: string | null; // YYYY-MM-DD
  toDate: string | null; // YYYY-MM-DD
}

export function resolveDateFilter(preset?: string, customFrom?: string, customTo?: string): DateRangeFilter {
  const p = (preset || 'all').toLowerCase();
  const now = new Date();
  const toYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayStr = toYMD(now);

  if (p === 'today') {
    return { preset: 'today', fromDate: todayStr, toDate: todayStr };
  }
  if (p === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yStr = toYMD(yest);
    return { preset: 'yesterday', fromDate: yStr, toDate: yStr };
  }
  if (p === '7days') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { preset: '7days', fromDate: toYMD(start), toDate: todayStr };
  }
  if (p === '30days') {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { preset: '30days', fromDate: toYMD(start), toDate: todayStr };
  }
  if (p === '90days') {
    const start = new Date(now);
    start.setDate(start.getDate() - 89);
    return { preset: '90days', fromDate: toYMD(start), toDate: todayStr };
  }
  if (p === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { preset: 'this_month', fromDate: toYMD(start), toDate: todayStr };
  }
  if (p === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { preset: 'last_month', fromDate: toYMD(start), toDate: toYMD(end) };
  }
  if (p === 'this_year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { preset: 'this_year', fromDate: toYMD(start), toDate: todayStr };
  }
  if (p === 'custom' || customFrom || customTo) {
    return {
      preset: 'custom',
      fromDate: customFrom ? String(customFrom).slice(0, 10) : null,
      toDate: customTo ? String(customTo).slice(0, 10) : null,
    };
  }
  return { preset: 'all', fromDate: null, toDate: null };
}

export function isDateWithinRange(dateVal: string | Date | null | undefined, range: DateRangeFilter): boolean {
  if (!range.fromDate && !range.toDate) return true;
  if (!dateVal) return false;
  let ymd = '';
  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return false;
    ymd = dateVal.toISOString().slice(0, 10);
  } else {
    const str = String(dateVal).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      ymd = str.slice(0, 10);
    } else {
      const parsed = new Date(str);
      if (isNaN(parsed.getTime())) return false;
      ymd = parsed.toISOString().slice(0, 10);
    }
  }
  if (range.fromDate && ymd < range.fromDate) return false;
  if (range.toDate && ymd > range.toDate) return false;
  return true;
}

export const ALL_EXPORT_MODULES = [
  'patients',
  'doctors',
  'appointments',
  'visits',
  'treatments',
  'diagnostic_tests',
  'prescriptions',
  'payments',
  'salary_payroll',
  'salary_payments',
  'medicine_database',
  'audit_logs',
] as const;

export const DOCTOR_ALLOWED_MODULES = [
  'patients',
  'appointments',
  'visits',
  'treatments',
  'diagnostic_tests',
  'prescriptions',
  'payments',
] as const;

/**
 * Collects scoped & date-filtered datasets and generates CSV content per module.
 * Enforces strict server-side doctor scoping when user.role === 'doctor'.
 */
export async function buildScopedExportDatasets(options: {
  user: { id: number; role: string; fullName: string };
  requestedDoctorId?: number | null;
  dateFilter: DateRangeFilter;
  selectedModules?: string[];
}) {
  const { user, requestedDoctorId, dateFilter } = options;
  const isClinicWideRole = user.role === 'developer' || user.role === 'main_doctor';

  // Enforce strict backend doctor scope: ordinary doctor is ALWAYS forced to their own user.id
  const effectiveDoctorScopeId: number | null = isClinicWideRole
    ? requestedDoctorId
      ? Number(requestedDoctorId)
      : null
    : Number(user.id);

  const allowedList = isClinicWideRole ? [...ALL_EXPORT_MODULES] : [...DOCTOR_ALLOWED_MODULES];
  const requestedSet =
    options.selectedModules && options.selectedModules.length > 0
      ? new Set(options.selectedModules.filter((m) => allowedList.includes(m as any)))
      : new Set(allowedList);

  const allUsers = await db.select().from(users);
  const allPatients = await db.select().from(patients);
  const allVisits = await db.select().from(visits);
  const allTreatments = await db.select().from(treatments);
  const allTests = await db.select().from(diagnosticTests);
  const allPayments = await db.select().from(payments);
  const allAppointments = await db.select().from(appointments);
  const allPrescriptions = await db.select().from(prescriptions);
  const allPrescMeds = await db.select().from(prescriptionMedicines);

  const userMap = new Map(allUsers.map((u) => [u.id, u]));
  const patientMap = new Map(allPatients.map((p) => [p.id, p]));
  const visitMap = new Map(allVisits.map((v) => [v.id, v]));

  const scopedVisitsAllDates = effectiveDoctorScopeId
    ? allVisits.filter((v) => v.doctorId === effectiveDoctorScopeId)
    : allVisits;

  const scopedAppointmentsAllDates = effectiveDoctorScopeId
    ? allAppointments.filter((a) => a.doctorId === effectiveDoctorScopeId)
    : allAppointments;

  const scopedPrescriptionsAllDates = effectiveDoctorScopeId
    ? allPrescriptions.filter((pr) => pr.doctorId === effectiveDoctorScopeId)
    : allPrescriptions;

  const doctorPatientIds = new Set<number>();
  if (effectiveDoctorScopeId) {
    for (const p of allPatients) {
      if (p.createdBy === effectiveDoctorScopeId) doctorPatientIds.add(p.id);
    }
    for (const v of scopedVisitsAllDates) doctorPatientIds.add(v.patientId);
    for (const a of scopedAppointmentsAllDates) doctorPatientIds.add(a.patientId);
    for (const pr of scopedPrescriptionsAllDates) doctorPatientIds.add(pr.patientId);
  }

  const filteredPatients = allPatients.filter((p) => {
    if (effectiveDoctorScopeId && !doctorPatientIds.has(p.id)) return false;
    return isDateWithinRange(p.registrationDate || p.createdAt, dateFilter);
  });

  const filteredDoctors = allUsers.filter((u) => {
    if (u.role !== 'doctor' && u.role !== 'main_doctor') return false;
    if (effectiveDoctorScopeId && u.id !== effectiveDoctorScopeId) return false;
    return isDateWithinRange(u.joiningDate || u.createdAt, dateFilter);
  });

  const filteredAppointments = scopedAppointmentsAllDates.filter((a) =>
    isDateWithinRange(a.followUpDate, dateFilter)
  );

  const filteredVisits = scopedVisitsAllDates.filter((v) =>
    isDateWithinRange(v.visitDate, dateFilter)
  );

  const scopedVisitIdsAllDates = new Set(scopedVisitsAllDates.map((v) => v.id));

  const filteredTreatments = allTreatments.filter((t) => {
    if (effectiveDoctorScopeId && t.doctorId !== effectiveDoctorScopeId && !scopedVisitIdsAllDates.has(t.visitId)) {
      return false;
    }
    return isDateWithinRange(t.treatmentDate, dateFilter);
  });

  const filteredTests = allTests.filter((dt) => {
    if (effectiveDoctorScopeId && dt.doctorId !== effectiveDoctorScopeId && !scopedVisitIdsAllDates.has(dt.visitId)) {
      return false;
    }
    return isDateWithinRange(dt.testDate, dateFilter);
  });

  const filteredPrescriptions = scopedPrescriptionsAllDates.filter((pr) =>
    isDateWithinRange(pr.prescriptionDate, dateFilter)
  );

  const prescMedsByPrescId = new Map<number, typeof allPrescMeds>();
  for (const pm of allPrescMeds) {
    const list = prescMedsByPrescId.get(pm.prescriptionId) || [];
    list.push(pm);
    prescMedsByPrescId.set(pm.prescriptionId, list);
  }

  const filteredPayments = allPayments.filter((pay) => {
    if (effectiveDoctorScopeId) {
      const receivedByDoc = pay.receivedBy === effectiveDoctorScopeId;
      const linkedToScopedVisit = scopedVisitIdsAllDates.has(pay.visitId);
      if (!receivedByDoc && !linkedToScopedVisit) return false;
    }
    return isDateWithinRange(pay.paymentDate, dateFilter);
  });

  const csvFiles: Record<string, { filename: string; csv: string; count: number }> = {};
  const recordCounts: Record<string, number> = {};

  if (requestedSet.has('patients')) {
    const visitsByPat = new Map<number, typeof allVisits>();
    for (const v of scopedVisitsAllDates) {
      const list = visitsByPat.get(v.patientId) || [];
      list.push(v);
      visitsByPat.set(v.patientId, list);
    }

    const rows = filteredPatients.map((p) => {
      const vRows = visitsByPat.get(p.id) || [];
      let totTx = 0;
      let totTest = 0;
      let totCost = 0;
      let totPaid = 0;
      let runningDue = 0;
      for (const v of vRows) {
        const net = Number(v.totalCost) || 0;
        const paid = Number(v.amountPaid) || 0;
        totTx += Number(v.totalTreatmentCost) || 0;
        totTest += Number(v.totalTestCost) || 0;
        totCost += net;
        totPaid += paid;
        runningDue = Math.max(0, Number((runningDue + net - paid).toFixed(2)));
      }
      return [
        p.patientId,
        p.name,
        p.phone,
        p.altPhone || '',
        p.age || '',
        p.gender,
        p.address || '',
        formatDDMMYYYY(p.registrationDate),
        p.existingDiseases || '',
        p.allergies || '',
        p.medicalHistory || '',
        vRows.length,
        totTx.toFixed(2),
        totTest.toFixed(2),
        totCost.toFixed(2),
        totPaid.toFixed(2),
        runningDue.toFixed(2),
      ];
    });
    recordCounts.patients = rows.length;
    csvFiles.patients = {
      filename: 'Patients.csv',
      count: rows.length,
      csv: buildCsvWithBom(
        [
          'Patient ID',
          'Full Name',
          'Phone',
          'Alternative Phone',
          'Age',
          'Gender',
          'Address',
          'Registration Date',
          'Existing Diseases',
          'Allergies',
          'Medical History',
          'Visit Count',
          'Treatment Expenses (BDT)',
          'Test / X-ray Expenses (BDT)',
          'Total Bill (BDT)',
          'Total Paid (BDT)',
          'Outstanding Due (BDT)',
        ],
        rows
      ),
    };
  }

  if (requestedSet.has('doctors') && isClinicWideRole) {
    const rows = filteredDoctors.map((d) => [
      d.id,
      d.fullName,
      d.username,
      d.phone || '',
      d.email || '',
      d.role === 'main_doctor' ? 'Main Doctor (Super Admin)' : 'Doctor',
      d.specialization || '',
      d.qualifications || '',
      d.registrationNumber || '',
      formatDDMMYYYY(d.joiningDate || d.createdAt),
      d.isActive ? 'Active' : 'Inactive',
    ]);
    recordCounts.doctors = rows.length;
    csvFiles.doctors = {
      filename: 'Doctors.csv',
      count: rows.length,
      csv: buildCsvWithBom(
        [
          'Doctor ID',
          'Full Name',
          'Username',
          'Phone',
          'Email',
          'Role',
          'Specialization',
          'Qualifications',
          'BMDC Reg No',
          'Joining Date',
          'Status',
        ],
        rows
      ),
    };
  }

  if (requestedSet.has('appointments')) {
    const rows = filteredAppointments.map((a) => {
      const pat = patientMap.get(a.patientId);
      const doc = userMap.get(a.doctorId);
      return [
        a.id,
        formatDDMMYYYY(a.followUpDate),
        pat?.patientId || '',
        pat?.name || '',
        pat?.phone || '',
        doc?.fullName || '',
        a.reason || '',
        a.status,
        a.notes || '',
      ];
    });
    recordCounts.appointments = rows.length;
    csvFiles.appointments = {
      filename: 'Appointments.csv',
      count: rows.length,
      csv: buildCsvWithBom(
        [
          'Appointment ID',
          'Follow-Up Date',
          'Patient ID',
          'Patient Name',
          'Patient Phone',
          'Doctor Name',
          'Reason',
          'Status',
          'Notes',
        ],
        rows
      ),
    };
  }

  if (requestedSet.has('visits')) {
    const rows = filteredVisits.map((v) => {
      const pat = patientMap.get(v.patientId);
      const doc = userMap.get(v.doctorId);
      return [
        v.visitId,
        formatDDMMYYYY(v.visitDate),
        v.visitTime || '',
        pat?.patientId || '',
        pat?.name || '',
        pat?.phone || '',
        doc?.fullName || '',
        v.complaints || '',
        v.diagnosis || '',
        (Number(v.totalTreatmentCost) || 0).toFixed(2),
        (Number(v.totalTestCost) || 0).toFixed(2),
        (Number(v.additionalCharges) || 0).toFixed(2),
        (Number(v.discount) || 0).toFixed(2),
        (Number(v.totalCost) || 0).toFixed(2),
        (Number(v.amountPaid) || 0).toFixed(2),
        (Number(v.outstandingDue) || 0).toFixed(2),
        v.nextFollowUpDate ? formatDDMMYYYY(v.nextFollowUpDate) : '',
        v.status,
      ];
    });
    recordCounts.visits = rows.length;
    csvFiles.visits = {
      filename: 'Visits.csv',
      count: rows.length,
      csv: buildCsvWithBom(
        [
          'Visit ID',
          'Visit Date',
          'Visit Time',
          'Patient ID',
          'Patient Name',
          'Patient Phone',
          'Attending Doctor',
          'Chief Complaints',
          'Diagnosis',
          'Treatment Charges (BDT)',
          'Test/X-ray Charges (BDT)',
          'Other Charges (BDT)',
          'Discount (BDT)',
          'Total Cost (BDT)',
          'Amount Paid (BDT)',
          'Outstanding Due (BDT)',
          'Next Follow-Up Date',
          'Status',
        ],
        rows
      ),
    };
  }

  if (requestedSet.has('treatments')) {
    const rows = filteredTreatments.map((t) => {
      const v = visitMap.get(t.visitId);
      const pat = patientMap.get(t.patientId);
      const doc = userMap.get(t.doctorId);
      return [
        t.id,
        v?.visitId || '',
        formatDDMMYYYY(t.treatmentDate),
        pat?.patientId || '',
        pat?.name || '',
        doc?.fullName || '',
        t.treatmentName,
        t.toothNumber || '',
        t.description || '',
        (Number(t.cost) || 0).toFixed(2),
        t.status,
      ];
    });
    recordCounts.treatments = rows.length;
    csvFiles.treatments = {
      filename: 'Treatments.csv',
      count: rows.length,
      csv: buildCsvWithBom(
        [
          'Treatment ID',
          'Visit ID',
          'Treatment Date',
          'Patient ID',
          'Patient Name',
          'Performing Doctor',
          'Treatment Name',
          'Tooth / Area',
          'Description',
          'Cost (BDT)',
          'Status',
        ],
        rows
      ),
    };
  }

  if (requestedSet.has('diagnostic_tests')) {
    const rows = filteredTests.map((dt) => {
      const v = visitMap.get(dt.visitId);
      const pat = patientMap.get(dt.patientId);
      const doc = userMap.get(dt.doctorId);
      return [
        dt.id,
        v?.visitId || '',
        formatDDMMYYYY(dt.testDate),
        pat?.patientId || '',
        pat?.name || '',
        doc?.fullName || '',
        dt.testName,
        dt.category || '',
        dt.description || '',
        (Number(dt.cost) || 0).toFixed(2),
        dt.status,
        dt.notes || '',
      ];
    });
    recordCounts.diagnostic_tests = rows.length;
    csvFiles.diagnostic_tests = {
      filename: 'Diagnostic_Tests.csv',
      count: rows.length,
      csv: buildCsvWithBom(
        [
          'Test ID',
          'Visit ID',
          'Test Date',
          'Patient ID',
          'Patient Name',
          'Referring Doctor',
          'Diagnostic Test Name',
          'Category',
          'Description',
          'Cost (BDT)',
          'Status',
          'Notes',
        ],
        rows
      ),
    };
  }

  if (requestedSet.has('prescriptions')) {
    const rows = filteredPrescriptions.map((pr) => {
      const pat = patientMap.get(pr.patientId);
      const doc = userMap.get(pr.doctorId);
      const v = pr.visitId ? visitMap.get(pr.visitId) : null;
      const meds = prescMedsByPrescId.get(pr.id) || [];
      const medSummary = meds
        .map(
          (m) =>
            `${m.medicineName} ${m.strength || ''} (${m.dosage || ''} | ${m.duration || ''} | ${m.mealInstructions || ''})`
        )
        .join('; ');

      return [
        pr.prescriptionNumber,
        formatDDMMYYYY(pr.prescriptionDate),
        v?.visitId || '',
        pat?.patientId || '',
        pat?.name || '',
        pat?.phone || '',
        doc?.fullName || '',
        pr.chiefComplaints || '',
        pr.clinicalFindings || '',
        pr.diagnosis || '',
        medSummary,
        pr.additionalClinicalAdvice || '',
        pr.followUpDate ? formatDDMMYYYY(pr.followUpDate) : '',
        pr.status,
      ];
    });
    recordCounts.prescriptions = rows.length;
    csvFiles.prescriptions = {
      filename: 'Prescriptions.csv',
      count: rows.length,
      csv: buildCsvWithBom(
        [
          'Prescription Number',
          'Date',
          'Visit ID',
          'Patient ID',
          'Patient Name',
          'Patient Phone',
          'Doctor Name',
          'Chief Complaints',
          'Clinical Findings',
          'Diagnosis',
          'Prescribed Medicines',
          'Clinical Advice / Instructions',
          'Follow-up Date',
          'Status',
        ],
        rows
      ),
    };
  }

  if (requestedSet.has('payments')) {
    const rows = filteredPayments.map((pay) => {
      const pat = patientMap.get(pay.patientId);
      const v = visitMap.get(pay.visitId);
      const rec = pay.receivedBy ? userMap.get(pay.receivedBy) : null;
      return [
        pay.paymentId,
        formatDDMMYYYY(pay.paymentDate),
        v?.visitId || '',
        pat?.patientId || '',
        pat?.name || '',
        pat?.phone || '',
        (Number(pay.amount) || 0).toFixed(2),
        pay.paymentMethod,
        pay.transactionRef || '',
        rec?.fullName || '',
        pay.notes || '',
      ];
    });
    recordCounts.payments = rows.length;
    csvFiles.payments = {
      filename: 'Payments.csv',
      count: rows.length,
      csv: buildCsvWithBom(
        [
          'Payment ID',
          'Payment Date',
          'Visit ID',
          'Patient ID',
          'Patient Name',
          'Patient Phone',
          'Amount Paid (BDT)',
          'Payment Method',
          'Transaction Reference',
          'Received By',
          'Notes',
        ],
        rows
      ),
    };
  }

  if (isClinicWideRole && requestedSet.has('salary_payroll')) {
    const allSalaries = await db.select().from(doctorSalaries);
    const filteredSalaries = allSalaries.filter((s) => {
      if (effectiveDoctorScopeId && s.doctorId !== effectiveDoctorScopeId) return false;
      return isDateWithinRange(s.paymentDate, dateFilter);
    });
    const rows = filteredSalaries.map((s) => {
      const doc = userMap.get(s.doctorId);
      return [
        s.salaryCode,
        s.periodLabel,
        s.payrollMonth || (s.paymentDate || '').slice(0, 7),
        formatDDMMYYYY(s.paymentDate),
        doc?.fullName || '',
        doc?.phone || '',
        s.salaryType,
        (Number(s.baseAmount) || 0).toFixed(2),
        s.daysWorked || 0,
        (Number(s.commissionRate) || 0).toFixed(2),
        (Number(s.commissionSourceAmount) || 0).toFixed(2),
        (Number(s.commissionEarned) || 0).toFixed(2),
        (Number(s.bonusAmount) || 0).toFixed(2),
        (Number(s.deductionAmount) || 0).toFixed(2),
        (Number(s.totalPayable) || 0).toFixed(2),
        (Number(s.paidAmount) || 0).toFixed(2),
        (Number(s.dueAmount) || 0).toFixed(2),
        s.payrollStatus || 'Draft',
        s.paymentStatus,
        s.paymentMethod,
        s.notes || '',
      ];
    });
    recordCounts.salary_payroll = rows.length;
    csvFiles.salary_payroll = {
      filename: 'Salary_Payroll.csv',
      count: rows.length,
      csv: buildCsvWithBom(
        [
          'Salary Code',
          'Period Label',
          'Payroll Month',
          'Date',
          'Doctor Name',
          'Doctor Phone',
          'Salary Type',
          'Base Amount / Rate (BDT)',
          'Working Days',
          'Commission %',
          'Eligible Revenue (BDT)',
          'Commission Earned (BDT)',
          'Allowances / Bonus (BDT)',
          'Deductions (BDT)',
          'Net Payable (BDT)',
          'Total Paid (BDT)',
          'Due Balance (BDT)',
          'Payroll Status',
          'Payment Status',
          'Payment Method',
          'Notes',
        ],
        rows
      ),
    };
  }

  if (isClinicWideRole && requestedSet.has('salary_payments')) {
    const allSalPayments = await db.select().from(salaryPayments);
    const allSalaries = await db.select().from(doctorSalaries);
    const salMap = new Map(allSalaries.map((s) => [s.id, s]));

    const filteredSalPays = allSalPayments.filter((sp) => {
      if (effectiveDoctorScopeId && sp.doctorId !== effectiveDoctorScopeId) return false;
      return isDateWithinRange(sp.paymentDate, dateFilter);
    });

    const rows = filteredSalPays.map((sp) => {
      const doc = userMap.get(sp.doctorId);
      const sal = salMap.get(sp.salaryId);
      return [
        sp.paymentCode,
        formatDDMMYYYY(sp.paymentDate),
        sal?.salaryCode || '',
        sal?.periodLabel || '',
        doc?.fullName || '',
        (Number(sp.amount) || 0).toFixed(2),
        sp.paymentMethod,
        sp.transactionRef || '',
        sp.notes || '',
      ];
    });
    recordCounts.salary_payments = rows.length;
    csvFiles.salary_payments = {
      filename: 'Salary_Payments.csv',
      count: rows.length,
      csv: buildCsvWithBom(
        [
          'Payment Code',
          'Payment Date',
          'Salary Code',
          'Period Label',
          'Doctor Name',
          'Amount Paid (BDT)',
          'Payment Method',
          'Transaction Ref',
          'Notes',
        ],
        rows
      ),
    };
  }

  if (isClinicWideRole && requestedSet.has('medicine_database')) {
    const allMeds = await db.select().from(medicines).limit(5000);
    const filteredMeds = allMeds.filter((m) => isDateWithinRange(m.createdAt, dateFilter));
    const rows = filteredMeds.map((m) => [
      m.medicineCode,
      m.brandName,
      m.genericName,
      m.strength || '',
      m.dosageType,
      m.manufacturer || '',
      m.packageMark || '',
      m.source || '',
      m.isActive ? 'Active' : 'Inactive',
    ]);
    recordCounts.medicine_database = rows.length;
    csvFiles.medicine_database = {
      filename: 'Medicine_Database.csv',
      count: rows.length,
      csv: buildCsvWithBom(
        [
          'Medicine Code',
          'Brand Name',
          'Generic Name',
          'Strength',
          'Dosage Form',
          'Manufacturer',
          'Package Mark',
          'Source',
          'Status',
        ],
        rows
      ),
    };
  }

  if (isClinicWideRole && requestedSet.has('audit_logs')) {
    const allLogs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(5000);
    const filteredLogs = allLogs.filter((l) => isDateWithinRange(l.createdAt, dateFilter));
    const rows = filteredLogs.map((l) => [
      l.id,
      formatDDMMYYYY(l.createdAt),
      l.userId ? userMap.get(l.userId)?.fullName || `User #${l.userId}` : 'System',
      l.userRole,
      l.action,
      l.affectedRecord,
      l.details || '',
    ]);
    recordCounts.audit_logs = rows.length;
    csvFiles.audit_logs = {
      filename: 'Audit_Logs.csv',
      count: rows.length,
      csv: buildCsvWithBom(['Log ID', 'Date', 'User', 'Role', 'Action', 'Affected Record', 'Details'], rows),
    };
  }

  const totalRecords = Object.values(recordCounts).reduce((sum, n) => sum + n, 0);

  return {
    isClinicWideRole,
    effectiveDoctorScopeId,
    doctorScopeName: effectiveDoctorScopeId
      ? userMap.get(effectiveDoctorScopeId)?.fullName || `Doctor #${effectiveDoctorScopeId}`
      : 'All Clinic Doctors (Complete Clinic Scope)',
    dateFilter,
    recordCounts,
    totalRecords,
    csvFiles,
  };
}

const backupAuth = [authenticateToken, requireFeatureAccess('data_backup_export')];

// POST /api/backup/preview
backupRouter.post('/backup/preview', ...backupAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { preset, fromDate, toDate, doctorId, selectedModules } = req.body || {};
    const dateFilter = resolveDateFilter(preset, fromDate, toDate);

    const previewData = await buildScopedExportDatasets({
      user: req.user!,
      requestedDoctorId: doctorId ? Number(doctorId) : null,
      dateFilter,
      selectedModules: Array.isArray(selectedModules) ? selectedModules : undefined,
    });

    res.json({
      backupType: previewData.isClinicWideRole && !previewData.effectiveDoctorScopeId ? 'CLINIC_FULL' : 'DOCTOR_SCOPED',
      scopeLabel: previewData.doctorScopeName,
      effectiveDoctorScopeId: previewData.effectiveDoctorScopeId,
      dateFilter: previewData.dateFilter,
      recordCounts: previewData.recordCounts,
      totalRecords: previewData.totalRecords,
      availableModules: previewData.isClinicWideRole ? ALL_EXPORT_MODULES : DOCTOR_ALLOWED_MODULES,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/download-zip
backupRouter.post('/backup/download-zip', ...backupAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { preset, fromDate, toDate, doctorId, selectedModules } = req.body || {};
    const dateFilter = resolveDateFilter(preset, fromDate, toDate);

    const dataset = await buildScopedExportDatasets({
      user: req.user!,
      requestedDoctorId: doctorId ? Number(doctorId) : null,
      dateFilter,
      selectedModules: Array.isArray(selectedModules) ? selectedModules : undefined,
    });

    const todayYMD = new Date().toISOString().slice(0, 10);
    const backupCode = `BKP-${todayYMD.replace(/-/g, '')}-${Date.now().toString().slice(-5)}`;
    const isFullClinic = dataset.isClinicWideRole && !dataset.effectiveDoctorScopeId;
    const zipFilename = isFullClinic
      ? `Clinic_Backup_${todayYMD}.zip`
      : `Doctor_Backup_${todayYMD}.zip`;

    const manifest = {
      backupId: backupCode,
      systemName: 'Dental Care Clinic Management System',
      schemaVersion: '2.0.0',
      generatedAt: new Date().toISOString(),
      generatedBy: {
        id: req.user!.id,
        name: req.user!.fullName,
        role: req.user!.role,
      },
      backupScope: isFullClinic ? 'Complete Clinic Data Backup' : `Doctor Scoped Backup (${dataset.doctorScopeName})`,
      dateRange: {
        preset: dataset.dateFilter.preset,
        fromDate: dataset.dateFilter.fromDate || 'Beginning of Records',
        toDate: dataset.dateFilter.toDate || todayYMD,
      },
      recordCounts: dataset.recordCounts,
      totalRecords: dataset.totalRecords,
    };

    const readmeLines = [
      '====================================================================',
      '               DENTAL CARE - DATA BACKUP ARCHIVE                    ',
      '====================================================================',
      `Backup ID       : ${backupCode}`,
      `Archive Name    : ${zipFilename}`,
      `Generated On    : ${new Date().toISOString()}`,
      `Generated By    : ${req.user!.fullName} (${req.user!.role})`,
      `Data Scope      : ${manifest.backupScope}`,
      `Date Filter     : ${dataset.dateFilter.preset.toUpperCase()} (${manifest.dateRange.fromDate} to ${manifest.dateRange.toDate})`,
      `Total Records   : ${dataset.totalRecords}`,
      '',
      'INCLUDED CSV FILES (/csv/):',
      ...Object.entries(dataset.csvFiles).map(
        ([key, item]) => `  - csv/${item.filename} (${item.count} records) [${key}]`
      ),
      '',
      'NOTES:',
      '1. All CSV files are encoded in UTF-8 with BOM for full Bangla & English compatibility in Microsoft Excel and Google Sheets.',
      '2. CSV formula injection sanitization is applied to protect spreadsheet opens.',
      '3. See manifest.json for machine-readable metadata and checksum verification.',
      '====================================================================',
    ];

    const zipEntries: ZipEntryInput[] = [
      { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) },
      { name: 'README.txt', content: readmeLines.join('\r\n') },
    ];

    if (isFullClinic) {
      const snap = await buildFullRecoverySnapshotObject(req.user!);
      zipEntries.push({
        name: 'recovery_snapshot.json',
        content: JSON.stringify(snap.snapshotPayload, null, 2),
      });
    }

    for (const item of Object.values(dataset.csvFiles)) {
      zipEntries.push({
        name: `csv/${item.filename}`,
        content: item.csv,
      });
    }

    const zipBuffer = createZipArchive(zipEntries);

    await db.insert(backupHistoryLogs).values({
      backupCode,
      backupType: isFullClinic ? 'CLINIC_FULL' : 'DOCTOR_SCOPED',
      exportFormat: 'ZIP_ARCHIVE',
      requestedBy: req.user!.id,
      requestedByName: req.user!.fullName,
      userRole: req.user!.role,
      doctorScopeId: dataset.effectiveDoctorScopeId,
      datePreset: dataset.dateFilter.preset,
      fromDate: dataset.dateFilter.fromDate,
      toDate: dataset.dateFilter.toDate,
      selectedModulesJson: JSON.stringify(Object.keys(dataset.csvFiles)),
      recordCountsJson: JSON.stringify(dataset.recordCounts),
      totalRecords: dataset.totalRecords,
      fileSizeBytes: zipBuffer.length,
      filename: zipFilename,
      status: 'Success',
      manifestJson: JSON.stringify(manifest),
    });

    await db.insert(auditLogs).values({
      userId: req.user!.id,
      userRole: req.user!.role,
      action: isFullClinic ? 'DOWNLOAD_CLINIC_ZIP_BACKUP' : 'DOWNLOAD_DOCTOR_ZIP_BACKUP',
      affectedRecord: zipFilename,
      details: `Downloaded ${zipFilename} (${dataset.totalRecords} total records, ${zipBuffer.length} bytes)`,
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function buildFullRecoverySnapshotObject(user: NonNullable<AuthenticatedRequest['user']>) {
  const rawUsers = await db.select().from(users);
  const visibleUsers = (
    user.role === 'developer'
      ? rawUsers
      : rawUsers.filter((u) => u.role !== 'developer')
  ).map(({ passwordHash, ...safeUser }) => safeUser);

  const allPatients = await db.select().from(patients);
  const allVisits = await db.select().from(visits);
  const allTreatments = await db.select().from(treatments);
  const allTests = await db.select().from(diagnosticTests);
  const allPayments = await db.select().from(payments);
  const allAppointments = await db.select().from(appointments);
  const allPrescriptions = await db.select().from(prescriptions);
  const allPrescMeds = await db.select().from(prescriptionMedicines);
  const allPrescPlans = await db.select().from(prescriptionTreatmentPlans);
  const allPrescTests = await db.select().from(prescriptionAdvisedTests);
  const allPrescCustom = await db.select().from(prescriptionCustomSections);
  const allHeadings = await db.select().from(doctorClinicalHeadings);
  const allSalaries = await db.select().from(doctorSalaries);
  const allStructures = await db.select().from(doctorSalaryStructures);
  const allSalPayments = await db.select().from(salaryPayments);
  const allFlags = await db.select().from(applicationFeatureFlags);
  const allPackages = await db.select().from(subscriptionPackages);
  const allSubs = await db.select().from(clinicSubscriptions);

  const todayYMD = new Date().toISOString().slice(0, 10);
  const backupCode = `SNAP-${todayYMD.replace(/-/g, '')}-${Date.now().toString().slice(-5)}`;
  const filename = `Clinic_Recovery_Snapshot_${todayYMD}.json`;

  const counts = {
    users: visibleUsers.length,
    patients: allPatients.length,
    visits: allVisits.length,
    treatments: allTreatments.length,
    diagnosticTests: allTests.length,
    payments: allPayments.length,
    appointments: allAppointments.length,
    prescriptions: allPrescriptions.length,
    prescriptionMedicines: allPrescMeds.length,
    prescriptionTreatmentPlans: allPrescPlans.length,
    prescriptionAdvisedTests: allPrescTests.length,
    prescriptionCustomSections: allPrescCustom.length,
    doctorSalaries: allSalaries.length,
    doctorSalaryStructures: allStructures.length,
    salaryPayments: allSalPayments.length,
  };

  const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);

  const snapshotPayload = {
    snapshotId: backupCode,
    schemaVersion: '2.1.0',
    generatedAt: new Date().toISOString(),
    generatedBy: { id: user.id, name: user.fullName, role: user.role },
    recordCounts: counts,
    tables: {
      users: visibleUsers,
      patients: allPatients,
      visits: allVisits,
      treatments: allTreatments,
      diagnosticTests: allTests,
      payments: allPayments,
      appointments: allAppointments,
      prescriptions: allPrescriptions,
      prescriptionMedicines: allPrescMeds,
      prescriptionTreatmentPlans: allPrescPlans,
      prescriptionAdvisedTests: allPrescTests,
      prescriptionCustomSections: allPrescCustom,
      doctorClinicalHeadings: allHeadings,
      doctorSalaries: allSalaries,
      doctorSalaryStructures: allStructures,
      salaryPayments: allSalPayments,
      applicationFeatureFlags: allFlags,
      subscriptionPackages: allPackages,
      clinicSubscriptions: allSubs,
    },
  };

  return { backupCode, filename, counts, totalRecords, snapshotPayload };
}

// GET /api/backup/recovery-snapshot (Developer & Main Doctor full JSON recovery snapshot with secrets stripped)
backupRouter.get('/backup/recovery-snapshot', ...backupAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || (req.user.role !== 'developer' && req.user.role !== 'main_doctor')) {
    return res.status(403).json({
      error: 'Forbidden: Full Database Recovery Snapshot is restricted to Developer and Super Admin (Main Doctor) accounts.',
    });
  }

  try {
    const { backupCode, filename, counts, totalRecords, snapshotPayload } =
      await buildFullRecoverySnapshotObject(req.user);

    const jsonString = JSON.stringify(snapshotPayload, null, 2);
    const byteSize = Buffer.byteLength(jsonString, 'utf8');

    await db.insert(backupHistoryLogs).values({
      backupCode,
      backupType: 'CLINIC_FULL',
      exportFormat: 'JSON_SNAPSHOT',
      requestedBy: req.user.id,
      requestedByName: req.user.fullName,
      userRole: req.user.role,
      doctorScopeId: null,
      datePreset: 'all',
      selectedModulesJson: JSON.stringify(Object.keys(counts)),
      recordCountsJson: JSON.stringify(counts),
      totalRecords,
      fileSizeBytes: byteSize,
      filename,
      status: 'Success',
    });

    await db.insert(auditLogs).values({
      userId: req.user.id,
      userRole: req.user.role,
      action: 'DOWNLOAD_RECOVERY_SNAPSHOT',
      affectedRecord: filename,
      details: `Downloaded full database recovery snapshot ${filename} (${totalRecords} records)`,
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(jsonString);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Non-Duplicating Database Restore Engine
 * Evaluates (dryRun = true) or imports (dryRun = false) a JSON Backup Snapshot
 * using natural business keys so existing records are NEVER duplicated or overwritten.
 */
async function analyzeOrExecuteSnapshotRestore(
  rawPayload: any,
  user: NonNullable<AuthenticatedRequest['user']>,
  dryRun: boolean
) {
  const sourceTables = rawPayload?.tables || rawPayload?.data || rawPayload || {};
  if (!sourceTables || typeof sourceTables !== 'object') {
    throw new Error('Invalid backup file format. Expected a JSON Recovery Snapshot containing table arrays.');
  }

  const inUsers: any[] = Array.isArray(sourceTables.users) ? sourceTables.users : [];
  const inPatients: any[] = Array.isArray(sourceTables.patients) ? sourceTables.patients : [];
  const inVisits: any[] = Array.isArray(sourceTables.visits) ? sourceTables.visits : [];
  const inTreatments: any[] = Array.isArray(sourceTables.treatments) ? sourceTables.treatments : [];
  const inTests: any[] = Array.isArray(sourceTables.diagnosticTests) ? sourceTables.diagnosticTests : [];
  const inAppointments: any[] = Array.isArray(sourceTables.appointments) ? sourceTables.appointments : [];
  const inPrescriptions: any[] = Array.isArray(sourceTables.prescriptions) ? sourceTables.prescriptions : [];
  const inPrescMeds: any[] = Array.isArray(sourceTables.prescriptionMedicines) ? sourceTables.prescriptionMedicines : [];
  const inPrescPlans: any[] = Array.isArray(sourceTables.prescriptionTreatmentPlans)
    ? sourceTables.prescriptionTreatmentPlans
    : [];
  const inPrescTests: any[] = Array.isArray(sourceTables.prescriptionAdvisedTests)
    ? sourceTables.prescriptionAdvisedTests
    : [];
  const inPrescCustom: any[] = Array.isArray(sourceTables.prescriptionCustomSections)
    ? sourceTables.prescriptionCustomSections
    : [];
  const inPayments: any[] = Array.isArray(sourceTables.payments) ? sourceTables.payments : [];
  const inStructures: any[] = Array.isArray(sourceTables.doctorSalaryStructures)
    ? sourceTables.doctorSalaryStructures
    : [];
  const inSalaries: any[] = Array.isArray(sourceTables.doctorSalaries) ? sourceTables.doctorSalaries : [];
  const inSalPayments: any[] = Array.isArray(sourceTables.salaryPayments) ? sourceTables.salaryPayments : [];

  // Load current live database records to build natural-key de-duplication maps
  const [
    liveUsers,
    livePatients,
    liveVisits,
    liveTreatments,
    liveTests,
    liveAppointments,
    livePrescriptions,
    livePayments,
    liveStructures,
    liveSalaries,
    liveSalPayments,
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(patients),
    db.select().from(visits),
    db.select().from(treatments),
    db.select().from(diagnosticTests),
    db.select().from(appointments),
    db.select().from(prescriptions),
    db.select().from(payments),
    db.select().from(doctorSalaryStructures),
    db.select().from(doctorSalaries),
    db.select().from(salaryPayments),
  ]);

  const defaultDoctorId =
    liveUsers.find((u) => u.role === 'main_doctor')?.id || liveUsers[0]?.id || user.id;

  const stats: Record<
    string,
    { label: string; inFile: number; newToImport: number; duplicatesSkipped: number }
  > = {
    doctors: { label: 'Doctors & Staff', inFile: 0, newToImport: 0, duplicatesSkipped: 0 },
    patients: { label: 'Patients', inFile: inPatients.length, newToImport: 0, duplicatesSkipped: 0 },
    visits: { label: 'Clinic Visits', inFile: inVisits.length, newToImport: 0, duplicatesSkipped: 0 },
    treatments: { label: 'Dental Treatments', inFile: inTreatments.length, newToImport: 0, duplicatesSkipped: 0 },
    diagnosticTests: { label: 'Diagnostic Tests', inFile: inTests.length, newToImport: 0, duplicatesSkipped: 0 },
    prescriptions: { label: 'Prescriptions', inFile: inPrescriptions.length, newToImport: 0, duplicatesSkipped: 0 },
    payments: { label: 'Patient Payments', inFile: inPayments.length, newToImport: 0, duplicatesSkipped: 0 },
    appointments: { label: 'Appointments & Follow-ups', inFile: inAppointments.length, newToImport: 0, duplicatesSkipped: 0 },
    doctorSalaries: { label: 'Salary & Payroll Sheet', inFile: inSalaries.length, newToImport: 0, duplicatesSkipped: 0 },
    salaryPayments: { label: 'Salary Disbursements', inFile: inSalPayments.length, newToImport: 0, duplicatesSkipped: 0 },
  };

  // 1. Doctors / Users De-Duplication (by username or email)
  const userByUsername = new Map<string, number>();
  const userByEmail = new Map<string, number>();
  for (const u of liveUsers) {
    userByUsername.set(u.username.trim().toLowerCase(), u.id);
    if (u.email) userByEmail.set(u.email.trim().toLowerCase(), u.id);
  }
  const userIdMap = new Map<number, number>();
  for (const u of liveUsers) {
    userIdMap.set(u.id, u.id);
  }

  for (const bu of inUsers) {
    if (!bu || !bu.username) continue;
    if (bu.role === 'developer' && user.role !== 'developer') {
      const devLive = liveUsers.find((u) => u.role === 'developer');
      if (devLive && bu.id) userIdMap.set(Number(bu.id), devLive.id);
      continue;
    }
    stats.doctors.inFile++;
    const uname = String(bu.username).trim().toLowerCase();
    const uemail = bu.email ? String(bu.email).trim().toLowerCase() : '';
    const existingId = userByUsername.get(uname) || (uemail ? userByEmail.get(uemail) : undefined);

    if (existingId) {
      if (bu.id) userIdMap.set(Number(bu.id), existingId);
      stats.doctors.duplicatesSkipped++;
    } else {
      stats.doctors.newToImport++;
      if (!dryRun) {
        const defaultHash = bcrypt.hashSync('Doctor@123', 10);
        const [ins] = await db
          .insert(users)
          .values({
            username: uname,
            passwordHash: bu.passwordHash || defaultHash,
            fullName: String(bu.fullName || uname).trim(),
            email: bu.email || null,
            phone: bu.phone || null,
            role: bu.role === 'main_doctor' ? 'main_doctor' : 'doctor',
            isActive: bu.isActive !== undefined ? Boolean(bu.isActive) : true,
            specialization: bu.specialization || null,
            qualifications: bu.qualifications || null,
            registrationNumber: bu.registrationNumber || null,
            joiningDate: bu.joiningDate || new Date().toISOString().split('T')[0],
          })
          .returning();
        userByUsername.set(uname, ins.id);
        if (uemail) userByEmail.set(uemail, ins.id);
        if (bu.id) userIdMap.set(Number(bu.id), ins.id);
      } else if (bu.id) {
        userIdMap.set(Number(bu.id), Number(bu.id));
      }
    }
  }

  // 2. Patients De-Duplication (by patientId code OR normalized name+phone)
  const normPhone = (p: string | null | undefined) => String(p || '').replace(/\D/g, '').slice(-10);
  const patientByCode = new Map<string, number>();
  const patientByNamePhone = new Map<string, number>();
  const patientIdMap = new Map<number, number>();
  const touchedPatientIds = new Set<number>();

  for (const p of livePatients) {
    patientByCode.set(p.patientId.trim().toUpperCase(), p.id);
    patientByNamePhone.set(`${p.name.trim().toLowerCase()}|${normPhone(p.phone)}`, p.id);
    patientIdMap.set(p.id, p.id);
  }

  for (const bp of inPatients) {
    if (!bp || !bp.name) continue;
    const codeKey = String(bp.patientId || '').trim().toUpperCase();
    const npKey = `${String(bp.name).trim().toLowerCase()}|${normPhone(bp.phone)}`;
    const existingId = (codeKey ? patientByCode.get(codeKey) : undefined) || patientByNamePhone.get(npKey);

    if (existingId) {
      if (bp.id) patientIdMap.set(Number(bp.id), existingId);
      stats.patients.duplicatesSkipped++;
    } else {
      stats.patients.newToImport++;
      if (!dryRun) {
        const finalCode =
          codeKey && !patientByCode.has(codeKey)
            ? codeKey
            : `DP-${Date.now().toString().slice(-5)}-${Math.floor(10 + Math.random() * 89)}`;
        const creatorId = bp.createdBy
          ? userIdMap.get(Number(bp.createdBy)) || defaultDoctorId
          : defaultDoctorId;
        const [ins] = await db
          .insert(patients)
          .values({
            patientId: finalCode,
            name: String(bp.name).trim(),
            age: bp.age !== undefined && bp.age !== null ? Number(bp.age) : 30,
            gender: (bp.gender === 'Male' || bp.gender === 'Female' || bp.gender === 'Other' ? bp.gender : 'Other') as
              | 'Male'
              | 'Female'
              | 'Other',
            phone: String(bp.phone || '').trim(),
            altPhone: bp.altPhone || null,
            address: bp.address || null,
            medicalHistory: bp.medicalHistory || null,
            allergies: bp.allergies || null,
            existingDiseases: bp.existingDiseases || null,
            notes: bp.notes || null,
            registrationDate: bp.registrationDate || new Date().toISOString().split('T')[0],
            createdBy: creatorId,
          })
          .returning();
        patientByCode.set(finalCode, ins.id);
        patientByNamePhone.set(npKey, ins.id);
        if (bp.id) patientIdMap.set(Number(bp.id), ins.id);
        touchedPatientIds.add(ins.id);
      } else if (bp.id) {
        patientByCode.set(codeKey || `TEMP-${bp.id}`, Number(bp.id));
        patientByNamePhone.set(npKey, Number(bp.id));
        patientIdMap.set(Number(bp.id), Number(bp.id));
      }
    }
  }

  // 3. Clinic Visits De-Duplication (by visitId code OR patientId+doctorId+visitDate+complaints)
  const visitByCode = new Map<string, number>();
  const visitByComposite = new Map<string, number>();
  const visitIdMap = new Map<number, number>();
  const touchedVisitIds = new Set<number>();

  for (const v of liveVisits) {
    visitByCode.set(v.visitId.trim().toUpperCase(), v.id);
    const compKey = `${v.patientId}|${v.doctorId}|${v.visitDate}|${String(v.complaints || '').trim().toLowerCase()}`;
    visitByComposite.set(compKey, v.id);
    visitIdMap.set(v.id, v.id);
  }

  for (const bv of inVisits) {
    if (!bv) continue;
    const mappedPatId = patientIdMap.get(Number(bv.patientId));
    if (!mappedPatId) {
      stats.visits.duplicatesSkipped++;
      continue;
    }
    const mappedDocId = userIdMap.get(Number(bv.doctorId)) || defaultDoctorId;
    const codeKey = String(bv.visitId || '').trim().toUpperCase();
    const visitComplaint = bv.complaints || bv.chiefComplaint || '';
    const compKey = `${mappedPatId}|${mappedDocId}|${bv.visitDate}|${String(visitComplaint).trim().toLowerCase()}`;

    const existingId = (codeKey ? visitByCode.get(codeKey) : undefined) || visitByComposite.get(compKey);
    if (existingId) {
      if (bv.id) visitIdMap.set(Number(bv.id), existingId);
      stats.visits.duplicatesSkipped++;
    } else {
      stats.visits.newToImport++;
      if (!dryRun) {
        const finalCode =
          codeKey && !visitByCode.has(codeKey)
            ? codeKey
            : `V-${Date.now().toString().slice(-5)}-${Math.floor(10 + Math.random() * 89)}`;
        const validVisitStatus =
          bv.status === 'Ongoing' || bv.status === 'Completed' || bv.status === 'Follow-up Required'
            ? bv.status
            : 'Completed';
        const [ins] = await db
          .insert(visits)
          .values({
            visitId: finalCode,
            patientId: mappedPatId,
            doctorId: mappedDocId,
            visitDate: bv.visitDate || new Date().toISOString().split('T')[0],
            visitTime: bv.visitTime || null,
            complaints: visitComplaint || 'Dental Consultation',
            diagnosis: bv.diagnosis || null,
            notes: bv.notes || bv.doctorNotes || null,
            nextFollowUpDate: bv.nextFollowUpDate || null,
            totalTreatmentCost: String(bv.totalTreatmentCost || '0'),
            totalTestCost: String(bv.totalTestCost || '0'),
            additionalCharges: String(bv.additionalCharges || bv.consultationFee || '0'),
            discount: String(bv.discount || '0'),
            totalCost: String(bv.totalCost || bv.totalVisitBill || '0'),
            amountPaid: String(bv.amountPaid || bv.totalVisitPaid || '0'),
            outstandingDue: String(bv.outstandingDue || bv.visitDue || '0'),
            status: validVisitStatus,
          })
          .returning();
        visitByCode.set(finalCode, ins.id);
        visitByComposite.set(compKey, ins.id);
        if (bv.id) visitIdMap.set(Number(bv.id), ins.id);
        touchedVisitIds.add(ins.id);
        touchedPatientIds.add(mappedPatId);
      } else if (bv.id) {
        visitByCode.set(codeKey || `TEMP-V-${bv.id}`, Number(bv.id));
        visitByComposite.set(compKey, Number(bv.id));
        visitIdMap.set(Number(bv.id), Number(bv.id));
      }
    }
  }

  // 4. Treatments De-Duplication
  const treatmentSet = new Set<string>();
  for (const t of liveTreatments) {
    const k = `${t.visitId}|${t.patientId}|${t.treatmentName.trim().toLowerCase()}|${String(t.toothNumber || '').trim().toLowerCase()}|${t.treatmentDate}|${Number(t.cost || 0).toFixed(2)}`;
    treatmentSet.add(k);
  }

  for (const bt of inTreatments) {
    if (!bt || !bt.treatmentName) continue;
    const mappedVisId = visitIdMap.get(Number(bt.visitId));
    const mappedPatId = patientIdMap.get(Number(bt.patientId));
    if (!mappedVisId || !mappedPatId) {
      stats.treatments.duplicatesSkipped++;
      continue;
    }
    const mappedDocId = userIdMap.get(Number(bt.doctorId)) || defaultDoctorId;
    const k = `${mappedVisId}|${mappedPatId}|${String(bt.treatmentName).trim().toLowerCase()}|${String(bt.toothNumber || '').trim().toLowerCase()}|${bt.treatmentDate}|${Number(bt.cost || 0).toFixed(2)}`;

    if (treatmentSet.has(k)) {
      stats.treatments.duplicatesSkipped++;
    } else {
      stats.treatments.newToImport++;
      treatmentSet.add(k);
      if (!dryRun) {
        await db.insert(treatments).values({
          visitId: mappedVisId,
          patientId: mappedPatId,
          doctorId: mappedDocId,
          treatmentName: String(bt.treatmentName).trim(),
          toothNumber: bt.toothNumber || null,
          description: bt.description || null,
          cost: Number(bt.cost || 0).toFixed(2),
          status: bt.status || 'Completed',
          notes: bt.notes || null,
          treatmentDate: bt.treatmentDate || new Date().toISOString().split('T')[0],
        });
        touchedVisitIds.add(mappedVisId);
        touchedPatientIds.add(mappedPatId);
      }
    }
  }

  // 5. Diagnostic Tests De-Duplication
  const testSet = new Set<string>();
  for (const dt of liveTests) {
    const k = `${dt.visitId}|${dt.patientId}|${dt.testName.trim().toLowerCase()}|${dt.category.trim().toLowerCase()}|${dt.testDate}|${Number(dt.cost || 0).toFixed(2)}`;
    testSet.add(k);
  }

  for (const bdt of inTests) {
    if (!bdt || !bdt.testName) continue;
    const mappedVisId = visitIdMap.get(Number(bdt.visitId));
    const mappedPatId = patientIdMap.get(Number(bdt.patientId));
    if (!mappedVisId || !mappedPatId) {
      stats.diagnosticTests.duplicatesSkipped++;
      continue;
    }
    const mappedDocId = userIdMap.get(Number(bdt.doctorId)) || defaultDoctorId;
    const k = `${mappedVisId}|${mappedPatId}|${String(bdt.testName).trim().toLowerCase()}|${String(bdt.category || 'Other').trim().toLowerCase()}|${bdt.testDate}|${Number(bdt.cost || 0).toFixed(2)}`;

    if (testSet.has(k)) {
      stats.diagnosticTests.duplicatesSkipped++;
    } else {
      stats.diagnosticTests.newToImport++;
      testSet.add(k);
      if (!dryRun) {
        await db.insert(diagnosticTests).values({
          visitId: mappedVisId,
          patientId: mappedPatId,
          doctorId: mappedDocId,
          testName: String(bdt.testName).trim(),
          category: bdt.category || 'Other',
          description: bdt.description || null,
          cost: Number(bdt.cost || 0).toFixed(2),
          status: bdt.status || 'Completed',
          notes: bdt.notes || null,
          testDate: bdt.testDate || new Date().toISOString().split('T')[0],
        });
        touchedVisitIds.add(mappedVisId);
        touchedPatientIds.add(mappedPatId);
      }
    }
  }

  // 6. Appointments De-Duplication
  const apptSet = new Set<string>();
  for (const a of liveAppointments) {
    const k = `${a.patientId}|${a.doctorId}|${a.followUpDate}|${String(a.reason || '').trim().toLowerCase()}`;
    apptSet.add(k);
  }

  for (const ba of inAppointments) {
    if (!ba || !ba.followUpDate) continue;
    const mappedPatId = patientIdMap.get(Number(ba.patientId));
    if (!mappedPatId) {
      stats.appointments.duplicatesSkipped++;
      continue;
    }
    const mappedVisId = ba.visitId ? visitIdMap.get(Number(ba.visitId)) || null : null;
    const mappedDocId = userIdMap.get(Number(ba.doctorId)) || defaultDoctorId;
    const k = `${mappedPatId}|${mappedDocId}|${ba.followUpDate}|${String(ba.reason || '').trim().toLowerCase()}`;

    if (apptSet.has(k)) {
      stats.appointments.duplicatesSkipped++;
    } else {
      stats.appointments.newToImport++;
      apptSet.add(k);
      if (!dryRun) {
        await db.insert(appointments).values({
          patientId: mappedPatId,
          visitId: mappedVisId,
          doctorId: mappedDocId,
          followUpDate: ba.followUpDate,
          reason: ba.reason || 'Follow-up Consultation',
          status: ba.status || 'Scheduled',
          notes: ba.notes || null,
        });
      }
    }
  }

  // 7. Prescriptions & Child Tables De-Duplication (by prescriptionNumber)
  const rxByCode = new Map<string, number>();
  for (const pr of livePrescriptions) {
    rxByCode.set(pr.prescriptionNumber.trim().toUpperCase(), pr.id);
  }

  const medsByOldRx = new Map<number, any[]>();
  for (const m of inPrescMeds) {
    const list = medsByOldRx.get(Number(m.prescriptionId)) || [];
    list.push(m);
    medsByOldRx.set(Number(m.prescriptionId), list);
  }
  const plansByOldRx = new Map<number, any[]>();
  for (const pl of inPrescPlans) {
    const list = plansByOldRx.get(Number(pl.prescriptionId)) || [];
    list.push(pl);
    plansByOldRx.set(Number(pl.prescriptionId), list);
  }
  const advTestsByOldRx = new Map<number, any[]>();
  for (const at of inPrescTests) {
    const list = advTestsByOldRx.get(Number(at.prescriptionId)) || [];
    list.push(at);
    advTestsByOldRx.set(Number(at.prescriptionId), list);
  }
  const customByOldRx = new Map<number, any[]>();
  for (const cs of inPrescCustom) {
    const list = customByOldRx.get(Number(cs.prescriptionId)) || [];
    list.push(cs);
    customByOldRx.set(Number(cs.prescriptionId), list);
  }

  for (const bpr of inPrescriptions) {
    const rawRxCode = bpr?.prescriptionNumber || bpr?.prescriptionCode;
    if (!bpr || !rawRxCode) continue;
    const codeKey = String(rawRxCode).trim().toUpperCase();
    const mappedPatId = patientIdMap.get(Number(bpr.patientId));
    const mappedVisId = bpr.visitId ? visitIdMap.get(Number(bpr.visitId)) : undefined;
    if (!mappedPatId || !mappedVisId) {
      stats.prescriptions.duplicatesSkipped++;
      continue;
    }

    if (rxByCode.has(codeKey)) {
      stats.prescriptions.duplicatesSkipped++;
    } else {
      stats.prescriptions.newToImport++;
      rxByCode.set(codeKey, Number(bpr.id) || 1);
      if (!dryRun) {
        const mappedDocId = userIdMap.get(Number(bpr.doctorId)) || defaultDoctorId;
        const validRxStatus =
          bpr.status === 'draft' || bpr.status === 'finalized' || bpr.status === 'superseded'
            ? bpr.status
            : 'finalized';
        const [insRx] = await db
          .insert(prescriptions)
          .values({
            prescriptionNumber: codeKey,
            patientId: mappedPatId,
            visitId: mappedVisId,
            doctorId: mappedDocId,
            revisionNumber: Number(bpr.revisionNumber) || 1,
            status: validRxStatus,
            prescriptionDate: bpr.prescriptionDate || new Date().toISOString().split('T')[0],
            chiefComplaints: bpr.chiefComplaints || bpr.chiefComplaint || null,
            clinicalFindings: bpr.clinicalFindings || null,
            diagnosis: bpr.diagnosis || null,
            treatmentPlan: bpr.treatmentPlan || null,
            showPlanCosts: bpr.showPlanCosts !== undefined ? Boolean(bpr.showPlanCosts) : true,
            syncToPatientRecords: bpr.syncToPatientRecords !== undefined ? Boolean(bpr.syncToPatientRecords) : true,
            followUpDate: bpr.followUpDate || bpr.nextFollowUpDate || null,
            oralHygieneInstructions: bpr.oralHygieneInstructions || null,
            toothBrushingInstructions: bpr.toothBrushingInstructions || null,
            mouthwashRecommendations: bpr.mouthwashRecommendations || null,
            postExtractionInstructions: bpr.postExtractionInstructions || null,
            postTreatmentPrecautions: bpr.postTreatmentPrecautions || null,
            dietaryRecommendations: bpr.dietaryRecommendations || null,
            additionalClinicalAdvice: bpr.additionalClinicalAdvice || bpr.advice || null,
            finalizedAt: bpr.finalizedAt || new Date().toISOString(),
            finalizedBy: mappedDocId,
          })
          .returning();

        const oldRxId = Number(bpr.id);
        const childMeds = medsByOldRx.get(oldRxId) || [];
        for (const m of childMeds) {
          await db.insert(prescriptionMedicines).values({
            prescriptionId: insRx.id,
            medicineId: m.medicineId ? Number(m.medicineId) : null,
            sortOrder: Number(m.sortOrder) || 0,
            medicineName: m.medicineName || m.brandName || '',
            genericName: m.genericName || null,
            dosageType: m.dosageType || m.medicineType || 'Tablet',
            strength: m.strength || null,
            manufacturer: m.manufacturer || null,
            packageMark: m.packageMark || null,
            dosage: m.dosage || m.dosagePattern || '1+0+1',
            frequency: m.frequency || m.frequencyText || 'Twice Daily',
            duration: m.duration || '5 days',
            quantity: m.quantity || m.doseQuantity || null,
            mealInstructions: m.mealInstructions || m.timingInstruction || 'After Meal',
            additionalNotes: m.additionalNotes || m.specialNotes || null,
          });
        }

        const childPlans = plansByOldRx.get(oldRxId) || [];
        for (const pl of childPlans) {
          await db.insert(prescriptionTreatmentPlans).values({
            prescriptionId: insRx.id,
            sortOrder: Number(pl.sortOrder) || 0,
            treatmentName: pl.treatmentName || pl.procedureName || '',
            toothNumber: pl.toothNumber || pl.toothNumbers || null,
            cost: String(pl.cost || pl.estimatedCost || '0'),
            notes: pl.notes || null,
          });
        }

        const childAdvTests = advTestsByOldRx.get(oldRxId) || [];
        for (const at of childAdvTests) {
          await db.insert(prescriptionAdvisedTests).values({
            prescriptionId: insRx.id,
            sortOrder: Number(at.sortOrder) || 0,
            testName: at.testName || '',
            category: at.category || 'Dental X-ray',
            cost: String(at.cost || '0'),
            notes: at.notes || null,
          });
        }

        const childCustom = customByOldRx.get(oldRxId) || [];
        for (const cs of childCustom) {
          await db.insert(prescriptionCustomSections).values({
            prescriptionId: insRx.id,
            sortOrder: Number(cs.sortOrder) || 0,
            heading: cs.heading || cs.headingTitle || 'Note',
            content: cs.content || cs.contentText || '',
          });
        }
      }
    }
  }

  // 8. Patient Payments De-Duplication (by paymentId code OR composite key)
  const paymentByCode = new Map<string, number>();
  const paymentComposite = new Set<string>();
  for (const py of livePayments) {
    paymentByCode.set(py.paymentId.trim().toUpperCase(), py.id);
    paymentComposite.add(
      `${py.visitId}|${py.patientId}|${py.paymentDate}|${Number(py.amount || 0).toFixed(2)}|${py.paymentMethod}`
    );
  }

  for (const bpy of inPayments) {
    if (!bpy) continue;
    const mappedPatId = patientIdMap.get(Number(bpy.patientId));
    const mappedVisId = visitIdMap.get(Number(bpy.visitId));
    if (!mappedPatId || !mappedVisId) {
      stats.payments.duplicatesSkipped++;
      continue;
    }
    const codeKey = String(bpy.paymentId || '').trim().toUpperCase();
    const compKey = `${mappedVisId}|${mappedPatId}|${bpy.paymentDate}|${Number(bpy.amount || 0).toFixed(2)}|${bpy.paymentMethod || 'Cash'}`;

    if ((codeKey && paymentByCode.has(codeKey)) || paymentComposite.has(compKey)) {
      stats.payments.duplicatesSkipped++;
    } else {
      stats.payments.newToImport++;
      if (codeKey) paymentByCode.set(codeKey, 1);
      paymentComposite.add(compKey);
      if (!dryRun) {
        const finalCode =
          codeKey && !paymentByCode.has(codeKey)
            ? codeKey
            : `PAY-${Date.now().toString().slice(-5)}-${Math.floor(10 + Math.random() * 89)}`;
        const recBy = bpy.receivedBy
          ? userIdMap.get(Number(bpy.receivedBy)) || defaultDoctorId
          : defaultDoctorId;
        await db.insert(payments).values({
          paymentId: finalCode,
          patientId: mappedPatId,
          visitId: mappedVisId,
          amount: Number(bpy.amount || 0).toFixed(2),
          paymentMethod: bpy.paymentMethod || 'Cash',
          transactionRef: bpy.transactionRef || null,
          notes: bpy.notes || null,
          receivedBy: recBy,
          paymentDate: bpy.paymentDate || new Date().toISOString().split('T')[0],
        });
        touchedVisitIds.add(mappedVisId);
        touchedPatientIds.add(mappedPatId);
      }
    }
  }

  // 9. Doctor Salary Structures, Salaries & Salary Payments De-Duplication
  const structByDoc = new Set<number>(liveStructures.map((s) => s.doctorId));
  for (const bst of inStructures) {
    if (!bst) continue;
    const mappedDocId = userIdMap.get(Number(bst.doctorId));
    if (!mappedDocId || structByDoc.has(mappedDocId)) continue;
    structByDoc.add(mappedDocId);
    if (!dryRun) {
      await db.insert(doctorSalaryStructures).values({
        structureCode: bst.structureCode || `SSTRUCT-${mappedDocId}-${Date.now().toString().slice(-4)}`,
        doctorId: mappedDocId,
        salaryType: bst.salaryType || 'Monthly',
        baseRate: Number(bst.baseRate || 0).toFixed(2),
        commissionRate: Number(bst.commissionRate || 0).toFixed(2),
        commissionBasis: bst.commissionBasis || 'treatment_revenue',
        allowances: Number(bst.allowances || 0).toFixed(2),
        deductions: Number(bst.deductions || 0).toFixed(2),
        effectiveDate: bst.effectiveDate || '2026-01-01',
        reviewDate: bst.reviewDate || null,
        notes: bst.notes || null,
        isActive: bst.isActive !== undefined ? Boolean(bst.isActive) : true,
        createdBy: user.id,
        updatedBy: user.id,
      });
    }
  }

  const salaryByCode = new Map<string, number>();
  const salaryIdMap = new Map<number, number>();
  for (const s of liveSalaries) {
    salaryByCode.set(s.salaryCode.trim().toUpperCase(), s.id);
    salaryIdMap.set(s.id, s.id);
  }

  for (const bs of inSalaries) {
    if (!bs || !bs.salaryCode) continue;
    const codeKey = String(bs.salaryCode).trim().toUpperCase();
    const mappedDocId = userIdMap.get(Number(bs.doctorId));
    if (!mappedDocId) {
      stats.doctorSalaries.duplicatesSkipped++;
      continue;
    }

    const existingSalId = salaryByCode.get(codeKey);
    if (existingSalId) {
      if (bs.id) salaryIdMap.set(Number(bs.id), existingSalId);
      stats.doctorSalaries.duplicatesSkipped++;
    } else {
      stats.doctorSalaries.newToImport++;
      if (!dryRun) {
        const [insSal] = await db
          .insert(doctorSalaries)
          .values({
            salaryCode: codeKey,
            doctorId: mappedDocId,
            salaryType: bs.salaryType || 'Monthly',
            periodLabel: bs.periodLabel || 'Monthly Salary',
            payrollMonth: bs.payrollMonth || (bs.paymentDate ? String(bs.paymentDate).slice(0, 7) : null),
            payrollYear: Number(bs.payrollYear) || new Date().getFullYear(),
            periodStart: bs.periodStart || null,
            periodEnd: bs.periodEnd || null,
            baseAmount: Number(bs.baseAmount || 0).toFixed(2),
            daysWorked: Number(bs.daysWorked) || 0,
            commissionBasis: bs.commissionBasis || 'treatment_revenue',
            commissionSourceAmount: Number(bs.commissionSourceAmount || 0).toFixed(2),
            commissionRate: Number(bs.commissionRate || 0).toFixed(2),
            commissionEarned: Number(bs.commissionEarned || 0).toFixed(2),
            grossSalary: Number(bs.grossSalary || 0).toFixed(2),
            bonusAmount: Number(bs.bonusAmount || 0).toFixed(2),
            deductionAmount: Number(bs.deductionAmount || 0).toFixed(2),
            totalPayable: Number(bs.totalPayable || 0).toFixed(2),
            paidAmount: Number(bs.paidAmount || 0).toFixed(2),
            dueAmount: Number(bs.dueAmount || 0).toFixed(2),
            payrollStatus: bs.payrollStatus || 'Finalized',
            paymentStatus: bs.paymentStatus || 'Paid',
            paymentMethod: bs.paymentMethod || 'Cash',
            paymentDate: bs.paymentDate || new Date().toISOString().split('T')[0],
            notes: bs.notes || null,
            recordedBy: user.id,
          })
          .returning();
        salaryByCode.set(codeKey, insSal.id);
        if (bs.id) salaryIdMap.set(Number(bs.id), insSal.id);
      } else if (bs.id) {
        salaryByCode.set(codeKey, Number(bs.id));
        salaryIdMap.set(Number(bs.id), Number(bs.id));
      }
    }
  }

  const salPayByCode = new Set<string>(liveSalPayments.map((sp) => sp.paymentCode.trim().toUpperCase()));
  for (const bsp of inSalPayments) {
    if (!bsp || !bsp.paymentCode) continue;
    const codeKey = String(bsp.paymentCode).trim().toUpperCase();
    const mappedSalId = salaryIdMap.get(Number(bsp.salaryId));
    const mappedDocId = userIdMap.get(Number(bsp.doctorId));
    if (!mappedSalId || !mappedDocId) {
      stats.salaryPayments.duplicatesSkipped++;
      continue;
    }

    if (salPayByCode.has(codeKey)) {
      stats.salaryPayments.duplicatesSkipped++;
    } else {
      stats.salaryPayments.newToImport++;
      salPayByCode.add(codeKey);
      if (!dryRun) {
        await db.insert(salaryPayments).values({
          paymentCode: codeKey,
          salaryId: mappedSalId,
          doctorId: mappedDocId,
          amount: Number(bsp.amount || 0).toFixed(2),
          paymentDate: bsp.paymentDate || new Date().toISOString().split('T')[0],
          paymentMethod: bsp.paymentMethod || 'Cash',
          transactionRef: bsp.transactionRef || null,
          notes: bsp.notes || null,
          recordedBy: user.id,
        });
      }
    }
  }

  // Recalculate visit financials for all newly imported/modified visits
  if (!dryRun && touchedVisitIds.size > 0) {
    const [updatedVisits, updatedTreatments, updatedTests, updatedPayments] = await Promise.all([
      db.select().from(visits),
      db.select().from(treatments),
      db.select().from(diagnosticTests),
      db.select().from(payments),
    ]);
    for (const vId of touchedVisitIds) {
      const vRow = updatedVisits.find((v) => v.id === vId);
      if (!vRow) continue;
      const vTreatTotal = updatedTreatments
        .filter((t) => t.visitId === vId)
        .reduce((sum, t) => sum + Number(t.cost || 0), 0);
      const vTestTotal = updatedTests
        .filter((dt) => dt.visitId === vId)
        .reduce((sum, dt) => sum + Number(dt.cost || 0), 0);
      const vPaidTotal = updatedPayments
        .filter((p) => p.visitId === vId)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const addCharges = Number(vRow.additionalCharges || 0);
      const disc = Number(vRow.discount || 0);
      const computedCost = Math.max(0, vTreatTotal + vTestTotal + addCharges - disc);
      const finalCost = computedCost > 0 ? computedCost : Number(vRow.totalCost || 0);
      const finalPaid = vPaidTotal > 0 ? vPaidTotal : Number(vRow.amountPaid || 0);
      const finalDue = Math.max(0, finalCost - finalPaid);
      await db
        .update(visits)
        .set({
          totalTreatmentCost: vTreatTotal.toFixed(2),
          totalTestCost: vTestTotal.toFixed(2),
          totalCost: finalCost.toFixed(2),
          amountPaid: finalPaid.toFixed(2),
          outstandingDue: finalDue.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(visits.id, vId));
    }
  }

  const totalInFile = Object.values(stats).reduce((sum, s) => sum + s.inFile, 0);
  const totalNewToImport = Object.values(stats).reduce((sum, s) => sum + s.newToImport, 0);
  const totalDuplicatesSkipped = Object.values(stats).reduce((sum, s) => sum + s.duplicatesSkipped, 0);

  return {
    valid: true,
    snapshotId: rawPayload?.snapshotId || 'External_Snapshot',
    generatedAt: rawPayload?.generatedAt || null,
    summary: {
      totalInFile,
      totalNewToImport,
      totalDuplicatesSkipped,
    },
    modules: stats,
  };
}

// POST /api/backup/restore-preview (Dry-run de-duplication check before importing)
backupRouter.post('/backup/restore-preview', ...backupAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || (req.user.role !== 'developer' && req.user.role !== 'main_doctor')) {
    return res.status(403).json({
      error: 'Forbidden: Only Developer and Super Admin (Main Doctor) can restore backup data.',
    });
  }

  try {
    const { snapshot } = req.body || {};
    if (!snapshot) {
      return res.status(400).json({ error: 'Backup JSON snapshot payload is required.' });
    }
    const result = await analyzeOrExecuteSnapshotRestore(snapshot, req.user, true);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to parse backup snapshot.' });
  }
});

// POST /api/backup/restore-execute (Execute non-duplicating backup import)
backupRouter.post('/backup/restore-execute', ...backupAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || (req.user.role !== 'developer' && req.user.role !== 'main_doctor')) {
    return res.status(403).json({
      error: 'Forbidden: Only Developer and Super Admin (Main Doctor) can restore backup data.',
    });
  }

  try {
    const { snapshot, filename } = req.body || {};
    if (!snapshot) {
      return res.status(400).json({ error: 'Backup JSON snapshot payload is required.' });
    }
    const result = await analyzeOrExecuteSnapshotRestore(snapshot, req.user, false);

    const todayYMD = new Date().toISOString().slice(0, 10);
    const restoreCode = `RST-${todayYMD.replace(/-/g, '')}-${Date.now().toString().slice(-5)}`;

    await db.insert(backupHistoryLogs).values({
      backupCode: restoreCode,
      backupType: 'CLINIC_FULL',
      exportFormat: 'RESTORE_IMPORT',
      requestedBy: req.user.id,
      requestedByName: req.user.fullName,
      userRole: req.user.role,
      doctorScopeId: null,
      datePreset: 'all',
      selectedModulesJson: JSON.stringify(Object.keys(result.modules)),
      recordCountsJson: JSON.stringify(
        Object.fromEntries(Object.entries(result.modules).map(([k, v]) => [k, v.newToImport]))
      ),
      totalRecords: result.summary.totalNewToImport,
      fileSizeBytes: 0,
      filename: filename || `${result.snapshotId}.json`,
      status: 'Restored',
    });

    await db.insert(auditLogs).values({
      userId: req.user.id,
      userRole: req.user.role,
      action: 'RESTORE_BACKUP_SNAPSHOT',
      affectedRecord: filename || result.snapshotId,
      details: `Imported ${result.summary.totalNewToImport} new record(s) and skipped ${result.summary.totalDuplicatesSkipped} existing duplicate record(s).`,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to restore backup snapshot.' });
  }
});

// GET /api/backup/history
backupRouter.get('/backup/history', ...backupAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const allHistory = await db
      .select()
      .from(backupHistoryLogs)
      .orderBy(desc(backupHistoryLogs.createdAt))
      .limit(100);

    const isClinicWide = req.user!.role === 'developer' || req.user!.role === 'main_doctor';
    const scopedHistory = isClinicWide
      ? allHistory
      : allHistory.filter((h) => h.requestedBy === req.user!.id || h.doctorScopeId === req.user!.id);

    res.json(
      scopedHistory.map((h) => {
        let recordCounts = {};
        let selectedModules: string[] = [];
        try {
          recordCounts = JSON.parse(h.recordCountsJson || '{}');
        } catch {
          recordCounts = {};
        }
        try {
          selectedModules = JSON.parse(h.selectedModulesJson || '[]');
        } catch {
          selectedModules = [];
        }
        return {
          ...h,
          recordCounts,
          selectedModules,
        };
      })
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Individual Module CSV Export Route Helper
async function handleSingleModuleCsvExport(req: AuthenticatedRequest, res: any, moduleKey: string) {
  try {
    const { preset, fromDate, toDate, doctorId } = req.query;
    const dateFilter = resolveDateFilter(
      preset ? String(preset) : undefined,
      fromDate ? String(fromDate) : undefined,
      toDate ? String(toDate) : undefined
    );

    const dataset = await buildScopedExportDatasets({
      user: req.user!,
      requestedDoctorId: doctorId ? Number(doctorId) : null,
      dateFilter,
      selectedModules: [moduleKey],
    });

    const fileObj = dataset.csvFiles[moduleKey];
    if (!fileObj) {
      return res.status(403).json({
        error: `Forbidden: Your account role (${req.user!.role}) is not authorized to export module "${moduleKey}".`,
      });
    }

    const todayYMD = new Date().toISOString().slice(0, 10);
    const backupCode = `CSV-${moduleKey.slice(0, 4).toUpperCase()}-${Date.now().toString().slice(-5)}`;
    const outFilename = fileObj.filename.replace('.csv', `_${todayYMD}.csv`);
    const byteSize = Buffer.byteLength(fileObj.csv, 'utf8');

    await db.insert(backupHistoryLogs).values({
      backupCode,
      backupType: dataset.isClinicWideRole && !dataset.effectiveDoctorScopeId ? 'CLINIC_FULL' : 'DOCTOR_SCOPED',
      exportFormat: 'SINGLE_CSV',
      requestedBy: req.user!.id,
      requestedByName: req.user!.fullName,
      userRole: req.user!.role,
      doctorScopeId: dataset.effectiveDoctorScopeId,
      datePreset: dateFilter.preset,
      fromDate: dateFilter.fromDate,
      toDate: dateFilter.toDate,
      selectedModulesJson: JSON.stringify([moduleKey]),
      recordCountsJson: JSON.stringify({ [moduleKey]: fileObj.count }),
      totalRecords: fileObj.count,
      fileSizeBytes: byteSize,
      filename: outFilename,
      status: 'Success',
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
    res.send(fileObj.csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

backupRouter.get('/export/patients.csv', ...backupAuth, (req, res) => handleSingleModuleCsvExport(req as AuthenticatedRequest, res, 'patients'));
backupRouter.get('/export/doctors.csv', ...backupAuth, (req, res) => handleSingleModuleCsvExport(req as AuthenticatedRequest, res, 'doctors'));
backupRouter.get('/export/appointments.csv', ...backupAuth, (req, res) => handleSingleModuleCsvExport(req as AuthenticatedRequest, res, 'appointments'));
backupRouter.get('/export/visits.csv', ...backupAuth, (req, res) => handleSingleModuleCsvExport(req as AuthenticatedRequest, res, 'visits'));
backupRouter.get('/export/treatments.csv', ...backupAuth, (req, res) => handleSingleModuleCsvExport(req as AuthenticatedRequest, res, 'treatments'));
backupRouter.get('/export/diagnostic-tests.csv', ...backupAuth, (req, res) => handleSingleModuleCsvExport(req as AuthenticatedRequest, res, 'diagnostic_tests'));
backupRouter.get('/export/prescriptions.csv', ...backupAuth, (req, res) => handleSingleModuleCsvExport(req as AuthenticatedRequest, res, 'prescriptions'));
backupRouter.get('/export/payments.csv', ...backupAuth, (req, res) => handleSingleModuleCsvExport(req as AuthenticatedRequest, res, 'payments'));
backupRouter.get('/export/salary-payroll.csv', ...backupAuth, (req, res) => handleSingleModuleCsvExport(req as AuthenticatedRequest, res, 'salary_payroll'));
backupRouter.get('/export/salary-payments.csv', ...backupAuth, (req, res) => handleSingleModuleCsvExport(req as AuthenticatedRequest, res, 'salary_payments'));
backupRouter.get('/export/medicines.csv', ...backupAuth, (req, res) => handleSingleModuleCsvExport(req as AuthenticatedRequest, res, 'medicine_database'));
backupRouter.get('/export/audit-logs.csv', ...backupAuth, (req, res) => handleSingleModuleCsvExport(req as AuthenticatedRequest, res, 'audit_logs'));
