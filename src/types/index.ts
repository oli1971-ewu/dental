export type UserRole = 'main_doctor' | 'developer' | 'doctor';

export interface User {
  id: number;
  uid?: string | null;
  username: string;
  fullName: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
  specialization?: string | null;
  qualifications?: string | null;
  registrationNumber?: string | null;
  joiningDate?: string | null;
  totalVisits?: number;
  uniquePatients?: number;
  todayVisits?: number;
}

export interface Patient {
  id: number;
  patientId: string; // e.g. DP-1001
  name: string;
  phone: string;
  altPhone?: string | null;
  age?: number | null;
  gender: 'Male' | 'Female' | 'Other';
  address?: string | null;
  registrationDate: string;
  medicalHistory?: string | null;
  allergies?: string | null;
  existingDiseases?: string | null;
  notes?: string | null;
  createdAt?: string;
  visitCount?: number;
  myVisitCount?: number;
  uniqueDoctorsCount?: number;
  attendedDoctorIds?: number[];
  attendedDoctorNames?: string[];
  createdBy?: number | null;
  lastVisitDate?: string | null;
  nextFollowUpDate?: string | null;
  totalTreatmentExpenses?: number;
  totalTestExpenses?: number;
  totalExpenses?: number;
  totalPaid?: number;
  totalDue?: number;
}

export interface Treatment {
  id: number;
  visitId: number;
  patientId?: number;
  doctorId?: number;
  doctorName?: string;
  treatmentName: string;
  description?: string | null;
  toothNumber?: string | null;
  cost: string;
  status: string;
  notes?: string | null;
  treatmentDate: string;
}

export interface DiagnosticTest {
  id: number;
  visitId: number;
  patientId?: number;
  doctorId?: number;
  doctorName?: string;
  testName: string;
  category: 'Dental X-ray' | 'OPG' | 'IOPA' | 'CBCT' | 'Other';
  description?: string | null;
  cost: string;
  status: string;
  notes?: string | null;
  testDate: string;
}

export interface Payment {
  id: number;
  paymentId: string;
  patientId: number;
  patientCode?: string;
  patientName?: string;
  patientPhone?: string;
  visitId: number;
  visitCode?: string;
  amount: string;
  paymentMethod: 'Cash' | 'bKash' | 'Nagad' | 'Bank transfer' | 'Other';
  transactionRef?: string | null;
  notes?: string | null;
  paymentDate: string;
  receivedBy?: number;
  receiverName?: string;
  visitTotalCost?: string;
  visitAmountPaid?: string;
  visitOutstandingDue?: string;
  visitDiscount?: string;
  installmentNumber?: number;
  totalInstallments?: number;
  patientInstallmentNumber?: number;
  patientTotalInstallments?: number;
  cumulativePaidAfter?: number;
  patientCumulativePaidAfter?: number;
  remainingDueAfter?: number;
  previousDueBefore?: number;
  previousCarriedDue?: number;
  createdAt?: string;
}

export interface Appointment {
  id: number;
  patientId: number;
  patientCode?: string;
  patientName?: string;
  patientPhone?: string;
  visitId?: number | null;
  doctorId: number;
  doctorName?: string;
  followUpDate: string;
  reason: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'Missed';
  notes?: string | null;
  smsSent?: boolean;
  smsReminderSent?: boolean;
  smsSentCount?: number;
  lastSmsSentAt?: string | null;
  lastSmsMessage?: string | null;
  smsSentAt?: string | null;
  smsSentBy?: string | null;
  smsMessage?: string | null;
}

export interface SmsReminderLog {
  id: string;
  appointmentId: number;
  patientId: number;
  patientCode: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  followUpDate: string;
  reason: string;
  message: string;
  sentAt: string;
  sentBy: string;
  channel: string;
  status?: 'Sent' | 'Delivered';
}

export interface Visit {
  id: number;
  visitId: string;
  patientId: number;
  patientCode?: string;
  patientName?: string;
  patientPhone?: string;
  patientAge?: number;
  patientGender?: string;
  doctorId: number;
  doctorName: string;
  doctorSpecialization?: string;
  visitDate: string;
  visitTime?: string;
  complaints?: string | null;
  diagnosis?: string | null;
  notes?: string | null;
  nextFollowUpDate?: string | null;
  totalTreatmentCost: string;
  totalTestCost: string;
  additionalCharges: string;
  discount: string;
  totalCost: string;
  amountPaid: string;
  outstandingDue: string;
  previousCarriedDue?: number;
  cumulativePayable?: number;
  balanceAfterVisit?: number;
  isLatestVisit?: boolean;
  status: string;
  visitSequenceNumber?: number;
  patientTotalVisits?: number;
  patientUniqueDoctorsCount?: number;
  createdAt?: string;
  treatments?: Treatment[];
  diagnosticTests?: DiagnosticTest[];
  payments?: Payment[];
}

export interface PatientDetailedProfile extends Patient {
  financialSummary: {
    totalTreatmentExpenses: number;
    totalTestExpenses: number;
    totalAdditionalCharges: number;
    totalDiscounts: number;
    totalExpenses: number;
    totalAmountPaid: number;
    totalOutstandingDue: number;
  };
  stats: {
    totalVisits: number;
    totalDoctorsVisited: number;
    lastVisitDate: string | null;
    nextFollowUpDate: string | null;
  };
  doctorHistory: {
    id: number;
    name: string;
    specialization: string;
    visitCount: number;
  }[];
  visits: Visit[];
  treatments: Treatment[];
  diagnosticTests: DiagnosticTest[];
  payments: Payment[];
  appointments: Appointment[];
}

export interface AuditLog {
  id: number;
  userId?: number | null;
  userRole: string;
  userName?: string | null;
  username?: string | null;
  action: string;
  affectedRecord: string;
  details?: string | null;
  createdAt: string;
}

export interface DashboardStats {
  role: UserRole;
  totalPatients?: number;
  totalDoctors?: number;
  totalVisits?: number;
  todayVisits?: number;
  upcomingFollowUps?: number;
  totalTreatmentCharges?: number;
  totalTestCharges?: number;
  totalCollection?: number;
  totalOutstandingDues?: number;
  recentVisits?: any[];
  developerStats?: any;
  uniquePatients?: number;
  treatmentStats?: { name: string; count: number; totalEarned: string }[];
}

export interface ApplicationFeatureFlag {
  id: number;
  featureKey: string;
  featureName: string;
  description?: string | null;
  moduleCategory?: string;
  isEnabled: boolean;
  globalEnabled?: boolean;
  packageEntitlement?: 'ON' | 'OFF' | 'Limited';
  applicableRoles?: string[];
  effectiveEnabled?: boolean;
  updatedAt?: string | null;
}

export interface SubscriptionPackage {
  id: number;
  packageKey: string;
  packageName: string;
  description?: string | null;
  monthlyPriceBdt: string;
  annualPriceBdt: string;
  featureEntitlements: Record<string, 'ON' | 'OFF' | 'Limited'>;
  limits: {
    maxDoctors?: number | null;
    maxStaff?: number | null;
    maxPatients?: number | null;
    maxBranches?: number | null;
    storageMb?: number | null;
    monthlyBackups?: number | null;
  };
  isActive: boolean;
  sortOrder: number;
  updatedAt?: string | null;
}

export interface ClinicSubscription {
  id: number;
  clinicCode: string;
  clinicName: string;
  branchCode: string;
  packageId?: number | null;
  packageKey: string;
  packageName: string;
  status: 'Active' | 'Trial' | 'Expired' | 'Suspended' | 'Canceled';
  startDate: string;
  expiryDate?: string | null;
  trialEndsAt?: string | null;
  notes?: string | null;
  isOperational?: boolean;
  limits?: Record<string, number | null>;
}

export interface SubscriptionAuditLog {
  id: number;
  userId?: number | null;
  userRole: string;
  action: string;
  targetKey: string;
  previousStateJson?: string | null;
  newStateJson?: string | null;
  details?: string | null;
  createdAt: string;
}

export type PrescriptionStatus = 'Draft' | 'Finalized' | 'Revised';

export interface PrescriptionMedicine {
  id?: number;
  prescriptionId?: number;
  medicineId?: number | null;
  sortOrder?: number;
  medicineName: string;
  genericName?: string | null;
  strength?: string | null;
  dosageType?: string | null;
  manufacturer?: string | null;
  packageMark?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  quantity?: string | null;
  mealInstructions?: string | null;
  additionalNotes?: string | null;
}

export interface PrescriptionMedicineSuggestion {
  medicineName: string;
  genericName: string;
  strength: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: string;
  mealInstructions: string;
}

export interface CatalogMedicine {
  id: number;
  medicineCode: string;
  genericName: string;
  brandName: string;
  packageMark?: string | null;
  dosageType: string;
  strength?: string | null;
  manufacturer: string;
  source: string;
  isActive: boolean;
  lastImportBatchId?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MedicineSearchResponse {
  items: CatalogMedicine[];
  totalCount: number;
  hasMore: boolean;
}

export type MedicineImportMode = 'add_only' | 'add_and_update' | 'full_reconcile';

export interface MedicineColumnMapping {
  genericName: string;
  brandName: string;
  packageMark: string;
  dosageType: string;
  strength: string;
  manufacturer: string;
}

export interface MedicineImportBatch {
  id: number;
  batchCode: string;
  filename: string;
  sourceLabel: string;
  importMode: MedicineImportMode;
  status: string;
  totalRecords: number;
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
  skippedCount: number;
  rejectedCount: number;
  missingCount: number;
  deactivatedCount: number;
  snapshotId?: number | null;
  summaryJson?: string | null;
  uploadedByName?: string | null;
  createdAt: string;
}

export interface MedicineOverviewStats {
  totalMedicines: number;
  activeMedicines: number;
  inactiveMedicines: number;
  totalGenerics: number;
  totalManufacturers: number;
  recentlyAddedCount: number;
  recentlyUpdatedCount: number;
  lastUpdatedAt?: string | null;
  lastImport: MedicineImportBatch | null;
}

export interface MedicineImportPreviewResponse {
  headers: string[];
  mapping: MedicineColumnMapping;
  importMode: MedicineImportMode;
  counts: {
    totalRecords: number;
    newRecords: number;
    updatedRecords: number;
    unchangedRecords: number;
    possibleDuplicates: number;
    invalidRecords: number;
    missingRecords: number;
  };
  samples: {
    newRecords: {
      rowNumber: number;
      brandName: string;
      genericName: string;
      dosageType: string;
      strength: string;
      manufacturer: string;
      packageMark: string;
    }[];
    updatedRecords: {
      existingId: number;
      medicineCode: string;
      previous: Partial<CatalogMedicine>;
      merged: Partial<CatalogMedicine>;
    }[];
    unchangedRecords: {
      existingId: number;
      medicineCode: string;
      brandName: string;
      strength: string;
    }[];
    possibleDuplicates: {
      rowNumber: number;
      brandName: string;
      genericName: string;
      strength: string;
      reason: string;
    }[];
    invalidRecords: {
      rowNumber: number;
      raw: Record<string, string>;
      reason: string;
    }[];
    missingRecords: {
      id: number;
      medicineCode: string;
      brandName: string;
      genericName: string;
      dosageType: string;
      strength: string;
      manufacturer: string;
    }[];
  };
  allMissingIds: number[];
}

export interface MedicineCatalogSnapshot {
  id: number;
  snapshotCode: string;
  label: string;
  recordCount: number;
  createdAt: string;
  createdByName?: string | null;
}

export interface MedicineAuditLog {
  id: number;
  medicineId?: number | null;
  importBatchId?: number | null;
  userRole: string;
  userName?: string | null;
  action: string;
  targetName: string;
  previousValuesJson?: string | null;
  newValuesJson?: string | null;
  details?: string | null;
  createdAt: string;
}

export interface MedicineDetailResponse {
  medicine: CatalogMedicine;
  prescriptionUsageCount: number;
  auditLogs: MedicineAuditLog[];
}

export interface PrescriptionRevision {
  id: number;
  prescriptionId: number;
  previousPrescriptionId: number;
  revisionNumber: number;
  revisionReason?: string | null;
  createdBy: number;
  createdByName?: string | null;
  createdAt: string;
}

export interface PrescriptionAuditLog {
  id: number;
  action: string;
  userRole: string;
  userName?: string | null;
  details?: string | null;
  createdAt: string;
}

export interface PrescriptionTreatmentPlanItem {
  id?: number;
  prescriptionId?: number;
  sortOrder?: number;
  treatmentName: string;
  toothNumber?: string | null;
  cost?: string | null;
  notes?: string | null;
}

export interface PrescriptionAdvisedTestItem {
  id?: number;
  prescriptionId?: number;
  sortOrder?: number;
  testName: string;
  category?: string | null;
  cost?: string | null;
  notes?: string | null;
}

export interface DoctorClinicalHeading {
  id?: number;
  doctorId?: number;
  sortOrder?: number;
  heading: string;
  defaultPlaceholder?: string | null;
}

export interface PrescriptionCustomSection {
  id?: number;
  prescriptionId?: number;
  sortOrder?: number;
  heading: string;
  content: string;
}

export interface Prescription {
  id: number;
  prescriptionNumber: string;
  patientId: number;
  doctorId: number;
  visitId: number;
  parentPrescriptionId?: number | null;
  rootPrescriptionId?: number | null;
  templateSourceId?: number | null;
  revisionNumber: number;
  status: PrescriptionStatus;
  prescriptionDate: string;
  chiefComplaints?: string | null;
  clinicalFindings?: string | null;
  diagnosis?: string | null;
  treatmentPlan?: string | null;
  showPlanCosts?: boolean;
  syncToPatientRecords?: boolean;
  followUpDate?: string | null;
  oralHygieneInstructions?: string | null;
  toothBrushingInstructions?: string | null;
  mouthwashRecommendations?: string | null;
  postExtractionInstructions?: string | null;
  postTreatmentPrecautions?: string | null;
  dietaryRecommendations?: string | null;
  additionalClinicalAdvice?: string | null;
  finalizedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;

  // Hydrated fields
  patientCode?: string;
  patientName?: string;
  patientAge?: number | null;
  patientGender?: string;
  patientPhone?: string;
  patientAddress?: string | null;
  patientAllergies?: string | null;
  patientExistingDiseases?: string | null;
  patientMedicalHistory?: string | null;
  doctorName?: string;
  doctorDesignation?: string;
  doctorQualification?: string | null;
  doctorRegistrationNumber?: string | null;
  doctorPhone?: string | null;
  doctorEmail?: string | null;
  visitCode?: string;
  visitDate?: string;
  medicines: PrescriptionMedicine[];
  treatmentPlanItems?: PrescriptionTreatmentPlanItem[];
  advisedTests?: PrescriptionAdvisedTestItem[];
  customSections?: PrescriptionCustomSection[];
  clinic?: {
    clinicName: string;
    clinicAddress: string;
    clinicPhone: string;
  };
  revisions?: PrescriptionRevision[];
  revisionLineage?: {
    id: number;
    prescriptionNumber: string;
    revisionNumber: number;
    status: PrescriptionStatus;
    prescriptionDate: string;
    createdAt: string;
  }[];
  auditLogs?: PrescriptionAuditLog[];
}

export type DoctorSalaryType = 'Monthly' | 'Daily' | 'Commission';
export type DoctorSalaryStatus = 'Paid' | 'Partial' | 'Pending';
export type PayrollLifecycleStatus = 'Draft' | 'Finalized' | 'Partially Paid' | 'Paid';

export interface SalaryPaymentRecord {
  id: number;
  paymentCode: string;
  salaryId: number;
  doctorId: number;
  doctorName?: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  transactionRef?: string | null;
  notes?: string | null;
  recordedBy?: number | null;
  recordedByName?: string;
  createdAt?: string;
}

export interface SalaryAdjustmentRecord {
  id: number;
  salaryId: number;
  doctorId: number;
  adjustmentType: string;
  amount: number;
  previousPayable: number;
  newPayable: number;
  reason: string;
  authorizedBy?: number | null;
  authorizedByName?: string;
  createdAt?: string;
}

export interface DoctorSalary {
  id: number;
  salaryCode: string;
  doctorId: number;
  doctorName?: string;
  doctorSpecialization?: string | null;
  doctorPhone?: string | null;
  doctorRole?: string;
  salaryType: DoctorSalaryType;
  periodLabel: string;
  payrollMonth?: string | null;
  payrollYear?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  baseAmount: string | number;
  daysWorked: number;
  commissionBasis?: 'collected' | 'billed' | 'treatment_revenue' | 'custom' | null;
  commissionSourceAmount: string | number;
  commissionRate: string | number;
  commissionEarned: string | number;
  grossSalary?: string | number;
  bonusAmount: string | number;
  deductionAmount: string | number;
  totalPayable: string | number;
  paidAmount: string | number;
  dueAmount: string | number;
  payrollStatus?: PayrollLifecycleStatus;
  paymentStatus: DoctorSalaryStatus;
  paymentMethod: 'Cash' | 'bKash' | 'Nagad' | 'Bank transfer' | 'Mobile Financial Service' | 'Other';
  transactionRef?: string | null;
  paymentDate: string;
  notes?: string | null;
  structureSnapshot?: any;
  finalizedAt?: string | null;
  recordedBy?: number | null;
  recordedByName?: string | null;
  payments?: SalaryPaymentRecord[];
  adjustments?: SalaryAdjustmentRecord[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DoctorSalaryStructure {
  doctorId: number;
  doctorName: string;
  doctorPhone?: string | null;
  doctorRole: string;
  doctorSpecialization?: string;
  doctorStatus: string;
  structureId: number | null;
  structureCode: string;
  salaryType: DoctorSalaryType;
  baseRate: number;
  commissionRate: number;
  commissionBasis: 'treatment_revenue' | 'collected_payments' | 'eligible_charges';
  allowances: number;
  deductions: number;
  effectiveDate: string;
  reviewDate?: string | null;
  notes?: string;
  isActive: boolean;
  updatedAt?: string | null;
  liveMetrics?: {
    visitCount: number;
    workingDaysCount: number;
    treatmentRevenue: number;
    diagnosticCharges: number;
    eligibleCharges: number;
    collectedPayments: number;
  };
}

export interface DoctorSalaryStructureHistory {
  id: number;
  structureId?: number | null;
  doctorId: number;
  salaryType: DoctorSalaryType;
  baseRate: number;
  commissionRate: number;
  commissionBasis: string;
  allowances: number;
  deductions: number;
  effectiveDate: string;
  reviewDate?: string | null;
  changeReason?: string | null;
  changedByName?: string;
  createdAt: string;
}

export interface PayrollAuditLog {
  id: number;
  salaryId?: number | null;
  doctorId?: number | null;
  userId?: number | null;
  userRole: string;
  action: string;
  targetLabel: string;
  details?: string | null;
  createdAt: string;
}

export interface DoctorSalaryMetrics {
  doctorId: number;
  doctorName: string;
  fromDate?: string | null;
  toDate?: string | null;
  visitCount: number;
  uniqueDaysWorked: number;
  totalTreatmentBill: number;
  totalVisitBill: number;
  totalCollectedByDoctor: number;
  totalCollectedForDoctorVisits: number;
}

export interface BackupPreviewResponse {
  backupType: 'CLINIC_FULL' | 'DOCTOR_SCOPED';
  scopeLabel: string;
  effectiveDoctorScopeId: number | null;
  dateFilter: {
    preset: string;
    fromDate: string | null;
    toDate: string | null;
  };
  recordCounts: Record<string, number>;
  totalRecords: number;
  availableModules: string[];
}

export interface BackupHistoryLog {
  id: number;
  backupCode: string;
  backupType: string;
  exportFormat: string;
  requestedBy?: number | null;
  requestedByName: string;
  userRole: string;
  doctorScopeId?: number | null;
  datePreset: string;
  fromDate?: string | null;
  toDate?: string | null;
  selectedModules: string[];
  recordCounts: Record<string, number>;
  totalRecords: number;
  fileSizeBytes: number;
  filename: string;
  status: string;
  failureReason?: string | null;
  createdAt: string;
}


