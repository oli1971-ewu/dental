import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Activity,
  LogOut,
  ChevronDown,
  Shield,
  Code,
  Stethoscope,
  Sparkles,
  Search,
  X,
  Phone,
  Eye,
  CalendarCheck,
  CreditCard,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { User, Patient } from '../types/index.ts';

interface NavbarProps {
  onSelectPatient?: (patientId: number) => void;
  onNavigateHome?: () => void;
  onOpenNewVisit?: (patient: Patient) => void;
  onOpenPaymentForPatient?: (patient: Patient) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onSelectPatient,
  onNavigateHome,
  onOpenNewVisit,
  onOpenPaymentForPatient,
}) => {
  const { user, logout, quickSwitch } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [accounts, setAccounts] = useState<User[]>([]);

  // Universal Patient Search for Everyone
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getDemoAccounts().then(setAccounts).catch(console.error);
  }, []);

  // Handle outside click for search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await api.getPatients({ search: searchQuery.trim() });
        setSearchResults(results.slice(0, 8)); // Top 8 results
        setShowSearchDropdown(true);
      } catch (err) {
        console.error('Universal search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!user) return null;

  const handleSelectPatientResult = (patientId: number) => {
    if (onSelectPatient) {
      onSelectPatient(patientId);
    }
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'main_doctor':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <Shield className="w-3 h-3 text-emerald-600" /> Super Admin (Main Doctor)
          </span>
        );
      case 'developer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-300">
            <Code className="w-3 h-3 text-purple-600" /> Developer (Full Access)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-teal-100 text-teal-800 border border-teal-300">
            <Stethoscope className="w-3 h-3 text-teal-600" /> Doctor Account
          </span>
        );
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-0">
        <div className="flex flex-wrap sm:flex-nowrap justify-between sm:h-16 items-center gap-2 sm:gap-3">
          {/* Logo and Brand - Click to Return to Landing Page / Dashboard */}
          <div
            onClick={onNavigateHome}
            className="flex items-center gap-2.5 sm:gap-3 shrink-0 cursor-pointer group hover:opacity-90 transition-opacity"
            title="Go to Dental Care Dashboard"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-teal-600 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
              <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold text-slate-900 text-sm sm:text-lg tracking-tight group-hover:text-teal-700 transition-colors whitespace-nowrap">
                  Dental Care
                </span>
                <span className="hidden xs:inline-block text-teal-700 text-[10px] sm:text-[11px] font-semibold">
                  · BDT ৳
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden lg:block">
                Centralized Clinic-Wide Patient &amp; Multi-Doctor System · Lead Dev: Aymon
              </p>
            </div>
          </div>

          {/* Unified Patient Search Header (Search by Name, ID, Phone) - Full width row on mobile, center column on desktop */}
          <div
            ref={searchContainerRef}
            className="relative order-3 sm:order-2 w-full sm:w-auto sm:flex-1 max-w-lg sm:mx-4 mt-1.5 sm:mt-0"
          >
            <div className="relative">
              <Search className="w-4 h-4 text-teal-600 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Name, ID (DP-1001), or Phone (017...)..."
                value={searchQuery}
                onFocus={() => {
                  if (searchQuery.trim()) setShowSearchDropdown(true);
                }}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchResults.length > 0) {
                    handleSelectPatientResult(searchResults[0].id);
                  }
                }}
                className="w-full pl-9 pr-8 sm:pr-28 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 focus:bg-white transition-all shadow-2xs"
              />
              {!searchQuery ? (
                <div className="hidden md:flex items-center gap-1 absolute right-2.5 top-2 pointer-events-none">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-600">
                    Name
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
                    ID
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-600">
                    Phone
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setShowSearchDropdown(false);
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Unified Search Results Dropdown */}
            {showSearchDropdown && searchQuery.trim() && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden max-h-[26rem] overflow-y-auto">
                <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                  <span>
                    Unified Search Results ({searchResults.length}) &bull; Name / ID / Phone
                  </span>
                  <span className="text-teal-700">Click row or action</span>
                </div>

                {isSearching ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    Searching central patient records...
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {searchResults.map((p) => {
                      const due = p.totalDue || 0;
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleSelectPatientResult(p.id)}
                          className="p-3 hover:bg-teal-50/60 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-teal-800 bg-teal-100 px-2 py-0.5 rounded border border-teal-300 text-xs">
                                {p.patientId}
                              </span>
                              <span className="font-bold text-slate-900 text-sm truncate">{p.name}</span>
                              <span className="text-[11px] text-slate-500">
                                ({p.gender}, {p.age ? `${p.age} yrs` : 'N/A'})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-500 text-[11px] flex-wrap">
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400" />
                                <strong className="text-slate-700">{p.phone}</strong>
                              </span>
                              <span>&bull;</span>
                              <span>{p.visitCount || 0} visits</span>
                              <span>&bull;</span>
                              <span>{p.uniqueDoctorsCount || 0} doctor(s)</span>
                              {due > 0 ? (
                                <span className="text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-bold">
                                  ৳{due.toLocaleString()} Due
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-semibold inline-flex items-center gap-0.5">
                                  <CheckCircle2 className="w-3 h-3" /> Paid
                                </span>
                              )}
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-1.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {due > 0 && onOpenPaymentForPatient && (
                              <button
                                type="button"
                                onClick={() => {
                                  onOpenPaymentForPatient(p);
                                  setSearchQuery('');
                                  setShowSearchDropdown(false);
                                }}
                                className="px-2 py-1 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded shadow-2xs flex items-center gap-1 cursor-pointer"
                                title={`Collect Due ৳${due.toLocaleString()}`}
                              >
                                <CreditCard className="w-3 h-3" />
                                <span>Pay</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleSelectPatientResult(p.id)}
                              className="px-2 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 flex items-center gap-1 cursor-pointer"
                              title="View Patient Profile"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Profile</span>
                            </button>
                            {onOpenNewVisit && (
                              <button
                                type="button"
                                onClick={() => {
                                  onOpenNewVisit(p);
                                  setSearchQuery('');
                                  setShowSearchDropdown(false);
                                }}
                                className="px-2 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded border border-slate-300 flex items-center gap-1 cursor-pointer"
                                title="Add New Visit"
                              >
                                <CalendarCheck className="w-3 h-3 text-teal-600" />
                                <span>+ Visit</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No patients matching &ldquo;{searchQuery}&rdquo; by Name, ID, or Phone.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Doctor Switcher & User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 order-2 sm:order-3">
            {/* Quick Doctor Switcher Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors shadow-2xs cursor-pointer"
                title="Switch between Doctor A, Doctor B, Doctor C, and Main Doctor"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span className="hidden md:inline">Switch Doctor / Role</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>

              {dropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-72 rounded-lg bg-white shadow-xl ring-1 ring-black/5 z-50 py-2 border border-slate-200">
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                      Switch Doctor Account
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1">
                      {accounts
                        .filter((acc) => acc.role !== 'developer')
                        .map((acc) => (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => {
                              quickSwitch(acc.username);
                              setDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors flex items-start gap-2.5 cursor-pointer ${
                              acc.id === user.id ? 'bg-teal-50/70 border-l-2 border-teal-600' : ''
                            }`}
                          >
                            <div className="mt-0.5">
                              {acc.role === 'main_doctor' ? (
                                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900">{acc.fullName}</div>
                              <div className="text-[11px] text-slate-500">
                                {acc.specialization || acc.role} (@{acc.username})
                              </div>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Current Active User Info */}
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold text-slate-900 leading-tight">
                {user.fullName}
              </span>
              <div className="mt-0.5">{getRoleBadge(user.role)}</div>
            </div>

            {/* Logout */}
            <button
              type="button"
              onClick={logout}
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
