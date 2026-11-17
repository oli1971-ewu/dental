import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import {
  Settings,
  Building,
  DollarSign,
  Download,
  CheckCircle2,
  AlertCircle,
  Database,
  Code,
  MessageSquare,
  Wifi,
  Smartphone,
  Zap,
  RefreshCw,
  MessageCircle,
} from 'lucide-react';
import { DeveloperFeatureToggleCard } from '../components/DeveloperFeatureToggleCard.tsx';
import { MedicineDatabaseManager } from '../components/MedicineDatabaseManager.tsx';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [treatmentPrices, setTreatmentPrices] = useState<any[]>([]);
  const [testPrices, setTestPrices] = useState<any[]>([]);

  // Clinic profile
  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [currency, setCurrency] = useState('BDT (৳)');

  // Free Zero-Cost SMS & Messaging Settings
  const [smsGatewayUrl, setSmsGatewayUrl] = useState('');
  const [smsGatewayApiKey, setSmsGatewayApiKey] = useState('');
  const [defaultMessagingChannel, setDefaultMessagingChannel] = useState('whatsapp');
  const [smsTemplate, setSmsTemplate] = useState('');

  // Gateway test state
  const [testingGateway, setTestingGateway] = useState(false);
  const [gatewayTestResult, setGatewayTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data);
      setClinicName(data.clinic_name || 'Dental Care');
      setClinicAddress(data.clinic_address || 'House 42, Road 11, Banani, Dhaka-1213, Bangladesh');
      setClinicPhone(data.clinic_phone || '+880 2-9876543, +880 1711-234567');
      setCurrency(data.clinic_currency || 'BDT (৳)');

      setSmsGatewayUrl(data.sms_gateway_url || 'http://192.168.1.100:8080/v1/sms/send');
      setSmsGatewayApiKey(data.sms_gateway_api_key || '');
      setDefaultMessagingChannel(data.default_messaging_channel || 'whatsapp');
      setSmsTemplate(
        data.sms_reminder_template ||
          'Dear {patientName} ({patientId}), friendly reminder from {clinicName}: Your dental follow-up is scheduled for {followUpDate} with {doctorName} ({reason}). Contact: {clinicPhone}.'
      );

      if (data.default_treatment_prices) {
        try {
          setTreatmentPrices(JSON.parse(data.default_treatment_prices));
        } catch {}
      }
      if (data.default_test_prices) {
        try {
          setTestPrices(JSON.parse(data.default_test_prices));
        } catch {}
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTestGateway = async () => {
    if (!smsGatewayUrl.trim()) {
      setGatewayTestResult({
        success: false,
        message: 'Please provide an Android Gateway URL before testing.',
      });
      return;
    }
    setTestingGateway(true);
    setGatewayTestResult(null);
    try {
      const res = await api.testSmsGateway(smsGatewayUrl.trim(), smsGatewayApiKey.trim() || undefined);
      setGatewayTestResult({
        success: res.success,
        message: res.message,
      });
    } catch (err: any) {
      setGatewayTestResult({
        success: false,
        message: err.message || 'Connection failed.',
      });
    } finally {
      setTestingGateway(false);
    }
  };

  const handleSaveClinicInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateSettings({
        clinic_name: clinicName,
        clinic_address: clinicAddress,
        clinic_phone: clinicPhone,
        clinic_currency: currency,
        sms_gateway_url: smsGatewayUrl,
        sms_gateway_api_key: smsGatewayApiKey,
        default_messaging_channel: defaultMessagingChannel,
        sms_reminder_template: smsTemplate,
        default_treatment_prices: treatmentPrices,
        default_test_prices: testPrices,
      });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const isDeveloper = user?.role === 'developer';
  const canManageMedicineDb = user?.role === 'developer' || user?.role === 'main_doctor';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Clinic Settings &amp; Messaging Configuration</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure clinic profile, zero-cost SMS/WhatsApp reminder channels, default treatment fees, and technical database administration.
        </p>
      </div>

      {saveError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {savedMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>All clinic settings, pricing catalogues, and messaging channels saved successfully!</span>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSaveClinicInfo} className="space-y-6">
        {/* Clinic Profile Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 font-bold text-slate-900 text-sm">
            <Building className="w-4 h-4 text-teal-600" />
            <span>Clinic Information</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Clinic Name *
              </label>
              <input
                type="text"
                required
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Contact Phone Numbers
              </label>
              <input
                type="text"
                value={clinicPhone}
                onChange={(e) => setClinicPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Standard Currency
              </label>
              <input
                type="text"
                disabled
                value={currency}
                className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-slate-600 font-bold"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Clinic Address / Location (Bangladesh)
              </label>
              <input
                type="text"
                value={clinicAddress}
                onChange={(e) => setClinicAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Free Zero-Cost Follow-Up SMS & Messaging Configuration Card */}
        <div className="bg-white p-5 rounded-xl border border-teal-200 shadow-xs space-y-4 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <MessageSquare className="w-4 h-4 text-teal-600" />
              <span>Free Zero-Cost Follow-Up Messaging Options (৳0.00 / Free)</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              3 Zero-Cost Channels Active
            </span>
          </div>

          <p className="text-slate-600 leading-relaxed">
            All 3 free reminder channels are supported across Dental Care. Configure your clinic&apos;s preferred channel and Android SIM Gateway settings below.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>Option 1: WhatsApp Direct</span>
              </div>
              <p className="text-[11px] text-emerald-800">
                Uses free WhatsApp deep-linking (`https://wa.me/...`). 100% free with individual links &amp; bulk queue assistant.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-teal-950">
                <Wifi className="w-4 h-4 text-teal-700" />
                <span>Option 2: Android SIM Gateway</span>
              </div>
              <p className="text-[11px] text-teal-800">
                Connect any Android phone on clinic Wi-Fi. Sends carrier SMS using your GP/Robi SIM pack at ৳0.00 extra cost.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-blue-950">
                <Smartphone className="w-4 h-4 text-blue-600" />
                <span>Option 3: Device SMS App</span>
              </div>
              <p className="text-[11px] text-blue-800">
                Uses default phone/tablet Messages app (`sms:` protocol). Zero configuration, sends via device SIM directly.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Default Messaging Channel Preference:
              </label>
              <select
                value={defaultMessagingChannel}
                onChange={(e) => setDefaultMessagingChannel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium text-slate-800"
              >
                <option value="whatsapp">Option 1: 1-Click WhatsApp Direct (Recommended - Free)</option>
                <option value="android-gateway">Option 2: Automated Android SIM Gateway (Clinic Phone)</option>
                <option value="device-sms">Option 3: Native Device SMS App</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Android SIM Gateway Local URL (for Option 2):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={smsGatewayUrl}
                  onChange={(e) => setSmsGatewayUrl(e.target.value)}
                  placeholder="e.g. http://192.168.1.100:8080/v1/sms/send"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs"
                />
                <button
                  type="button"
                  disabled={testingGateway}
                  onClick={handleTestGateway}
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {testingGateway ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-teal-600" />}
                  <span>Test Ping</span>
                </button>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Android Gateway API Key / Secret (Optional):
              </label>
              <input
                type="text"
                value={smsGatewayApiKey}
                onChange={(e) => setSmsGatewayApiKey(e.target.value)}
                placeholder="Optional bearer token or secret from Android gateway app"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs"
              />
            </div>

            {gatewayTestResult && (
              <div
                className={`sm:col-span-2 p-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${
                  gatewayTestResult.success
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-amber-50 border-amber-300 text-amber-800'
                }`}
              >
                {gatewayTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>{gatewayTestResult.message}</span>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Default Follow-Up Reminder Template:
              </label>
              <textarea
                rows={2}
                value={smsTemplate}
                onChange={(e) => setSmsTemplate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-sans leading-relaxed"
                placeholder="Write template with {patientName}, {patientId}, {followUpDate}, {doctorName}, {reason}, {clinicName}, {clinicPhone}..."
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Available tags: &#123;patientName&#125;, &#123;patientId&#125;, &#123;followUpDate&#125;, &#123;doctorName&#125;, &#123;reason&#125;, &#123;clinicName&#125;, &#123;clinicPhone&#125;
              </span>
            </div>
          </div>
        </div>

        {/* Treatment Catalogue Table */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 font-bold text-slate-900 text-sm">
            <DollarSign className="w-4 h-4 text-teal-600" />
            <span>Default Treatment Pricing (BDT ৳)</span>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">Treatment Name</th>
                  <th className="py-2 px-3">Category</th>
                  <th className="py-2 px-3 text-right">Default Cost (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {treatmentPrices.map((tp, idx) => (
                  <tr key={idx}>
                    <td className="py-2 px-3 font-semibold text-slate-900">{tp.name}</td>
                    <td className="py-2 px-3 text-slate-500">{tp.category}</td>
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        min="0"
                        value={tp.defaultCost}
                        onChange={(e) => {
                          const updated = [...treatmentPrices];
                          updated[idx].defaultCost = parseFloat(e.target.value) || 0;
                          setTreatmentPrices(updated);
                        }}
                        className="w-24 px-2 py-1 text-right font-bold text-slate-900 border border-slate-200 rounded"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Diagnostic Tests Catalogue */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 font-bold text-slate-900 text-sm">
            <DollarSign className="w-4 h-4 text-teal-600" />
            <span>Default Diagnostic Tests &amp; X-ray Pricing (BDT ৳)</span>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">Test / X-ray Name</th>
                  <th className="py-2 px-3">Category</th>
                  <th className="py-2 px-3 text-right">Default Cost (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {testPrices.map((tp, idx) => (
                  <tr key={idx}>
                    <td className="py-2 px-3 font-semibold text-slate-900">{tp.name}</td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-800 font-bold border border-cyan-200 text-[10px]">
                        {tp.category}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        min="0"
                        value={tp.defaultCost}
                        onChange={(e) => {
                          const updated = [...testPrices];
                          updated[idx].defaultCost = parseFloat(e.target.value) || 0;
                          setTestPrices(updated);
                        }}
                        className="w-24 px-2 py-1 text-right font-bold text-slate-900 border border-slate-200 rounded"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Save Changes Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{saving ? 'Saving Changes...' : 'Save Settings & Messaging Channels'}</span>
          </button>
        </div>
      </form>

      {/* Developer Section: Feature Management & Database Backup */}
      {isDeveloper && (
        <div className="space-y-4">
          <DeveloperFeatureToggleCard variant="light" />

          <div className="bg-purple-950 text-purple-100 p-5 rounded-xl border border-purple-900 space-y-3">
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5 text-purple-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Database Maintenance &amp; Backup (Cloud SQL PostgreSQL)
              </h2>
            </div>
            <p className="text-xs text-purple-200 leading-relaxed">
              Download full structural and relational JSON snapshot of all PostgreSQL tables (Users, Patients, Visits, Treatments, Tests, Payments, Appointments, Prescriptions, Feature Flags, Audit Logs).
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => api.downloadBackup()}
                className="px-4 py-2 text-xs font-semibold bg-purple-700 hover:bg-purple-600 text-white rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download PostgreSQL JSON Snapshot</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Admin Medicine Catalog Management (Main Doctor & Developer) */}
      {canManageMedicineDb && <MedicineDatabaseManager />}
    </div>
  );
};
