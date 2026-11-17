import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { Prescription } from '../types/index.ts';
import {
  BANGLA_CARE_CATEGORIES,
  downloadPrescriptionPdf,
  formatBanglaDate,
  printPrescription,
} from '../utils/prescriptionPdf.ts';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '../utils/dateFormat.ts';
import {
  X,
  Printer,
  Download,
  Edit2,
  CheckCircle2,
  GitBranch,
  Copy,
  ShieldAlert,
  Clock,
  Lock,
  History,
  AlertTriangle,
  FileText,
  Sparkles,
} from 'lucide-react';

interface PrescriptionPreviewModalProps {
  isOpen: boolean;
  prescriptionId: number | null;
  onClose: () => void;
  onEditDraft?: (rx: Prescription) => void;
  onCreatedNewDraft?: (rx: Prescription) => void;
  onUpdated?: () => void;
}

export const PrescriptionPreviewModal: React.FC<PrescriptionPreviewModalProps> = ({
  isOpen,
  prescriptionId,
  onClose,
  onEditDraft,
  onCreatedNewDraft,
  onUpdated,
}) => {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<number | null>(prescriptionId);
  const [rx, setRx] = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Inline confirmation / revision / clone states (never window.confirm / window.alert)
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [showCloneVisitPicker, setShowCloneVisitPicker] = useState(false);
  const [patientVisits, setPatientVisits] = useState<any[]>([]);
  const [cloneVisitId, setCloneVisitId] = useState<number | 'auto'>('auto');
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);

  useEffect(() => {
    setActiveId(prescriptionId);
  }, [prescriptionId]);

  useEffect(() => {
    if (isOpen && activeId) {
      loadPrescription(activeId);
    } else if (!isOpen) {
      setRx(null);
      setError(null);
      setConfirmFinalize(false);
      setShowRevisionForm(false);
      setShowCloneVisitPicker(false);
      setActionFeedback(null);
    }
  }, [isOpen, activeId]);

  const loadPrescription = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPrescription(id);
      setRx(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load prescription preview.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isSuper = user?.role === 'main_doctor' || user?.role === 'developer';
  const canModify = Boolean(rx && user && (isSuper || rx.doctorId === user.id));

  const handleDownloadPdf = async () => {
    if (!rx) return;
    setActionLoading(true);
    setError(null);
    try {
      await downloadPrescriptionPdf(rx);
      setActionFeedback(`Downloaded A4 PDF (${rx.prescriptionNumber}).`);
      loadPrescription(rx.id);
    } catch (err: any) {
      setError(err.message || 'Failed to download PDF');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrint = () => {
    if (!rx) return;
    setError(null);
    try {
      printPrescription(rx);
      setActionFeedback(`Prepared print layout for ${rx.prescriptionNumber}.`);
    } catch (err: any) {
      setError(err.message || 'Unable to print prescription.');
    }
  };

  const handleFinalize = async () => {
    if (!rx) return;
    setActionLoading(true);
    setError(null);
    try {
      const updated = await api.finalizePrescription(rx.id);
      setConfirmFinalize(false);
      setActionFeedback(`${updated.prescriptionNumber} has been finalized and locked.`);
      await loadPrescription(rx.id);
      onUpdated?.();
    } catch (err: any) {
      setError(err.message || 'Failed to finalize prescription');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rx) return;
    setActionLoading(true);
    setError(null);
    try {
      const revisedDraft = await api.revisePrescription(
        rx.id,
        revisionReason.trim() || 'Clinical update / medication adjustment'
      );
      setShowRevisionForm(false);
      setRevisionReason('');
      onUpdated?.();
      onCreatedNewDraft?.(revisedDraft);
    } catch (err: any) {
      setError(err.message || 'Failed to create prescription revision');
    } finally {
      setActionLoading(false);
    }
  };

  const openClonePicker = async () => {
    if (!rx) return;
    setCloneVisitId('auto');
    setShowCloneVisitPicker(true);
    try {
      const visitsList = await api.getVisits({ patientId: rx.patientId });
      setPatientVisits(visitsList);
    } catch {
      setPatientVisits([]);
    }
  };

  const handleConfirmClone = async () => {
    if (!rx) return;
    setActionLoading(true);
    setError(null);
    try {
      const clonedDraft = await api.clonePrescription(
        rx.id,
        cloneVisitId === 'auto' ? 'auto' : Number(cloneVisitId)
      );
      setShowCloneVisitPicker(false);
      onUpdated?.();
      onCreatedNewDraft?.(clonedDraft);
    } catch (err: any) {
      setError(err.message || 'Failed to create prescription from template');
    } finally {
      setActionLoading(false);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'Finalized') {
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    }
    if (status === 'Revised') {
      return 'bg-indigo-100 text-indigo-800 border-indigo-300';
    }
    return 'bg-amber-100 text-amber-800 border-amber-300';
  };

  const clinicName = rx?.clinic?.clinicName || 'Dental Care';
  const clinicAddress =
    rx?.clinic?.clinicAddress || 'House 42, Road 11, Banani, Dhaka-1213, Bangladesh';
  const clinicPhone = rx?.clinic?.clinicPhone || '+880 2-9876543, +880 1711-234567';

  const dentalInstructionRows = rx
    ? BANGLA_CARE_CATEGORIES.map((cat) => ({
        label: cat.titleBn,
        value: rx[cat.key] || '',
      })).filter((item) => item.value.trim().length > 0)
    : [];

  const formatCostDisplay = (val: number | string | null | undefined): string | null => {
    if (val === null || val === undefined || String(val).trim() === '') return null;
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    const formatted = Number.isInteger(n)
      ? n.toLocaleString('en-US')
      : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `৳ ${formatted}`;
  };

  const hasValidCost = (val: unknown): boolean => {
    if (val === null || val === undefined || String(val).trim() === '') return false;
    return Number.isFinite(Number(val));
  };

  const planItems = rx?.treatmentPlanItems || [];
  const advisedTestItems = rx?.advisedTests || [];
  const showPlanCosts = rx?.showPlanCosts !== false;
  const totalPlanCost = planItems.reduce(
    (sum, item) => (hasValidCost(item.cost) ? sum + Number(item.cost) : sum),
    0
  );
  const anyPlanCost = planItems.some((item) => hasValidCost(item.cost));
  const totalTestsCost = advisedTestItems.reduce(
    (sum, item) => (hasValidCost(item.cost) ? sum + Number(item.cost) : sum),
    0
  );
  const anyTestCost = advisedTestItems.some((item) => hasValidCost(item.cost));

  const formatRxDateDisplay = (isoDate?: string | null): string => {
    return formatDateDDMMYYYY(isoDate, '-');
  };

  const toBulletLines = (raw?: string | null): string[] => {
    if (!raw || !raw.trim()) return [];
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^[•\-*]\s*/, '').trim())
      .filter(Boolean);
  };

  const shortDosagePrefix = (dosageType?: string | null, medicineName?: string | null): string => {
    const dt = (dosageType || '').trim();
    if (!dt) return '';
    const name = (medicineName || '').trim().toLowerCase();
    if (/^(tab\.?|cap\.?|syp\.?|susp\.?|inj\.?|supp\.?|oint\.?|drops|gel)\b/i.test(name)) {
      return '';
    }
    const lower = dt.toLowerCase();
    if (lower.includes('tablet')) return 'Tab.';
    if (lower.includes('capsule')) return 'Cap.';
    if (lower.includes('syrup')) return 'Syp.';
    if (lower.includes('suspension')) return 'Susp.';
    if (lower.includes('drop')) return 'Drops';
    if (lower.includes('ointment')) return 'Oint.';
    if (lower.includes('injection')) return 'Inj.';
    if (lower.includes('suppository')) return 'Supp.';
    return dt;
  };

  const sidebarSections: { title: string; bullets: string[] }[] = [];
  if (rx) {
    const ccBullets = toBulletLines(rx.chiefComplaints);
    if (ccBullets.length > 0) sidebarSections.push({ title: 'Chief Complaint', bullets: ccBullets });

    const cfBullets = toBulletLines(rx.clinicalFindings);
    if (cfBullets.length > 0) sidebarSections.push({ title: 'Clinical Findings', bullets: cfBullets });

    const customList = rx.customSections || [];
    const postDiagRe = /investigat|test|plan|advice|differen|provisional/i;
    for (const sec of customList) {
      if (sec.heading?.trim() && sec.content?.trim() && !postDiagRe.test(sec.heading)) {
        const bullets = toBulletLines(sec.content);
        if (bullets.length > 0) sidebarSections.push({ title: sec.heading.trim(), bullets });
      }
    }

    const diagBullets = toBulletLines(rx.diagnosis);
    if (diagBullets.length > 0) sidebarSections.push({ title: 'Diagnosis', bullets: diagBullets });

    for (const sec of customList) {
      if (sec.heading?.trim() && sec.content?.trim() && postDiagRe.test(sec.heading)) {
        const bullets = toBulletLines(sec.content);
        if (bullets.length > 0) sidebarSections.push({ title: sec.heading.trim(), bullets });
      }
    }

    const tpBullets = toBulletLines(rx.treatmentPlan);
    if (tpBullets.length > 0) sidebarSections.push({ title: 'Treatment Plan Notes', bullets: tpBullets });

    if (advisedTestItems.length > 0) {
      sidebarSections.push({
        title: 'Investigation',
        bullets: advisedTestItems.map((t) => {
          const catPart = t.category ? ` [${t.category}]` : '';
          const costPart = showPlanCosts ? formatCostDisplay(t.cost) : null;
          const costSuffix = costPart ? ` (${costPart})` : '';
          const noteSuffix = t.notes?.trim() ? ` — ${t.notes.trim()}` : '';
          return `${t.testName}${catPart}${costSuffix}${noteSuffix}`;
        }),
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-100 rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden">
        {/* Top Modal Action Bar (Hidden in Print) */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-sm">
              Rx
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  {rx ? `Prescription ${rx.prescriptionNumber}` : 'Prescription Preview'}
                </h2>
                {rx && (
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold border ${statusBadge(
                      rx.status
                    )}`}
                  >
                    {rx.status}
                    {rx.revisionNumber > 1 ? ` · Rev v${rx.revisionNumber}` : ''}
                  </span>
                )}
              </div>
              {rx && (
                <p className="text-[11px] text-slate-500">
                  Patient: <strong className="text-slate-800">{rx.patientName}</strong> ({rx.patientCode}) &bull; Visit {rx.visitCode}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {rx && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-900 text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Prescription</span>
                </button>

                {rx.status === 'Draft' && canModify && (
                  <>
                    {onEditDraft && (
                      <button
                        type="button"
                        onClick={() => onEditDraft(rx)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-teal-600" />
                        <span>Edit Draft</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmFinalize(true)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Finalize</span>
                    </button>
                  </>
                )}

                {rx.status === 'Finalized' && canModify && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowRevisionForm((v) => !v);
                      setShowCloneVisitPicker(false);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>Create Revision</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={openClonePicker}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white hover:bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1.5 cursor-pointer"
                  title="Create a new draft prescription using this prescription as a template"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Use as Template</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
              aria-label="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contextual Action Panels (Hidden in Print) */}
        <div className="print:hidden">
          {error && (
            <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {actionFeedback && (
            <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {actionFeedback}
              </span>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                className="text-emerald-700 hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {confirmFinalize && rx && (
            <div className="mx-4 sm:mx-6 mt-3 p-4 rounded-xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5 text-amber-950">
                <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="block">Finalize &amp; Lock Prescription {rx.prescriptionNumber}?</strong>
                  <span className="text-amber-800">
                    Once finalized, the original prescription becomes immutable. Future changes will be tracked via formal Revisions.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmFinalize(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleFinalize}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer disabled:opacity-60"
                >
                  {actionLoading ? 'Finalizing...' : 'Confirm & Finalize'}
                </button>
              </div>
            </div>
          )}

          {showRevisionForm && rx && (
            <form
              onSubmit={handleCreateRevision}
              className="mx-4 sm:mx-6 mt-3 p-4 rounded-xl bg-indigo-50 border border-indigo-200 space-y-2.5 text-xs"
            >
              <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                <GitBranch className="w-4 h-4 text-indigo-700" />
                <span>Create Formal Revision of {rx.prescriptionNumber}</span>
              </div>
              <p className="text-indigo-800">
                The current finalized record will be preserved intact as &ldquo;Revised&rdquo;, and an editable v{(rx.revisionNumber || 1) + 1} draft will open immediately.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                  placeholder="Reason for revision (e.g., Changed antibiotic due to patient sensitivity)..."
                  className="flex-1 px-3 py-2 rounded-lg border border-indigo-300 bg-white text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowRevisionForm(false)}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer disabled:opacity-60"
                >
                  {actionLoading ? 'Creating...' : 'Create Revision Draft'}
                </button>
              </div>
            </form>
          )}

          {showCloneVisitPicker && rx && (
            <div className="mx-4 sm:mx-6 mt-3 p-4 rounded-xl bg-teal-50 border border-teal-200 space-y-2.5 text-xs">
              <div className="font-bold text-teal-950 flex items-center gap-1.5">
                <Copy className="w-4 h-4 text-teal-700" />
                <span>Create New Prescription Using {rx.prescriptionNumber} as Template</span>
              </div>
              <p className="text-teal-800">
                Generates a brand-new Draft with a unique Prescription ID without altering {rx.prescriptionNumber}. Select associated visit:
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={cloneVisitId}
                  onChange={(e) =>
                    setCloneVisitId(e.target.value === 'auto' ? 'auto' : parseInt(e.target.value, 10))
                  }
                  className="flex-1 px-3 py-2 rounded-lg border border-teal-300 bg-white text-slate-900 font-medium"
                >
                  <option value="auto">
                    + Create New Clinic Visit Automatically (Auto VST-#)
                  </option>
                  {patientVisits.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.visitId} &bull; {formatDateDDMMYYYY(v.visitDate)} &bull; {v.doctorName} ({v.diagnosis || 'Consultation'})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowCloneVisitPicker(false)}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleConfirmClone}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer disabled:opacity-60"
                >
                  {actionLoading ? 'Copying...' : 'Create New Draft Rx'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-5">
          {loading ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              Loading prescription layout...
            </div>
          ) : rx ? (
            <>
              {/* AUTHENTIC A4 PRESCRIPTION SHEET (Classic Two-Column Bangladeshi Clinical Format) */}
              <div
                id="printable-prescription-sheet"
                className="bg-white border border-slate-300 rounded-xl shadow-md max-w-[820px] mx-auto overflow-hidden text-slate-900 font-prescription flex flex-col justify-between min-h-[980px] print:min-h-[268mm]"
              >
                <div>
                  {/* Top Subtle Accent Rule */}
                  <div className="h-1.5 bg-slate-800" />

                  <div className="px-6 sm:px-8 pt-5 pb-3">
                    {/* TWO-COLUMN HEADER: Doctor Credentials (Left) & Clinic Chamber Info (Right) */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-3">
                      <div className="space-y-0.5 max-w-md">
                        <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-snug">
                          {rx.doctorName}
                        </h1>
                        {rx.doctorQualification && (
                          <div className="text-xs text-slate-700 leading-snug">
                            {rx.doctorQualification}
                          </div>
                        )}
                        <div className="text-xs sm:text-[13px] font-bold text-rose-800">
                          {rx.doctorDesignation || 'Dental Surgeon'}
                        </div>
                        <div className="text-xs font-bold text-teal-800">{clinicName}</div>
                        {rx.doctorRegistrationNumber && (
                          <div className="text-[11px] font-semibold text-slate-700">
                            Reg. No. {rx.doctorRegistrationNumber}
                          </div>
                        )}
                      </div>

                      <div className="sm:text-right space-y-0.5 max-w-xs sm:ml-auto">
                        <div className="text-lg sm:text-xl font-extrabold text-teal-800 tracking-tight leading-snug">
                          {clinicName}
                        </div>
                        <p className="text-xs text-slate-700 leading-snug">{clinicAddress}</p>
                        <p className="text-xs font-bold text-slate-900">
                          ফোন / Tel: {clinicPhone}
                        </p>
                        <p className="text-[11px] font-mono font-bold text-teal-800 pt-0.5">
                          Rx No: {rx.prescriptionNumber} &bull; {rx.status}
                          {rx.revisionNumber > 1 ? ` (v${rx.revisionNumber})` : ''}
                        </p>
                      </div>
                    </div>

                    {/* PATIENT META STRIP (Bounded Top & Bottom by Crisp Dark Rules) */}
                    <div className="border-y-2 border-slate-800 bg-slate-50/70 px-2.5 py-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs prescription-no-break">
                      <div>
                        <span className="font-bold text-slate-900">PID: </span>
                        <span className="font-mono font-bold text-slate-900">{rx.patientCode}</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-900">Name: </span>
                        <span className="font-bold text-slate-900">{rx.patientName}</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-900">Age: </span>
                        <span className="font-bold text-slate-900">
                          {rx.patientAge ? `${rx.patientAge} Y` : 'N/A'} / {rx.patientGender}
                        </span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-900">Date: </span>
                        <span className="font-bold text-slate-900">
                          {formatRxDateDisplay(rx.prescriptionDate)}
                        </span>
                      </div>

                      <div className="truncate">
                        <span className="font-semibold text-slate-700">Address: </span>
                        <span className="font-medium text-slate-800">
                          {rx.patientAddress || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">Phone: </span>
                        <span className="font-semibold text-slate-800">{rx.patientPhone}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">Visit Ref: </span>
                        <span className="font-mono font-semibold text-slate-800">
                          {rx.visitCode}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">Rx: </span>
                        <span className="font-mono font-bold text-teal-800">
                          {rx.prescriptionNumber}
                        </span>
                      </div>
                    </div>

                    {/* ALLERGY CLINICAL ALERT */}
                    {rx.patientAllergies &&
                      !['none', 'n/a', 'nil', '-'].includes(
                        rx.patientAllergies.trim().toLowerCase()
                      ) && (
                        <div className="px-2.5 py-1.5 bg-red-50 border-b border-slate-700 text-red-900 text-xs font-bold flex items-center gap-2 prescription-no-break">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <span>ALLERGY ALERT: {rx.patientAllergies}</span>
                        </div>
                      )}

                    {/* TWO-COLUMN CLINICAL BODY (Left Clinical Sidebar | Right Rx Medications) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 min-h-[680px]">
                      {/* LEFT COLUMN: Chief Complaint, History, On Examinations, Diagnosis, Investigations */}
                      <div className="md:col-span-4 md:border-r md:border-slate-700 pr-4 py-4 space-y-4 border-b md:border-b-0 border-slate-300">
                        {sidebarSections.length === 0 ? (
                          <div className="text-[11px] text-slate-400 italic">
                            No clinical notes or investigations recorded.
                          </div>
                        ) : (
                          sidebarSections.map((sec, idx) => (
                            <div key={idx} className="space-y-1 prescription-no-break">
                              <h3 className="text-[13px] font-extrabold text-slate-900 leading-tight">
                                {sec.title}
                              </h3>
                              <ul className="space-y-0.5 pl-2.5 text-xs text-slate-800">
                                {sec.bullets.map((line, bIdx) => (
                                  <li key={bIdx} className="flex items-start gap-1.5 leading-snug">
                                    <span className="font-bold text-slate-900 mt-0.2">•</span>
                                    <span>{line}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))
                        )}
                      </div>

                      {/* RIGHT COLUMN: Rx, Numbered Medicines with Dotted Leaders, Optional Plan, Care & Signature */}
                      <div className="md:col-span-8 md:pl-5 py-4 flex flex-col justify-between space-y-6">
                        <div className="space-y-4">
                          {/* Rx, Heading */}
                          <div className="text-2xl font-serif font-extrabold text-slate-900 leading-none">
                            Rx,
                          </div>

                          {/* Medications List */}
                          {rx.medicines.length === 0 && planItems.length === 0 ? (
                            <div className="py-4 text-slate-400 italic text-xs">
                              No medications listed on this prescription.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {rx.medicines.map((med, i) => {
                                const prefix = shortDosagePrefix(med.dosageType, med.medicineName);
                                const partLeft = [med.frequency?.trim(), med.dosage?.trim()]
                                  .filter(Boolean)
                                  .join(' · ');
                                const partMid = med.mealInstructions?.trim() || '';
                                const partRight = med.duration?.trim() || '';
                                const hasDosing = Boolean(partLeft || partMid || partRight);

                                return (
                                  <div
                                    key={med.id || i}
                                    className="space-y-0.5 prescription-no-break"
                                  >
                                    <div className="text-[13px] font-bold text-slate-900 leading-snug">
                                      <span>
                                        {i + 1}. {prefix ? `${prefix} ` : ''}
                                        {med.medicineName}
                                        {med.strength ? ` ${med.strength}` : ''}
                                      </span>
                                      {med.genericName && (
                                        <span className="font-normal text-slate-600 text-xs ml-1.5">
                                          ({med.genericName})
                                        </span>
                                      )}
                                    </div>

                                    {hasDosing && (
                                      <div className="pl-5 flex items-center gap-2 text-xs text-slate-800">
                                        {partLeft && (
                                          <span className="font-medium shrink-0">{partLeft}</span>
                                        )}

                                        {partLeft && (partMid || partRight) && (
                                          <span className="flex-1 border-b border-dashed border-slate-500 min-w-[20px] h-1" />
                                        )}

                                        {partMid && (
                                          <span className="font-medium shrink-0">{partMid}</span>
                                        )}

                                        {partMid && partRight && (
                                          <span className="flex-1 border-b border-dashed border-slate-500 min-w-[20px] h-1" />
                                        )}

                                        {partRight && (
                                          <span className="font-medium shrink-0">{partRight}</span>
                                        )}
                                      </div>
                                    )}

                                    {med.additionalNotes?.trim() && (
                                      <div className="pl-5 text-[11px] text-teal-800">
                                        Note: {med.additionalNotes.trim()}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* OPTIONAL RECOMMENDED TREATMENT PLAN */}
                          {planItems.length > 0 && (
                            <div className="pt-2 space-y-1.5 prescription-no-break">
                              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                                Recommended Treatment Plan:
                              </h3>
                              <div className="space-y-1 pl-2">
                                {planItems.map((item, idx) => {
                                  const costText = showPlanCosts
                                    ? formatCostDisplay(item.cost)
                                    : null;
                                  return (
                                    <div key={item.id || idx} className="text-xs">
                                      <div className="flex items-baseline justify-between gap-2">
                                        <span className="font-bold text-slate-900">
                                          {idx + 1}. {item.treatmentName}
                                          {item.toothNumber ? ` (Tooth: ${item.toothNumber})` : ''}
                                        </span>
                                        {costText && (
                                          <span className="font-bold text-teal-800 whitespace-nowrap tabular-nums">
                                            {costText}
                                          </span>
                                        )}
                                      </div>
                                      {item.notes && (
                                        <p className="text-slate-600 pl-4 text-[11px]">
                                          Note: {item.notes}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* OPTIONAL ESTIMATED COST SUMMARY */}
                          {showPlanCosts && (anyPlanCost || anyTestCost) && (
                            <div className="px-3 py-1.5 rounded bg-teal-50/80 border border-teal-200 flex flex-wrap items-center justify-between gap-2 text-xs prescription-no-break">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-semibold text-slate-700">
                                {anyPlanCost && (
                                  <span>
                                    Treatment Plan:{' '}
                                    <strong className="text-slate-900 tabular-nums">
                                      {formatCostDisplay(totalPlanCost)}
                                    </strong>
                                  </span>
                                )}
                                {anyTestCost && (
                                  <span>
                                    Advised Tests:{' '}
                                    <strong className="text-slate-900 tabular-nums">
                                      {formatCostDisplay(totalTestsCost)}
                                    </strong>
                                  </span>
                                )}
                              </div>
                              <div className="font-extrabold text-teal-800 text-xs tabular-nums">
                                Estimated Total: {formatCostDisplay(totalPlanCost + totalTestsCost)}
                              </div>
                            </div>
                          )}

                          {/* DENTAL CARE INSTRUCTIONS (BANGLA) */}
                          {dentalInstructionRows.length > 0 && (
                            <div className="pt-2 space-y-1 prescription-no-break">
                              <h3 className="text-xs font-extrabold text-teal-800">
                                দাঁতের যত্ন ও চিকিৎসা-পরবর্তী নির্দেশনা:
                              </h3>
                              <ul className="space-y-1 pl-2 text-[11px] text-slate-800">
                                {dentalInstructionRows.map((row) => (
                                  <li key={row.label} className="leading-snug">
                                    • <strong className="text-slate-900">{row.label}:</strong>{' '}
                                    {row.value}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* FOLLOW-UP DATE (BANGLA) */}
                          {rx.followUpDate && (
                            <div className="px-2.5 py-1.5 rounded bg-teal-50 border border-teal-200 text-xs font-bold text-teal-900 flex items-center gap-2 prescription-no-break">
                              <Clock className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                              <span>
                                পরবর্তী সাক্ষাতের তারিখ: {formatBanglaDate(rx.followUpDate)} (
                                {formatRxDateDisplay(rx.followUpDate)})
                              </span>
                            </div>
                          )}
                        </div>

                        {/* DOCTOR SIGNATURE (Bottom-Right of Rx Column) */}
                        <div className="pt-8 flex justify-end prescription-no-break">
                          <div className="text-right min-w-[200px]">
                            <div className="border-t border-dashed border-slate-600 pt-1.5">
                              <div className="text-xs font-extrabold text-slate-900">
                                {rx.doctorName}
                              </div>
                              <div className="text-[11px] text-slate-600">
                                {rx.doctorDesignation || 'Dental Surgeon'}
                                {rx.doctorRegistrationNumber
                                  ? ` • ${rx.doctorRegistrationNumber}`
                                  : ''}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3-COLUMN CHAMBER, BANGLA SAFETY BOX & PRESCRIPTION INFO FOOTER */}
                <div className="border-t-2 border-slate-800 bg-slate-100 px-6 sm:px-8 py-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-[11px] prescription-no-break">
                  <div className="md:col-span-4 space-y-0.5 text-slate-800 leading-snug">
                    <div className="font-bold text-slate-900">চেম্বার : {clinicName}</div>
                    <div>{clinicAddress}</div>
                    <div className="font-semibold">ফোন : {clinicPhone}</div>
                    {rx.doctorEmail && (
                      <div className="text-slate-600">ইমেইল : {rx.doctorEmail}</div>
                    )}
                  </div>

                  <div className="md:col-span-5 border border-slate-700 bg-white/60 px-2.5 py-1.5 text-[10.5px] text-slate-900 leading-snug space-y-0.5">
                    <div>
                      - কোন ঔষধ খেয়ে অসুবিধা বা পার্শ্ব প্রতিক্রিয়া হলে ঐ ঔষধ বন্ধ রেখে
                      ডাক্তারের পরামর্শ নিন অথবা নিকটস্থ ক্লিনিকে যোগাযোগ করুন।
                    </div>
                    <div>- জরুরী চিকিৎসার জন্য নিকটস্থ হাসপাতাল বা ক্লিনিকে যোগাযোগ করুন।</div>
                  </div>

                  <div className="md:col-span-3 md:text-right space-y-0.5 text-slate-800 leading-snug">
                    <div className="font-bold text-slate-900">প্রেসক্রিপশন তথ্য :</div>
                    <div className="font-mono font-bold text-teal-800">
                      নং : {rx.prescriptionNumber}
                    </div>
                    <div>তারিখ : {formatRxDateDisplay(rx.prescriptionDate)}</div>
                    {rx.followUpDate && (
                      <div className="font-semibold text-teal-900">
                        পরবর্তী সাক্ষাৎ : {formatRxDateDisplay(rx.followUpDate)}
                      </div>
                    )}
                    {rx.status === 'Draft' && (
                      <div className="text-amber-700 font-bold">DRAFT PREVIEW</div>
                    )}
                  </div>
                </div>
              </div>

              {/* REVISION LINEAGE & PRESCRIPTION AUDIT HISTORY (Hidden in Print) */}
              <div className="max-w-[820px] mx-auto bg-white rounded-xl border border-slate-200 p-4 space-y-3 print:hidden text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-800">
                    <History className="w-4 h-4 text-teal-600" />
                    <span>
                      Version Lineage ({rx.revisionLineage?.length || 1}) &amp; Audit Trail ({rx.auditLogs?.length || 0})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAuditDrawer((s) => !s)}
                    className="text-teal-700 font-semibold hover:underline cursor-pointer"
                  >
                    {showAuditDrawer ? 'Hide Details' : 'Inspect Revisions & Audit Log'}
                  </button>
                </div>

                {rx.revisionLineage && rx.revisionLineage.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {rx.revisionLineage.map((ver) => (
                      <button
                        key={ver.id}
                        type="button"
                        onClick={() => setActiveId(ver.id)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                          ver.id === rx.id
                            ? 'bg-teal-600 text-white border-teal-700'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <FileText className="w-3 h-3" />
                        <span>
                          v{ver.revisionNumber}: {ver.prescriptionNumber} ({ver.status})
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {showAuditDrawer && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    {rx.revisions && rx.revisions.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                          Revision Notes
                        </div>
                        {rx.revisions.map((rev) => (
                          <div
                            key={rev.id}
                            className="p-2.5 rounded-lg bg-indigo-50/60 border border-indigo-200 flex items-center justify-between gap-2"
                          >
                            <div>
                              <span className="font-bold text-indigo-900">
                                Revision v{rev.revisionNumber}:
                              </span>{' '}
                              <span className="text-slate-700">
                                {rev.revisionReason || 'Clinical revision'}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500">
                              {rev.createdByName} &bull; {formatDateTimeDDMMYYYY(rev.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                        Prescription Audit Trail
                      </div>
                      {rx.auditLogs && rx.auditLogs.length > 0 ? (
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                          {rx.auditLogs.map((log) => (
                            <div
                              key={log.id}
                              className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-slate-50/40"
                            >
                              <div>
                                <span className="font-bold text-teal-800 font-mono text-[11px]">
                                  {log.action}
                                </span>
                                <span className="text-slate-600 ml-2">{log.details}</span>
                              </div>
                              <span className="text-[11px] text-slate-500 whitespace-nowrap">
                                {log.userName || log.userRole} &bull;{' '}
                                {formatDateTimeDDMMYYYY(log.createdAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-slate-400 italic">No audit entries yet.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
