import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { ApplicationFeatureFlag } from '../types/index.ts';
import { formatDateDDMMYYYY } from '../utils/dateFormat.ts';
import {
  Sliders,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Crown,
  Plus,
  Package,
  Building2,
  History,
  Save,
  Layers,
  Users,
} from 'lucide-react';

export interface DeveloperFeatureToggleCardProps {
  variant?: string;
}

export const DeveloperFeatureToggleCard: React.FC<DeveloperFeatureToggleCardProps> = () => {
  const { user, refreshFeatures, setPrescriptionFeatureEnabled } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'features' | 'packages' | 'subscription' | 'audit'>('features');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [features, setFeatures] = useState<ApplicationFeatureFlag[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [usageMetrics, setUsageMetrics] = useState<any>({
    doctorsCount: 0,
    totalUsersCount: 0,
    patientsCount: 0,
    branchesCount: 1,
  });
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // New Custom Feature Modal state
  const [newFeatureOpen, setNewFeatureOpen] = useState(false);
  const [newFeatureForm, setNewFeatureForm] = useState({
    featureKey: '',
    featureName: '',
    description: '',
    moduleCategory: 'Clinical',
    isEnabled: true,
    applicableRoles: ['developer', 'main_doctor', 'doctor'] as string[],
  });

  // Package Editor state
  const [selectedPkg, setSelectedPkg] = useState<any | null>(null);
  const [savingPkg, setSavingPkg] = useState(false);

  // Subscription Assignment form state
  const [subForm, setSubForm] = useState({
    clinicName: 'Dental Care',
    branchCode: 'MAIN_BRANCH',
    packageId: 0,
    packageKey: 'enterprise',
    status: 'Active',
    startDate: new Date().toISOString().split('T')[0],
    expiryDate: '2030-12-31',
    notes: '',
  });
  const [savingSub, setSavingSub] = useState(false);

  const loadControlCenter = async () => {
    setLoading(true);
    try {
      const data = await api.getDeveloperControlCenter();
      setFeatures(data.features || []);
      setPackages(data.packages || []);
      setSubscription(data.subscription || null);
      if (data.usageMetrics) setUsageMetrics(data.usageMetrics);
      setAuditLogs(data.auditLogs || []);

      if (data.packages && data.packages.length > 0 && !selectedPkg) {
        const activeP =
          data.packages.find((p: any) => p.packageKey === data.subscription?.packageKey) ||
          data.packages[0];
        setSelectedPkg(JSON.parse(JSON.stringify(activeP)));
      }

      if (data.subscription) {
        setSubForm({
          clinicName: data.subscription.clinicName || 'Dental Care',
          branchCode: data.subscription.branchCode || 'MAIN_BRANCH',
          packageId: data.subscription.packageId || 0,
          packageKey: data.subscription.packageKey || 'enterprise',
          status: data.subscription.status || 'Active',
          startDate: data.subscription.startDate || new Date().toISOString().split('T')[0],
          expiryDate: data.subscription.expiryDate || '2030-12-31',
          notes: data.subscription.notes || '',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load Developer Control Center' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'developer') {
      loadControlCenter();
    }
  }, [user?.role]);

  if (!user || user.role !== 'developer') {
    return null;
  }

  const handleToggleGlobalFeature = async (flag: ApplicationFeatureFlag) => {
    const nextState = !flag.isEnabled;
    setSavingKey(flag.featureKey);
    setFeedback(null);
    try {
      const res = await api.toggleFeature(flag.featureKey, nextState, {
        featureName: flag.featureName,
        description: flag.description || undefined,
        moduleCategory: flag.moduleCategory,
        applicableRoles: flag.applicableRoles,
      });
      if (flag.featureKey === 'prescription_management') {
        setPrescriptionFeatureEnabled(Boolean(res.prescriptionManagement));
      }
      await refreshFeatures();
      await loadControlCenter();
      setFeedback({
        type: 'success',
        message: `${flag.featureName} is now ${nextState ? 'ENABLED (ON)' : 'DISABLED (OFF)'} globally. Zero clinical or historical records were modified.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to toggle feature flag' });
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleRoleForFeature = async (flag: ApplicationFeatureFlag, role: string) => {
    const currentRoles = Array.isArray(flag.applicableRoles)
      ? flag.applicableRoles
      : ['developer', 'main_doctor', 'doctor'];
    const exists = currentRoles.includes(role);
    const updatedRoles = exists
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];

    // Developer always retains role visibility
    if (!updatedRoles.includes('developer')) updatedRoles.push('developer');

    setSavingKey(`${flag.featureKey}-${role}`);
    setFeedback(null);
    try {
      await api.toggleFeature(flag.featureKey, flag.isEnabled, {
        featureName: flag.featureName,
        description: flag.description || undefined,
        moduleCategory: flag.moduleCategory,
        applicableRoles: updatedRoles,
      });
      await refreshFeatures();
      await loadControlCenter();
      setFeedback({
        type: 'success',
        message: `Updated role permissions for ${flag.featureName}.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update role permissions' });
    } finally {
      setSavingKey(null);
    }
  };

  const handleRegisterCustomFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeatureForm.featureKey.trim() || !newFeatureForm.featureName.trim()) {
      setFeedback({ type: 'error', message: 'Feature Key and Feature Name are required.' });
      return;
    }
    const cleanKey = newFeatureForm.featureKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setSavingKey('register-new');
    setFeedback(null);
    try {
      await api.toggleFeature(cleanKey, newFeatureForm.isEnabled, {
        featureName: newFeatureForm.featureName.trim(),
        description: newFeatureForm.description.trim(),
        moduleCategory: newFeatureForm.moduleCategory,
        applicableRoles: newFeatureForm.applicableRoles,
      });
      setNewFeatureOpen(false);
      setNewFeatureForm({
        featureKey: '',
        featureName: '',
        description: '',
        moduleCategory: 'Clinical',
        isEnabled: true,
        applicableRoles: ['developer', 'main_doctor', 'doctor'],
      });
      await refreshFeatures();
      await loadControlCenter();
      setFeedback({
        type: 'success',
        message: `Registered new global feature "${newFeatureForm.featureName}" (${cleanKey}).`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to register new feature' });
    } finally {
      setSavingKey(null);
    }
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPkg || !selectedPkg.packageName?.trim()) return;
    setSavingPkg(true);
    setFeedback(null);
    try {
      await api.saveSubscriptionPackage(selectedPkg);
      await refreshFeatures();
      await loadControlCenter();
      setFeedback({
        type: 'success',
        message: `Saved subscription package "${selectedPkg.packageName}" entitlements & limits.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save package' });
    } finally {
      setSavingPkg(false);
    }
  };

  const handleSaveClinicSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSub(true);
    setFeedback(null);
    try {
      await api.updateClinicSubscription(subForm);
      await refreshFeatures();
      await loadControlCenter();
      setFeedback({
        type: 'success',
        message: `Updated clinic subscription to "${subForm.packageKey.toUpperCase()}" (${subForm.status}). All patient & clinical records remain 100% intact.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update clinic subscription' });
    } finally {
      setSavingSub(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-indigo-200 shadow-xs overflow-hidden">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                Developer-Only Architecture
              </span>
              {subscription && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  <Crown className="w-3 h-3" />
                  Active Plan: {subscription.packageName} ({subscription.status})
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-white mt-1">
              Centralized Global Feature Control &amp; Subscription Package Engine
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              3-Layer Permission Architecture: Layer 1 (Global Toggle) · Layer 2 (Subscription Package Entitlement) · Layer 3 (Role Permission)
            </p>
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-800/90 p-1.5 rounded-xl border border-slate-700">
          <button
            type="button"
            onClick={() => setActiveSubTab('features')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'features'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>1. Global Features ({features.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('packages')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'packages'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>2. Subscription Packages ({packages.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('subscription')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'subscription'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>3. Clinic Subscription</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('audit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'audit'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Trail</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`px-6 py-3 border-b flex items-center justify-between gap-3 text-xs font-semibold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] underline opacity-75 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-10 flex items-center justify-center gap-2.5 text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
          <span>Loading Centralized Feature &amp; Subscription Control Center...</span>
        </div>
      ) : (
        <div className="p-6">
          {/* TAB 1: GLOBAL FEATURE FLAGS & ROLE PERMISSIONS */}
          {activeSubTab === 'features' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Layer 1 &amp; Layer 3: Global Module Toggles &amp; Role Access Matrix
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Turning a feature OFF hides it from menus and blocks API mutations immediately without deleting any database records.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewFeatureOpen(!newFeatureOpen)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 self-start cursor-pointer shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register New Feature Flag</span>
                </button>
              </div>

              {newFeatureOpen && (
                <form
                  onSubmit={handleRegisterCustomFeature}
                  className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-3"
                >
                  <div className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                    Register New Global Feature Flag
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Feature Key (snake_case) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. lab_order_tracking"
                        value={newFeatureForm.featureKey}
                        onChange={(e) => setNewFeatureForm({ ...newFeatureForm, featureKey: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Display Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Dental Lab Order Tracking"
                        value={newFeatureForm.featureName}
                        onChange={(e) => setNewFeatureForm({ ...newFeatureForm, featureName: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Module Category
                      </label>
                      <select
                        value={newFeatureForm.moduleCategory}
                        onChange={(e) => setNewFeatureForm({ ...newFeatureForm, moduleCategory: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="Clinical">Clinical</option>
                        <option value="Finance">Finance</option>
                        <option value="Operations">Operations</option>
                        <option value="Administration">Administration</option>
                        <option value="Analytics">Analytics</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      placeholder="Brief explanation of what this feature controls..."
                      value={newFeatureForm.description}
                      onChange={(e) => setNewFeatureForm({ ...newFeatureForm, description: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setNewFeatureOpen(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingKey === 'register-new'}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                    >
                      {savingKey === 'register-new' ? 'Registering...' : 'Save & Register Feature'}
                    </button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      <th className="py-3 px-4">Feature Module</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3">Layer 2: Active Plan</th>
                      <th className="py-3 px-3">Layer 3: Allowed Roles</th>
                      <th className="py-3 px-3">Effective Status</th>
                      <th className="py-3 px-4 text-right">Layer 1: Global Switch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {features.map((flag) => {
                      const roles = Array.isArray(flag.applicableRoles)
                        ? flag.applicableRoles
                        : ['developer', 'main_doctor', 'doctor'];
                      const isSaving = savingKey === flag.featureKey;
                      const pkgState = flag.packageEntitlement || 'ON';

                      return (
                        <tr key={flag.featureKey} className="hover:bg-slate-50/80">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{flag.featureName}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{flag.description}</div>
                            <code className="text-[10px] text-indigo-600 font-mono bg-indigo-50 px-1.5 py-0.5 rounded mt-1 inline-block">
                              {flag.featureKey}
                            </code>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                              {flag.moduleCategory || 'Clinical'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                                pkgState === 'ON'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : pkgState === 'Limited'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {pkgState}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="flex flex-wrap gap-1.5">
                              {(['main_doctor', 'doctor'] as const).map((r) => {
                                const active = roles.includes(r);
                                return (
                                  <button
                                    key={r}
                                    type="button"
                                    onClick={() => handleToggleRoleForFeature(flag, r)}
                                    className={`px-2 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                                      active
                                        ? 'bg-teal-50 text-teal-800 border-teal-300'
                                        : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                                    }`}
                                    title="Click to toggle role access"
                                  >
                                    {r === 'main_doctor' ? 'Main Doctor' : 'Doctor'}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-3.5 px-3">
                            {flag.effectiveEnabled ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Blocked
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleToggleGlobalFeature(flag)}
                              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                flag.isEnabled
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                              }`}
                            >
                              {isSaving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : flag.isEnabled ? (
                                <ToggleRight className="w-4 h-4" />
                              ) : (
                                <ToggleLeft className="w-4 h-4" />
                              )}
                              <span>{flag.isEnabled ? 'ON' : 'OFF'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: SUBSCRIPTION PACKAGES & FEATURE ENTITLEMENT MATRIX */}
          {activeSubTab === 'packages' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Layer 2: Configurable Subscription Packages &amp; Feature Entitlements
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select any package below to customize its included modules (ON / OFF / Limited), pricing, and clinic capacity limits.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedPkg({
                      id: null,
                      packageKey: '',
                      packageName: 'Custom Plan',
                      description: 'Custom tailored clinic subscription plan',
                      monthlyPriceBdt: '4000.00',
                      annualPriceBdt: '40000.00',
                      featureEntitlements: Object.fromEntries(features.map((f) => [f.featureKey, 'ON'])),
                      limits: {
                        maxDoctors: 10,
                        maxStaff: 20,
                        maxPatients: 10000,
                        maxBranches: 2,
                        storageMb: 10240,
                        monthlyBackups: 50,
                      },
                      isActive: true,
                      sortOrder: packages.length + 1,
                    })
                  }
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Custom Package</span>
                </button>
              </div>

              {/* Package Selector Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {packages.map((pkg) => {
                  const isSelected = selectedPkg?.packageKey === pkg.packageKey;
                  const isCurrentClinicPlan = subscription?.packageKey === pkg.packageKey;
                  return (
                    <div
                      key={pkg.packageKey}
                      onClick={() => setSelectedPkg(JSON.parse(JSON.stringify(pkg)))}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 hover:border-indigo-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-slate-900">{pkg.packageName}</span>
                        {isCurrentClinicPlan && (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase">
                            Active Plan
                          </span>
                        )}
                      </div>
                      <div className="text-base font-extrabold text-indigo-700 mt-1">
                        ৳{Number(pkg.monthlyPriceBdt || 0).toLocaleString()}{' '}
                        <span className="text-[11px] font-normal text-slate-500">/ month</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{pkg.description}</p>
                    </div>
                  );
                })}
              </div>

              {/* Selected Package Editor */}
              {selectedPkg && (
                <form
                  onSubmit={handleSavePackage}
                  className="p-5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <h5 className="text-sm font-bold text-slate-900">
                        Editing Package: <span className="text-indigo-700">{selectedPkg.packageName}</span>
                      </h5>
                      <p className="text-[11px] text-slate-500">
                        Changes to the active package take effect immediately across the clinic without data loss.
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={savingPkg}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 self-start cursor-pointer"
                    >
                      {savingPkg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span>Save Package Configuration</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Package Name *</label>
                      <input
                        type="text"
                        required
                        value={selectedPkg.packageName}
                        onChange={(e) => setSelectedPkg({ ...selectedPkg, packageName: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Monthly Price (BDT)</label>
                      <input
                        type="number"
                        value={selectedPkg.monthlyPriceBdt}
                        onChange={(e) => setSelectedPkg({ ...selectedPkg, monthlyPriceBdt: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Annual Price (BDT)</label>
                      <input
                        type="number"
                        value={selectedPkg.annualPriceBdt}
                        onChange={(e) => setSelectedPkg({ ...selectedPkg, annualPriceBdt: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Description</label>
                      <input
                        type="text"
                        value={selectedPkg.description || ''}
                        onChange={(e) => setSelectedPkg({ ...selectedPkg, description: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                  </div>

                  {/* Feature Entitlements Grid */}
                  <div>
                    <div className="text-xs font-bold text-slate-800 mb-2">
                      Per-Feature Package Entitlements (ON / Limited / OFF)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {features.map((f) => {
                        const currentVal = selectedPkg.featureEntitlements?.[f.featureKey] || 'ON';
                        return (
                          <div
                            key={f.featureKey}
                            className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 truncate">{f.featureName}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{f.featureKey}</div>
                            </div>
                            <select
                              value={currentVal}
                              onChange={(e) =>
                                setSelectedPkg({
                                  ...selectedPkg,
                                  featureEntitlements: {
                                    ...(selectedPkg.featureEntitlements || {}),
                                    [f.featureKey]: e.target.value,
                                  },
                                })
                              }
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                currentVal === 'ON'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : currentVal === 'Limited'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-rose-50 text-rose-800 border-rose-300'
                              }`}
                            >
                              <option value="ON">ON (Included)</option>
                              <option value="Limited">Limited</option>
                              <option value="OFF">OFF (Excluded)</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Optional Package Limits */}
                  <div>
                    <div className="text-xs font-bold text-slate-800 mb-2">
                      Optional Package Capacity Limits (Leave blank for Unlimited)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                      {[
                        { key: 'maxDoctors', label: 'Max Doctors' },
                        { key: 'maxStaff', label: 'Max Staff' },
                        { key: 'maxPatients', label: 'Max Patients' },
                        { key: 'maxBranches', label: 'Max Branches' },
                        { key: 'storageMb', label: 'Storage (MB)' },
                        { key: 'monthlyBackups', label: 'Monthly Backups' },
                      ].map((lim) => (
                        <div key={lim.key} className="bg-white p-2.5 rounded-xl border border-slate-200">
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">{lim.label}</label>
                          <input
                            type="number"
                            placeholder="Unlimited"
                            value={selectedPkg.limits?.[lim.key] ?? ''}
                            onChange={(e) =>
                              setSelectedPkg({
                                ...selectedPkg,
                                limits: {
                                  ...(selectedPkg.limits || {}),
                                  [lim.key]: e.target.value === '' ? null : Number(e.target.value),
                                },
                              })
                            }
                            className="w-full px-2 py-1 text-xs rounded border border-slate-300"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: CLINIC SUBSCRIPTION ASSIGNMENT & USAGE METRICS */}
          {activeSubTab === 'subscription' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <form
                onSubmit={handleSaveClinicSubscription}
                className="lg:col-span-2 p-5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-4"
              >
                <div className="border-b border-slate-200 pb-3">
                  <h4 className="text-sm font-bold text-slate-900">
                    Active Clinic Subscription &amp; Multi-Branch Assignment
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assign a subscription tier and lifecycle status to the clinic. Downgrading or expiring never deletes clinical data.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Clinic Name</label>
                    <input
                      type="text"
                      value={subForm.clinicName}
                      onChange={(e) => setSubForm({ ...subForm, clinicName: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Branch Code</label>
                    <input
                      type="text"
                      value={subForm.branchCode}
                      onChange={(e) => setSubForm({ ...subForm, branchCode: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Subscription Package</label>
                    <select
                      value={subForm.packageKey}
                      onChange={(e) => {
                        const found = packages.find((p) => p.packageKey === e.target.value);
                        setSubForm({
                          ...subForm,
                          packageKey: e.target.value,
                          packageId: found?.id || 0,
                        });
                      }}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-bold text-indigo-900"
                    >
                      {packages.map((p) => (
                        <option key={p.packageKey} value={p.packageKey}>
                          {p.packageName} — ৳{Number(p.monthlyPriceBdt || 0).toLocaleString()}/mo
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Subscription Status</label>
                    <select
                      value={subForm.status}
                      onChange={(e) => setSubForm({ ...subForm, status: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-bold"
                    >
                      <option value="Active">Active (Full Operational Access)</option>
                      <option value="Trial">Trial (Full Operational Access)</option>
                      <option value="Expired">Expired (Restrict Non-Developer Modules)</option>
                      <option value="Suspended">Suspended</option>
                      <option value="Canceled">Canceled</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={subForm.startDate}
                      onChange={(e) => setSubForm({ ...subForm, startDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Expiry / Renewal Date</label>
                    <input
                      type="date"
                      value={subForm.expiryDate}
                      onChange={(e) => setSubForm({ ...subForm, expiryDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Subscription Notes</label>
                  <input
                    type="text"
                    value={subForm.notes}
                    onChange={(e) => setSubForm({ ...subForm, notes: e.target.value })}
                    placeholder="Optional billing or contract notes..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingSub}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs"
                  >
                    {savingSub ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    <span>Apply Clinic Subscription Assignment</span>
                  </button>
                </div>
              </form>

              {/* Current Clinic Usage vs Plan Limits */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-sm font-bold text-slate-900">Live Clinic Usage vs Plan Limits</h4>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Active Doctors</span>
                    <span className="font-bold text-slate-900">
                      {usageMetrics.doctorsCount} / {subscription?.limits?.maxDoctors ?? 'Unlimited'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Registered Patients</span>
                    <span className="font-bold text-slate-900">
                      {usageMetrics.patientsCount} / {subscription?.limits?.maxPatients ?? 'Unlimited'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Active Branches</span>
                    <span className="font-bold text-slate-900">
                      {usageMetrics.branchesCount} / {subscription?.limits?.maxBranches ?? 'Unlimited'}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] leading-relaxed">
                    <strong>Non-Destructive Guarantee:</strong> Changing subscription packages or toggling features never deletes or alters any existing patient, visit, prescription, or payment records.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SUBSCRIPTION & FEATURE AUDIT LOGS */}
          {activeSubTab === 'audit' && (
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-900">
                Feature Flag &amp; Subscription Package Audit Trail ({auditLogs.length})
              </h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Target Key</th>
                      <th className="py-2.5 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">
                          No feature or subscription changes logged yet.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 whitespace-nowrap font-medium text-slate-600">
                            {formatDateDDMMYYYY(log.createdAt)}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">{log.targetKey}</td>
                          <td className="py-2.5 px-4 text-slate-600">{log.details}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
