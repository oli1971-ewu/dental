import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { User, BackupPreviewResponse, BackupHistoryLog } from '../types/index.ts';
import { formatDateDDMMYYYY } from '../utils/dateFormat.ts';
import {
  Download,
  FileSpreadsheet,
  Archive,
  ShieldCheck,
  Calendar,
  Filter,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Database,
  History,
  Eye,
  Lock,
  Users,
  Stethoscope,
  CreditCard,
  FileText,
  Activity,
  Wallet,
  Pill,
  X,
  Upload,
} from 'lucide-react';

const DATE_PRESETS = [
  { id: 'all', label: 'All Time (100% History)' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7days', label: 'Last 7 Days' },
  { id: '30days', label: 'Last 30 Days' },
  { id: '90days', label: 'Last 90 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Previous Month' },
  { id: 'this_year', label: 'This Year' },
  { id: 'custom', label: 'Custom Date Range' },
];

interface ModuleExportCardConfig {
  key: string;
  title: string;
  filename: string;
  endpoint: string;
  description: string;
  icon: any;
  adminOnly?: boolean;
}

const MODULE_CARDS: ModuleExportCardConfig[] = [
  {
    key: 'patients',
    title: 'Patients Directory (Patients.csv)',
    filename: 'Patients.csv',
    endpoint: '/api/export/patients.csv',
    description: 'Demographics, phone, medical history, allergies, and cumulative billing totals.',
    icon: Users,
  },
  {
    key: 'doctors',
    title: 'Doctors & Staff (Doctors.csv)',
    filename: 'Doctors.csv',
    endpoint: '/api/export/doctors.csv',
    description: 'Doctor profiles, specializations, qualifications, BMDC numbers, and status.',
    icon: Stethoscope,
    adminOnly: true,
  },
  {
    key: 'appointments',
    title: 'Appointments & Follow-ups (Appointments.csv)',
    filename: 'Appointments.csv',
    endpoint: '/api/export/appointments.csv',
    description: 'Scheduled follow-ups, reasons, attending doctors, and appointment statuses.',
    icon: Calendar,
  },
  {
    key: 'visits',
    title: 'Clinic Visits (Visits.csv)',
    filename: 'Visits.csv',
    endpoint: '/api/export/visits.csv',
    description: 'Consultations, chief complaints, clinical diagnoses, fees, and visit balances.',
    icon: Activity,
  },
  {
    key: 'treatments',
    title: 'Dental Treatments (Treatments.csv)',
    filename: 'Treatments.csv',
    endpoint: '/api/export/treatments.csv',
    description: 'Procedures performed, tooth numbers, clinical descriptions, and procedure costs.',
    icon: Stethoscope,
  },
  {
    key: 'diagnostic_tests',
    title: 'Diagnostic Tests & X-Rays (Diagnostic_Tests.csv)',
    filename: 'Diagnostic_Tests.csv',
    endpoint: '/api/export/diagnostic-tests.csv',
    description: 'Dental X-rays, OPG, IOPA, CBCT orders, categories, and test charges.',
    icon: Activity,
  },
  {
    key: 'prescriptions',
    title: 'Digital Prescriptions (Prescriptions.csv)',
    filename: 'Prescriptions.csv',
    endpoint: '/api/export/prescriptions.csv',
    description: 'Prescriptions, complaints, diagnoses, prescribed medicines, and advice.',
    icon: FileText,
  },
  {
    key: 'payments',
    title: 'Payments & Collections (Payments.csv)',
    filename: 'Payments.csv',
    endpoint: '/api/export/payments.csv',
    description: 'Cash, bKash, Nagad, and Bank collections with transaction references.',
    icon: CreditCard,
  },
  {
    key: 'salary_payroll',
    title: 'Doctor Salary Sheet (Salary_Payroll.csv)',
    filename: 'Salary_Payroll.csv',
    endpoint: '/api/export/salary-payroll.csv',
    description: 'Monthly fixed, daily rate, and commission payroll records with due balances.',
    icon: Wallet,
    adminOnly: true,
  },
  {
    key: 'salary_payments',
    title: 'Salary Disbursements (Salary_Payments.csv)',
    filename: 'Salary_Payments.csv',
    endpoint: '/api/export/salary-payments.csv',
    description: 'Individual partial and full salary payment transactions paid to doctors.',
    icon: Wallet,
    adminOnly: true,
  },
  {
    key: 'medicine_database',
    title: 'Medicine Catalog (Medicine_Database.csv)',
    filename: 'Medicine_Database.csv',
    endpoint: '/api/export/medicines.csv',
    description: 'Bangladesh medicine catalog brands, generics, strengths, and manufacturers.',
    icon: Pill,
    adminOnly: true,
  },
  {
    key: 'audit_logs',
    title: 'System Audit Logs (Audit_Logs.csv)',
    filename: 'Audit_Logs.csv',
    endpoint: '/api/export/audit-logs.csv',
    description: 'Security and operational audit log trail across clinic users.',
    icon: ShieldCheck,
    adminOnly: true,
  },
];

export const ExportsPage: React.FC = () => {
  const { user } = useAuth();
  const isClinicWideRole = user?.role === 'developer' || user?.role === 'main_doctor';

  const [preset, setPreset] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all');
  const [doctors, setDoctors] = useState<User[]>([]);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<BackupPreviewResponse | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [historyLogs, setHistoryLogs] = useState<BackupHistoryLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Non-Duplicating Backup Restore / Import State (Super Admin & Developer)
  const [restoreFilename, setRestoreFilename] = useState<string>('');
  const [restoreSnapshotObj, setRestoreSnapshotObj] = useState<any | null>(null);
  const [restorePreview, setRestorePreview] = useState<any | null>(null);
  const [restoreAnalyzing, setRestoreAnalyzing] = useState(false);
  const [restoreExecuting, setRestoreExecuting] = useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);

  const visibleModules = MODULE_CARDS.filter((m) => !m.adminOnly || isClinicWideRole);
  const [selectedModules, setSelectedModules] = useState<string[]>(() =>
    visibleModules.map((m) => m.key)
  );

  const loadHistoryAndDoctors = async () => {
    setHistoryLoading(true);
    try {
      const [hist, docs] = await Promise.all([
        api.getBackupHistory().catch(() => []),
        isClinicWideRole ? api.getDoctors().catch(() => []) : Promise.resolve([]),
      ]);
      setHistoryLogs(hist || []);
      setDoctors(docs || []);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistoryAndDoctors();
  }, [isClinicWideRole]);

  const fetchPreview = async (openModal = false) => {
    if (preset === 'custom' && fromDate && toDate && fromDate > toDate) {
      setFeedback({
        type: 'error',
        message: 'Invalid Date Range: "From Date" cannot be later than "To Date".',
      });
      return;
    }

    setPreviewLoading(true);
    setFeedback(null);
    try {
      const data = await api.previewBackup({
        preset,
        fromDate: preset === 'custom' ? fromDate : undefined,
        toDate: preset === 'custom' ? toDate : undefined,
        doctorId: isClinicWideRole && selectedDoctorId !== 'all' ? Number(selectedDoctorId) : null,
        selectedModules,
      });
      setPreviewData(data);
      if (openModal) {
        setConfirmModalOpen(true);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to preview backup counts' });
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    fetchPreview(false);
  }, [preset, fromDate, toDate, selectedDoctorId]);

  const handleConfirmZipDownload = async () => {
    setDownloadingKey('zip-backup');
    setFeedback(null);
    try {
      const filename = await api.downloadZipBackup({
        preset,
        fromDate: preset === 'custom' ? fromDate : undefined,
        toDate: preset === 'custom' ? toDate : undefined,
        doctorId: isClinicWideRole && selectedDoctorId !== 'all' ? Number(selectedDoctorId) : null,
        selectedModules,
      });
      setConfirmModalOpen(false);
      setFeedback({
        type: 'success',
        message: `Backup archive "${filename}" generated and downloaded (includes /csv/*.csv, manifest.json, and README.txt).`,
      });
      loadHistoryAndDoctors();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'ZIP backup generation failed' });
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleDownloadRecoverySnapshot = async () => {
    setDownloadingKey('recovery-snapshot');
    setFeedback(null);
    try {
      const filename = await api.downloadRecoverySnapshot();
      setFeedback({
        type: 'success',
        message: `Full Database Recovery Snapshot "${filename}" downloaded. Use this file anytime to restore data without duplicates.`,
      });
      loadHistoryAndDoctors();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Recovery snapshot failed' });
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleSelectRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    setRestoreFilename(file.name);
    setRestoreAnalyzing(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setRestoreSnapshotObj(parsed);
      const preview = await api.previewRestoreBackup(parsed);
      setRestorePreview(preview);
      setRestoreModalOpen(true);
    } catch (err: any) {
      setRestoreSnapshotObj(null);
      setRestorePreview(null);
      setFeedback({
        type: 'error',
        message:
          err.message ||
          'Invalid backup file. Please select a valid Clinic_Recovery_Snapshot_*.json or recovery_snapshot.json file.',
      });
    } finally {
      setRestoreAnalyzing(false);
      e.target.value = '';
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreSnapshotObj) return;
    setRestoreExecuting(true);
    setFeedback(null);
    try {
      const res = await api.executeRestoreBackup(restoreSnapshotObj, restoreFilename);
      setRestoreModalOpen(false);
      setRestoreSnapshotObj(null);
      setRestorePreview(null);
      setFeedback({
        type: 'success',
        message: `Restore Complete: Imported ${res.summary.totalNewToImport.toLocaleString()} new record(s) and safely skipped ${res.summary.totalDuplicatesSkipped.toLocaleString()} existing duplicate record(s).`,
      });
      await loadHistoryAndDoctors();
      await fetchPreview(false);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to restore backup snapshot.',
      });
    } finally {
      setRestoreExecuting(false);
    }
  };

  const handleDownloadSingleCsv = async (mod: ModuleExportCardConfig) => {
    if (preset === 'custom' && fromDate && toDate && fromDate > toDate) {
      setFeedback({
        type: 'error',
        message: 'Invalid Date Range: "From Date" cannot be later than "To Date".',
      });
      return;
    }

    setDownloadingKey(mod.key);
    setFeedback(null);
    try {
      const q = new URLSearchParams();
      q.append('preset', preset);
      if (preset === 'custom' && fromDate) q.append('fromDate', fromDate);
      if (preset === 'custom' && toDate) q.append('toDate', toDate);
      if (isClinicWideRole && selectedDoctorId !== 'all') {
        q.append('doctorId', selectedDoctorId);
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const outName = mod.filename.replace('.csv', `_${todayStr}.csv`);
      await api.downloadCsv(`${mod.endpoint}?${q.toString()}`, outName);
      setFeedback({
        type: 'success',
        message: `Downloaded ${outName} with UTF-8 BOM & formula sanitization.`,
      });
      loadHistoryAndDoctors();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || `Failed to export ${mod.title}` });
    } finally {
      setDownloadingKey(null);
    }
  };

  const toggleModuleSelection = (key: string) => {
    setSelectedModules((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-2xl p-6 text-white shadow-sm border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-bold">
              {isClinicWideRole ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Super Admin &amp; Developer · Complete Clinic Data Backup</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Doctor-Scoped Security · My Personal Clinical Data Backup</span>
                </>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              {isClinicWideRole
                ? 'Complete Clinic Data Backup & CSV Export Center'
                : 'Download My Data Backup & Clinical CSV Exports'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              {isClinicWideRole
                ? 'Generate structured multi-CSV ZIP backup archives (with manifest.json & README.txt), full JSON recovery snapshots, or individual module CSV spreadsheets.'
                : `Your exports are strictly scoped to your own clinical records (${user?.fullName}) — your patients, visits, treatments, diagnostic tests, prescriptions, appointments, and payments.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => fetchPreview(true)}
              disabled={previewLoading || downloadingKey === 'zip-backup'}
              className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              {downloadingKey === 'zip-backup' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              <span>
                {isClinicWideRole && selectedDoctorId === 'all'
                  ? 'Download Complete Clinic ZIP Backup'
                  : 'Download Doctor Data ZIP Backup'}
              </span>
            </button>

            {isClinicWideRole && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadRecoverySnapshot}
                  disabled={downloadingKey === 'recovery-snapshot'}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer"
                >
                  {downloadingKey === 'recovery-snapshot' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Database className="w-4 h-4 text-teal-400" />
                  )}
                  <span>Download Recovery Snapshot (.json)</span>
                </button>

                <label className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer">
                  {restoreAnalyzing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>{restoreAnalyzing ? 'Analyzing Backup...' : 'Import / Restore Backup (.json)'}</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleSelectRestoreFile}
                    className="hidden"
                  />
                </label>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline opacity-75 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter & Scope Control Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900">
              1. Configure Backup Date Range &amp; Data Scope
            </h2>
          </div>
          {previewData && (
            <div className="text-xs text-slate-600 flex items-center gap-2">
              <span className="font-semibold text-slate-800">Scope:</span>
              <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-bold border border-teal-200">
                {previewData.scopeLabel}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold">
                {previewData.totalRecords.toLocaleString()} Matching Records
              </span>
            </div>
          )}
        </div>

        {/* Date Preset Chips */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
            Select Date Range Filter
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  preset === p.id
                    ? 'bg-teal-600 text-white border-teal-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range + Admin Doctor Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          {preset === 'custom' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                />
              </div>
            </>
          )}

          {isClinicWideRole && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Doctor Scope Filter (Admin / Developer Option)
              </label>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
              >
                <option value="all">All Clinic Doctors (Complete Clinic Backup)</option>
                {doctors.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.fullName} ({d.role === 'main_doctor' ? 'Main Doctor' : 'Doctor'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Individual Module CSV Export Cards */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              2. Individual Module CSV Exports &amp; ZIP Archive Selection
            </h2>
            <p className="text-xs text-slate-500">
              Download any individual module as a standalone UTF-8 CSV file, or check/uncheck modules to include in your ZIP archive.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedModules(visibleModules.map((m) => m.key))}
              className="text-xs font-bold text-teal-700 hover:underline cursor-pointer"
            >
              Select All ({visibleModules.length})
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={() => fetchPreview(true)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview &amp; Download ZIP ({selectedModules.length} modules)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleModules.map((mod) => {
            const Icon = mod.icon;
            const count = previewData?.recordCounts?.[mod.key] ?? 0;
            const isChecked = selectedModules.includes(mod.key);
            const isDownloading = downloadingKey === mod.key;

            return (
              <div
                key={mod.key}
                className={`bg-white rounded-2xl border p-4 flex flex-col justify-between transition-all ${
                  isChecked ? 'border-teal-500/60 shadow-2xs' : 'border-slate-200 opacity-80'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900">{mod.title}</h3>
                        <span className="text-[11px] font-bold text-teal-700">
                          {previewLoading ? 'Calculating...' : `${count.toLocaleString()} records`}
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleModuleSelection(mod.key)}
                      className="w-4 h-4 accent-teal-600 rounded cursor-pointer mt-1"
                      title="Include in ZIP Archive"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2.5 leading-relaxed">{mod.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-slate-400">csv/{mod.filename}</span>
                  <button
                    type="button"
                    disabled={isDownloading}
                    onClick={() => handleDownloadSingleCsv(mod)}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {isDownloading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                    <span>Download CSV</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Non-Duplicating Backup Import / Restore Section (Super Admin & Developer Only) */}
      {isClinicWideRole && (
        <div className="bg-gradient-to-r from-amber-50/80 via-white to-teal-50/50 rounded-2xl border border-amber-200 p-5 shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-extrabold text-slate-900">
                  3. Import &amp; Restore Backup Snapshot (Smart Zero-Duplicate Engine)
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Duplicate Prevention Active
                </span>
              </div>
              <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
                Upload a <strong>Clinic_Recovery_Snapshot_YYYY-MM-DD.json</strong> file (or <strong>recovery_snapshot.json</strong> extracted from your Clinic ZIP Backup). The system automatically checks natural IDs and composite keys (Patient ID / Phone, Visit ID, Prescription Code, Payment ID, Salary Code) so <strong>existing records are never duplicated</strong>—only missing or newly added records are imported.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadRecoverySnapshot}
                disabled={downloadingKey === 'recovery-snapshot'}
                className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Database className="w-3.5 h-3.5 text-teal-600" />
                <span>1. Download .JSON Snapshot</span>
              </button>

              <label className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer">
                {restoreAnalyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>{restoreAnalyzing ? 'Scanning for Duplicates...' : '2. Upload .JSON to Restore'}</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleSelectRestoreFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Backup & Export History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900">
              {isClinicWideRole ? '4.' : '3.'} Backup, Export &amp; Restore History Log ({historyLogs.length})
            </h2>
          </div>
          <span className="text-[11px] text-slate-500">
            {isClinicWideRole ? 'Showing all clinic backup & restore events' : 'Showing your personal backup events'}
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                <th className="py-2.5 px-3">Backup Code</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Requested By</th>
                <th className="py-2.5 px-3">Format / Type</th>
                <th className="py-2.5 px-3">Date Filter</th>
                <th className="py-2.5 px-3">Records</th>
                <th className="py-2.5 px-3">Filename</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {historyLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Loading backup history...
                  </td>
                </tr>
              ) : historyLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No backup or CSV downloads recorded yet.
                  </td>
                </tr>
              ) : (
                historyLogs.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{h.backupCode}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                      {formatDateDDMMYYYY(h.createdAt)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-slate-800">{h.requestedByName}</span>
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                        {h.userRole}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-bold text-[10px]">
                        {h.exportFormat} · {h.backupType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 uppercase text-[11px] font-semibold">
                      {h.datePreset}
                      {h.fromDate ? ` (${formatDateDDMMYYYY(h.fromDate)} - ${formatDateDDMMYYYY(h.toDate)})` : ''}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {(h.totalRecords || 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">{h.filename}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                        {h.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backup Preview & Confirmation Modal */}
      {confirmModalOpen && previewData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Archive className="w-5 h-5 text-teal-400" />
                <div>
                  <h3 className="text-sm font-bold">Confirm Structured ZIP Backup Archive</h3>
                  <p className="text-[11px] text-slate-400">Review estimated record counts before downloading</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Backup Scope:</span>
                  <span className="font-bold text-slate-900">{previewData.scopeLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Date Filter:</span>
                  <span className="font-bold text-teal-700 uppercase">
                    {previewData.dateFilter.preset}
                    {previewData.dateFilter.fromDate
                      ? ` (${formatDateDDMMYYYY(previewData.dateFilter.fromDate)} to ${formatDateDDMMYYYY(
                          previewData.dateFilter.toDate
                        )})`
                      : ' (All Historical Records)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Total Records Included:</span>
                  <span className="font-extrabold text-slate-900 text-sm">
                    {previewData.totalRecords.toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <div className="font-bold text-slate-700 mb-2">
                  Files Inside ZIP Package (/csv/*.csv + manifest.json + README.txt):
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {Object.entries(previewData.recordCounts).map(([modKey, cnt]) => (
                    <div
                      key={modKey}
                      className="p-2.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between"
                    >
                      <span className="font-semibold text-slate-700 capitalize">
                        {modKey.replace(/_/g, ' ')}
                      </span>
                      <span className="font-bold text-teal-700">{cnt.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setConfirmModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={downloadingKey === 'zip-backup'}
                  onClick={handleConfirmZipDownload}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  {downloadingKey === 'zip-backup' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Generate &amp; Download .ZIP Archive</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore / Import Pre-Flight De-Duplication Preview Modal */}
      {restoreModalOpen && restorePreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Upload className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold">
                    Confirm Non-Duplicating Backup Import ({restoreFilename})
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Pre-import scan complete — existing duplicate records will be safely skipped
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRestoreModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Summary KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[11px] text-slate-500 block font-semibold">Total in Backup File</span>
                  <strong className="text-lg font-extrabold text-slate-900">
                    {restorePreview.summary.totalInFile.toLocaleString()}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                  <span className="text-[11px] text-emerald-700 block font-bold">New Records to Import</span>
                  <strong className="text-lg font-extrabold text-emerald-800">
                    +{restorePreview.summary.totalNewToImport.toLocaleString()}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center">
                  <span className="text-[11px] text-amber-800 block font-bold">Duplicates Prevented (Skipped)</span>
                  <strong className="text-lg font-extrabold text-amber-900">
                    {restorePreview.summary.totalDuplicatesSkipped.toLocaleString()}
                  </strong>
                </div>
              </div>

              {/* Per-Module Breakdown Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      <th className="py-2 px-3">Module</th>
                      <th className="py-2 px-3 text-right">In Backup File</th>
                      <th className="py-2 px-3 text-right text-emerald-700">New (Will Import)</th>
                      <th className="py-2 px-3 text-right text-amber-700">Already Exists (Skip)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(restorePreview.modules).map(([key, m]: [string, any]) => (
                      <tr key={key} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-slate-800">{m.label}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">{m.inFile}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                          {m.newToImport > 0 ? `+${m.newToImport}` : '0'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-amber-700">
                          {m.duplicatesSkipped}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-[11px] leading-relaxed">
                <strong>Zero Duplicate Guarantee:</strong> Existing patients, visits, treatments, diagnostic tests, prescriptions, payments, and salary entries matched by their unique codes or clinical keys are untouched. Only the <strong>{restorePreview.summary.totalNewToImport}</strong> new record(s) will be inserted and linked.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRestoreModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={restoreExecuting}
                  onClick={handleExecuteRestore}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {restoreExecuting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>
                    {restoreExecuting
                      ? 'Importing Records...'
                      : `Confirm & Import ${restorePreview.summary.totalNewToImport} New Record(s)`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
