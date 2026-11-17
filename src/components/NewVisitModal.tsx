import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { Patient, User } from '../types/index.ts';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  Clock,
  User as UserIcon,
  Stethoscope,
  Radio,
  Receipt,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface NewVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVisitCreated: (visit: any) => void;
  defaultPatient?: Patient | null;
}

const COMMON_TREATMENTS = [
  { name: 'Dental Examination & Consultation', cost: 500 },
  { name: 'Composite Dental Filling', cost: 1500 },
  { name: 'Root Canal Treatment (RCT - Molar)', cost: 5000 },
  { name: 'Root Canal Treatment (RCT - Anterior)', cost: 3500 },
  { name: 'Tooth Extraction (Simple)', cost: 1200 },
  { name: 'Surgical Disimpaction (Wisdom Tooth)', cost: 6000 },
  { name: 'Ultrasonic Scaling & Polishing', cost: 2000 },
  { name: 'Porcelain Fused to Metal (PFM) Crown', cost: 4500 },
  { name: 'All-Ceramic Zirconia Crown', cost: 8500 },
  { name: 'Dental Implant (Titanium Fixture)', cost: 45000 },
];

const COMMON_TESTS = [
  { name: 'Intraoral Periapical Radiograph (IOPA)', category: 'IOPA', cost: '' },
  { name: 'Orthopantomogram (OPG - Full Mouth)', category: 'OPG', cost: '' },
  { name: 'Dental Cone Beam CT (CBCT)', category: 'CBCT', cost: '' },
  { name: 'Bite-wing X-ray', category: 'Dental X-ray', cost: '' },
  { name: 'Blood Glucose Test (Random)', category: 'Other', cost: '' },
];

export const NewVisitModal: React.FC<NewVisitModalProps> = ({
  isOpen,
  onClose,
  onVisitCreated,
  defaultPatient,
}) => {
  const { user } = useAuth();
  const [patientsList, setPatientsList] = useState<Patient[]>([]);
  const [doctorsList, setDoctorsList] = useState<User[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | ''>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<number>(user?.id || 1);
  const [collectorDoctorId, setCollectorDoctorId] = useState<number>(user?.id || 1);
  const [patientSearch, setPatientSearch] = useState('');
  const [isSwitchingPatient, setIsSwitchingPatient] = useState(false);

  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [visitTime, setVisitTime] = useState(new Date().toTimeString().slice(0, 5));
  const [complaints, setComplaints] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');

  // Financial inputs
  const [additionalCharges, setAdditionalCharges] = useState('0');
  const [discount, setDiscount] = useState('0');

  // Treatments list
  const [treatments, setTreatments] = useState<
    { treatmentName: string; description: string; toothNumber: string; cost: string }[]
  >([]);

  // Tests / X-rays list
  const [tests, setTests] = useState<
    { testName: string; category: string; description: string; cost: string }[]
  >([]);

  // Initial Payment
  const [recordInitialPayment, setRecordInitialPayment] = useState(false);
  const [initialPayMode, setInitialPayMode] = useState<'full' | 'partial'>('full');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank transfer' | 'Other'>('Cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousCarriedDue, setPreviousCarriedDue] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      // Clean slate on every open
      setError(null);
      setLoading(false);
      setComplaints('');
      setDiagnosis('');
      setNotes('');
      setNextFollowUpDate('');
      setAdditionalCharges('0');
      setDiscount('0');
      setTreatments([]);
      setTests([]);
      setRecordInitialPayment(false);
      setInitialPayMode('full');
      setPaymentAmount('');
      setPaymentMethod('Cash');
      setTransactionRef('');
      setPaymentNote('');
      setPatientSearch('');
      setIsSwitchingPatient(false);
      setVisitDate(new Date().toISOString().split('T')[0]);
      setVisitTime(new Date().toTimeString().slice(0, 5));

      // Only fetch full patient list if no defaultPatient is provided
      if (!defaultPatient?.id) {
        api.getPatients().then((list) => {
          setPatientsList(list);
        }).catch(console.error);
      }

      if (doctorsList.length === 0) {
        api.getDoctors().then((docs) => {
          setDoctorsList(docs);
          if (user?.id) {
            setSelectedDoctorId(user.id);
            setCollectorDoctorId(user.id);
          } else if (docs.length > 0) {
            setSelectedDoctorId(docs[0].id);
            setCollectorDoctorId(docs[0].id);
          }
        }).catch(console.error);
      } else if (user?.id) {
        setSelectedDoctorId(user.id);
        setCollectorDoctorId(user.id);
      }

      if (defaultPatient?.id) {
        setSelectedPatientId(defaultPatient.id);
      } else {
        setSelectedPatientId('');
        setPreviousCarriedDue(0);
      }
    }
  }, [isOpen, defaultPatient, user]);

  // Lazy-fetch full patient list only when user explicitly clicks "Change patient"
  useEffect(() => {
    if (isOpen && isSwitchingPatient && patientsList.length === 0) {
      api.getPatients().then(setPatientsList).catch(console.error);
    }
  }, [isOpen, isSwitchingPatient, patientsList.length]);

  // Whenever selectedPatientId changes, load that patient's current carried-forward balance
  useEffect(() => {
    if (!isOpen) return;
    const pid =
      typeof selectedPatientId === 'number'
        ? selectedPatientId
        : parseInt(String(selectedPatientId));
    if (!pid || isNaN(pid)) {
      setPreviousCarriedDue(0);
      return;
    }

    if (!isSwitchingPatient && defaultPatient?.id === pid) {
      const embeddedDue =
        (defaultPatient as any).financialSummary?.totalOutstandingDue ?? defaultPatient.totalDue;
      if (typeof embeddedDue === 'number' && Number.isFinite(embeddedDue)) {
        setPreviousCarriedDue(embeddedDue);
        return;
      }
    }

    const fromList = patientsList.find((p) => p.id === pid);
    if (fromList && typeof fromList.totalDue === 'number' && Number.isFinite(fromList.totalDue)) {
      setPreviousCarriedDue(fromList.totalDue);
      return;
    }

    api
      .getPatient(pid)
      .then((fp) => {
        setPreviousCarriedDue(fp?.financialSummary?.totalOutstandingDue || 0);
      })
      .catch(() => setPreviousCarriedDue(0));
  }, [isOpen, selectedPatientId, isSwitchingPatient, defaultPatient]);

  if (!isOpen) return null;

  // Financial calculations (including carried-forward due from previous visits)
  const totalTreatmentCost = treatments.reduce(
    (sum, t) => sum + (parseFloat(t.cost) || 0),
    0
  );
  const totalTestCost = tests.reduce(
    (sum, t) => sum + (parseFloat(t.cost) || 0),
    0
  );
  const addCharges = parseFloat(additionalCharges) || 0;
  const disc = parseFloat(discount) || 0;
  const totalVisitCost = Math.max(0, totalTreatmentCost + totalTestCost + addCharges - disc);
  const cumulativePayable = Number((previousCarriedDue + totalVisitCost).toFixed(2));

  const effectivePaymentAmount =
    recordInitialPayment && initialPayMode === 'full'
      ? cumulativePayable.toString()
      : paymentAmount;
  const initialPay = recordInitialPayment ? parseFloat(effectivePaymentAmount) || 0 : 0;
  const outstandingDue = Math.max(0, Number((cumulativePayable - initialPay).toFixed(2)));

  // Add Treatment item
  const handleAddTreatment = (preset?: { name: string; cost: number }) => {
    setTreatments([
      ...treatments,
      {
        treatmentName: preset?.name || '',
        description: '',
        toothNumber: '',
        cost: preset?.cost ? preset.cost.toString() : '0',
      },
    ]);
  };

  const handleRemoveTreatment = (index: number) => {
    setTreatments(treatments.filter((_, i) => i !== index));
  };

  // Add Test item
  const handleAddTest = (preset?: { name: string; category: string; cost?: string | number }) => {
    setTests([
      ...tests,
      {
        testName: preset?.name || '',
        category: preset?.category || 'Dental X-ray',
        description: '',
        cost: preset?.cost ? String(preset.cost) : '',
      },
    ]);
  };

  const handleRemoveTest = (index: number) => {
    setTests(tests.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pid = typeof selectedPatientId === 'number' ? selectedPatientId : parseInt(String(selectedPatientId));
    if (!pid || isNaN(pid)) {
      setError('Please select a patient for this visit.');
      return;
    }

    if (recordInitialPayment && initialPay > cumulativePayable + 0.01) {
      setError(
        `Initial payment (৳${initialPay.toLocaleString()}) cannot exceed total cumulative payable (৳${cumulativePayable.toLocaleString()}).`
      );
      return;
    }

    setLoading(true);
    try {
      const payload = {
        patientId: pid,
        doctorId: Number(selectedDoctorId) || user?.id || 1,
        visitDate,
        visitTime,
        complaints: complaints.trim(),
        diagnosis: diagnosis.trim(),
        notes: notes.trim(),
        nextFollowUpDate: nextFollowUpDate.trim() || null,
        additionalCharges: addCharges,
        discount: disc,
        initialTreatments: treatments
          .filter((t) => t.treatmentName.trim().length > 0 || (parseFloat(t.cost) || 0) > 0)
          .map((t) => ({
            treatmentName: t.treatmentName.trim() || 'Dental Treatment',
            description: t.description?.trim() || '',
            toothNumber: t.toothNumber?.trim() || '',
            cost: parseFloat(t.cost) || 0,
          })),
        initialTests: tests
          .filter((t) => t.testName.trim().length > 0 || (parseFloat(t.cost) || 0) > 0)
          .map((t) => ({
            testName: t.testName.trim() || 'Diagnostic Test / X-Ray',
            category: t.category || 'Dental X-ray',
            description: t.description?.trim() || '',
            cost: parseFloat(t.cost) || 0,
          })),
        initialPayment:
          recordInitialPayment && initialPay > 0
            ? {
                amount: initialPay,
                paymentMethod,
                transactionRef: transactionRef.trim(),
                receivedBy: Number(collectorDoctorId) || user?.id || 1,
                notes: paymentNote.trim(),
              }
            : null,
      };

      const created = await api.createVisit(payload);
      onVisitCreated(created);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save visit.');
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = patientsList.filter((p) => {
    if (!patientSearch.trim()) return true;
    const q = patientSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.patientId.toLowerCase().includes(q) ||
      p.phone.includes(q)
    );
  });

  const selectedPatientObj =
    (!isSwitchingPatient && defaultPatient) ||
    patientsList.find((p) => p.id === (typeof selectedPatientId === 'number' ? selectedPatientId : parseInt(String(selectedPatientId))));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">Add New Clinic Visit</h3>
              <span className="text-xs bg-teal-100 text-teal-800 font-semibold px-2 py-0.5 rounded border border-teal-200">
                Shared Timeline
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Any authorized doctor can append a visit to any registered patient record.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-6 flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Patient & Attending Doctor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            {/* Patient Selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Patient *
                </label>
                {defaultPatient && !isSwitchingPatient && (
                  <button
                    type="button"
                    onClick={() => setIsSwitchingPatient(true)}
                    className="text-[11px] text-teal-600 hover:text-teal-800 font-semibold hover:underline cursor-pointer"
                  >
                    Change patient
                  </button>
                )}
              </div>

              {defaultPatient && !isSwitchingPatient ? (
                <div className="p-2.5 bg-white border border-teal-300 rounded-lg text-sm shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-extrabold text-teal-700">{defaultPatient.patientId}</span> -{' '}
                      <span className="font-bold text-slate-900">{defaultPatient.name}</span>
                    </div>
                    <span className="text-[11px] font-bold bg-teal-100 text-teal-800 px-2 py-0.5 rounded border border-teal-200">
                      Active
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    <span>Phone: <strong className="text-slate-700">{defaultPatient.phone}</strong></span>
                    {defaultPatient.age && <span>&bull; {defaultPatient.age} yrs, {defaultPatient.gender}</span>}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    placeholder="Search by ID (e.g. DP-1001), Name, or Phone..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                  <select
                    required
                    value={selectedPatientId}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value) : '';
                      setSelectedPatientId(val);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    <option value="">Select a registered patient...</option>
                    {filteredPatients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.patientId} - {p.name} ({p.phone})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Attending Doctor */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Attending Doctor *
              </label>
              <select
                value={selectedDoctorId}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setSelectedDoctorId(val);
                  setCollectorDoctorId(val);
                }}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white font-medium"
              >
                {doctorsList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName} ({d.specialization || d.role})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Any doctor can record visits for any patient in the clinic.
              </p>
            </div>

            {/* Patient Health Heads-up if selected */}
            {selectedPatientObj && (
              <div className="sm:col-span-2 text-xs bg-amber-50/70 border border-amber-200/80 p-2.5 rounded-lg flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700">
                <span className="font-bold text-amber-900">Medical Notes:</span>
                <span>
                  <strong>Allergies:</strong> {selectedPatientObj.allergies || 'None reported'}
                </span>
                <span>
                  <strong>Conditions:</strong> {selectedPatientObj.existingDiseases || 'None'}
                </span>
              </div>
            )}

            {/* Visit Date & Time */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Visit Date *
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Visit Time
              </label>
              <div className="relative">
                <input
                  type="time"
                  value={visitTime}
                  onChange={(e) => setVisitTime(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>
          </div>

          {/* Section 2: Complaints & Diagnosis */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Patient Complaints &amp; Symptoms
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Throbbing pain in lower left molar, hot/cold sensitivity, difficulty chewing..."
                value={complaints}
                onChange={(e) => setComplaints(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Clinical Diagnosis / Dental Disease
              </label>
              <input
                type="text"
                placeholder="e.g. Acute Irreversible Pulpitis #36, Chronic Marginal Gingivitis..."
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Section 3: Treatments Performed */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Treatments Performed (Charges)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => handleAddTreatment()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-teal-50 text-teal-700 border border-teal-300 hover:bg-teal-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Treatment Item
              </button>
            </div>

            {/* Quick treatment presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[11px] text-slate-500 font-medium py-0.5">Quick add:</span>
              {COMMON_TREATMENTS.slice(0, 6).map((ct, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAddTreatment(ct)}
                  className="px-2 py-0.5 text-[11px] rounded bg-white border border-slate-200 text-slate-700 hover:border-teal-500 hover:text-teal-700 transition-colors cursor-pointer"
                >
                  + {ct.name} (৳{ct.cost})
                </button>
              ))}
            </div>

            {treatments.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">
                No treatments added yet for this visit. Click &quot;Add Treatment Item&quot; or choose a quick preset above.
              </p>
            ) : (
              <div className="space-y-2 pt-2">
                {treatments.map((t, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 bg-white p-2.5 rounded-lg border border-slate-200 items-center text-xs"
                  >
                    <div className="col-span-5">
                      <input
                        type="text"
                        placeholder="Treatment name (e.g. RCT)"
                        value={t.treatmentName}
                        onChange={(e) => {
                          const updated = [...treatments];
                          updated[idx].treatmentName = e.target.value;
                          setTreatments(updated);
                        }}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded focus:ring-1 focus:ring-teal-500 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Tooth #"
                        value={t.toothNumber}
                        onChange={(e) => {
                          const updated = [...treatments];
                          updated[idx].toothNumber = e.target.value;
                          setTreatments(updated);
                        }}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded focus:ring-1 focus:ring-teal-500 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-3">
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-slate-400 text-xs">৳</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="Cost"
                          value={t.cost}
                          onChange={(e) => {
                            const updated = [...treatments];
                            updated[idx].cost = e.target.value;
                            setTreatments(updated);
                          }}
                          className="w-full pl-5 pr-2 py-1.5 border border-slate-200 rounded focus:ring-1 focus:ring-teal-500 focus:outline-none font-semibold text-slate-800"
                        />
                      </div>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveTreatment(idx)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Diagnostic Tests & X-rays (Mandatory Module) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Diagnostic Tests &amp; X-rays (Charges)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => handleAddTest()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-cyan-50 text-cyan-700 border border-cyan-300 hover:bg-cyan-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Test / X-ray
              </button>
            </div>

            {/* Quick test presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[11px] text-slate-500 font-medium py-0.5">Quick add:</span>
              {COMMON_TESTS.map((ct, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAddTest(ct)}
                  className="px-2 py-0.5 text-[11px] rounded bg-white border border-slate-200 text-slate-700 hover:border-cyan-500 hover:text-cyan-700 transition-colors cursor-pointer"
                >
                  + {ct.name}
                </button>
              ))}
            </div>

            {tests.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">
                No diagnostic tests or radiographs recorded for this visit.
              </p>
            ) : (
              <div className="space-y-2 pt-2">
                {tests.map((t, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 bg-white p-2.5 rounded-lg border border-slate-200 items-center text-xs"
                  >
                    <div className="col-span-4">
                      <input
                        type="text"
                        placeholder="Test Name"
                        value={t.testName}
                        onChange={(e) => {
                          const updated = [...tests];
                          updated[idx].testName = e.target.value;
                          setTests(updated);
                        }}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-3">
                      <select
                        value={t.category}
                        onChange={(e) => {
                          const updated = [...tests];
                          updated[idx].category = e.target.value;
                          setTests(updated);
                        }}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded focus:ring-1 focus:ring-cyan-500 focus:outline-none bg-white"
                      >
                        <option value="Dental X-ray">Dental X-ray</option>
                        <option value="OPG">OPG</option>
                        <option value="IOPA">IOPA</option>
                        <option value="CBCT">CBCT</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="col-span-3">
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-slate-400 text-xs">৳</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="Custom ৳ (Opt.)"
                          value={t.cost}
                          onChange={(e) => {
                            const updated = [...tests];
                            updated[idx].cost = e.target.value;
                            setTests(updated);
                          }}
                          className="w-full pl-5 pr-2 py-1.5 border border-slate-200 rounded focus:ring-1 focus:ring-cyan-500 focus:outline-none font-semibold text-slate-800"
                        />
                      </div>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveTest(idx)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 5: Financial Calculation Box */}
          <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-200 space-y-4">
            <div className="flex items-center gap-2 text-teal-900 font-bold text-xs uppercase tracking-wider">
              <Receipt className="w-4 h-4 text-teal-700" />
              <span>Financial Calculation &amp; Dues Tracking (BDT ৳)</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-teal-100">
                <span className="text-slate-500 block mb-0.5">Treatment Charges</span>
                <span className="font-bold text-slate-900 text-sm">৳{totalTreatmentCost.toLocaleString()}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-teal-100">
                <span className="text-slate-500 block mb-0.5">Test / X-ray Charges</span>
                <span className="font-bold text-slate-900 text-sm">৳{totalTestCost.toLocaleString()}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-teal-100">
                <label className="text-slate-500 block mb-0.5">Other Charges</label>
                <div className="flex items-center">
                  <span className="text-slate-400 text-xs mr-1">৳</span>
                  <input
                    type="number"
                    min="0"
                    value={additionalCharges}
                    onChange={(e) => setAdditionalCharges(e.target.value)}
                    className="w-full font-bold text-slate-900 text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-teal-100">
                <label className="text-slate-500 block mb-0.5">Discount</label>
                <div className="flex items-center">
                  <span className="text-slate-400 text-xs mr-1">৳</span>
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-full font-bold text-slate-900 text-sm focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Total Cost & Cumulative Payable Display */}
            <div className="p-3.5 bg-white rounded-lg border border-teal-200 space-y-2.5">
              {previousCarriedDue > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 text-xs">
                  <span className="text-amber-800 font-semibold">
                    Previous Carried-Forward Due (from earlier visit) + New Visit Cost:
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    <strong className="text-amber-800">৳{previousCarriedDue.toLocaleString()}</strong> +{' '}
                    <strong className="text-teal-800">৳{totalVisitCost.toLocaleString()}</strong> ={' '}
                    <strong className="text-slate-950 font-extrabold">৳{cumulativePayable.toLocaleString()}</strong>
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-slate-500 block font-medium">
                    {previousCarriedDue > 0
                      ? `New Visit Net Charges: ৳${totalVisitCost.toLocaleString()} • Total Cumulative Payable:`
                      : 'Total Visit Cost (Treatments + Tests + Other - Discount):'}
                  </span>
                  <span className="text-xl font-extrabold text-teal-800 font-mono">
                    ৳{cumulativePayable.toLocaleString()}
                  </span>
                </div>

                {/* Initial Payment Checkbox */}
                <div>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={recordInitialPayment}
                      onChange={(e) => {
                        setRecordInitialPayment(e.target.checked);
                        if (e.target.checked) {
                          setInitialPayMode('full');
                          setPaymentAmount(cumulativePayable.toString());
                        }
                      }}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span>Receive Payment Now</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Payment Fields */}
            {recordInitialPayment && (
              <div className="p-3.5 bg-white rounded-lg border border-teal-200 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <span className="font-bold text-slate-800">Payment Mode:</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setInitialPayMode('full');
                        setPaymentAmount(cumulativePayable.toString());
                      }}
                      className={`px-2.5 py-1 rounded font-bold transition-colors cursor-pointer ${
                        initialPayMode === 'full'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Pay Full Balance (৳{cumulativePayable.toLocaleString()})
                    </button>
                    {previousCarriedDue > 0 && totalVisitCost > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setInitialPayMode('partial');
                          setPaymentAmount(totalVisitCost.toString());
                        }}
                        className="px-2.5 py-1 rounded font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
                      >
                        This Visit Only (৳{totalVisitCost.toLocaleString()})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setInitialPayMode('partial');
                        if (!paymentAmount || parseFloat(paymentAmount) === cumulativePayable) {
                          setPaymentAmount(Math.round(cumulativePayable * 0.5).toString());
                        }
                      }}
                      className={`px-2.5 py-1 rounded font-bold transition-colors cursor-pointer ${
                        initialPayMode === 'partial'
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Partial Installment
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Amount Received (৳) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={cumulativePayable}
                      value={effectivePaymentAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPaymentAmount(val);
                        if (Math.abs((parseFloat(val) || 0) - cumulativePayable) < 0.01) {
                          setInitialPayMode('full');
                        } else {
                          setInitialPayMode('partial');
                        }
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-bold text-slate-900 focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Payment Method *
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-medium"
                    >
                      <option value="Cash">Cash</option>
                      <option value="bKash">bKash</option>
                      <option value="Nagad">Nagad</option>
                      <option value="Bank transfer">Bank transfer</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Collected / Received By *
                    </label>
                    <select
                      value={collectorDoctorId}
                      onChange={(e) => setCollectorDoctorId(parseInt(e.target.value))}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-medium"
                    >
                      {doctorsList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Transaction / TrxID Ref
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. BK-987654"
                      value={transactionRef}
                      onChange={(e) => setTransactionRef(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Payment Note / Purpose (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Optional note for this payment receipt..."
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Calculated Remaining Due */}
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-semibold text-slate-700">
                Calculated Latest Remaining Due After This Visit:
              </span>
              <span className={`font-bold text-sm font-mono ${outstandingDue > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                ৳{outstandingDue.toLocaleString()}
                {outstandingDue === 0 ? ' (Fully Paid)' : ' (Due)'}
              </span>
            </div>
          </div>

          {/* Section 6: Next Follow-up & Clinical Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Next Follow-Up Date (Optional)
              </label>
              <input
                type="date"
                value={nextFollowUpDate}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Doctor Notes / Post-treatment Instructions
              </label>
              <input
                type="text"
                placeholder="Prescribed analgesics, warm saline rinse, avoid chewing on treated side..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Recording Visit...' : 'Save Visit Record'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
