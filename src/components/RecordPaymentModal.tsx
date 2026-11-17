import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { User } from '../types/index.ts';
import { UndoPaymentConfirmModal, UndoPaymentTarget } from './UndoPaymentConfirmModal.tsx';
import { formatDateDDMMYYYY } from '../utils/dateFormat.ts';
import {
  X,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Printer,
  RotateCcw,
  Tag,
  History,
  Check,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Calculator,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface PaymentRecord {
  id: number;
  paymentId: string;
  visitId?: number;
  visitCode?: string;
  amount: string;
  paymentMethod: string;
  transactionRef?: string | null;
  notes?: string | null;
  paymentDate: string;
  receiverName?: string;
  installmentNumber?: number;
  totalInstallments?: number;
  patientInstallmentNumber?: number;
  patientTotalInstallments?: number;
  cumulativePaidAfter?: number;
  remainingDueAfter?: number;
  previousDueBefore?: number;
  createdAt?: string;
}

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentRecorded: (res: any) => void;
  visit: {
    id: number;
    visitId: string;
    patientId?: number;
    totalCost: string;
    amountPaid: string;
    outstandingDue: string;
    previousCarriedDue?: number;
    cumulativePayable?: number;
    balanceAfterVisit?: number;
    isLatestVisit?: boolean;
    patientName?: string;
    patientCode?: string;
    doctorName?: string;
    diagnosis?: string;
    visitDate?: string;
    discount?: string;
    totalTreatmentCost?: string;
    totalTestCost?: string;
    additionalCharges?: string;
    payments?: PaymentRecord[];
    payAllPatientVisits?: boolean;
  };
  initialMode?: 'payment' | 'discount';
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  onPaymentRecorded,
  visit,
  initialMode = 'payment',
}) => {
  const { user } = useAuth();
  const [doctorsList, setDoctorsList] = useState<User[]>([]);
  const [collectorDoctorId, setCollectorDoctorId] = useState<number>(user?.id || 1);

  // Always target the patient's latest visit for collecting payments
  const [latestVisitId, setLatestVisitId] = useState<number>(visit.id);
  const [patientVisits, setPatientVisits] = useState<any[]>([]);
  const [patientInfo, setPatientInfo] = useState<{ id?: number; name?: string; patientId?: string }>({
    id: visit.patientId,
    name: visit.patientName,
    patientId: visit.patientCode,
  });

  // Live financial state for latest visit & cumulative patient balance
  const [currentVisitCode, setCurrentVisitCode] = useState(visit.visitId);
  const [currentVisitDoctor, setCurrentVisitDoctor] = useState(visit.doctorName || '');
  const [currentVisitDate, setCurrentVisitDate] = useState(visit.visitDate || '');
  const [currentTotal, setCurrentTotal] = useState(parseFloat(visit.totalCost || '0'));
  const [alreadyPaidInLatest, setAlreadyPaidInLatest] = useState(parseFloat(visit.amountPaid || '0'));
  const [previousCarriedDue, setPreviousCarriedDue] = useState<number>(visit.previousCarriedDue || 0);
  const [cumulativePayable, setCumulativePayable] = useState<number>(
    visit.cumulativePayable !== undefined
      ? visit.cumulativePayable
      : (visit.previousCarriedDue || 0) + parseFloat(visit.totalCost || '0')
  );
  const [currentDue, setCurrentDue] = useState(parseFloat(visit.outstandingDue || '0'));
  const [currentDiscount, setCurrentDiscount] = useState(parseFloat(visit.discount || '0'));

  // Overall patient lifetime summary across all visits
  const [lifetimeTotalExpenses, setLifetimeTotalExpenses] = useState<number>(parseFloat(visit.totalCost || '0'));
  const [lifetimeTotalPaid, setLifetimeTotalPaid] = useState<number>(parseFloat(visit.amountPaid || '0'));

  // Installments list (all patient payments newest first)
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>(visit.payments || []);
  const [showHistory, setShowHistory] = useState(true);
  const [undoTargetPayment, setUndoTargetPayment] = useState<UndoPaymentTarget | null>(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);

  // Itemized treatments and tests breakdown for latest visit
  const [visitTreatments, setVisitTreatments] = useState<any[]>([]);
  const [visitTests, setVisitTests] = useState<any[]>([]);

  // Active view tab: 'pay_full' | 'pay_partial' | 'discount'
  const [activeTab, setActiveTab] = useState<'pay_full' | 'pay_partial' | 'discount'>(
    initialMode === 'discount' ? 'discount' : 'pay_full'
  );

  // Form states - Payment
  const [amount, setAmount] = useState(
    parseFloat(visit.outstandingDue || '0') > 0 ? parseFloat(visit.outstandingDue || '0').toString() : ''
  );
  const [paymentMethod, setPaymentMethod] = useState<
    'Cash' | 'bKash' | 'Nagad' | 'Rocket' | 'Bank transfer' | 'Card / POS' | 'Other'
  >('Cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

  // Form states - Discount
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [discountSuccessMessage, setDiscountSuccessMessage] = useState<string | null>(null);

  // Status & Receipt
  const [loading, setLoading] = useState(false);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<any | null>(null);

  // Load the patient's latest visit and cumulative financial state from server
  const loadLatestPaymentState = async (
    targetVisitId: number,
    modeOverride?: 'pay_full' | 'pay_partial' | 'discount'
  ) => {
    try {
      const patId = visit.patientId;
      const targetMode = modeOverride || activeTab;

      // If we already know the patientId from visit props, load full patient directly in 1 request
      if (patId) {
        const fullPatient = await api.getPatient(patId);
        if (fullPatient && fullPatient.visits && fullPatient.visits.length > 0) {
          setPatientInfo({
            id: fullPatient.id,
            name: fullPatient.name,
            patientId: fullPatient.patientId,
          });
          setPatientVisits(fullPatient.visits);

          // Always take payment according to the LATEST visit (index 0 since visits are sorted newest-first)
          const latestVisit = fullPatient.visits[0];
          const tot = parseFloat(latestVisit.totalCost || '0');
          const paidInLatest = parseFloat(latestVisit.amountPaid || '0');
          const due = parseFloat(latestVisit.outstandingDue || '0');
          const disc = parseFloat(latestVisit.discount || '0');
          const carried =
            latestVisit.previousCarriedDue !== undefined ? Number(latestVisit.previousCarriedDue) : 0;
          const cumPayable =
            latestVisit.cumulativePayable !== undefined
              ? Number(latestVisit.cumulativePayable)
              : Number((carried + tot).toFixed(2));

          setLatestVisitId(latestVisit.id);
          setCurrentVisitCode(latestVisit.visitId);
          setCurrentVisitDoctor(latestVisit.doctorName || '');
          setCurrentVisitDate(latestVisit.visitDate || '');
          setCurrentTotal(tot);
          setAlreadyPaidInLatest(paidInLatest);
          setPreviousCarriedDue(carried);
          setCumulativePayable(cumPayable);
          setCurrentDue(due);
          setCurrentDiscount(disc);

          setLifetimeTotalExpenses(fullPatient.financialSummary?.totalExpenses || tot);
          setLifetimeTotalPaid(fullPatient.financialSummary?.totalAmountPaid || paidInLatest);

          // Show all patient payment installments in chronological order (newest first)
          setPaymentHistory(fullPatient.payments || latestVisit.payments || []);
          setVisitTreatments(latestVisit.treatments || []);
          setVisitTests(latestVisit.diagnosticTests || []);

          if (targetMode === 'pay_full') {
            setAmount(due > 0 ? due.toString() : '');
          }
          return;
        }
      }

      // Fallback if patientId is not pre-known
      const initialVisit: any = await api.getVisit(targetVisitId);
      if (!initialVisit) return;

      const tot = parseFloat(initialVisit.totalCost || '0');
      const paid = parseFloat(initialVisit.amountPaid || '0');
      const due = parseFloat(initialVisit.outstandingDue || '0');
      const disc = parseFloat(initialVisit.discount || '0');
      const carried = initialVisit.previousCarriedDue || 0;
      const cumPayable = initialVisit.cumulativePayable || carried + tot;

      setLatestVisitId(initialVisit.id);
      setCurrentVisitCode(initialVisit.visitId);
      setCurrentVisitDoctor(initialVisit.doctorName || '');
      setCurrentVisitDate(initialVisit.visitDate || '');
      setCurrentTotal(tot);
      setAlreadyPaidInLatest(paid);
      setPreviousCarriedDue(carried);
      setCumulativePayable(cumPayable);
      setCurrentDue(due);
      setCurrentDiscount(disc);
      setLifetimeTotalExpenses(tot);
      setLifetimeTotalPaid(paid);
      setPaymentHistory(initialVisit.payments || []);
      setVisitTreatments(initialVisit.treatments || []);
      setVisitTests(initialVisit.diagnosticTests || []);

      if (targetMode === 'pay_full') {
        setAmount(due > 0 ? due.toString() : '');
      }
    } catch (e) {
      console.error('Failed to load latest visit payment details:', e);
    }
  };

  // Sync state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const initialTab = initialMode === 'discount' ? 'discount' : 'pay_full';
      setActiveTab(initialTab);
      setLatestVisitId(visit.id);
      setSuccessReceipt(null);
      setError(null);
      setDiscountSuccessMessage(null);
      setUndoTargetPayment(null);
      setTransactionRef('');
      setNotes('');
      setDiscountAmount('');
      setDiscountReason('');

      const tot = parseFloat(visit.totalCost || '0');
      const paid = parseFloat(visit.amountPaid || '0');
      const due = parseFloat(visit.outstandingDue || '0');
      const disc = parseFloat(visit.discount || '0');
      const carried = visit.previousCarriedDue || 0;

      setCurrentVisitCode(visit.visitId);
      setCurrentVisitDoctor(visit.doctorName || '');
      setCurrentVisitDate(visit.visitDate || '');
      setCurrentTotal(tot);
      setAlreadyPaidInLatest(paid);
      setPreviousCarriedDue(carried);
      setCumulativePayable(visit.cumulativePayable ?? carried + tot);
      setCurrentDue(due);
      setCurrentDiscount(disc);
      setAmount(due > 0 ? due.toString() : '');

      // Only fetch doctors once if not already cached
      if (doctorsList.length === 0) {
        api
          .getDoctors()
          .then((docs) => {
            setDoctorsList(docs);
            if (user?.id) {
              setCollectorDoctorId(user.id);
            } else if (docs.length > 0) {
              setCollectorDoctorId(docs[0].id);
            }
          })
          .catch(console.error);
      } else if (user?.id) {
        setCollectorDoctorId(user.id);
      }

      loadLatestPaymentState(visit.id, initialTab);
    }
  }, [isOpen, visit.id, initialMode, user]);

  if (!isOpen) return null;

  const enteredAmount = parseFloat(amount) || 0;
  const remainingDueAfterPayment = Math.max(0, Number((currentDue - enteredAmount).toFixed(2)));
  const isFullPayment = currentDue > 0 && Math.abs(enteredAmount - currentDue) < 0.01;

  // Percentage shortcuts
  const handlePresetPercentage = (pct: number) => {
    const calculated = Math.round((currentDue * pct) / 100);
    setAmount(calculated.toString());
    setActiveTab(Math.abs(calculated - currentDue) < 0.01 ? 'pay_full' : 'pay_partial');
  };

  // Fixed Amount Shortcuts
  const handlePresetFixed = (amt: number) => {
    const valid = Math.min(currentDue, amt);
    setAmount(valid.toString());
    setActiveTab(Math.abs(valid - currentDue) < 0.01 ? 'pay_full' : 'pay_partial');
  };

  // Handle Voiding / Deleting a Mistaken Payment Entry via Confirmation Popup
  const handleConfirmDeletePayment = async (paymentId: number) => {
    setDeletingPaymentId(paymentId);
    setError(null);
    try {
      const res = await api.deletePayment(paymentId);
      setUndoTargetPayment(null);

      // Instant optimistic UI update
      setPaymentHistory((prev) => prev.filter((p) => p.id !== paymentId));
      if (res.financials) {
        setAlreadyPaidInLatest(parseFloat(res.financials.amountPaid || '0'));
        setCurrentDue(parseFloat(res.financials.outstandingDue || '0'));
        setAmount(parseFloat(res.financials.outstandingDue || '0') > 0 ? res.financials.outstandingDue.toString() : '');
      }

      onPaymentRecorded({ deletedPaymentId: paymentId });

      // Background profile sync
      loadLatestPaymentState(latestVisitId, 'pay_full').catch(console.error);
    } catch (err: any) {
      setError(err.message || 'Failed to undo payment installment');
    } finally {
      setDeletingPaymentId(null);
    }
  };

  // Handle Recording a Payment against the Latest Balance
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payVal = parseFloat(amount);
    if (isNaN(payVal) || payVal <= 0) {
      setError('Please enter a valid payment amount greater than ৳0.');
      return;
    }

    if (payVal > currentDue + 0.01) {
      setError(
        `Payment amount (৳${payVal.toLocaleString()}) exceeds the latest outstanding due of ৳${currentDue.toLocaleString()}.`
      );
      return;
    }

    setLoading(true);
    try {
      const collectingDocName =
        doctorsList.find((d) => d.id === collectorDoctorId)?.fullName || user?.fullName || 'Clinic Doctor';

      const res = await api.recordPayment(latestVisitId, {
        amount: payVal,
        paymentMethod,
        transactionRef: transactionRef.trim() || undefined,
        notes: notes.trim() || undefined,
        paymentDate,
        receivedBy: collectorDoctorId,
      });

      const dueBefore = currentDue;
      const updatedPaidInLatest = res.financials?.amountPaid
        ? parseFloat(res.financials.amountPaid)
        : Number((alreadyPaidInLatest + payVal).toFixed(2));
      const updatedDue =
        res.financials?.outstandingDue !== undefined
          ? parseFloat(res.financials.outstandingDue)
          : Math.max(0, Number((dueBefore - payVal).toFixed(2)));

      const latestPayment = {
        ...res.payment,
        receiverName: res.payment?.receiverName || collectingDocName,
      };

      // Instantly update local state so receipt is shown with 0ms delay!
      setAlreadyPaidInLatest(updatedPaidInLatest);
      setCurrentDue(updatedDue);
      setLifetimeTotalPaid((prev) => Number((prev + payVal).toFixed(2)));
      setPaymentHistory((prev) => [latestPayment, ...(prev || [])]);

      setSuccessReceipt({
        payment: latestPayment,
        financials: res.financials,
        previousDue: dueBefore,
        amountPaidThisTime: payVal,
        newRemainingDue: updatedDue,
        newTotalPaid: updatedPaidInLatest,
        installmentNumber:
          latestPayment.patientInstallmentNumber ||
          latestPayment.installmentNumber ||
          paymentHistory.length + 1,
        collectorName: latestPayment.receiverName || collectingDocName,
      });

      onPaymentRecorded(res);

      // Background profile sync (does not block receipt UI)
      loadLatestPaymentState(latestVisitId, 'pay_full').catch(console.error);
    } catch (err: any) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  // Trigger another payment for any remaining due
  const handleAnotherPartialPayment = () => {
    if (!successReceipt) return;
    const newDue = successReceipt.newRemainingDue;
    setAmount(newDue.toString());
    setSuccessReceipt(null);
    setTransactionRef('');
    setNotes('');
    setActiveTab('pay_partial');
    setError(null);
    setDiscountSuccessMessage(null);
  };

  // Handle Applying a Discount / Concession on the Latest Visit
  const handleApplyDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDiscountSuccessMessage(null);

    const discVal = parseFloat(discountAmount);
    if (isNaN(discVal) || discVal <= 0) {
      setError('Please enter a valid discount amount greater than ৳0.');
      return;
    }

    if (discVal > currentDue + 0.01) {
      setError(
        `Discount amount (৳${discVal.toLocaleString()}) cannot exceed the current outstanding due of ৳${currentDue.toLocaleString()}.`
      );
      return;
    }

    setDiscountLoading(true);
    try {
      const res = await api.applyDiscount(latestVisitId, {
        discountAmount: discVal,
        reason: discountReason.trim() || 'Concession / Waiver',
        isTotalDiscount: false,
      });

      if (res.financials) {
        setCurrentTotal(parseFloat(res.financials.totalCost || '0'));
        setCurrentDue(parseFloat(res.financials.outstandingDue || '0'));
        setAmount(parseFloat(res.financials.outstandingDue || '0') > 0 ? res.financials.outstandingDue.toString() : '');
      }

      setDiscountSuccessMessage(
        `✓ Concession of ৳${discVal.toLocaleString()} applied! Latest balance updated.`
      );
      setDiscountAmount('');
      setDiscountReason('');
      onPaymentRecorded(res);

      // Background profile sync
      loadLatestPaymentState(latestVisitId, 'pay_full').catch(console.error);
    } catch (err: any) {
      setError(err.message || 'Failed to apply discount');
    } finally {
      setDiscountLoading(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const paidProgressPct =
    cumulativePayable > 0
      ? Math.min(100, Math.round((alreadyPaidInLatest / cumulativePayable) * 100))
      : 100;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]">
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 text-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/40 text-teal-300 flex items-center justify-center shadow-2xs shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-white text-sm sm:text-base">
                    Record Payment &bull; Latest Account Settlement
                  </h3>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-teal-500/20 text-teal-200 border border-teal-400/30">
                    Latest: {currentVisitCode}
                  </span>
                  {currentVisitDate && (
                    <span className="text-[11px] text-slate-300 font-medium">
                      ({formatDateDDMMYYYY(currentVisitDate)})
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Patient:{' '}
                  <strong className="text-white font-semibold">
                    {patientInfo.name || visit.patientName || 'N/A'}
                  </strong>
                  {patientInfo.patientId ? ` (${patientInfo.patientId})` : ''}
                  {currentVisitDoctor && (
                    <span>
                      {' '}
                      &middot; Attending: <strong className="text-teal-200">{currentVisitDoctor}</strong>
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="p-6 overflow-y-auto space-y-5 text-xs">
            {/* RECEIPT / SUCCESS CONFIRMATION VIEW */}
            {successReceipt ? (
              <div className="space-y-5">
                {/* Green Success Banner */}
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-sm text-emerald-900">
                      Payment Installment Recorded Successfully!
                    </div>
                    <p className="text-emerald-800 text-xs leading-relaxed">
                      Installment #{successReceipt.installmentNumber} recorded as receipt{' '}
                      <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-300">
                        {successReceipt.payment.paymentId}
                      </strong>{' '}
                      for{' '}
                      <strong className="text-emerald-950 font-bold">
                        ৳{successReceipt.amountPaidThisTime.toLocaleString()}
                      </strong>{' '}
                      via {successReceipt.payment.paymentMethod}.
                    </p>
                  </div>
                </div>

                {/* Payment Summary Box */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Receipt ID:</span>
                    <span className="font-mono font-bold text-teal-700">{successReceipt.payment.paymentId}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Applied to Latest Visit:</span>
                    <span className="font-mono font-bold text-slate-800">{currentVisitCode}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Collected / Received By:</span>
                    <span className="font-semibold text-teal-800">
                      {successReceipt.collectorName || successReceipt.payment.receiverName || 'Clinic Staff'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Previous Balance Due:</span>
                    <span className="font-semibold text-slate-800 font-mono">
                      ৳{successReceipt.previousDue.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Amount Paid Now:</span>
                    <span className="font-bold text-emerald-700 font-mono">
                      +৳{successReceipt.amountPaidThisTime.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm">
                    <span className="font-bold text-slate-900">Latest Remaining Due:</span>
                    <span
                      className={`font-extrabold font-mono ${
                        successReceipt.newRemainingDue > 0 ? 'text-amber-800' : 'text-emerald-700'
                      }`}
                    >
                      ৳{successReceipt.newRemainingDue.toLocaleString()}
                      {successReceipt.newRemainingDue === 0 ? ' (Fully Settled!)' : ' (Due Remains)'}
                    </span>
                  </div>
                </div>

                {/* Actions after Payment */}
                <div className="space-y-2 pt-1">
                  {successReceipt.newRemainingDue > 0 ? (
                    <button
                      type="button"
                      onClick={handleAnotherPartialPayment}
                      className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>
                        Record Another Installment for Remaining ৳{successReceipt.newRemainingDue.toLocaleString()}
                      </span>
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-center text-xs flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>✓ 100% settled! No outstanding due remains across any visit.</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handlePrintReceipt}
                      className="py-2.5 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print Receipt</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>Done / Close</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ACTIVE FORM & LEDGER VIEW */
              <>
                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {discountSuccessMessage && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{discountSuccessMessage}</span>
                  </div>
                )}

                {/* VERIFIED CUMULATIVE PAYMENT FORMULA CARD */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-teal-600" />
                      <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                        Latest Account Balance &amp; Payment Formula ({currentVisitCode})
                      </span>
                    </div>
                    {patientVisits.length > 1 && (
                      <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                        Visit #{patientVisits.length} of {patientVisits.length} (Latest)
                      </span>
                    )}
                  </div>

                  {/* Step-by-Step Formula Grid when patient has carried-forward dues or multiple visits */}
                  {previousCarriedDue > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-amber-50/80 p-2.5 rounded-lg border border-amber-200">
                        <span className="text-[10px] text-amber-800 uppercase font-bold block">
                          1. Prev. Carried Due
                        </span>
                        <div className="text-sm font-extrabold text-amber-900 font-mono mt-0.5">
                          ৳{previousCarriedDue.toLocaleString()}
                        </div>
                        <span className="text-[10px] text-amber-700 block">From earlier visit(s)</span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 uppercase font-bold block">
                          2. + Latest Visit Bill
                        </span>
                        <div className="text-sm font-extrabold text-slate-900 font-mono mt-0.5">
                          +৳{currentTotal.toLocaleString()}
                        </div>
                        <span className="text-[10px] text-slate-500 block">
                          {currentDiscount > 0 ? `After ৳${currentDiscount.toLocaleString()} disc.` : `Net charges in ${currentVisitCode}`}
                        </span>
                      </div>

                      <div className="bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200">
                        <span className="text-[10px] text-emerald-800 uppercase font-bold block">
                          3. &minus; Paid in {currentVisitCode}
                        </span>
                        <div className="text-sm font-extrabold text-emerald-700 font-mono mt-0.5">
                          &minus;৳{alreadyPaidInLatest.toLocaleString()}
                        </div>
                        <span className="text-[10px] text-emerald-700 block">
                          Payable: ৳{cumulativePayable.toLocaleString()}
                        </span>
                      </div>

                      <div className="bg-slate-900 text-white p-2.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-teal-300 uppercase font-bold block">
                          4. = Latest Total Due
                        </span>
                        <div className="text-base font-black text-amber-300 font-mono mt-0.5">
                          ৳{currentDue.toLocaleString()}
                        </div>
                        <span className="text-[10px] text-slate-300 block">Active collectible balance</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                          Latest Visit Net Bill
                        </span>
                        <div className="text-sm font-extrabold text-slate-900 font-mono mt-0.5">
                          ৳{currentTotal.toLocaleString()}
                          {currentDiscount > 0 && (
                            <span className="block text-[10px] text-emerald-700 font-sans font-normal">
                              (After ৳{currentDiscount.toLocaleString()} discount)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                          Paid in Latest Visit
                        </span>
                        <div className="text-sm font-extrabold text-emerald-700 font-mono mt-0.5">
                          ৳{alreadyPaidInLatest.toLocaleString()}
                          <span className="block text-[10px] text-slate-500 font-sans font-normal">
                            ({paymentHistory.length} total receipt{paymentHistory.length === 1 ? '' : 's'})
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200 text-right">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                          Latest Collectible Due
                        </span>
                        <div
                          className={`text-base font-black font-mono mt-0.5 ${
                            currentDue > 0 ? 'text-amber-800' : 'text-emerald-700'
                          }`}
                        >
                          ৳{currentDue.toLocaleString()}
                          {currentDue === 0 && <span className="text-xs font-semibold ml-1 font-sans">(Settled)</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Patient Lifetime Multi-Visit Verification Bar */}
                  {patientVisits.length > 1 && (
                    <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span>
                        All {patientVisits.length} Visits Total Net Billed:{' '}
                        <strong className="font-mono text-slate-900">৳{lifetimeTotalExpenses.toLocaleString()}</strong>
                      </span>
                      <span>&minus;</span>
                      <span>
                        All Installments Paid:{' '}
                        <strong className="font-mono text-emerald-700">৳{lifetimeTotalPaid.toLocaleString()}</strong>
                      </span>
                      <span>=</span>
                      <span>
                        Current Balance Due:{' '}
                        <strong className="font-mono text-amber-800 font-extrabold">
                          ৳{currentDue.toLocaleString()}
                        </strong>
                      </span>
                    </div>
                  )}

                  {/* Visual Progress Bar */}
                  <div>
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-300"
                        style={{
                          width: `${paidProgressPct}%`,
                        }}
                        title={`Paid: ৳${alreadyPaidInLatest}`}
                      />
                      {currentDue > 0 && enteredAmount > 0 && activeTab !== 'discount' && (
                        <div
                          className="bg-teal-400 h-full transition-all duration-300"
                          style={{
                            width: `${Math.min(
                              100 - paidProgressPct,
                              (enteredAmount / (cumulativePayable || 1)) * 100
                            )}%`,
                          }}
                          title={`Paying now: ৳${enteredAmount}`}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Itemized Cost Breakdown for Latest Visit */}
                {(visitTreatments.length > 0 || visitTests.length > 0) && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                    <div className="bg-slate-900 px-3.5 py-2.5 text-white flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-teal-300 flex items-center gap-1.5">
                        <Stethoscope className="w-3.5 h-3.5 text-teal-400" />
                        <span>Latest Visit ({currentVisitCode}) Itemized Charges</span>
                      </span>
                      <span className="text-[11px] text-slate-300 font-medium">
                        {visitTreatments.length} procedure{visitTreatments.length === 1 ? '' : 's'} &middot;{' '}
                        {visitTests.length} test{visitTests.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="p-3 space-y-1.5 divide-y divide-slate-100 max-h-36 overflow-y-auto">
                      {visitTreatments.map((t: any, idx: number) => (
                        <div key={t.id || idx} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate max-w-[340px]">
                            <span className="w-5 h-5 rounded bg-teal-50 border border-teal-200 text-teal-800 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="font-bold text-slate-800 truncate">{t.treatmentName}</span>
                            {t.toothNumber && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-mono font-bold shrink-0">
                                Tooth #{t.toothNumber}
                              </span>
                            )}
                          </div>
                          <span className="font-extrabold text-slate-900 font-mono shrink-0">
                            ৳{parseFloat(t.cost || '0').toLocaleString()}
                          </span>
                        </div>
                      ))}
                      {visitTests.map((t: any, idx: number) => (
                        <div key={t.id || idx} className="pt-1.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate max-w-[340px]">
                            <span className="w-5 h-5 rounded bg-cyan-50 border border-cyan-200 text-cyan-800 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                              T{idx + 1}
                            </span>
                            <span className="font-bold text-slate-800 truncate">{t.testName}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200 font-semibold shrink-0">
                              {t.category}
                            </span>
                          </div>
                          <span className="font-extrabold text-slate-900 font-mono shrink-0">
                            ৳{parseFloat(t.cost || '0').toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Only show Pay Full / Partial / Discount controls when there is an active due */}
                {currentDue > 0 ? (
                  <>
                    {/* ACTION MODE SELECTOR (Pay Full Due vs Pay Partial vs Apply Discount) */}
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('pay_full');
                          setAmount(currentDue.toString());
                        }}
                        className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          activeTab === 'pay_full'
                            ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Pay Full Due</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('pay_partial');
                          if (isFullPayment && currentDue > 0) {
                            setAmount(Math.round(currentDue * 0.5).toString());
                          }
                        }}
                        className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          activeTab === 'pay_partial'
                            ? 'bg-white text-teal-800 shadow-xs border border-slate-200'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5 text-teal-600" />
                        <span>Partial Payment</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('discount')}
                        className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          activeTab === 'discount'
                            ? 'bg-white text-amber-800 shadow-xs border border-slate-200'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Tag className="w-3.5 h-3.5 text-amber-600" />
                        <span>Discount / Waiver</span>
                      </button>
                    </div>

                    {/* SECTION A: PAYMENT FORM (FULL OR PARTIAL) */}
                    {activeTab !== 'discount' && (
                      <form onSubmit={handleSubmitPayment} className="space-y-4">
                        {/* Amount Input */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="font-bold text-slate-800">
                              {activeTab === 'pay_full'
                                ? 'Full Latest Due to Collect (BDT ৳) *'
                                : `Partial Installment Amount (BDT ৳) *`}
                            </label>
                            <span className="text-[11px] text-slate-500">
                              Latest Collectible Due:{' '}
                              <strong className="text-amber-800 font-mono">৳{currentDue.toLocaleString()}</strong>
                            </span>
                          </div>

                          <div className="relative">
                            <span className="absolute left-3.5 top-2.5 text-slate-400 text-base font-bold">৳</span>
                            <input
                              type="number"
                              step="any"
                              min="1"
                              max={currentDue}
                              required
                              placeholder="Enter payment amount"
                              value={amount}
                              onChange={(e) => {
                                const val = e.target.value;
                                setAmount(val);
                                const num = parseFloat(val);
                                if (!isNaN(num) && Math.abs(num - currentDue) < 0.01) {
                                  setActiveTab('pay_full');
                                } else {
                                  setActiveTab('pay_partial');
                                }
                              }}
                              className="w-full pl-9 pr-3 py-2.5 text-base rounded-xl border border-slate-300 font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </div>

                          {/* Quick Interactive Preset Chips */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-teal-600" />
                              Quick Select:
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setAmount(currentDue.toString());
                                setActiveTab('pay_full');
                              }}
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                                isFullPayment
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                              }`}
                            >
                              Full Due (৳{currentDue.toLocaleString()})
                            </button>
                            {previousCarriedDue > 0 && previousCarriedDue < currentDue && (
                              <button
                                type="button"
                                onClick={() => handlePresetFixed(previousCarriedDue)}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-colors cursor-pointer"
                              >
                                Clear Prev. Due (৳{previousCarriedDue.toLocaleString()})
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handlePresetPercentage(50)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              50% (৳{Math.round(currentDue * 0.5).toLocaleString()})
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePresetPercentage(25)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              25% (৳{Math.round(currentDue * 0.25).toLocaleString()})
                            </button>
                            {currentDue >= 1000 && (
                              <button
                                type="button"
                                onClick={() => handlePresetFixed(1000)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                              >
                                ৳1,000
                              </button>
                            )}
                            {currentDue >= 2000 && (
                              <button
                                type="button"
                                onClick={() => handlePresetFixed(2000)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                              >
                                ৳2,000
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Live Calculation Preview Banner */}
                        <div className="p-3.5 rounded-xl bg-teal-50/80 border border-teal-200 flex items-center justify-between gap-3 text-xs">
                          <div className="space-y-0.5">
                            <span className="font-bold text-teal-950 block">
                              Live Balance Calculation Preview:
                            </span>
                            <div className="text-[11px] text-teal-800 flex items-center gap-1.5 flex-wrap font-medium">
                              <span>Current Due: <strong>৳{currentDue.toLocaleString()}</strong></span>
                              <span>&minus;</span>
                              <span>Paying Now: <strong className="text-emerald-700">৳{enteredAmount.toLocaleString()}</strong></span>
                              <ArrowRight className="w-3 h-3 text-teal-600 inline" />
                              <span>
                                {remainingDueAfterPayment === 0
                                  ? '✓ Account 100% Settled'
                                  : `৳${remainingDueAfterPayment.toLocaleString()} Remaining Due`}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`font-extrabold text-sm font-mono px-2.5 py-1 rounded-lg border ${
                              remainingDueAfterPayment > 0
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            }`}
                          >
                            ৳{remainingDueAfterPayment.toLocaleString()}
                          </span>
                        </div>

                        {/* Payment Method, Doctor Collector & Date */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Payment Method *
                            </label>
                            <select
                              value={paymentMethod}
                              onChange={(e) => setPaymentMethod(e.target.value as any)}
                              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-teal-500"
                            >
                              <option value="Cash">Cash (Counter)</option>
                              <option value="bKash">bKash (Mobile)</option>
                              <option value="Nagad">Nagad (Mobile)</option>
                              <option value="Rocket">Rocket (DBBL)</option>
                              <option value="Bank transfer">Bank transfer</option>
                              <option value="Card / POS">Card / POS</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>

                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Payment Collected By *
                            </label>
                            <select
                              value={collectorDoctorId}
                              onChange={(e) => setCollectorDoctorId(parseInt(e.target.value))}
                              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-teal-500"
                            >
                              {doctorsList.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.fullName} ({d.specialization || d.role})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Payment Date
                            </label>
                            <input
                              type="date"
                              value={paymentDate}
                              onChange={(e) => setPaymentDate(e.target.value)}
                              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500"
                            />
                          </div>
                        </div>

                        {/* Transaction Ref & Notes */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Transaction / TrxID Ref (Optional)
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. TrxID: 9J4K210L or Receipt #"
                              value={transactionRef}
                              onChange={(e) => setTransactionRef(e.target.value)}
                              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">
                              Payment Note / Purpose (Optional)
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Crown installment, previous + current visit due..."
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500"
                            />
                          </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-2 flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl border border-slate-300 font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={loading || enteredAmount <= 0}
                            className="flex-1 py-2.5 px-4 text-white bg-teal-600 hover:bg-teal-700 rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {loading
                                ? 'Recording Payment...'
                                : isFullPayment
                                ? `Collect Full Latest Due (৳${enteredAmount.toLocaleString()})`
                                : `Record Installment #${paymentHistory.length + 1} (৳${enteredAmount.toLocaleString()})`}
                            </span>
                          </button>
                        </div>
                      </form>
                    )}

                    {/* SECTION B: DISCOUNT / CONCESSION PANEL */}
                    {activeTab === 'discount' && (
                      <form onSubmit={handleApplyDiscount} className="space-y-4">
                        <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 space-y-1">
                          <div className="font-bold flex items-center gap-1.5 text-xs text-amber-950">
                            <Tag className="w-4 h-4 text-amber-700" />
                            <span>Apply Doctor Concession or Treatment Discount ({currentVisitCode})</span>
                          </div>
                          <p className="text-[11px] text-amber-800 leading-relaxed">
                            Applying a discount reduces the net bill on the latest visit and immediately decreases the patient&apos;s remaining due.
                          </p>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="font-bold text-slate-800">
                              Discount Amount to Deduct (BDT ৳) *
                            </label>
                            <span className="text-[11px] text-slate-500">
                              Max Allowed: <strong className="text-amber-800">৳{currentDue.toLocaleString()}</strong>
                            </span>
                          </div>

                          <div className="relative">
                            <span className="absolute left-3.5 top-2.5 text-slate-400 text-base font-bold">৳</span>
                            <input
                              type="number"
                              step="any"
                              min="1"
                              max={currentDue}
                              required
                              placeholder="Enter discount amount"
                              value={discountAmount}
                              onChange={(e) => setDiscountAmount(e.target.value)}
                              className="w-full pl-9 pr-3 py-2.5 text-base rounded-xl border border-slate-300 font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Concession / Waiver Reason *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Doctor special concession, Senior citizen, Student waiver"
                            value={discountReason}
                            onChange={(e) => setDiscountReason(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500"
                          />
                        </div>

                        <div className="pt-2 flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setActiveTab('pay_full')}
                            className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl border border-slate-300 font-semibold cursor-pointer"
                          >
                            Back to Payment
                          </button>
                          <button
                            type="submit"
                            disabled={discountLoading || !discountAmount || parseFloat(discountAmount) <= 0}
                            className="flex-1 py-2.5 px-4 text-white bg-amber-600 hover:bg-amber-700 rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Tag className="w-4 h-4" />
                            <span>
                              {discountLoading ? 'Applying...' : `Apply ৳${discountAmount || '0'} Discount`}
                            </span>
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                ) : (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-bold text-xs">
                        This patient&apos;s account is 100% settled. Viewing payment history below.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                )}

                {/* SECTION C: CHRONOLOGICAL PAYMENT HISTORY LEDGER WITH UNDO POPUP */}
                <div className="pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="w-full flex items-center justify-between text-left py-1 text-slate-800 hover:text-slate-950 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-teal-600" />
                      <span className="font-bold text-xs">
                        Patient Payment History ({paymentHistory.length} Installment{paymentHistory.length === 1 ? '' : 's'})
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                      <span>{showHistory ? 'Hide' : 'Show Details'}</span>
                      {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </div>
                  </button>

                  {showHistory && (
                    <div className="mt-2.5 space-y-2">
                      {paymentHistory.length === 0 ? (
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-center text-xs">
                          No payment installments recorded yet.
                        </div>
                      ) : (
                        paymentHistory.map((p, idx) => {
                          const installmentNum =
                            p.patientInstallmentNumber || p.installmentNumber || paymentHistory.length - idx;
                          const totalInst =
                            p.patientTotalInstallments || p.totalInstallments || paymentHistory.length;
                          const isCash = p.paymentMethod === 'Cash';
                          const isBkash = p.paymentMethod === 'bKash';
                          const isNagad = p.paymentMethod === 'Nagad';

                          return (
                            <div
                              key={p.id || idx}
                              className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold px-2 py-0.5 rounded text-[10px] bg-teal-50 text-teal-800 border border-teal-200">
                                    Installment #{installmentNum} of {totalInst}
                                  </span>
                                  <span className="font-mono text-teal-700 font-bold">
                                    {p.paymentId}
                                  </span>
                                  {p.visitCode && (
                                    <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-semibold">
                                      {p.visitCode}
                                    </span>
                                  )}
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                      isBkash
                                        ? 'bg-pink-50 text-pink-700 border border-pink-200'
                                        : isNagad
                                        ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                        : isCash
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                                    }`}
                                  >
                                    {p.paymentMethod}
                                  </span>
                                </div>

                                <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                                  <span>Date: <strong className="text-slate-700">{formatDateDDMMYYYY(p.paymentDate)}</strong></span>
                                  <span>&middot;</span>
                                  <span>Collected by: <strong className="text-teal-800">{p.receiverName || 'Clinic Doctor'}</strong></span>
                                  {p.transactionRef && (
                                    <>
                                      <span>&middot;</span>
                                      <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded">
                                        Ref: {p.transactionRef}
                                      </span>
                                    </>
                                  )}
                                  {p.notes && (
                                    <span className="italic text-slate-600">&ldquo;{p.notes}&rdquo;</span>
                                  )}
                                </div>

                                {(p.previousDueBefore !== undefined || p.cumulativePaidAfter !== undefined || p.remainingDueAfter !== undefined) && (
                                  <div className="text-[10px] text-slate-600 flex flex-wrap items-center gap-2.5 pt-1 bg-slate-50 px-2 py-1 rounded border border-slate-200/80">
                                    {p.previousDueBefore !== undefined && (
                                      <span>
                                        Due Before: <strong className="text-slate-800 font-mono">৳{p.previousDueBefore.toLocaleString()}</strong>
                                      </span>
                                    )}
                                    {p.previousDueBefore !== undefined && <span>&rarr;</span>}
                                    <span>
                                      Paid: <strong className="text-emerald-700 font-mono">+৳{parseFloat(p.amount).toLocaleString()}</strong>
                                    </span>
                                    {p.remainingDueAfter !== undefined && (
                                      <>
                                        <span>&rarr;</span>
                                        <span>
                                          Balance After:{' '}
                                          <strong className={`font-mono ${p.remainingDueAfter > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                                            {p.remainingDueAfter > 0 ? `৳${p.remainingDueAfter.toLocaleString()} Due` : '৳0 (Settled)'}
                                          </strong>
                                        </span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                <div className="text-right">
                                  <div className="font-extrabold text-sm text-emerald-700 font-mono">
                                    +৳{parseFloat(p.amount).toLocaleString()}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setUndoTargetPayment({
                                      id: p.id,
                                      paymentId: p.paymentId,
                                      amount: p.amount,
                                      paymentMethod: p.paymentMethod,
                                      paymentDate: p.paymentDate,
                                      visitCode: p.visitCode || currentVisitCode,
                                      patientName: patientInfo.name || visit.patientName,
                                      receiverName: p.receiverName,
                                      installmentNumber: installmentNum,
                                      totalInstallments: totalInst,
                                      currentDueBeforeUndo: currentDue,
                                    })
                                  }
                                  className="px-2.5 py-1.5 text-slate-600 hover:text-rose-700 bg-slate-100 hover:bg-rose-50 rounded-lg border border-slate-200 hover:border-rose-300 transition-colors cursor-pointer flex items-center gap-1 font-semibold text-[11px]"
                                  title="Undo / Delete this mistaken payment installment"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Undo</span>
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Popup Modal for Undoing a Mistaken Payment Installment */}
      <UndoPaymentConfirmModal
        isOpen={Boolean(undoTargetPayment)}
        payment={undoTargetPayment}
        isDeleting={deletingPaymentId !== null}
        onCancel={() => setUndoTargetPayment(null)}
        onConfirm={handleConfirmDeletePayment}
      />
    </>
  );
};
