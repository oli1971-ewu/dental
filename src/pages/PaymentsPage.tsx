import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { Payment, Visit, User } from '../types/index.ts';
import {
  CreditCard,
  Search,
  FileSpreadsheet,
  Stethoscope,
  CheckCircle2,
  X,
  RotateCcw,
  Phone,
  Eye,
  Receipt,
  Lock,
} from 'lucide-react';
import { UndoPaymentConfirmModal, UndoPaymentTarget } from '../components/UndoPaymentConfirmModal.tsx';
import { formatDateDDMMYYYY } from '../utils/dateFormat.ts';

interface PaymentsPageProps {
  refreshKey?: number;
  onOpenRecordPayment?: (visit: any, initialMode?: 'payment' | 'discount') => void;
  onSelectPatient?: (patientId: number) => void;
}

export const PaymentsPage: React.FC<PaymentsPageProps> = ({
  refreshKey,
  onOpenRecordPayment,
  onSelectPatient,
}) => {
  const { user } = useAuth();
  const canFilterAllDoctors = user?.role === 'main_doctor' || user?.role === 'developer';

  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [pendingVisits, setPendingVisits] = useState<Visit[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>('All');
  const [selectedCollectorId, setSelectedCollectorId] = useState<string>(
    canFilterAllDoctors ? 'All' : String(user?.id || '')
  );
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [activeView, setActiveView] = useState<'ledger' | 'pending'>('ledger');
  const [loading, setLoading] = useState<boolean>(true);
  const [undoTargetPayment, setUndoTargetPayment] = useState<UndoPaymentTarget | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const requestCounterRef = React.useRef(0);

  useEffect(() => {
    api.getDoctors().then(setDoctors).catch(console.error);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), searchTerm.trim() ? 220 : 0);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Lock collector/doctor filter to own doctor ID when not main_doctor / developer
  useEffect(() => {
    if (!canFilterAllDoctors && user?.id) {
      setSelectedCollectorId(String(user.id));
    } else if (canFilterAllDoctors) {
      setSelectedCollectorId('All');
    }
  }, [canFilterAllDoctors, user?.id]);

  const effectiveDoctorFilter = canFilterAllDoctors
    ? selectedCollectorId !== 'All'
      ? selectedCollectorId
      : undefined
    : user?.id
    ? String(user.id)
    : undefined;

  useEffect(() => {
    const reqId = ++requestCounterRef.current;
    fetchPayments(reqId);
    fetchPendingVisits(reqId);
  }, [
    selectedCollectorId,
    fromDate,
    toDate,
    debouncedSearch,
    user?.id,
    canFilterAllDoctors,
    refreshKey,
  ]);

  const fetchPayments = async (reqId?: number) => {
    setLoading(true);
    try {
      const data = await api.getPayments({
        receivedBy: effectiveDoctorFilter,
        fromDate: fromDate.trim() || undefined,
        toDate: toDate.trim() || undefined,
        search: debouncedSearch.trim() || undefined,
      });
      if (reqId === undefined || reqId === requestCounterRef.current) {
        setAllPayments(data);
      }
    } catch (e) {
      console.error('Failed to load payments:', e);
    } finally {
      if (reqId === undefined || reqId === requestCounterRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchPendingVisits = async (reqId?: number) => {
    try {
      const data = await api.getPaymentDues({
        doctorId: effectiveDoctorFilter,
        fromDate: fromDate.trim() || undefined,
        toDate: toDate.trim() || undefined,
        search: debouncedSearch.trim() || undefined,
      });
      if (reqId === undefined || reqId === requestCounterRef.current) {
        setPendingVisits(data);
      }
    } catch (e) {
      console.error('Failed to load pending dues:', e);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedMethod('All');
    setSelectedCollectorId(canFilterAllDoctors ? 'All' : String(user?.id || ''));
    setFromDate('');
    setToDate('');
  };

  const handleDeletePayment = async (paymentId: number) => {
    setDeletingId(paymentId);
    try {
      await api.deletePayment(paymentId);
      setUndoTargetPayment(null);
      await Promise.all([fetchPayments(), fetchPendingVisits()]);
    } catch (e) {
      console.error('Failed to undo payment:', e);
    } finally {
      setDeletingId(null);
    }
  };

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    selectedMethod !== 'All' ||
    (canFilterAllDoctors && selectedCollectorId !== 'All') ||
    Boolean(fromDate) ||
    Boolean(toDate);

  // Filter displayed ledger rows by selectedMethod
  const payments = allPayments.filter((p) => {
    if (selectedMethod === 'All') return true;
    if (selectedMethod === 'Other_Group') {
      return p.paymentMethod !== 'Cash' && p.paymentMethod !== 'bKash';
    }
    return p.paymentMethod === selectedMethod;
  });

  // Overall Financial Totals across current scope
  const totalCollected = allPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
  const totalOutstandingClinicDue = pendingVisits.reduce(
    (sum, v) => sum + parseFloat(v.outstandingDue || '0'),
    0
  );
  const totalBill = Number((totalCollected + totalOutstandingClinicDue).toFixed(2));
  const collectedPct = totalBill > 0 ? Math.min(100, Math.round((totalCollected / totalBill) * 100)) : 100;

  // Breakdown by Cash, bKash, and Other (Nagad, Bank transfer, Rocket, Card, Other)
  const cashPayments = allPayments.filter((p) => p.paymentMethod === 'Cash');
  const cashTotal = cashPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

  const bkashPayments = allPayments.filter((p) => p.paymentMethod === 'bKash');
  const bkashTotal = bkashPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

  const otherPayments = allPayments.filter(
    (p) => p.paymentMethod !== 'Cash' && p.paymentMethod !== 'bKash'
  );
  const otherTotal = otherPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

  const getMethodBadgeStyle = (method: string) => {
    switch (method) {
      case 'bKash':
        return 'bg-pink-50 text-pink-800 border-pink-200';
      case 'Nagad':
        return 'bg-orange-50 text-orange-800 border-orange-200';
      case 'Bank transfer':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'Cash':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Receipt className="w-5 h-5 text-teal-600" />
            <h1 className="text-xl font-bold text-slate-900">Payment &amp; Dues History</h1>
            <span
              className={`text-xs font-semibold px-2.5 py-0.5 rounded border ${
                canFilterAllDoctors
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-indigo-100 text-indigo-800 border-indigo-200'
              }`}
            >
              {canFilterAllDoctors ? 'All-Doctor Collection Ledger' : 'My Collections & Dues Only'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {canFilterAllDoctors
              ? 'Full clinic-wide installment tracking, total bill summary, per-doctor collector filtering, mobile banking references, and outstanding dues.'
              : `Scoped to ${user?.fullName || 'your account'}: you can view and filter only your own collected payments and pending patient dues.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              if (fromDate.trim()) params.set('fromDate', fromDate.trim());
              if (toDate.trim()) params.set('toDate', toDate.trim());
              if (selectedMethod !== 'All' && selectedMethod !== 'Other_Group') {
                params.set('method', selectedMethod);
              }
              if (effectiveDoctorFilter) params.set('receivedBy', effectiveDoctorFilter);
              const qs = params.toString() ? `?${params.toString()}` : '';
              api.downloadCsv(`/api/export/payments.csv${qs}`, 'dental_payments.csv');
            }}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export Payments CSV</span>
          </button>
        </div>
      </div>

      {/* Summary Cards: Total Bill, Total Collected, Outstanding Dues, Cash, bKash, Other */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        {/* 1. Total Bill */}
        <div
          onClick={() => {
            setActiveView('ledger');
            setSelectedMethod('All');
          }}
          className="p-3.5 rounded-xl border border-teal-200 bg-teal-50/40 hover:bg-teal-50/80 cursor-pointer transition-all"
          title="Total Net Bill = Total Collected + Outstanding Dues"
        >
          <span className="text-teal-900 block mb-0.5 font-semibold">Total Bill</span>
          <span className="text-xl font-extrabold text-slate-900 font-mono">
            ৳{totalBill.toLocaleString()}
          </span>
          <span className="text-[11px] text-teal-800 block mt-0.5 font-medium">
            Collected + Due ({collectedPct}% paid)
          </span>
        </div>

        {/* 2. Total Collected */}
        <div
          onClick={() => {
            setActiveView('ledger');
            setSelectedMethod('All');
          }}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            activeView === 'ledger' && selectedMethod === 'All'
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200'
              : 'bg-white hover:bg-emerald-50/40 border-slate-200'
          }`}
        >
          <span className="text-slate-500 block mb-0.5 font-semibold">Total Collected</span>
          <span className="text-xl font-extrabold text-emerald-700 font-mono">
            ৳{totalCollected.toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            {allPayments.length} receipt(s)
          </span>
        </div>

        {/* 3. Outstanding Dues */}
        <div
          onClick={() => setActiveView('pending')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            activeView === 'pending'
              ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300'
              : 'bg-white hover:bg-amber-50/60 border-slate-200'
          }`}
        >
          <span className="text-slate-500 block mb-0.5 font-semibold">Outstanding Dues</span>
          <span className="text-xl font-extrabold text-amber-800 font-mono">
            ৳{totalOutstandingClinicDue.toLocaleString()}
          </span>
          <span className="text-[11px] text-amber-700 block mt-0.5 font-bold">
            {pendingVisits.length} unpaid visit(s) &rarr;
          </span>
        </div>

        {/* 4. Cash Collection */}
        <div
          onClick={() => {
            setActiveView('ledger');
            setSelectedMethod((prev) => (prev === 'Cash' ? 'All' : 'Cash'));
          }}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            activeView === 'ledger' && selectedMethod === 'Cash'
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200'
              : 'bg-white hover:bg-slate-50 border-slate-200'
          }`}
          title="Click to filter Cash collections"
        >
          <span className="text-slate-500 block mb-0.5 font-semibold">Cash Collection</span>
          <span className="text-base font-extrabold text-slate-900 font-mono">
            ৳{cashTotal.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {cashPayments.length} txn(s)
          </span>
        </div>

        {/* 5. bKash Collection */}
        <div
          onClick={() => {
            setActiveView('ledger');
            setSelectedMethod((prev) => (prev === 'bKash' ? 'All' : 'bKash'));
          }}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            activeView === 'ledger' && selectedMethod === 'bKash'
              ? 'bg-pink-50 border-pink-400 ring-2 ring-pink-200'
              : 'bg-white hover:bg-pink-50/30 border-slate-200'
          }`}
          title="Click to filter bKash collections"
        >
          <span className="text-slate-500 block mb-0.5 font-semibold">bKash Collection</span>
          <span className="text-base font-extrabold text-pink-700 font-mono">
            ৳{bkashTotal.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {bkashPayments.length} txn(s)
          </span>
        </div>

        {/* 6. Other Collection (Nagad, Bank transfer, Card, Other) */}
        <div
          onClick={() => {
            setActiveView('ledger');
            setSelectedMethod((prev) => (prev === 'Other_Group' ? 'All' : 'Other_Group'));
          }}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            activeView === 'ledger' && selectedMethod === 'Other_Group'
              ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200'
              : 'bg-white hover:bg-indigo-50/30 border-slate-200'
          }`}
          title="Nagad, Bank transfer, Card / POS, and Other payment methods"
        >
          <span className="text-slate-500 block mb-0.5 font-semibold">Other Collection</span>
          <span className="text-base font-extrabold text-indigo-800 font-mono">
            ৳{otherTotal.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5 truncate">
            {otherPayments.length} txn(s) (Nagad/Bank/Etc.)
          </span>
        </div>
      </div>

      {/* Unified Filter Bar for Both Views */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Receipt ID (PAY-1001), Patient Name, Patient ID (DP-1001), Phone, Visit Code, or TrxID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/50 focus:bg-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
              {activeView === 'ledger'
                ? `${payments.length} receipt(s)`
                : `${pendingVisits.length} pending visit(s)`}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-700 bg-slate-100 hover:bg-rose-50 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          {/* Payment Method */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Payment Method
            </label>
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
            >
              <option value="All">All Payment Methods</option>
              <option value="Cash">Cash</option>
              <option value="bKash">bKash</option>
              <option value="Other_Group">Other (Nagad / Bank / Etc.)</option>
              <option value="Nagad">Nagad</option>
              <option value="Bank transfer">Bank transfer</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Collected By / Attending Doctor */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {activeView === 'ledger' ? 'Collected By Doctor' : 'Attending Doctor'}
            </label>
            {canFilterAllDoctors ? (
              <select
                value={selectedCollectorId}
                onChange={(e) => setSelectedCollectorId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
              >
                <option value="All">All Clinic Doctors</option>
                {doctors.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.fullName}
                  </option>
                ))}
              </select>
            ) : (
              <div
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-100 text-slate-700 font-semibold flex items-center justify-between gap-2"
                title="Only the Main Doctor can filter other doctors' collections and dues"
              >
                <span className="truncate">{user?.fullName || 'My Account'} (Own Only)</span>
                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
            )}
          </div>

          {/* Date From */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Date From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Date To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      </div>

      {/* Sub-Tabs: Transactions Ledger vs Pending Dues */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveView('ledger')}
          className={`px-4 py-2.5 border-b-2 transition-colors cursor-pointer ${
            activeView === 'ledger'
              ? 'border-teal-600 text-teal-800 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Transactions &amp; Installments Ledger ({payments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveView('pending')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeView === 'pending'
              ? 'border-amber-600 text-amber-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Pending Patient Dues</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-200 text-amber-900">
            {pendingVisits.length}
          </span>
        </button>
      </div>

      {activeView === 'pending' ? (
        /* PENDING DUES VIEW */
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="font-bold text-sm text-amber-900 block">
                {canFilterAllDoctors
                  ? `Unsettled Clinic Visits Awaiting Payment (${pendingVisits.length})`
                  : `My Unsettled Visits Awaiting Payment (${pendingVisits.length})`}
              </span>
              <p className="text-amber-800 mt-0.5">
                {canFilterAllDoctors
                  ? 'Main Doctor view: filter by any doctor or collect full/partial installments directly with 1-click.'
                  : 'Showing pending patient dues from visits attended by you. Click Record Payment to collect full or partial installments.'}
              </p>
            </div>
            <span className="font-black text-base text-amber-900 bg-white px-3 py-1.5 rounded-lg border border-amber-300 shadow-2xs self-start sm:self-auto">
              Total Due: ৳{totalOutstandingClinicDue.toLocaleString()}
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Visit ID</th>
                    <th className="py-3 px-4">Patient</th>
                    <th className="py-3 px-4">Attending Doctor</th>
                    <th className="py-3 px-4">Visit Date</th>
                    <th className="py-3 px-4 text-right">Total Cost</th>
                    <th className="py-3 px-4 text-right">Amount Paid</th>
                    <th className="py-3 px-4 text-right">Outstanding Due</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingVisits.length > 0 ? (
                    pendingVisits.map((v) => {
                      const due = parseFloat(v.outstandingDue || '0');
                      const prevCarried = v.previousCarriedDue || 0;
                      const cumPayable = v.cumulativePayable ?? prevCarried + parseFloat(v.totalCost || '0');
                      return (
                        <tr
                          key={v.id}
                          className="hover:bg-amber-100/60 transition-colors cursor-pointer"
                          onClick={() => onSelectPatient && onSelectPatient(v.patientId)}
                          title="Click anywhere to view patient profile"
                        >
                          <td className="py-3.5 px-4 font-bold text-teal-700 whitespace-nowrap">
                            <div>{v.visitId}</div>
                            {v.visitSequenceNumber && (
                              <span className="text-[10px] font-semibold text-slate-500">
                                Visit #{v.visitSequenceNumber} of {v.patientTotalVisits || 1} (Latest)
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">{v.patientName}</div>
                            <div className="text-[11px] text-slate-500">
                              <strong className="text-teal-700">{v.patientCode}</strong>
                              {v.patientPhone ? ` • ${v.patientPhone}` : ''}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-800">{v.doctorName}</td>
                          <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">{formatDateDDMMYYYY(v.visitDate)}</td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="font-bold text-slate-900 font-mono">
                              ৳{parseFloat(v.totalCost || '0').toLocaleString()}
                            </div>
                            {prevCarried > 0 && (
                              <div className="text-[10px] text-amber-800 font-medium">
                                +৳{prevCarried.toLocaleString()} prev. due (Total: ৳{cumPayable.toLocaleString()})
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-semibold text-emerald-700 whitespace-nowrap font-mono">
                            ৳{parseFloat(v.amountPaid || '0').toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-amber-800 whitespace-nowrap font-mono">
                            ৳{due.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => onOpenRecordPayment && onOpenRecordPayment(v)}
                                className="px-2.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>Record Payment</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No pending dues matching your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* TRANSACTIONS LEDGER VIEW */
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Receipt ID &amp; Installment</th>
                  <th className="py-3 px-4">Patient Details</th>
                  <th className="py-3 px-4">Visit Code</th>
                  <th className="py-3 px-4">Payment Date</th>
                  <th className="py-3 px-4">Method &amp; TrxID</th>
                  <th className="py-3 px-4">Collected By Doctor</th>
                  <th className="py-3 px-4 text-right">Visit Balance Context</th>
                  <th className="py-3 px-4 text-right">Amount Received</th>
                  <th className="py-3 px-4 text-center">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      Loading payments ledger...
                    </td>
                  </tr>
                ) : payments.length > 0 ? (
                  payments.map((p) => {
                    const visitTotal = parseFloat(p.visitTotalCost || '0');
                    const visitDue = parseFloat(p.visitOutstandingDue || '0');
                    const visitDisc = parseFloat(p.visitDiscount || '0');
                    const instNum = p.patientInstallmentNumber || p.installmentNumber || 1;
                    const totalInst = p.patientTotalInstallments || p.totalInstallments || 1;
                    const dueBefore = p.previousDueBefore;
                    const dueAfter = p.remainingDueAfter;

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-teal-50/50 transition-colors cursor-pointer"
                        onClick={() => onSelectPatient && onSelectPatient(p.patientId)}
                        title="Click anywhere to view patient profile"
                      >
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-bold text-teal-700 font-mono">{p.paymentId}</div>
                          <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-teal-50 text-teal-800 border border-teal-200">
                            Installment #{instNum} of {totalInst}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{p.patientName}</div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                            <span className="font-bold text-teal-700">{p.patientCode}</span>
                            {p.patientPhone && (
                              <>
                                <span>&bull;</span>
                                <span className="inline-flex items-center gap-0.5">
                                  <Phone className="w-2.5 h-2.5" />
                                  {p.patientPhone}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 font-bold whitespace-nowrap">
                          {p.visitCode}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {formatDateDDMMYYYY(p.paymentDate)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded font-semibold border text-[11px] ${getMethodBadgeStyle(
                                p.paymentMethod
                              )}`}
                            >
                              {p.paymentMethod}
                            </span>
                            {p.transactionRef && (
                              <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                {p.transactionRef}
                              </span>
                            )}
                          </div>
                          {p.notes && (
                            <div className="text-[10px] text-slate-500 truncate max-w-[180px] mt-0.5 italic">
                              {p.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-800 font-medium whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 text-xs">
                            <Stethoscope className="w-3 h-3 text-teal-600" />
                            <span>{p.receiverName || 'Clinic Staff'}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap text-[11px]">
                          <div className="text-slate-600">
                            Visit Bill: <strong>৳{visitTotal.toLocaleString()}</strong>
                            {visitDisc > 0 && (
                              <span className="text-emerald-700 ml-1">(-৳{visitDisc.toLocaleString()})</span>
                            )}
                          </div>
                          {dueBefore !== undefined && dueAfter !== undefined ? (
                            <div className="text-[10px] text-slate-600 mt-0.5">
                              <span>Due Before: <strong className="text-slate-800 font-mono">৳{dueBefore.toLocaleString()}</strong></span>
                              <span className="mx-1">&rarr;</span>
                              <strong className={`font-mono ${dueAfter > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                                {dueAfter > 0 ? `৳${dueAfter.toLocaleString()} Due` : '৳0 Settled'}
                              </strong>
                            </div>
                          ) : visitDue > 0 ? (
                            <span className="text-amber-800 font-bold">
                              Rem. Due: ৳{visitDue.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-semibold inline-flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3" /> Visit Cleared
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-extrabold text-emerald-700 text-sm whitespace-nowrap font-mono">
                          +৳{parseFloat(p.amount).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onSelectPatient && onSelectPatient(p.patientId)}
                              className="px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setUndoTargetPayment({
                                  id: p.id,
                                  paymentId: p.paymentId,
                                  amount: p.amount,
                                  paymentMethod: p.paymentMethod,
                                  paymentDate: p.paymentDate,
                                  visitCode: p.visitCode,
                                  patientName: p.patientName,
                                  receiverName: p.receiverName,
                                  installmentNumber: instNum,
                                  totalInstallments: totalInst,
                                  currentDueBeforeUndo: visitDue,
                                })
                              }
                              className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-rose-700 bg-slate-100 hover:bg-rose-50 rounded border border-slate-200 hover:border-rose-300 transition-colors cursor-pointer inline-flex items-center gap-1"
                              title="Undo / Delete this mistaken payment installment"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Undo</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      <CreditCard className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-700">No payment records found.</p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-3 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 cursor-pointer inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Clear All Filters</span>
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Popup Modal when Undoing a Mistaken Payment Installment */}
      <UndoPaymentConfirmModal
        isOpen={Boolean(undoTargetPayment)}
        payment={undoTargetPayment}
        isDeleting={deletingId !== null}
        onCancel={() => setUndoTargetPayment(null)}
        onConfirm={handleDeletePayment}
      />
    </div>
  );
};
