import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { DashboardStats } from '../types/index.ts';
import {
  Users,
  CalendarCheck,
  CreditCard,
  AlertCircle,
  Stethoscope,
  TrendingUp,
  Clock,
  Shield,
  Code,
  ArrowRight,
  Plus,
  FileSpreadsheet,
  Download,
  Activity,
  CheckCircle2,
  Search,
  Eye,
  Phone,
  X,
  FileText,
  Wallet,
} from 'lucide-react';
import { Patient } from '../types/index.ts';
import { DeveloperFeatureToggleCard } from '../components/DeveloperFeatureToggleCard.tsx';
import { formatDateDDMMYYYY } from '../utils/dateFormat.ts';

interface DashboardPageProps {
  refreshKey?: number;
  onNavigate: (tab: string, context?: any) => void;
  onOpenNewPatient: () => void;
  onOpenNewVisit: (patient?: any) => void;
  onSelectPatient: (patientId: number) => void;
  onOpenPaymentForPatient?: (patient: any) => void;
  onOpenRecordPayment?: (visit: any, initialMode?: 'payment' | 'discount') => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  refreshKey,
  onNavigate,
  onOpenNewPatient,
  onOpenNewVisit,
  onSelectPatient,
  onOpenPaymentForPatient,
  onOpenRecordPayment,
}) => {
  const { user, prescriptionManagementEnabled } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Landing page quick search state
  const [landingSearch, setLandingSearch] = useState('');
  const [landingResults, setLandingResults] = useState<Patient[]>([]);
  const [isSearchingLanding, setIsSearchingLanding] = useState(false);

  useEffect(() => {
    loadStats();
  }, [user, prescriptionManagementEnabled, refreshKey]);

  // Debounced landing page patient search
  useEffect(() => {
    if (!landingSearch.trim()) {
      setLandingResults([]);
      setIsSearchingLanding(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingLanding(true);
      try {
        const results = await api.getPatients({ search: landingSearch.trim() });
        setLandingResults(results.slice(0, 5));
      } catch (e) {
        console.error('Landing page search failed:', e);
      } finally {
        setIsSearchingLanding(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [landingSearch]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (e) {
      console.error('Failed to load stats:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const isMainDoctor = user.role === 'main_doctor';
  const isDeveloper = user.role === 'developer';
  const isDoctor = user.role === 'doctor';

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-teal-800 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-teal-500/20 text-teal-200 border border-teal-400/30">
                {isMainDoctor
                  ? 'Clinic Owner & Super Admin'
                  : isDeveloper
                  ? 'Full Technical Access (Lead Developer: Aymon)'
                  : 'Individual Doctor Portal'}
              </span>
              <span className="text-xs text-teal-200 font-semibold">Dental Care</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Welcome back, {user.fullName}
            </h1>
            <p className="text-xs sm:text-sm text-teal-100/90 mt-1 max-w-xl">
              {isDoctor
                ? 'Centralized clinic database is active. Search and review all patient histories, record visits, and send follow-up SMS reminders.'
                : 'Centralized patient tracking, multi-doctor visits, diagnostic expenses, financial collections, and day-before follow-up SMS reminders.'}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenNewPatient}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white text-teal-900 hover:bg-teal-50 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-teal-700" />
              <span>Register Patient</span>
            </button>
            <button
              type="button"
              onClick={onOpenNewVisit}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarCheck className="w-4 h-4" />
              <span>Add Clinic Visit</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('followups')}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800/80 hover:bg-slate-800 text-teal-200 border border-teal-400/30 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Clock className="w-4 h-4 text-teal-300" />
              <span>Follow-Up SMS Hub</span>
            </button>
            {prescriptionManagementEnabled && (
              <button
                type="button"
                onClick={() => onNavigate('prescriptions')}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Prescriptions (Rx)</span>
              </button>
            )}
            {(isMainDoctor || isDeveloper) && (
              <button
                type="button"
                onClick={() => onNavigate('salary-sheet')}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Wallet className="w-4 h-4" />
                <span>Doctor Salary Sheet</span>
              </button>
            )}
          </div>
        </div>

        {/* Decorative background element */}
        <Activity className="absolute -right-6 -bottom-8 w-44 h-44 text-white/5 pointer-events-none" />
      </div>

      {/* Shared Database Status Banner */}
      <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-teal-950">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-teal-900">Shared Patient Database Active:</span>{' '}
            <span>
              All doctors (Dr. Rahim, Dr. Fatima, Dr. Tariq) share one centralized patient record. Patient timelines are chronological across all attendances.
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('patients')}
          className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <span>Search Shared Database</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Landing Page Central Patient Search & Quick Actions */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Search className="w-4 h-4 text-teal-600" />
              <span>Universal Patient Search &amp; Quick Actions</span>
            </h2>
            <p className="text-xs text-slate-500">
              Instant access from the landing page. Search any patient by ID (e.g. DP-1001), full name, or phone number to view profiles, add visits, or collect dues.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('patients')}
            className="text-xs font-semibold text-teal-600 hover:text-teal-800 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
          >
            <span>Open All Patient Records</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Type Patient ID (e.g., DP-1001), Name, or Mobile Number (e.g., 017...)..."
            value={landingSearch}
            onChange={(e) => setLandingSearch(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/50 focus:bg-white transition-all shadow-inner"
          />
          {landingSearch && (
            <button
              type="button"
              onClick={() => {
                setLandingSearch('');
                setLandingResults([]);
              }}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Results Display */}
        {isSearchingLanding && (
          <div className="py-3 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <Activity className="w-3.5 h-3.5 animate-spin text-teal-600" />
            <span>Searching centralized patient repository...</span>
          </div>
        )}

        {!isSearchingLanding && landingSearch.trim() && landingResults.length === 0 && (
          <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500 border border-slate-200">
            No patient found matching "{landingSearch}". You can register a new patient using the button above.
          </div>
        )}

        {landingResults.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {landingResults.map((p) => {
              const due = p.totalDue || 0;
              return (
                <div
                  key={p.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-teal-50/40 hover:border-teal-300 transition-all flex flex-col justify-between gap-3 shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-teal-700 text-xs px-2 py-0.5 rounded bg-teal-100/70 border border-teal-200">
                        {p.patientId}
                      </span>
                      {due > 0 ? (
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                          Due: ৳{due.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Paid / Clear
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm mt-1.5">{p.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{p.phone}</span>
                      <span>•</span>
                      <span>{p.age ? `${p.age}y` : ''} {p.gender}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-2 border-t border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => onSelectPatient(p.id)}
                      className="flex-1 py-1.5 px-2 text-xs font-semibold rounded bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Profile</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenNewVisit(p)}
                      className="py-1.5 px-2.5 text-xs font-semibold rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      title="Add New Clinic Visit"
                    >
                      <Plus className="w-3.5 h-3.5 text-teal-600" />
                      <span>+ Visit</span>
                    </button>
                    {due > 0 && onOpenPaymentForPatient && (
                      <button
                        type="button"
                        onClick={() => onOpenPaymentForPatient(p)}
                        className="py-1.5 px-2.5 text-xs font-bold rounded bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs"
                        title="Collect Due Payment"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Pay</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Doctor & Developer Metric Cards */}
      {(isMainDoctor || isDeveloper) && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Patients
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-2">
              {stats.totalPatients || 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {stats.totalDoctors || 0} registered active doctors
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Clinic Visits
              </span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <CalendarCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-2">
              {stats.totalVisits || 0}
            </div>
            <div className="text-[11px] text-teal-700 font-medium mt-1">
              Today: {stats.todayVisits || 0} visits recorded
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Collection (Paid)
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-emerald-700 mt-2">
              ৳{(stats.totalCollection || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Treatments: ৳{(stats.totalTreatmentCharges || 0).toLocaleString()} • Tests: ৳{(stats.totalTestCharges || 0).toLocaleString()}
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Outstanding Dues
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-amber-700 mt-2">
              ৳{(stats.totalOutstandingDues || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Across all clinic visits &amp; patients
            </div>
          </div>
        </div>
      )}

      {/* Doctor Metric Cards */}
      {isDoctor && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                My Visits Handled
              </span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <CalendarCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-2">
              {stats.totalVisits || 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Today: {stats.todayVisits || 0} visits
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Unique Patients Attended
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-2">
              {stats.uniquePatients || 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Across shared clinic database
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Upcoming Follow-ups
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-purple-700 mt-2">
              {stats.upcomingFollowUps || 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Scheduled clinical reviews
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Clinic Central DB
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Shield className="w-4 h-4" />
              </div>
            </div>
            <div className="text-sm font-bold text-emerald-800 mt-2">
              Unrestricted Search
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Search any patient by ID/Phone
            </div>
          </div>
        </div>
      )}

      {/* Developer System Section */}
      {isDeveloper && stats?.developerStats && (
        <div className="bg-purple-950 text-purple-100 rounded-2xl p-5 shadow-md border border-purple-900 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5 text-purple-400" />
              <h2 className="text-sm font-bold text-white tracking-wide uppercase">
                Developer System Console (PostgreSQL Cloud SQL)
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('developer-profile')}
                className="px-3 py-1 text-xs font-semibold bg-white text-purple-950 hover:bg-purple-50 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Code className="w-3.5 h-3.5" />
                <span>Open Developer Profile</span>
              </button>
              <button
                type="button"
                onClick={() => api.downloadBackup()}
                className="px-2.5 py-1 text-xs font-semibold bg-purple-800 hover:bg-purple-700 text-white rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Database JSON Backup</span>
              </button>
            </div>
          </div>

          <DeveloperFeatureToggleCard variant="dark" />

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
            <div className="bg-purple-900/60 p-3 rounded-lg border border-purple-800">
              <span className="text-purple-300 block">Users / Doctors</span>
              <span className="text-xl font-bold text-white">{stats.developerStats.totalUsers}</span>
            </div>
            <div className="bg-purple-900/60 p-3 rounded-lg border border-purple-800">
              <span className="text-purple-300 block">Treatments Records</span>
              <span className="text-xl font-bold text-white">{stats.developerStats.totalTreatments}</span>
            </div>
            <div className="bg-purple-900/60 p-3 rounded-lg border border-purple-800">
              <span className="text-purple-300 block">Diagnostic Tests</span>
              <span className="text-xl font-bold text-white">{stats.developerStats.totalDiagnosticTests}</span>
            </div>
            <div className="bg-purple-900/60 p-3 rounded-lg border border-purple-800">
              <span className="text-purple-300 block">Payments</span>
              <span className="text-xl font-bold text-white">{stats.developerStats.totalPayments}</span>
            </div>
            <div className="bg-purple-900/60 p-3 rounded-lg border border-purple-800">
              <span className="text-purple-300 block">Prescriptions</span>
              <span className="text-xl font-bold text-white">{stats.developerStats.totalPrescriptions ?? 0}</span>
            </div>
            <div className="bg-purple-900/60 p-3 rounded-lg border border-purple-800">
              <span className="text-purple-300 block">Audit Log Entries</span>
              <span className="text-xl font-bold text-white">{stats.developerStats.totalAuditLogs}</span>
            </div>
          </div>
        </div>
      )}

      {/* Recent Visits Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {isDoctor ? 'Recent Visits Handled By You' : 'Recent Clinic-Wide Patient Visits'}
            </h2>
            <p className="text-xs text-slate-500">
              Newest visits across all attending doctors
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('visits')}
            className="text-xs font-semibold text-teal-600 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
          >
            <span>View All Visits</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Visit ID</th>
                <th className="py-3 px-4">Patient</th>
                <th className="py-3 px-4">Attending Doctor</th>
                <th className="py-3 px-4">Visit Date</th>
                <th className="py-3 px-4">Clinical Diagnosis</th>
                <th className="py-3 px-4 text-right">Cost (৳)</th>
                <th className="py-3 px-4 text-right">Paid (৳)</th>
                <th className="py-3 px-4 text-right">Due (৳)</th>
                <th className="py-3 px-4 text-center min-w-[200px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats?.recentVisits && stats.recentVisits.length > 0 ? (
                stats.recentVisits.map((v) => {
                  const due = parseFloat(v.outstandingDue || '0');
                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-teal-50/50 transition-colors cursor-pointer"
                      onClick={() => onSelectPatient(v.patientId)}
                      title="Click anywhere to view patient profile"
                    >
                      <td className="py-3 px-4 font-bold text-teal-700">
                        {v.visitId}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{v.patientName}</div>
                        <div className="text-[11px] text-slate-500">{v.patientCode}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-medium border border-slate-200">
                          <Stethoscope className="w-3 h-3 text-teal-600" />
                          {v.doctorName}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{formatDateDDMMYYYY(v.visitDate)}</td>
                      <td className="py-3 px-4 max-w-xs truncate text-slate-700">
                        {v.diagnosis || 'General Dental Checkup'}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        ৳{parseFloat(v.totalCost || '0').toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                        ৳{parseFloat(v.amountPaid || '0').toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-bold">
                        {due > 0 ? (
                          <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-bold">
                            ৳{due.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">৳0 (Paid)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                          {due > 0 && (onOpenRecordPayment || onOpenPaymentForPatient) && (
                            <button
                              type="button"
                              onClick={() => {
                                if (onOpenRecordPayment) {
                                  onOpenRecordPayment(v);
                                } else if (onOpenPaymentForPatient) {
                                  onOpenPaymentForPatient({
                                    id: v.patientId,
                                    name: v.patientName,
                                    patientId: v.patientCode,
                                  });
                                }
                              }}
                              className="px-2 py-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors shadow-2xs cursor-pointer flex items-center gap-0.5"
                              title={`Collect Due ৳${due.toLocaleString()} for ${v.visitId}`}
                            >
                              <CreditCard className="w-3 h-3" />
                              <span>Pay</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectPatient(v.patientId)}
                            className="px-2.5 py-1 text-xs font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 transition-colors cursor-pointer flex items-center gap-1"
                            title="View Complete Centralized Patient Profile"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Profile</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenNewVisit({
                                id: v.patientId,
                                name: v.patientName,
                                patientId: v.patientCode,
                              })
                            }
                            className="px-2 py-1 text-xs font-semibold text-slate-700 hover:text-teal-700 bg-white hover:bg-slate-50 rounded border border-slate-300 transition-colors cursor-pointer flex items-center gap-0.5"
                            title="Add New Visit for this Patient"
                          >
                            <Plus className="w-3 h-3 text-teal-600" />
                            <span>+ Visit</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-400 italic">
                    No recent visits found.
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
