import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { Visit, User } from '../types/index.ts';
import { formatDateDDMMYYYY } from '../utils/dateFormat.ts';
import {
  CalendarCheck,
  Search,
  Stethoscope,
  CreditCard,
  Plus,
  Eye,
  FileSpreadsheet,
  FileText,
  Tag,
  X,
  RotateCcw,
  History,
  CheckCircle2,
  Phone,
} from 'lucide-react';

interface VisitsPageProps {
  refreshKey?: number;
  onSelectVisit: (visitId: number, patientId?: number) => void;
  onSelectPatient?: (patientId: number) => void;
  onOpenNewVisit: () => void;
  onOpenRecordPayment: (visit: any, initialMode?: 'payment' | 'discount') => void;
  onOpenCreatePrescription?: (patientId: number, visitId: number) => void;
}

export const VisitsPage: React.FC<VisitsPageProps> = ({
  refreshKey,
  onSelectVisit,
  onSelectPatient,
  onOpenNewVisit,
  onOpenRecordPayment,
  onOpenCreatePrescription,
}) => {
  const { prescriptionManagementEnabled } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('All');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [dueStatusFilter, setDueStatusFilter] = useState<'all' | 'due' | 'paid'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest_cost' | 'highest_due'>('newest');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const requestCounterRef = React.useRef(0);

  useEffect(() => {
    api.getDoctors().then(setDoctors).catch(console.error);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), searchTerm.trim() ? 220 : 0);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    fetchVisits();
  }, [selectedDoctorId, fromDate, toDate, dueStatusFilter, debouncedSearch, refreshKey]);

  const fetchVisits = async () => {
    const reqId = ++requestCounterRef.current;
    setLoading(true);
    try {
      const data = await api.getVisits({
        doctorId: selectedDoctorId !== 'All' ? parseInt(selectedDoctorId) : undefined,
        fromDate: fromDate.trim() || undefined,
        toDate: toDate.trim() || undefined,
        dueStatus: dueStatusFilter !== 'all' ? dueStatusFilter : undefined,
        hasDue: dueStatusFilter === 'due',
        search: debouncedSearch.trim() || undefined,
      });
      if (reqId === requestCounterRef.current) {
        setVisits(data);
      }
    } catch (e) {
      console.error('Failed to load visits:', e);
    } finally {
      if (reqId === requestCounterRef.current) {
        setLoading(false);
      }
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedDoctorId('All');
    setFromDate('');
    setToDate('');
    setDueStatusFilter('all');
    setSortBy('newest');
  };

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    selectedDoctorId !== 'All' ||
    Boolean(fromDate) ||
    Boolean(toDate) ||
    dueStatusFilter !== 'all';

  const sortedVisits = [...visits].sort((a, b) => {
    switch (sortBy) {
      case 'oldest':
        return a.visitDate.localeCompare(b.visitDate) || a.id - b.id;
      case 'highest_cost':
        return parseFloat(b.totalCost || '0') - parseFloat(a.totalCost || '0');
      case 'highest_due':
        return parseFloat(b.outstandingDue || '0') - parseFloat(a.outstandingDue || '0');
      case 'newest':
      default:
        return b.visitDate.localeCompare(a.visitDate) || b.id - a.id;
    }
  });

  // Summary metrics
  const totalVisitValue = sortedVisits.reduce((sum, v) => sum + parseFloat(v.totalCost || '0'), 0);
  const totalVisitPaid = sortedVisits.reduce((sum, v) => sum + parseFloat(v.amountPaid || '0'), 0);
  const totalVisitDue = sortedVisits.reduce((sum, v) => sum + parseFloat(v.outstandingDue || '0'), 0);
  const multiVisitCount = sortedVisits.filter((v) => (v.patientTotalVisits || 1) > 1).length;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-teal-600" />
            <h1 className="text-xl font-bold text-slate-900">Professional Multi-Visit History</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-200">
              Chronological Shared Timeline
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track multiple visits per patient across different doctors with chronological visit numbering, procedure breakdowns, and balance history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              if (fromDate.trim()) params.set('fromDate', fromDate.trim());
              if (toDate.trim()) params.set('toDate', toDate.trim());
              if (selectedDoctorId !== 'All') params.set('doctorId', selectedDoctorId);
              const qs = params.toString() ? `?${params.toString()}` : '';
              api.downloadCsv(`/api/export/visits.csv${qs}`, 'dental_visits.csv');
            }}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={onOpenNewVisit}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Visit</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block mb-0.5">Total Visits Listed</span>
          <span className="text-xl font-extrabold text-slate-900">{sortedVisits.length}</span>
          <span className="text-[11px] text-teal-700 font-medium block mt-0.5">
            {multiVisitCount} part of multi-visit series
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block mb-0.5">Total Treatment &amp; Test Value</span>
          <span className="text-xl font-extrabold text-slate-900">
            ৳{totalVisitValue.toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">Net billed charges</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block mb-0.5">Total Collected</span>
          <span className="text-xl font-extrabold text-emerald-700">
            ৳{totalVisitPaid.toLocaleString()}
          </span>
          <span className="text-[11px] text-emerald-600 block mt-0.5">Settled &amp; partial installments</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block mb-0.5">Outstanding Visit Dues</span>
          <span className="text-xl font-extrabold text-amber-800">
            ৳{totalVisitDue.toLocaleString()}
          </span>
          <span className="text-[11px] text-amber-700 font-medium block mt-0.5">
            {sortedVisits.filter((v) => parseFloat(v.outstandingDue || '0') > 0).length} visit(s) with balance
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Patient Name, Patient ID (DP-1001), Phone, Visit ID (VST-1001), or Diagnosis..."
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
              Showing <strong className="text-slate-800">{sortedVisits.length}</strong> visit{sortedVisits.length === 1 ? '' : 's'}
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

        <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
          {/* Attending Doctor */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Attending Doctor
            </label>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
            >
              <option value="All">All Doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Visit Date From */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Visit Date From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Visit Date To */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Visit Date To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Dues / Payment Status */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Payment / Due Status
            </label>
            <select
              value={dueStatusFilter}
              onChange={(e) => setDueStatusFilter(e.target.value as any)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Visits</option>
              <option value="due">With Outstanding Due Only</option>
              <option value="paid">Fully Paid / Cleared Only</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Sort Visits By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500 font-medium"
            >
              <option value="newest">Newest Visit First</option>
              <option value="oldest">Oldest Visit First</option>
              <option value="highest_cost">Highest Cost First</option>
              <option value="highest_due">Highest Due First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Visits Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Visit ID &amp; Sequence</th>
                <th className="py-3 px-4">Patient Details</th>
                <th className="py-3 px-4">Attending Doctor</th>
                <th className="py-3 px-4">Visit Date &amp; Time</th>
                <th className="py-3 px-4">Clinical Diagnosis</th>
                <th className="py-3 px-4 text-right">Charges Breakdown</th>
                <th className="py-3 px-4 text-right">Total Cost</th>
                <th className="py-3 px-4 text-right">Paid</th>
                <th className="py-3 px-4 text-right">Due</th>
                <th className="py-3 px-4 text-center w-60 min-w-[230px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    Loading chronological visit history...
                  </td>
                </tr>
              ) : sortedVisits.length > 0 ? (
                sortedVisits.map((v) => {
                  const due = parseFloat(v.outstandingDue || '0');
                  const treatmentCost = parseFloat(v.totalTreatmentCost || '0');
                  const testCost = parseFloat(v.totalTestCost || '0');
                  const disc = parseFloat(v.discount || '0');
                  const seqNum = v.visitSequenceNumber || 1;
                  const totalPatVisits = v.patientTotalVisits || 1;
                  const uniqueDocs = v.patientUniqueDoctorsCount || 1;
                  const isLatest = v.isLatestVisit !== undefined ? v.isLatestVisit : seqNum === totalPatVisits;
                  const prevCarried = v.previousCarriedDue || 0;
                  const balAfter = v.balanceAfterVisit || 0;

                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-teal-50/50 transition-colors cursor-pointer"
                      onClick={() => {
                        if (onSelectPatient) {
                          onSelectPatient(v.patientId);
                        } else {
                          onSelectVisit(v.id, v.patientId);
                        }
                      }}
                      title="Click anywhere to view full patient timeline"
                    >
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-teal-700">{v.visitId}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-teal-50 text-teal-800 border border-teal-200">
                            Visit #{seqNum} of {totalPatVisits}
                            {isLatest ? ' (Latest)' : ''}
                          </span>
                          {uniqueDocs > 1 && (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-800 border border-indigo-200"
                              title={`This patient has visited ${uniqueDocs} different doctors`}
                            >
                              {uniqueDocs} Docs
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{v.patientName}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                          <span className="font-bold text-teal-700">{v.patientCode}</span>
                          {v.patientPhone && (
                            <>
                              <span>&bull;</span>
                              <span className="inline-flex items-center gap-0.5">
                                <Phone className="w-2.5 h-2.5" />
                                {v.patientPhone}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-medium border border-slate-200">
                          <Stethoscope className="w-3 h-3 text-teal-600" />
                          <span>{v.doctorName}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        <div className="font-medium text-slate-800">{formatDateDDMMYYYY(v.visitDate)}</div>
                        {v.visitTime && <div className="text-[10px] text-slate-400">{v.visitTime}</div>}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-medium text-slate-800 truncate">
                          {v.diagnosis || 'Routine Dental Checkup'}
                        </div>
                        {v.complaints && (
                          <div className="text-[10px] text-slate-500 truncate">
                            Complaint: {v.complaints}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap text-[11px] text-slate-600">
                        <div>Tx: <strong>৳{treatmentCost.toLocaleString()}</strong></div>
                        {testCost > 0 && <div>Tests: <strong>৳{testCost.toLocaleString()}</strong></div>}
                        {disc > 0 && <div className="text-emerald-700">Disc: -৳{disc.toLocaleString()}</div>}
                        {prevCarried > 0 && (
                          <div className="text-amber-800 font-semibold">+৳{prevCarried.toLocaleString()} prev. due</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap font-mono">
                        ৳{parseFloat(v.totalCost || '0').toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-emerald-700 whitespace-nowrap font-mono">
                        ৳{parseFloat(v.amountPaid || '0').toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold whitespace-nowrap">
                        {isLatest ? (
                          due > 0 ? (
                            <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-extrabold font-mono">
                              ৳{due.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-medium">৳0 (Paid)</span>
                          )
                        ) : balAfter > 0 ? (
                          <span
                            className="text-amber-800 bg-amber-50/70 px-2 py-0.5 rounded border border-amber-200 text-[10px] font-bold"
                            title={`৳${balAfter.toLocaleString()} carried forward to subsequent visit`}
                          >
                            ৳{balAfter.toLocaleString()} &rarr; Carried
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">৳0 (Paid)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          {isLatest && due > 0 ? (
                            <button
                              type="button"
                              onClick={() => onOpenRecordPayment(v)}
                              className="h-7 px-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                              title={`Record Payment ৳${due.toLocaleString()}`}
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Record Payment</span>
                            </button>
                          ) : !isLatest && balAfter > 0 ? (
                            <span className="h-7 px-2.5 text-[10px] font-semibold text-amber-800 bg-amber-50 rounded border border-amber-200 flex items-center gap-1 select-none">
                              <span>Carried Forward</span>
                            </span>
                          ) : (
                            <span className="h-7 px-2.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded border border-emerald-200 flex items-center gap-1 select-none">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Settled</span>
                            </span>
                          )}

                          {prescriptionManagementEnabled && onOpenCreatePrescription && (
                            <button
                              type="button"
                              onClick={() => onOpenCreatePrescription(v.patientId, v.id)}
                              className="h-7 px-2.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Create Prescription for this Visit"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Rx</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (onSelectPatient) {
                                onSelectPatient(v.patientId);
                              } else {
                                onSelectVisit(v.id, v.patientId);
                              }
                            }}
                            className="h-7 px-2.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 transition-colors flex items-center gap-1 cursor-pointer"
                            title="View Complete Centralized Patient Profile"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Timeline</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400">
                    <CalendarCheck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No matching visit records found.</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Adjust your date range or search query, or reset filters.
                    </p>
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
    </div>
  );
};
