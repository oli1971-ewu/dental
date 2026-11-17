import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api.ts';
import { Appointment, Patient, SmsReminderLog } from '../types/index.ts';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '../utils/dateFormat.ts';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Phone,
  Stethoscope,
  MessageSquare,
  Send,
  Calendar,
  CheckSquare,
  Square,
  History,
  Smartphone,
  AlertCircle,
  RefreshCw,
  Plus,
  X,
  ExternalLink,
  Wifi,
  HelpCircle,
  Check,
  Play,
  SkipForward,
  ArrowRight,
  ArrowLeft,
  Zap,
  MessageCircle,
} from 'lucide-react';

interface FollowUpsPageProps {
  onSelectPatient?: (patientId: number) => void;
}

const DEFAULT_ENGLISH_TEMPLATE =
  'Dear {patientName} ({patientId}), friendly reminder from {clinicName}: Your dental follow-up is scheduled for tomorrow ({followUpDate}) with {doctorName} for {reason}. Contact: {clinicPhone}.';

const DEFAULT_BANGLA_TEMPLATE =
  'প্রিয় {patientName} ({patientId}), {clinicName} থেকে জানানো যাচ্ছে যে আগামীকাল ({followUpDate}) {doctorName}-এর সাথে আপনার ফলো-আপ অ্যাপয়েন্টমেন্ট রয়েছে ({reason})। যোগাযোগ: {clinicPhone}।';

// Helper: Normalize Bangladesh phone number for WhatsApp wa.me URL
export const formatPhoneForWhatsApp = (rawPhone?: string | null): string => {
  if (!rawPhone) return '';
  let digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0')) return '88' + digits;
  if (digits.length === 10 && digits.startsWith('1')) return '880' + digits;
  return digits;
};

export const FollowUpsPage: React.FC<FollowUpsPageProps> = ({ onSelectPatient }) => {
  const tomorrowDateStr = useMemo(() => {
    const d = new Date(Date.now() + 86400000);
    return d.toISOString().split('T')[0];
  }, []);

  const todayDateStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateWindow, setDateWindow] = useState<'tomorrow' | 'today' | 'next3days' | 'upcoming' | 'custom' | 'all'>('all');
  const [customTargetDate, setCustomTargetDate] = useState(tomorrowDateStr);
  const [loading, setLoading] = useState(true);

  // Selected Channels: 'whatsapp' | 'android-gateway' | 'device-sms'
  const [activeChannelTab, setActiveChannelTab] = useState<'whatsapp' | 'android-gateway' | 'device-sms'>('whatsapp');

  // Central Reminder State
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [smsTemplate, setSmsTemplate] = useState(DEFAULT_ENGLISH_TEMPLATE);
  const [clinicName, setClinicName] = useState('Dental Care');
  const [clinicPhone, setClinicPhone] = useState('+880 1711-234567');
  const [smsLogs, setSmsLogs] = useState<SmsReminderLog[]>([]);
  const [sendingSms, setSendingSms] = useState(false);
  const [smsResultBanner, setSmsResultBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [showSmsHistory, setShowSmsHistory] = useState(false);

  // Option 1: Android SIM Gateway State
  const [gatewayUrl, setGatewayUrl] = useState(() => localStorage.getItem('dental_care_sms_gw_url') || 'http://192.168.1.100:8080/v1/sms/send');
  const [gatewayApiKey, setGatewayApiKey] = useState(() => localStorage.getItem('dental_care_sms_gw_key') || '');
  const [testingGateway, setTestingGateway] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<{ checked: boolean; success: boolean; message: string } | null>(null);
  const [showAndroidGuideModal, setShowAndroidGuideModal] = useState(false);

  // Option 2: WhatsApp Bulk Queue Wizard State
  const [whatsAppQueueOpen, setWhatsAppQueueOpen] = useState(false);
  const [whatsAppQueueIndex, setWhatsAppQueueIndex] = useState(0);
  const [whatsAppQueueDispatchedIds, setWhatsAppQueueDispatchedIds] = useState<number[]>([]);

  // Schedule New Follow-Up Modal State
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [newPatientId, setNewPatientId] = useState<string>('');
  const [newFollowUpDate, setNewFollowUpDate] = useState<string>(tomorrowDateStr);
  const [newReason, setNewReason] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [apptData, smsLogData, patientList] = await Promise.all([
        api.getAppointments({
          status: statusFilter !== 'All' ? statusFilter : undefined,
        }),
        api.getSmsReminderLogs(),
        api.getPatients(),
      ]);
      setAppointments(apptData);
      setPatients(patientList);
      if (smsLogData) {
        setSmsLogs(smsLogData.logs || []);
        if (smsLogData.clinicName) setClinicName(smsLogData.clinicName);
        if (smsLogData.clinicPhone) setClinicPhone(smsLogData.clinicPhone);
        if (smsLogData.smsTemplate) setSmsTemplate(smsLogData.smsTemplate);
        if (smsLogData.smsGatewayUrl) setGatewayUrl(smsLogData.smsGatewayUrl);
        if (smsLogData.smsGatewayApiKey) setGatewayApiKey(smsLogData.smsGatewayApiKey);
      }

      // Automatically pre-select scheduled appointments for tomorrow (day-before reminder) or upcoming scheduled
      const tomorrowScheduled = apptData.filter(
        (a) => a.status === 'Scheduled' && a.followUpDate === tomorrowDateStr
      );
      if (tomorrowScheduled.length > 0) {
        setSelectedIds(tomorrowScheduled.map((a) => a.id));
      } else {
        const allScheduled = apptData.filter((a) => a.status === 'Scheduled');
        setSelectedIds(allScheduled.map((a) => a.id));
      }
    } catch (e) {
      console.error('Failed to load follow-ups:', e);
    } finally {
      setLoading(false);
    }
  };

  // Filtered appointments based on selected date window
  const filteredAppointments = useMemo(() => {
    const next3Str = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    return appointments.filter((a) => {
      if (dateWindow === 'tomorrow') return a.followUpDate === tomorrowDateStr;
      if (dateWindow === 'today') return a.followUpDate === todayDateStr;
      if (dateWindow === 'next3days') {
        return a.followUpDate >= todayDateStr && a.followUpDate <= next3Str;
      }
      if (dateWindow === 'upcoming') return a.followUpDate >= todayDateStr;
      if (dateWindow === 'custom') return a.followUpDate === customTargetDate;
      return true;
    });
  }, [appointments, dateWindow, tomorrowDateStr, todayDateStr, customTargetDate]);

  // Scheduled appointments in current view eligible for reminders
  const scheduledInView = useMemo(
    () => filteredAppointments.filter((a) => a.status === 'Scheduled'),
    [filteredAppointments]
  );

  const tomorrowScheduledCount = useMemo(
    () => appointments.filter((a) => a.status === 'Scheduled' && a.followUpDate === tomorrowDateStr).length,
    [appointments, tomorrowDateStr]
  );

  const selectedAppointments = useMemo(
    () => appointments.filter((a) => selectedIds.includes(a.id)),
    [appointments, selectedIds]
  );

  const toggleSelectAppointment = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllScheduledInView = () => {
    const idsInView = scheduledInView.map((a) => a.id);
    const allSelected = idsInView.length > 0 && idsInView.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !idsInView.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...idsInView])));
    }
  };

  const handleSelectTomorrowPatients = () => {
    setDateWindow('tomorrow');
    const tomorrowIds = appointments
      .filter((a) => a.status === 'Scheduled' && a.followUpDate === tomorrowDateStr)
      .map((a) => a.id);
    setSelectedIds(tomorrowIds);
  };

  const formatMessageForAppointment = (a: Appointment) => {
    return smsTemplate
      .replace(/\{patientName\}/g, a.patientName || 'Patient')
      .replace(/\{patientId\}/g, a.patientCode || '')
      .replace(/\{followUpDate\}/g, formatDateDDMMYYYY(a.followUpDate))
      .replace(/\{doctorName\}/g, a.doctorName || 'Doctor')
      .replace(/\{reason\}/g, a.reason || 'Dental checkup')
      .replace(/\{clinicName\}/g, clinicName)
      .replace(/\{clinicPhone\}/g, clinicPhone);
  };

  // =========================================================================
  // OPTION 1: ANDROID SIM GATEWAY HANDLERS
  // =========================================================================
  const handleTestGateway = async () => {
    if (!gatewayUrl.trim()) {
      setGatewayStatus({
        checked: true,
        success: false,
        message: 'Please enter your Android Gateway URL first.',
      });
      return;
    }
    setTestingGateway(true);
    setGatewayStatus(null);
    try {
      localStorage.setItem('dental_care_sms_gw_url', gatewayUrl.trim());
      if (gatewayApiKey) localStorage.setItem('dental_care_sms_gw_key', gatewayApiKey.trim());

      const res = await api.testSmsGateway(gatewayUrl.trim(), gatewayApiKey.trim() || undefined);
      setGatewayStatus({
        checked: true,
        success: res.success,
        message: res.message,
      });
    } catch (err: any) {
      setGatewayStatus({
        checked: true,
        success: false,
        message: err.message || 'Failed to ping Android Gateway.',
      });
    } finally {
      setTestingGateway(false);
    }
  };

  const handleSendViaAndroidGateway = async (targetIds?: number[]) => {
    const idsToSend = targetIds || selectedIds;
    if (idsToSend.length === 0) {
      setSmsResultBanner({
        type: 'error',
        message: 'Please select at least one scheduled patient.',
      });
      return;
    }

    setSendingSms(true);
    setSmsResultBanner(null);
    try {
      localStorage.setItem('dental_care_sms_gw_url', gatewayUrl.trim());
      if (gatewayApiKey) localStorage.setItem('dental_care_sms_gw_key', gatewayApiKey.trim());

      const res = await api.sendSmsReminders({
        appointmentIds: idsToSend,
        messageTemplate: smsTemplate,
        gatewayUrl: gatewayUrl.trim(),
        gatewayApiKey: gatewayApiKey.trim() || undefined,
        channel: 'Free Android SIM Gateway',
      });

      setSmsResultBanner({
        type: 'success',
        message: `Dispatched ${res.sentCount} reminder SMS through Android SIM Gateway (৳0.00 extra cost)!`,
      });
      await fetchData();
    } catch (err: any) {
      setSmsResultBanner({
        type: 'error',
        message: err.message || 'Failed to dispatch via Android Gateway.',
      });
    } finally {
      setSendingSms(false);
    }
  };

  // =========================================================================
  // OPTION 2: 1-CLICK WHATSAPP HANDLERS
  // =========================================================================
  const handleSendSingleWhatsApp = async (a: Appointment) => {
    if (!a.patientPhone) {
      setSmsResultBanner({
        type: 'error',
        message: `Patient ${a.patientName} does not have a contact phone number on record.`,
      });
      return;
    }

    const waPhone = formatPhoneForWhatsApp(a.patientPhone);
    const msg = formatMessageForAppointment(a);
    const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;

    // Open WhatsApp in new tab
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    // Record sent log to backend
    try {
      await api.sendSmsReminders({
        appointmentIds: [a.id],
        messageTemplate: smsTemplate,
        channel: '1-Click WhatsApp Direct',
      });
      setSmsResultBanner({
        type: 'success',
        message: `Opened WhatsApp for ${a.patientName} (${a.patientPhone}) and logged reminder.`,
      });
      fetchData();
    } catch (e) {
      console.warn('Logged locally, server sync error:', e);
    }
  };

  // Bulk WhatsApp queue runner
  const activeQueuePatient = useMemo(() => {
    if (!whatsAppQueueOpen || selectedAppointments.length === 0) return null;
    return selectedAppointments[whatsAppQueueIndex] || null;
  }, [whatsAppQueueOpen, selectedAppointments, whatsAppQueueIndex]);

  const handleOpenWhatsAppQueue = () => {
    if (selectedAppointments.length === 0) {
      setSmsResultBanner({
        type: 'error',
        message: 'Please select at least one patient to start the WhatsApp bulk queue.',
      });
      return;
    }
    setWhatsAppQueueIndex(0);
    setWhatsAppQueueDispatchedIds([]);
    setWhatsAppQueueOpen(true);
  };

  const handleQueueSendCurrentAndAdvance = async () => {
    if (!activeQueuePatient) return;
    const a = activeQueuePatient;
    const waPhone = formatPhoneForWhatsApp(a.patientPhone);
    const msg = formatMessageForAppointment(a);
    const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;

    // Open WhatsApp
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    // Mark current as dispatched in state & backend
    setWhatsAppQueueDispatchedIds((prev) => [...prev, a.id]);

    try {
      await api.sendSmsReminders({
        appointmentIds: [a.id],
        messageTemplate: smsTemplate,
        channel: '1-Click WhatsApp Direct',
      });
    } catch (err) {
      console.warn('Queue log error:', err);
    }

    if (whatsAppQueueIndex + 1 < selectedAppointments.length) {
      setWhatsAppQueueIndex((prev) => prev + 1);
    } else {
      // Completed queue
      setWhatsAppQueueOpen(false);
      setSmsResultBanner({
        type: 'success',
        message: `Completed WhatsApp follow-up queue for ${selectedAppointments.length} patient(s)!`,
      });
      await fetchData();
    }
  };

  const handleQueueSkipCurrent = () => {
    if (whatsAppQueueIndex + 1 < selectedAppointments.length) {
      setWhatsAppQueueIndex((prev) => prev + 1);
    } else {
      setWhatsAppQueueOpen(false);
      fetchData();
    }
  };

  // =========================================================================
  // OPTION 3: NATIVE DEVICE SMS APP HANDLERS
  // =========================================================================
  const handleSendSingleDeviceSms = async (a: Appointment) => {
    if (!a.patientPhone) return;
    const msg = formatMessageForAppointment(a);
    const cleanPhone = a.patientPhone.replace(/\s+/g, '');
    const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(msg)}`;

    window.open(smsUrl, '_blank');

    try {
      await api.sendSmsReminders({
        appointmentIds: [a.id],
        messageTemplate: smsTemplate,
        channel: 'Native Device SMS',
      });
      setSmsResultBanner({
        type: 'success',
        message: `Opened device SMS for ${a.patientName} and logged to audit.`,
      });
      fetchData();
    } catch (e) {
      console.warn('Device SMS log error:', e);
    }
  };

  const handleMarkSelectedAsNativeSmsSent = async () => {
    if (selectedIds.length === 0) return;
    setSendingSms(true);
    try {
      const res = await api.sendSmsReminders({
        appointmentIds: selectedIds,
        messageTemplate: smsTemplate,
        channel: 'Native Device SMS',
      });
      setSmsResultBanner({
        type: 'success',
        message: `Marked ${res.sentCount} patient reminders as dispatched via Native Device SMS!`,
      });
      await fetchData();
    } catch (err: any) {
      setSmsResultBanner({
        type: 'error',
        message: err.message || 'Failed to record device SMS.',
      });
    } finally {
      setSendingSms(false);
    }
  };

  const previewPatient = useMemo(() => {
    const firstSelected = appointments.find((a) => selectedIds.includes(a.id));
    return firstSelected || scheduledInView[0] || appointments[0] || null;
  }, [appointments, selectedIds, scheduledInView]);

  const bulkMobileSmsHref = useMemo(() => {
    const phones = selectedAppointments
      .map((a) => a.patientPhone?.replace(/\s+/g, ''))
      .filter(Boolean)
      .join(',');
    const bodyText = previewPatient
      ? formatMessageForAppointment(previewPatient)
      : `Friendly reminder from ${clinicName}: You have a scheduled dental follow-up tomorrow (${formatDateDDMMYYYY(tomorrowDateStr)}). Contact: ${clinicPhone}.`;
    return `sms:${phones}?body=${encodeURIComponent(bodyText)}`;
  }, [selectedAppointments, previewPatient, smsTemplate, clinicName, clinicPhone, tomorrowDateStr]);

  const handleCreateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientId || !newFollowUpDate || !newReason.trim()) return;
    setSavingFollowUp(true);
    try {
      await api.createAppointment({
        patientId: parseInt(newPatientId, 10),
        followUpDate: newFollowUpDate,
        reason: newReason.trim(),
        notes: newNotes.trim() || undefined,
      });
      setScheduleModalOpen(false);
      setNewPatientId('');
      setNewReason('');
      setNewNotes('');
      await fetchData();
    } catch (err: any) {
      console.error('Failed to schedule follow-up:', err);
    } finally {
      setSavingFollowUp(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.updateAppointmentStatus(id, { status: newStatus });
      fetchData();
    } catch (e) {
      console.error('Failed to update appointment status:', e);
    }
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            Patient Follow-up Tracking &amp; Central Reminder Hub
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Notify scheduled patients 1 day before their follow-up date using 3 zero-cost channels: WhatsApp, Android SIM Gateway, or Device SMS.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setScheduleModalOpen(true)}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule Follow-Up</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSmsHistory(!showSmsHistory)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-teal-600" />
            <span>Reminder Logs ({smsLogs.length})</span>
          </button>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-medium text-slate-700"
          >
            <option value="All">All Statuses</option>
            <option value="Scheduled">Scheduled Only</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Missed">Missed</option>
          </select>
        </div>
      </div>

      {/* Main Central Notification Hub with 3 Free Zero-Cost Channels */}
      <div className="bg-white rounded-2xl border border-teal-200 shadow-xs overflow-hidden">
        {/* Banner Top */}
        <div className="bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 px-4 sm:px-6 py-4 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <MessageSquare className="w-4 h-4 text-teal-300" />
              <h2 className="text-sm sm:text-base font-bold tracking-tight">
                Centralized Follow-Up Reminder Hub · 100% Free / Zero Telecom Cost
              </h2>
              <span className="text-[11px] text-teal-200">
                · {clinicName}
              </span>
            </div>
            <p className="text-xs text-teal-100/90">
              Select scheduled patients for tomorrow ({formatDateDDMMYYYY(tomorrowDateStr)}) or any date window and dispatch personalized reminders across 3 zero-fee channels.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSelectTomorrowPatients}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5 text-teal-300" />
              <span>Select Tomorrow ({tomorrowScheduledCount})</span>
            </button>
          </div>
        </div>

        {/* Channel Selection Tabs */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
              Select Free Channel:
            </span>

            {/* Option 1: WhatsApp */}
            <button
              type="button"
              onClick={() => setActiveChannelTab('whatsapp')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeChannelTab === 'whatsapp'
                  ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-500/20'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-emerald-50'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-300" />
              <span>Option 1: 1-Click WhatsApp (Free)</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${activeChannelTab === 'whatsapp' ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-100 text-emerald-800'}`}>
                ৳0
              </span>
            </button>

            {/* Option 2: Android SIM Gateway */}
            <button
              type="button"
              onClick={() => setActiveChannelTab('android-gateway')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeChannelTab === 'android-gateway'
                  ? 'bg-teal-700 text-white shadow-xs ring-2 ring-teal-500/20'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-teal-50'
              }`}
            >
              <Wifi className="w-3.5 h-3.5 text-teal-300" />
              <span>Option 2: Android SIM Gateway (Auto ৳0)</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${activeChannelTab === 'android-gateway' ? 'bg-teal-900 text-teal-100' : 'bg-teal-100 text-teal-800'}`}>
                ৳0
              </span>
            </button>

            {/* Option 3: Device SMS */}
            <button
              type="button"
              onClick={() => setActiveChannelTab('device-sms')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeChannelTab === 'device-sms'
                  ? 'bg-blue-700 text-white shadow-xs ring-2 ring-blue-500/20'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-blue-50'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-blue-300" />
              <span>Option 3: Native Device SMS App</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${activeChannelTab === 'device-sms' ? 'bg-blue-900 text-blue-100' : 'bg-blue-100 text-blue-800'}`}>
                ৳0
              </span>
            </button>
          </div>

          <span className="text-[11px] font-semibold text-slate-600 tabular-nums">
            Selected: <strong className="text-teal-800">{selectedAppointments.length}</strong> patient(s)
          </span>
        </div>

        {/* Channel Active Action Bar */}
        <div className="p-4 sm:p-5 space-y-4">
          {smsResultBanner && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
                smsResultBanner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              <div className="flex items-center gap-2">
                {smsResultBanner.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{smsResultBanner.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setSmsResultBanner(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ACTIVE CHANNEL DETAILS & ACTION BAR */}
          {activeChannelTab === 'whatsapp' && (
            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-600 text-white">
                    <MessageCircle className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-bold text-emerald-950">
                    Option 1: 1-Click WhatsApp Direct (100% Free, Zero Telecom Fee)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    Most Popular in Bangladesh
                  </span>
                </div>
                <p className="text-xs text-emerald-900/80 leading-relaxed max-w-2xl">
                  Uses WhatsApp Web or mobile app deep-linking (`https://wa.me/8801...`). No telecom carrier fees, no API billing. You can send individual messages from each patient card below or launch our automated step-by-step queue to send to all selected in 60 seconds.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={selectedAppointments.length === 0}
                  onClick={handleOpenWhatsAppQueue}
                  className="px-4 py-2.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch WhatsApp Batch Queue ({selectedAppointments.length})</span>
                </button>
              </div>
            </div>
          )}

          {activeChannelTab === 'android-gateway' && (
            <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-teal-700 text-white">
                    <Wifi className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="text-sm font-bold text-teal-950 block">
                      Option 2: Automated Android SIM Gateway (৳0.00 via Clinic Phone SIM)
                    </span>
                    <span className="text-xs text-teal-800">
                      Connect any Android phone with a GP / Robi / Banglalink SIM SMS bundle on clinic Wi-Fi.
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAndroidGuideModal(true)}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-teal-300 text-teal-800 hover:bg-teal-100 flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>2-Min Phone Setup Guide</span>
                  </button>
                </div>
              </div>

              {/* Gateway URL Configuration Form */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
                <div className="md:col-span-6">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Android Phone Local Gateway URL:
                  </label>
                  <input
                    type="text"
                    value={gatewayUrl}
                    onChange={(e) => setGatewayUrl(e.target.value)}
                    placeholder="e.g. http://192.168.1.100:8080/v1/sms/send"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-mono focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    API Key / Secret (Optional):
                  </label>
                  <input
                    type="text"
                    value={gatewayApiKey}
                    onChange={(e) => setGatewayApiKey(e.target.value)}
                    placeholder="Leave empty if not set"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-mono text-xs"
                  />
                </div>

                <div className="md:col-span-3 flex items-end gap-2">
                  <button
                    type="button"
                    disabled={testingGateway}
                    onClick={handleTestGateway}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {testingGateway ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-teal-600" />
                    )}
                    <span>Test Ping</span>
                  </button>

                  <button
                    type="button"
                    disabled={sendingSms || selectedAppointments.length === 0}
                    onClick={() => handleSendViaAndroidGateway()}
                    className="flex-1 px-4 py-2 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {sendingSms ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Send Automated SMS ({selectedAppointments.length})</span>
                  </button>
                </div>
              </div>

              {gatewayStatus && (
                <div
                  className={`p-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${
                    gatewayStatus.success
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-amber-50 border-amber-300 text-amber-800'
                  }`}
                >
                  {gatewayStatus.success ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span>{gatewayStatus.message}</span>
                </div>
              )}
            </div>
          )}

          {activeChannelTab === 'device-sms' && (
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-700 text-white">
                    <Smartphone className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-bold text-blue-950">
                    Option 3: Native Device SMS App (Zero Setup, Instant)
                  </span>
                </div>
                <p className="text-xs text-blue-900/80 leading-relaxed max-w-2xl">
                  Uses your tablet, mobile phone, or iPad&apos;s built-in Messages app (`sms:` protocol). Directly opens your default SMS app with recipient numbers and message pre-populated. Ideal for quick mobile check-in without configuring servers.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {selectedAppointments.length > 0 && (
                  <a
                    href={bulkMobileSmsHref}
                    className="px-3.5 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 transition-all whitespace-nowrap"
                    title="Launch native Messages app with selected patient numbers"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Open Phone SMS App ({selectedAppointments.length})</span>
                  </a>
                )}

                <button
                  type="button"
                  disabled={sendingSms || selectedAppointments.length === 0}
                  onClick={handleMarkSelectedAsNativeSmsSent}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white border border-blue-300 text-blue-800 hover:bg-blue-100 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5 text-blue-600" />
                  <span>Mark as Sent in Logs</span>
                </button>
              </div>
            </div>
          )}

          {/* Date Filter Tabs + Template Editor */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
            {/* Left: Target Date Selection & Recipient Summary */}
            <div className="lg:col-span-5 space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  1. Filter Follow-Up Date Window
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  Tomorrow: {formatDateDDMMYYYY(tomorrowDateStr)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  { id: 'all', label: `All (${appointments.length})` },
                  { id: 'tomorrow', label: `Tomorrow (${tomorrowScheduledCount})` },
                  { id: 'today', label: 'Today' },
                  { id: 'next3days', label: 'Next 3 Days' },
                  { id: 'upcoming', label: 'All Upcoming' },
                  { id: 'custom', label: 'Pick Date' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDateWindow(tab.id as any)}
                    className={`px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap truncate ${
                      dateWindow === tab.id
                        ? 'bg-teal-600 text-white shadow-2xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {dateWindow === 'custom' && (
                <div className="pt-1">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Select Specific Follow-Up Date:
                  </label>
                  <input
                    type="date"
                    value={customTargetDate}
                    onChange={(e) => setCustomTargetDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium"
                  />
                </div>
              )}

              <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAllScheduledInView}
                  className="inline-flex items-center gap-1.5 font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
                >
                  {scheduledInView.length > 0 &&
                  scheduledInView.every((a) => selectedIds.includes(a.id)) ? (
                    <CheckSquare className="w-4 h-4 text-teal-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>
                    Select All Scheduled in View ({scheduledInView.length})
                  </span>
                </button>

                <span className="text-[11px] text-slate-600 font-medium tabular-nums">
                  <strong>{selectedIds.length}</strong> selected for reminder
                </span>
              </div>
            </div>

            {/* Right: Reminder Template & Live Preview */}
            <div className="lg:col-span-7 space-y-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">
                  2. Reminder Message Template (Auto-fills Patient &amp; Doctor Info)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSmsTemplate(DEFAULT_ENGLISH_TEMPLATE)}
                    className="px-2 py-1 text-[11px] font-semibold rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    English Template
                  </button>
                  <button
                    type="button"
                    onClick={() => setSmsTemplate(DEFAULT_BANGLA_TEMPLATE)}
                    className="px-2 py-1 text-[11px] font-semibold rounded bg-white border border-slate-300 text-teal-800 hover:bg-teal-50 cursor-pointer"
                  >
                    বাংলা Template
                  </button>
                </div>
              </div>

              <textarea
                rows={2}
                value={smsTemplate}
                onChange={(e) => setSmsTemplate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 leading-relaxed font-sans"
                placeholder="Write reminder template..."
              />

              {previewPatient && (
                <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-600 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                    <span>LIVE MESSAGE PREVIEW ({previewPatient.patientName} · {previewPatient.patientPhone})</span>
                    <span className="tabular-nums">{formatMessageForAppointment(previewPatient).length} chars</span>
                  </div>
                  <p className="text-slate-800 font-medium leading-snug">
                    &ldquo;{formatMessageForAppointment(previewPatient)}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Reminder Dispatch History Log */}
      {showSmsHistory && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Central Reminder Dispatch History &amp; Channels ({smsLogs.length})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowSmsHistory(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Close History
            </button>
          </div>

          {smsLogs.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No reminders have been dispatched yet. Select patients and send via WhatsApp, Android Gateway, or Phone SMS.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Sent Time</th>
                    <th className="py-2 px-3">Patient &amp; Phone</th>
                    <th className="py-2 px-3">Follow-Up Date</th>
                    <th className="py-2 px-3">Channel Used</th>
                    <th className="py-2 px-3">Content</th>
                    <th className="py-2 px-3">Sent By</th>
                    <th className="py-2 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {smsLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 whitespace-nowrap text-slate-500 tabular-nums">
                        {formatDateTimeDDMMYYYY(log.sentAt)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{log.patientName}</div>
                        <div className="text-[11px] text-slate-500 tabular-nums">{log.patientPhone}</div>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap font-medium text-teal-700 tabular-nums">
                        {formatDateDDMMYYYY(log.followUpDate)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.channel?.includes('WhatsApp')
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : log.channel?.includes('Android')
                              ? 'bg-teal-100 text-teal-800 border border-teal-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {log.channel || 'Central Dispatch'}
                        </span>
                      </td>
                      <td className="py-2 px-3 max-w-xs truncate text-slate-700" title={log.message}>
                        {log.message}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                        {log.sentBy}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap font-semibold text-emerald-700">
                        {log.status || 'Sent'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Follow-up Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-8 text-center text-slate-400 text-xs">
            Loading follow-up appointments...
          </div>
        ) : filteredAppointments.length > 0 ? (
          filteredAppointments.map((a) => {
            const isScheduled = a.status === 'Scheduled';
            const isSelected = selectedIds.includes(a.id);
            const isTomorrow = a.followUpDate === tomorrowDateStr;

            return (
              <div
                key={a.id}
                onClick={() => onSelectPatient && onSelectPatient(a.patientId)}
                className={`bg-white rounded-xl border p-4 shadow-xs space-y-3 flex flex-col justify-between cursor-pointer transition-all ${
                  isSelected
                    ? 'border-teal-500 ring-2 ring-teal-500/15'
                    : 'border-slate-200 hover:border-teal-300 hover:shadow-md'
                }`}
                title="Click to view patient profile"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isScheduled) toggleSelectAppointment(a.id);
                      }}
                    >
                      {isScheduled && (
                        <button
                          type="button"
                          className="p-1 -m-1 text-teal-600 hover:text-teal-800 cursor-pointer"
                          title="Select for reminder dispatch"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-teal-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      )}
                      <span className="text-xs font-bold text-teal-800 font-mono">
                        {a.patientCode}
                      </span>
                      {isTomorrow && (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          Tomorrow
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                      {a.smsReminderSent ? (
                        <span
                          className="text-emerald-700 flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200"
                          title={`Notified: ${a.lastSmsSentAt ? formatDateTimeDDMMYYYY(a.lastSmsSentAt) : ''}`}
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Notified ({a.smsSentCount || 1})</span>
                        </span>
                      ) : isScheduled ? (
                        <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          Pending
                        </span>
                      ) : null}
                      <span className="text-slate-300">·</span>
                      <span
                        className={
                          a.status === 'Scheduled'
                            ? 'text-blue-700 font-bold'
                            : a.status === 'Completed'
                            ? 'text-emerald-700 font-bold'
                            : 'text-slate-500'
                        }
                      >
                        {a.status}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 text-sm hover:text-teal-700 transition-colors">
                      {a.patientName}
                    </h3>
                    {a.patientPhone && (
                      <div className="flex items-center gap-1.5 text-slate-600 text-xs mt-0.5 tabular-nums">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{a.patientPhone}</span>
                      </div>
                    )}
                  </div>

                  <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between gap-2 font-bold text-slate-800">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-teal-600" />
                        <span className="tabular-nums">{formatDateDDMMYYYY(a.followUpDate)}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
                      <span>Doctor: {a.doctorName}</span>
                    </div>
                    <p className="text-slate-700 mt-1 italic">&ldquo;{a.reason}&rdquo;</p>
                  </div>
                </div>

                {/* Action Footer: ALL 3 ZERO-COST OPTIONS AVAILABLE ON EVERY CARD */}
                <div
                  className="pt-2.5 border-t border-slate-100 flex flex-col gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Option 1: WhatsApp Button */}
                    {a.patientPhone && (
                      <button
                        type="button"
                        onClick={() => handleSendSingleWhatsApp(a)}
                        className="px-2 py-1 text-[11px] font-bold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 transition-colors cursor-pointer"
                        title="Open WhatsApp with customized reminder (100% Free)"
                      >
                        <MessageCircle className="w-3 h-3" />
                        <span>WhatsApp</span>
                      </button>
                    )}

                    {/* Option 2: Android Gateway / Central SMS Button */}
                    {isScheduled && (
                      <button
                        type="button"
                        disabled={sendingSms}
                        onClick={() => handleSendViaAndroidGateway([a.id])}
                        className="px-2 py-1 text-[11px] font-bold rounded-md bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1 cursor-pointer transition-colors"
                        title="Send automated carrier SMS via Android SIM Gateway (৳0.00)"
                      >
                        <Send className="w-3 h-3" />
                        <span>Gateway SMS</span>
                      </button>
                    )}

                    {/* Option 3: Native Device SMS App Button */}
                    {a.patientPhone && (
                      <button
                        type="button"
                        onClick={() => handleSendSingleDeviceSms(a)}
                        className="px-2 py-1 text-[11px] font-semibold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Open default messaging app on this device"
                      >
                        <Smartphone className="w-3 h-3 text-slate-600" />
                        <span>Phone SMS</span>
                      </button>
                    )}
                  </div>

                  {/* Clinical Status Controls */}
                  {isScheduled && (
                    <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100">
                      <span className="text-[10px] text-slate-400 font-medium">Mark clinical outcome:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(a.id, 'Completed')}
                          className="px-2 py-1 text-[11px] font-semibold rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Done</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(a.id, 'Cancelled')}
                          className="px-2 py-1 text-[11px] font-semibold rounded bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-10 bg-white rounded-xl border border-slate-200 text-center space-y-2 p-6">
            <Clock className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-bold text-slate-700">
              No follow-ups found for the selected filter window.
            </div>
            <p className="text-xs text-slate-500">
              Try switching the date filter to &ldquo;All&rdquo; or schedule a new follow-up for tomorrow ({formatDateDDMMYYYY(tomorrowDateStr)}).
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              {dateWindow !== 'all' && (
                <button
                  type="button"
                  onClick={() => setDateWindow('all')}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 cursor-pointer"
                >
                  Show All Follow-Ups
                </button>
              )}
              <button
                type="button"
                onClick={() => setScheduleModalOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 cursor-pointer"
              >
                + Schedule Follow-Up
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: WHATSAPP BULK QUEUE RUNNER WIZARD (OPTION 1)                 */}
      {/* ===================================================================== */}
      {whatsAppQueueOpen && activeQueuePatient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-emerald-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-emerald-200" />
                <div>
                  <h3 className="font-bold text-sm">Bulk WhatsApp Follow-Up Assistant</h3>
                  <span className="text-[11px] text-emerald-100">100% Free · No API Fees · Direct WhatsApp Deep Link</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWhatsAppQueueOpen(false)}
                className="p-1 text-emerald-200 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="bg-emerald-50 px-5 py-2.5 border-b border-emerald-100 flex items-center justify-between text-xs font-semibold text-emerald-900">
              <span>
                Patient <strong>{whatsAppQueueIndex + 1}</strong> of <strong>{selectedAppointments.length}</strong>
              </span>
              <span className="tabular-nums">
                {Math.round(((whatsAppQueueIndex + 1) / selectedAppointments.length) * 100)}% Complete
              </span>
            </div>
            <div className="w-full bg-slate-100 h-1.5">
              <div
                className="bg-emerald-500 h-1.5 transition-all duration-300"
                style={{
                  width: `${((whatsAppQueueIndex + 1) / selectedAppointments.length) * 100}%`,
                }}
              />
            </div>

            {/* Current Patient Card */}
            <div className="p-5 space-y-4">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-teal-800">
                    {activeQueuePatient.patientCode}
                  </span>
                  <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    Follow-Up: {formatDateDDMMYYYY(activeQueuePatient.followUpDate)}
                  </span>
                </div>

                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    {activeQueuePatient.patientName}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-600 mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold tabular-nums">{activeQueuePatient.patientPhone}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-emerald-700 font-mono text-[11px]">
                      WhatsApp ID: {formatPhoneForWhatsApp(activeQueuePatient.patientPhone)}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-600 pt-1">
                  Doctor: <strong>{activeQueuePatient.doctorName}</strong> · Reason: <em>{activeQueuePatient.reason}</em>
                </div>
              </div>

              {/* Message Bubble Preview */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Pre-filled Message (Bengali / English):
                </label>
                <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-slate-800 font-medium leading-relaxed">
                  &ldquo;{formatMessageForAppointment(activeQueuePatient)}&rdquo;
                </div>
              </div>

              {/* Navigation Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={whatsAppQueueIndex === 0}
                    onClick={() => setWhatsAppQueueIndex((prev) => Math.max(0, prev - 1))}
                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleQueueSkipCurrent}
                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600 flex items-center gap-1 cursor-pointer"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>Skip</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleQueueSendCurrentAndAdvance}
                  className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>
                    {whatsAppQueueIndex + 1 === selectedAppointments.length
                      ? 'Open WhatsApp & Finish'
                      : 'Open WhatsApp & Next ▶'}
                  </span>
                </button>
              </div>

              {/* Queue Summary List */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Queue List ({selectedAppointments.length}):
                </span>
                <div className="max-h-28 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {selectedAppointments.map((p, idx) => {
                    const isDone = whatsAppQueueDispatchedIds.includes(p.id);
                    const isCurrent = idx === whatsAppQueueIndex;
                    return (
                      <div
                        key={p.id}
                        className={`py-1.5 px-2 rounded flex items-center justify-between ${
                          isCurrent ? 'bg-emerald-100/70 font-bold' : ''
                        }`}
                      >
                        <span className="truncate max-w-[200px]">
                          {idx + 1}. {p.patientName} ({p.patientPhone})
                        </span>
                        <span>
                          {isDone ? (
                            <span className="text-emerald-700 flex items-center gap-1 font-semibold text-[11px]">
                              <Check className="w-3 h-3" /> Dispatched
                            </span>
                          ) : isCurrent ? (
                            <span className="text-emerald-800 text-[11px] font-bold">Current</span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Pending</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: 2-MINUTE ANDROID SIM GATEWAY SETUP GUIDE (OPTION 2)          */}
      {/* ===================================================================== */}
      {showAndroidGuideModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-teal-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 bg-teal-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="w-5 h-5 text-teal-300" />
                <h3 className="font-bold text-sm">How to Set Up Free Android SIM Gateway (৳0.00 Extra Cost)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAndroidGuideModal(false)}
                className="p-1 text-teal-200 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700 leading-relaxed">
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl space-y-1">
                <span className="font-bold text-teal-900 block">Why this is 100% Free:</span>
                <p className="text-teal-800">
                  Commercial SMS API providers charge per SMS. By using an Android phone with a Bangladeshi SIM card (GP, Robi, Banglalink, Teletalk) with a standard bundle (e.g. 500 SMS for ৳30), your clinic can send thousands of reminders at virtually zero extra cost!
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                    1
                  </span>
                  <div>
                    <strong className="text-slate-900 block">Install a Free Android SMS Gateway App</strong>
                    <span>
                      On any spare Android phone or tablet at the clinic reception, install an open-source SMS Gateway app (such as <em>SMS Gateway by capcom6</em>, <em>TextBee</em>, or <em>Android SMS HTTP Server</em> from F-Droid or GitHub).
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                    2
                  </span>
                  <div>
                    <strong className="text-slate-900 block">Connect Phone to Clinic Wi-Fi &amp; Start Server</strong>
                    <span>
                      Ensure the phone is connected to the same clinic Wi-Fi. Open the app and tap &ldquo;Start Server&rdquo;. The app will display a local IP, for example:
                      <code className="block mt-1 p-1.5 bg-slate-100 rounded text-teal-800 font-mono text-[11px]">
                        http://192.168.1.105:8080/v1/sms/send
                      </code>
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                    3
                  </span>
                  <div>
                    <strong className="text-slate-900 block">Paste URL and Click &ldquo;Test Ping&rdquo;</strong>
                    <span>
                      Paste that address into Dental Care&apos;s Gateway URL input and click <strong>Test Ping</strong>. Once verified, simply click &ldquo;Send Automated SMS&rdquo; and reminders will be broadcast through your clinic SIM card automatically!
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowAndroidGuideModal(false)}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                >
                  Got It!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: SCHEDULE NEW PATIENT FOLLOW-UP                               */}
      {/* ===================================================================== */}
      {scheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-400" />
                <h3 className="font-bold text-sm">Schedule Patient Follow-Up</h3>
              </div>
              <button
                type="button"
                onClick={() => setScheduleModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFollowUp} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Select Patient *
                </label>
                <select
                  required
                  value={newPatientId}
                  onChange={(e) => setNewPatientId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-medium"
                >
                  <option value="">-- Choose Patient --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.patientId} · {p.name} ({p.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Follow-Up Date *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    required
                    value={newFollowUpDate}
                    onChange={(e) => setNewFollowUpDate(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setNewFollowUpDate(tomorrowDateStr)}
                    className="px-2.5 py-2 text-[11px] font-semibold rounded-lg bg-teal-50 border border-teal-200 text-teal-800 hover:bg-teal-100 cursor-pointer whitespace-nowrap"
                  >
                    Tomorrow
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Follow-Up Reason / Clinical Purpose *
                </label>
                <input
                  type="text"
                  required
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="e.g. Suture removal & healing check, Crown cementation"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Clinical Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Instructions for attending doctor..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFollowUp}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer disabled:opacity-50"
                >
                  {savingFollowUp ? 'Scheduling...' : 'Confirm Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
