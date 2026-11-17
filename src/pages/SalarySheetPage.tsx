import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import {
  DoctorSalary,
  DoctorSalaryType,
  DoctorSalaryStructure,
  DoctorSalaryStructureHistory,
  DoctorSalaryMetrics,
  User,
} from '../types/index.ts';
import { formatDateDDMMYYYY } from '../utils/dateFormat.ts';
import {
  Wallet,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Edit3,
  Trash2,
  Printer,
  Calculator,
  X,
  ShieldAlert,
  TrendingUp,
  Calendar,
  Percent,
  Sliders,
  History,
  Lock,
  DollarSign,
  FileSpreadsheet,
  Sparkles,
  Loader2,
} from 'lucide-react';

export const SalarySheetPage: React.FC = () => {
  const { user } = useAuth();
  const isAuthorized = user?.role === 'main_doctor' || user?.role === 'developer';

  const [activeTab, setActiveTab] = useState<'sheet' | 'structures' | 'reports'>('sheet');
  const [salaries, setSalaries] = useState<DoctorSalary[]>([]);
  const [structures, setStructures] = useState<DoctorSalaryStructure[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filters
  const [doctorFilter, setDoctorFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Auto-generate monthly payroll state
  const [genMonth, setGenMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [generatingMonth, setGeneratingMonth] = useState(false);

  // Add/Edit Payroll Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DoctorSalary | null>(null);
  const [saving, setSaving] = useState(false);

  // Salary Form State
  const [formDoctorId, setFormDoctorId] = useState<string>('');
  const [formType, setFormType] = useState<DoctorSalaryType>('Monthly');
  const [formPeriodLabel, setFormPeriodLabel] = useState<string>(() => {
    const now = new Date();
    return now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  });
  const [formPeriodStart, setFormPeriodStart] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [formPeriodEnd, setFormPeriodEnd] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [formBaseAmount, setFormBaseAmount] = useState<string>('');
  const [formDaysWorked, setFormDaysWorked] = useState<string>('1');
  const [formCommissionBasis, setFormCommissionBasis] = useState<'collected' | 'billed' | 'custom'>('collected');
  const [formCommissionSource, setFormCommissionSource] = useState<string>('');
  const [formCommissionRate, setFormCommissionRate] = useState<string>('30');
  const [formBonus, setFormBonus] = useState<string>('0');
  const [formDeduction, setFormDeduction] = useState<string>('0');
  const [formPaidAmount, setFormPaidAmount] = useState<string>('');
  const [formPaymentMethod, setFormPaymentMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank transfer' | 'Other'>('Cash');
  const [formTransactionRef, setFormTransactionRef] = useState<string>('');
  const [formPaymentDate, setFormPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState<string>('');

  const [metricsLoading, setMetricsLoading] = useState(false);
  const [doctorMetrics, setDoctorMetrics] = useState<DoctorSalaryMetrics | null>(null);

  // Record Partial/Full Salary Payment Modal
  const [payModalSalary, setPayModalSalary] = useState<DoctorSalary | null>(null);
  const [payForm, setPayForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash',
    transactionRef: '',
    notes: '',
  });
  const [savingPay, setSavingPay] = useState(false);

  // Authorized Adjustment Modal
  const [adjModalSalary, setAdjModalSalary] = useState<DoctorSalary | null>(null);
  const [adjForm, setAdjForm] = useState({
    adjustmentType: 'Allowance' as 'Allowance' | 'Deduction' | 'Correction',
    amount: '',
    reason: '',
  });
  const [savingAdj, setSavingAdj] = useState(false);

  // Structure Editor Modal
  const [structModalDoc, setStructModalDoc] = useState<DoctorSalaryStructure | null>(null);
  const [structForm, setStructForm] = useState({
    doctorId: 0,
    salaryType: 'Monthly' as DoctorSalaryType,
    baseRate: '',
    commissionRate: '0',
    commissionBasis: 'treatment_revenue' as 'treatment_revenue' | 'collected_payments' | 'eligible_charges',
    allowances: '0',
    deductions: '0',
    effectiveDate: new Date().toISOString().split('T')[0],
    reviewDate: '',
    notes: '',
    isActive: true,
    changeReason: '',
  });
  const [savingStruct, setSavingStruct] = useState(false);

  // Structure History Modal
  const [historyDoc, setHistoryDoc] = useState<{ doctorId: number; doctorName: string } | null>(null);
  const [structureHistory, setStructureHistory] = useState<DoctorSalaryStructureHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<DoctorSalary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Slip Preview State
  const [slipRecord, setSlipRecord] = useState<DoctorSalary | null>(null);

  const loadAllPayrollData = async () => {
    if (!isAuthorized) return;
    setLoading(true);
    try {
      const [overview, docList] = await Promise.all([
        api.getPayrollOverview(monthFilter || undefined),
        api.getDoctors(),
      ]);
      setSalaries(overview.salaries || []);
      setStructures(overview.structures || []);
      setAllPayments(overview.allPayments || []);
      setAuditLogs(overview.auditLogs || []);
      setDoctors(docList || []);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load payroll data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllPayrollData();
  }, [isAuthorized, monthFilter]);

  // Filter salaries client-side for instant responsiveness
  const filteredSalaries = useMemo(() => {
    return salaries.filter((s) => {
      if (doctorFilter !== 'All' && String(s.doctorId) !== String(doctorFilter)) return false;
      if (typeFilter !== 'All' && s.salaryType !== typeFilter) return false;
      if (statusFilter !== 'All' && s.paymentStatus !== statusFilter) return false;
      if (monthFilter && (s.payrollMonth || s.paymentDate.slice(0, 7)) !== monthFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const match =
          s.salaryCode.toLowerCase().includes(q) ||
          (s.doctorName || '').toLowerCase().includes(q) ||
          (s.periodLabel || '').toLowerCase().includes(q) ||
          (s.notes || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [salaries, doctorFilter, typeFilter, statusFilter, monthFilter, searchQuery]);

  // Load live doctor metrics when doctor or period changes inside Add/Edit modal
  useEffect(() => {
    if (!modalOpen || !formDoctorId) {
      setDoctorMetrics(null);
      return;
    }
    const dId = parseInt(formDoctorId, 10);
    if (!dId || isNaN(dId)) return;

    let cancelled = false;
    setMetricsLoading(true);
    api
      .getDoctorSalaryMetrics({
        doctorId: dId,
        fromDate: formPeriodStart || undefined,
        toDate: formPeriodEnd || undefined,
      })
      .then((m) => {
        if (cancelled) return;
        setDoctorMetrics(m);
        if (!editingRecord) {
          if (formType === 'Daily' && m.uniqueDaysWorked > 0) {
            setFormDaysWorked(String(m.uniqueDaysWorked));
          }
          if (formType === 'Commission') {
            if (formCommissionBasis === 'collected') {
              setFormCommissionSource(String(m.totalCollectedForDoctorVisits));
            } else if (formCommissionBasis === 'billed') {
              setFormCommissionSource(String(m.totalTreatmentBill));
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMetricsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [modalOpen, formDoctorId, formPeriodStart, formPeriodEnd]);

  // Live calculation inside Add/Edit modal
  const liveCalculation = useMemo(() => {
    const base = Math.max(0, parseFloat(formBaseAmount) || 0);
    const days = Math.max(0, parseInt(formDaysWorked, 10) || 0);
    const commSource = Math.max(0, parseFloat(formCommissionSource) || 0);
    const commRate = Math.max(0, parseFloat(formCommissionRate) || 0);
    const bonus = Math.max(0, parseFloat(formBonus) || 0);
    const deduction = Math.max(0, parseFloat(formDeduction) || 0);

    let coreSalary = 0;
    let commEarned = 0;
    if (formType === 'Monthly') {
      coreSalary = base;
    } else if (formType === 'Daily') {
      coreSalary = base * (days > 0 ? days : 1);
    } else if (formType === 'Commission') {
      commEarned = Number(((commSource * commRate) / 100).toFixed(2));
      coreSalary = base + commEarned;
    }

    const totalPayable = Math.max(0, Number((coreSalary + bonus - deduction).toFixed(2)));
    const paid =
      formPaidAmount === ''
        ? totalPayable
        : Math.max(0, Number((parseFloat(formPaidAmount) || 0).toFixed(2)));
    const due = Math.max(0, Number((totalPayable - paid).toFixed(2)));

    return {
      coreSalary,
      commEarned,
      totalPayable,
      paid,
      due,
    };
  }, [
    formType,
    formBaseAmount,
    formDaysWorked,
    formCommissionSource,
    formCommissionRate,
    formBonus,
    formDeduction,
    formPaidAmount,
  ]);

  // Summary Metrics
  const summaryStats = useMemo(() => {
    let totalPayable = 0;
    let totalPaid = 0;
    let totalDue = 0;
    let monthlyTotal = 0;
    let dailyTotal = 0;
    let commissionTotal = 0;

    for (const s of filteredSalaries) {
      const payable = parseFloat(String(s.totalPayable || '0')) || 0;
      const paid = parseFloat(String(s.paidAmount || '0')) || 0;
      const due = parseFloat(String(s.dueAmount || '0')) || 0;

      totalPayable += payable;
      totalPaid += paid;
      totalDue += due;

      if (s.salaryType === 'Monthly') monthlyTotal += payable;
      else if (s.salaryType === 'Daily') dailyTotal += payable;
      else if (s.salaryType === 'Commission') commissionTotal += payable;
    }

    return {
      totalPayable,
      totalPaid,
      totalDue,
      monthlyTotal,
      dailyTotal,
      commissionTotal,
    };
  }, [filteredSalaries]);

  const handleAutoGenerateMonth = async () => {
    if (!genMonth) return;
    setGeneratingMonth(true);
    setFeedback(null);
    try {
      const res = await api.generateMonthlyPayroll(genMonth);
      await loadAllPayrollData();
      setFeedback({
        type: 'success',
        message: `Generated ${res.createdCount} monthly payroll record(s) for ${genMonth} (${res.skippedCount} already existed).`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to generate monthly payroll' });
    } finally {
      setGeneratingMonth(false);
    }
  };

  const openNewModal = () => {
    setEditingRecord(null);
    const defaultDoc = doctors[0];
    setFormDoctorId(defaultDoc ? String(defaultDoc.id) : '');
    setFormType('Monthly');
    const now = new Date();
    setFormPeriodLabel(now.toLocaleString('en-US', { month: 'long', year: 'numeric' }));
    setFormPeriodStart(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
    setFormPeriodEnd(now.toISOString().split('T')[0]);
    setFormBaseAmount('');
    setFormDaysWorked('1');
    setFormCommissionBasis('collected');
    setFormCommissionSource('');
    setFormCommissionRate('30');
    setFormBonus('0');
    setFormDeduction('0');
    setFormPaidAmount('');
    setFormPaymentMethod('Cash');
    setFormTransactionRef('');
    setFormPaymentDate(now.toISOString().split('T')[0]);
    setFormNotes('');
    setModalOpen(true);
  };

  const openEditModal = (rec: DoctorSalary) => {
    setEditingRecord(rec);
    setFormDoctorId(String(rec.doctorId));
    setFormType(rec.salaryType);
    setFormPeriodLabel(rec.periodLabel);
    setFormPeriodStart(rec.periodStart || '');
    setFormPeriodEnd(rec.periodEnd || '');
    setFormBaseAmount(String(rec.baseAmount || '0'));
    setFormDaysWorked(String(rec.daysWorked || 1));
    setFormCommissionBasis((rec.commissionBasis as any) || 'collected');
    setFormCommissionSource(String(rec.commissionSourceAmount || '0'));
    setFormCommissionRate(String(rec.commissionRate || '0'));
    setFormBonus(String(rec.bonusAmount || '0'));
    setFormDeduction(String(rec.deductionAmount || '0'));
    setFormPaidAmount(String(rec.paidAmount || '0'));
    setFormPaymentMethod((rec.paymentMethod as any) || 'Cash');
    setFormTransactionRef(rec.transactionRef || '');
    setFormPaymentDate(rec.paymentDate || new Date().toISOString().split('T')[0]);
    setFormNotes(rec.notes || '');
    setModalOpen(true);
  };

  const handleSaveSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDoctorId) {
      setFeedback({ type: 'error', message: 'Please select a doctor.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const payload: Partial<DoctorSalary> = {
        doctorId: parseInt(formDoctorId, 10),
        salaryType: formType,
        periodLabel: formPeriodLabel.trim(),
        periodStart: formPeriodStart || null,
        periodEnd: formPeriodEnd || null,
        baseAmount: String(parseFloat(formBaseAmount) || 0),
        daysWorked: parseInt(formDaysWorked, 10) || 0,
        commissionBasis: formCommissionBasis,
        commissionSourceAmount: String(parseFloat(formCommissionSource) || 0),
        commissionRate: String(parseFloat(formCommissionRate) || 0),
        bonusAmount: String(parseFloat(formBonus) || 0),
        deductionAmount: String(parseFloat(formDeduction) || 0),
        paidAmount: String(liveCalculation.paid),
        paymentMethod: formPaymentMethod,
        transactionRef: formTransactionRef.trim() || null,
        paymentDate: formPaymentDate,
        notes: formNotes.trim() || null,
      };

      if (editingRecord) {
        await api.updateDoctorSalary(editingRecord.id, payload);
        setFeedback({ type: 'success', message: `Updated payroll record ${editingRecord.salaryCode}.` });
      } else {
        await api.createDoctorSalary(payload);
        setFeedback({ type: 'success', message: 'New doctor payroll record saved.' });
      }

      setModalOpen(false);
      await loadAllPayrollData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save salary entry.' });
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizeRecord = async (sal: DoctorSalary) => {
    try {
      await api.finalizePayrollRecord(sal.id);
      setFeedback({
        type: 'success',
        message: `Payroll ${sal.salaryCode} finalized with immutable compensation snapshot.`,
      });
      await loadAllPayrollData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to finalize payroll record' });
    }
  };

  const handleRecordSalaryPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalSalary) return;
    setSavingPay(true);
    setFeedback(null);
    try {
      const res = await api.recordSalaryPayment(payModalSalary.id, payForm);
      setPayModalSalary(null);
      setFeedback({
        type: 'success',
        message: `Recorded salary disbursement ${res.paymentCode}. Remaining Due: ৳${res.dueAmount.toLocaleString()}`,
      });
      await loadAllPayrollData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to record salary payment' });
    } finally {
      setSavingPay(false);
    }
  };

  const handleRecordAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjModalSalary) return;
    setSavingAdj(true);
    setFeedback(null);
    try {
      const res = await api.recordSalaryAdjustment(adjModalSalary.id, adjForm);
      setAdjModalSalary(null);
      setFeedback({
        type: 'success',
        message: `Applied authorized adjustment. Net Payable updated from ৳${res.previousPayable.toLocaleString()} to ৳${res.newPayable.toLocaleString()}.`,
      });
      await loadAllPayrollData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to apply payroll adjustment' });
    } finally {
      setSavingAdj(false);
    }
  };

  const openStructureModal = (st: DoctorSalaryStructure) => {
    setStructModalDoc(st);
    setStructForm({
      doctorId: st.doctorId,
      salaryType: st.salaryType,
      baseRate: String(st.baseRate || 0),
      commissionRate: String(st.commissionRate || 0),
      commissionBasis: st.commissionBasis || 'treatment_revenue',
      allowances: String(st.allowances || 0),
      deductions: String(st.deductions || 0),
      effectiveDate: st.effectiveDate || new Date().toISOString().split('T')[0],
      reviewDate: st.reviewDate || '',
      notes: st.notes || '',
      isActive: st.isActive,
      changeReason: '',
    });
  };

  const handleSaveStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStruct(true);
    setFeedback(null);
    try {
      await api.saveSalaryStructure({
        ...structForm,
        baseRate: Number(structForm.baseRate) || 0,
        commissionRate: Number(structForm.commissionRate) || 0,
        allowances: Number(structForm.allowances) || 0,
        deductions: Number(structForm.deductions) || 0,
      });
      setStructModalDoc(null);
      setFeedback({
        type: 'success',
        message: `Saved compensation structure for ${structModalDoc?.doctorName}. Historical finalized payrolls remain unchanged.`,
      });
      await loadAllPayrollData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save salary structure' });
    } finally {
      setSavingStruct(false);
    }
  };

  const openHistoryModal = async (doctorId: number, doctorName: string) => {
    setHistoryDoc({ doctorId, doctorName });
    setHistoryLoading(true);
    try {
      const hist = await api.getSalaryStructureHistory(doctorId);
      setStructureHistory(hist || []);
    } catch {
      setStructureHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteDoctorSalary(deleteTarget.id);
      setDeleteTarget(null);
      setFeedback({ type: 'success', message: `Deleted payroll entry ${deleteTarget.salaryCode}.` });
      await loadAllPayrollData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete salary record.' });
    } finally {
      setDeleting(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-2" />
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-600 mt-1">
          Only the Main Doctor (Super Admin) and Developer accounts can access Doctor Salary &amp; Payroll Management.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-2xl p-6 text-white shadow-sm border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shrink-0">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-400/30">
                  Main Doctor &amp; Developer Only
                </span>
                <span className="text-[11px] text-slate-300">
                  Monthly Fixed · Daily Working Rate · Commission %
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-1">
                Doctor Salary &amp; Payroll Management Suite
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                Configure per-doctor salary structures, auto-generate monthly payroll sheets, record partial/full disbursements, and track commissions.
              </p>
            </div>
          </div>

          {/* Sub-Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-800/90 p-1.5 rounded-xl border border-slate-700 self-start">
            <button
              type="button"
              onClick={() => setActiveTab('sheet')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'sheet'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>1. Monthly Salary Sheet ({salaries.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('structures')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'structures'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>2. Doctor Salary Structures ({structures.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>3. Payments &amp; Audit Logs ({allPayments.length})</span>
            </button>
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
          <div className="flex items-center gap-2">
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Total Net Payable
          </div>
          <div className="text-lg font-extrabold text-slate-900 mt-1">
            ৳{summaryStats.totalPayable.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {filteredSalaries.length} payroll record(s)
          </div>
        </div>

        <div className="bg-emerald-50/70 rounded-xl border border-emerald-200 p-4 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Total Salary Paid
          </div>
          <div className="text-lg font-extrabold text-emerald-700 mt-1">
            ৳{summaryStats.totalPaid.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Disbursed to doctors</div>
        </div>

        <div className="bg-amber-50/70 rounded-xl border border-amber-200 p-4 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Unpaid Salary Due
          </div>
          <div className="text-lg font-extrabold text-amber-700 mt-1">
            ৳{summaryStats.totalDue.toLocaleString()}
          </div>
          <div className="text-[11px] text-amber-700 mt-0.5">Remaining balance</div>
        </div>

        <div className="bg-indigo-50/60 rounded-xl border border-indigo-200 p-4 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
            Monthly Fixed
          </div>
          <div className="text-base font-extrabold text-indigo-900 mt-1">
            ৳{summaryStats.monthlyTotal.toLocaleString()}
          </div>
          <div className="text-[11px] text-indigo-600 mt-0.5">Fixed retainers</div>
        </div>

        <div className="bg-sky-50/60 rounded-xl border border-sky-200 p-4 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
            Daily Basis
          </div>
          <div className="text-base font-extrabold text-sky-900 mt-1">
            ৳{summaryStats.dailyTotal.toLocaleString()}
          </div>
          <div className="text-[11px] text-sky-600 mt-0.5">Per-day roster</div>
        </div>

        <div className="bg-purple-50/60 rounded-xl border border-purple-200 p-4 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
            Commission Based
          </div>
          <div className="text-base font-extrabold text-purple-900 mt-1">
            ৳{summaryStats.commissionTotal.toLocaleString()}
          </div>
          <div className="text-[11px] text-purple-600 mt-0.5">% of revenue</div>
        </div>
      </div>

      {/* TAB 1: MONTHLY SALARY SHEET & PAYROLL LEDGER */}
      {activeTab === 'sheet' && (
        <div className="space-y-4">
          {/* Action & Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-xl px-3 py-1.5">
                  <Calendar className="w-4 h-4 text-teal-700" />
                  <span className="text-xs font-bold text-teal-900">Payroll Period:</span>
                  <input
                    type="month"
                    value={genMonth}
                    onChange={(e) => setGenMonth(e.target.value)}
                    className="text-xs font-bold text-teal-900 bg-transparent focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={generatingMonth}
                  onClick={handleAutoGenerateMonth}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  {generatingMonth ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                  )}
                  <span>Auto-Generate Monthly Sheet</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    api.downloadCsv(
                      '/api/export/salary-payroll.csv',
                      `Salary_Payroll_${new Date().toISOString().slice(0, 10)}.csv`
                    )
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" />
                  <span>Export Payroll CSV</span>
                </button>
                <button
                  type="button"
                  onClick={openNewModal}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Record Custom Salary Entry</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search doctor, code, month..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <select
                value={doctorFilter}
                onChange={(e) => setDoctorFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700"
              >
                <option value="All">All Doctors</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700"
              >
                <option value="All">All Salary Types</option>
                <option value="Monthly">Monthly Salary</option>
                <option value="Daily">Daily Basis</option>
                <option value="Commission">Commission Based</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700"
              >
                <option value="All">All Payment Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Partial">Partially Paid</option>
                <option value="Pending">Pending / Unpaid</option>
              </select>

              <div className="flex items-center gap-1.5">
                <input
                  type="month"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white"
                  title="Filter by Payroll Month"
                />
                {monthFilter && (
                  <button
                    type="button"
                    onClick={() => setMonthFilter('')}
                    className="px-2 py-1.5 text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Salary Sheet Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-sm text-slate-500">Loading payroll sheet...</div>
            ) : filteredSalaries.length === 0 ? (
              <div className="p-12 text-center">
                <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <div className="text-sm font-bold text-slate-800">No Payroll Records Found</div>
                <p className="text-xs text-slate-500 mt-1">
                  Click &ldquo;Auto-Generate Monthly Sheet&rdquo; or &ldquo;Record Custom Salary Entry&rdquo; to add records.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Code &amp; Date</th>
                      <th className="py-3 px-4">Doctor</th>
                      <th className="py-3 px-4">Type &amp; Period</th>
                      <th className="py-3 px-4">Calculation Breakdown</th>
                      <th className="py-3 px-4 text-right">Net Payable</th>
                      <th className="py-3 px-4 text-right">Paid / Due</th>
                      <th className="py-3 px-4 text-center">Lifecycle &amp; Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredSalaries.map((rec) => {
                      const payable = parseFloat(String(rec.totalPayable || '0')) || 0;
                      const paid = parseFloat(String(rec.paidAmount || '0')) || 0;
                      const due = parseFloat(String(rec.dueAmount || '0')) || 0;
                      const bonus = parseFloat(String(rec.bonusAmount || '0')) || 0;
                      const deduct = parseFloat(String(rec.deductionAmount || '0')) || 0;
                      const isFinalized = Boolean(rec.finalizedAt || rec.payrollStatus === 'Finalized' || rec.payrollStatus === 'Paid');

                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-900">{rec.salaryCode}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {formatDateDDMMYYYY(rec.paymentDate)}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{rec.doctorName}</div>
                            <div className="text-[11px] text-slate-500">
                              {rec.doctorSpecialization || 'Dental Surgeon'}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                rec.salaryType === 'Monthly'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : rec.salaryType === 'Daily'
                                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                  : 'bg-purple-50 text-purple-700 border border-purple-200'
                              }`}
                            >
                              {rec.salaryType}
                            </span>
                            <div className="font-semibold text-slate-800 mt-1">{rec.periodLabel}</div>
                          </td>

                          <td className="py-3.5 px-4">
                            {rec.salaryType === 'Monthly' && (
                              <div className="text-slate-700">
                                Monthly Base:{' '}
                                <strong>৳{Number(rec.baseAmount || 0).toLocaleString()}</strong>
                              </div>
                            )}
                            {rec.salaryType === 'Daily' && (
                              <div className="text-slate-700">
                                ৳{Number(rec.baseAmount || 0).toLocaleString()}/day ×{' '}
                                <strong>{rec.daysWorked} day(s)</strong>
                              </div>
                            )}
                            {rec.salaryType === 'Commission' && (
                              <div className="space-y-0.5 text-slate-700">
                                <div>
                                  <strong>{Number(rec.commissionRate || 0)}%</strong> of ৳
                                  {Number(rec.commissionSourceAmount || 0).toLocaleString()} ={' '}
                                  <strong className="text-purple-700">
                                    ৳{Number(rec.commissionEarned || 0).toLocaleString()}
                                  </strong>
                                </div>
                                {Number(rec.baseAmount || 0) > 0 && (
                                  <div className="text-[11px] text-slate-500">
                                    + Base Retainer: ৳{Number(rec.baseAmount || 0).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            )}
                            {(bonus > 0 || deduct > 0) && (
                              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                                {bonus > 0 && (
                                  <span className="text-emerald-600 font-medium">
                                    +Allowances: ৳{bonus.toLocaleString()}
                                  </span>
                                )}
                                {deduct > 0 && (
                                  <span className="text-rose-600 font-medium">
                                    -Deductions: ৳{deduct.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="text-sm font-extrabold text-slate-900">
                              ৳{payable.toLocaleString()}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="font-bold text-emerald-700">
                              Paid: ৳{paid.toLocaleString()}
                            </div>
                            {due > 0 ? (
                              <div className="text-[11px] font-bold text-amber-700 mt-0.5">
                                Due: ৳{due.toLocaleString()}
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-400 mt-0.5">Due: ৳0</div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <div className="flex flex-col items-center gap-1">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  rec.paymentStatus === 'Paid'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : rec.paymentStatus === 'Partial'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {rec.paymentStatus}
                              </span>
                              <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                                {isFinalized && <Lock className="w-2.5 h-2.5 text-teal-600" />}
                                {rec.payrollStatus || 'Draft'}
                              </span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {due > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPayModalSalary(rec);
                                    setPayForm({
                                      amount: String(due),
                                      paymentDate: new Date().toISOString().split('T')[0],
                                      paymentMethod: 'Cash',
                                      transactionRef: '',
                                      notes: '',
                                    });
                                  }}
                                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                  title="Record Partial or Full Salary Payment"
                                >
                                  <DollarSign className="w-3 h-3" />
                                  <span>Pay</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setAdjModalSalary(rec);
                                  setAdjForm({
                                    adjustmentType: 'Allowance',
                                    amount: '',
                                    reason: '',
                                  });
                                }}
                                className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold cursor-pointer"
                                title="Authorized Allowance / Deduction Adjustment"
                              >
                                ±Adj
                              </button>

                              {!isFinalized && (
                                <button
                                  type="button"
                                  onClick={() => handleFinalizeRecord(rec)}
                                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 text-[11px] font-bold cursor-pointer"
                                  title="Finalize & Lock Immutable Snapshot"
                                >
                                  Finalize
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setSlipRecord(rec)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 cursor-pointer"
                                title="View / Print Salary Slip"
                              >
                                <Printer className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => openEditModal(rec)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 cursor-pointer"
                                title="Edit Entry"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeleteTarget(rec)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="Delete Entry"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DOCTOR SALARY STRUCTURES */}
      {activeTab === 'structures' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900">
              Per-Doctor Active Compensation Structures &amp; Live Clinical Metrics
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure each doctor&apos;s salary model (Monthly Fixed, Daily Rate, or Commission %). Editing a structure logs to immutable history and never alters past finalized payrolls.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {structures.map((st) => (
                <div
                  key={st.doctorId}
                  className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900">{st.doctorName}</h3>
                        <p className="text-xs text-slate-500">
                          {st.doctorSpecialization} · {st.doctorPhone || 'No phone'}
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          st.salaryType === 'Monthly'
                            ? 'bg-indigo-100 text-indigo-800'
                            : st.salaryType === 'Daily'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {st.salaryType} Model
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 text-xs">
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">
                          {st.salaryType === 'Monthly'
                            ? 'Monthly Fixed'
                            : st.salaryType === 'Daily'
                            ? 'Daily Rate'
                            : 'Base Retainer'}
                        </div>
                        <div className="font-extrabold text-slate-900 mt-0.5">
                          ৳{Number(st.baseRate || 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Commission</div>
                        <div className="font-extrabold text-purple-700 mt-0.5">
                          {Number(st.commissionRate || 0)}%
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Allowances</div>
                        <div className="font-extrabold text-emerald-700 mt-0.5">
                          +৳{Number(st.allowances || 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Deductions</div>
                        <div className="font-extrabold text-rose-700 mt-0.5">
                          -৳{Number(st.deductions || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {st.liveMetrics && (
                      <div className="mt-3 p-3 rounded-xl bg-teal-50/70 border border-teal-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-teal-900">
                        <span>
                          <strong>Live Activity:</strong> {st.liveMetrics.visitCount} Visits ({st.liveMetrics.workingDaysCount} Visit Days)
                        </span>
                        <span>
                          Treatment Bill: <strong>৳{st.liveMetrics.treatmentRevenue.toLocaleString()}</strong>
                        </span>
                        <span>
                          Collected: <strong>৳{st.liveMetrics.collectedPayments.toLocaleString()}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] text-slate-500">
                      Effective: <strong>{formatDateDDMMYYYY(st.effectiveDate)}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openHistoryModal(st.doctorId, st.doctorName)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>History</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openStructureModal(st)}
                        className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Configure Structure</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SALARY PAYMENTS LEDGER & PAYROLL AUDIT TRAIL */}
      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Salary Payments Ledger */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Salary Disbursement Transactions ({allPayments.length})
              </h3>
              <button
                type="button"
                onClick={() =>
                  api.downloadCsv(
                    '/api/export/salary-payments.csv',
                    `Salary_Payments_${new Date().toISOString().slice(0, 10)}.csv`
                  )
                }
                className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Code</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Doctor</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No salary payment transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    allPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{p.paymentCode}</td>
                        <td className="py-2.5 px-3 text-slate-600">{formatDateDDMMYYYY(p.paymentDate)}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{p.doctorName}</td>
                        <td className="py-2.5 px-3 text-slate-600">{p.paymentMethod}</td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700">
                          ৳{Number(p.amount || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payroll Audit Logs */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Immutable Payroll &amp; Adjustment Audit Logs ({auditLogs.length})
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Target</th>
                    <th className="py-2.5 px-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">
                        No payroll audit logs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                          {formatDateDDMMYYYY(l.createdAt)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-bold text-[10px]">
                            {l.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">{l.targetLabel}</td>
                        <td className="py-2.5 px-3 text-slate-600">{l.details}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: RECORD PARTIAL OR FULL SALARY PAYMENT */}
      {payModalSalary && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordSalaryPayment}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden"
          >
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">Record Salary Payment ({payModalSalary.salaryCode})</h3>
                <p className="text-[11px] text-slate-400">
                  {payModalSalary.doctorName} · {payModalSalary.periodLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayModalSalary(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between">
                <span>Remaining Unpaid Due:</span>
                <strong className="text-amber-700 text-sm">
                  ৳{Number(payModalSalary.dueAmount || 0).toLocaleString()}
                </strong>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Disbursement Amount (BDT) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  max={Number(payModalSalary.dueAmount || 0)}
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={payForm.paymentDate}
                    onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={payForm.paymentMethod}
                    onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="bKash">bKash</option>
                    <option value="Nagad">Nagad</option>
                    <option value="Bank transfer">Bank transfer</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Transaction Ref / Notes</label>
                <input
                  type="text"
                  value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                  placeholder="Optional reference or voucher note..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayModalSalary(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPay}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                >
                  {savingPay ? 'Recording...' : 'Confirm Salary Payment'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: AUTHORIZED PAYROLL ADJUSTMENT */}
      {adjModalSalary && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordAdjustment}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden"
          >
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">Authorized Payroll Adjustment ({adjModalSalary.salaryCode})</h3>
                <p className="text-[11px] text-slate-400">{adjModalSalary.doctorName}</p>
              </div>
              <button
                type="button"
                onClick={() => setAdjModalSalary(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Adjustment Type</label>
                  <select
                    value={adjForm.adjustmentType}
                    onChange={(e) => setAdjForm({ ...adjForm, adjustmentType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold"
                  >
                    <option value="Allowance">+ Allowance / Bonus</option>
                    <option value="Deduction">- Deduction</option>
                    <option value="Correction">+ Positive Correction</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount (BDT) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={adjForm.amount}
                    onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mandatory Authorization Reason *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="State clear reason for auditing..."
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjModalSalary(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAdj}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                >
                  {savingAdj ? 'Applying...' : 'Authorize Adjustment'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: CONFIGURE DOCTOR SALARY STRUCTURE */}
      {structModalDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveStructure}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden"
          >
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">Configure Compensation Structure</h3>
                <p className="text-[11px] text-slate-400">{structModalDoc.doctorName}</p>
              </div>
              <button
                type="button"
                onClick={() => setStructModalDoc(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2">
                {(['Monthly', 'Daily', 'Commission'] as DoctorSalaryType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setStructForm({ ...structForm, salaryType: t })}
                    className={`py-2 px-3 rounded-xl font-bold border cursor-pointer ${
                      structForm.salaryType === t
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {t} Model
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {structForm.salaryType === 'Monthly'
                      ? 'Monthly Fixed Salary (BDT)'
                      : structForm.salaryType === 'Daily'
                      ? 'Daily Rate (BDT / Day)'
                      : 'Base Retainer (BDT)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={structForm.baseRate}
                    onChange={(e) => setStructForm({ ...structForm, baseRate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>
                {structForm.salaryType === 'Commission' && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Commission Percentage (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={structForm.commissionRate}
                      onChange={(e) => setStructForm({ ...structForm, commissionRate: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                    />
                  </div>
                )}
              </div>

              {structForm.salaryType === 'Commission' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Commission Calculation Basis</label>
                  <select
                    value={structForm.commissionBasis}
                    onChange={(e) => setStructForm({ ...structForm, commissionBasis: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    <option value="treatment_revenue">Completed Treatment Revenue</option>
                    <option value="collected_payments">Collected Patient Payments</option>
                    <option value="eligible_charges">Total Eligible Visit Charges</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Default Allowances (BDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={structForm.allowances}
                    onChange={(e) => setStructForm({ ...structForm, allowances: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Default Deductions (BDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={structForm.deductions}
                    onChange={(e) => setStructForm({ ...structForm, deductions: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Effective Date *</label>
                  <input
                    type="date"
                    required
                    value={structForm.effectiveDate}
                    onChange={(e) => setStructForm({ ...structForm, effectiveDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Next Review Date</label>
                  <input
                    type="date"
                    value={structForm.reviewDate}
                    onChange={(e) => setStructForm({ ...structForm, reviewDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Change Reason (Logged to History)</label>
                <input
                  type="text"
                  placeholder="e.g. Annual compensation review..."
                  value={structForm.changeReason}
                  onChange={(e) => setStructForm({ ...structForm, changeReason: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setStructModalDoc(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStruct}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer"
                >
                  {savingStruct ? 'Saving...' : 'Save Salary Structure'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: STRUCTURE CHANGE HISTORY */}
      {historyDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">Immutable Salary Structure History</h3>
                <p className="text-[11px] text-slate-400">{historyDoc.doctorName}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryDoc(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 max-h-96 overflow-y-auto">
              {historyLoading ? (
                <div className="py-8 text-center text-xs text-slate-500">Loading history...</div>
              ) : structureHistory.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No history entries found.</div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      <th className="py-2 px-3">Effective</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Base / Rate</th>
                      <th className="py-2 px-3">Comm %</th>
                      <th className="py-2 px-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {structureHistory.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2.5 px-3 font-medium">{formatDateDDMMYYYY(h.effectiveDate)}</td>
                        <td className="py-2.5 px-3 font-bold text-teal-700">{h.salaryType}</td>
                        <td className="py-2.5 px-3 font-bold">৳{Number(h.baseRate || 0).toLocaleString()}</td>
                        <td className="py-2.5 px-3">{Number(h.commissionRate || 0)}%</td>
                        <td className="py-2.5 px-3 text-slate-600">{h.changeReason || 'Updated'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ADD / EDIT CUSTOM PAYROLL ENTRY */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-auto">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Calculator className="w-5 h-5 text-teal-400" />
                <div>
                  <h2 className="text-base font-bold">
                    {editingRecord
                      ? `Edit Salary Record (${editingRecord.salaryCode})`
                      : 'Record Doctor Salary / Commission'}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Supports Monthly Fixed, Daily Working Rate, or Commission-Based Calculation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSalary} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Select Doctor *</label>
                  <select
                    value={formDoctorId}
                    onChange={(e) => setFormDoctorId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    <option value="">-- Choose Doctor --</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName} ({d.specialization || d.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Period / Month Label *</label>
                  <input
                    type="text"
                    value={formPeriodLabel}
                    onChange={(e) => setFormPeriodLabel(e.target.value)}
                    required
                    placeholder="e.g. November 2026"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Activity Period Start</label>
                  <input
                    type="date"
                    value={formPeriodStart}
                    onChange={(e) => setFormPeriodStart(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Activity Period End</label>
                  <input
                    type="date"
                    value={formPeriodEnd}
                    onChange={(e) => setFormPeriodEnd(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                  />
                </div>

                {formDoctorId && (
                  <div className="sm:col-span-2 pt-1 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    {metricsLoading ? (
                      <span className="text-slate-500">Calculating doctor clinical metrics...</span>
                    ) : doctorMetrics ? (
                      <>
                        <span className="text-slate-600">
                          Visits: <strong className="text-slate-900">{doctorMetrics.visitCount}</strong> ({doctorMetrics.uniqueDaysWorked} distinct days)
                        </span>
                        <span className="text-slate-600">
                          Treatment Bill:{' '}
                          <strong className="text-indigo-700">
                            ৳{doctorMetrics.totalTreatmentBill.toLocaleString()}
                          </strong>
                        </span>
                        <span className="text-slate-600">
                          Collected:{' '}
                          <strong className="text-emerald-700">
                            ৳{doctorMetrics.totalCollectedForDoctorVisits.toLocaleString()}
                          </strong>
                        </span>
                      </>
                    ) : null}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Select Compensation Model *</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {(['Monthly', 'Daily', 'Commission'] as DoctorSalaryType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormType(type)}
                      className={`py-2.5 px-3 rounded-xl font-bold border transition-all cursor-pointer ${
                        formType === type
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {formType === 'Monthly' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Monthly Fixed Salary Amount (৳) *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formBaseAmount}
                    onChange={(e) => setFormBaseAmount(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                  />
                </div>
              )}

              {formType === 'Daily' && (
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Per-Day Rate (৳) *</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={formBaseAmount}
                      onChange={(e) => setFormBaseAmount(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Approved Working Days *</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={formDaysWorked}
                      onChange={(e) => setFormDaysWorked(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                    />
                  </div>
                </div>
              )}

              {formType === 'Commission' && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Eligible Revenue (৳) *</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={formCommissionSource}
                      onChange={(e) => setFormCommissionSource(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Commission Rate (%) *</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={formCommissionRate}
                      onChange={(e) => setFormCommissionRate(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Fixed Retainer (৳)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={formBaseAmount}
                      onChange={(e) => setFormBaseAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Allowances / Bonus (+ ৳)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formBonus}
                    onChange={(e) => setFormBonus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Deductions (- ৳)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formDeduction}
                    onChange={(e) => setFormDeduction(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="bg-slate-900 text-white rounded-xl p-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-[10px] uppercase text-slate-400 font-bold">Total Net Payable</div>
                  <div className="text-base font-extrabold text-teal-400 mt-0.5">
                    ৳{liveCalculation.totalPayable.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-400 font-bold">Paying Now</div>
                  <div className="text-base font-extrabold text-emerald-400 mt-0.5">
                    ৳{liveCalculation.paid.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-400 font-bold">Remaining Due</div>
                  <div className="text-base font-extrabold text-amber-400 mt-0.5">
                    ৳{liveCalculation.due.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount Paid Now (৳)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formPaidAmount}
                    onChange={(e) => setFormPaidAmount(e.target.value)}
                    placeholder={`Default: ${liveCalculation.totalPayable}`}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="bKash">bKash</option>
                    <option value="Nagad">Nagad</option>
                    <option value="Bank transfer">Bank transfer</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    value={formPaymentDate}
                    onChange={(e) => setFormPaymentDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer"
                >
                  {saving ? 'Saving...' : editingRecord ? 'Update Payroll Record' : 'Save Payroll Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: DELETE CONFIRMATION */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Salary Entry?</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Are you sure you want to delete <strong>{deleteTarget.salaryCode}</strong> for{' '}
                  <strong>{deleteTarget.doctorName}</strong> ({deleteTarget.periodLabel})?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: PRINTABLE SALARY SLIP */}
      {slipRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between print:hidden">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-400">
                Salary Voucher Preview · {slipRecord.salaryCode}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSlipRecord(null)}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-800">
              <div className="border-b border-slate-200 pb-3 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">Dental Care</h2>
                  <p className="text-[11px] text-slate-500">Doctor Salary &amp; Honorarium Voucher</p>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900">{slipRecord.salaryCode}</div>
                  <div className="text-[11px] text-slate-500">
                    Date: {formatDateDDMMYYYY(slipRecord.paymentDate)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Doctor Name</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{slipRecord.doctorName}</div>
                  <div className="text-[11px] text-slate-500">
                    {slipRecord.doctorSpecialization || 'Dental Surgeon'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Salary Type &amp; Period</div>
                  <div className="font-bold text-teal-700 text-sm mt-0.5">{slipRecord.salaryType} Basis</div>
                  <div className="text-[11px] text-slate-600">{slipRecord.periodLabel}</div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                <div className="p-3 flex justify-between font-bold bg-slate-50">
                  <span>Net Payable Salary</span>
                  <span>৳{Number(slipRecord.totalPayable || 0).toLocaleString()}</span>
                </div>
                <div className="p-3 flex justify-between text-emerald-700 font-bold">
                  <span>Total Paid ({slipRecord.paymentMethod})</span>
                  <span>৳{Number(slipRecord.paidAmount || 0).toLocaleString()}</span>
                </div>
                <div className="p-3 flex justify-between text-amber-700 font-bold">
                  <span>Balance Due</span>
                  <span>৳{Number(slipRecord.dueAmount || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
