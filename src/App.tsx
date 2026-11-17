import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Navbar } from './components/Navbar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { PatientsPage } from './pages/PatientsPage.tsx';
import { PatientDetailPage } from './pages/PatientDetailPage.tsx';
import { VisitsPage } from './pages/VisitsPage.tsx';
import { PaymentsPage } from './pages/PaymentsPage.tsx';
import { FollowUpsPage } from './pages/FollowUpsPage.tsx';
import { DoctorsPage } from './pages/DoctorsPage.tsx';
import { SalarySheetPage } from './pages/SalarySheetPage.tsx';
import { ExportsPage } from './pages/ExportsPage.tsx';
import { AuditLogsPage } from './pages/AuditLogsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { PrescriptionsPage } from './pages/PrescriptionsPage.tsx';
import { DeveloperProfilePage } from './pages/DeveloperProfilePage.tsx';

import { PatientModal } from './components/PatientModal.tsx';
import { NewVisitModal } from './components/NewVisitModal.tsx';
import { RecordPaymentModal } from './components/RecordPaymentModal.tsx';
import { AddTreatmentModal } from './components/AddTreatmentModal.tsx';
import { AddTestModal } from './components/AddTestModal.tsx';
import { DoctorModal } from './components/DoctorModal.tsx';
import { PrescriptionFormModal } from './components/PrescriptionFormModal.tsx';
import { PrescriptionPreviewModal } from './components/PrescriptionPreviewModal.tsx';
import { Patient, Prescription, User } from './types/index.ts';
import { api } from './services/api.ts';
import { Activity, ShieldAlert } from 'lucide-react';

function resolveInitialTab(): string {
  if (typeof window === 'undefined') return 'dashboard';
  const params = new URLSearchParams(window.location.search);
  const tabParam = (params.get('tab') || '').toLowerCase();
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  if (tabParam === 'prescriptions' || path.includes('/prescriptions') || hash.includes('prescriptions')) {
    return 'prescriptions';
  }
  if (tabParam === 'developer-profile' || path.includes('/developer-profile')) {
    return 'developer-profile';
  }
  return 'dashboard';
}

const TAB_TO_FEATURE_KEY: Record<string, string> = {
  patients: 'patient_management',
  'my-patients': 'patient_management',
  'patient-detail': 'patient_management',
  visits: 'visit_management',
  prescriptions: 'prescription_management',
  payments: 'payment_management',
  followups: 'appointment_management',
  doctors: 'doctor_management',
  'salary-sheet': 'salary_payroll',
  exports: 'data_backup_export',
};

function AppContent() {
  const { user, loading, prescriptionManagementEnabled, isFeatureAccessible, getFeatureStatusReason } = useAuth();

  // Navigation tab
  const [currentTab, setCurrentTab] = useState<string>(() => resolveInitialTab());
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);

  // Modal states
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [patientToEdit, setPatientToEdit] = useState<Patient | null>(null);

  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [visitDefaultPatient, setVisitDefaultPatient] = useState<Patient | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentVisit, setPaymentVisit] = useState<any>(null);
  const [paymentInitialMode, setPaymentInitialMode] = useState<'payment' | 'discount'>('payment');

  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [treatmentVisitTarget, setTreatmentVisitTarget] = useState<{ id: number; code: string } | null>(null);

  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testVisitTarget, setTestVisitTarget] = useState<{ id: number; code: string } | null>(null);

  const [doctorModalOpen, setDoctorModalOpen] = useState(false);
  const [doctorToEdit, setDoctorToEdit] = useState<User | null>(null);

  // Prescription modal states
  const [rxFormOpen, setRxFormOpen] = useState(false);
  const [rxFormPatientId, setRxFormPatientId] = useState<number | null>(null);
  const [rxFormVisitId, setRxFormVisitId] = useState<number | null>(null);
  const [rxToEdit, setRxToEdit] = useState<Prescription | null>(null);

  const [rxPreviewOpen, setRxPreviewOpen] = useState(false);
  const [rxPreviewId, setRxPreviewId] = useState<number | null>(null);

  // Trigger state refresh key when sub-modals save
  const [refreshKey, setRefreshKey] = useState(0);

  // Immediately close open prescription modals if developer disables feature globally
  useEffect(() => {
    if (!prescriptionManagementEnabled) {
      setRxFormOpen(false);
      setRxPreviewOpen(false);
    }
  }, [prescriptionManagementEnabled]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-teal-400 gap-3">
        <Activity className="w-10 h-10 animate-spin" />
        <span className="text-sm font-semibold tracking-wide text-slate-300">
          Loading Dental Care Portal...
        </span>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const navigateToTab = (tab: string, context?: any) => {
    if (tab === 'patients' && context?.patientId) {
      setSelectedPatientId(context.patientId);
      setCurrentTab('patient-detail');
    } else {
      setCurrentTab(tab);
    }
  };

  const handleOpenPatientDetail = (pId: number) => {
    setSelectedPatientId(pId);
    setCurrentTab('patient-detail');
  };

  const handleOpenNewVisit = (patient?: any) => {
    if (patient && patient.id) {
      setVisitDefaultPatient(patient);
    } else if (currentTab === 'patient-detail' && selectedPatientId) {
      setVisitDefaultPatient({ id: selectedPatientId } as any);
      api.getPatient(selectedPatientId).then(setVisitDefaultPatient).catch(console.error);
    } else {
      setVisitDefaultPatient(null);
    }
    setVisitModalOpen(true);
  };

  const handleOpenRecordPayment = (visit: any, initialMode: 'payment' | 'discount' = 'payment') => {
    setPaymentVisit(visit);
    setPaymentInitialMode(initialMode);
    setPaymentModalOpen(true);
  };

  const handleOpenPaymentForPatient = async (p: Patient) => {
    try {
      const fullProfile = await api.getPatient(p.id);
      const unpaidList = fullProfile.visits.filter(
        (v: any) => parseFloat(v.outstandingDue || '0') > 0.01
      );
      if (unpaidList.length > 0) {
        handleOpenRecordPayment({
          ...unpaidList[0],
          patientId: fullProfile.id,
          patientName: fullProfile.name,
          patientCode: fullProfile.patientId,
          payAllPatientVisits: unpaidList.length > 1,
        });
      } else {
        handleOpenPatientDetail(p.id);
      }
    } catch {
      handleOpenPatientDetail(p.id);
    }
  };

  const handleOpenAddTreatment = (visitId: number, visitCode: string) => {
    setTreatmentVisitTarget({ id: visitId, code: visitCode });
    setTreatmentModalOpen(true);
  };

  const handleOpenAddTest = (visitId: number, visitCode: string) => {
    setTestVisitTarget({ id: visitId, code: visitCode });
    setTestModalOpen(true);
  };

  const handleOpenDoctorModal = (doctor?: User) => {
    setDoctorToEdit(doctor || null);
    setDoctorModalOpen(true);
  };

  const handleOpenCreatePrescription = (patientId?: number, visitId?: number) => {
    if (!prescriptionManagementEnabled) return;
    setRxToEdit(null);
    setRxFormPatientId(patientId ?? null);
    setRxFormVisitId(visitId ?? null);
    setRxFormOpen(true);
  };

  const handleOpenEditDraftPrescription = (rx: Prescription) => {
    if (!prescriptionManagementEnabled) return;
    setRxPreviewOpen(false);
    setRxFormPatientId(rx.patientId);
    setRxFormVisitId(rx.visitId);
    setRxToEdit(rx);
    setRxFormOpen(true);
  };

  const handleOpenPreviewPrescription = (prescriptionId: number) => {
    if (!prescriptionManagementEnabled) return;
    setRxPreviewId(prescriptionId);
    setRxPreviewOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 font-sans antialiased">
      <Navbar
        onSelectPatient={handleOpenPatientDetail}
        onNavigateHome={() => setCurrentTab('dashboard')}
        onOpenNewVisit={(patient) => handleOpenNewVisit(patient)}
        onOpenPaymentForPatient={handleOpenPaymentForPatient}
      />

      <div className="flex-1 flex flex-col md:flex-row">
        <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />

        <main className="flex-1 p-3 sm:p-6 lg:p-8 pb-24 md:pb-8 max-w-7xl mx-auto w-full flex flex-col justify-between">
          <div>
            {TAB_TO_FEATURE_KEY[currentTab] && !isFeatureAccessible(TAB_TO_FEATURE_KEY[currentTab]) ? (
              <div className="bg-white rounded-2xl border border-amber-200 shadow-xs p-8 text-center max-w-xl mx-auto my-12">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4 text-amber-600">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Module Access Restricted</h2>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  {getFeatureStatusReason(TAB_TO_FEATURE_KEY[currentTab]) ||
                    'This module is currently unavailable for your role or subscription package.'}
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentTab('dashboard')}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Return to Dashboard
                  </button>
                  {user.role === 'developer' && (
                    <button
                      type="button"
                      onClick={() => setCurrentTab('developer-profile')}
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                    >
                      Open Developer Control Center
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
            {currentTab === 'dashboard' && (
              <DashboardPage
                refreshKey={refreshKey}
                onNavigate={navigateToTab}
                onSelectPatient={handleOpenPatientDetail}
                onOpenPaymentForPatient={handleOpenPaymentForPatient}
                onOpenRecordPayment={handleOpenRecordPayment}
                onOpenNewPatient={() => {
                  setPatientToEdit(null);
                  setPatientModalOpen(true);
                }}
                onOpenNewVisit={(patient) => handleOpenNewVisit(patient)}
              />
            )}

            {(currentTab === 'patients' || currentTab === 'my-patients') && (
              <PatientsPage
                key={currentTab}
                refreshKey={refreshKey}
                mode={currentTab === 'my-patients' ? 'own' : 'central'}
                onSelectPatient={handleOpenPatientDetail}
                onOpenNewPatientModal={() => {
                  setPatientToEdit(null);
                  setPatientModalOpen(true);
                }}
                onOpenNewVisitForPatient={(patient) => handleOpenNewVisit(patient)}
                onOpenPaymentForPatient={handleOpenPaymentForPatient}
              />
            )}

            {currentTab === 'patient-detail' && selectedPatientId && (
              <PatientDetailPage
                key={selectedPatientId}
                patientId={selectedPatientId}
                refreshKey={refreshKey}
                onBack={() => setCurrentTab('patients')}
                onOpenNewVisit={(patient) => handleOpenNewVisit(patient)}
                onOpenRecordPayment={handleOpenRecordPayment}
                onOpenAddTreatment={handleOpenAddTreatment}
                onOpenAddTest={handleOpenAddTest}
                onOpenEditPatient={(p) => {
                  setPatientToEdit(p);
                  setPatientModalOpen(true);
                }}
                onOpenCreatePrescription={handleOpenCreatePrescription}
                onPreviewPrescription={handleOpenPreviewPrescription}
                onEditDraftPrescription={handleOpenEditDraftPrescription}
                onClonedPrescription={handleOpenEditDraftPrescription}
              />
            )}

            {currentTab === 'visits' && (
              <VisitsPage
                refreshKey={refreshKey}
                onSelectPatient={handleOpenPatientDetail}
                onSelectVisit={(visitId, patientId) => {
                  if (patientId) handleOpenPatientDetail(patientId);
                }}
                onOpenNewVisit={() => handleOpenNewVisit()}
                onOpenRecordPayment={handleOpenRecordPayment}
                onOpenCreatePrescription={(pId, vId) => handleOpenCreatePrescription(pId, vId)}
              />
            )}

            {currentTab === 'prescriptions' && (
              <PrescriptionsPage
                refreshKey={refreshKey}
                onSelectPatient={handleOpenPatientDetail}
                onOpenCreatePrescription={() => handleOpenCreatePrescription()}
                onPreviewPrescription={handleOpenPreviewPrescription}
                onEditDraftPrescription={handleOpenEditDraftPrescription}
                onClonedPrescription={handleOpenEditDraftPrescription}
              />
            )}

            {currentTab === 'payments' && (
              <PaymentsPage
                refreshKey={refreshKey}
                onSelectPatient={handleOpenPatientDetail}
                onOpenRecordPayment={handleOpenRecordPayment}
              />
            )}

            {currentTab === 'followups' && (
              <FollowUpsPage
                key={refreshKey}
                onSelectPatient={handleOpenPatientDetail}
              />
            )}

            {currentTab === 'doctors' && (
              <DoctorsPage refreshKey={refreshKey} onOpenDoctorModal={handleOpenDoctorModal} />
            )}

            {currentTab === 'salary-sheet' && <SalarySheetPage key={refreshKey} />}

            {currentTab === 'exports' && <ExportsPage />}

            {currentTab === 'audit-logs' && <AuditLogsPage key={refreshKey} />}

            {currentTab === 'settings' && <SettingsPage key={refreshKey} />}

            {currentTab === 'developer-profile' && <DeveloperProfilePage />}
              </>
            )}
          </div>

          <footer className="mt-10 pt-4 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              <strong className="text-slate-700">Dental Care</strong> · Centralized Clinic &amp; Multi-Doctor Management Portal
            </span>
            <span>
              Lead Developer: <strong className="text-teal-700">Aymon</strong>
            </span>
          </footer>
        </main>
      </div>

      {/* Global Modals */}
      <PatientModal
        isOpen={patientModalOpen}
        onClose={() => setPatientModalOpen(false)}
        patientToEdit={patientToEdit}
        onSaved={(patient) => {
          setRefreshKey((k) => k + 1);
          handleOpenPatientDetail(patient.id);
        }}
        onSavedAndCreatePrescription={(patient) => {
          setRefreshKey((k) => k + 1);
          handleOpenPatientDetail(patient.id);
          handleOpenCreatePrescription(patient.id);
        }}
      />

      <NewVisitModal
        isOpen={visitModalOpen}
        onClose={() => setVisitModalOpen(false)}
        defaultPatient={visitDefaultPatient}
        onVisitCreated={(v) => {
          setRefreshKey((k) => k + 1);
          if (v.patientId) {
            handleOpenPatientDetail(v.patientId);
          }
        }}
      />

      {paymentVisit && (
        <RecordPaymentModal
          isOpen={paymentModalOpen}
          onClose={() => {
            setPaymentModalOpen(false);
            setPaymentVisit(null);
            setPaymentInitialMode('payment');
          }}
          visit={paymentVisit}
          initialMode={paymentInitialMode}
          onPaymentRecorded={() => {
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {treatmentVisitTarget && (
        <AddTreatmentModal
          isOpen={treatmentModalOpen}
          onClose={() => {
            setTreatmentModalOpen(false);
            setTreatmentVisitTarget(null);
          }}
          visitId={treatmentVisitTarget.id}
          visitCode={treatmentVisitTarget.code}
          onAdded={() => {
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {testVisitTarget && (
        <AddTestModal
          isOpen={testModalOpen}
          onClose={() => {
            setTestModalOpen(false);
            setTestVisitTarget(null);
          }}
          visitId={testVisitTarget.id}
          visitCode={testVisitTarget.code}
          onAdded={() => {
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      <DoctorModal
        isOpen={doctorModalOpen}
        onClose={() => {
          setDoctorModalOpen(false);
          setDoctorToEdit(null);
        }}
        doctorToEdit={doctorToEdit}
        onSaved={() => {
          setRefreshKey((k) => k + 1);
        }}
      />

      {prescriptionManagementEnabled && (
        <>
          <PrescriptionFormModal
            isOpen={rxFormOpen}
            onClose={() => {
              setRxFormOpen(false);
              setRxToEdit(null);
              setRxFormPatientId(null);
              setRxFormVisitId(null);
            }}
            patientId={rxFormPatientId}
            defaultVisitId={rxFormVisitId}
            editingPrescription={rxToEdit}
            onSaved={(savedRx, openPreview) => {
              setRxFormOpen(false);
              setRxToEdit(null);
              setRefreshKey((k) => k + 1);
              if (openPreview) {
                setRxPreviewId(savedRx.id);
                setRxPreviewOpen(true);
              }
            }}
          />

          <PrescriptionPreviewModal
            isOpen={rxPreviewOpen}
            prescriptionId={rxPreviewId}
            onClose={() => {
              setRxPreviewOpen(false);
              setRxPreviewId(null);
            }}
            onEditDraft={(rx) => handleOpenEditDraftPrescription(rx)}
            onCreatedNewDraft={(newDraft) => {
              setRefreshKey((k) => k + 1);
              handleOpenEditDraftPrescription(newDraft);
            }}
            onUpdated={() => {
              setRefreshKey((k) => k + 1);
            }}
          />
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
