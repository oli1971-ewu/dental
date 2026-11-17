import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { Patient } from '../types/index.ts';
import { api } from '../services/api.ts';
import { X, AlertTriangle, CheckCircle2, User, Phone, MapPin, HeartPulse, FileText } from 'lucide-react';

interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (patient: Patient) => void;
  onSavedAndCreatePrescription?: (patient: Patient) => void;
  patientToEdit?: Patient | null;
}

export const PatientModal: React.FC<PatientModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  onSavedAndCreatePrescription,
  patientToEdit,
}) => {
  const { prescriptionManagementEnabled } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    altPhone: '',
    age: '',
    gender: 'Male',
    address: '',
    registrationDate: new Date().toISOString().split('T')[0],
    medicalHistory: '',
    allergies: '',
    existingDiseases: '',
    notes: '',
  });

  const [duplicates, setDuplicates] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (patientToEdit) {
      setFormData({
        name: patientToEdit.name || '',
        phone: patientToEdit.phone || '',
        altPhone: patientToEdit.altPhone || '',
        age: patientToEdit.age?.toString() || '',
        gender: patientToEdit.gender || 'Male',
        address: patientToEdit.address || '',
        registrationDate: patientToEdit.registrationDate || new Date().toISOString().split('T')[0],
        medicalHistory: patientToEdit.medicalHistory || '',
        allergies: patientToEdit.allergies || '',
        existingDiseases: patientToEdit.existingDiseases || '',
        notes: patientToEdit.notes || '',
      });
      setDuplicates([]);
    } else {
      setFormData({
        name: '',
        phone: '',
        altPhone: '',
        age: '',
        gender: 'Male',
        address: '',
        registrationDate: new Date().toISOString().split('T')[0],
        medicalHistory: '',
        allergies: '',
        existingDiseases: '',
        notes: '',
      });
      setDuplicates([]);
    }
  }, [patientToEdit, isOpen]);

  // Duplicate phone/name check
  const handlePhoneBlur = async () => {
    if (patientToEdit || !formData.phone || formData.phone.length < 5) return;
    try {
      const res = await api.checkDuplicatePatient({
        phone: formData.phone,
        name: formData.name,
      });
      setDuplicates(res.duplicates);
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  const savePatient = async (openPrescriptionAfter = false) => {
    setError(null);

    if (!formData.name.trim() || !formData.phone.trim()) {
      setError('Patient Name and Phone Number are mandatory.');
      return;
    }

    setLoading(true);
    try {
      if (patientToEdit) {
        const updated = await api.updatePatient(patientToEdit.id, {
          name: formData.name,
          phone: formData.phone,
          altPhone: formData.altPhone || null,
          age: formData.age ? parseInt(formData.age) : null,
          gender: formData.gender as any,
          address: formData.address,
          medicalHistory: formData.medicalHistory,
          allergies: formData.allergies,
          existingDiseases: formData.existingDiseases,
          notes: formData.notes,
        });
        onSaved(updated);
      } else {
        const created = await api.createPatient({
          name: formData.name,
          phone: formData.phone,
          altPhone: formData.altPhone || null,
          age: formData.age ? parseInt(formData.age) : null,
          gender: formData.gender as any,
          address: formData.address,
          registrationDate: formData.registrationDate,
          medicalHistory: formData.medicalHistory,
          allergies: formData.allergies,
          existingDiseases: formData.existingDiseases,
          notes: formData.notes,
        });
        if (openPrescriptionAfter && onSavedAndCreatePrescription) {
          onSavedAndCreatePrescription(created);
        } else {
          onSaved(created);
        }
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save patient.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await savePatient(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {patientToEdit ? `Edit Patient (${patientToEdit.patientId})` : 'Register New Patient'}
            </h3>
            <p className="text-xs text-slate-500">
              {patientToEdit
                ? 'Update patient demographics and health background.'
                : 'Centralized permanent record shared across all clinic doctors.'}
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
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5 flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Duplicate check warning */}
          {!patientToEdit && duplicates.length > 0 && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Possible Duplicate Patient Found!</span>
              </div>
              <p>
                A patient with matching contact information already exists in the centralized clinic database:
              </p>
              <div className="space-y-1.5 pl-2 border-l-2 border-amber-400">
                {duplicates.map((dup) => (
                  <div key={dup.id} className="font-medium text-slate-800">
                    <span className="font-bold text-teal-700">{dup.patientId}</span>: {dup.name} ({dup.gender}, Age: {dup.age || 'N/A'}) - Phone: {dup.phone}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-amber-700">
                Do not register duplicate profiles. All doctors must add visits under the patient’s existing Patient ID!
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Patient Name */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Patient Name *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. Tanvir Hasan"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* Primary Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number (Primary) *
              </label>
              <div className="relative">
                <input
                  type="tel"
                  required
                  placeholder="e.g. 01712345678"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  onBlur={handlePhoneBlur}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* Alternative Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alternative Phone (Optional)
              </label>
              <div className="relative">
                <input
                  type="tel"
                  placeholder="e.g. 01898765432"
                  value={formData.altPhone}
                  onChange={(e) => setFormData({ ...formData, altPhone: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* Age & Gender */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Age (Years)
              </label>
              <input
                type="number"
                min="1"
                max="120"
                placeholder="e.g. 34"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Gender *
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Registration Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Registration Date
              </label>
              <input
                type="date"
                value={formData.registrationDate}
                onChange={(e) => setFormData({ ...formData, registrationDate: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Address / Location (Bangladesh)
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Uttara, Dhaka"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>
          </div>

          {/* Section: Medical Background */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2 mb-3 text-slate-800 font-bold text-xs uppercase tracking-wider">
              <HeartPulse className="w-4 h-4 text-teal-600" />
              <span>Medical History &amp; Clinical Background</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Existing Diseases / Conditions (e.g. Diabetes, Hypertension, Cardiac, Asthma)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hypertension, Type 2 Diabetes"
                  value={formData.existingDiseases}
                  onChange={(e) => setFormData({ ...formData, existingDiseases: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Known Drug &amp; Material Allergies (e.g. Penicillin, Sulfa, Latex, Lidocaine)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Penicillin allergy (urticaria)"
                  value={formData.allergies}
                  onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-red-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  General Medical History &amp; Current Medications
                </label>
                <textarea
                  rows={2}
                  placeholder="Details on medications, surgeries, bleeding tendencies..."
                  value={formData.medicalHistory}
                  onChange={(e) => setFormData({ ...formData, medicalHistory: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Additional Notes
                </label>
                <input
                  type="text"
                  placeholder="Patient preferences, referral information, etc."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="pt-4 border-t border-slate-200 flex flex-wrap justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {!patientToEdit && prescriptionManagementEnabled && onSavedAndCreatePrescription && (
              <button
                type="button"
                disabled={loading}
                onClick={() => savePatient(true)}
                className="px-4 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-4 h-4 text-teal-700" />
                <span>{loading ? 'Saving...' : 'Save & Create Prescription'}</span>
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Saving...' : patientToEdit ? 'Save Changes' : 'Register Patient'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
