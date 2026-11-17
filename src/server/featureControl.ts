import express from 'express';
import { db } from '../db/index.ts';
import {
  applicationFeatureFlags,
  subscriptionPackages,
  clinicSubscriptions,
  subscriptionAuditLogs,
  auditLogs,
  users,
  patients,
} from '../db/schema.ts';
import { eq, desc, asc } from 'drizzle-orm';
import { authenticateToken, AuthenticatedRequest } from './auth.ts';

export const featureControlRouter = express.Router();

export interface RegisteredFeatureDefinition {
  featureKey: string;
  featureName: string;
  description: string;
  moduleCategory: string;
  isEnabled: boolean;
  applicableRoles: ('developer' | 'main_doctor' | 'doctor')[];
}

export const DEFAULT_FEATURES: RegisteredFeatureDefinition[] = [
  {
    featureKey: 'patient_management',
    featureName: 'Patient Management',
    description: 'Patient registration, demographics, clinical profiles, and medical histories.',
    moduleCategory: 'Clinical',
    isEnabled: true,
    applicableRoles: ['developer', 'main_doctor', 'doctor'],
  },
  {
    featureKey: 'visit_management',
    featureName: 'Visit & Consultation Management',
    description: 'Patient clinic visits, complaints, examination findings, and clinical diagnoses.',
    moduleCategory: 'Clinical',
    isEnabled: true,
    applicableRoles: ['developer', 'main_doctor', 'doctor'],
  },
  {
    featureKey: 'treatment_management',
    featureName: 'Treatment & Diagnostic Tests',
    description: 'Dental procedures, treatment plans, custom pricing, and diagnostic test orders.',
    moduleCategory: 'Clinical',
    isEnabled: true,
    applicableRoles: ['developer', 'main_doctor', 'doctor'],
  },
  {
    featureKey: 'prescription_management',
    featureName: 'Prescription & Medicine Catalog',
    description: 'Digital prescriptions, bilingual Bangla/English dosage instructions, and medicine catalog.',
    moduleCategory: 'Clinical',
    isEnabled: true,
    applicableRoles: ['developer', 'main_doctor', 'doctor'],
  },
  {
    featureKey: 'payment_management',
    featureName: 'Payment & Dues Management',
    description: 'Patient billing, partial/full payment collection, cash/bKash breakdown, and due tracking.',
    moduleCategory: 'Finance',
    isEnabled: true,
    applicableRoles: ['developer', 'main_doctor', 'doctor'],
  },
  {
    featureKey: 'appointment_management',
    featureName: 'Appointments & Scheduling',
    description: 'Doctor appointment scheduling, follow-up tracking, and status updates.',
    moduleCategory: 'Operations',
    isEnabled: true,
    applicableRoles: ['developer', 'main_doctor', 'doctor'],
  },
  {
    featureKey: 'doctor_management',
    featureName: 'Doctor & Staff Management',
    description: 'Manage doctor profiles, credentials, specializations, and active account status.',
    moduleCategory: 'Administration',
    isEnabled: true,
    applicableRoles: ['developer', 'main_doctor'],
  },
  {
    featureKey: 'salary_payroll',
    featureName: 'Salary & Payroll Management',
    description: 'Doctor salary structures (Monthly, Daily, Commission), monthly payroll sheets, and salary payments.',
    moduleCategory: 'Finance',
    isEnabled: true,
    applicableRoles: ['developer', 'main_doctor'],
  },
  {
    featureKey: 'data_backup_export',
    featureName: 'Data Backup & CSV Export',
    description: 'Complete clinic data ZIP archives, role-scoped doctor data backups, and CSV module exports.',
    moduleCategory: 'Administration',
    isEnabled: true,
    applicableRoles: ['developer', 'main_doctor', 'doctor'],
  },
  {
    featureKey: 'reports_analytics',
    featureName: 'Reports & Financial Analytics',
    description: 'Clinic revenue analytics, collection breakdowns, and operational performance dashboards.',
    moduleCategory: 'Analytics',
    isEnabled: true,
    applicableRoles: ['developer', 'main_doctor', 'doctor'],
  },
];

export interface PackageSeedDefinition {
  packageKey: string;
  packageName: string;
  description: string;
  monthlyPriceBdt: string;
  annualPriceBdt: string;
  sortOrder: number;
  featureEntitlements: Record<string, 'ON' | 'OFF' | 'Limited'>;
  limits: {
    maxDoctors?: number | null;
    maxStaff?: number | null;
    maxPatients?: number | null;
    maxBranches?: number | null;
    storageMb?: number | null;
    monthlyBackups?: number | null;
  };
}

export const DEFAULT_PACKAGES: PackageSeedDefinition[] = [
  {
    packageKey: 'basic',
    packageName: 'Basic',
    description: 'Essential clinical & patient records for solo dental practices.',
    monthlyPriceBdt: '1500.00',
    annualPriceBdt: '15000.00',
    sortOrder: 1,
    featureEntitlements: {
      patient_management: 'ON',
      visit_management: 'ON',
      treatment_management: 'ON',
      prescription_management: 'ON',
      payment_management: 'ON',
      appointment_management: 'ON',
      doctor_management: 'Limited',
      salary_payroll: 'OFF',
      data_backup_export: 'Limited',
      reports_analytics: 'Limited',
    },
    limits: {
      maxDoctors: 2,
      maxStaff: 3,
      maxPatients: 1000,
      maxBranches: 1,
      storageMb: 1024,
      monthlyBackups: 5,
    },
  },
  {
    packageKey: 'standard',
    packageName: 'Standard',
    description: 'Full clinical workflow with multi-doctor scheduling and standard data exports.',
    monthlyPriceBdt: '3000.00',
    annualPriceBdt: '30000.00',
    sortOrder: 2,
    featureEntitlements: {
      patient_management: 'ON',
      visit_management: 'ON',
      treatment_management: 'ON',
      prescription_management: 'ON',
      payment_management: 'ON',
      appointment_management: 'ON',
      doctor_management: 'ON',
      salary_payroll: 'OFF',
      data_backup_export: 'ON',
      reports_analytics: 'ON',
    },
    limits: {
      maxDoctors: 5,
      maxStaff: 10,
      maxPatients: 5000,
      maxBranches: 1,
      storageMb: 5120,
      monthlyBackups: 30,
    },
  },
  {
    packageKey: 'professional',
    packageName: 'Professional',
    description: 'Advanced dental clinic suite including Doctor Salary & Payroll Management.',
    monthlyPriceBdt: '5000.00',
    annualPriceBdt: '50000.00',
    sortOrder: 3,
    featureEntitlements: {
      patient_management: 'ON',
      visit_management: 'ON',
      treatment_management: 'ON',
      prescription_management: 'ON',
      payment_management: 'ON',
      appointment_management: 'ON',
      doctor_management: 'ON',
      salary_payroll: 'ON',
      data_backup_export: 'ON',
      reports_analytics: 'ON',
    },
    limits: {
      maxDoctors: 15,
      maxStaff: 30,
      maxPatients: 25000,
      maxBranches: 3,
      storageMb: 20480,
      monthlyBackups: 100,
    },
  },
  {
    packageKey: 'enterprise',
    packageName: 'Enterprise',
    description: 'Unrestricted access to all clinical, payroll, backup, and multi-branch capabilities.',
    monthlyPriceBdt: '8500.00',
    annualPriceBdt: '85000.00',
    sortOrder: 4,
    featureEntitlements: {
      patient_management: 'ON',
      visit_management: 'ON',
      treatment_management: 'ON',
      prescription_management: 'ON',
      payment_management: 'ON',
      appointment_management: 'ON',
      doctor_management: 'ON',
      salary_payroll: 'ON',
      data_backup_export: 'ON',
      reports_analytics: 'ON',
    },
    limits: {
      maxDoctors: null,
      maxStaff: null,
      maxPatients: null,
      maxBranches: null,
      storageMb: null,
      monthlyBackups: null,
    },
  },
];

let featureSystemSeeded = false;

export async function ensureFeatureControlSeeded() {
  if (featureSystemSeeded) return;
  try {
    const existingFlags = await db.select().from(applicationFeatureFlags);
    const existingFlagMap = new Map(existingFlags.map((f) => [f.featureKey, f]));

    for (const def of DEFAULT_FEATURES) {
      const existing = existingFlagMap.get(def.featureKey);
      if (!existing) {
        await db.insert(applicationFeatureFlags).values({
          featureKey: def.featureKey,
          featureName: def.featureName,
          description: def.description,
          moduleCategory: def.moduleCategory,
          isEnabled: def.isEnabled,
          applicableRolesJson: JSON.stringify(def.applicableRoles),
        });
      } else if (!existing.applicableRolesJson || !existing.moduleCategory) {
        await db
          .update(applicationFeatureFlags)
          .set({
            moduleCategory: existing.moduleCategory || def.moduleCategory,
            applicableRolesJson: existing.applicableRolesJson || JSON.stringify(def.applicableRoles),
          })
          .where(eq(applicationFeatureFlags.id, existing.id));
      }
    }

    const existingPackages = await db.select().from(subscriptionPackages);
    const existingPkgMap = new Map(existingPackages.map((p) => [p.packageKey, p]));

    for (const pkg of DEFAULT_PACKAGES) {
      if (!existingPkgMap.has(pkg.packageKey)) {
        await db.insert(subscriptionPackages).values({
          packageKey: pkg.packageKey,
          packageName: pkg.packageName,
          description: pkg.description,
          monthlyPriceBdt: pkg.monthlyPriceBdt,
          annualPriceBdt: pkg.annualPriceBdt,
          featureEntitlementsJson: JSON.stringify(pkg.featureEntitlements),
          limitsJson: JSON.stringify(pkg.limits),
          isActive: true,
          sortOrder: pkg.sortOrder,
        });
      }
    }

    const allPackages = await db.select().from(subscriptionPackages);
    const enterprisePkg = allPackages.find((p) => p.packageKey === 'enterprise') || allPackages[0];

    const existingSubs = await db.select().from(clinicSubscriptions);
    if (existingSubs.length === 0 && enterprisePkg) {
      const todayStr = new Date().toISOString().split('T')[0];
      await db.insert(clinicSubscriptions).values({
        clinicCode: 'DEFAULT_CLINIC',
        clinicName: 'Dental Care',
        branchCode: 'MAIN_BRANCH',
        packageId: enterprisePkg.id,
        packageKey: enterprisePkg.packageKey,
        packageName: enterprisePkg.packageName,
        status: 'Active',
        startDate: todayStr,
        expiryDate: '2030-12-31',
        notes: 'Default Enterprise clinic subscription initialized non-destructively.',
      });
    }

    featureSystemSeeded = true;
  } catch (err) {
    console.error('Error seeding feature control system:', err);
  }
}

export async function getSystemFeatureEvaluation() {
  await ensureFeatureControlSeeded();

  const flags = await db
    .select()
    .from(applicationFeatureFlags)
    .orderBy(asc(applicationFeatureFlags.id));
  const packages = await db.select().from(subscriptionPackages);
  const subs = await db.select().from(clinicSubscriptions);

  const activeSub = subs.find((s) => s.clinicCode === 'DEFAULT_CLINIC') || subs[0] || null;
  const activePkg =
    packages.find((p) => p.id === activeSub?.packageId) ||
    packages.find((p) => p.packageKey === activeSub?.packageKey) ||
    packages.find((p) => p.packageKey === 'enterprise') ||
    null;

  let pkgEntitlements: Record<string, 'ON' | 'OFF' | 'Limited'> = {};
  let pkgLimits: Record<string, number | null> = {};
  if (activePkg) {
    try {
      pkgEntitlements = JSON.parse(activePkg.featureEntitlementsJson || '{}');
    } catch {
      pkgEntitlements = {};
    }
    try {
      pkgLimits = JSON.parse(activePkg.limitsJson || '{}');
    } catch {
      pkgLimits = {};
    }
  }

  const subStatus = activeSub?.status || 'Active';
  const isSubscriptionOperational = subStatus === 'Active' || subStatus === 'Trial';

  const evaluatedFeatures = flags.map((flag) => {
    let roles: string[] = ['developer', 'main_doctor', 'doctor'];
    try {
      roles = JSON.parse(flag.applicableRolesJson || '["developer","main_doctor","doctor"]');
    } catch {
      roles = ['developer', 'main_doctor', 'doctor'];
    }

    const pkgState = pkgEntitlements[flag.featureKey] || 'ON';
    const isGlobalEnabled = Boolean(flag.isEnabled);
    const isPackageAllowed = isSubscriptionOperational && (pkgState === 'ON' || pkgState === 'Limited');
    const effectiveEnabled = isGlobalEnabled && isPackageAllowed;

    return {
      id: flag.id,
      featureKey: flag.featureKey,
      featureName: flag.featureName,
      description: flag.description,
      moduleCategory: flag.moduleCategory || 'Clinical',
      isEnabled: isGlobalEnabled,
      globalEnabled: isGlobalEnabled,
      packageEntitlement: pkgState,
      applicableRoles: roles,
      effectiveEnabled,
      updatedAt: flag.updatedAt,
    };
  });

  const prescriptionFlag = evaluatedFeatures.find((f) => f.featureKey === 'prescription_management');
  const rxEnabled = prescriptionFlag ? prescriptionFlag.effectiveEnabled : true;

  return {
    prescriptionManagement: rxEnabled,
    prescriptionManagementEnabled: rxEnabled,
    flags: evaluatedFeatures,
    features: evaluatedFeatures,
    subscription: activeSub
      ? {
          ...activeSub,
          isOperational: isSubscriptionOperational,
          limits: pkgLimits,
        }
      : null,
    activePackage: activePkg
      ? {
          ...activePkg,
          featureEntitlements: pkgEntitlements,
          limits: pkgLimits,
        }
      : null,
  };
}

/**
 * 3-Layer Backend Feature Authorization Check
 * Layer 1: Global Developer Feature Flag
 * Layer 2: Active Clinic Subscription Package Entitlement
 * Layer 3: User Role Permission
 */
export async function checkUserFeatureAccess(
  featureKey: string,
  userRole: string
): Promise<{ allowed: boolean; reason?: string; code?: string }> {
  const evalState = await getSystemFeatureEvaluation();
  const feature = evalState.features.find((f) => f.featureKey === featureKey);

  if (!feature) {
    return { allowed: true };
  }

  // Layer 3: Role check
  if (!feature.applicableRoles.includes(userRole)) {
    return {
      allowed: false,
      code: 'ROLE_FORBIDDEN',
      reason: `Your account role (${userRole}) is not authorized to access ${feature.featureName}.`,
    };
  }

  // Layer 1: Global Developer Feature Flag
  if (!feature.globalEnabled) {
    return {
      allowed: false,
      code: 'FEATURE_DISABLED_GLOBALLY',
      reason: `${feature.featureName} is currently disabled by the Developer.`,
    };
  }

  // Layer 2: Subscription Package Entitlement
  if (evalState.subscription && !evalState.subscription.isOperational) {
    if (userRole !== 'developer') {
      return {
        allowed: false,
        code: 'SUBSCRIPTION_INACTIVE',
        reason: `Clinic subscription status is "${evalState.subscription.status}". Please contact the Developer to renew or activate the subscription.`,
      };
    }
  }

  if (feature.packageEntitlement === 'OFF') {
    return {
      allowed: false,
      code: 'PACKAGE_NOT_INCLUDED',
      reason: `${feature.featureName} is not included in the active "${evalState.subscription?.packageName || 'Current'}" subscription package.`,
    };
  }

  return { allowed: true };
}

export function requireFeatureAccess(featureKey: string) {
  return async (req: any, res: any, next: any) => {
    try {
      const role = req.user?.role || '';
      const result = await checkUserFeatureAccess(featureKey, role);
      if (!result.allowed) {
        return res.status(403).json({
          error: result.reason || 'Feature access denied',
          code: result.code || 'FEATURE_ACCESS_DENIED',
          featureKey,
        });
      }
      next();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
}

function requireDeveloper(req: any, res: any, next: any) {
  if (!req.user || req.user.role !== 'developer') {
    return res.status(403).json({
      error: 'Forbidden: Only the Developer account can modify global feature flags and subscription packages.',
    });
  }
  next();
}

// Authenticated endpoint returning evaluated feature flags & subscription state
featureControlRouter.get('/features', authenticateToken, async (_req: AuthenticatedRequest, res) => {
  try {
    const data = await getSystemFeatureEvaluation();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Developer: Get full feature control matrix, packages, active subscription, usage metrics & audit logs
featureControlRouter.get('/developer/control-center', authenticateToken, requireDeveloper, async (_req: AuthenticatedRequest, res) => {
  try {
    const evalData = await getSystemFeatureEvaluation();
    const allPackages = await db.select().from(subscriptionPackages);
    const logs = await db
      .select()
      .from(subscriptionAuditLogs)
      .orderBy(desc(subscriptionAuditLogs.createdAt))
      .limit(100);

    const allUsers = await db.select().from(users);
    const allPatients = await db.select().from(patients);
    const activeDoctorsCount = allUsers.filter(
      (u) => (u.role === 'doctor' || u.role === 'main_doctor') && u.isActive
    ).length;

    const formattedPackages = allPackages
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((pkg) => {
        let featureEntitlements: Record<string, 'ON' | 'OFF' | 'Limited'> = {};
        let limits: Record<string, number | null> = {};
        try {
          featureEntitlements = JSON.parse(pkg.featureEntitlementsJson || '{}');
        } catch {
          featureEntitlements = {};
        }
        try {
          limits = JSON.parse(pkg.limitsJson || '{}');
        } catch {
          limits = {};
        }
        return {
          ...pkg,
          featureEntitlements,
          limits,
        };
      });

    res.json({
      ...evalData,
      packages: formattedPackages,
      usageMetrics: {
        doctorsCount: activeDoctorsCount,
        totalUsersCount: allUsers.length,
        patientsCount: allPatients.length,
        branchesCount: 1,
      },
      auditLogs: logs,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Developer: Toggle or update a specific feature flag (or register a new custom feature flag)
featureControlRouter.put('/developer/features/:featureKey', authenticateToken, requireDeveloper, async (req: AuthenticatedRequest, res) => {
  const { featureKey } = req.params;
  const { enabled, isEnabled, featureName, description, moduleCategory, applicableRoles } = req.body;
  const resolvedEnabled = isEnabled !== undefined ? Boolean(isEnabled) : enabled !== undefined ? Boolean(enabled) : undefined;

  try {
    await ensureFeatureControlSeeded();
    const existing = await db
      .select()
      .from(applicationFeatureFlags)
      .where(eq(applicationFeatureFlags.featureKey, featureKey));

    const prevState = existing[0] || null;
    const rolesJson = Array.isArray(applicableRoles)
      ? JSON.stringify(applicableRoles)
      : prevState?.applicableRolesJson || '["developer","main_doctor","doctor"]';

    let updatedFlag: any = null;

    if (prevState) {
      const [upd] = await db
        .update(applicationFeatureFlags)
        .set({
          isEnabled: resolvedEnabled !== undefined ? resolvedEnabled : prevState.isEnabled,
          featureName: featureName ? String(featureName).trim() : prevState.featureName,
          description: description !== undefined ? String(description).trim() : prevState.description,
          moduleCategory: moduleCategory ? String(moduleCategory).trim() : prevState.moduleCategory,
          applicableRolesJson: rolesJson,
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(applicationFeatureFlags.featureKey, featureKey))
        .returning();
      updatedFlag = upd;
    } else {
      const cleanKey = featureKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const [ins] = await db
        .insert(applicationFeatureFlags)
        .values({
          featureKey: cleanKey,
          featureName: String(featureName || featureKey).trim(),
          description: description ? String(description).trim() : 'Custom developer-registered feature module.',
          moduleCategory: moduleCategory ? String(moduleCategory).trim() : 'Custom',
          isEnabled: resolvedEnabled !== undefined ? resolvedEnabled : true,
          applicableRolesJson: rolesJson,
          updatedBy: req.user!.id,
        })
        .returning();
      updatedFlag = ins;
    }

    await db.insert(subscriptionAuditLogs).values({
      userId: req.user!.id,
      userRole: req.user!.role,
      action: prevState ? 'UPDATE_GLOBAL_FEATURE_FLAG' : 'REGISTER_GLOBAL_FEATURE_FLAG',
      targetKey: featureKey,
      previousStateJson: prevState
        ? JSON.stringify({ isEnabled: prevState.isEnabled, roles: prevState.applicableRolesJson })
        : null,
      newStateJson: JSON.stringify({ isEnabled: updatedFlag?.isEnabled, applicableRoles }),
      details: `Feature "${updatedFlag?.featureName || featureKey}" set to ${updatedFlag?.isEnabled ? 'ENABLED' : 'DISABLED'} by Developer (${req.user!.fullName}).`,
    });

    await db.insert(auditLogs).values({
      userId: req.user!.id,
      userRole: req.user!.role,
      action: 'TOGGLE_FEATURE_FLAG',
      affectedRecord: `Feature: ${updatedFlag?.featureName || featureKey}`,
      details: `Global feature [${featureKey}] set to ${updatedFlag?.isEnabled ? 'ON' : 'OFF'} by ${req.user!.fullName}`,
    });

    const updatedEval = await getSystemFeatureEvaluation();
    res.json({
      success: true,
      flag: updatedFlag,
      ...updatedEval,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Developer: Create or update a Subscription Package
featureControlRouter.post('/developer/packages', authenticateToken, requireDeveloper, async (req: AuthenticatedRequest, res) => {
  const {
    id,
    packageKey,
    packageName,
    description,
    monthlyPriceBdt,
    annualPriceBdt,
    featureEntitlements,
    limits,
    isActive,
    sortOrder,
  } = req.body;

  if (!packageName || !String(packageName).trim()) {
    return res.status(400).json({ error: 'Package Name is required.' });
  }

  try {
    await ensureFeatureControlSeeded();
    const cleanKey = String(packageKey || packageName)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');

    const entitlementsJson = JSON.stringify(featureEntitlements || {});
    const limitsJson = JSON.stringify(limits || {});

    if (id) {
      const existing = await db
        .select()
        .from(subscriptionPackages)
        .where(eq(subscriptionPackages.id, Number(id)));
      const prev = existing[0];
      if (!prev) {
        return res.status(404).json({ error: 'Subscription package not found.' });
      }

      await db
        .update(subscriptionPackages)
        .set({
          packageName: String(packageName).trim(),
          description: description !== undefined ? String(description).trim() : prev.description,
          monthlyPriceBdt: monthlyPriceBdt !== undefined ? String(Number(monthlyPriceBdt) || 0) : prev.monthlyPriceBdt,
          annualPriceBdt: annualPriceBdt !== undefined ? String(Number(annualPriceBdt) || 0) : prev.annualPriceBdt,
          featureEntitlementsJson: entitlementsJson,
          limitsJson,
          isActive: isActive !== undefined ? Boolean(isActive) : prev.isActive,
          sortOrder: sortOrder !== undefined ? Number(sortOrder) : prev.sortOrder,
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionPackages.id, Number(id)));

      await db
        .update(clinicSubscriptions)
        .set({
          packageName: String(packageName).trim(),
          updatedAt: new Date(),
        })
        .where(eq(clinicSubscriptions.packageId, Number(id)));

      await db.insert(subscriptionAuditLogs).values({
        userId: req.user!.id,
        userRole: req.user!.role,
        action: 'UPDATE_SUBSCRIPTION_PACKAGE',
        targetKey: prev.packageKey,
        previousStateJson: prev.featureEntitlementsJson,
        newStateJson: entitlementsJson,
        details: `Updated subscription package "${packageName}" entitlements and limits.`,
      });
    } else {
      await db.insert(subscriptionPackages).values({
        packageKey: cleanKey,
        packageName: String(packageName).trim(),
        description: description ? String(description).trim() : '',
        monthlyPriceBdt: String(Number(monthlyPriceBdt) || 0),
        annualPriceBdt: String(Number(annualPriceBdt) || 0),
        featureEntitlementsJson: entitlementsJson,
        limitsJson,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        sortOrder: Number(sortOrder) || 10,
        updatedBy: req.user!.id,
      });

      await db.insert(subscriptionAuditLogs).values({
        userId: req.user!.id,
        userRole: req.user!.role,
        action: 'CREATE_SUBSCRIPTION_PACKAGE',
        targetKey: cleanKey,
        previousStateJson: null,
        newStateJson: entitlementsJson,
        details: `Created custom subscription package "${packageName}" (${cleanKey}).`,
      });
    }

    const updatedEval = await getSystemFeatureEvaluation();
    res.json({ success: true, ...updatedEval });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Developer: Assign or update the Clinic Subscription Package & Status
featureControlRouter.put('/developer/subscription', authenticateToken, requireDeveloper, async (req: AuthenticatedRequest, res) => {
  const { packageId, packageKey, clinicName, branchCode, status, startDate, expiryDate, trialEndsAt, notes } = req.body;

  try {
    await ensureFeatureControlSeeded();
    const allPkgs = await db.select().from(subscriptionPackages);
    const targetPkg =
      allPkgs.find((p) => p.id === Number(packageId)) ||
      allPkgs.find((p) => p.packageKey === packageKey);

    if (!targetPkg) {
      return res.status(404).json({ error: 'Selected subscription package not found.' });
    }

    const validStatuses = ['Active', 'Trial', 'Expired', 'Suspended', 'Canceled'];
    const normalizedStatus = validStatuses.includes(status) ? status : 'Active';

    const existingSubs = await db.select().from(clinicSubscriptions);
    const currentSub = existingSubs.find((s) => s.clinicCode === 'DEFAULT_CLINIC') || existingSubs[0];

    if (currentSub) {
      await db
        .update(clinicSubscriptions)
        .set({
          clinicName: clinicName ? String(clinicName).trim() : currentSub.clinicName,
          branchCode: branchCode ? String(branchCode).trim() : currentSub.branchCode,
          packageId: targetPkg.id,
          packageKey: targetPkg.packageKey,
          packageName: targetPkg.packageName,
          status: normalizedStatus,
          startDate: startDate || currentSub.startDate,
          expiryDate: expiryDate !== undefined ? expiryDate || null : currentSub.expiryDate,
          trialEndsAt: trialEndsAt !== undefined ? trialEndsAt || null : currentSub.trialEndsAt,
          notes: notes !== undefined ? notes || null : currentSub.notes,
          assignedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(clinicSubscriptions.id, currentSub.id));
    } else {
      await db.insert(clinicSubscriptions).values({
        clinicCode: 'DEFAULT_CLINIC',
        clinicName: clinicName || 'Dental Care',
        branchCode: branchCode || 'MAIN_BRANCH',
        packageId: targetPkg.id,
        packageKey: targetPkg.packageKey,
        packageName: targetPkg.packageName,
        status: normalizedStatus,
        startDate: startDate || new Date().toISOString().split('T')[0],
        expiryDate: expiryDate || null,
        trialEndsAt: trialEndsAt || null,
        notes: notes || null,
        assignedBy: req.user!.id,
      });
    }

    await db.insert(subscriptionAuditLogs).values({
      userId: req.user!.id,
      userRole: req.user!.role,
      action: 'ASSIGN_CLINIC_SUBSCRIPTION',
      targetKey: targetPkg.packageKey,
      previousStateJson: currentSub
        ? JSON.stringify({ packageKey: currentSub.packageKey, status: currentSub.status })
        : null,
      newStateJson: JSON.stringify({ packageKey: targetPkg.packageKey, status: normalizedStatus, expiryDate }),
      details: `Clinic subscription assigned to package "${targetPkg.packageName}" with status "${normalizedStatus}".`,
    });

    await db.insert(auditLogs).values({
      userId: req.user!.id,
      userRole: req.user!.role,
      action: 'UPDATE_CLINIC_SUBSCRIPTION',
      affectedRecord: `Clinic Subscription (${targetPkg.packageName})`,
      details: `Clinic subscription changed to ${targetPkg.packageName} (${normalizedStatus}) by ${req.user!.fullName}`,
    });

    const updatedEval = await getSystemFeatureEvaluation();
    res.json({ success: true, ...updatedEval });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
