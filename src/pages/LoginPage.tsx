import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import {
  Activity,
  Lock,
  User as UserIcon,
  Sparkles,
  Shield,
  Stethoscope,
  AlertCircle,
  KeyRound,
  CheckCircle2,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, loginWithGoogle, quickSwitch } = useAuth();
  const [username, setUsername] = useState('maindoctor');
  const [password, setPassword] = useState('ClinicAdmin@2026');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Developer Emergency Recovery Modal (only accessible when typing dev_admin)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newDevPassword, setNewDevPassword] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryResult, setRecoveryResult] = useState<{
    username: string;
    currentPassword: string;
    message: string;
  } | null>(null);

  const normalizedTypedUser = username.trim().toLowerCase();
  const isTypingDeveloper =
    normalizedTypedUser === 'dev_admin' ||
    normalizedTypedUser === 'developer' ||
    normalizedTypedUser === 'aminulislamaymon@gmail.com' ||
    normalizedTypedUser === 'aymon@dentalcare.com';

  const handleUsernameChange = (nextVal: string) => {
    setUsername(nextVal);
    if (nextVal.trim().toLowerCase() !== 'maindoctor' && password === 'ClinicAdmin@2026') {
      setPassword('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (userKey: string) => {
    setError(null);
    setLoading(true);
    try {
      await quickSwitch(userKey);
    } catch (err: any) {
      setError(err.message || 'Quick login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDeveloperRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    setRecoveryResult(null);
    setRecoveryLoading(true);
    try {
      const res = await api.recoverDeveloperPassword({
        recoveryKey: recoveryKey.trim(),
        newPassword: newDevPassword.trim() || undefined,
      });
      setRecoveryResult(res);
      setUsername(res.username);
      setPassword(res.currentPassword);
    } catch (err: any) {
      setRecoveryError(err.message || 'Invalid recovery key.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center text-white shadow-xl mb-4">
          <Activity className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">
          Dental Care
        </h2>
        <p className="mt-1 text-xs text-teal-300 font-semibold uppercase tracking-wider">
          Patient Tracking &amp; Multi-Doctor Management • BDT ৳
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Centralized Patient Records, Digital Prescriptions &amp; Follow-Up System
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-7 px-5 sm:px-8 shadow-2xl rounded-2xl border border-slate-200 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Standard Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Doctor / Staff Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. maindoctor or dr_rahim"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                {isTypingDeveloper && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowRecoveryModal(true);
                      setRecoveryError(null);
                      setRecoveryResult(null);
                    }}
                    className="text-[11px] font-semibold text-purple-700 hover:text-purple-900 underline cursor-pointer"
                  >
                    Forgot Developer Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In to Dental Care'}</span>
            </button>
          </form>

          {/* Google Sign-in */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white text-slate-500">or sign in with</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-2.5 px-4 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Google Account</span>
          </button>

          {/* 1-Click Clinic Doctor Demo Buttons (Developer account excluded for client demo) */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>1-Click Clinic Role Switch / Quick Login:</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => handleQuickLogin('maindoctor')}
                className="w-full text-left p-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 transition-colors flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-bold">Prof. Dr. Rahman (Main Doctor)</div>
                    <div className="text-[11px] text-emerald-700">Super Admin • All Clinic Modules</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-emerald-200/80 px-2 py-0.5 rounded text-emerald-800 shrink-0">1-Click</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('dr_rahim')}
                className="w-full text-left p-2.5 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 transition-colors flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-teal-600 shrink-0" />
                  <div>
                    <div className="font-bold">Doctor A (Dr. Rahim Chowdhury)</div>
                    <div className="text-[11px] text-teal-700">Created 1st Visit (Exam &amp; IOPA)</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-teal-200/80 px-2 py-0.5 rounded text-teal-800 shrink-0">1-Click</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('dr_fatima')}
                className="w-full text-left p-2.5 rounded-lg bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-900 transition-colors flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-cyan-600 shrink-0" />
                  <div>
                    <div className="font-bold">Doctor B (Dr. Fatima Akter)</div>
                    <div className="text-[11px] text-cyan-700">Views Doc A notes &bull; RCT</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-cyan-200/80 px-2 py-0.5 rounded text-cyan-800 shrink-0">1-Click</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('dr_tariq')}
                className="w-full text-left p-2.5 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 transition-colors flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-sky-600 shrink-0" />
                  <div>
                    <div className="font-bold">Doctor C (Dr. Tariqul Islam)</div>
                    <div className="text-[11px] text-sky-700">Views Doc A &amp; B &bull; Crown &amp; OPG</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-sky-200/80 px-2 py-0.5 rounded text-sky-800 shrink-0">1-Click</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Developer Emergency Password Recovery Modal */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 bg-purple-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-purple-300" />
                <h3 className="text-sm font-bold">Developer Emergency Password Recovery</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRecoveryModal(false)}
                className="p-1 text-purple-200 hover:text-white rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDeveloperRecovery} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Enter your registered <strong>Developer Recovery Key</strong> or <strong>Developer Email</strong> to reveal your current password or set a new one.
              </p>

              {recoveryError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{recoveryError}</span>
                </div>
              )}

              {recoveryResult && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{recoveryResult.message}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
                    <div className="p-2 bg-white rounded border border-emerald-200">
                      <span className="text-[10px] text-slate-500 block font-sans">Username</span>
                      <strong>{recoveryResult.username}</strong>
                    </div>
                    <div className="p-2 bg-white rounded border border-emerald-200">
                      <span className="text-[10px] text-slate-500 block font-sans">Active Password</span>
                      <strong>{recoveryResult.currentPassword}</strong>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Developer Recovery Key or Email *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter recovery key or registered developer email"
                  value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  New Developer Password (Optional — leave blank to view current)
                </label>
                <input
                  type="text"
                  placeholder="Min 6 chars to set a new password"
                  value={newDevPassword}
                  onChange={(e) => setNewDevPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="px-4 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {recoveryLoading
                    ? 'Verifying...'
                    : newDevPassword.trim()
                    ? 'Reset & Fill Password'
                    : 'Reveal & Fill Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
