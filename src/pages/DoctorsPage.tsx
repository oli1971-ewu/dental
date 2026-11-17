import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import { User } from '../types/index.ts';
import {
  Plus,
  Shield,
  Code,
  Stethoscope,
  Power,
  KeyRound,
  Edit2,
  AlertCircle,
} from 'lucide-react';

interface DoctorsPageProps {
  refreshKey?: number;
  onOpenDoctorModal: (doctor?: User) => void;
}

export const DoctorsPage: React.FC<DoctorsPageProps> = ({ refreshKey, onOpenDoctorModal }) => {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetModalDoc, setResetModalDoc] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmToggleDoc, setConfirmToggleDoc] = useState<User | null>(null);

  useEffect(() => {
    fetchDoctors();
  }, [refreshKey]);

  const fetchDoctors = async () => {
    setLoading(true);
    try {
      const data = await api.getDoctors();
      setDoctors(
        user?.role === 'developer'
          ? data
          : data.filter((d) => d.role !== 'developer')
      );
    } catch (e) {
      console.error('Failed to load doctors:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (doc: User) => {
    setActionError(null);
    if (doc.id === user?.id) {
      setActionError('You cannot deactivate your own account.');
      return;
    }
    setConfirmToggleDoc(doc);
  };

  const confirmToggleAccountStatus = async () => {
    if (!confirmToggleDoc) return;
    setActionError(null);
    try {
      await api.toggleDoctorStatus(confirmToggleDoc.id);
      setConfirmToggleDoc(null);
      fetchDoctors();
    } catch (e: any) {
      setActionError(e.message || 'Failed to toggle status');
      setConfirmToggleDoc(null);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalDoc || !newPassword) return;
    setResetError(null);
    try {
      await api.resetDoctorPassword(resetModalDoc.id, newPassword);
      setResetSuccess(`Password updated for ${resetModalDoc.fullName}`);
      setNewPassword('');
      setTimeout(() => {
        setResetModalDoc(null);
        setResetSuccess(null);
      }, 1500);
    } catch (e: any) {
      setResetError(e.message || 'Failed to reset password');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Doctor &amp; Staff Account Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Individual accounts, clinical specializations, performance metrics, and access permissions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenDoctorModal()}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Doctor Account</span>
        </button>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-8 text-center text-slate-400 text-xs">
            Loading doctor accounts...
          </div>
        ) : (
          doctors.map((doc) => {
            const isSelf = doc.id === user?.id;
            return (
              <div
                key={doc.id}
                className={`bg-white rounded-xl border p-5 shadow-xs space-y-4 flex flex-col justify-between ${
                  doc.isActive ? 'border-slate-200' : 'border-red-200 bg-red-50/20'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm shrink-0">
                        {doc.role === 'main_doctor' ? (
                          <Shield className="w-5 h-5 text-emerald-600" />
                        ) : doc.role === 'developer' ? (
                          <Code className="w-5 h-5 text-purple-600" />
                        ) : (
                          <Stethoscope className="w-5 h-5 text-teal-600" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{doc.fullName}</h3>
                        <div className="text-[11px] text-slate-500">@{doc.username}</div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                        doc.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}
                    >
                      {doc.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </div>

                  <div className="text-xs space-y-1 text-slate-600 pt-1 border-t border-slate-100">
                    <div>
                      <strong className="text-slate-800">Specialization:</strong>{' '}
                      {doc.specialization || 'General Dental Surgery'}
                    </div>
                    {doc.qualifications && (
                      <div className="text-[11px] text-slate-500 italic">
                        {doc.qualifications}
                      </div>
                    )}
                    {doc.phone && <div><strong>Phone:</strong> {doc.phone}</div>}
                    {doc.email && <div><strong>Email:</strong> {doc.email}</div>}
                  </div>

                  {/* Clinical Statistics */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase">Visits</span>
                      <strong className="text-slate-900 text-sm font-bold">{doc.totalVisits || 0}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase">Patients</span>
                      <strong className="text-teal-700 text-sm font-bold">{doc.uniquePatients || 0}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase">Today</span>
                      <strong className="text-emerald-700 text-sm font-bold">{doc.todayVisits || 0}</strong>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => onOpenDoctorModal(doc)}
                    className="text-slate-600 hover:text-teal-700 flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setResetModalDoc(doc)}
                      className="text-slate-600 hover:text-blue-700 flex items-center gap-1 font-semibold cursor-pointer"
                      title="Reset Account Password"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Password</span>
                    </button>

                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(doc)}
                        className={`flex items-center gap-1 font-semibold cursor-pointer ${
                          doc.isActive ? 'text-red-600 hover:text-red-800' : 'text-emerald-600 hover:text-emerald-800'
                        }`}
                        title={doc.isActive ? 'Deactivate account' : 'Activate account'}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{doc.isActive ? 'Deactivate' : 'Activate'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Admin Reset Password Modal */}
      {resetModalDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full p-5 space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 text-sm">
              Reset Password for {resetModalDoc.fullName}
            </h3>
            {resetError && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{resetError}</span>
              </div>
            )}
            {resetSuccess ? (
              <div className="p-3 bg-emerald-50 text-emerald-800 rounded font-semibold text-center">
                {resetSuccess}
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    New Password (Min 6 chars)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetModalDoc(null);
                      setResetError(null);
                    }}
                    className="px-3 py-1.5 text-slate-600 border border-slate-300 rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded font-semibold cursor-pointer"
                  >
                    Reset Password
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Confirm Account Activation / Deactivation Modal */}
      {confirmToggleDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full p-5 space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 text-sm">
              {confirmToggleDoc.isActive ? 'Deactivate Account' : 'Activate Account'}
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Are you sure you want to {confirmToggleDoc.isActive ? 'deactivate' : 'activate'}{' '}
              <strong className="text-slate-900">{confirmToggleDoc.fullName}</strong>&apos;s account?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmToggleDoc(null)}
                className="px-3 py-1.5 text-slate-600 border border-slate-300 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmToggleAccountStatus}
                className={`px-3 py-1.5 text-white rounded font-semibold cursor-pointer ${
                  confirmToggleDoc.isActive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {confirmToggleDoc.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
