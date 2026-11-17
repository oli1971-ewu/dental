import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { Prescription, Visit, User } from '../types/index.ts';
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
  Calendar,
  Stethoscope,
  ShieldAlert,
} from 'lucide-react';

interface PatientPrescriptionHistoryProps {
  patientId: number;
  visits: Visit[];
  refreshKey?: number;
  onCreatePrescription: (visitId?: number) => void;
  onPreviewPrescription: (prescriptionId: number) => void;
  onEditDraftPrescription: (rx: Prescription) => void;
  onClonedPrescription: (newDraft: Prescription) => void;
}

export const PatientPrescriptionHistory: React.FC<PatientPrescriptionHistoryProps> = ({
  patientId,
  visits,
  refreshKey,
  onCreatePrescription,
  onPreviewPrescription,
  onEditDraftPrescription,
  onClonedPrescription,
}) => {
  const { user, prescriptionManagementEnabled } = useAuth();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('All');
  const [visitFilter, setVisitFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const isSuper = user?.role === 'main_doctor' || user?.role === 'developer';

  useEffect(() => {
    if (!prescriptionManagementEnabled) return;
    api.getDoctors().then(setDoctors).catch(() => {});
  }, [prescriptionManagementEnabled]);

  useEffect(() => {
    if (!prescriptionManagementEnabled) return;
    loadHistory();
  }, [patientId, refreshKey, prescriptionManagementEnabled]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.getPrescriptions({ patientId });
      setPrescriptions(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load prescription history');
    } finally {
      setLoading(false);
    }
  };

  if (!prescriptionManagementEnabled) {
    return null;
  }

  const filtered = prescriptions.filter((rx) => {
    if (doctorFilter !== 'All' && String(rx.doctorId) !== doctorFilter) return false;
    if (visitFilter !== 'All' && String(rx.visitId) !== visitFilter) return false;
    if (dateFilter && rx.prescriptionDate !== dateFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const hit =
        rx.prescriptionNumber.toLowerCase().includes(q) ||
        (rx.diagnosis || '').toLowerCase().includes(q) ||
        (rx.doctorName || '').toLowerCase().includes(q) ||
        (rx.visitCode || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const handleDownloadPdf = async (rx: Prescription) => {
    setBusyId(rx.id);
    setError(null);
    try {
      await downloadPrescriptionPdf(rx);
    } catch (err: any) {
      setError(err.message || 'Failed to generate PDF');
    } finally {
      setBusyId(null);
    }
  };

  const handleCloneAsNew = async (rx: Prescription) => {
    setBusyId(rx.id);
    try {
      const cloned = await api.clonePrescription(rx.id, 'auto');
      await loadHistory();
      onClonedPrescription(cloned);
    } catch (err: any) {
      setError(err.message || 'Failed to create prescription from template');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteDraft = async (id: number) => {
    setBusyId(id);
    try {
      await api.deletePrescription(id);
      setConfirmDeleteId(null);
      await loadHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to delete draft');
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'Finalized') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    if (status === 'Revised') return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    return 'bg-amber-50 text-amber-800 border-amber-200';
  };

  const hasFilters =
    Boolean(searchTerm.trim()) ||
    doctorFilter !== 'All' ||
    visitFilter !== 'All' ||
    Boolean(dateFilter);

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-600" />
            <span>Patient Prescription History ({prescriptions.length})</span>
          </h3>
          <p className="text-xs text-slate-500">
            View finalized and draft dental prescriptions, download A4 PDFs, print, or reuse any previous prescription as a template.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onCreatePrescription()}
          className="px-3.5 py-2 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Prescription</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="relative lg:col-span-2">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Prescription ID (RX-#), Diagnosis..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <select
          value={doctorFilter}
          onChange={(e) => setDoctorFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700"
        >
          <option value="All">All Doctors</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.fullName}
            </option>
          ))}
        </select>

        <select
          value={visitFilter}
          onChange={(e) => setVisitFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700"
        >
          <option value="All">All Associated Visits</option>
          {visits.map((v) => (
            <option key={v.id} value={v.id}>
              {v.visitId} ({formatDateDDMMYYYY(v.visitDate)})
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700"
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setDoctorFilter('All');
                setVisitFilter('All');
                setDateFilter('');
              }}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 cursor-pointer"
              title="Reset Filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Prescription History Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Prescription ID</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Doctor</th>
                <th className="py-3 px-4">Associated Visit</th>
                <th className="py-3 px-4">Diagnosis &amp; Medicines</th>
                <th className="py-3 px-4">Follow-Up</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center min-w-[260px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Loading prescription history...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                    {prescriptions.length === 0
                      ? 'No prescriptions created for this patient yet.'
                      : 'No prescriptions match the selected filters.'}
                  </td>
                </tr>
              ) : (
                filtered.map((rx) => {
                  const canModify = Boolean(user && (isSuper || rx.doctorId === user.id));
                  const linkedVisit = visits.find((v) => v.id === rx.visitId);
                  const medNames = (rx.medicines || [])
                    .map((m) => `${m.medicineName}${m.strength ? ` ${m.strength}` : ''}`)
                    .filter(Boolean);
                  const planSum = (rx.treatmentPlanItems || []).reduce(
                    (sum, item) => sum + (item.cost ? parseFloat(item.cost) : 0),
                    0
                  );
                  const testSum = (rx.advisedTests || []).reduce(
                    (sum, item) => sum + (item.cost ? parseFloat(item.cost) : 0),
                    0
                  );
                  return (
                    <tr key={rx.id} className="hover:bg-teal-50/40 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-extrabold text-teal-800 font-mono">
                          {rx.prescriptionNumber}
                        </div>
                        {rx.revisionNumber > 1 && (
                          <span className="text-[10px] font-bold text-indigo-700">
                            Revision v{rx.revisionNumber}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {formatDateDDMMYYYY(rx.prescriptionDate)}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-medium">
                          <Stethoscope className="w-3 h-3 text-teal-600" />
                          {rx.doctorName}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-700">{rx.visitCode}</div>
                        {linkedVisit?.visitDate && (
                          <div className="text-[10px] text-slate-500">
                            {formatDateDDMMYYYY(linkedVisit.visitDate)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-xs space-y-0.5">
                        <div className="font-semibold text-slate-900 truncate">
                          {rx.diagnosis || rx.chiefComplaints || 'General Dental Prescription'}
                        </div>
                        {medNames.length > 0 && (
                          <div className="text-[11px] text-teal-800 truncate">
                            Rx: {medNames.slice(0, 2).join(', ')}
                            {medNames.length > 2 ? ` +${medNames.length - 2} more` : ''}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-x-2">
                          <span>{rx.medicines?.length || 0} med(s)</span>
                          {(rx.treatmentPlanItems?.length || 0) > 0 && (
                            <span className="text-indigo-700 font-semibold">
                              • {rx.treatmentPlanItems!.length} plan{planSum > 0 ? ` (৳${planSum.toLocaleString()})` : ''}
                            </span>
                          )}
                          {(rx.advisedTests?.length || 0) > 0 && (
                            <span className="text-cyan-700 font-semibold">
                              • {rx.advisedTests!.length} test{testSum > 0 ? ` (৳${testSum.toLocaleString()})` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                        {rx.followUpDate ? formatDateDDMMYYYY(rx.followUpDate) : '-'}
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
                            <span className="text-[11px] font-semibold text-rose-700">Delete draft?</span>
                            <button
                              type="button"
                              disabled={busyId === rx.id}
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
                              className="px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                              title="View & Print Prescription"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>

                            {rx.status === 'Draft' && canModify && (
                              <button
                                type="button"
                                onClick={() => onEditDraftPrescription(rx)}
                                className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                                title="Edit Draft Prescription"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={busyId === rx.id}
                              onClick={() => handleDownloadPdf(rx)}
                              className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Download A4 PDF"
                            >
                              <Download className="w-3.5 h-3.5 text-teal-600" />
                              <span>PDF</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => printPrescription(rx)}
                              className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                              title="Print Prescription (A4)"
                            >
                              <Printer className="w-3.5 h-3.5 text-slate-600" />
                              <span>Print</span>
                            </button>

                            <button
                              type="button"
                              disabled={busyId === rx.id}
                              onClick={() => handleCloneAsNew(rx)}
                              className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Create New Prescription Using Previous Prescription as Template"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Reuse</span>
                            </button>

                            {rx.status === 'Draft' && canModify && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(rx.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="Delete Draft Prescription"
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
