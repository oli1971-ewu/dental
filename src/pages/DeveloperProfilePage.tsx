import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { DeveloperFeatureToggleCard } from '../components/DeveloperFeatureToggleCard.tsx';
import { MedicineDatabaseManager } from '../components/MedicineDatabaseManager.tsx';
import { formatDateDDMMYYYY } from '../utils/dateFormat.ts';
import {
  Code,
  Database,
  Download,
  ShieldAlert,
  CheckCircle2,
  UserCheck,
  Mail,
  Phone,
  Award,
  FileText,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  Shield,
  Stethoscope,
  Lock,
  AlertCircle,
} from 'lucide-react';

interface CredentialRow {
  id: number;
  username: string;
  fullName: string;
  role: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  isActive: boolean;
  hasPasswordHash: boolean;
  currentPassword: string;
  passwordUpdatedAt: string | null;
}

export const DeveloperProfilePage: React.FC = () => {
  const { user, prescriptionManagementEnabled } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [credLoading, setCredLoading] = useState(false);
  const [revealAll, setRevealAll] = useState(true);
  const [visibleMap, setVisibleMap] = useState<Record<number, boolean>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Edit password modal state
  const [editingAccount, setEditingAccount] = useState<CredentialRow | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [vaultBanner, setVaultBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadCredentials = async () => {
    setCredLoading(true);
    try {
      const list = await api.getDeveloperCredentials();
      setCredentials(list);
    } catch (e) {
      console.error('Failed to load credentials:', e);
    } finally {
      setCredLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'developer') {
      api.getDashboardStats().then(setStats).catch(console.error);
      loadCredentials();
    }
  }, [user, prescriptionManagementEnabled]);

  if (!user || user.role !== 'developer') {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center max-w-xl mx-auto space-y-3">
        <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Developer Access Required</h2>
        <p className="text-xs text-slate-600">
          Only the system developer role can access Developer Profile &amp; Feature Management controls. Super Admin and Doctor accounts cannot modify global system feature toggles.
        </p>
      </div>
    );
  }

  const devCredential = credentials.find((c) => c.role === 'developer');

  const handleCopyPassword = (row: CredentialRow) => {
    navigator.clipboard?.writeText(row.currentPassword);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleSaveUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount || !newPasswordInput.trim()) return;
    setSavingPassword(true);
    setVaultBanner(null);
    try {
      const res = await api.updateDeveloperCredential(editingAccount.id, {
        newPassword: newPasswordInput.trim(),
      });
      setVaultBanner({ type: 'success', text: res.message });
      setEditingAccount(null);
      setNewPasswordInput('');
      await loadCredentials();
    } catch (err: any) {
      setVaultBanner({ type: 'error', text: err.message || 'Failed to update password.' });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-purple-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-purple-700/60 border border-purple-500/50 flex items-center justify-center shrink-0">
              <Code className="w-7 h-7 text-purple-200" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-purple-500/25 text-purple-200 border border-purple-400/40">
                  Developer Profile &amp; System Control
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Hidden from Client Demo &amp; Super Admin
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                {user.fullName}
              </h1>
              <p className="text-xs sm:text-sm text-purple-200 mt-0.5">
                {user.specialization || 'Lead Full Stack & Database Architect'} &bull; @{user.username}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => api.downloadRecoverySnapshot()}
            className="px-4 py-2 text-xs font-semibold bg-purple-700 hover:bg-purple-600 text-white rounded-xl flex items-center gap-2 transition-colors shadow-xs cursor-pointer self-start md:self-auto"
          >
            <Download className="w-4 h-4" />
            <span>Download Full DB Snapshot (JSON)</span>
          </button>
        </div>

        {/* Developer Metadata & Recovery Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-5 pt-4 border-t border-white/10 text-xs">
          <div className="flex items-center gap-2 text-purple-100">
            <UserCheck className="w-4 h-4 text-purple-300 shrink-0" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-purple-300 block">Developer ID</span>
              <strong className="font-mono">{user.username}</strong>
            </div>
          </div>
          <div className="flex items-center gap-2 text-purple-100">
            <KeyRound className="w-4 h-4 text-emerald-300 shrink-0" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-purple-300 block">Your Active Password</span>
              <strong className="font-mono text-emerald-300">
                {devCredential?.currentPassword || 'DevDental@2026'}
              </strong>
            </div>
          </div>
          <div className="flex items-center gap-2 text-purple-100">
            <Lock className="w-4 h-4 text-amber-300 shrink-0" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-purple-300 block">Emergency Recovery Key</span>
              <strong className="font-mono text-amber-300">AYMON-DEV-2026</strong>
            </div>
          </div>
          <div className="flex items-center gap-2 text-purple-100">
            <Mail className="w-4 h-4 text-purple-300 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-purple-300 block">Google / Recovery Email</span>
              <strong className="truncate block">aminulislamaymon@gmail.com</strong>
            </div>
          </div>
          <div className="flex items-center gap-2 text-purple-100">
            <Phone className="w-4 h-4 text-purple-300 shrink-0" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-purple-300 block">Phone</span>
              <strong>{user.phone || '+880 1819-987654'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* All User Accounts & Password Vault (Developer Exclusive) */}
      <div className="bg-white rounded-2xl border border-purple-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-r from-purple-50 via-white to-slate-50 border-b border-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold text-slate-900">
                  All User Accounts &amp; Live Password Vault
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200">
                  Developer Exclusive
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                View and manage active usernames and plaintext passwords for every account (Developer, Super Admin, and Doctors). Automatically stays synced whenever any user changes or resets their password.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setRevealAll(!revealAll)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {revealAll ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{revealAll ? 'Mask Passwords' : 'Reveal All Passwords'}</span>
            </button>
            <button
              type="button"
              onClick={loadCredentials}
              disabled={credLoading}
              className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${credLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {vaultBanner && (
          <div
            className={`mx-5 mt-4 p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
              vaultBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {vaultBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{vaultBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setVaultBanner(null)}
              className="text-[11px] underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3 px-4">User / Doctor</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Login Username</th>
                <th className="py-3 px-4">Active Password</th>
                <th className="py-3 px-4">Email &amp; Phone</th>
                <th className="py-3 px-4">Last Synced</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {credentials.map((row) => {
                const isShown = revealAll || visibleMap[row.id];
                return (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{row.fullName}</div>
                      <div className="text-[11px] text-slate-500">
                        {row.specialization || 'Clinic Staff'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {row.role === 'developer' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                          <Code className="w-3 h-3" /> Developer (Hidden)
                        </span>
                      ) : row.role === 'main_doctor' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <Shield className="w-3 h-3" /> Super Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                          <Stethoscope className="w-3 h-3" /> Doctor
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <code className="px-2 py-1 rounded bg-slate-100 border border-slate-200 font-mono font-bold text-slate-900">
                        {row.username}
                      </code>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <code className="px-2.5 py-1 rounded bg-amber-50 border border-amber-200 font-mono font-bold text-slate-900 min-w-[120px]">
                          {isShown ? row.currentPassword : '••••••••••••'}
                        </code>
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleMap((prev) => ({ ...prev, [row.id]: !isShown }))
                          }
                          className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                          title={isShown ? 'Hide Password' : 'Show Password'}
                        >
                          {isShown ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyPassword(row)}
                          className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                          title="Copy Password"
                        >
                          {copiedId === row.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{row.email || '—'}</div>
                      <div className="text-[11px] text-slate-400">{row.phone || ''}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {row.passwordUpdatedAt
                        ? formatDateDDMMYYYY(row.passwordUpdatedAt)
                        : 'Default'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAccount(row);
                          setNewPasswordInput(row.currentPassword);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-semibold cursor-pointer"
                      >
                        Change Password
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feature Management Section (Global Developer-Controlled Toggle) */}
      <DeveloperFeatureToggleCard variant="light" />

      {/* PostgreSQL System Overview */}
      {stats?.developerStats && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-600" />
              <h2 className="text-sm font-bold text-slate-900">
                PostgreSQL Cloud SQL Live Record Counts
              </h2>
            </div>
            <span className="text-[11px] font-medium text-slate-500">
              Preserved across all feature toggle transitions
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Users / Doctors</span>
              <span className="text-xl font-extrabold text-slate-900 font-mono">
                {stats.developerStats.totalUsers}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Treatments</span>
              <span className="text-xl font-extrabold text-slate-900 font-mono">
                {stats.developerStats.totalTreatments}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Diagnostic Tests</span>
              <span className="text-xl font-extrabold text-slate-900 font-mono">
                {stats.developerStats.totalDiagnosticTests}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Payments</span>
              <span className="text-xl font-extrabold text-slate-900 font-mono">
                {stats.developerStats.totalPayments}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200">
              <span className="text-teal-700 font-semibold flex items-center gap-1">
                <FileText className="w-3 h-3" /> Prescriptions
              </span>
              <span className="text-xl font-extrabold text-teal-900 font-mono">
                {stats.developerStats.totalPrescriptions ?? 0}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block">Audit Logs</span>
              <span className="text-xl font-extrabold text-slate-900 font-mono">
                {stats.developerStats.totalAuditLogs}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Medicine Database, CSV Import & Catalog Update Management */}
      <MedicineDatabaseManager />

      {/* Change Password Modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-purple-600" />
              <h3 className="font-bold text-slate-900 text-sm">
                Set Password: {editingAccount.fullName}
              </h3>
            </div>
            <p className="text-slate-500">
              Username: <code className="font-mono font-bold text-slate-800">@{editingAccount.username}</code>
            </p>
            <form onSubmit={handleSaveUserPassword} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  New Password (min 6 characters)
                </label>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingPassword ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
