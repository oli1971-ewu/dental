import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, ApplicationFeatureFlag, ClinicSubscription } from '../types/index.ts';
import { api, setStoredToken, getStoredToken } from '../services/api.ts';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  prescriptionManagementEnabled: boolean;
  features: ApplicationFeatureFlag[];
  subscription: ClinicSubscription | null;
  featuresLoaded: boolean;
  isFeatureAccessible: (featureKey: string) => boolean;
  getFeatureStatusReason: (featureKey: string) => string | null;
  refreshFeatures: () => Promise<void>;
  setPrescriptionFeatureEnabled: (enabled: boolean) => void;
  login: (username: string, password?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  quickSwitch: (username: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [prescriptionManagementEnabled, setPrescriptionManagementEnabled] = useState<boolean>(true);
  const [features, setFeatures] = useState<ApplicationFeatureFlag[]>([]);
  const [subscription, setSubscription] = useState<ClinicSubscription | null>(null);
  const [featuresLoaded, setFeaturesLoaded] = useState<boolean>(false);

  const refreshFeatures = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setPrescriptionManagementEnabled(false);
      setFeatures([]);
      setSubscription(null);
      setFeaturesLoaded(false);
      return;
    }
    try {
      const data = await api.getFeatures();
      setPrescriptionManagementEnabled(Boolean(data.prescriptionManagement));
      setFeatures(data.features || data.flags || []);
      setSubscription(data.subscription || null);
      setFeaturesLoaded(true);
    } catch (e) {
      console.warn('Failed to fetch feature flags:', e);
    }
  }, []);

  const isFeatureAccessible = useCallback(
    (featureKey: string): boolean => {
      if (!user) return false;
      const found = features.find((f) => f.featureKey === featureKey);
      if (!found) {
        if (featureKey === 'salary_payroll' || featureKey === 'doctor_management') {
          return user.role === 'developer' || user.role === 'main_doctor';
        }
        if (featureKey === 'prescription_management') {
          return prescriptionManagementEnabled;
        }
        return true;
      }

      // Layer 3: Role check
      if (Array.isArray(found.applicableRoles) && !found.applicableRoles.includes(user.role)) {
        return false;
      }

      // Layer 1: Global Developer Feature Toggle
      const globalOn = found.globalEnabled !== undefined ? found.globalEnabled : found.isEnabled;
      if (!globalOn) {
        return false;
      }

      // Layer 2: Subscription Package Entitlement
      if (subscription && subscription.isOperational === false && user.role !== 'developer') {
        return false;
      }
      if (found.packageEntitlement === 'OFF') {
        return false;
      }

      return true;
    },
    [user, features, subscription, prescriptionManagementEnabled]
  );

  const getFeatureStatusReason = useCallback(
    (featureKey: string): string | null => {
      if (!user) return 'Please sign in to access this module.';
      const found = features.find((f) => f.featureKey === featureKey);
      if (!found) return null;

      if (Array.isArray(found.applicableRoles) && !found.applicableRoles.includes(user.role)) {
        return `Your account role (${user.role}) does not have permission to access ${found.featureName}.`;
      }
      const globalOn = found.globalEnabled !== undefined ? found.globalEnabled : found.isEnabled;
      if (!globalOn) {
        return `${found.featureName} is currently turned OFF globally by the Developer. All existing records remain 100% preserved.`;
      }
      if (subscription && subscription.isOperational === false && user.role !== 'developer') {
        return `Clinic subscription status is "${subscription.status}". Please contact the Developer to activate the subscription.`;
      }
      if (found.packageEntitlement === 'OFF') {
        return `${found.featureName} is not included in the active "${subscription?.packageName || 'Current'}" subscription package. Upgrade package in Developer Control Center to enable.`;
      }
      return null;
    },
    [user, features, subscription]
  );

  const refreshUser = async () => {
    try {
      const token = getStoredToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      const res = await api.getCurrentUser();
      setUser(res.user);
      await refreshFeatures();
    } catch (e) {
      console.warn('Failed to restore session:', e);
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      refreshFeatures();
    };
    const onFeatureDisabled = () => {
      setPrescriptionManagementEnabled(false);
      setFeaturesLoaded(true);
      refreshFeatures();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('prescription-feature-disabled', onFeatureDisabled);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('prescription-feature-disabled', onFeatureDisabled);
    };
  }, [user, refreshFeatures]);

  const login = async (username: string, password?: string) => {
    setLoading(true);
    try {
      const res = await api.login({ username, password });
      setStoredToken(res.token);
      setUser(res.user);
      await refreshFeatures();
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      setStoredToken(idToken);
      const res = await api.getCurrentUser();
      setUser(res.user);
      await refreshFeatures();
    } catch (error: any) {
      console.error('Google Sign-In failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const quickSwitch = async (username: string) => {
    if (username.trim().toLowerCase() === 'dev_admin') {
      throw new Error('Developer mode requires manual username and password authentication.');
    }
    setLoading(true);
    try {
      let pass = 'Doctor@123';
      if (username === 'maindoctor') pass = 'ClinicAdmin@2026';

      const res = await api.login({ username, password: pass });
      setStoredToken(res.token);
      setUser(res.user);
      await refreshFeatures();
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setStoredToken(null);
    setUser(null);
    setPrescriptionManagementEnabled(false);
    setFeatures([]);
    setSubscription(null);
    setFeaturesLoaded(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        prescriptionManagementEnabled,
        features,
        subscription,
        featuresLoaded,
        isFeatureAccessible,
        getFeatureStatusReason,
        refreshFeatures,
        setPrescriptionFeatureEnabled: setPrescriptionManagementEnabled,
        login,
        loginWithGoogle,
        quickSwitch,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
