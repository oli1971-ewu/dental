import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { Prescription, User } from '../types/index.ts';
import { downloadPrescriptionPdf, printPrescription } from '../utils/prescriptionPdf.ts';
import { formatDateDDMMYYYY } from '../utils/dateFormat.ts';
import {
  FileText,
  Plus,
  Search,
  Eye,
  Download,
  Printer,
  Copy,
  Edit2,
  Trash2,
  RotateCcw,
  Stethoscope,
  Lock,
  ShieldAlert,
  CheckCircle2,
  Clock,
} from 'lucide-react';

interface PrescriptionsPageProps {
  refreshKey?: number;
  onSelectPatient: (patientId: number) => void;
  onOpenCreatePrescription: () => void;
  onPreviewPrescription: (prescriptionId: number) => void;
  onEditDraftPrescription: (rx: Prescription) => void;
  onClonedPrescription: (newDraft: Prescription) => void;
}

export const PrescriptionsPage: React.FC<PrescriptionsPageProps> = ({
  refreshKey,
  onSelectPatient,
  onOpenCreatePrescription,
  onPreviewPrescription,
  onEditDraftPrescription,
  onClonedPrescription,
}) => {
  const { user, prescriptionManagementEnabled, featuresLoaded } = useAuth();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [doctorId, setDoctorId] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const isSuper = user?.role === 'main_doctor' || user?.role === 'developer';

  useEffect(() => {
    if (!prescriptionManagementEnabled) return;
    if (isSuper) {
      api.getDoctors().then(setDoctors).catch(() => {});
    }
  }, [prescriptionManagementEnabled, isSuper]);

  useEffect(() => {
    if (!prescriptionManagementEnabled) {
      setPrescriptions([]);
      setLoading(false);
      return;
    }
    loadPrescriptions();
  }, [
    prescriptionManagementEnabled,
    refreshKey,
    doctorId,
    statusFilter,
    fromDate,
    toDate,
    searchTerm,
  ]);

  const loadPrescriptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.getPrescriptions({
        doctorId: isSuper && doctorId !== 'All' ? doctorId : undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
        fromDate: fromDate.trim() || undefined,
        toDate: toDate.trim() || undefined,
        search: searchTerm.trim() || undefined,
      });
      setPrescriptions(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  };

  // Explicit Developer-Controlled Feature Disabled Screen (for direct/bookmarked URL access)
  if (featuresLoaded && !prescriptionManagementEnabled) {
    return (
      <div className="max-w-2xl mx-auto my-8 bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-xs space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-extrabold text-slate-900">
          Prescription Management Unavailable
        </h1>
        <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-4 py-3 rounded-xl inline-block">
          Prescription Management is currently disabled by the system developer.
        </p>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          All existing prescription records remain safely stored in PostgreSQL. Once enabled from the Developer Profile, prescriptions and history will reappear immediately.
        </p>
      </div>
    );
  }

  const handleDownloadPdf = async (rx: Prescription) => {
    setBusyId(rx.id);
    setError(null);
    try {
      await downloadPrescriptionPdf(rx);
    } catch (err: any) {
      setError(err.message || 'Failed to download PDF');
    } finally {
      setBusyId(null);
    }
  };

  const handleClone = async (rx: Prescription) => {
    setBusyId(rx.id);
    try {
      const cloned = await api.clonePrescription(rx.id);
      await loadPrescriptions();
      onClonedPrescription(cloned);
    } catch (err: any) {
      setError(err.message || 'Failed to clone prescription');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteDraft = async (id: number) => {
    setBusyId(id);
    try {
      await api.deletePrescription(id);
      setConfirmDeleteId(null);
      await loadPrescriptions();
    } catch (err: any) {
      setError(err.message || 'Failed to delete draft');
    } finally {
      setBusyId(null);
    }
  };

  const finalizedCount = prescriptions.filter((r) => r.status === 'Finalized').length;
  const draftCount = prescriptions.filter((r) => r.status === 'Draft').length;
  const revisedCount = prescriptions.filter((r) => r.status === 'Revised').length;

  const hasFilters =
    Boolean(searchTerm.trim()) ||
    doctorId !== 'All' ||
    statusFilter !== 'All' ||
    Boolean(fromDate) ||
    Boolean(toDate);

  const statusBadge = (status: string) => {
    if (status === 'Finalized') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    if (status === 'Revised') return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    return 'bg-amber-50 text-amber-800 border-amber-200';
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="w-5 h-5 text-teal-600" />
            <h1 className="text-xl font-bold text-slate-900">Prescription Management</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-200">
              {isSuper ? 'Clinic-Wide Register' : 'My Issued Prescriptions'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Create digital dental prescriptions, manage medicines and care instructions, track revisions, and export print-ready A4 PDFs.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenCreatePrescription}
          className="px-4 py-2 text-xs font-bold rounded-xl bg-teal-600 hover:bg-teal-700 text-white shadow-xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Prescription</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block mb-0.5">Total Listed</span>
          <span className="text-2xl font-extrabold text-slate-900 font-mono">
            {prescriptions.length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 flex items-center gap-1 mb-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Finalized (Locked)
          </span>
          <span className="text-2xl font-extrabold text-emerald-700 font-mono">
            {finalizedCount}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 flex items-center gap-1 mb-0.5">
            <Clock className="w-3.5 h-3.5 text-amber-600" /> Editable Drafts
          </span>
          <span className="text-2xl font-extrabold text-amber-700 font-mono">
            {draftCount}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block mb-0.5">Revised / Superseded</span>
          <span className="text-2xl font-extrabold text-indigo-700 font-mono">
            {revisedCount}
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search RX ID, Patient Name, Patient ID, Visit ID, Diagnosis..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {isSuper && (
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700"
            >
              <option value="All">All Doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700"
          >
            <option value="All">All Statuses</option>
            <option value="Finalized">Finalized Only</option>
            <option value="Draft">Drafts Only</option>
            <option value="Revised">Revised History</option>
          </select>

          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700"
            title="From Date"
          />

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="flex-1 px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700"
              title="To Date"
            />
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setDoctorId('All');
                  setStatusFilter('All');
                  setFromDate('');
                  setToDate('');
                }}
                className="p-2 rounded-lg border border-slate-300 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 cursor-pointer"
                title="Reset Filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Prescription ID</th>
                <th className="py-3 px-4">Patient</th>
                <th className="py-3 px-4">Prescribing Doctor</th>
                <th className="py-3 px-4">Date &amp; Visit</th>
                <th className="py-3 px-4">Diagnosis &amp; Rx Count</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center min-w-[240px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Loading prescriptions...
                  </td>
                </tr>
              ) : prescriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400 italic">
                    No prescriptions found matching your filters.
                  </td>
                </tr>
              ) : (
                prescriptions.map((rx) => {
                  const canModify = Boolean(user && (isSuper || rx.doctorId === user.id));
                  return (
                    <tr key={rx.id} className="hover:bg-teal-50/40 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-extrabold text-teal-800 font-mono">
                          {rx.prescriptionNumber}
                        </div>
                        {rx.revisionNumber > 1 && (
                          <div className="text-[10px] font-bold text-indigo-700">
                            Revision v{rx.revisionNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onSelectPatient(rx.patientId)}
                          className="text-left hover:underline cursor-pointer"
                        >
                          <div className="font-bold text-slate-900">{rx.patientName}</div>
                          <div className="text-[11px] font-mono text-teal-700">
                            {rx.patientCode} &bull; {rx.patientPhone}
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-medium">
                          <Stethoscope className="w-3 h-3 text-teal-600" />
                          {rx.doctorName}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{formatDateDDMMYYYY(rx.prescriptionDate)}</div>
                        <div className="text-[11px] font-mono text-slate-500">{rx.visitCode}</div>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-900 truncate">
                          {rx.diagnosis || 'General Dental Care'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {rx.medicines?.length || 0} medicine(s)
                          {(rx.treatmentPlanItems?.length || 0) > 0
                            ? ` • ${rx.treatmentPlanItems!.length} planned`
                            : ''}
                          {(rx.advisedTests?.length || 0) > 0
                            ? ` • ${rx.advisedTests!.length} test(s)`
                            : ''}
                          {rx.followUpDate ? ` • Follow-up: ${formatDateDDMMYYYY(rx.followUpDate)}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border ${statusBadge(
                            rx.status
                          )}`}
                        >
                          {rx.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {confirmDeleteId === rx.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-[11px] text-rose-700 font-semibold">Delete?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteDraft(rx.id)}
                              className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-[11px] cursor-pointer"
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded bg-slate-200 text-slate-700 font-semibold text-[11px] cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onPreviewPrescription(rx.id)}
                              className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Preview</span>
                            </button>
                            {rx.status === 'Draft' && canModify && (
                              <button
                                type="button"
                                onClick={() => onEditDraftPrescription(rx)}
                                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyId === rx.id}
                              onClick={() => handleDownloadPdf(rx)}
                              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Download className="w-3.5 h-3.5 text-teal-600" />
                              <span>PDF</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => printPrescription(rx)}
                              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                              title="Print Prescription (A4)"
                            >
                              <Printer className="w-3.5 h-3.5 text-slate-600" />
                              <span>Print</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyId === rx.id}
                              onClick={() => handleClone(rx)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Reuse as Template"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Reuse</span>
                            </button>
                            {rx.status === 'Draft' && canModify && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(rx.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="Delete Draft"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
