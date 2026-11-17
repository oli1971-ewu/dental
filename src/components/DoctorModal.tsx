import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import { User } from '../types/index.ts';
import { X, UserCheck, CheckCircle2, AlertCircle } from 'lucide-react';

interface DoctorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (doctor: User) => void;
  doctorToEdit?: User | null;
}

export const DoctorModal: React.FC<DoctorModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  doctorToEdit,
}) => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    email: '',
    phone: '',
    specialization: '',
    qualifications: '',
    registrationNumber: '',
    role: 'doctor',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (doctorToEdit) {
      setFormData({
        username: doctorToEdit.username,
        password: '',
        fullName: doctorToEdit.fullName,
        email: doctorToEdit.email || '',
        phone: doctorToEdit.phone || '',
        specialization: doctorToEdit.specialization || '',
        qualifications: doctorToEdit.qualifications || '',
        registrationNumber: doctorToEdit.registrationNumber || '',
        role: doctorToEdit.role,
      });
    } else {
      setFormData({
        username: '',
        password: '',
        fullName: '',
        email: '',
        phone: '',
        specialization: '',
        qualifications: '',
        registrationNumber: '',
        role: 'doctor',
      });
    }
  }, [doctorToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!doctorToEdit && (!formData.username.trim() || !formData.password.trim())) {
      setError('Username and password are required for new accounts.');
      return;
    }

    if (!formData.fullName.trim()) {
      setError('Full name is required.');
      return;
    }

    setLoading(true);
    try {
      if (doctorToEdit) {
        const updated = await api.updateDoctor(doctorToEdit.id, {
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          specialization: formData.specialization,
          qualifications: formData.qualifications,
          registrationNumber: formData.registrationNumber,
        });
        onSaved(updated);
      } else {
        const created = await api.createDoctor({
          username: formData.username,
          password: formData.password,
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          specialization: formData.specialization,
          qualifications: formData.qualifications,
          registrationNumber: formData.registrationNumber,
          role: formData.role as any,
        });
        onSaved(created);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save doctor account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-teal-600" />
            <h3 className="font-bold text-slate-900 text-sm">
              {doctorToEdit ? `Edit Profile: ${doctorToEdit.fullName}` : 'Create Doctor Account'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Full Name (with Title) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Dr. Sabrina Akhter"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {!doctorToEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. dr_sabrina"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Initial Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Min 6 characters"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="017XXXXXXXX"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="doctor@dhakadentalcare.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Specialization / Department
            </label>
            <input
              type="text"
              placeholder="e.g. Endodontics, Orthodontics, Oral Surgery"
              value={formData.specialization}
              onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Qualifications &amp; Degrees
            </label>
            <input
              type="text"
              placeholder="e.g. BDS (DDC), FCPS (Part-II), PGT"
              value={formData.qualifications}
              onChange={(e) => setFormData({ ...formData, qualifications: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Registration / BMDC Number (for Prescriptions)
            </label>
            <input
              type="text"
              placeholder="e.g. BMDC Reg: A-51904"
              value={formData.registrationNumber}
              onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {!doctorToEdit && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Account Role
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="doctor">Doctor (Centralized Patient Access)</option>
                <option value="main_doctor">Main Doctor (Super Admin)</option>
              </select>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-white bg-teal-600 hover:bg-teal-700 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{loading ? 'Saving...' : doctorToEdit ? 'Update Profile' : 'Create Account'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
