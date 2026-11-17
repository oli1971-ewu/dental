import {
  User,
  Patient,
  PatientDetailedProfile,
  Visit,
  Treatment,
  DiagnosticTest,
  Payment,
  Appointment,
  AuditLog,
  DashboardStats,
  ApplicationFeatureFlag,
  Prescription,
  PrescriptionMedicineSuggestion,
  CatalogMedicine,
  MedicineSearchResponse,
  MedicineOverviewStats,
  MedicineImportMode,
  MedicineColumnMapping,
  MedicineImportPreviewResponse,
  MedicineImportBatch,
  MedicineCatalogSnapshot,
  MedicineAuditLog,
  MedicineDetailResponse,
  DoctorClinicalHeading,
  DoctorSalary,
  DoctorSalaryMetrics,
} from '../types/index.ts';

const TOKEN_KEY = 'dental_clinic_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const method = (options.method || 'GET').toUpperCase();
  const response = await fetch(endpoint, {
    ...options,
    headers,
    ...(method === 'GET' ? { cache: 'no-store' as RequestCache } : {}),
  });

  if (!response.ok) {
    let errorMsg = 'An error occurred';
    let errorCode: string | undefined;
    try {
      const errorData = await response.json();
      errorMsg = errorData.error || errorMsg;
      errorCode = errorData.code;
    } catch {
      errorMsg = response.statusText || errorMsg;
    }
    if (errorCode === 'FEATURE_DISABLED' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('prescription-feature-disabled', { detail: errorMsg }));
    }
    const err: any = new Error(errorMsg);
    if (errorCode) err.code = errorCode;
    throw err;
  }

  return response.json();
}

// API methods
export const api = {
  // Auth
  login: (credentials: { username: string; password?: string }) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  getCurrentUser: () => request<{ user: User }>('/api/auth/me'),

  getDemoAccounts: () => request<User[]>('/api/auth/demo-accounts'),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    request<{ success: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Doctors
  getDoctors: () => request<User[]>('/api/doctors'),

  createDoctor: (data: Partial<User> & { password?: string }) =>
    request<User>('/api/doctors', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDoctor: (id: number, data: Partial<User>) =>
    request<User>(`/api/doctors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  toggleDoctorStatus: (id: number) =>
    request<User>(`/api/doctors/${id}/toggle-status`, {
      method: 'PUT',
    }),

  resetDoctorPassword: (id: number, newPassword: string) =>
    request<{ success: boolean; message: string }>(`/api/doctors/${id}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ newPassword }),
    }),

  // Patients
  getPatients: (params: {
    search?: string;
    gender?: string;
    hasDue?: boolean;
    dueStatus?: string;
    fromDate?: string;
    toDate?: string;
    doctorId?: number | string;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.append('search', params.search);
    if (params.gender && params.gender !== 'All') q.append('gender', params.gender);
    if (params.hasDue) q.append('hasDue', 'true');
    if (params.dueStatus && params.dueStatus !== 'all') q.append('dueStatus', params.dueStatus);
    if (params.fromDate) q.append('fromDate', params.fromDate);
    if (params.toDate) q.append('toDate', params.toDate);
    if (params.doctorId && params.doctorId !== 'All') q.append('doctorId', params.doctorId.toString());
    return request<Patient[]>(`/api/patients?${q.toString()}`);
  },

  checkDuplicatePatient: (params: { phone?: string; name?: string }) => {
    const q = new URLSearchParams();
    if (params.phone) q.append('phone', params.phone);
    if (params.name) q.append('name', params.name);
    return request<{ duplicates: Patient[] }>(`/api/patients/check-duplicate?${q.toString()}`);
  },

  getPatient: (id: number) => request<PatientDetailedProfile>(`/api/patients/${id}`),

  createPatient: (data: Partial<Patient>) =>
    request<Patient>('/api/patients', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePatient: (id: number, data: Partial<Patient>) =>
    request<Patient>(`/api/patients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deletePatient: (id: number) =>
    request<{ success: boolean }>(`/api/patients/${id}`, {
      method: 'DELETE',
    }),

  // Visits
  getVisits: (params: {
    doctorId?: number;
    patientId?: number;
    date?: string;
    fromDate?: string;
    toDate?: string;
    hasDue?: boolean;
    dueStatus?: string;
    search?: string;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.doctorId) q.append('doctorId', params.doctorId.toString());
    if (params.patientId) q.append('patientId', params.patientId.toString());
    if (params.date) q.append('date', params.date);
    if (params.fromDate) q.append('fromDate', params.fromDate);
    if (params.toDate) q.append('toDate', params.toDate);
    if (params.hasDue) q.append('hasDue', 'true');
    if (params.dueStatus && params.dueStatus !== 'all') q.append('dueStatus', params.dueStatus);
    if (params.search) q.append('search', params.search);
    return request<Visit[]>(`/api/visits?${q.toString()}`);
  },

  getVisit: (id: number) => request<Visit>(`/api/visits/${id}`),

  createVisit: (data: any) =>
    request<Visit>('/api/visits', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateVisit: (id: number, data: any) =>
    request<{ success: boolean; financials: any }>(`/api/visits/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  applyDiscount: (
    visitId: number,
    data: { discountAmount: number | string; reason?: string; isTotalDiscount?: boolean }
  ) =>
    request<{ success: boolean; newDiscount: string; financials: any }>(
      `/api/visits/${visitId}/apply-discount`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  deleteVisit: (id: number) =>
    request<{ success: boolean }>(`/api/visits/${id}`, {
      method: 'DELETE',
    }),

  // Treatments
  addTreatment: (visitId: number, data: Partial<Treatment>) =>
    request<Treatment>(`/api/visits/${visitId}/treatments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteTreatment: (id: number) =>
    request<{ success: boolean }>(`/api/treatments/${id}`, {
      method: 'DELETE',
    }),

  // Diagnostic Tests & X-rays
  addDiagnosticTest: (visitId: number, data: Partial<DiagnosticTest>) =>
    request<DiagnosticTest>(`/api/visits/${visitId}/diagnostic-tests`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteDiagnosticTest: (id: number) =>
    request<{ success: boolean }>(`/api/diagnostic-tests/${id}`, {
      method: 'DELETE',
    }),

  // Payments
  recordPayment: (visitId: number, data: {
    amount: number | string;
    paymentMethod: string;
    transactionRef?: string;
    notes?: string;
    paymentDate?: string;
    receivedBy?: number;
  }) =>
    request<{ payment: Payment; financials: any }>(`/api/visits/${visitId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  recordPatientPayment: (patientId: number, data: {
    amount: number | string;
    paymentMethod: string;
    transactionRef?: string;
    notes?: string;
    paymentDate?: string;
    receivedBy?: number;
  }) =>
    request<{ payments: Payment[]; totalAllocated: number; remainingPatientDue: number }>(
      `/api/patients/${patientId}/pay-due`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  deletePayment: (id: number) =>
    request<{ success: boolean; financials: any }>(`/api/payments/${id}`, {
      method: 'DELETE',
    }),

  getPayments: (params: {
    method?: string;
    date?: string;
    fromDate?: string;
    toDate?: string;
    receivedBy?: number | string;
    search?: string;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.method && params.method !== 'All') q.append('method', params.method);
    if (params.date) q.append('date', params.date);
    if (params.fromDate) q.append('fromDate', params.fromDate);
    if (params.toDate) q.append('toDate', params.toDate);
    if (params.receivedBy && params.receivedBy !== 'All') q.append('receivedBy', params.receivedBy.toString());
    if (params.search) q.append('search', params.search);
    return request<Payment[]>(`/api/payments?${q.toString()}`);
  },

  getPaymentDues: (params: {
    doctorId?: number | string;
    fromDate?: string;
    toDate?: string;
    search?: string;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.doctorId && params.doctorId !== 'All') q.append('doctorId', params.doctorId.toString());
    if (params.fromDate) q.append('fromDate', params.fromDate);
    if (params.toDate) q.append('toDate', params.toDate);
    if (params.search) q.append('search', params.search);
    return request<Visit[]>(`/api/payments/dues?${q.toString()}`);
  },

  // Appointments / Follow-ups & Central SMS Reminders
  getAppointments: (params: { status?: string; doctorId?: number; upcomingOnly?: boolean; followUpDate?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.status && params.status !== 'All') q.append('status', params.status);
    if (params.doctorId) q.append('doctorId', params.doctorId.toString());
    if (params.upcomingOnly) q.append('upcomingOnly', 'true');
    if (params.followUpDate) q.append('followUpDate', params.followUpDate);
    return request<Appointment[]>(`/api/appointments?${q.toString()}`);
  },

  getSmsReminderLogs: () =>
    request<{
      logs: any[];
      clinicName: string;
      clinicPhone: string;
      smsTemplate: string;
      smsGatewayUrl: string;
      smsGatewayApiKey?: string;
      defaultMessagingChannel?: string;
    }>('/api/appointments/sms-logs'),

  testSmsGateway: (gatewayUrl: string, gatewayApiKey?: string) =>
    request<{
      success: boolean;
      statusCode?: number;
      message: string;
    }>('/api/appointments/test-sms-gateway', {
      method: 'POST',
      body: JSON.stringify({ gatewayUrl, gatewayApiKey }),
    }),

  sendSmsReminders: (data: {
    appointmentIds: number[];
    messageTemplate?: string;
    gatewayUrl?: string;
    gatewayApiKey?: string;
    channel?: string;
  }) =>
    request<{
      success: boolean;
      channel?: string;
      sentCount: number;
      results: any[];
    }>('/api/appointments/send-sms-reminders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createAppointment: (data: Partial<Appointment>) =>
    request<Appointment>('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateAppointmentStatus: (id: number, data: { status: string; notes?: string }) =>
    request<Appointment>(`/api/appointments/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Dashboard
  getDashboardStats: () => request<DashboardStats>('/api/dashboard/stats'),

  // Audit Logs
  getAuditLogs: () => request<AuditLog[]>('/api/audit-logs'),

  // Settings
  getSettings: () => request<Record<string, string>>('/api/settings'),

  updateSettings: (settings: Record<string, any>) =>
    request<{ success: boolean }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    }),

  // CSV Downloads (Trigger browser download with auth header)
  downloadCsv: async (endpoint: string, filename: string) => {
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(endpoint, { headers, cache: 'no-store' });
    if (!res.ok) {
      let msg = 'Failed to download CSV';
      try {
        const errData = await res.json();
        msg = errData.error || msg;
      } catch {}
      throw new Error(msg);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // Developer Backup Download
  downloadBackup: async () => {
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/developer/backup', { headers });
    if (!res.ok) throw new Error('Failed to download database backup');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dental_clinic_cloudsql_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // Application Feature Flags & Subscription Control (Developer Controlled)
  getFeatures: () =>
    request<{
      prescriptionManagement: boolean;
      prescriptionManagementEnabled: boolean;
      flags: ApplicationFeatureFlag[];
      features: ApplicationFeatureFlag[];
      subscription?: any;
      activePackage?: any;
    }>('/api/features'),

  toggleFeature: (
    key: string,
    isEnabled: boolean,
    extra?: {
      featureName?: string;
      description?: string;
      moduleCategory?: string;
      applicableRoles?: string[];
    }
  ) =>
    request<{
      success: boolean;
      flag: ApplicationFeatureFlag;
      prescriptionManagement: boolean;
      features: ApplicationFeatureFlag[];
    }>(`/api/developer/features/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ isEnabled, ...extra }),
    }),

  getDeveloperControlCenter: () =>
    request<{
      prescriptionManagement: boolean;
      features: ApplicationFeatureFlag[];
      packages: any[];
      subscription: any;
      activePackage: any;
      usageMetrics: {
        doctorsCount: number;
        totalUsersCount: number;
        patientsCount: number;
        branchesCount: number;
      };
      auditLogs: any[];
    }>('/api/developer/control-center'),

  saveSubscriptionPackage: (data: any) =>
    request<{ success: boolean; features: ApplicationFeatureFlag[] }>('/api/developer/packages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateClinicSubscription: (data: any) =>
    request<{ success: boolean; subscription: any; features: ApplicationFeatureFlag[] }>(
      '/api/developer/subscription',
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    ),

  getDeveloperCredentials: () =>
    request<
      {
        id: number;
        username: string;
        fullName: string;
        role: string;
        email: string | null;
        phone: string | null;
        specialization: string | null;
        isActive: boolean;
        hasPasswordHash: boolean;
        currentPassword: string;
        passwordUpdatedAt: string | null;
      }[]
    >('/api/developer/credentials'),

  updateDeveloperCredential: (id: number, data: { newPassword: string; username?: string }) =>
    request<{
      success: boolean;
      username: string;
      currentPassword: string;
      message: string;
    }>(`/api/developer/credentials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  recoverDeveloperPassword: (data: { recoveryKey: string; newPassword?: string }) =>
    request<{
      success: boolean;
      username: string;
      currentPassword: string;
      message: string;
    }>('/api/auth/developer-recovery', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Prescription Management Module
  getPrescriptions: (params: {
    patientId?: number;
    visitId?: number;
    doctorId?: number | string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.patientId) q.append('patientId', params.patientId.toString());
    if (params.visitId) q.append('visitId', params.visitId.toString());
    if (params.doctorId && params.doctorId !== 'All') q.append('doctorId', params.doctorId.toString());
    if (params.status && params.status !== 'All') q.append('status', params.status);
    if (params.fromDate) q.append('fromDate', params.fromDate);
    if (params.toDate) q.append('toDate', params.toDate);
    if (params.search) q.append('search', params.search);
    return request<Prescription[]>(`/api/prescriptions?${q.toString()}`);
  },

  getPrescription: (id: number) => request<Prescription>(`/api/prescriptions/${id}`),

  getMedicineSuggestions: (q: string = '') =>
    request<PrescriptionMedicineSuggestion[]>(
      `/api/prescriptions/medicines/suggestions?q=${encodeURIComponent(q)}`
    ),

  getDoctorClinicalHeadings: (doctorId?: number) => {
    const q = doctorId ? `?doctorId=${doctorId}` : '';
    return request<DoctorClinicalHeading[]>(`/api/prescriptions/headings${q}`);
  },

  saveDoctorClinicalHeadings: (headings: DoctorClinicalHeading[], doctorId?: number) =>
    request<{ success: boolean; headings: DoctorClinicalHeading[] }>('/api/prescriptions/headings', {
      method: 'PUT',
      body: JSON.stringify({ headings, doctorId }),
    }),

  createPrescription: (data: any) =>
    request<Prescription>('/api/prescriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePrescription: (id: number, data: any) =>
    request<Prescription>(`/api/prescriptions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  finalizePrescription: (id: number) =>
    request<Prescription>(`/api/prescriptions/${id}/finalize`, {
      method: 'POST',
    }),

  revisePrescription: (id: number, revisionReason?: string) =>
    request<Prescription>(`/api/prescriptions/${id}/revise`, {
      method: 'POST',
      body: JSON.stringify({ revisionReason }),
    }),

  clonePrescription: (id: number, visitId?: number | 'auto') =>
    request<Prescription>(`/api/prescriptions/${id}/clone`, {
      method: 'POST',
      body: JSON.stringify({ visitId }),
    }),

  deletePrescription: (id: number) =>
    request<{ success: boolean }>(`/api/prescriptions/${id}`, {
      method: 'DELETE',
    }),

  logPrescriptionExport: (id: number, mode: 'pdf' | 'print') =>
    request<{ success: boolean }>(`/api/prescriptions/${id}/log-export`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  // Local Bangladesh Medicine Catalog (Smart Autocomplete & Admin Management)
  searchMedicines: (q: string, limit: number = 10, offset: number = 0) => {
    const params = new URLSearchParams({
      q,
      limit: String(limit),
      offset: String(offset),
    });
    return request<MedicineSearchResponse>(`/api/medicines/search?${params.toString()}`);
  },

  getMedicineOverview: () => request<MedicineOverviewStats>('/api/medicines/admin/overview'),

  getMedicineCatalog: (
    params: {
      q?: string;
      status?: 'all' | 'active' | 'inactive';
      dosageType?: string;
      source?: string;
      page?: number;
      pageSize?: number;
    } = {}
  ) => {
    const q = new URLSearchParams();
    if (params.q) q.append('q', params.q);
    if (params.status) q.append('status', params.status);
    if (params.dosageType && params.dosageType !== 'all') q.append('dosageType', params.dosageType);
    if (params.source && params.source !== 'all') q.append('source', params.source);
    if (params.page) q.append('page', String(params.page));
    if (params.pageSize) q.append('pageSize', String(params.pageSize));
    return request<{
      items: CatalogMedicine[];
      total: number;
      page: number;
      pageSize: number;
      facets: { dosageTypes: string[]; sources: string[] };
    }>(`/api/medicines/admin/catalog?${q.toString()}`);
  },

  getMedicineDetail: (id: number) =>
    request<MedicineDetailResponse>(`/api/medicines/admin/${id}`),

  createCatalogMedicine: (data: {
    brandName: string;
    genericName: string;
    packageMark?: string;
    dosageType: string;
    strength?: string;
    manufacturer: string;
    isActive?: boolean;
  }) =>
    request<CatalogMedicine>('/api/medicines/admin', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCatalogMedicine: (
    id: number,
    data: Partial<{
      brandName: string;
      genericName: string;
      packageMark: string;
      dosageType: string;
      strength: string;
      manufacturer: string;
      isActive: boolean;
    }>
  ) =>
    request<CatalogMedicine>(`/api/medicines/admin/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  toggleCatalogMedicineStatus: (id: number, isActive: boolean) =>
    request<CatalogMedicine>(`/api/medicines/admin/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isActive }),
    }),

  previewMedicineCsvImport: (data: {
    csvText: string;
    importMode: MedicineImportMode;
    columnMapping?: Partial<MedicineColumnMapping>;
  }) =>
    request<MedicineImportPreviewResponse>('/api/medicines/admin/import/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  commitMedicineCsvImport: (data: {
    csvText: string;
    filename: string;
    sourceLabel: string;
    importMode: MedicineImportMode;
    columnMapping?: Partial<MedicineColumnMapping>;
    deactivateMissingIds?: number[];
  }) =>
    request<{
      success: boolean;
      batch: MedicineImportBatch;
      snapshot: { id: number; snapshotCode: string; label: string };
    }>('/api/medicines/admin/import/commit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMedicineHistory: () =>
    request<{
      batches: MedicineImportBatch[];
      snapshots: MedicineCatalogSnapshot[];
      logs: MedicineAuditLog[];
    }>('/api/medicines/admin/history'),

  createMedicineSnapshot: (label?: string) =>
    request<MedicineCatalogSnapshot>('/api/medicines/admin/snapshots', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),

  rollbackMedicineCatalog: (snapshotId: number) =>
    request<{
      success: boolean;
      restoredCount: number;
      snapshotCode: string;
      safetySnapshotCode: string;
    }>(`/api/medicines/admin/rollback/${snapshotId}`, {
      method: 'POST',
    }),

  // Doctor Salary Sheet & Payroll Management (Main Doctor / Developer)
  getDoctorSalaries: (
    params: {
      doctorId?: number | string;
      salaryType?: string;
      paymentStatus?: string;
      fromDate?: string;
      toDate?: string;
      search?: string;
    } = {}
  ) => {
    const q = new URLSearchParams();
    if (params.doctorId && params.doctorId !== 'All') q.append('doctorId', String(params.doctorId));
    if (params.salaryType && params.salaryType !== 'All') q.append('salaryType', params.salaryType);
    if (params.paymentStatus && params.paymentStatus !== 'All')
      q.append('paymentStatus', params.paymentStatus);
    if (params.fromDate) q.append('fromDate', params.fromDate);
    if (params.toDate) q.append('toDate', params.toDate);
    if (params.search) q.append('search', params.search);
    return request<DoctorSalary[]>(`/api/doctor-salaries?${q.toString()}`);
  },

  getDoctorSalaryMetrics: (params: {
    doctorId: number;
    fromDate?: string;
    toDate?: string;
  }) => {
    const q = new URLSearchParams({ doctorId: String(params.doctorId) });
    if (params.fromDate) q.append('fromDate', params.fromDate);
    if (params.toDate) q.append('toDate', params.toDate);
    return request<DoctorSalaryMetrics>(`/api/doctor-salaries/doctor-metrics?${q.toString()}`);
  },

  createDoctorSalary: (data: Partial<DoctorSalary>) =>
    request<DoctorSalary>('/api/doctor-salaries', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDoctorSalary: (id: number, data: Partial<DoctorSalary>) =>
    request<DoctorSalary>(`/api/doctor-salaries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteDoctorSalary: (id: number) =>
    request<{ success: boolean }>(`/api/doctor-salaries/${id}`, {
      method: 'DELETE',
    }),

  getPayrollOverview: (month?: string) => {
    const q = month ? `?month=${encodeURIComponent(month)}` : '';
    return request<{
      structures: any[];
      salaries: DoctorSalary[];
      allPayments: any[];
      auditLogs: any[];
    }>(`/api/payroll/overview${q}`);
  },

  getSalaryStructureHistory: (doctorId: number) =>
    request<any[]>(`/api/payroll/structures/${doctorId}/history`),

  saveSalaryStructure: (data: any) =>
    request<{ success: boolean; structureId: number }>('/api/payroll/structures', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  generateMonthlyPayroll: (payrollMonth: string, paymentDate?: string) =>
    request<{
      success: boolean;
      createdCount: number;
      skippedCount: number;
      skippedDoctors: string[];
    }>('/api/payroll/generate-monthly', {
      method: 'POST',
      body: JSON.stringify({ payrollMonth, paymentDate }),
    }),

  finalizePayrollRecord: (salaryId: number) =>
    request<{ success: boolean }>(`/api/doctor-salaries/${salaryId}/finalize`, {
      method: 'POST',
    }),

  recordSalaryPayment: (
    salaryId: number,
    data: {
      amount: number | string;
      paymentDate: string;
      paymentMethod: string;
      transactionRef?: string;
      notes?: string;
    }
  ) =>
    request<{
      success: boolean;
      paymentCode: string;
      paidAmount: number;
      dueAmount: number;
      paymentStatus: string;
      payrollStatus: string;
    }>(`/api/doctor-salaries/${salaryId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  recordSalaryAdjustment: (
    salaryId: number,
    data: {
      adjustmentType: 'Allowance' | 'Deduction' | 'Correction';
      amount: number | string;
      reason: string;
    }
  ) =>
    request<{
      success: boolean;
      previousPayable: number;
      newPayable: number;
      newDue: number;
      paymentStatus: string;
    }>(`/api/doctor-salaries/${salaryId}/adjustments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Backup & Structured ZIP / CSV Export Center
  previewBackup: (data: {
    preset?: string;
    fromDate?: string;
    toDate?: string;
    doctorId?: number | string | null;
    selectedModules?: string[];
  }) =>
    request<any>('/api/backup/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  downloadZipBackup: async (data: {
    preset?: string;
    fromDate?: string;
    toDate?: string;
    doctorId?: number | string | null;
    selectedModules?: string[];
  }) => {
    const token = getStoredToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/backup/download-zip', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      let msg = 'Failed to generate ZIP backup archive';
      try {
        const errData = await res.json();
        msg = errData.error || msg;
      } catch {}
      throw new Error(msg);
    }

    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `Clinic_Backup_${new Date().toISOString().slice(0, 10)}.zip`;

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return filename;
  },

  downloadRecoverySnapshot: async () => {
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/backup/recovery-snapshot', { headers });
    if (!res.ok) {
      let msg = 'Failed to download recovery snapshot';
      try {
        const errData = await res.json();
        msg = errData.error || msg;
      } catch {}
      throw new Error(msg);
    }

    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename =
      match ? match[1] : `Clinic_Recovery_Snapshot_${new Date().toISOString().slice(0, 10)}.json`;

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return filename;
  },

  getBackupHistory: () => request<any[]>('/api/backup/history'),

  previewRestoreBackup: (snapshot: any) =>
    request<{
      valid: boolean;
      snapshotId: string;
      generatedAt: string | null;
      summary: {
        totalInFile: number;
        totalNewToImport: number;
        totalDuplicatesSkipped: number;
      };
      modules: Record<
        string,
        {
          label: string;
          inFile: number;
          newToImport: number;
          duplicatesSkipped: number;
        }
      >;
    }>('/api/backup/restore-preview', {
      method: 'POST',
      body: JSON.stringify({ snapshot }),
    }),

  executeRestoreBackup: (snapshot: any, filename?: string) =>
    request<{
      success: boolean;
      snapshotId: string;
      generatedAt: string | null;
      summary: {
        totalInFile: number;
        totalNewToImport: number;
        totalDuplicatesSkipped: number;
      };
      modules: Record<
        string,
        {
          label: string;
          inFile: number;
          newToImport: number;
          duplicatesSkipped: number;
        }
      >;
    }>('/api/backup/restore-execute', {
      method: 'POST',
      body: JSON.stringify({ snapshot, filename }),
    }),
};



