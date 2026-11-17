import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import {
  CatalogMedicine,
  DoctorClinicalHeading,
  Patient,
  PatientDetailedProfile,
  Prescription,
  PrescriptionAdvisedTestItem,
  PrescriptionCustomSection,
  PrescriptionMedicine,
  PrescriptionTreatmentPlanItem,
  User,
} from '../types/index.ts';
import {
  BANGLA_CARE_CATEGORIES,
  formatBanglaDate,
  RxFieldLang,
  PAIN_NOTE_BY_LANG,
  parseAdditionalNotes,
  buildAdditionalNotes,
  convertAdditionalNotesLang,
  autoFormatDuration,
  handleLiveDurationInput,
  toBanglaDigits,
} from '../utils/prescriptionPdf.ts';
import { formatDateDDMMYYYY } from '../utils/dateFormat.ts';
import {
  X,
  Plus,
  Trash2,
  Pill,
  Stethoscope,
  User as UserIcon,
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
  Check,
  Globe,
  Eye,
  Save,
  Sparkles,
  Search,
  ShieldAlert,
  Loader2,
  ChevronDown,
  ClipboardList,
  Radio,
  ArrowUp,
  ArrowDown,
  BookmarkCheck,
  History,
  RotateCcw,
} from 'lucide-react';

interface PrescriptionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId?: number | null;
  defaultVisitId?: number | null;
  editingPrescription?: Prescription | null;
  onSaved: (rx: Prescription, openPreview?: boolean) => void;
}

const emptyMedicine = (): PrescriptionMedicine => ({
  medicineId: null,
  medicineName: '',
  genericName: '',
  strength: '',
  dosageType: '',
  manufacturer: '',
  packageMark: '',
  dosage: '',
  frequency: '',
  duration: '',
  mealInstructions: '',
  additionalNotes: '',
});

const FREQUENCY_HELPERS = ['1+0+1', '1+1+1', '1+0+0', '0+0+1', 'দিনে ৩ বার', 'দিনে ২ বার', 'প্রয়োজনে'];

const MEAL_OPTIONS = [
  'Before meal',
  'After Meal',
  'খাবার আগে',
  'খাবার পরে',
  'খাবার ৩০ মিনিট আগে',
];

const QUICK_TREATMENT_PLAN_PRESETS = [
  { treatmentName: 'Dental Examination & Consultation', cost: '500' },
  { treatmentName: 'Composite Dental Filling', cost: '1500' },
  { treatmentName: 'Root Canal Treatment (RCT - Molar)', cost: '5000' },
  { treatmentName: 'Root Canal Treatment (RCT - Anterior)', cost: '3500' },
  { treatmentName: 'Tooth Extraction (Simple)', cost: '1200' },
  { treatmentName: 'Surgical Disimpaction (Wisdom Tooth)', cost: '6000' },
  { treatmentName: 'Ultrasonic Scaling & Polishing', cost: '2000' },
  { treatmentName: 'Porcelain Fused to Metal (PFM) Crown', cost: '4500' },
  { treatmentName: 'All-Ceramic Zirconia Crown', cost: '8500' },
];

const QUICK_ADVISED_TEST_PRESETS = [
  { testName: 'Intraoral Periapical Radiograph (IOPA)', category: 'IOPA', cost: '' },
  { testName: 'Orthopantomogram (OPG - Full Panoramic)', category: 'OPG', cost: '' },
  { testName: 'Cone Beam CT (CBCT - Single Jaw)', category: 'CBCT', cost: '' },
  { testName: 'Bite-wing Radiograph (Left/Right)', category: 'Dental X-ray', cost: '' },
  { testName: 'Random Blood Sugar (RBS) Test', category: 'Lab / Blood', cost: '' },
];

const emptyTreatmentPlanItem = (): PrescriptionTreatmentPlanItem => ({
  treatmentName: '',
  toothNumber: '',
  cost: '',
  notes: '',
});

const emptyAdvisedTestItem = (): PrescriptionAdvisedTestItem => ({
  testName: '',
  category: 'Dental X-ray',
  cost: '',
  notes: '',
});

const PERSONALIZED_HEADING_PRESETS = [
  'History',
  'On Examinations',
  'Investigations',
  'Past Medical History',
  'Drug / Allergy History',
  'Differential Diagnosis',
  'Provisional Diagnosis',
  'Clinical Advice',
];

const BANGLA_DENTAL_PRESETS: Record<string, string> = {
  oralHygieneInstructions:
    'প্রতিবার খাবারের পর কুসুম গরম লবণ পানি দিয়ে আলতোভাবে কুলকুচি করুন এবং মুখ পরিষ্কার রাখুন।',
  toothBrushingInstructions:
    'নরম ব্রাশ দিয়ে দিনে দুবার (সকাল ও রাতে) হালকাভাবে দাঁত ব্রাশ করুন; চিকিৎসা করা স্থানে অতিরিক্ত চাপ দেবেন না।',
  mouthwashRecommendations:
    'ক্লোরহেক্সিডিন ০.২% মাউথওয়াশ (১০ মি.লি.) দিয়ে ব্রাশ করার ৩০ মিনিট পর দিনে ২ বার ৩০ সেকেন্ড কুলকুচি করে ফেলে দিন (৭ দিন)।',
  postExtractionInstructions:
    'তুলা বা গজ ৪৫ মিনিট কামড়ে ধরে রাখুন। প্রথম ২৪ ঘণ্টা থুথু ফেলবেন না, জোরে কুলকুচি করবেন না এবং স্ট্র ব্যবহার করবেন না। ফোলা কমাতে বাইরে থেকে বরফ সেঁক দিন।',
  postTreatmentPrecautions:
    'অবশ ভাব থাকা অবস্থায় আক্রান্ত পাশে চিবাবেন না বা গরম খাবার খাবেন না। তীব্র ব্যথা বা অতিরিক্ত ফোলা দেখা দিলে দ্রুত ক্লিনিকে যোগাযোগ করুন।',
  dietaryRecommendations:
    'প্রথম ২৪–৪৮ ঘণ্টা নরম, ঠান্ডা বা স্বাভাবিক তাপমাত্রার খাবার খান। শক্ত, আঠালো, ঝাল ও অতিরিক্ত গরম খাবার এড়িয়ে চলুন।',
  additionalClinicalAdvice:
    'অ্যান্টিবায়োটিকের সম্পূর্ণ কোর্স সময়মতো শেষ করুন এবং নির্ধারিত তারিখে ফলো-আপের জন্য উপস্থিত হোন।',
};

export const PrescriptionFormModal: React.FC<PrescriptionFormModalProps> = ({
  isOpen,
  onClose,
  patientId,
  defaultVisitId,
  editingPrescription,
  onSaved,
}) => {
  const { user } = useAuth();
  const isSuper = user?.role === 'main_doctor' || user?.role === 'developer';

  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(
    editingPrescription?.patientId || patientId || null
  );
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [patientSearchResults, setPatientSearchResults] = useState<Patient[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);

  const [patientProfile, setPatientProfile] = useState<PatientDetailedProfile | null>(null);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [clinicSettings, setClinicSettings] = useState<Record<string, string>>({});
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Clinical Form Fields (English clinical labels)
  const [visitId, setVisitId] = useState<number | 'auto' | ''>('auto');
  const userChangedVisitRef = useRef(false);
  const [doctorId, setDoctorId] = useState<number>(user?.id || 0);
  const [prescriptionDate, setPrescriptionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [chiefComplaints, setChiefComplaints] = useState('');
  const [clinicalFindings, setClinicalFindings] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  // Patient Past / Disease / Allergy History (synced back to centralized Patient Profile)
  const [patientExistingDiseases, setPatientExistingDiseases] = useState('');
  const [patientAllergies, setPatientAllergies] = useState('');
  const [patientMedicalHistory, setPatientMedicalHistory] = useState('');
  const [syncToPatientRecords, setSyncToPatientRecords] = useState<boolean>(true);

  // Dynamic Medicines + Smart Local Catalog Autocomplete
  const [medicines, setMedicines] = useState<PrescriptionMedicine[]>([emptyMedicine()]);
  const [activeMedIdx, setActiveMedIdx] = useState<number | null>(null);
  const [medResults, setMedResults] = useState<CatalogMedicine[]>([]);
  const [medTotalCount, setMedTotalCount] = useState(0);
  const [medHasMore, setMedHasMore] = useState(false);
  const [searchingMeds, setSearchingMeds] = useState(false);
  const [loadingMoreMeds, setLoadingMoreMeds] = useState(false);
  const [highlightedSugIdx, setHighlightedSugIdx] = useState<number>(-1);
  const [activeMedQuery, setActiveMedQuery] = useState('');
  const medSearchTimerRef = useRef<any>(null);

  // Optional Treatment Plan Items & Advised Diagnostic Tests (with optional cost)
  const [treatmentPlanItems, setTreatmentPlanItems] = useState<PrescriptionTreatmentPlanItem[]>([]);
  const [advisedTests, setAdvisedTests] = useState<PrescriptionAdvisedTestItem[]>([]);
  const [showPlanCosts, setShowPlanCosts] = useState<boolean>(true);
  const [showOptionalSections, setShowOptionalSections] = useState<boolean>(true);

  // Personalized Doctor Clinical Headings (History, On Examinations, Investigations, etc.)
  const [customSections, setCustomSections] = useState<PrescriptionCustomSection[]>([]);
  const [savedDoctorHeadings, setSavedDoctorHeadings] = useState<DoctorClinicalHeading[]>([]);
  const [newHeadingInput, setNewHeadingInput] = useState('');
  const [savingHeadings, setSavingHeadings] = useState(false);
  const [headingsNotice, setHeadingsNotice] = useState<string | null>(null);

  // Bangla Care Instructions Fields
  const [oralHygieneInstructions, setOralHygieneInstructions] = useState('');
  const [toothBrushingInstructions, setToothBrushingInstructions] = useState('');
  const [mouthwashRecommendations, setMouthwashRecommendations] = useState('');
  const [postExtractionInstructions, setPostExtractionInstructions] = useState('');
  const [postTreatmentPrecautions, setPostTreatmentPrecautions] = useState('');
  const [dietaryRecommendations, setDietaryRecommendations] = useState('');
  const [additionalClinicalAdvice, setAdditionalClinicalAdvice] = useState('');

  // Submission states
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string>('');

  // Language mode for Duration & Additional Instructions ('bn' | 'en' | 'bilingual')
  const [rxFieldLang, setRxFieldLang] = useState<RxFieldLang>('bn');
  const [rowLangs, setRowLangs] = useState<Record<number, RxFieldLang>>({});
  const durationInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [openMealDropdownIdx, setOpenMealDropdownIdx] = useState<number | null>(null);
  const mealInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Previous Prescriptions & Patient History Loader (Optional for returning patients)
  const [previousPrescriptions, setPreviousPrescriptions] = useState<Prescription[]>([]);
  const [selectedPrevSourceId, setSelectedPrevSourceId] = useState<string>('latest_combined');
  const [showPrevHistorySelector, setShowPrevHistorySelector] = useState<boolean>(false);
  const [prevLoadMode, setPrevLoadMode] = useState<'replace' | 'append'>('replace');
  const [prevHistoryNotice, setPrevHistoryNotice] = useState<string | null>(null);
  const [prevHistoryChecks, setPrevHistoryChecks] = useState({
    pastHistoryDiseasesAllergies: true,
    previousComplaints: true,
    previousClinicalFindings: true,
    previousCustomHistoryHeadings: true,
    previousDiagnosisAndPlan: true,
    previousPlannedTreatmentsAndTests: false,
    previousMedicines: false,
  });

  useEffect(() => {
    if (!isOpen) return;

    idempotencyKeyRef.current = `rx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    userChangedVisitRef.current = false;
    setError(null);
    setActiveMedIdx(null);
    setOpenMealDropdownIdx(null);
    setMedResults([]);

    api.getSettings().then(setClinicSettings).catch(() => {});
    if (isSuper) {
      api.getDoctors().then(setDoctors).catch(() => {});
    }

    if (editingPrescription) {
      setSelectedPatientId(editingPrescription.patientId);
      setVisitId(editingPrescription.visitId);
      setDoctorId(editingPrescription.doctorId);
      setPrescriptionDate(
        editingPrescription.prescriptionDate || new Date().toISOString().split('T')[0]
      );
      setChiefComplaints(editingPrescription.chiefComplaints || '');
      setClinicalFindings(editingPrescription.clinicalFindings || '');
      setDiagnosis(editingPrescription.diagnosis || '');
      setTreatmentPlan(editingPrescription.treatmentPlan || '');
      setFollowUpDate(editingPrescription.followUpDate || '');
      setOralHygieneInstructions(editingPrescription.oralHygieneInstructions || '');
      setToothBrushingInstructions(editingPrescription.toothBrushingInstructions || '');
      setMouthwashRecommendations(editingPrescription.mouthwashRecommendations || '');
      setPostExtractionInstructions(editingPrescription.postExtractionInstructions || '');
      setPostTreatmentPrecautions(editingPrescription.postTreatmentPrecautions || '');
      setDietaryRecommendations(editingPrescription.dietaryRecommendations || '');
      setAdditionalClinicalAdvice(editingPrescription.additionalClinicalAdvice || '');
      setMedicines(
        editingPrescription.medicines && editingPrescription.medicines.length > 0
          ? editingPrescription.medicines.map((m) => ({
              medicineId: m.medicineId ?? null,
              medicineName: m.medicineName || '',
              genericName: m.genericName || '',
              strength: m.strength || '',
              dosageType: m.dosageType || '',
              manufacturer: m.manufacturer || '',
              packageMark: m.packageMark || '',
              dosage: m.dosage || '',
              frequency: m.frequency || '',
              duration: m.duration || '',
              mealInstructions: m.mealInstructions || '',
              additionalNotes: m.additionalNotes || '',
            }))
          : [emptyMedicine()]
      );
      const editPlans = (editingPrescription.treatmentPlanItems || []).map((p) => ({
        treatmentName: p.treatmentName || '',
        toothNumber: p.toothNumber || '',
        cost: p.cost !== null && p.cost !== undefined ? String(parseFloat(p.cost)) : '',
        notes: p.notes || '',
      }));
      const editTests = (editingPrescription.advisedTests || []).map((t) => ({
        testName: t.testName || '',
        category: t.category || 'Dental X-ray',
        cost: t.cost !== null && t.cost !== undefined ? String(parseFloat(t.cost)) : '',
        notes: t.notes || '',
      }));
      setTreatmentPlanItems(editPlans);
      setAdvisedTests(editTests);
      setShowPlanCosts(editingPrescription.showPlanCosts !== false);
      setSyncToPatientRecords(editingPrescription.syncToPatientRecords !== false);
      setShowOptionalSections(true);
      setPatientExistingDiseases(editingPrescription.patientExistingDiseases || '');
      setPatientAllergies(editingPrescription.patientAllergies || '');
      setPatientMedicalHistory(editingPrescription.patientMedicalHistory || '');
      setCustomSections(
        (editingPrescription.customSections || []).map((s) => ({
          heading: s.heading || '',
          content: s.content || '',
        }))
      );
      setNewHeadingInput('');
      setHeadingsNotice(null);
    } else {
      setSelectedPatientId(patientId || null);
      setVisitId(defaultVisitId || 'auto');
      setDoctorId(user?.id || 0);
      setPrescriptionDate(new Date().toISOString().split('T')[0]);
      setChiefComplaints('');
      setClinicalFindings('');
      setDiagnosis('');
      setTreatmentPlan('');
      setFollowUpDate('');
      setPatientExistingDiseases('');
      setPatientAllergies('');
      setPatientMedicalHistory('');
      setSyncToPatientRecords(true);
      setOralHygieneInstructions('');
      setToothBrushingInstructions('');
      setMouthwashRecommendations('');
      setPostExtractionInstructions('');
      setPostTreatmentPrecautions('');
      setDietaryRecommendations('');
      setAdditionalClinicalAdvice('');
      setMedicines([emptyMedicine()]);
      setTreatmentPlanItems([]);
      setAdvisedTests([]);
      setShowPlanCosts(true);
      setShowOptionalSections(true);
      setCustomSections([]);
      setNewHeadingInput('');
      setHeadingsNotice(null);
    }
  }, [isOpen, patientId, defaultVisitId, editingPrescription, user?.id]);

  // Load doctor's saved personalized headings when modal opens or doctor changes
  useEffect(() => {
    if (!isOpen) return;
    const targetDocId = editingPrescription
      ? editingPrescription.doctorId
      : isSuper && doctorId
      ? doctorId
      : user?.id;
    if (!targetDocId) return;

    let cancelled = false;
    api
      .getDoctorClinicalHeadings(targetDocId)
      .then((rows) => {
        if (cancelled) return;
        setSavedDoctorHeadings(rows);
        if (!editingPrescription) {
          setCustomSections((prev) => {
            const hasTypedContent = prev.some((s) => s.content.trim().length > 0);
            if (hasTypedContent || prev.length > 0) return prev;
            return rows.map((h) => ({ heading: h.heading, content: '' }));
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isOpen, editingPrescription?.id, doctorId, user?.id, isSuper]);

  // Search patients if opened without preselected patient
  useEffect(() => {
    if (!isOpen || selectedPatientId) return;
    const t = setTimeout(async () => {
      setSearchingPatients(true);
      try {
        const list = await api.getPatients({ search: patientSearchQuery.trim() || undefined });
        setPatientSearchResults(list.slice(0, 8));
      } catch {
      } finally {
        setSearchingPatients(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [isOpen, selectedPatientId, patientSearchQuery]);

  // Load full patient profile, visits & previous prescriptions when patient selected
  useEffect(() => {
    if (!isOpen || !selectedPatientId) {
      setPatientProfile(null);
      setPreviousPrescriptions([]);
      setPrevHistoryNotice(null);
      return;
    }

    let cancelled = false;
    userChangedVisitRef.current = false;
    setLoadingProfile(true);
    setPrevHistoryNotice(null);

    Promise.all([
      api.getPatient(selectedPatientId),
      api.getPrescriptions({ patientId: selectedPatientId }).catch(() => [] as Prescription[]),
    ])
      .then(([profile, rxList]) => {
        if (cancelled) return;
        setPatientProfile(profile);

        // Exclude the currently edited prescription if in edit mode
        const filteredPrevRx = (rxList || []).filter((r) =>
          editingPrescription ? r.id !== editingPrescription.id : true
        );
        setPreviousPrescriptions(filteredPrevRx);
        setSelectedPrevSourceId(
          filteredPrevRx.length > 0 ? String(filteredPrevRx[0].id) : 'latest_combined'
        );

        if (!editingPrescription && !userChangedVisitRef.current) {
          const explicitVisit =
            defaultVisitId && profile.visits.length > 0
              ? profile.visits.find((v) => v.id === defaultVisitId)
              : null;

          if (explicitVisit) {
            setVisitId(explicitVisit.id);
            setChiefComplaints((prev) => prev || explicitVisit.complaints || '');
            setDiagnosis((prev) => prev || explicitVisit.diagnosis || '');
            setFollowUpDate((prev) => prev || explicitVisit.nextFollowUpDate || '');
          } else {
            // Default every new prescription to auto-create a new clinic visit (VST-#) for clean visit tracking
            setVisitId('auto');
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load patient details');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedPatientId]);

  if (!isOpen) return null;

  const handleVisitChange = (rawValue: string) => {
    userChangedVisitRef.current = true;
    if (!rawValue || rawValue === 'auto') {
      setVisitId(editingPrescription ? '' : 'auto');
      return;
    }
    const newVisitId = parseInt(rawValue, 10);
    if (isNaN(newVisitId)) return;
    setVisitId(newVisitId);
    if (!editingPrescription && patientProfile) {
      const matched = patientProfile.visits.find((v) => v.id === newVisitId);
      if (matched) {
        if (!chiefComplaints.trim()) setChiefComplaints(matched.complaints || '');
        if (!diagnosis.trim()) setDiagnosis(matched.diagnosis || '');
        if (!followUpDate.trim()) setFollowUpDate(matched.nextFollowUpDate || '');
      }
    }
  };

  const syncFromSelectedVisit = () => {
    if (!patientProfile || !visitId || visitId === 'auto') return;
    const matched = patientProfile.visits.find((v) => v.id === Number(visitId));
    if (matched) {
      setChiefComplaints(matched.complaints || '');
      setDiagnosis(matched.diagnosis || '');
      if (matched.nextFollowUpDate) setFollowUpDate(matched.nextFollowUpDate);
    }
  };

  // Resolve available previous history data from the selected previous prescription or combined patient/visit history
  const getResolvedPreviousHistory = () => {
    const specificRx =
      selectedPrevSourceId !== 'latest_combined'
        ? previousPrescriptions.find((r) => String(r.id) === selectedPrevSourceId) ||
          previousPrescriptions[0] ||
          null
        : previousPrescriptions[0] || null;

    const firstNonEmptyFromRx = (
      getter: (r: Prescription) => string | null | undefined
    ): string => {
      if (specificRx && selectedPrevSourceId !== 'latest_combined') {
        const val = getter(specificRx);
        if (val && val.trim()) return val.trim();
      }
      for (const r of previousPrescriptions) {
        const val = getter(r);
        if (val && val.trim()) return val.trim();
      }
      return '';
    };

    const firstNonEmptyFromVisits = (
      getter: (v: NonNullable<PatientDetailedProfile['visits']>[number]) => string | null | undefined
    ): string => {
      for (const v of patientProfile?.visits || []) {
        const val = getter(v);
        if (val && val.trim()) return val.trim();
      }
      return '';
    };

    const existingDiseases =
      firstNonEmptyFromRx((r) => r.patientExistingDiseases) ||
      patientProfile?.existingDiseases?.trim() ||
      '';
    const allergies =
      firstNonEmptyFromRx((r) => r.patientAllergies) ||
      patientProfile?.allergies?.trim() ||
      '';
    const medicalHistory =
      firstNonEmptyFromRx((r) => r.patientMedicalHistory) ||
      patientProfile?.medicalHistory?.trim() ||
      '';

    const prevComplaints =
      (specificRx && selectedPrevSourceId !== 'latest_combined'
        ? specificRx.chiefComplaints?.trim()
        : '') ||
      firstNonEmptyFromRx((r) => r.chiefComplaints) ||
      firstNonEmptyFromVisits((v) => v.complaints) ||
      '';

    const prevClinicalFindings =
      (specificRx && selectedPrevSourceId !== 'latest_combined'
        ? specificRx.clinicalFindings?.trim()
        : '') ||
      firstNonEmptyFromRx((r) => r.clinicalFindings) ||
      '';

    const prevDiagnosis =
      (specificRx && selectedPrevSourceId !== 'latest_combined'
        ? specificRx.diagnosis?.trim()
        : '') ||
      firstNonEmptyFromRx((r) => r.diagnosis) ||
      firstNonEmptyFromVisits((v) => v.diagnosis) ||
      '';

    const prevTreatmentPlan =
      (specificRx && selectedPrevSourceId !== 'latest_combined'
        ? specificRx.treatmentPlan?.trim()
        : '') ||
      firstNonEmptyFromRx((r) => r.treatmentPlan) ||
      '';

    const prevCustomSections =
      (specificRx?.customSections && specificRx.customSections.length > 0
        ? specificRx.customSections
        : previousPrescriptions.find((r) => (r.customSections?.length || 0) > 0)
            ?.customSections) || [];

    const prevPlanItems = specificRx?.treatmentPlanItems || [];
    const prevTests = specificRx?.advisedTests || [];
    const prevMeds = specificRx?.medicines || [];

    const hasPastDiseaseOrAllergy = Boolean(
      existingDiseases || allergies || medicalHistory
    );
    const hasAnyPreviousData = Boolean(
      hasPastDiseaseOrAllergy ||
        prevComplaints ||
        prevClinicalFindings ||
        prevDiagnosis ||
        prevTreatmentPlan ||
        prevCustomSections.length > 0 ||
        prevPlanItems.length > 0 ||
        prevTests.length > 0 ||
        prevMeds.length > 0 ||
        previousPrescriptions.length > 0 ||
        (patientProfile?.visits?.length || 0) > 0
    );

    const sourceLabel = specificRx
      ? `${specificRx.prescriptionNumber} (${formatDateDDMMYYYY(specificRx.prescriptionDate)})`
      : 'Previous Patient & Visit Records';

    return {
      specificRx,
      sourceLabel,
      hasAnyPreviousData,
      hasPastDiseaseOrAllergy,
      existingDiseases,
      allergies,
      medicalHistory,
      prevComplaints,
      prevClinicalFindings,
      prevDiagnosis,
      prevTreatmentPlan,
      prevCustomSections,
      prevPlanItems,
      prevTests,
      prevMeds,
    };
  };

  const mergeTextValue = (current: string, incoming: string, mode: 'replace' | 'append'): string => {
    const cleanInc = incoming.trim();
    if (!cleanInc) return current;
    const cleanCur = current.trim();
    if (mode === 'replace' || !cleanCur) return cleanInc;
    if (cleanCur.toLowerCase().includes(cleanInc.toLowerCase())) return cleanCur;
    return `${cleanCur}; ${cleanInc}`;
  };

  const applyPreviousHistories = (options: {
    pastHistoryDiseasesAllergies?: boolean;
    previousComplaints?: boolean;
    previousClinicalFindings?: boolean;
    previousCustomHistoryHeadings?: boolean;
    previousDiagnosisAndPlan?: boolean;
    previousPlannedTreatmentsAndTests?: boolean;
    previousMedicines?: boolean;
  }) => {
    const resolved = getResolvedPreviousHistory();
    const loadedParts: string[] = [];

    if (options.pastHistoryDiseasesAllergies && resolved.hasPastDiseaseOrAllergy) {
      if (resolved.existingDiseases) {
        setPatientExistingDiseases((prev) =>
          mergeTextValue(prev, resolved.existingDiseases, prevLoadMode)
        );
      }
      if (resolved.allergies) {
        setPatientAllergies((prev) => mergeTextValue(prev, resolved.allergies, prevLoadMode));
      }
      if (resolved.medicalHistory) {
        setPatientMedicalHistory((prev) =>
          mergeTextValue(prev, resolved.medicalHistory, prevLoadMode)
        );
      }
      loadedParts.push('Past History, Diseases & Allergies');
    }

    if (options.previousComplaints && resolved.prevComplaints) {
      setChiefComplaints((prev) => mergeTextValue(prev, resolved.prevComplaints, prevLoadMode));
      loadedParts.push('Previous Complaints');
    }

    if (options.previousClinicalFindings && resolved.prevClinicalFindings) {
      setClinicalFindings((prev) =>
        mergeTextValue(prev, resolved.prevClinicalFindings, prevLoadMode)
      );
      loadedParts.push('Clinical Findings');
    }

    if (options.previousCustomHistoryHeadings && resolved.prevCustomSections.length > 0) {
      setCustomSections((prev) => {
        const next = [...prev];
        for (const incomingSec of resolved.prevCustomSections) {
          const h = (incomingSec.heading || '').trim();
          const c = (incomingSec.content || '').trim();
          if (!h || !c) continue;
          const idx = next.findIndex((s) => s.heading.trim().toLowerCase() === h.toLowerCase());
          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              content: mergeTextValue(next[idx].content, c, prevLoadMode),
            };
          } else {
            next.push({ heading: h, content: c });
          }
        }
        return next;
      });
      loadedParts.push('Previous Custom History Headings');
    }

    if (options.previousDiagnosisAndPlan) {
      if (resolved.prevDiagnosis) {
        setDiagnosis((prev) => mergeTextValue(prev, resolved.prevDiagnosis, prevLoadMode));
      }
      if (resolved.prevTreatmentPlan) {
        setTreatmentPlan((prev) => mergeTextValue(prev, resolved.prevTreatmentPlan, prevLoadMode));
      }
      if (resolved.prevDiagnosis || resolved.prevTreatmentPlan) {
        loadedParts.push('Previous Diagnosis & Plan');
      }
    }

    if (options.previousPlannedTreatmentsAndTests) {
      if (resolved.prevPlanItems.length > 0) {
        setShowOptionalSections(true);
        setTreatmentPlanItems(
          resolved.prevPlanItems.map((p) => ({
            treatmentName: p.treatmentName || '',
            toothNumber: p.toothNumber || '',
            cost: p.cost !== null && p.cost !== undefined ? String(parseFloat(p.cost)) : '',
            notes: p.notes || '',
          }))
        );
      }
      if (resolved.prevTests.length > 0) {
        setShowOptionalSections(true);
        setAdvisedTests(
          resolved.prevTests.map((t) => ({
            testName: t.testName || '',
            category: t.category || 'Dental X-ray',
            cost: t.cost !== null && t.cost !== undefined ? String(parseFloat(t.cost)) : '',
            notes: t.notes || '',
          }))
        );
      }
      if (resolved.prevPlanItems.length > 0 || resolved.prevTests.length > 0) {
        loadedParts.push('Planned Treatments & Tests');
      }
    }

    if (options.previousMedicines && resolved.prevMeds.length > 0) {
      setMedicines(
        resolved.prevMeds.map((m) => ({
          medicineId: m.medicineId ?? null,
          medicineName: m.medicineName || '',
          genericName: m.genericName || '',
          strength: m.strength || '',
          dosageType: m.dosageType || '',
          manufacturer: m.manufacturer || '',
          packageMark: m.packageMark || '',
          dosage: m.dosage || '',
          frequency: m.frequency || '',
          duration: m.duration || '',
          mealInstructions: m.mealInstructions || '',
          additionalNotes: m.additionalNotes || '',
        }))
      );
      loadedParts.push('Previous Medicines');
    }

    if (loadedParts.length > 0) {
      setPrevHistoryNotice(
        `Loaded ${loadedParts.join(', ')} from ${resolved.sourceLabel}.`
      );
    } else {
      setPrevHistoryNotice(
        `No non-empty history fields found for the selected option in ${resolved.sourceLabel}.`
      );
    }
  };

  const handleLoadAllPreviousNecessaryHistories = () => {
    applyPreviousHistories({
      pastHistoryDiseasesAllergies: true,
      previousComplaints: true,
      previousClinicalFindings: true,
      previousCustomHistoryHeadings: true,
      previousDiagnosisAndPlan: true,
      previousPlannedTreatmentsAndTests: false,
      previousMedicines: false,
    });
  };

  const handleClearLoadedHistories = () => {
    setPatientExistingDiseases('');
    setPatientAllergies('');
    setPatientMedicalHistory('');
    setChiefComplaints('');
    setClinicalFindings('');
    setDiagnosis('');
    setTreatmentPlan('');
    setCustomSections((prev) => prev.map((s) => ({ ...s, content: '' })));
    setPrevHistoryNotice('Cleared loaded history fields from this prescription.');
  };

  // 250ms debounced local PostgreSQL medicine catalog autocomplete
  const triggerCatalogSearch = (idx: number, rawQ: string) => {
    setActiveMedIdx(idx);
    setActiveMedQuery(rawQ);
    setHighlightedSugIdx(-1);

    if (medSearchTimerRef.current) clearTimeout(medSearchTimerRef.current);

    if (!rawQ.trim()) {
      // Initial browse of top 10 active products on focus, or clear smoothly
      medSearchTimerRef.current = setTimeout(async () => {
        setSearchingMeds(true);
        try {
          const res = await api.searchMedicines('', 10, 0);
          setMedResults(res.items);
          setMedTotalCount(res.totalCount);
          setMedHasMore(res.hasMore);
        } catch {
          setMedResults([]);
          setMedHasMore(false);
        } finally {
          setSearchingMeds(false);
        }
      }, 150);
      return;
    }

    setSearchingMeds(true);
    medSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.searchMedicines(rawQ.trim(), 10, 0);
        setMedResults(res.items);
        setMedTotalCount(res.totalCount);
        setMedHasMore(res.hasMore);
        setHighlightedSugIdx(res.items.length > 0 ? 0 : -1);
      } catch {
        setMedResults([]);
        setMedTotalCount(0);
        setMedHasMore(false);
      } finally {
        setSearchingMeds(false);
      }
    }, 250);
  };

  const handleLoadMoreCatalog = async () => {
    if (loadingMoreMeds || !medHasMore) return;
    setLoadingMoreMeds(true);
    try {
      const res = await api.searchMedicines(activeMedQuery.trim(), 10, medResults.length);
      setMedResults((prev) => [...prev, ...res.items]);
      setMedTotalCount(res.totalCount);
      setMedHasMore(res.hasMore);
    } catch {
    } finally {
      setLoadingMoreMeds(false);
    }
  };

  const updateMedicineField = (
    idx: number,
    field: keyof PrescriptionMedicine,
    val: string
  ) => {
    setMedicines((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m;
        // If doctor manually edits the medicine name, detach catalog link so custom name isn't misattributed
        if (field === 'medicineName') {
          return { ...m, medicineName: val, medicineId: null };
        }
        return { ...m, [field]: val };
      })
    );
  };

  const getRowLang = (idx: number): RxFieldLang => rowLangs[idx] || rxFieldLang;

  const setRowLanguage = (idx: number, lang: RxFieldLang) => {
    setRowLangs((prev) => ({ ...prev, [idx]: lang }));
    setMedicines((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m;
        return {
          ...m,
          duration: m.duration?.trim() ? autoFormatDuration(m.duration, lang) : m.duration,
          additionalNotes: m.additionalNotes?.trim()
            ? convertAdditionalNotesLang(m.additionalNotes, lang)
            : m.additionalNotes,
        };
      })
    );
  };

  const setGlobalLanguage = (lang: RxFieldLang) => {
    setRxFieldLang(lang);
    setRowLangs({});
    setMedicines((prev) =>
      prev.map((m) => ({
        ...m,
        duration: m.duration?.trim() ? autoFormatDuration(m.duration, lang) : m.duration,
        additionalNotes: m.additionalNotes?.trim()
          ? convertAdditionalNotesLang(m.additionalNotes, lang)
          : m.additionalNotes,
      }))
    );
  };

  const handleDurationChange = (idx: number, rawVal: string) => {
    const lang = getRowLang(idx);
    const prevVal = medicines[idx]?.duration || '';
    const { value, cursorIndex } = handleLiveDurationInput(rawVal, prevVal, lang);
    updateMedicineField(idx, 'duration', value);
    if (cursorIndex !== null) {
      requestAnimationFrame(() => {
        const inputEl = durationInputRefs.current[idx];
        if (inputEl && document.activeElement === inputEl) {
          inputEl.setSelectionRange(cursorIndex, cursorIndex);
        }
      });
    }
  };

  const handleDurationBlur = (idx: number) => {
    const lang = getRowLang(idx);
    const cur = medicines[idx]?.duration || '';
    if (!cur.trim()) return;
    const formatted = autoFormatDuration(cur, lang);
    if (formatted !== cur) {
      updateMedicineField(idx, 'duration', formatted);
    }
  };

  const togglePainInstruction = (idx: number) => {
    const lang = getRowLang(idx);
    const cur = medicines[idx]?.additionalNotes || '';
    const { hasPainNote, customNote } = parseAdditionalNotes(cur);
    const updated = buildAdditionalNotes(!hasPainNote, customNote, lang);
    updateMedicineField(idx, 'additionalNotes', updated);
  };

  const handleCustomNoteInput = (idx: number, newCustomText: string) => {
    const lang = getRowLang(idx);
    const cur = medicines[idx]?.additionalNotes || '';
    const { hasPainNote } = parseAdditionalNotes(cur);
    const convertedText = lang === 'bn' ? toBanglaDigits(newCustomText) : newCustomText;
    const updated = buildAdditionalNotes(hasPainNote, convertedText, lang);
    updateMedicineField(idx, 'additionalNotes', updated);
  };

  // Fill catalog metadata ONLY — never auto-prescribe dosage, frequency, duration, or instructions!
  const applyCatalogSelection = (idx: number, item: CatalogMedicine) => {
    setMedicines((prev) =>
      prev.map((m, i) =>
        i === idx
          ? {
              ...m,
              medicineId: item.id,
              medicineName: item.brandName,
              genericName: item.genericName || '',
              strength: item.strength || '',
              dosageType: item.dosageType || '',
              manufacturer: item.manufacturer || '',
              packageMark: item.packageMark || '',
            }
          : m
      )
    );
    setActiveMedIdx(null);
    setHighlightedSugIdx(-1);
  };

  const handleMedKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (activeMedIdx !== idx) return;

    if (e.key === 'ArrowDown') {
      if (medResults.length > 0) {
        e.preventDefault();
        setHighlightedSugIdx((prev) => (prev + 1) % medResults.length);
      }
    } else if (e.key === 'ArrowUp') {
      if (medResults.length > 0) {
        e.preventDefault();
        setHighlightedSugIdx((prev) => (prev <= 0 ? medResults.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter' && highlightedSugIdx >= 0 && medResults[highlightedSugIdx]) {
      e.preventDefault();
      applyCatalogSelection(idx, medResults[highlightedSugIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setActiveMedIdx(null);
      setHighlightedSugIdx(-1);
    }
  };

  const addMedicineRow = () => {
    setMedicines((prev) => [...prev, emptyMedicine()]);
  };

  const removeMedicineRow = (idx: number) => {
    setMedicines((prev) => (prev.length === 1 ? [emptyMedicine()] : prev.filter((_, i) => i !== idx)));
  };

  const activeDoctorObj = isSuper ? doctors.find((d) => d.id === doctorId) || user : user;

  const careStateMap = {
    oralHygieneInstructions: { val: oralHygieneInstructions, setter: setOralHygieneInstructions },
    toothBrushingInstructions: { val: toothBrushingInstructions, setter: setToothBrushingInstructions },
    mouthwashRecommendations: { val: mouthwashRecommendations, setter: setMouthwashRecommendations },
    postExtractionInstructions: { val: postExtractionInstructions, setter: setPostExtractionInstructions },
    postTreatmentPrecautions: { val: postTreatmentPrecautions, setter: setPostTreatmentPrecautions },
    dietaryRecommendations: { val: dietaryRecommendations, setter: setDietaryRecommendations },
    additionalClinicalAdvice: { val: additionalClinicalAdvice, setter: setAdditionalClinicalAdvice },
  };

  const addCustomHeadingRow = (headingLabel: string) => {
    const clean = headingLabel.trim();
    if (!clean) return;
    setCustomSections((prev) => {
      const exists = prev.some((s) => s.heading.trim().toLowerCase() === clean.toLowerCase());
      if (exists) return prev;
      return [...prev, { heading: clean, content: '' }];
    });
    setNewHeadingInput('');
    setHeadingsNotice(null);
  };

  const moveCustomSection = (idx: number, direction: -1 | 1) => {
    setCustomSections((prev) => {
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const handleSaveDoctorDefaultHeadings = async () => {
    const validHeadings = customSections
      .map((s) => s.heading.trim())
      .filter(Boolean)
      .map((heading) => ({ heading }));

    setSavingHeadings(true);
    setHeadingsNotice(null);
    setError(null);
    try {
      const targetDocId = isSuper && doctorId ? doctorId : user?.id;
      const res = await api.saveDoctorClinicalHeadings(validHeadings, targetDocId);
      setSavedDoctorHeadings(res.headings);
      setHeadingsNotice(
        res.headings.length > 0
          ? `Saved ${res.headings.length} default heading(s) for future prescriptions.`
          : 'Cleared saved default headings.'
      );
    } catch (err: any) {
      setError(err.message || 'Failed to save default clinical headings');
    } finally {
      setSavingHeadings(false);
    }
  };

  const handleSave = async (mode: 'draft' | 'preview' | 'finalize') => {
    setError(null);

    if (!selectedPatientId) {
      setError('Please select a Patient first.');
      return;
    }

    const effectiveVisitId = editingPrescription
      ? visitId || editingPrescription.visitId
      : visitId || defaultVisitId || 'auto';

    if (editingPrescription && !effectiveVisitId) {
      setError('Please select an Associated Clinic Visit.');
      return;
    }

    const nonEmptyMeds = medicines
      .map((m, idx) => ({
        ...m,
        duration: m.duration?.trim()
          ? autoFormatDuration(m.duration, getRowLang(idx))
          : m.duration || '',
      }))
      .filter(
        (m) =>
          m.medicineName?.trim() ||
          m.genericName?.trim() ||
          m.strength?.trim() ||
          m.dosage?.trim() ||
          m.frequency?.trim() ||
          m.duration?.trim() ||
          m.additionalNotes?.trim()
      );

    for (const m of nonEmptyMeds) {
      if (!m.medicineName || !m.medicineName.trim()) {
        setError('Each entered medicine row must include a Medicine Name.');
        return;
      }
    }

    const nonEmptyPlans = treatmentPlanItems.filter(
      (p) =>
        p.treatmentName?.trim() ||
        p.toothNumber?.trim() ||
        (p.cost !== undefined && p.cost !== null && String(p.cost).trim() !== '') ||
        p.notes?.trim()
    );
    for (const p of nonEmptyPlans) {
      if (!p.treatmentName || !p.treatmentName.trim()) {
        setError('Each entered treatment plan row must include a Treatment Name.');
        return;
      }
      if (p.cost !== undefined && p.cost !== null && String(p.cost).trim() !== '') {
        const c = Number(String(p.cost).trim());
        if (!Number.isFinite(c) || c < 0) {
          setError(`Invalid cost for treatment "${p.treatmentName}".`);
          return;
        }
      }
    }

    const nonEmptyTests = advisedTests.filter(
      (t) =>
        t.testName?.trim() ||
        (t.cost !== undefined && t.cost !== null && String(t.cost).trim() !== '') ||
        t.notes?.trim()
    );
    for (const t of nonEmptyTests) {
      if (!t.testName || !t.testName.trim()) {
        setError('Each entered advised test row must include a Test Name.');
        return;
      }
      if (t.cost !== undefined && t.cost !== null && String(t.cost).trim() !== '') {
        const c = Number(String(t.cost).trim());
        if (!Number.isFinite(c) || c < 0) {
          setError(`Invalid cost for advised test "${t.testName}".`);
          return;
        }
      }
    }

    const nonEmptyCustomSections = customSections
      .filter((s) => s.content?.trim().length > 0)
      .map((s) => ({
        heading: s.heading.trim(),
        content: s.content.trim(),
      }));

    for (const sec of nonEmptyCustomSections) {
      if (!sec.heading) {
        setError('Each filled personalized clinical section must include a Heading title.');
        return;
      }
    }

    if (mode === 'finalize') {
      const hasClinical =
        Boolean(diagnosis.trim()) ||
        Boolean(chiefComplaints.trim()) ||
        Boolean(clinicalFindings.trim()) ||
        Boolean(treatmentPlan.trim()) ||
        nonEmptyCustomSections.length > 0 ||
        nonEmptyMeds.length > 0 ||
        nonEmptyPlans.length > 0 ||
        nonEmptyTests.length > 0;
      if (!hasClinical) {
        setError(
          'Cannot finalize an empty prescription. Add clinical details, personalized headings, planned treatments, advised tests, or at least one medicine.'
        );
        return;
      }
    }

    const payload = {
      patientId: selectedPatientId,
      visitId: effectiveVisitId === 'auto' ? 'auto' : Number(effectiveVisitId),
      doctorId: isSuper ? doctorId : user?.id,
      prescriptionDate,
      status: mode === 'finalize' ? 'Finalized' : 'Draft',
      finalizeNow: mode === 'finalize',
      chiefComplaints,
      clinicalFindings,
      diagnosis,
      treatmentPlan,
      customSections: nonEmptyCustomSections,
      showPlanCosts,
      syncToPatientRecords,
      treatmentPlanItems: nonEmptyPlans,
      advisedTests: nonEmptyTests,
      followUpDate,
      patientExistingDiseases,
      patientAllergies,
      patientMedicalHistory,
      oralHygieneInstructions,
      toothBrushingInstructions,
      mouthwashRecommendations,
      postExtractionInstructions,
      postTreatmentPrecautions,
      dietaryRecommendations,
      additionalClinicalAdvice,
      medicines: nonEmptyMeds,
      idempotencyKey: !editingPrescription ? idempotencyKeyRef.current : undefined,
    };

    setSaving(true);
    try {
      let saved: Prescription;
      if (editingPrescription) {
        saved = await api.updatePrescription(editingPrescription.id, payload);
      } else {
        saved = await api.createPrescription(payload);
      }
      onSaved(saved, mode === 'preview');
    } catch (err: any) {
      setError(err.message || 'Failed to save prescription');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-prescription">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-800 to-slate-900 px-5 sm:px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center font-serif font-bold text-lg">
              &#8478;
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                {editingPrescription
                  ? `Edit Prescription ${editingPrescription.prescriptionNumber}`
                  : 'Create Dental Prescription'}
              </h2>
              <p className="text-xs text-teal-100/90">
                {editingPrescription
                  ? `Status: ${editingPrescription.status} · Revision v${editingPrescription.revisionNumber}`
                  : 'Auto-linked to patient, doctor & visit · Integrated with local Bangladesh medicine catalog'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Patient Picker if opened without preselected patient */}
          {!selectedPatientId && (
            <div className="p-4 rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/40 space-y-3">
              <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Search className="w-4 h-4 text-teal-600" />
                <span>Step 1: Select Patient from Central Clinic Database</span>
              </div>
              <input
                type="text"
                value={patientSearchQuery}
                onChange={(e) => setPatientSearchQuery(e.target.value)}
                placeholder="Search by Patient Name, ID (DP-1001), or Mobile Number..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-teal-500"
              />
              {searchingPatients ? (
                <div className="text-slate-500 py-2">Searching patients...</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto">
                  {patientSearchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPatientId(p.id)}
                      className="text-left p-3 rounded-xl border border-slate-200 bg-white hover:border-teal-400 hover:bg-teal-50/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">{p.name}</span>
                        <span className="font-mono font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                          {p.patientId}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {p.phone} &bull; {p.gender}, {p.age ? `${p.age} yrs` : 'N/A'} &bull;{' '}
                        {p.visitCount || 0} visit(s)
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedPatientId && (
            <>
              {/* Auto-Retrieved Patient & Doctor Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <UserIcon className="w-4 h-4 text-teal-600" />
                      <span>Patient Information (Auto-Retrieved)</span>
                    </span>
                    {!editingPrescription && !patientId && (
                      <button
                        type="button"
                        onClick={() => {
                          userChangedVisitRef.current = false;
                          setSelectedPatientId(null);
                          setVisitId('auto');
                        }}
                        className="text-[11px] font-semibold text-teal-700 hover:underline cursor-pointer"
                      >
                        Change Patient
                      </button>
                    )}
                  </div>

                  {loadingProfile ? (
                    <div className="py-3 text-slate-400">Loading patient record...</div>
                  ) : patientProfile ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <div>
                        <span className="text-slate-500 block">Name:</span>
                        <strong className="text-slate-900">{patientProfile.name}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Patient ID:</span>
                        <strong className="text-teal-700 font-mono">{patientProfile.patientId}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Age &amp; Gender:</span>
                        <strong className="text-slate-800">
                          {patientProfile.age ? `${patientProfile.age} yrs` : 'N/A'} /{' '}
                          {patientProfile.gender}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Phone Number:</span>
                        <strong className="text-slate-800">{patientProfile.phone}</strong>
                      </div>
                      {patientProfile.address && (
                        <div className="col-span-2">
                          <span className="text-slate-500 block">Address:</span>
                          <span className="text-slate-700">{patientProfile.address}</span>
                        </div>
                      )}
                      {patientProfile.allergies &&
                        !['none', 'n/a', 'nil', '-'].includes(
                          patientProfile.allergies.trim().toLowerCase()
                        ) && (
                          <div className="col-span-2 mt-1 p-2 rounded-lg bg-red-50 border border-red-200 text-red-900 font-semibold flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span>Allergy Alert: {patientProfile.allergies}</span>
                          </div>
                        )}
                    </div>
                  ) : null}
                </div>

                <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-200 space-y-2">
                  <div className="flex items-center justify-between border-b border-teal-200 pb-2">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Stethoscope className="w-4 h-4 text-teal-600" />
                      <span>Prescribing Doctor (Auto-Retrieved)</span>
                    </span>
                    <span className="text-[11px] font-semibold text-teal-800">
                      {clinicSettings.clinic_name || 'Dental Care'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div className="col-span-2">
                      <span className="text-slate-500 block">Doctor Name:</span>
                      {isSuper && !editingPrescription && doctors.length > 0 ? (
                        <select
                          value={doctorId}
                          onChange={(e) => setDoctorId(parseInt(e.target.value, 10))}
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg border border-teal-300 bg-white font-bold text-slate-900"
                        >
                          {doctors.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.fullName} ({d.specialization || d.role})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <strong className="text-slate-900">{activeDoctorObj?.fullName}</strong>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500 block">Designation:</span>
                      <span className="font-semibold text-teal-800">
                        {activeDoctorObj?.specialization || 'Dental Surgeon'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Registration Info:</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {activeDoctorObj?.registrationNumber || 'Clinic Verified'}
                      </span>
                    </div>
                    {activeDoctorObj?.qualifications && (
                      <div className="col-span-2">
                        <span className="text-slate-500 block">Qualification:</span>
                        <span className="text-slate-700">{activeDoctorObj.qualifications}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* STEP 1: Clinical Details (English Section Labels) */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-teal-600 text-white text-xs font-extrabold flex items-center justify-center shadow-2xs">
                      1
                    </span>
                    <CalendarCheck className="w-4 h-4 text-teal-600" />
                    <span>Prescription &amp; Clinical Details</span>
                  </span>
                  {visitId && visitId !== 'auto' && patientProfile && (
                    <button
                      type="button"
                      onClick={syncFromSelectedVisit}
                      className="text-[11px] font-semibold text-teal-700 hover:bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200 flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Load Visit Complaints &amp; Diagnosis</span>
                    </button>
                  )}
                </div>

                {/* PREVIOUS PRESCRIPTION & PATIENT HISTORY LOADER (OPTIONAL FOR RETURNING PATIENTS) */}
                {(() => {
                  const resolvedPrev = getResolvedPreviousHistory();
                  if (!resolvedPrev.hasAnyPreviousData) return null;

                  return (
                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-50/80 via-teal-50/70 to-slate-50 border border-teal-200/90 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                              <History className="w-4 h-4 text-teal-700" />
                              <span>
                                Load Previous Prescription &amp; Patient Histories
                              </span>
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-100/80 text-teal-900 border border-teal-300">
                              Optional &bull; Returning Patient
                            </span>
                            <span className="text-[11px] font-semibold text-slate-600">
                              ({previousPrescriptions.length} prev Rx &bull;{' '}
                              {patientProfile?.visits?.length || 0} visit
                              {(patientProfile?.visits?.length || 0) === 1 ? '' : 's'})
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            Optionally take Past History, Existing Diseases &amp; Drug Allergies, Previous Complaints, Clinical Findings, or Custom History from a previous prescription into this prescription.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleLoadAllPreviousNecessaryHistories}
                            className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
                            title="Load Past History, Diseases & Allergies, Previous Complaints, Findings, Diagnosis & Custom History Headings"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Take All Necessary Histories</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowPrevHistorySelector((v) => !v)}
                            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-teal-50 text-teal-900 border border-teal-300 font-bold text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${
                                showPrevHistorySelector ? 'rotate-180' : ''
                              }`}
                            />
                            <span>
                              {showPrevHistorySelector ? 'Hide Options' : 'Select Specific Histories'}
                            </span>
                          </button>

                          {(patientExistingDiseases.trim() ||
                            patientAllergies.trim() ||
                            patientMedicalHistory.trim() ||
                            chiefComplaints.trim() ||
                            clinicalFindings.trim()) && (
                            <button
                              type="button"
                              onClick={handleClearLoadedHistories}
                              className="px-2 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                              title="Clear loaded histories from current prescription"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Clear</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quick 1-Click Category Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {previousPrescriptions.length > 0 && (
                          <div className="flex items-center gap-1.5 mr-1">
                            <span className="text-[11px] font-semibold text-slate-700">
                              Source Rx:
                            </span>
                            <select
                              value={selectedPrevSourceId}
                              onChange={(e) => setSelectedPrevSourceId(e.target.value)}
                              className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold text-slate-900"
                            >
                              {previousPrescriptions.map((r, i) => (
                                <option key={r.id} value={String(r.id)}>
                                  {i === 0 ? 'Latest: ' : ''}
                                  {r.prescriptionNumber} ({formatDateDDMMYYYY(r.prescriptionDate)})
                                  {r.diagnosis ? ` — ${r.diagnosis.slice(0, 32)}` : ''}
                                </option>
                              ))}
                              <option value="latest_combined">
                                Combined Latest Patient &amp; Visit History
                              </option>
                            </select>
                          </div>
                        )}

                        {resolvedPrev.hasPastDiseaseOrAllergy && (
                          <button
                            type="button"
                            onClick={() =>
                              applyPreviousHistories({ pastHistoryDiseasesAllergies: true })
                            }
                            className="px-2 py-1 rounded-md bg-white hover:bg-teal-50 text-slate-800 border border-slate-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <span>+ Past History, Diseases &amp; Allergies</span>
                          </button>
                        )}

                        {resolvedPrev.prevComplaints && (
                          <button
                            type="button"
                            onClick={() => applyPreviousHistories({ previousComplaints: true })}
                            className="px-2 py-1 rounded-md bg-white hover:bg-teal-50 text-slate-800 border border-slate-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <span>+ Previous Complaints</span>
                          </button>
                        )}

                        {(resolvedPrev.prevClinicalFindings ||
                          resolvedPrev.prevCustomSections.length > 0) && (
                          <button
                            type="button"
                            onClick={() =>
                              applyPreviousHistories({
                                previousClinicalFindings: true,
                                previousCustomHistoryHeadings: true,
                              })
                            }
                            className="px-2 py-1 rounded-md bg-white hover:bg-teal-50 text-slate-800 border border-slate-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <span>+ Previous History &amp; Findings</span>
                          </button>
                        )}

                        {(resolvedPrev.prevDiagnosis || resolvedPrev.prevTreatmentPlan) && (
                          <button
                            type="button"
                            onClick={() =>
                              applyPreviousHistories({ previousDiagnosisAndPlan: true })
                            }
                            className="px-2 py-1 rounded-md bg-white hover:bg-teal-50 text-slate-800 border border-slate-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <span>+ Previous Diagnosis &amp; Plan</span>
                          </button>
                        )}
                      </div>

                      {prevHistoryNotice && (
                        <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] font-semibold flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{prevHistoryNotice}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setPrevHistoryNotice(null)}
                            className="text-[10px] text-emerald-800 hover:underline cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}

                      {/* Expandable Checklist Drawer to Select Specific Previous Histories */}
                      {showPrevHistorySelector && (
                        <div className="pt-2.5 border-t border-teal-200/80 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-slate-800 text-[11px]">
                              Tick the previous history items you want to bring into this prescription:
                            </span>
                            <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-0.5 text-[10px] font-bold">
                              <button
                                type="button"
                                onClick={() => setPrevLoadMode('replace')}
                                className={`px-2 py-0.5 rounded cursor-pointer ${
                                  prevLoadMode === 'replace'
                                    ? 'bg-teal-600 text-white'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                Replace Current
                              </button>
                              <button
                                type="button"
                                onClick={() => setPrevLoadMode('append')}
                                className={`px-2 py-0.5 rounded cursor-pointer ${
                                  prevLoadMode === 'append'
                                    ? 'bg-teal-600 text-white'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                Append / Merge
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {/* 1. Past History, Existing Diseases & Drug Allergies */}
                            <label className="p-2.5 rounded-lg bg-white border border-slate-200 hover:border-teal-300 flex items-start gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={prevHistoryChecks.pastHistoryDiseasesAllergies}
                                onChange={(e) =>
                                  setPrevHistoryChecks((prev) => ({
                                    ...prev,
                                    pastHistoryDiseasesAllergies: e.target.checked,
                                  }))
                                }
                                className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-900 text-[11px]">
                                  Past History, Existing Diseases &amp; Drug Allergies
                                </div>
                                <div className="text-[10.5px] text-slate-600 truncate">
                                  {resolvedPrev.hasPastDiseaseOrAllergy
                                    ? [
                                        resolvedPrev.existingDiseases &&
                                          `Diseases: ${resolvedPrev.existingDiseases}`,
                                        resolvedPrev.allergies &&
                                          `Allergies: ${resolvedPrev.allergies}`,
                                        resolvedPrev.medicalHistory &&
                                          `Past History: ${resolvedPrev.medicalHistory}`,
                                      ]
                                        .filter(Boolean)
                                        .join(' • ')
                                    : 'No past diseases/allergies recorded'}
                                </div>
                              </div>
                            </label>

                            {/* 2. Previous Chief Complaints */}
                            <label className="p-2.5 rounded-lg bg-white border border-slate-200 hover:border-teal-300 flex items-start gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={prevHistoryChecks.previousComplaints}
                                onChange={(e) =>
                                  setPrevHistoryChecks((prev) => ({
                                    ...prev,
                                    previousComplaints: e.target.checked,
                                  }))
                                }
                                className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-900 text-[11px]">
                                  Previous Chief Complaints
                                </div>
                                <div className="text-[10.5px] text-slate-600 truncate">
                                  {resolvedPrev.prevComplaints || 'No previous complaints recorded'}
                                </div>
                              </div>
                            </label>

                            {/* 3. Previous Clinical Findings / Examination History */}
                            <label className="p-2.5 rounded-lg bg-white border border-slate-200 hover:border-teal-300 flex items-start gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={prevHistoryChecks.previousClinicalFindings}
                                onChange={(e) =>
                                  setPrevHistoryChecks((prev) => ({
                                    ...prev,
                                    previousClinicalFindings: e.target.checked,
                                  }))
                                }
                                className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-900 text-[11px]">
                                  Previous Clinical Findings / On Examinations
                                </div>
                                <div className="text-[10.5px] text-slate-600 truncate">
                                  {resolvedPrev.prevClinicalFindings ||
                                    'No previous clinical findings recorded'}
                                </div>
                              </div>
                            </label>

                            {/* 4. Previous Custom History Headings */}
                            <label className="p-2.5 rounded-lg bg-white border border-slate-200 hover:border-teal-300 flex items-start gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={prevHistoryChecks.previousCustomHistoryHeadings}
                                onChange={(e) =>
                                  setPrevHistoryChecks((prev) => ({
                                    ...prev,
                                    previousCustomHistoryHeadings: e.target.checked,
                                  }))
                                }
                                className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-900 text-[11px]">
                                  Previous Personalized History / Custom Sections
                                </div>
                                <div className="text-[10.5px] text-slate-600 truncate">
                                  {resolvedPrev.prevCustomSections.length > 0
                                    ? resolvedPrev.prevCustomSections
                                        .map((s) => `${s.heading}: ${s.content}`)
                                        .join(' • ')
                                    : 'No custom history headings in selected Rx'}
                                </div>
                              </div>
                            </label>

                            {/* 5. Previous Diagnosis & Treatment Plan */}
                            <label className="p-2.5 rounded-lg bg-white border border-slate-200 hover:border-teal-300 flex items-start gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={prevHistoryChecks.previousDiagnosisAndPlan}
                                onChange={(e) =>
                                  setPrevHistoryChecks((prev) => ({
                                    ...prev,
                                    previousDiagnosisAndPlan: e.target.checked,
                                  }))
                                }
                                className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-900 text-[11px]">
                                  Previous Diagnosis &amp; Treatment Plan Notes
                                </div>
                                <div className="text-[10.5px] text-slate-600 truncate">
                                  {[
                                    resolvedPrev.prevDiagnosis &&
                                      `Dx: ${resolvedPrev.prevDiagnosis}`,
                                    resolvedPrev.prevTreatmentPlan &&
                                      `Plan: ${resolvedPrev.prevTreatmentPlan}`,
                                  ]
                                    .filter(Boolean)
                                    .join(' • ') || 'No previous diagnosis/plan recorded'}
                                </div>
                              </div>
                            </label>

                            {/* 6. Previous Planned Treatments & Advised Tests */}
                            <label className="p-2.5 rounded-lg bg-white border border-slate-200 hover:border-teal-300 flex items-start gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={prevHistoryChecks.previousPlannedTreatmentsAndTests}
                                onChange={(e) =>
                                  setPrevHistoryChecks((prev) => ({
                                    ...prev,
                                    previousPlannedTreatmentsAndTests: e.target.checked,
                                  }))
                                }
                                className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-900 text-[11px]">
                                  Previous Planned Treatments &amp; Advised Tests
                                </div>
                                <div className="text-[10.5px] text-slate-600 truncate">
                                  {resolvedPrev.prevPlanItems.length > 0 ||
                                  resolvedPrev.prevTests.length > 0
                                    ? `${resolvedPrev.prevPlanItems.length} treatment(s), ${resolvedPrev.prevTests.length} test(s)`
                                    : 'None in selected Rx'}
                                </div>
                              </div>
                            </label>
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => applyPreviousHistories(prevHistoryChecks)}
                              className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Load Selected Histories to Prescription</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Unique Prescription Number
                    </label>
                    <input
                      type="text"
                      disabled
                      value={
                        editingPrescription
                          ? editingPrescription.prescriptionNumber
                          : 'Auto-assigned on save (RX-#)'
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 font-mono font-bold text-teal-800"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <label className="block font-semibold text-slate-700">
                        Prescription Date *
                      </label>
                      {prescriptionDate && (
                        <span className="text-[10.5px] font-mono font-bold text-teal-800">
                          {formatDateDDMMYYYY(prescriptionDate)}
                        </span>
                      )}
                    </div>
                    <input
                      type="date"
                      required
                      value={prescriptionDate}
                      onChange={(e) => setPrescriptionDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Associated Clinic Visit *
                    </label>
                    <select
                      required
                      value={visitId || (editingPrescription ? '' : 'auto')}
                      onChange={(e) => handleVisitChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-900 focus:ring-2 focus:ring-teal-500"
                    >
                      {editingPrescription && (
                        <option value="" disabled>
                          Select patient visit...
                        </option>
                      )}
                      {!editingPrescription && (
                        <option value="auto">
                          + Create New Clinic Visit Automatically (Auto VST-#)
                        </option>
                      )}
                      {patientProfile?.visits.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.visitId} &bull; {formatDateDDMMYYYY(v.visitDate)} &bull; {v.doctorName}
                        </option>
                      ))}
                    </select>
                    {(visitId === 'auto' || (!editingPrescription && !visitId)) && (
                      <p className="text-[11px] text-emerald-700 font-medium mt-1">
                        A new clinic visit (VST-#) will be created automatically on save for accurate visit &amp; billing tracking.
                      </p>
                    )}
                  </div>
                </div>

                {/* Patient Past / Disease / Allergy History (Optional / Synced to Centralized Patient Profile) */}
                <div className="p-3 rounded-xl bg-slate-50/90 border border-slate-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                        Past History, Existing Diseases &amp; Drug Allergies
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200/80 text-slate-700">
                        Optional
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {getResolvedPreviousHistory().hasPastDiseaseOrAllergy && (
                        <button
                          type="button"
                          onClick={() =>
                            applyPreviousHistories({ pastHistoryDiseasesAllergies: true })
                          }
                          className="px-2 py-0.5 rounded bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 text-[10.5px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <History className="w-3 h-3" />
                          <span>Load Previous Past History &amp; Allergies</span>
                        </button>
                      )}
                      {(patientExistingDiseases.trim() ||
                        patientAllergies.trim() ||
                        patientMedicalHistory.trim()) && (
                        <button
                          type="button"
                          onClick={() => {
                            setPatientExistingDiseases('');
                            setPatientAllergies('');
                            setPatientMedicalHistory('');
                          }}
                          className="text-[10px] font-semibold text-rose-600 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                      <span className="text-[10px] font-semibold text-teal-700">
                        Updates centralized Patient Medical History when synced
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Existing Diseases
                      </label>
                      <input
                        type="text"
                        value={patientExistingDiseases}
                        onChange={(e) => setPatientExistingDiseases(e.target.value)}
                        placeholder="e.g. Diabetes, Hypertension, Cardiac"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Known Drug Allergies
                      </label>
                      <input
                        type="text"
                        value={patientAllergies}
                        onChange={(e) => setPatientAllergies(e.target.value)}
                        placeholder="e.g. Penicillin, Sulfa, NSAIDs"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-red-700 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Past Medical History
                      </label>
                      <input
                        type="text"
                        value={patientMedicalHistory}
                        onChange={(e) => setPatientMedicalHistory(e.target.value)}
                        placeholder="Surgeries, medications, bleeding history..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block font-semibold text-slate-700">
                        Chief Complaints
                      </label>
                      {getResolvedPreviousHistory().prevComplaints && (
                        <button
                          type="button"
                          onClick={() => applyPreviousHistories({ previousComplaints: true })}
                          className="text-[10.5px] font-bold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <History className="w-3 h-3" />
                          <span>Load Previous Complaints</span>
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      value={chiefComplaints}
                      onChange={(e) => setChiefComplaints(e.target.value)}
                      placeholder="Patient presenting dental symptoms & pain history..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block font-semibold text-slate-700">
                        Clinical Findings
                      </label>
                      {getResolvedPreviousHistory().prevClinicalFindings && (
                        <button
                          type="button"
                          onClick={() =>
                            applyPreviousHistories({ previousClinicalFindings: true })
                          }
                          className="text-[10.5px] font-bold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <History className="w-3 h-3" />
                          <span>Load Previous Findings</span>
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      value={clinicalFindings}
                      onChange={(e) => setClinicalFindings(e.target.value)}
                      placeholder="Intraoral examination, percussion, radiographic findings..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block font-semibold text-slate-700">Diagnosis</label>
                      {getResolvedPreviousHistory().prevDiagnosis && (
                        <button
                          type="button"
                          onClick={() =>
                            setDiagnosis((prev) =>
                              mergeTextValue(
                                prev,
                                getResolvedPreviousHistory().prevDiagnosis,
                                prevLoadMode
                              )
                            )
                          }
                          className="text-[10.5px] font-bold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <History className="w-3 h-3" />
                          <span>Load Previous Diagnosis</span>
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      placeholder="e.g., Acute Irreversible Pulpitis #36 / Post-Extraction Socket"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 font-medium"
                    />
                  </div>
                </div>

                {/* PERSONALIZED CLINICAL HEADINGS (Per-Doctor Defaults + Custom Sections) */}
                <div className="mt-3 pt-3 border-t border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                        <span>Personalized Clinical Headings</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                          Optional &bull; Custom per Doctor
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Add custom clinical headings (e.g., Investigations, History, On Examinations) alongside standard fields, and optionally save them as your default headings.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {savedDoctorHeadings.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomSections((prev) => {
                              const existingSet = new Set(
                                prev.map((s) => s.heading.trim().toLowerCase())
                              );
                              const additions = savedDoctorHeadings
                                .filter((h) => !existingSet.has(h.heading.trim().toLowerCase()))
                                .map((h) => ({ heading: h.heading, content: '' }));
                              return [...prev, ...additions];
                            });
                            setHeadingsNotice(null);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                        >
                          Load My Defaults ({savedDoctorHeadings.length})
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={savingHeadings}
                        onClick={handleSaveDoctorDefaultHeadings}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 flex items-center gap-1 cursor-pointer disabled:opacity-60"
                        title="Remember this set of headings for your future prescriptions"
                      >
                        <BookmarkCheck className="w-3.5 h-3.5" />
                        <span>{savingHeadings ? 'Saving...' : 'Save as My Defaults'}</span>
                      </button>
                    </div>
                  </div>

                  {headingsNotice && (
                    <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{headingsNotice}</span>
                    </div>
                  )}

                  {/* Quick Presets + Custom Heading Input */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PERSONALIZED_HEADING_PRESETS.map((preset) => {
                      const alreadyAdded = customSections.some(
                        (s) => s.heading.trim().toLowerCase() === preset.toLowerCase()
                      );
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => addCustomHeadingRow(preset)}
                          className={`px-2 py-0.5 text-[11px] rounded border transition-colors cursor-pointer ${
                            alreadyAdded
                              ? 'bg-teal-50 text-teal-800 border-teal-300 font-semibold'
                              : 'bg-slate-100 hover:bg-teal-50 hover:text-teal-800 border-slate-200 hover:border-teal-300 text-slate-700'
                          }`}
                        >
                          {alreadyAdded ? '✓ ' : '+ '}
                          {preset}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newHeadingInput}
                      onChange={(e) => setNewHeadingInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomHeadingRow(newHeadingInput);
                        }
                      }}
                      placeholder="Type a custom heading (e.g., Investigations, History, On Examinations, O/E, Advice)..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                      type="button"
                      onClick={() => addCustomHeadingRow(newHeadingInput)}
                      disabled={!newHeadingInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Heading</span>
                    </button>
                  </div>

                  {customSections.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      {customSections.map((sec, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={sec.heading}
                              onChange={(e) =>
                                setCustomSections((prev) =>
                                  prev.map((row, i) =>
                                    i === idx ? { ...row, heading: e.target.value } : row
                                  )
                                )
                              }
                              placeholder="Heading Title..."
                              className="flex-1 px-2 py-1 rounded-md border border-slate-300 bg-white font-bold text-teal-800 text-xs focus:ring-2 focus:ring-teal-500"
                            />
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveCustomSection(idx, -1)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === customSections.length - 1}
                              onClick={() => moveCustomSection(idx, 1)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCustomSections((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Remove Heading"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <textarea
                            rows={2}
                            value={sec.content}
                            onChange={(e) =>
                              setCustomSections((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, content: e.target.value } : row
                                )
                              )
                            }
                            placeholder={`Enter ${sec.heading || 'clinical'} details (optional — empty headings won't print)...`}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* STEP 2: TREATMENT PLAN & ADVISED TESTS (BEFORE PRESCRIBED MEDICATIONS IN EDITOR, SHOWN AFTER MEDICINES ON FINAL RX) */}
              <div className="p-4 rounded-xl border border-cyan-200/80 bg-gradient-to-br from-slate-50 via-white to-cyan-50/30 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
                      <span className="w-6 h-6 rounded-lg bg-teal-600 text-white text-xs font-extrabold flex items-center justify-center shadow-2xs">
                        2
                      </span>
                      <ClipboardList className="w-4 h-4 text-teal-600" />
                      <span>Treatment Plan &amp; Advised Tests</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                        Optional
                      </span>
                      {(treatmentPlanItems.length > 0 || advisedTests.length > 0) && (
                        <span className="text-[11px] font-bold text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded-md">
                          {treatmentPlanItems.length} treatment{treatmentPlanItems.length === 1 ? '' : 's'} &bull; {advisedTests.length} test{advisedTests.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Add recommended dental procedures or diagnostic tests before prescribing medicines. On the final prescription, Advised Tests appear on the left and Recommended Treatment Plan appears after Prescribed Medications.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowOptionalSections(true);
                        setTreatmentPlanItems((prev) => [...prev, emptyTreatmentPlanItem()]);
                      }}
                      className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-white hover:bg-teal-50 text-teal-800 border border-teal-300 flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Planned Treatment</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowOptionalSections(true);
                        setAdvisedTests((prev) => [...prev, emptyAdvisedTestItem()]);
                      }}
                      className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-white hover:bg-cyan-50 text-cyan-800 border border-cyan-300 flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>Add Advised Test</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowOptionalSections((v) => !v)}
                      className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 cursor-pointer"
                    >
                      {showOptionalSections ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                </div>

                {showOptionalSections && (
                  <div className="space-y-4 pt-2 border-t border-slate-200/80">
                    {/* Sub-panel A: Optional Planned Treatments */}
                    <div className="p-3.5 rounded-xl bg-white border border-teal-200/90 shadow-2xs space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-teal-900 flex items-center gap-1.5">
                          <ClipboardList className="w-3.5 h-3.5 text-teal-600" />
                          <span>Planned Treatments (Optional)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setTreatmentPlanItems((prev) => [...prev, emptyTreatmentPlanItem()])
                          }
                          className="text-[11px] font-bold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Add Row
                        </button>
                      </div>

                      {/* Quick Presets */}
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_TREATMENT_PLAN_PRESETS.map((pt) => (
                          <button
                            key={pt.treatmentName}
                            type="button"
                            onClick={() =>
                              setTreatmentPlanItems((prev) => [
                                ...prev,
                                {
                                  treatmentName: pt.treatmentName,
                                  toothNumber: '',
                                  cost: pt.cost,
                                  notes: '',
                                },
                              ])
                            }
                            className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 hover:bg-teal-50 hover:text-teal-800 border border-slate-200 hover:border-teal-300 text-slate-700 transition-colors cursor-pointer"
                          >
                            + {pt.treatmentName} (৳{Number(pt.cost).toLocaleString()})
                          </button>
                        ))}
                      </div>

                      {treatmentPlanItems.length === 0 ? (
                        <div className="text-[11px] text-slate-400 italic py-1">
                          No planned treatments added yet. Click any quick preset chip above or &ldquo;Add Row&rdquo;.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {treatmentPlanItems.map((item, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
                            >
                              <div className="sm:col-span-5">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Treatment / Procedure *
                                </label>
                                <input
                                  type="text"
                                  value={item.treatmentName}
                                  onChange={(e) =>
                                    setTreatmentPlanItems((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, treatmentName: e.target.value } : row
                                      )
                                    )
                                  }
                                  placeholder="e.g., Root Canal Treatment"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Tooth # (Opt.)
                                </label>
                                <input
                                  type="text"
                                  value={item.toothNumber || ''}
                                  onChange={(e) =>
                                    setTreatmentPlanItems((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, toothNumber: e.target.value } : row
                                      )
                                    )
                                  }
                                  placeholder="e.g., 36"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Cost ৳ (Opt.)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.cost ?? ''}
                                  onChange={(e) =>
                                    setTreatmentPlanItems((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, cost: e.target.value } : row
                                      )
                                    )
                                  }
                                  placeholder="Optional"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold focus:ring-2 focus:ring-teal-500"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Notes (Opt.)
                                </label>
                                <input
                                  type="text"
                                  value={item.notes || ''}
                                  onChange={(e) =>
                                    setTreatmentPlanItems((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, notes: e.target.value } : row
                                      )
                                    )
                                  }
                                  placeholder="Stage / note..."
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                                />
                              </div>

                              <div className="sm:col-span-1 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTreatmentPlanItems((prev) =>
                                      prev.filter((_, i) => i !== idx)
                                    )
                                  }
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                  title="Remove Treatment Item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sub-panel B: Optional Advised Diagnostic Tests */}
                    <div className="p-3.5 rounded-xl bg-white border border-cyan-200/90 shadow-2xs space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-cyan-900 flex items-center gap-1.5">
                          <Radio className="w-3.5 h-3.5 text-cyan-600" />
                          <span>Advised Diagnostic Tests / X-rays (Optional)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setAdvisedTests((prev) => [...prev, emptyAdvisedTestItem()])
                          }
                          className="text-[11px] font-bold text-cyan-700 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Add Row
                        </button>
                      </div>

                      {/* Quick Test Presets */}
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_ADVISED_TEST_PRESETS.map((tp) => (
                          <button
                            key={tp.testName}
                            type="button"
                            onClick={() =>
                              setAdvisedTests((prev) => [
                                ...prev,
                                {
                                  testName: tp.testName,
                                  category: tp.category,
                                  cost: tp.cost,
                                  notes: '',
                                },
                              ])
                            }
                            className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 hover:bg-cyan-50 hover:text-cyan-800 border border-slate-200 hover:border-cyan-300 text-slate-700 transition-colors cursor-pointer"
                          >
                            + {tp.testName}
                            {Number(tp.cost) > 0 ? ` (৳${Number(tp.cost).toLocaleString()})` : ''}
                          </button>
                        ))}
                      </div>

                      {advisedTests.length === 0 ? (
                        <div className="text-[11px] text-slate-400 italic py-1">
                          No diagnostic tests advised yet. Click any quick preset chip above or &ldquo;Add Row&rdquo;.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {advisedTests.map((test, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
                            >
                              <div className="sm:col-span-5">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Advised Test / Investigation *
                                </label>
                                <input
                                  type="text"
                                  value={test.testName}
                                  onChange={(e) =>
                                    setAdvisedTests((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, testName: e.target.value } : row
                                      )
                                    )
                                  }
                                  placeholder="e.g., Digital IOPA X-ray #46"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Category
                                </label>
                                <select
                                  value={test.category || 'Dental X-ray'}
                                  onChange={(e) =>
                                    setAdvisedTests((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, category: e.target.value } : row
                                      )
                                    )
                                  }
                                  className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                                >
                                  <option value="Dental X-ray">Dental X-ray</option>
                                  <option value="IOPA">IOPA</option>
                                  <option value="OPG">OPG</option>
                                  <option value="CBCT">CBCT</option>
                                  <option value="Lab / Blood">Lab / Blood</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Custom Rate ৳ (Opt.)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={test.cost ?? ''}
                                  onChange={(e) =>
                                    setAdvisedTests((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, cost: e.target.value } : row
                                      )
                                    )
                                  }
                                  placeholder="Custom ৳ (Opt.)"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold focus:ring-2 focus:ring-teal-500"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Indication (Opt.)
                                </label>
                                <input
                                  type="text"
                                  value={test.notes || ''}
                                  onChange={(e) =>
                                    setAdvisedTests((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, notes: e.target.value } : row
                                      )
                                    )
                                  }
                                  placeholder="Before extraction..."
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                                />
                              </div>

                              <div className="sm:col-span-1 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAdvisedTests((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                  title="Remove Advised Test"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Cost Display Toggle & Live Estimated Total */}
                    {(treatmentPlanItems.length > 0 || advisedTests.length > 0) && (() => {
                      const planSum = treatmentPlanItems.reduce((sum, p) => {
                        const n = p.cost !== undefined && p.cost !== null && String(p.cost).trim() !== '' ? Number(p.cost) : 0;
                        return sum + (Number.isFinite(n) && n >= 0 ? n : 0);
                      }, 0);
                      const testSum = advisedTests.reduce((sum, t) => {
                        const n = t.cost !== undefined && t.cost !== null && String(t.cost).trim() !== '' ? Number(t.cost) : 0;
                        return sum + (Number.isFinite(n) && n >= 0 ? n : 0);
                      }, 0);
                      return (
                        <div className="p-3 rounded-xl bg-teal-50/80 border border-teal-200 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={showPlanCosts}
                                onChange={(e) => setShowPlanCosts(e.target.checked)}
                                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                              />
                              <span>Show estimated costs (৳) on Prescription Preview &amp; PDF</span>
                            </label>

                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <span className="text-slate-600">
                                Treatments:{' '}
                                <strong className="font-mono text-slate-900">
                                  ৳{planSum.toLocaleString()}
                                </strong>
                              </span>
                              <span className="text-slate-600">
                                Tests:{' '}
                                <strong className="font-mono text-slate-900">
                                  ৳{testSum.toLocaleString()}
                                </strong>
                              </span>
                              <span className="px-2.5 py-1 rounded-lg bg-teal-700 text-white font-bold font-mono">
                                Est. Total: ৳{(planSum + testSum).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          <label className="inline-flex items-center gap-2 font-semibold text-teal-900 cursor-pointer pt-1.5 border-t border-teal-200/70 w-full">
                            <input
                              type="checkbox"
                              checked={syncToPatientRecords}
                              onChange={(e) => setSyncToPatientRecords(e.target.checked)}
                              className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                            />
                            <span>
                              Sync Planned Treatments, Advised Tests, Follow-up &amp; Costs to Patient History &amp; Billing
                            </span>
                          </label>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* STEP 3: DYNAMIC MEDICINES WITH SMART LOCAL CATALOG AUTOCOMPLETE (NO QUANTITY FIELD!) */}
              <div className="p-4 rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/40 via-white to-teal-50/20 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-teal-600 text-white text-xs font-extrabold flex items-center justify-center shadow-2xs">
                        3
                      </span>
                      <Pill className="w-4 h-4 text-teal-600" />
                      <span>Prescribed Medications ({medicines.length})</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Search the local Bangladesh medicine database by brand, generic, strength, dosage form, or manufacturer — or enter custom entries. Enter Dosage, Frequency, Duration &amp; Instructions freely in English or বাংলা.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      className="inline-flex items-center rounded-lg border border-teal-200 bg-white p-0.5 text-[11px] font-bold shadow-2xs"
                      title="Default Language for Duration & Additional Instructions"
                    >
                      <span className="px-2 py-1 text-slate-500 flex items-center gap-1">
                        <Globe className="w-3 h-3 text-teal-600" />
                        <span>ভাষা / Lang:</span>
                      </span>
                      {(
                        [
                          { id: 'bn', label: 'বাংলা' },
                          { id: 'en', label: 'English' },
                          { id: 'bilingual', label: 'Bilingual' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setGlobalLanguage(opt.id)}
                          className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                            rxFieldLang === opt.id && Object.keys(rowLangs).length === 0
                              ? 'bg-teal-600 text-white'
                              : 'text-slate-700 hover:bg-teal-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={addMedicineRow}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Medicine</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {medicines.map((med, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-3.5 rounded-xl border border-slate-200 hover:border-teal-300/80 transition-colors shadow-2xs space-y-3 relative"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 font-bold text-teal-900">
                            <span className="w-5 h-5 rounded-md bg-teal-100 text-teal-800 text-[11px] font-extrabold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span>Medicine #{idx + 1}</span>
                          </span>
                          {med.medicineId ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                              Catalog Matched{med.manufacturer ? ` · ${med.manufacturer}` : ''}
                            </span>
                          ) : med.medicineName.trim() ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              Custom Entry
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMedicineRow(idx)}
                          className="text-slate-400 hover:text-rose-600 flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
                          title="Remove Medicine Row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>

                      {/* Row 1: Catalog Identification Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        {/* Smart Catalog Autocomplete Input */}
                        <div className="relative sm:col-span-2 lg:col-span-1">
                          <label className="block font-semibold text-slate-700 mb-1">
                            Medicine / Brand Name *
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={med.medicineName}
                              onFocus={() => triggerCatalogSearch(idx, med.medicineName)}
                              onChange={(e) => {
                                updateMedicineField(idx, 'medicineName', e.target.value);
                                triggerCatalogSearch(idx, e.target.value);
                              }}
                              onKeyDown={(e) => handleMedKeyDown(idx, e)}
                              onBlur={() => setTimeout(() => setActiveMedIdx(null), 200)}
                              placeholder="Type brand, generic, e.g. napa..."
                              className="w-full px-2.5 py-1.5 pr-7 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 font-semibold"
                              autoComplete="off"
                            />
                            {activeMedIdx === idx && searchingMeds && (
                              <Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin absolute right-2 top-2" />
                            )}
                          </div>

                          {activeMedIdx === idx && (
                            <div
                              className="absolute left-0 w-full sm:w-[440px] max-w-[90vw] mt-1 bg-white border border-slate-300 rounded-xl shadow-2xl z-50 overflow-hidden"
                              onMouseDown={(e) => e.preventDefault()}
                            >
                              <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <span>Bangladesh Medicine Database</span>
                                <span className="font-mono text-teal-700 tabular-nums">
                                  {searchingMeds
                                    ? 'Searching...'
                                    : `${medTotalCount.toLocaleString()} match${medTotalCount === 1 ? '' : 'es'}`}
                                </span>
                              </div>

                              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                                {searchingMeds && medResults.length === 0 ? (
                                  <div className="px-3 py-4 text-center text-slate-500 text-xs">
                                    Searching local medicine catalog...
                                  </div>
                                ) : medResults.length === 0 ? (
                                  <div className="px-3 py-4 text-center text-slate-500 text-xs">
                                    No matching active catalog medicine found for &ldquo;{med.medicineName}&rdquo;. You can continue typing to use a custom medicine name.
                                  </div>
                                ) : (
                                  medResults.map((item, sIdx) => {
                                    const isHighlighted = sIdx === highlightedSugIdx;
                                    return (
                                      <button
                                        key={item.id}
                                        type="button"
                                        onMouseEnter={() => setHighlightedSugIdx(sIdx)}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          applyCatalogSelection(idx, item);
                                        }}
                                        className={`w-full text-left px-3 py-2 transition-colors cursor-pointer ${
                                          isHighlighted ? 'bg-teal-50' : 'hover:bg-slate-50'
                                        }`}
                                      >
                                        <div className="font-bold text-slate-900 text-xs flex items-center justify-between gap-2">
                                          <span>
                                            {item.brandName}
                                            {item.strength ? (
                                              <span className="text-teal-700"> — {item.strength}</span>
                                            ) : null}
                                          </span>
                                        </div>
                                        <div className="text-[11px] font-medium text-slate-700">
                                          {item.genericName}
                                        </div>
                                        <div className="text-[10px] text-slate-500">
                                          {item.dosageType} | {item.manufacturer}
                                        </div>
                                      </button>
                                    );
                                  })
                                )}
                              </div>

                              {medHasMore && !searchingMeds && (
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleLoadMoreCatalog();
                                  }}
                                  className="w-full px-3 py-2 bg-slate-50 hover:bg-teal-50 border-t border-slate-200 text-teal-700 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  {loadingMoreMeds ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      <span>Loading more...</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="w-3.5 h-3.5" />
                                      <span>
                                        Load 10 more ({medResults.length} of {medTotalCount.toLocaleString()})
                                      </span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Generic Name
                          </label>
                          <input
                            type="text"
                            value={med.genericName || ''}
                            onChange={(e) => updateMedicineField(idx, 'genericName', e.target.value)}
                            placeholder="Generic name..."
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Strength
                          </label>
                          <input
                            type="text"
                            value={med.strength || ''}
                            onChange={(e) => updateMedicineField(idx, 'strength', e.target.value)}
                            placeholder="e.g., 500 mg"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Dosage Form
                          </label>
                          <input
                            type="text"
                            value={med.dosageType || ''}
                            onChange={(e) => updateMedicineField(idx, 'dosageType', e.target.value)}
                            placeholder="e.g., Tablet, Capsule, Syrup"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>
                      </div>

                      {/* Row 2: Doctor's Clinical Regimen Fields (English & Bangla Supported, NO Quantity) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Dosage
                          </label>
                          <input
                            type="text"
                            value={med.dosage || ''}
                            onChange={(e) => updateMedicineField(idx, 'dosage', e.target.value)}
                            placeholder="e.g., 1 tablet / ১টি ট্যাবলেট"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Frequency (Free Text)
                          </label>
                          <input
                            type="text"
                            value={med.frequency || ''}
                            onChange={(e) => updateMedicineField(idx, 'frequency', e.target.value)}
                            placeholder="e.g., 1+0+1 / দিনে ৩ বার"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold text-teal-800"
                          />
                          <div className="flex flex-wrap gap-1 mt-1">
                            {FREQUENCY_HELPERS.slice(0, 5).map((fp) => (
                              <button
                                key={fp}
                                type="button"
                                onClick={() => updateMedicineField(idx, 'frequency', fp)}
                                className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 hover:bg-teal-100 text-slate-700 cursor-pointer"
                              >
                                {fp}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <label className="block font-semibold text-slate-700">
                              Duration
                            </label>
                            <div
                              className="inline-flex items-center rounded-md border border-slate-300 bg-slate-50 p-0.5 text-[10px] font-bold"
                              title="Change Duration & Notes language (বাংলা / English / Bilingual)"
                            >
                              {(
                                [
                                  { id: 'bn', label: 'বাংলা' },
                                  { id: 'en', label: 'EN' },
                                  { id: 'bilingual', label: 'Bi' },
                                ] as const
                              ).map((opt) => {
                                const activeLang = getRowLang(idx);
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setRowLanguage(idx, opt.id)}
                                    className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                                      activeLang === opt.id
                                        ? 'bg-teal-600 text-white'
                                        : 'text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              ref={(el) => {
                                durationInputRefs.current[idx] = el;
                              }}
                              type="text"
                              value={med.duration || ''}
                              onChange={(e) => handleDurationChange(idx, e.target.value)}
                              onBlur={() => handleDurationBlur(idx)}
                              placeholder={
                                getRowLang(idx) === 'bn'
                                  ? 'যেমন: ৫ লিখলে স্বয়ংক্রিয়ভাবে "৫ দিন"'
                                  : getRowLang(idx) === 'en'
                                    ? 'e.g., Type 5 -> "5 days"'
                                    : 'e.g., Type 5 -> "৫ দিন (5 days)"'
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-900 focus:ring-2 focus:ring-teal-500"
                            />
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {['3', '5', '7', '10', '14'].map((dNum) => {
                              const formattedChip = autoFormatDuration(dNum, getRowLang(idx));
                              return (
                                <button
                                  key={dNum}
                                  type="button"
                                  onClick={() => updateMedicineField(idx, 'duration', formattedChip)}
                                  className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer border transition-colors ${
                                    med.duration === formattedChip
                                      ? 'bg-teal-600 text-white border-teal-600 font-bold'
                                      : 'bg-slate-100 hover:bg-teal-100 text-slate-700 border-transparent'
                                  }`}
                                >
                                  {formattedChip}
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => updateMedicineField(idx, 'duration', 'চলবে')}
                              className={`px-2 py-0.5 text-[10px] rounded cursor-pointer border transition-colors font-semibold ${
                                med.duration === 'চলবে'
                                  ? 'bg-teal-600 text-white border-teal-600 font-bold'
                                  : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200'
                              }`}
                            >
                              চলবে
                            </button>
                          </div>
                        </div>

                        {/* Interactive Meal / Timing Instructions Input + Dropdown Button */}
                        <div className="relative">
                          <label className="block font-semibold text-slate-700 mb-1">
                            Meal / Timing Instructions
                          </label>
                          <div className="relative flex items-center">
                            <input
                              ref={(el) => {
                                mealInputRefs.current[idx] = el;
                              }}
                              type="text"
                              value={med.mealInstructions || ''}
                              onFocus={() => setOpenMealDropdownIdx(idx)}
                              onClick={() => setOpenMealDropdownIdx(idx)}
                              onChange={(e) => {
                                updateMedicineField(idx, 'mealInstructions', e.target.value);
                                setOpenMealDropdownIdx(idx);
                              }}
                              onBlur={() => {
                                setTimeout(() => {
                                  setOpenMealDropdownIdx((prev) => (prev === idx ? null : prev));
                                }, 180);
                              }}
                              placeholder="Select or write custom instruction..."
                              className="w-full px-2.5 py-1.5 pr-8 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 font-medium text-slate-900"
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              tabIndex={-1}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setOpenMealDropdownIdx((prev) => (prev === idx ? null : idx));
                              }}
                              className="absolute right-1.5 p-1 rounded-md text-slate-500 hover:text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                              title="Show timing instruction options"
                            >
                              <ChevronDown
                                className={`w-4 h-4 transition-transform ${
                                  openMealDropdownIdx === idx ? 'rotate-180 text-teal-600' : ''
                                }`}
                              />
                            </button>
                          </div>

                          {openMealDropdownIdx === idx && (
                            <div
                              className="absolute left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-xl z-40 overflow-hidden"
                              onMouseDown={(e) => e.preventDefault()}
                            >
                              <div className="px-2.5 py-1 bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                                <span>Timing Instructions</span>
                                <span className="text-teal-700 font-semibold">Click or type custom</span>
                              </div>
                              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                                {MEAL_OPTIONS.map((opt) => {
                                  const isSelected = med.mealInstructions === opt;
                                  return (
                                    <button
                                      key={opt}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        updateMedicineField(idx, 'mealInstructions', opt);
                                        setOpenMealDropdownIdx(null);
                                      }}
                                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                        isSelected
                                          ? 'bg-teal-50 text-teal-900 font-bold'
                                          : 'text-slate-700 hover:bg-teal-50/60 font-medium'
                                      }`}
                                    >
                                      <span>{opt}</span>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-teal-600" />}
                                    </button>
                                  );
                                })}
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setOpenMealDropdownIdx(null);
                                    const inputEl = mealInputRefs.current[idx];
                                    if (inputEl) {
                                      inputEl.focus();
                                      inputEl.select();
                                    }
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-[11px] font-semibold text-teal-700 bg-teal-50/40 hover:bg-teal-50 flex items-center justify-between cursor-pointer"
                                >
                                  <span>✎ Custom instruction (type in box)...</span>
                                  {med.mealInstructions && (
                                    <span
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        updateMedicineField(idx, 'mealInstructions', '');
                                      }}
                                      className="text-[10px] text-rose-600 hover:underline font-bold"
                                    >
                                      Clear
                                    </span>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Row 3: Additional Medicine Notes with Selectable 'ব্যথা হলে খাবেন' Tick Mark + Custom Variable Input + Language Switcher */}
                      {(() => {
                        const activeLang = getRowLang(idx);
                        const { hasPainNote, customNote } = parseAdditionalNotes(
                          med.additionalNotes
                        );
                        const painLabel = PAIN_NOTE_BY_LANG[activeLang];

                        return (
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="block font-semibold text-slate-700">
                                Additional Instructions / Notes
                              </label>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-500 font-medium">
                                  Language:
                                </span>
                                <div className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-50 p-0.5 text-[10px] font-bold">
                                  {(
                                    [
                                      { id: 'bn', label: 'বাংলা' },
                                      { id: 'en', label: 'English' },
                                      { id: 'bilingual', label: 'Bilingual' },
                                    ] as const
                                  ).map((opt) => (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => setRowLanguage(idx, opt.id)}
                                      className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                                        activeLang === opt.id
                                          ? 'bg-teal-600 text-white'
                                          : 'text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              {/* Selectable Tick-Mark Checkbox Button for "ব্যথা হলে খাবেন" */}
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={hasPainNote}
                                onClick={() => togglePainInstruction(idx)}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                                  hasPainNote
                                    ? 'bg-teal-50 border-teal-600 text-teal-900 shadow-2xs ring-1 ring-teal-500/30'
                                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                                }`}
                                title="Click to tick or untick 'ব্যথা হলে খাবেন' on this medicine"
                              >
                                <span
                                  className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                    hasPainNote
                                      ? 'bg-teal-600 border-teal-600 text-white'
                                      : 'bg-white border-slate-400 text-transparent'
                                  }`}
                                >
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </span>
                                <span>{painLabel}</span>
                              </button>

                              {/* Custom Variable / Note Input Box (Present Box) */}
                              <div className="flex-1 relative">
                                <input
                                  type="text"
                                  value={customNote}
                                  onChange={(e) => handleCustomNoteInput(idx, e.target.value)}
                                  placeholder={
                                    hasPainNote
                                      ? 'Write additional custom note / অন্য কোনো নির্দেশনা লিখুন (ঐচ্ছিক)...'
                                      : 'Write custom instructions / অথবা কাস্টম নির্দেশনা লিখুন...'
                                  }
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500"
                                />
                              </div>
                            </div>

                            {med.additionalNotes?.trim() && (
                              <div className="text-[11px] text-teal-800 bg-teal-50/70 border border-teal-200/80 rounded-md px-2.5 py-1 flex items-center justify-between gap-2">
                                <span>
                                  <strong className="font-bold"> প্রিন্ট নোট (Note on Rx):</strong>{' '}
                                  {med.additionalNotes}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateMedicineField(idx, 'additionalNotes', '')}
                                  className="text-[10px] font-semibold text-rose-600 hover:underline cursor-pointer"
                                >
                                  Clear
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>

              {/* STEP 4: পরবর্তী সাক্ষাতের তারিখ (NEXT FOLLOW-UP DATE — AFTER PRESCRIBED MEDICATIONS) */}
              <div className="p-4 rounded-xl border border-teal-200 bg-white shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-teal-600 text-white text-xs font-extrabold flex items-center justify-center shadow-2xs">
                        4
                      </span>
                      <CalendarCheck className="w-4 h-4 text-teal-600" />
                      <span>পরবর্তী সাক্ষাতের তারিখ: (Next Follow-Up Date)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Select the next follow-up appointment date after prescribing medications, or click a quick interval chip below.
                    </p>
                  </div>
                  {followUpDate && (
                    <span className="px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-xs font-bold text-teal-900 flex items-center gap-1.5">
                      <CalendarCheck className="w-3.5 h-3.5 text-teal-600" />
                      <span>
                        বাংলা তারিখ: {formatBanglaDate(followUpDate)} ({formatDateDDMMYYYY(followUpDate)})
                      </span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-5">
                    <input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 font-semibold text-slate-900"
                    />
                  </div>
                  <div className="md:col-span-7 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 mr-1">
                      Quick Select:
                    </span>
                    {[
                      { label: '+৩ দিন (3d)', days: 3 },
                      { label: '+৫ দিন (5d)', days: 5 },
                      { label: '+৭ দিন (7d)', days: 7 },
                      { label: '+১০ দিন (10d)', days: 10 },
                      { label: '+১৪ দিন (14d)', days: 14 },
                      { label: '+১ মাস (30d)', days: 30 },
                    ].map((chip) => {
                      const baseDate = prescriptionDate
                        ? new Date(`${prescriptionDate}T00:00:00`)
                        : new Date();
                      const target = new Date(
                        Number.isNaN(baseDate.getTime()) ? Date.now() : baseDate.getTime()
                      );
                      target.setDate(target.getDate() + chip.days);
                      const yyyy = target.getFullYear();
                      const mm = String(target.getMonth() + 1).padStart(2, '0');
                      const dd = String(target.getDate()).padStart(2, '0');
                      const isoTarget = `${yyyy}-${mm}-${dd}`;
                      const isActive = followUpDate === isoTarget;

                      return (
                        <button
                          key={chip.days}
                          type="button"
                          onClick={() => setFollowUpDate(isoTarget)}
                          className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-teal-600 text-white border-teal-600 font-bold shadow-2xs'
                              : 'bg-slate-50 hover:bg-teal-50 text-slate-700 hover:text-teal-900 border-slate-200 hover:border-teal-300 font-semibold'
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                    {followUpDate && (
                      <button
                        type="button"
                        onClick={() => setFollowUpDate('')}
                        className="px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* STEP 5: BANGLA DENTAL CARE & POST-TREATMENT INSTRUCTIONS */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-teal-600 text-white text-xs font-extrabold flex items-center justify-center shadow-2xs">
                        5
                      </span>
                      <span>দাঁতের যত্ন ও চিকিৎসা-পরবর্তী নির্দেশনা</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      রোগীর বোঝার সুবিধার্থে বাংলায় (অথবা ইংরেজিতে) যত্ন ও পরামর্শ লিখুন অথবা নমুনা নির্দেশনা যুক্ত করে প্রয়োজনমতো পরিবর্তন করুন।
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {BANGLA_CARE_CATEGORIES.map((cat, index) => {
                    const stateEntry = careStateMap[cat.key];
                    const isLastFullWidth = index === BANGLA_CARE_CATEGORIES.length - 1;
                    return (
                      <div
                        key={cat.key}
                        className={`space-y-1 ${isLastFullWidth ? 'md:col-span-2' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="font-semibold text-slate-800">{cat.titleBn}</label>
                          {!stateEntry.val.trim() && (
                            <button
                              type="button"
                              onClick={() => stateEntry.setter(BANGLA_DENTAL_PRESETS[cat.key])}
                              className="text-[10px] font-semibold text-teal-700 hover:underline cursor-pointer shrink-0"
                            >
                              + নমুনা নির্দেশনা যুক্ত করুন
                            </button>
                          )}
                        </div>
                        <textarea
                          rows={2}
                          value={stateEntry.val}
                          onChange={(e) => stateEntry.setter(e.target.value)}
                          placeholder={cat.placeholder}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving || !selectedPatientId || (Boolean(editingPrescription) && !visitId)}
              onClick={() => handleSave('draft')}
              className="px-4 py-2 text-xs font-bold rounded-xl border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save as Draft'}</span>
            </button>

            <button
              type="button"
              disabled={saving || !selectedPatientId || (Boolean(editingPrescription) && !visitId)}
              onClick={() => handleSave('preview')}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-900 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Save &amp; Preview</span>
            </button>

            <button
              type="button"
              disabled={saving || !selectedPatientId || (Boolean(editingPrescription) && !visitId)}
              onClick={() => handleSave('finalize')}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-teal-600 hover:bg-teal-700 text-white shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Finalize Prescription</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
