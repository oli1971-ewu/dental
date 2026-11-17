import React from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  CreditCard,
  UserCheck,
  FileSpreadsheet,
  ShieldAlert,
  Settings,
  HelpCircle,
  MessageSquare,
  Code,
  FileText,
  Wallet,
  Crown,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const { user, isFeatureAccessible, subscription } = useAuth();
  if (!user) return null;

  const isSuperAdmin = user.role === 'main_doctor' || user.role === 'developer';
  const isDeveloper = user.role === 'developer';

  const canPatients = isFeatureAccessible('patient_management');
  const canVisits = isFeatureAccessible('visit_management');
  const canPrescriptions = isFeatureAccessible('prescription_management');
  const canPayments = isFeatureAccessible('payment_management');
  const canAppointments = isFeatureAccessible('appointment_management');
  const canDoctors = isSuperAdmin && isFeatureAccessible('doctor_management');
  const canPayroll = isSuperAdmin && isFeatureAccessible('salary_payroll');
  const canBackups = isFeatureAccessible('data_backup_export');

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
    ...(canPatients
      ? [
          { id: 'patients', label: 'Central Shared Records', shortLabel: 'Shared DB', icon: Users, badge: 'Shared' },
          { id: 'my-patients', label: 'My Patient Records', shortLabel: 'My Patients', icon: UserCheck, badge: 'Own' },
        ]
      : []),
    ...(canVisits
      ? [{ id: 'visits', label: 'Clinic Visits', shortLabel: 'Visits', icon: CalendarCheck }]
      : []),
    ...(canPrescriptions
      ? [{ id: 'prescriptions', label: 'Prescriptions', shortLabel: 'Rx', icon: FileText, badge: 'Rx' }]
      : []),
    ...(canPayments
      ? [{ id: 'payments', label: 'Payments & Dues', shortLabel: 'Payments', icon: CreditCard }]
      : []),
    ...(canAppointments
      ? [{ id: 'followups', label: 'Follow-ups & SMS', shortLabel: 'SMS Hub', icon: MessageSquare, badge: 'SMS' }]
      : []),
    ...(canDoctors
      ? [{ id: 'doctors', label: 'Doctor Accounts', shortLabel: 'Doctors', icon: UserCheck }]
      : []),
    ...(canPayroll
      ? [{ id: 'salary-sheet', label: 'Salary & Payroll', shortLabel: 'Payroll', icon: Wallet, badge: 'Payroll' }]
      : []),
    ...(canBackups
      ? [
          {
            id: 'exports',
            label: isSuperAdmin ? 'Backup & CSV Export' : 'My Data Backup',
            shortLabel: 'Backup',
            icon: FileSpreadsheet,
            badge: 'ZIP/CSV',
          },
        ]
      : []),
    ...(isSuperAdmin
      ? [{ id: 'audit-logs', label: 'Audit Logs', shortLabel: 'Audit', icon: ShieldAlert }]
      : []),
    ...(isSuperAdmin
      ? [{ id: 'settings', label: 'Clinic Settings', shortLabel: 'Settings', icon: Settings }]
      : []),
    ...(isDeveloper
      ? [{ id: 'developer-profile', label: 'Developer Control', shortLabel: 'Dev Control', icon: Code, badge: 'Dev' }]
      : []),
  ];

  // Primary 5 bottom bar items for mobile thumb-zone navigation
  const mobileBottomItems = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    ...(canPatients ? [{ id: 'patients', label: 'Shared DB', icon: Users }] : []),
    ...(canPatients ? [{ id: 'my-patients', label: 'My Patients', icon: UserCheck }] : []),
    ...(canAppointments ? [{ id: 'followups', label: 'Follow-Up SMS', icon: MessageSquare }] : []),
    ...(canPayments ? [{ id: 'payments', label: 'Payments', icon: CreditCard }] : []),
  ].slice(0, 5);

  return (
    <>
      {/* Mobile Compact Horizontal Scrollable Navigation Strip */}
      <div className="md:hidden bg-slate-900 border-b border-slate-800 px-3 py-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentTab(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.shortLabel || item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Left Sidebar */}
      <aside className="hidden md:flex md:w-64 bg-slate-900 text-slate-300 flex-col shrink-0 border-r border-slate-800">
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider">
              Clinic Portal
            </span>
            {subscription && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                  subscription.status === 'Active' || subscription.status === 'Trial'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}
                title={`Active Subscription Package: ${subscription.packageName} (${subscription.status})`}
              >
                <Crown className="w-2.5 h-2.5" />
                {subscription.packageName}
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-white truncate mt-0.5">
            {subscription?.clinicName || 'Dental Care'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
            <Code className="w-3 h-3 text-teal-400" />
            <span>Lead Developer: <strong className="text-slate-200">Aymon</strong></span>
          </div>
        </div>

        <nav className="p-3 space-y-1 overflow-y-auto flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-xs font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 text-xs text-slate-400 space-y-2">
          <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60">
            <div className="flex items-center gap-1.5 text-teal-400 font-semibold mb-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Zero Data Loss Protected</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              All clinical, prescription, payment, and payroll records are permanently preserved in Cloud SQL.
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Fixed Bottom Thumb-Zone Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center h-16 px-1 shadow-lg">
        {mobileBottomItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setCurrentTab(item.id)}
              className={`flex flex-col items-center justify-center h-full gap-1 transition-colors cursor-pointer ${
                isActive ? 'text-teal-600 font-bold' : 'text-slate-500 hover:text-slate-900 font-medium'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
              <span className="text-[10px] tracking-tight truncate max-w-[68px]">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
