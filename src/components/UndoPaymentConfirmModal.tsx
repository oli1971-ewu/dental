import React from 'react';
import { AlertTriangle, RotateCcw, Trash2, X, Receipt, Calendar, CreditCard, ArrowRight } from 'lucide-react';
import { formatDateDDMMYYYY } from '../utils/dateFormat.ts';

export interface UndoPaymentTarget {
  id: number;
  paymentId: string;
  amount: string | number;
  paymentMethod?: string;
  paymentDate?: string;
  visitCode?: string;
  patientName?: string;
  installmentNumber?: number;
  totalInstallments?: number;
  receiverName?: string;
  transactionRef?: string | null;
  currentOutstandingDue?: number;
  currentDueBeforeUndo?: number;
}

interface UndoPaymentConfirmModalProps {
  isOpen: boolean;
  payment: UndoPaymentTarget | null;
  loading?: boolean;
  isDeleting?: boolean;
  onCancel: () => void;
  onConfirm: (paymentId: number) => void;
}

export const UndoPaymentConfirmModal: React.FC<UndoPaymentConfirmModalProps> = ({
  isOpen,
  payment,
  loading = false,
  isDeleting = false,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen || !payment) return null;

  const isBusy = loading || isDeleting;
  const amountVal = typeof payment.amount === 'number' ? payment.amount : parseFloat(payment.amount || '0');
  const currentDue =
    payment.currentOutstandingDue !== undefined
      ? payment.currentOutstandingDue
      : payment.currentDueBeforeUndo !== undefined
      ? payment.currentDueBeforeUndo
      : null;
  const restoredDue = currentDue !== null ? Number((currentDue + amountVal).toFixed(2)) : null;

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        {/* Top Warning Banner */}
        <div className="bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-tight text-white">
                Undo &amp; Delete Payment Installment?
              </h3>
              <p className="text-[11px] text-rose-100 font-medium">
                Mistaken payment entry reversal confirmation
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="p-1.5 text-rose-100 hover:text-white hover:bg-white/15 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-rose-50/80 border border-rose-200 text-rose-950 leading-relaxed">
            <p className="font-bold text-rose-900 text-xs mb-1">
              Are you sure you want to delete this installment?
            </p>
            <p className="text-[11px] text-rose-800">
              This will permanently remove receipt{' '}
              <strong className="font-mono font-bold text-rose-950">{payment.paymentId}</strong> and recalculate the
              patient&apos;s running visit &amp; payment ledger immediately.
            </p>
          </div>

          {/* Installment Receipt Summary Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-600" />
                <span className="font-mono font-extrabold text-slate-900 text-xs">{payment.paymentId}</span>
                {payment.installmentNumber && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                    Installment #{payment.installmentNumber}
                    {payment.totalInstallments ? ` of ${payment.totalInstallments}` : ''}
                  </span>
                )}
              </div>
              <span className="font-mono font-black text-sm text-rose-600 tabular-nums">
                -৳{amountVal.toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
              {payment.patientName && (
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Patient</span>
                  <strong className="text-slate-800">{payment.patientName}</strong>
                </div>
              )}
              {payment.visitCode && (
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Visit Reference</span>
                  <strong className="text-teal-700 font-mono">{payment.visitCode}</strong>
                </div>
              )}
              {payment.paymentMethod && (
                <div className="flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Method: <strong className="text-slate-800">{payment.paymentMethod}</strong>
                    {payment.transactionRef ? ` (${payment.transactionRef})` : ''}
                  </span>
                </div>
              )}
              {payment.paymentDate && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Date: <strong className="text-slate-800">{formatDateDDMMYYYY(payment.paymentDate)}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Balance Restoration Preview */}
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between bg-amber-50/90 px-3 py-2 rounded-lg border border-amber-200/80">
              <span className="text-[11px] font-semibold text-amber-950">
                Restored to Latest Due Balance:
              </span>
              {restoredDue !== null && currentDue !== null ? (
                <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
                  <span className="text-slate-600">৳{currentDue.toLocaleString()}</span>
                  <ArrowRight className="w-3 h-3 text-amber-700" />
                  <strong className="font-black text-amber-900">৳{restoredDue.toLocaleString()} Due</strong>
                </div>
              ) : (
                <strong className="font-mono font-extrabold text-amber-900 tabular-nums">
                  +৳{amountVal.toLocaleString()} Restored to Due
                </strong>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-1 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={isBusy}
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              No, Keep Installment
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onConfirm(payment.id)}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isBusy ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>Deleting Installment...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Yes, Delete This Installment</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
