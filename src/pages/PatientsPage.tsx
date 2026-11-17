import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { Patient, User } from '../types/index.ts';
import { formatDateDDMMYYYY } from '../utils/dateFormat.ts';
import {
  Users,
  UserCheck,
  Search,
  Plus,
  Phone,
  CalendarCheck,
  Eye,
  FileSpreadsheet,
  CreditCard,
  CheckCircle2,
  X,
  RotateCcw,
  Stethoscope,
} from 'lucide-react';

interface PatientsPageProps {
  refreshKey?: number;
  mode?: 'central' | 'own';
  onSelectPatient: (patientId: number) => void;
  onOpenNewPatientModal: () => void;
  onOpenNewVisitForPatient: (patient: Patient) => void;
  onOpenPaymentForPatient?: (patient: Patient) => void;
}

export const PatientsPage: React.FC<PatientsPageProps> = ({
  refreshKey,
  mode = 'central',
  onSelectPatient,
  onOpenNewPatientModal,
  onOpenNewVisitForPatient,
  onOpenPaymentForPatient,
}) => {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('All');
  const [dueStatusFilter, setDueStatusFilter] = useState<'all' | 'due' | 'paid'>('all');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    mode === 'own' && user?.id ? String(user.id) : 'All'
  );
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest_due' | 'most_visits' | 'name'>('newest');
  const [loading, setLoading] = useState(true);
  const requestCounterRef = React.useRef(0);

  useEffect(() => {
    api.getDoctors().then(setDoctors).catch(console.error);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), searchTerm.trim() ? 220 : 0);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Sync default doctor filter when switching between Central Shared Records and My Patient Records
  useEffect(() => {
    if (mode === 'own' && user?.id) {
      setSelectedDoctorId(String(user.id));
    } else if (mode === 'central') {
      setSelectedDoctorId('All');
    }
  }, [mode, user?.id]);

  useEffect(() => {
    fetchPatients();
  }, [debouncedSearch, genderFilter, dueStatusFilter, selectedDoctorId, fromDate, toDate, refreshKey]);

  const fetchPatients = async () => {
    const reqId = ++requestCounterRef.current;
    setLoading(true);
    try {
      const data = await api.getPatients({
        search: debouncedSearch.trim() || undefined,
        gender: genderFilter !== 'All' ? genderFilter : undefined,
        dueStatus: dueStatusFilter !== 'all' ? dueStatusFilter : undefined,
        hasDue: dueStatusFilter === 'due',
        doctorId: selectedDoctorId !== 'All' ? selectedDoctorId : undefined,
        fromDate: fromDate.trim() || undefined,
        toDate: toDate.trim() || undefined,
      });
      if (reqId === requestCounterRef.current) {
        setPatients(data);
      }
    } catch (e) {
      console.error('Failed to load patients:', e);
    } finally {
      if (reqId === requestCounterRef.current) {
        setLoading(false);
      }
    }
  };

  const defaultDoctorFilter = mode === 'own' && user?.id ? String(user.id) : 'All';

  const handleResetFilters = () => {
    setSearchTerm('');
    setGenderFilter('All');
    setDueStatusFilter('all');
    setSelectedDoctorId(defaultDoctorFilter);
    setFromDate('');
    setToDate('');
    setSortBy('newest');
  };

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    genderFilter !== 'All' ||
    dueStatusFilter !== 'all' ||
    selectedDoctorId !== defaultDoctorFilter ||
    Boolean(fromDate) ||
    Boolean(toDate);

  // Sorting
  const sortedPatients = [...patients].sort((a, b) => {
    switch (sortBy) {
      case 'oldest':
        return a.id - b.id;
      case 'highest_due':
        return (b.totalDue || 0) - (a.totalDue || 0);
      case 'most_visits':
        return (b.visitCount || 0) - (a.visitCount || 0);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'newest':
      default:
        return b.id - a.id;
    }
  });

  // Summary metrics for current view
  const totalMatchingPatients = sortedPatients.length;
  const totalVisitsInView = sortedPatients.reduce(
    (sum, p) => sum + (mode === 'own' ? p.myVisitCount || p.visitCount || 0 : p.visitCount || 0),
    0
  );
  const multiDoctorPatientsCount = sortedPatients.filter((p) => (p.uniqueDoctorsCount || 0) > 1).length;
  const totalDuesInView = sortedPatients.reduce((sum, p) => sum + (p.totalDue || 0), 0);

  const selectedDoctorObj = doctors.find((d) => String(d.id) === selectedDoctorId);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {mode === 'own' ? (
              <>
                <UserCheck className="w-5 h-5 text-teal-600" />
                <h1 className="text-xl font-bold text-slate-900">My Patient Records</h1>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Own Doctor Roster • {selectedDoctorObj?.fullName || user?.fullName}
                </span>
              </>
            ) : (
              <>
                <Users className="w-5 h-5 text-teal-600" />
                <h1 className="text-xl font-bold text-slate-900">Central Shared Patient Records</h1>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-200">
                  Shared Clinic Repository
                </span>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {mode === 'own'
              ? 'Patients personally attended or registered by you (or the selected doctor), while retaining full access to their shared multi-doctor clinic history.'
              : 'Every doctor can search and view all registered patients across the entire clinic. Each patient has one permanent Patient ID.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              if (fromDate.trim()) params.set('fromDate', fromDate.trim());
              if (toDate.trim()) params.set('toDate', toDate.trim());
              const qs = params.toString() ? `?${params.toString()}` : '';
              api.downloadCsv(`/api/export/patients.csv${qs}`, 'dental_patients.csv');
            }}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={onOpenNewPatientModal}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Register New Patient</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block mb-0.5">
            {mode === 'own' ? 'My Attended Patients' : 'Total Shared Patients'}
          </span>
          <span className="text-xl font-extrabold text-slate-900">{totalMatchingPatients}</span>
          <span className="text-[11px] text-teal-700 font-medium block mt-0.5">
            {mode === 'own' ? 'Personal patient roster' : 'Clinic-wide central database'}
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block mb-0.5">
            {mode === 'own' ? 'Visits Conducted by Doctor' : 'Total Clinic Visits'}
          </span>
          <span className="text-xl font-extrabold text-teal-700">{totalVisitsInView}</span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            Chronological visit logs
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block mb-0.5">Multi-Doctor Shared Care</span>
          <span className="text-xl font-extrabold text-indigo-700">{multiDoctorPatientsCount}</span>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            Visited 2+ different doctors
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block mb-0.5">Outstanding Patient Dues</span>
          <span className="text-xl font-extrabold text-amber-800">
            ৳{totalDuesInView.toLocaleString()}
          </span>
          <span className="text-[11px] text-amber-700 font-medium block mt-0.5">
            {sortedPatients.filter((p) => (p.totalDue || 0) > 0).length} patient(s) with balance
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        {/* Top Search Line */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Patient Name, Permanent ID (e.g. DP-1001), or Phone (e.g. 017...)..."
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
              Showing <strong className="text-slate-800">{sortedPatients.length}</strong> record{sortedPatients.length === 1 ? '' : 's'}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-700 bg-slate-100 hover:bg-rose-50 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                title="Clear all filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Detailed Filter Options */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
          {/* Attending Doctor Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {mode === 'own' ? 'Doctor Roster (Own)' : 'Attending Doctor'}
            </label>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500 font-medium"
            >
              <option value="All">All Clinic Doctors (Shared)</option>
              {doctors.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.fullName} {d.id === user?.id ? '(Me)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range: From */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Registered From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Date Range: To */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Registered To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Dues Status Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Dues &amp; Payment Status
            </label>
            <select
              value={dueStatusFilter}
              onChange={(e) => setDueStatusFilter(e.target.value as any)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Patients</option>
              <option value="due">With Outstanding Due Only</option>
              <option value="paid">Fully Paid / Cleared Only</option>
            </select>
          </div>

          {/* Gender Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Gender
            </label>
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
            >
              <option value="All">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Sorting */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Sort Records By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-teal-500 font-medium"
            >
              <option value="newest">Newest Registered</option>
              <option value="oldest">Oldest Registered</option>
              <option value="highest_due">Highest Due First</option>
              <option value="most_visits">Most Visits First</option>
              <option value="name">Patient Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Patients Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Patient ID</th>
                <th className="py-3 px-4">Patient Name &amp; Contact</th>
                <th className="py-3 px-4">Age / Gender</th>
                <th className="py-3 px-4 text-center">
                  {mode === 'own' ? 'My / Total Visits' : 'Visits History'}
                </th>
                <th className="py-3 px-4">Doctors Seen</th>
                <th className="py-3 px-4">Registration / Last Visit</th>
                <th className="py-3 px-4 text-right">Total Patient Cost</th>
                <th className="py-3 px-4 text-right">Payment Received</th>
                <th className="py-3 px-4 text-right">Due</th>
                <th className="py-3 px-4 text-center w-64 min-w-[240px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    Loading patient records...
                  </td>
                </tr>
              ) : sortedPatients.length > 0 ? (
                sortedPatients.map((p) => {
                  const due = p.totalDue || 0;
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => onSelectPatient(p.id)}
                      title="Click anywhere to view complete patient profile"
                    >
                      <td className="py-3.5 px-4 font-bold text-teal-700 whitespace-nowrap">
                        {p.patientId}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 text-sm">{p.name}</div>
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px] mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{p.phone}</span>
                          {p.altPhone && <span>/ {p.altPhone}</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                        {p.age ? `${p.age} yrs` : 'N/A'}, {p.gender}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-800 whitespace-nowrap">
                        {mode === 'own' ? (
                          <div className="inline-flex items-center gap-1">
                            <span
                              className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200"
                              title="Visits conducted by selected doctor"
                            >
                              {p.myVisitCount || 0} Mine
                            </span>
                            <span className="text-slate-400">/</span>
                            <span
                              className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700"
                              title="Total clinic visits across all doctors"
                            >
                              {p.visitCount || 0} Total
                            </span>
                          </div>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                            {p.visitCount || 0} visit{(p.visitCount || 0) === 1 ? '' : 's'}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-semibold text-[11px]">
                            <Stethoscope className="w-3 h-3 text-teal-600" />
                            <span>{p.uniqueDoctorsCount || 0} Doctor{(p.uniqueDoctorsCount || 0) === 1 ? '' : 's'}</span>
                          </span>
                          {p.attendedDoctorNames && p.attendedDoctorNames.length > 0 && (
                            <span className="text-[10px] text-slate-500 truncate max-w-[140px]" title={p.attendedDoctorNames.join(', ')}>
                              {p.attendedDoctorNames.join(', ')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        <div>{p.lastVisitDate ? `Last: ${formatDateDDMMYYYY(p.lastVisitDate)}` : 'No visit yet'}</div>
                        <div className="text-[10px] text-slate-400">Reg: {formatDateDDMMYYYY(p.registrationDate)}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                        <div>৳{(p.totalExpenses || 0).toLocaleString()}</div>
                        <div className="text-[10px] font-medium text-slate-500">
                          Tx: ৳{(p.totalTreatmentExpenses || 0).toLocaleString()}
                          {(p.totalTestExpenses || 0) > 0
                            ? ` • Tests: ৳${(p.totalTestExpenses || 0).toLocaleString()}`
                            : ''}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-emerald-700 whitespace-nowrap">
                        ৳{(p.totalPaid || 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold whitespace-nowrap">
                        {due > 0 ? (
                          <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-extrabold">
                            ৳{due.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">৳0 (Clear)</span>
                        )}
                      </td>
                      {/* Actions Column: Perfectly Aligned Fixed 3-Slot Grid */}
                      <td
                        className="py-3.5 px-4 text-center w-64 min-w-[240px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          {/* Slot 1: Pay Due Button or Paid Badge (w-20 fixed width) */}
                          {due > 0 && onOpenPaymentForPatient ? (
                            <button
                              type="button"
                              onClick={() => onOpenPaymentForPatient(p)}
                              className="h-7 w-20 px-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded shadow-2xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                              title={`Collect Due: ৳${due.toLocaleString()}`}
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Pay Due</span>
                            </button>
                          ) : (
                            <span
                              className="h-7 w-20 px-2 text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded border border-emerald-200 flex items-center justify-center gap-1 select-none"
                              title="No outstanding dues"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Paid</span>
                            </span>
                          )}

                          {/* Slot 2: View Profile (w-18 fixed width) */}
                          <button
                            type="button"
                            onClick={() => onSelectPatient(p.id)}
                            className="h-7 w-18 px-2 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            title="View Complete Centralized Patient Profile"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>

                          {/* Slot 3: Add Visit (w-18 fixed width) */}
                          <button
                            type="button"
                            onClick={() => onOpenNewVisitForPatient(p)}
                            className="h-7 w-18 px-2 text-xs font-semibold text-slate-700 hover:text-teal-700 bg-white hover:bg-slate-50 rounded border border-slate-300 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            title="Add New Visit under this Patient ID"
                          >
                            <CalendarCheck className="w-3.5 h-3.5 text-teal-600" />
                            <span>+ Visit</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No matching patient records found.</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {mode === 'own'
                        ? 'No patients match the selected doctor or filter criteria. Try switching to All Clinic Doctors or resetting filters.'
                        : 'Check your search query or reset filters to see all patients.'}
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
