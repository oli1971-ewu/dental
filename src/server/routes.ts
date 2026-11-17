import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.ts';
import {
  users,
  patients,
  visits,
  treatments,
  diagnosticTests,
  payments,
  appointments,
  auditLogs,
  systemSettings,
  applicationFeatureFlags,
  prescriptions,
  prescriptionMedicines,
  prescriptionRevisions,
  prescriptionAuditLogs,
  doctorSalaries,
  salaryPayments,
} from '../db/schema.ts';
import {
  authenticateToken,
  requireRoles,
  generateToken,
  logAudit,
  AuthenticatedRequest,
} from './auth.ts';
import { prescriptionsRouter } from './prescriptions.ts';
import { medicinesRouter } from './medicines.ts';
import { featureControlRouter } from './featureControl.ts';
import { payrollRouter } from './payrollRoutes.ts';
import { backupRouter } from './backupRoutes.ts';
import {
  VisitFinancialSnapshot,
  recalculatePatientFinancials,
  recalculateVisitFinancials,
} from './financials.ts';
import { eq, desc, asc, and, or, sql, like, inArray, count } from 'drizzle-orm';

export type { VisitFinancialSnapshot };
export { recalculatePatientFinancials, recalculateVisitFinancials };

export const apiRouter = Router();
apiRouter.use(featureControlRouter);
apiRouter.use(payrollRouter);
apiRouter.use(backupRouter);
apiRouter.use(prescriptionsRouter);
apiRouter.use(medicinesRouter);




// ==========================================
// 1. AUTHENTICATION & DEVELOPER CREDENTIAL VAULT
// ==========================================

const VAULT_SETTING_KEY = 'developer_password_vault_json';
const DEFAULT_PASSWORD_VAULT: Record<string, { password: string; updatedAt: string }> = {
  dev_admin: { password: 'DevDental@2026', updatedAt: '2026-01-01T00:00:00.000Z' },
  maindoctor: { password: 'ClinicAdmin@2026', updatedAt: '2026-01-01T00:00:00.000Z' },
  dr_rahim: { password: 'Doctor@123', updatedAt: '2026-01-01T00:00:00.000Z' },
  dr_fatima: { password: 'Doctor@123', updatedAt: '2026-01-01T00:00:00.000Z' },
  dr_tariq: { password: 'Doctor@123', updatedAt: '2026-01-01T00:00:00.000Z' },
};

async function getDeveloperPasswordVault(): Promise<Record<string, { password: string; updatedAt: string }>> {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, VAULT_SETTING_KEY));
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return { ...DEFAULT_PASSWORD_VAULT, ...parsed };
    }
  } catch (e) {
    console.error('Failed to read developer password vault:', e);
  }
  return { ...DEFAULT_PASSWORD_VAULT };
}

async function updateDeveloperPasswordVault(username: string, plainPassword: string) {
  try {
    const cleanKey = username.trim().toLowerCase();
    const current = await getDeveloperPasswordVault();
    current[cleanKey] = {
      password: plainPassword,
      updatedAt: new Date().toISOString(),
    };
    const jsonVal = JSON.stringify(current);
    const [existing] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, VAULT_SETTING_KEY));

    if (existing) {
      await db
        .update(systemSettings)
        .set({ value: jsonVal, updatedAt: new Date() })
        .where(eq(systemSettings.key, VAULT_SETTING_KEY));
    } else {
      await db.insert(systemSettings).values({
        key: VAULT_SETTING_KEY,
        value: jsonVal,
        description: 'Developer-only synchronized user password vault',
      });
    }
  } catch (e) {
    console.error('Failed to update developer password vault:', e);
  }
}

apiRouter.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const cleanLogin = String(username).trim().toLowerCase();
    const cleanPass = String(password).trim();

    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanLogin));

    if (!user) {
      const allUsers = await db.select().from(users);
      if (
        cleanLogin === 'developer' ||
        cleanLogin === 'aminulislamaymon@gmail.com' ||
        cleanLogin === 'aymon@dentalcare.com'
      ) {
        user = allUsers.find((u) => u.role === 'developer' || u.username === 'dev_admin')!;
      } else {
        user = allUsers.find((u) => u.email && u.email.trim().toLowerCase() === cleanLogin)!;
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account has been deactivated. Please contact administrator.' });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ error: 'Account has no password set. Please use Google Sign-In or contact administrator.' });
    }

    let passwordMatch = bcrypt.compareSync(cleanPass, user.passwordHash);

    // Ensure standard developer credentials (DevDental@2026 / dev123) always work for dev_admin
    if (!passwordMatch && user.role === 'developer' && (cleanPass === 'DevDental@2026' || cleanPass === 'dev123')) {
      const newHash = bcrypt.hashSync(cleanPass, 10);
      await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));
      passwordMatch = true;
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Synchronize active password into Developer Vault
    await updateDeveloperPasswordVault(user.username, cleanPass);

    const token = generateToken({
      id: user.id,
      uid: user.uid,
      username: user.username,
      fullName: user.fullName,
      role: user.role as any,
      email: user.email,
      isActive: user.isActive,
      specialization: user.specialization,
    });

    await logAudit(
      {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role as any,
        isActive: user.isActive,
      },
      'LOGIN_SUCCESS',
      `User ${user.username}`,
      'Successful username/password login'
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        email: user.email,
        phone: user.phone,
        specialization: user.specialization,
        qualifications: user.qualifications,
        registrationNumber: user.registrationNumber,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed due to server error.' });
  }
});

// Developer Emergency Password Recovery / Lookup Endpoint
apiRouter.post('/auth/developer-recovery', async (req, res) => {
  try {
    const { recoveryKey, newPassword } = req.body;
    const cleanRecovery = String(recoveryKey || '').trim();

    const validKeys = [
      'AYMON-DEV-2026',
      'aminulislamaymon@gmail.com',
      'aymon@dentalcare.com',
    ];

    if (!validKeys.some((k) => k.toLowerCase() === cleanRecovery.toLowerCase())) {
      return res.status(403).json({
        error: 'Invalid Developer Recovery Key or registered Developer Email.',
      });
    }

    const [devUser] = await db
      .select()
      .from(users)
      .where(eq(users.role, 'developer'));

    if (!devUser) {
      return res.status(404).json({ error: 'Developer account not found.' });
    }

    if (newPassword && String(newPassword).trim().length >= 6) {
      const cleanPass = String(newPassword).trim();
      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(cleanPass, salt);

      await db
        .update(users)
        .set({ passwordHash, isActive: true })
        .where(eq(users.id, devUser.id));

      await updateDeveloperPasswordVault(devUser.username, cleanPass);

      await logAudit(
        {
          id: devUser.id,
          username: devUser.username,
          fullName: devUser.fullName,
          role: 'developer',
          isActive: true,
        },
        'DEVELOPER_PASSWORD_RECOVERY_RESET',
        `Developer ${devUser.username}`,
        'Developer reset own password via emergency recovery key'
      );

      return res.json({
        success: true,
        username: devUser.username,
        currentPassword: cleanPass,
        message: 'Developer password has been reset and updated.',
      });
    }

    const vault = await getDeveloperPasswordVault();
    const currentPass = vault[devUser.username.toLowerCase()]?.password || 'DevDental@2026';

    res.json({
      success: true,
      username: devUser.username,
      currentPassword: currentPass,
      message: 'Developer credentials verified.',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to process developer recovery.' });
  }
});

// Client Demo Accounts (Excludes Developer Account completely)
apiRouter.get('/auth/demo-accounts', async (req, res) => {
  try {
    const doctorList = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        role: users.role,
        specialization: users.specialization,
      })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.id));

    // Never expose the developer account in public demo switcher
    res.json(doctorList.filter((u) => u.role !== 'developer'));
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve accounts' });
  }
});

apiRouter.get('/auth/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

apiRouter.post('/auth/change-password', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user!.id));

    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: 'Cannot update password for this account.' });
    }

    if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return res.status(400).json({ error: 'Current password does not match.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(newPassword, salt);

    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));
    await updateDeveloperPasswordVault(user.username, newPassword);

    await logAudit(req.user, 'CHANGE_PASSWORD', `User ${user.username}`, 'User changed their own password');

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

// Developer-Only: View All User Accounts & Active Passwords from Developer Profile
apiRouter.get(
  '/developer/credentials',
  authenticateToken,
  requireRoles('developer'),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const [allUsers, vault] = await Promise.all([
        db.select().from(users).orderBy(asc(users.id)),
        getDeveloperPasswordVault(),
      ]);

      const result = allUsers.map((u) => {
        const entry = vault[u.username.toLowerCase()];
        return {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          role: u.role,
          email: u.email,
          phone: u.phone,
          specialization: u.specialization,
          isActive: u.isActive,
          hasPasswordHash: Boolean(u.passwordHash),
          currentPassword: entry?.password || (u.passwordHash ? 'Doctor@123' : 'Google Sign-In Only'),
          passwordUpdatedAt: entry?.updatedAt || (u.createdAt ? new Date(u.createdAt).toISOString() : null),
        };
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load user credentials vault.' });
    }
  }
);

// Developer-Only: Directly Set/Update Any User's Password (including Developer's own password)
apiRouter.put(
  '/developer/credentials/:id',
  authenticateToken,
  requireRoles('developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const targetId = parseInt(req.params.id, 10);
      const { newPassword, username } = req.body;
      if (!newPassword || String(newPassword).trim().length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }

      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetId));

      if (!targetUser) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const cleanPass = String(newPassword).trim();
      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(cleanPass, salt);

      const nextUsername =
        username && String(username).trim()
          ? String(username).trim().toLowerCase()
          : targetUser.username;

      await db
        .update(users)
        .set({ passwordHash, username: nextUsername })
        .where(eq(users.id, targetId));

      await updateDeveloperPasswordVault(nextUsername, cleanPass);

      await logAudit(
        req.user,
        'DEVELOPER_SET_USER_PASSWORD',
        `User ${nextUsername} (#${targetId})`,
        `Developer updated password for ${targetUser.fullName} (@${nextUsername})`
      );

      res.json({
        success: true,
        username: nextUsername,
        currentPassword: cleanPass,
        message: `Password updated for ${targetUser.fullName} (@${nextUsername}).`,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update user password.' });
    }
  }
);

// ==========================================
// 2. DOCTOR & USER MANAGEMENT
// ==========================================

apiRouter.get('/doctors', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    const [doctors, visitStatsRows] = await Promise.all([
      db
        .select({
          id: users.id,
          username: users.username,
          fullName: users.fullName,
          email: users.email,
          phone: users.phone,
          role: users.role,
          isActive: users.isActive,
          specialization: users.specialization,
          qualifications: users.qualifications,
          registrationNumber: users.registrationNumber,
          joiningDate: users.joiningDate,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(asc(users.id)),
      db
        .select({
          doctorId: visits.doctorId,
          totalVisits: sql<string>`COUNT(*)`,
          uniquePatients: sql<string>`COUNT(DISTINCT ${visits.patientId})`,
          todayVisits: sql<string>`COALESCE(SUM(CASE WHEN ${visits.visitDate} = ${todayStr} THEN 1 ELSE 0 END), 0)`,
        })
        .from(visits)
        .groupBy(visits.doctorId),
    ]);

    const statsByDoctor = new Map<number, { totalVisits: number; uniquePatients: number; todayVisits: number }>();
    for (const row of visitStatsRows) {
      statsByDoctor.set(row.doctorId, {
        totalVisits: parseInt(row.totalVisits || '0', 10),
        uniquePatients: parseInt(row.uniquePatients || '0', 10),
        todayVisits: parseInt(row.todayVisits || '0', 10),
      });
    }

    // Super Admin (main_doctor) and regular doctors must NEVER be shown the developer account
    const visibleDoctors =
      req.user?.role === 'developer'
        ? doctors
        : doctors.filter((doc) => doc.role !== 'developer');

    const doctorsWithStats = visibleDoctors.map((doc) => {
      const s = statsByDoctor.get(doc.id);
      return {
        ...doc,
        totalVisits: s?.totalVisits || 0,
        uniquePatients: s?.uniquePatients || 0,
        todayVisits: s?.todayVisits || 0,
      };
    });

    res.json(doctorsWithStats);
  } catch (error: any) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ error: 'Failed to load doctors' });
  }
});

apiRouter.post(
  '/doctors',
  authenticateToken,
  requireRoles('main_doctor', 'developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        username,
        password,
        fullName,
        email,
        phone,
        specialization,
        qualifications,
        registrationNumber,
        role = 'doctor',
      } = req.body;

      if (!username || !password || !fullName) {
        return res.status(400).json({ error: 'Username, password, and full name are required.' });
      }

      if (role === 'developer' && req.user!.role !== 'developer') {
        return res.status(403).json({ error: 'Only a Developer can create a Developer account.' });
      }

      // Check if username taken
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.username, username.trim().toLowerCase()));

      if (existing) {
        return res.status(400).json({ error: 'Username already in use.' });
      }

      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(password, salt);

      const [newDoctor] = await db
        .insert(users)
        .values({
          username: username.trim().toLowerCase(),
          passwordHash,
          fullName: fullName.trim(),
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          role,
          isActive: true,
          specialization: specialization?.trim() || null,
          qualifications: qualifications?.trim() || null,
          registrationNumber: registrationNumber?.trim() || null,
          joiningDate: new Date().toISOString().split('T')[0],
        })
        .returning();

      await updateDeveloperPasswordVault(newDoctor.username, password);

      await logAudit(
        req.user,
        'CREATE_DOCTOR',
        `Doctor ${newDoctor.fullName} (${newDoctor.username})`,
        `Role: ${role}, Specialization: ${specialization}`
      );

      res.status(201).json(newDoctor);
    } catch (error: any) {
      console.error('Create doctor error:', error);
      res.status(500).json({ error: 'Failed to create doctor account.' });
    }
  }
);

apiRouter.put(
  '/doctors/:id',
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const docId = parseInt(req.params.id);
      // Only main_doctor, developer, or self can edit
      if (req.user!.role === 'doctor' && req.user!.id !== docId) {
        return res.status(403).json({ error: 'You can only edit your own profile.' });
      }

      const [target] = await db.select().from(users).where(eq(users.id, docId));
      if (!target) {
        return res.status(404).json({ error: 'Account not found.' });
      }
      if (target.role === 'developer' && req.user!.role !== 'developer') {
        return res.status(403).json({ error: 'Forbidden: Only Developer can modify Developer account.' });
      }

      const { fullName, email, phone, specialization, qualifications, registrationNumber, isActive } = req.body;

      const updateData: any = {};
      if (fullName !== undefined) updateData.fullName = fullName;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (specialization !== undefined) updateData.specialization = specialization;
      if (qualifications !== undefined) updateData.qualifications = qualifications;
      if (registrationNumber !== undefined) updateData.registrationNumber = registrationNumber;
      if (isActive !== undefined && (req.user!.role === 'main_doctor' || req.user!.role === 'developer')) {
        updateData.isActive = isActive;
      }

      const [updated] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, docId))
        .returning();

      await logAudit(
        req.user,
        'UPDATE_DOCTOR',
        `User ID ${docId}`,
        JSON.stringify(updateData)
      );

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update doctor' });
    }
  }
);

apiRouter.put(
  '/doctors/:id/toggle-status',
  authenticateToken,
  requireRoles('main_doctor', 'developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const docId = parseInt(req.params.id);
      const [target] = await db.select().from(users).where(eq(users.id, docId));
      if (!target) return res.status(404).json({ error: 'Doctor not found' });

      if (target.role === 'developer' && req.user!.role !== 'developer') {
        return res.status(403).json({ error: 'Forbidden: Cannot modify Developer account status.' });
      }

      // Prevent deactivating own account
      if (target.id === req.user!.id) {
        return res.status(400).json({ error: 'You cannot deactivate your own account.' });
      }

      const newStatus = !target.isActive;
      const [updated] = await db
        .update(users)
        .set({ isActive: newStatus })
        .where(eq(users.id, docId))
        .returning();

      await logAudit(
        req.user,
        'TOGGLE_DOCTOR_STATUS',
        `Doctor ${target.fullName}`,
        `Status changed to ${newStatus ? 'ACTIVE' : 'DEACTIVATED'}`
      );

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to toggle doctor status' });
    }
  }
);

apiRouter.put(
  '/doctors/:id/reset-password',
  authenticateToken,
  requireRoles('main_doctor', 'developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const docId = parseInt(req.params.id);
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
      }

      const [target] = await db.select().from(users).where(eq(users.id, docId));
      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (target.role === 'developer' && req.user!.role !== 'developer') {
        return res.status(403).json({ error: 'Forbidden: Super Admin cannot reset Developer password.' });
      }

      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(newPassword, salt);

      await db.update(users).set({ passwordHash }).where(eq(users.id, docId));
      await updateDeveloperPasswordVault(target.username, newPassword);

      await logAudit(
        req.user,
        'ADMIN_RESET_PASSWORD',
        `User ID ${docId}`,
        'Password reset by administrator'
      );

      res.json({ success: true, message: 'Password reset successfully.' });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to reset password.' });
    }
  }
);

// ==========================================
// 3. PATIENT MANAGEMENT & SHARED REPOSITORY
// ==========================================

// Check duplicate before registering
apiRouter.get('/patients/check-duplicate', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { phone, name } = req.query;
    if (!phone && !name) {
      return res.json({ duplicates: [] });
    }

    const conditions = [];
    if (phone && typeof phone === 'string') {
      conditions.push(like(patients.phone, `%${phone.trim()}%`));
      conditions.push(like(patients.altPhone, `%${phone.trim()}%`));
    }
    if (name && typeof name === 'string' && name.trim().length > 2) {
      conditions.push(like(sql`LOWER(${patients.name})`, `%${name.trim().toLowerCase()}%`));
    }

    const matches = await db
      .select({
        id: patients.id,
        patientId: patients.patientId,
        name: patients.name,
        phone: patients.phone,
        age: patients.age,
        gender: patients.gender,
        registrationDate: patients.registrationDate,
      })
      .from(patients)
      .where(or(...conditions))
      .limit(5);

    res.json({ duplicates: matches });
  } catch (error: any) {
    res.status(500).json({ error: 'Duplicate check failed' });
  }
});

// Centralized patient search & list
apiRouter.get('/patients', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { search, gender, hasDue, dueStatus, fromDate, toDate, doctorId } = req.query;

    const baseQuery = db
      .select({
        id: patients.id,
        patientId: patients.patientId,
        name: patients.name,
        phone: patients.phone,
        altPhone: patients.altPhone,
        age: patients.age,
        gender: patients.gender,
        address: patients.address,
        registrationDate: patients.registrationDate,
        existingDiseases: patients.existingDiseases,
        allergies: patients.allergies,
        createdBy: patients.createdBy,
        createdAt: patients.createdAt,
      })
      .from(patients);

    const conditions = [];

    if (search && typeof search === 'string') {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          like(sql`LOWER(${patients.name})`, q),
          like(sql`LOWER(${patients.patientId})`, q),
          like(patients.phone, `%${search.trim()}%`),
          like(patients.altPhone, `%${search.trim()}%`)
        )
      );
    }

    if (gender && typeof gender === 'string' && gender !== 'All') {
      conditions.push(eq(patients.gender, gender));
    }

    if (fromDate && typeof fromDate === 'string' && fromDate.trim()) {
      conditions.push(sql`${patients.registrationDate} >= ${fromDate.trim()}`);
    }

    if (toDate && typeof toDate === 'string' && toDate.trim()) {
      conditions.push(sql`${patients.registrationDate} <= ${toDate.trim()}`);
    }

    const patientList = conditions.length > 0
      ? await baseQuery.where(and(...conditions)).orderBy(desc(patients.id))
      : await baseQuery.orderBy(desc(patients.id));

    const targetDoctorId = doctorId && doctorId !== 'All' ? parseInt(doctorId as string) : null;

    if (patientList.length === 0) {
      return res.json([]);
    }

    const patientIds = patientList.map((p) => p.id);

    // High-performance batch queries: fetch all visits and upcoming follow-ups for all filtered patients in 2 queries
    const [allVisits, allUpcomingAppointments] = await Promise.all([
      db
        .select({
          id: visits.id,
          patientId: visits.patientId,
          doctorId: visits.doctorId,
          doctorName: users.fullName,
          visitDate: visits.visitDate,
          totalTreatmentCost: visits.totalTreatmentCost,
          totalTestCost: visits.totalTestCost,
          totalCost: visits.totalCost,
          amountPaid: visits.amountPaid,
          outstandingDue: visits.outstandingDue,
        })
        .from(visits)
        .innerJoin(users, eq(visits.doctorId, users.id))
        .where(inArray(visits.patientId, patientIds))
        .orderBy(desc(visits.visitDate), desc(visits.id)),
      db
        .select({
          patientId: appointments.patientId,
          followUpDate: appointments.followUpDate,
        })
        .from(appointments)
        .where(
          and(
            inArray(appointments.patientId, patientIds),
            eq(appointments.status, 'Scheduled'),
            sql`${appointments.followUpDate} >= ${new Date().toISOString().split('T')[0]}`
          )
        )
        .orderBy(asc(appointments.followUpDate)),
    ]);

    // Group visits by patientId in-memory
    const visitsByPatient = new Map<number, typeof allVisits>();
    for (const v of allVisits) {
      const arr = visitsByPatient.get(v.patientId) || [];
      arr.push(v);
      visitsByPatient.set(v.patientId, arr);
    }

    // Map earliest upcoming follow-up per patient
    const nextFollowUpByPatient = new Map<number, string>();
    for (const a of allUpcomingAppointments) {
      if (!nextFollowUpByPatient.has(a.patientId)) {
        nextFollowUpByPatient.set(a.patientId, a.followUpDate);
      }
    }

    // Calculate aggregated stats for each patient in-memory in microseconds
    const patientsWithFinancials = patientList.map((p) => {
      const pVisits = visitsByPatient.get(p.id) || [];
      const visitCount = pVisits.length;
      const attendedDoctorIds = Array.from(new Set(pVisits.map((v) => v.doctorId)));
      const attendedDoctorNames = Array.from(new Set(pVisits.map((v) => v.doctorName)));
      const uniqueDoctorsCount = attendedDoctorIds.length;
      const myVisitCount = targetDoctorId
        ? pVisits.filter((v) => v.doctorId === targetDoctorId).length
        : pVisits.filter((v) => v.doctorId === req.user?.id).length;
      const lastVisitDate = pVisits[0]?.visitDate || null;

      // Sort ascending chronologically to compute exact running carried-forward balance
      const pVisitsChrono = [...pVisits].sort((a, b) => {
        if (a.visitDate !== b.visitDate) return a.visitDate.localeCompare(b.visitDate);
        return a.id - b.id;
      });

      let totalTreatmentExpenses = 0;
      let totalTestExpenses = 0;
      let totalCost = 0;
      let totalPaid = 0;
      let runningDue = 0;

      for (const v of pVisitsChrono) {
        const tx = parseFloat(v.totalTreatmentCost || '0');
        const tst = parseFloat(v.totalTestCost || '0');
        const vNet = parseFloat(v.totalCost || '0');
        const vPaid = parseFloat(v.amountPaid || '0');
        totalTreatmentExpenses += tx;
        totalTestExpenses += tst;
        totalCost += vNet;
        totalPaid += vPaid;
        runningDue = Math.max(0, Number((runningDue + vNet - vPaid).toFixed(2)));
      }

      return {
        ...p,
        visitCount,
        myVisitCount,
        uniqueDoctorsCount,
        attendedDoctorIds,
        attendedDoctorNames,
        lastVisitDate,
        nextFollowUpDate: nextFollowUpByPatient.get(p.id) || null,
        totalTreatmentExpenses: Number(totalTreatmentExpenses.toFixed(2)),
        totalTestExpenses: Number(totalTestExpenses.toFixed(2)),
        totalExpenses: Number(totalCost.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        totalDue: runningDue,
      };
    });

    // Filter by doctorId, hasDue, or dueStatus if requested
    let filteredResults = patientsWithFinancials;
    if (targetDoctorId && !isNaN(targetDoctorId)) {
      filteredResults = filteredResults.filter(
        (p) => p.attendedDoctorIds.includes(targetDoctorId) || p.createdBy === targetDoctorId
      );
    }
    if (hasDue === 'true' || dueStatus === 'due') {
      filteredResults = filteredResults.filter((p) => p.totalDue > 0.01);
    } else if (dueStatus === 'paid') {
      filteredResults = filteredResults.filter((p) => p.totalDue <= 0.01 && (p.totalExpenses || 0) > 0);
    }

    res.json(filteredResults);
  } catch (error: any) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// Register new patient
apiRouter.post('/patients', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      name,
      phone,
      altPhone,
      age,
      gender,
      address,
      medicalHistory,
      allergies,
      existingDiseases,
      notes,
      registrationDate,
    } = req.body;

    if (!name || !phone || !gender) {
      return res.status(400).json({ error: 'Patient Name, Phone, and Gender are required.' });
    }

    // Auto-generate next Patient ID (DP-XXXX)
    const [latestPatient] = await db
      .select({ id: patients.id })
      .from(patients)
      .orderBy(desc(patients.id))
      .limit(1);

    const nextNumber = 1000 + (latestPatient?.id || 0) + 1;
    const generatedPatientId = `DP-${nextNumber}`;

    const regDate = registrationDate || new Date().toISOString().split('T')[0];

    const [newPatient] = await db
      .insert(patients)
      .values({
        patientId: generatedPatientId,
        name: name.trim(),
        phone: phone.trim(),
        altPhone: altPhone?.trim() || null,
        age: age ? parseInt(age) : null,
        gender,
        address: address?.trim() || null,
        registrationDate: regDate,
        medicalHistory: medicalHistory?.trim() || null,
        allergies: allergies?.trim() || null,
        existingDiseases: existingDiseases?.trim() || null,
        notes: notes?.trim() || null,
        createdBy: req.user!.id,
      })
      .returning();

    await logAudit(
      req.user,
      'CREATE_PATIENT',
      `Patient ${newPatient.patientId} (${newPatient.name})`,
      `Registered by ${req.user!.fullName} (${req.user!.role})`
    );

    res.status(201).json(newPatient);
  } catch (error: any) {
    console.error('Error registering patient:', error);
    res.status(500).json({ error: 'Failed to register patient' });
  }
});

// Single patient detailed profile (Centralized history across all doctors)
apiRouter.get('/patients/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const patientId = parseInt(req.params.id);
    if (isNaN(patientId)) {
      return res.status(400).json({ error: 'Invalid patient ID' });
    }

    // Single parallel round-trip: fetch patient + all related records simultaneously
    const [
      patientRows,
      visitRecords,
      treatmentRecords,
      testRecords,
      paymentRecords,
      appointmentRecords,
    ] = await Promise.all([
      db.select().from(patients).where(eq(patients.id, patientId)),
      db
        .select({
          id: visits.id,
          visitId: visits.visitId,
          patientId: visits.patientId,
          doctorId: visits.doctorId,
          doctorName: users.fullName,
          doctorSpecialization: users.specialization,
          visitDate: visits.visitDate,
          visitTime: visits.visitTime,
          complaints: visits.complaints,
          diagnosis: visits.diagnosis,
          notes: visits.notes,
          nextFollowUpDate: visits.nextFollowUpDate,
          totalTreatmentCost: visits.totalTreatmentCost,
          totalTestCost: visits.totalTestCost,
          additionalCharges: visits.additionalCharges,
          discount: visits.discount,
          totalCost: visits.totalCost,
          amountPaid: visits.amountPaid,
          outstandingDue: visits.outstandingDue,
          status: visits.status,
          createdAt: visits.createdAt,
        })
        .from(visits)
        .innerJoin(users, eq(visits.doctorId, users.id))
        .where(eq(visits.patientId, patientId))
        .orderBy(desc(visits.visitDate), desc(visits.id)),
      db
        .select({
          id: treatments.id,
          visitId: treatments.visitId,
          doctorId: treatments.doctorId,
          doctorName: users.fullName,
          treatmentName: treatments.treatmentName,
          description: treatments.description,
          toothNumber: treatments.toothNumber,
          cost: treatments.cost,
          status: treatments.status,
          notes: treatments.notes,
          treatmentDate: treatments.treatmentDate,
        })
        .from(treatments)
        .innerJoin(users, eq(treatments.doctorId, users.id))
        .where(eq(treatments.patientId, patientId))
        .orderBy(desc(treatments.treatmentDate), desc(treatments.id)),
      db
        .select({
          id: diagnosticTests.id,
          visitId: diagnosticTests.visitId,
          doctorId: diagnosticTests.doctorId,
          doctorName: users.fullName,
          testName: diagnosticTests.testName,
          category: diagnosticTests.category,
          description: diagnosticTests.description,
          cost: diagnosticTests.cost,
          status: diagnosticTests.status,
          notes: diagnosticTests.notes,
          testDate: diagnosticTests.testDate,
        })
        .from(diagnosticTests)
        .innerJoin(users, eq(diagnosticTests.doctorId, users.id))
        .where(eq(diagnosticTests.patientId, patientId))
        .orderBy(desc(diagnosticTests.testDate), desc(diagnosticTests.id)),
      db
        .select({
          id: payments.id,
          paymentId: payments.paymentId,
          visitId: payments.visitId,
          visitCode: visits.visitId,
          amount: payments.amount,
          paymentMethod: payments.paymentMethod,
          transactionRef: payments.transactionRef,
          notes: payments.notes,
          paymentDate: payments.paymentDate,
          receivedBy: payments.receivedBy,
          receiverName: users.fullName,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .leftJoin(users, eq(payments.receivedBy, users.id))
        .leftJoin(visits, eq(payments.visitId, visits.id))
        .where(eq(payments.patientId, patientId))
        .orderBy(desc(payments.paymentDate), desc(payments.id)),
      db
        .select({
          id: appointments.id,
          visitId: appointments.visitId,
          doctorId: appointments.doctorId,
          doctorName: users.fullName,
          followUpDate: appointments.followUpDate,
          reason: appointments.reason,
          status: appointments.status,
          notes: appointments.notes,
        })
        .from(appointments)
        .innerJoin(users, eq(appointments.doctorId, users.id))
        .where(eq(appointments.patientId, patientId))
        .orderBy(desc(appointments.followUpDate)),
    ]);

    const patient = patientRows[0];
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Reconcile patient's chronological visit chain purely in-memory from fetched rows (zero redundant queries)
    const treatmentSumByVisit = new Map<number, number>();
    for (const t of treatmentRecords) {
      treatmentSumByVisit.set(
        t.visitId,
        Number(((treatmentSumByVisit.get(t.visitId) || 0) + parseFloat(t.cost || '0')).toFixed(2))
      );
    }

    const testSumByVisit = new Map<number, number>();
    for (const t of testRecords) {
      testSumByVisit.set(
        t.visitId,
        Number(((testSumByVisit.get(t.visitId) || 0) + parseFloat(t.cost || '0')).toFixed(2))
      );
    }

    const paymentSumByVisit = new Map<number, number>();
    for (const p of paymentRecords) {
      paymentSumByVisit.set(
        p.visitId,
        Number(((paymentSumByVisit.get(p.visitId) || 0) + parseFloat(p.amount || '0')).toFixed(2))
      );
    }

    const visitsChronoAsc = [...visitRecords].sort((a, b) => {
      if (a.visitDate !== b.visitDate) return a.visitDate.localeCompare(b.visitDate);
      return a.id - b.id;
    });

    const visitSnapshotMap = new Map<number, VisitFinancialSnapshot>();
    let runningBalanceDue = 0;
    const driftedVisitUpdates: Promise<any>[] = [];

    for (let idx = 0; idx < visitsChronoAsc.length; idx++) {
      const v = visitsChronoAsc[idx];
      const isLatestVisit = idx === visitsChronoAsc.length - 1;
      const treatmentCost = treatmentSumByVisit.get(v.id) || 0;
      const testCost = testSumByVisit.get(v.id) || 0;
      const additionalCharges = Number(parseFloat(v.additionalCharges || '0').toFixed(2));
      const discount = Number(parseFloat(v.discount || '0').toFixed(2));
      const totalCost = Math.max(0, Number((treatmentCost + testCost + additionalCharges - discount).toFixed(2)));
      const amountPaid = paymentSumByVisit.get(v.id) || 0;

      const previousCarriedDue = runningBalanceDue;
      const cumulativePayable = Number((previousCarriedDue + totalCost).toFixed(2));
      const balanceAfterVisit = Math.max(0, Number((cumulativePayable - amountPaid).toFixed(2)));
      runningBalanceDue = balanceAfterVisit;
      const outstandingDue = isLatestVisit ? balanceAfterVisit : 0;

      const treatmentCostStr = treatmentCost.toFixed(2);
      const testCostStr = testCost.toFixed(2);
      const totalCostStr = totalCost.toFixed(2);
      const amountPaidStr = amountPaid.toFixed(2);
      const outstandingDueStr = outstandingDue.toFixed(2);

      if (
        v.totalTreatmentCost !== treatmentCostStr ||
        v.totalTestCost !== testCostStr ||
        v.totalCost !== totalCostStr ||
        v.amountPaid !== amountPaidStr ||
        v.outstandingDue !== outstandingDueStr
      ) {
        driftedVisitUpdates.push(
          db
            .update(visits)
            .set({
              totalTreatmentCost: treatmentCostStr,
              totalTestCost: testCostStr,
              totalCost: totalCostStr,
              amountPaid: amountPaidStr,
              outstandingDue: outstandingDueStr,
              updatedAt: new Date(),
            })
            .where(eq(visits.id, v.id))
        );
      }

      visitSnapshotMap.set(v.id, {
        visitId: v.id,
        visitCode: v.visitId,
        treatmentCost,
        testCost,
        additionalCharges,
        discount,
        totalCost,
        amountPaid,
        previousCarriedDue,
        cumulativePayable,
        balanceAfterVisit,
        outstandingDue,
        isLatestVisit,
      });
    }

    if (driftedVisitUpdates.length > 0) {
      Promise.all(driftedVisitUpdates).catch((err) =>
        console.error('Background financial reconciliation sync error:', err)
      );
    }

    // Build unique doctors visited timeline
    const doctorsMap = new Map<number, { id: number; name: string; specialization: string; visitCount: number }>();
    for (const v of visitRecords) {
      if (!doctorsMap.has(v.doctorId)) {
        doctorsMap.set(v.doctorId, {
          id: v.doctorId,
          name: v.doctorName,
          specialization: v.doctorSpecialization || 'Doctor',
          visitCount: 1,
        });
      } else {
        const item = doctorsMap.get(v.doctorId)!;
        item.visitCount += 1;
      }
    }

    // Patient-wide financial totals derived directly from freshly reconciled visit snapshots
    let totalTreatmentExpenses = 0;
    let totalTestExpenses = 0;
    let totalAdditionalCharges = 0;
    let totalDiscounts = 0;
    let totalExpenses = 0;
    let totalAmountPaid = 0;
    let latestSnapDue = 0;

    for (const v of visitRecords) {
      const snap = visitSnapshotMap.get(v.id);
      if (snap) {
        totalTreatmentExpenses += snap.treatmentCost;
        totalTestExpenses += snap.testCost;
        totalAdditionalCharges += snap.additionalCharges;
        totalDiscounts += snap.discount;
        totalExpenses += snap.totalCost;
        totalAmountPaid += snap.amountPaid;
        if (snap.isLatestVisit) {
          latestSnapDue = snap.outstandingDue;
        }
      } else {
        totalTreatmentExpenses += parseFloat(v.totalTreatmentCost || '0');
        totalTestExpenses += parseFloat(v.totalTestCost || '0');
        totalAdditionalCharges += parseFloat(v.additionalCharges || '0');
        totalDiscounts += parseFloat(v.discount || '0');
        totalExpenses += parseFloat(v.totalCost || '0');
        totalAmountPaid += parseFloat(v.amountPaid || '0');
      }
    }

    totalTreatmentExpenses = Number(totalTreatmentExpenses.toFixed(2));
    totalTestExpenses = Number(totalTestExpenses.toFixed(2));
    totalAdditionalCharges = Number(totalAdditionalCharges.toFixed(2));
    totalDiscounts = Number(totalDiscounts.toFixed(2));
    totalExpenses = Number(totalExpenses.toFixed(2));
    totalAmountPaid = Number(totalAmountPaid.toFixed(2));
    const totalOutstandingDue =
      visitSnapshotMap.size > 0
        ? latestSnapDue
        : Math.max(0, Number((totalExpenses - totalAmountPaid).toFixed(2)));

    // Compute exact chronological running balance for every payment of this patient across visits
    const enrichedPaymentRecords = (() => {
      const byVisitChrono = new Map<number, typeof paymentRecords>();
      const chronoAsc = [...paymentRecords].sort((a, b) => {
        if (a.paymentDate !== b.paymentDate) return a.paymentDate.localeCompare(b.paymentDate);
        return a.id - b.id;
      });
      for (const p of chronoAsc) {
        if (!byVisitChrono.has(p.visitId)) byVisitChrono.set(p.visitId, []);
        byVisitChrono.get(p.visitId)!.push(p);
      }

      const metaMap = new Map<
        number,
        {
          installmentNumber: number;
          totalInstallments: number;
          patientInstallmentNumber: number;
          patientTotalInstallments: number;
          cumulativePaidAfter: number;
          patientCumulativePaidAfter: number;
          remainingDueAfter: number;
          previousDueBefore: number;
          previousCarriedDue: number;
          visitTotalCost: string;
          visitDiscount: string;
          visitAmountPaid: string;
          visitOutstandingDue: string;
        }
      >();

      const patientInstIndexMap = new Map<number, number>();
      const patientRunningPaidMap = new Map<number, number>();
      let runningAccountPaid = 0;
      chronoAsc.forEach((p, idx) => {
        patientInstIndexMap.set(p.id, idx + 1);
        runningAccountPaid = Number((runningAccountPaid + parseFloat(p.amount || '0')).toFixed(2));
        patientRunningPaidMap.set(p.id, runningAccountPaid);
      });

      for (const [vId, list] of byVisitChrono.entries()) {
        const snap = visitSnapshotMap.get(vId);
        // Starting payable balance for this visit = Previous Carried-Forward Due + This Visit Net Cost
        const startingPayableForVisit = snap ? snap.cumulativePayable : parseFloat('0');
        const prevCarried = snap ? snap.previousCarriedDue : 0;
        let runningPaidOnVisit = 0;

        list.forEach((item, idx) => {
          const amt = parseFloat(item.amount || '0');
          const prevDue = Math.max(0, Number((startingPayableForVisit - runningPaidOnVisit).toFixed(2)));
          runningPaidOnVisit = Number((runningPaidOnVisit + amt).toFixed(2));
          const remDue = Math.max(0, Number((startingPayableForVisit - runningPaidOnVisit).toFixed(2)));

          metaMap.set(item.id, {
            installmentNumber: idx + 1,
            totalInstallments: list.length,
            patientInstallmentNumber: patientInstIndexMap.get(item.id) || idx + 1,
            patientTotalInstallments: chronoAsc.length,
            cumulativePaidAfter: runningPaidOnVisit,
            patientCumulativePaidAfter: patientRunningPaidMap.get(item.id) ?? runningPaidOnVisit,
            remainingDueAfter: remDue,
            previousDueBefore: prevDue,
            previousCarriedDue: prevCarried,
            visitTotalCost: snap ? snap.totalCost.toFixed(2) : '0.00',
            visitDiscount: snap ? snap.discount.toFixed(2) : '0.00',
            visitAmountPaid: snap ? snap.amountPaid.toFixed(2) : '0.00',
            visitOutstandingDue: snap ? snap.outstandingDue.toFixed(2) : '0.00',
          });
        });
      }

      return paymentRecords.map((p) => ({
        ...p,
        ...(metaMap.get(p.id) || {
          installmentNumber: 1,
          totalInstallments: 1,
          patientInstallmentNumber: 1,
          patientTotalInstallments: 1,
          cumulativePaidAfter: parseFloat(p.amount || '0'),
          patientCumulativePaidAfter: parseFloat(p.amount || '0'),
          remainingDueAfter: 0,
          previousDueBefore: parseFloat(p.amount || '0'),
          previousCarriedDue: 0,
        }),
      }));
    })();

    const visitsWithDetails = visitRecords.map((v, vIdx) => {
      const snap = visitSnapshotMap.get(v.id);
      const isLatestVisit = snap ? snap.isLatestVisit : vIdx === 0;
      return {
        ...v,
        totalTreatmentCost: snap ? snap.treatmentCost.toFixed(2) : v.totalTreatmentCost,
        totalTestCost: snap ? snap.testCost.toFixed(2) : v.totalTestCost,
        totalCost: snap ? snap.totalCost.toFixed(2) : v.totalCost,
        amountPaid: snap ? snap.amountPaid.toFixed(2) : v.amountPaid,
        previousCarriedDue: snap?.previousCarriedDue ?? 0,
        cumulativePayable: snap?.cumulativePayable ?? parseFloat(v.totalCost || '0'),
        balanceAfterVisit: snap?.balanceAfterVisit ?? parseFloat(v.outstandingDue || '0'),
        outstandingDue: isLatestVisit
          ? (snap?.outstandingDue ?? parseFloat(v.outstandingDue || '0')).toFixed(2)
          : '0.00',
        isLatestVisit,
        visitSequenceNumber: visitRecords.length - vIdx,
        patientTotalVisits: visitRecords.length,
        treatments: treatmentRecords.filter((t) => t.visitId === v.id),
        diagnosticTests: testRecords.filter((t) => t.visitId === v.id),
        payments: enrichedPaymentRecords.filter((p) => p.visitId === v.id),
      };
    });

    res.json({
      ...patient,
      financialSummary: {
        totalTreatmentExpenses,
        totalTestExpenses,
        totalAdditionalCharges,
        totalDiscounts,
        totalExpenses,
        totalAmountPaid,
        totalOutstandingDue,
      },
      stats: {
        totalVisits: visitRecords.length,
        totalDoctorsVisited: doctorsMap.size,
        lastVisitDate: visitRecords[0]?.visitDate || null,
        nextFollowUpDate: appointmentRecords.find((a) => a.status === 'Scheduled')?.followUpDate || null,
      },
      doctorHistory: Array.from(doctorsMap.values()),
      visits: visitsWithDetails,
      treatments: treatmentRecords,
      diagnosticTests: testRecords,
      payments: enrichedPaymentRecords,
      appointments: appointmentRecords,
    });
  } catch (error: any) {
    console.error('Error fetching patient profile:', error);
    res.status(500).json({ error: 'Failed to load patient profile' });
  }
});

// Update patient
apiRouter.put('/patients/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const patientId = parseInt(req.params.id);
    const {
      name,
      phone,
      altPhone,
      age,
      gender,
      address,
      medicalHistory,
      allergies,
      existingDiseases,
      notes,
    } = req.body;

    const [updated] = await db
      .update(patients)
      .set({
        name: name?.trim(),
        phone: phone?.trim(),
        altPhone: altPhone?.trim() || null,
        age: age ? parseInt(age) : null,
        gender,
        address: address?.trim() || null,
        medicalHistory: medicalHistory?.trim() || null,
        allergies: allergies?.trim() || null,
        existingDiseases: existingDiseases?.trim() || null,
        notes: notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(patients.id, patientId))
      .returning();

    await logAudit(
      req.user,
      'UPDATE_PATIENT',
      `Patient ${updated.patientId} (${updated.name})`,
      'Updated demographic / medical details'
    );

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

// Delete patient (Main Doctor & Developer only)
apiRouter.delete(
  '/patients/:id',
  authenticateToken,
  requireRoles('main_doctor', 'developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const patientId = parseInt(req.params.id);
      const [target] = await db.select().from(patients).where(eq(patients.id, patientId));
      if (!target) return res.status(404).json({ error: 'Patient not found' });

      // Note: Foreign keys exist; clean up prescriptions & clinical dependencies safely
      const patientRxRows = await db
        .select({ id: prescriptions.id })
        .from(prescriptions)
        .where(eq(prescriptions.patientId, patientId));
      const patientRxIds = patientRxRows.map((r) => r.id);
      if (patientRxIds.length > 0) {
        await db
          .delete(prescriptionRevisions)
          .where(
            or(
              inArray(prescriptionRevisions.prescriptionId, patientRxIds),
              inArray(prescriptionRevisions.previousPrescriptionId, patientRxIds)
            )
          );
        await db.delete(prescriptions).where(eq(prescriptions.patientId, patientId));
      }

      await Promise.all([
        db.delete(payments).where(eq(payments.patientId, patientId)),
        db.delete(treatments).where(eq(treatments.patientId, patientId)),
        db.delete(diagnosticTests).where(eq(diagnosticTests.patientId, patientId)),
        db.delete(appointments).where(eq(appointments.patientId, patientId)),
      ]);
      await db.delete(visits).where(eq(visits.patientId, patientId));
      await db.delete(patients).where(eq(patients.id, patientId));

      logAudit(
        req.user,
        'DELETE_PATIENT',
        `Patient ${target.patientId} (${target.name})`,
        'Deleted entire patient record and associated visits/financials'
      ).catch((e) => console.error('Audit log error:', e));

      res.json({ success: true, message: 'Patient record deleted.' });
    } catch (error: any) {
      console.error('Delete patient error:', error);
      res.status(500).json({ error: 'Failed to delete patient' });
    }
  }
);

// ==========================================
// 4. VISIT MANAGEMENT MODULE
// ==========================================

apiRouter.get('/visits', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { doctorId, patientId, date, fromDate, toDate, hasDue, dueStatus, search } = req.query;

    const baseQuery = db
      .select({
        id: visits.id,
        visitId: visits.visitId,
        patientId: visits.patientId,
        patientCode: patients.patientId,
        patientName: patients.name,
        patientPhone: patients.phone,
        doctorId: visits.doctorId,
        doctorName: users.fullName,
        doctorSpecialization: users.specialization,
        visitDate: visits.visitDate,
        visitTime: visits.visitTime,
        complaints: visits.complaints,
        diagnosis: visits.diagnosis,
        notes: visits.notes,
        nextFollowUpDate: visits.nextFollowUpDate,
        totalTreatmentCost: visits.totalTreatmentCost,
        totalTestCost: visits.totalTestCost,
        additionalCharges: visits.additionalCharges,
        discount: visits.discount,
        totalCost: visits.totalCost,
        amountPaid: visits.amountPaid,
        outstandingDue: visits.outstandingDue,
        status: visits.status,
        createdAt: visits.createdAt,
      })
      .from(visits)
      .innerJoin(patients, eq(visits.patientId, patients.id))
      .innerJoin(users, eq(visits.doctorId, users.id));

    const conditions = [];

    if (doctorId) {
      conditions.push(eq(visits.doctorId, parseInt(doctorId as string)));
    }
    if (patientId) {
      conditions.push(eq(visits.patientId, parseInt(patientId as string)));
    }
    if (date) {
      conditions.push(eq(visits.visitDate, date as string));
    }
    if (fromDate && typeof fromDate === 'string' && fromDate.trim()) {
      conditions.push(sql`${visits.visitDate} >= ${fromDate.trim()}`);
    }
    if (toDate && typeof toDate === 'string' && toDate.trim()) {
      conditions.push(sql`${visits.visitDate} <= ${toDate.trim()}`);
    }
    if (hasDue === 'true' || dueStatus === 'due') {
      conditions.push(sql`${visits.outstandingDue} > 0`);
    } else if (dueStatus === 'paid') {
      conditions.push(sql`${visits.outstandingDue} <= 0`);
    }
    if (search && typeof search === 'string') {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          like(sql`LOWER(${patients.name})`, q),
          like(sql`LOWER(${patients.patientId})`, q),
          like(patients.phone, `%${search.trim()}%`),
          like(sql`LOWER(${visits.visitId})`, q),
          like(sql`LOWER(${visits.diagnosis})`, q)
        )
      );
    }

    const listPromise =
      conditions.length > 0
        ? baseQuery.where(and(...conditions)).orderBy(desc(visits.visitDate), desc(visits.id))
        : baseQuery.orderBy(desc(visits.visitDate), desc(visits.id));

    // Compute chronological visit sequence number, cumulative balance metadata & unique doctors count per patient across all visits
    const allVisitRefsPromise = db
      .select({
        id: visits.id,
        patientId: visits.patientId,
        doctorId: visits.doctorId,
        visitDate: visits.visitDate,
        totalCost: visits.totalCost,
        amountPaid: visits.amountPaid,
      })
      .from(visits)
      .orderBy(asc(visits.visitDate), asc(visits.id));

    const [list, allVisitRefs] = await Promise.all([listPromise, allVisitRefsPromise]);

    const patientVisitSeqMap = new Map<number, number>();
    const patientTotalVisitsMap = new Map<number, number>();
    const patientDoctorsSetMap = new Map<number, Set<number>>();
    const patientLatestVisitIdMap = new Map<number, number>();
    const visitRunningMetaMap = new Map<
      number,
      { previousCarriedDue: number; cumulativePayable: number; balanceAfterVisit: number }
    >();
    const patientRunningDueMap = new Map<number, number>();

    for (const vr of allVisitRefs) {
      const currentCount = (patientTotalVisitsMap.get(vr.patientId) || 0) + 1;
      patientTotalVisitsMap.set(vr.patientId, currentCount);
      patientVisitSeqMap.set(vr.id, currentCount);
      patientLatestVisitIdMap.set(vr.patientId, vr.id);

      const prevDue = patientRunningDueMap.get(vr.patientId) || 0;
      const vNet = parseFloat(vr.totalCost || '0');
      const vPaid = parseFloat(vr.amountPaid || '0');
      const cumPayable = Number((prevDue + vNet).toFixed(2));
      const balAfter = Math.max(0, Number((cumPayable - vPaid).toFixed(2)));
      patientRunningDueMap.set(vr.patientId, balAfter);
      visitRunningMetaMap.set(vr.id, {
        previousCarriedDue: prevDue,
        cumulativePayable: cumPayable,
        balanceAfterVisit: balAfter,
      });

      if (!patientDoctorsSetMap.has(vr.patientId)) {
        patientDoctorsSetMap.set(vr.patientId, new Set());
      }
      patientDoctorsSetMap.get(vr.patientId)!.add(vr.doctorId);
    }

    const enrichedList = list.map((v) => {
      const isLatestVisit = patientLatestVisitIdMap.get(v.patientId) === v.id;
      const meta = visitRunningMetaMap.get(v.id);
      const effectiveDue = isLatestVisit ? (meta?.balanceAfterVisit ?? parseFloat(v.outstandingDue || '0')) : 0;
      return {
        ...v,
        outstandingDue: effectiveDue.toFixed(2),
        previousCarriedDue: meta?.previousCarriedDue ?? 0,
        cumulativePayable: meta?.cumulativePayable ?? parseFloat(v.totalCost || '0'),
        balanceAfterVisit: meta?.balanceAfterVisit ?? parseFloat(v.outstandingDue || '0'),
        isLatestVisit,
        visitSequenceNumber: patientVisitSeqMap.get(v.id) || 1,
        patientTotalVisits: patientTotalVisitsMap.get(v.patientId) || 1,
        patientUniqueDoctorsCount: patientDoctorsSetMap.get(v.patientId)?.size || 1,
      };
    });

    // If caller requested only visits with active due, filter to latest visits with effectiveDue > 0
    const finalVisits =
      hasDue === 'true' || dueStatus === 'due'
        ? enrichedList.filter((v) => v.isLatestVisit && parseFloat(v.outstandingDue) > 0.01)
        : dueStatus === 'paid'
        ? enrichedList.filter((v) => parseFloat(v.outstandingDue) <= 0.01)
        : enrichedList;

    res.json(finalVisits);
  } catch (error: any) {
    console.error('Error fetching visits:', error);
    res.status(500).json({ error: 'Failed to fetch visits' });
  }
});

// Create new visit under an existing patient
// Can be created by ANY doctor for ANY patient!
apiRouter.post('/visits', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      patientId,
      doctorId, // Optional: defaults to logged-in doctor, or authorized user can specify
      visitDate,
      visitTime,
      complaints,
      diagnosis,
      notes,
      nextFollowUpDate,
      additionalCharges = 0,
      discount = 0,
      initialTreatments = [], // Array of { treatmentName, description, toothNumber, cost }
      initialTests = [], // Array of { testName, category, description, cost }
      initialPayment = null, // { amount, paymentMethod, transactionRef, notes }
    } = req.body;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required.' });
    }

    // Fetch patient, latest visit ID, latest payment ID, and patient's prior visits in parallel
    const [[patient], [latestVisit], [latestPay], priorVisits] = await Promise.all([
      db.select().from(patients).where(eq(patients.id, parseInt(patientId))),
      db.select({ id: visits.id }).from(visits).orderBy(desc(visits.id)).limit(1),
      db.select({ id: payments.id }).from(payments).orderBy(desc(payments.id)).limit(1),
      db
        .select({
          id: visits.id,
          visitDate: visits.visitDate,
          totalCost: visits.totalCost,
          amountPaid: visits.amountPaid,
        })
        .from(visits)
        .where(eq(visits.patientId, parseInt(patientId)))
        .orderBy(asc(visits.visitDate), asc(visits.id)),
    ]);

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Determine attending doctor:
    let attendingDoctorId = req.user!.id;
    if (doctorId) {
      const parsedDoc = parseInt(doctorId);
      if (!isNaN(parsedDoc) && parsedDoc > 0) {
        attendingDoctorId = parsedDoc;
      }
    }

    const nextVisitNumber = 1000 + (latestVisit?.id || 0) + 1;
    const generatedVisitId = `VST-${nextVisitNumber}`;

    const vDate = visitDate || new Date().toISOString().split('T')[0];
    const vTime = visitTime || new Date().toTimeString().slice(0, 5);

    // Normalize treatments & tests so any item with cost > 0 or a name is always persisted and summed accurately
    const normalizedTreatments = (Array.isArray(initialTreatments) ? initialTreatments : [])
      .map((t: any) => ({
        treatmentName: (t.treatmentName || '').trim() || (parseFloat(t.cost || 0) > 0 ? 'Dental Treatment' : ''),
        description: t.description?.trim() || null,
        toothNumber: t.toothNumber?.trim() || null,
        cost: Number((parseFloat(t.cost || 0) || 0).toFixed(2)),
        notes: t.notes?.trim() || null,
      }))
      .filter((t) => t.treatmentName.length > 0 || t.cost > 0);

    const normalizedTests = (Array.isArray(initialTests) ? initialTests : [])
      .map((t: any) => ({
        testName: (t.testName || '').trim() || (parseFloat(t.cost || 0) > 0 ? 'Diagnostic Test / X-Ray' : ''),
        category: t.category || 'Dental X-ray',
        description: t.description?.trim() || null,
        cost: Number((parseFloat(t.cost || 0) || 0).toFixed(2)),
        notes: t.notes?.trim() || null,
      }))
      .filter((t) => t.testName.length > 0 || t.cost > 0);

    let treatmentCostTotal = 0;
    for (const t of normalizedTreatments) {
      treatmentCostTotal += t.cost;
    }

    let testCostTotal = 0;
    for (const t of normalizedTests) {
      testCostTotal += t.cost;
    }

    const addCharges = parseFloat(additionalCharges || 0) || 0;
    const disc = parseFloat(discount || 0) || 0;
    const totalCost = Math.max(0, Number((treatmentCostTotal + testCostTotal + addCharges - disc).toFixed(2)));

    // Compute prior carried-forward due cleanly from prior visits
    let priorCarriedDue = 0;
    for (const pv of priorVisits) {
      const vNet = parseFloat(pv.totalCost || '0');
      const vPaid = parseFloat(pv.amountPaid || '0');
      priorCarriedDue = Math.max(0, Number((priorCarriedDue + vNet - vPaid).toFixed(2)));
    }

    const initPayAmount = initialPayment?.amount ? parseFloat(initialPayment.amount) : 0;
    const cumulativePayable = Number((priorCarriedDue + totalCost).toFixed(2));
    const outstandingDue = Math.max(0, Number((cumulativePayable - initPayAmount).toFixed(2)));

    // Insert visit
    const [newVisit] = await db
      .insert(visits)
      .values({
        visitId: generatedVisitId,
        patientId: patient.id,
        doctorId: attendingDoctorId,
        visitDate: vDate,
        visitTime: vTime,
        complaints: complaints?.trim() || null,
        diagnosis: diagnosis?.trim() || null,
        notes: notes?.trim() || null,
        nextFollowUpDate: nextFollowUpDate || null,
        totalTreatmentCost: treatmentCostTotal.toFixed(2),
        totalTestCost: testCostTotal.toFixed(2),
        additionalCharges: addCharges.toFixed(2),
        discount: disc.toFixed(2),
        totalCost: totalCost.toFixed(2),
        amountPaid: initPayAmount.toFixed(2),
        outstandingDue: outstandingDue.toFixed(2),
        status: 'Completed',
      })
      .returning();

    // Batch-insert treatments, tests, initial payment, and follow-up appointment in parallel
    const childInsertOps: Promise<any>[] = [];

    if (normalizedTreatments.length > 0) {
      childInsertOps.push(
        db.insert(treatments).values(
          normalizedTreatments.map((t) => ({
            visitId: newVisit.id,
            patientId: patient.id,
            doctorId: attendingDoctorId,
            treatmentName: t.treatmentName || 'Dental Treatment',
            description: t.description,
            toothNumber: t.toothNumber,
            cost: t.cost.toFixed(2),
            status: 'Completed',
            notes: t.notes,
            treatmentDate: vDate,
          }))
        )
      );
    }

    if (normalizedTests.length > 0) {
      childInsertOps.push(
        db.insert(diagnosticTests).values(
          normalizedTests.map((t) => ({
            visitId: newVisit.id,
            patientId: patient.id,
            doctorId: attendingDoctorId,
            testName: t.testName || 'Diagnostic Test / X-Ray',
            category: t.category,
            description: t.description,
            cost: t.cost.toFixed(2),
            status: 'Completed',
            notes: t.notes,
            testDate: vDate,
          }))
        )
      );
    }

    if (initPayAmount > 0) {
      const nextPayId = `PAY-${1000 + (latestPay?.id || 0) + 1}`;
      let collectorDoctorId = attendingDoctorId;
      if (initialPayment.receivedBy) {
        const parsed = parseInt(initialPayment.receivedBy);
        if (!isNaN(parsed) && parsed > 0) {
          collectorDoctorId = parsed;
        }
      }

      childInsertOps.push(
        db.insert(payments).values({
          paymentId: nextPayId,
          patientId: patient.id,
          visitId: newVisit.id,
          amount: initPayAmount.toFixed(2),
          paymentMethod: initialPayment.paymentMethod || 'Cash',
          transactionRef: initialPayment.transactionRef?.trim() || null,
          notes: initialPayment.notes?.trim() || null,
          receivedBy: collectorDoctorId,
          paymentDate: vDate,
        })
      );
    }

    if (nextFollowUpDate) {
      childInsertOps.push(
        db.insert(appointments).values({
          patientId: patient.id,
          visitId: newVisit.id,
          doctorId: attendingDoctorId,
          followUpDate: nextFollowUpDate,
          reason: diagnosis ? `Follow-up for: ${diagnosis}` : 'Routine follow-up evaluation',
          status: 'Scheduled',
        })
      );
    }

    if (childInsertOps.length > 0) {
      await Promise.all(childInsertOps);
    }

    // Reconcile the patient's entire visit chain once after all rows are persisted
    const afterSnapshots = await recalculatePatientFinancials(patient.id);
    const finalSnap = afterSnapshots.get(newVisit.id);

    logAudit(
      req.user,
      'CREATE_VISIT',
      `Visit ${newVisit.visitId} for Patient ${patient.patientId} (${patient.name})`,
      `Attending Doctor: ID ${attendingDoctorId}, Treatment: ৳${treatmentCostTotal}, Visit Cost: ৳${totalCost}, Carried Due: ৳${priorCarriedDue}, Paid: ৳${initPayAmount}, Latest Due: ৳${finalSnap?.outstandingDue ?? outstandingDue}`
    ).catch((e) => console.error('Audit log error:', e));

    res.status(201).json({
      ...newVisit,
      totalTreatmentCost: (finalSnap?.treatmentCost ?? treatmentCostTotal).toFixed(2),
      totalTestCost: (finalSnap?.testCost ?? testCostTotal).toFixed(2),
      totalCost: (finalSnap?.totalCost ?? totalCost).toFixed(2),
      amountPaid: (finalSnap?.amountPaid ?? initPayAmount).toFixed(2),
      previousCarriedDue: finalSnap?.previousCarriedDue ?? priorCarriedDue,
      cumulativePayable: finalSnap?.cumulativePayable ?? cumulativePayable,
      balanceAfterVisit: finalSnap?.balanceAfterVisit ?? outstandingDue,
      outstandingDue: (finalSnap?.outstandingDue ?? outstandingDue).toFixed(2),
      isLatestVisit: finalSnap?.isLatestVisit ?? true,
    });
  } catch (error: any) {
    console.error('Error creating visit:', error);
    res.status(500).json({ error: 'Failed to create visit' });
  }
});

// Single visit view
apiRouter.get('/visits/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const visitId = parseInt(req.params.id);

    const [visit] = await db
      .select({
        id: visits.id,
        visitId: visits.visitId,
        patientId: visits.patientId,
        patientCode: patients.patientId,
        patientName: patients.name,
        patientPhone: patients.phone,
        patientAge: patients.age,
        patientGender: patients.gender,
        patientMedicalHistory: patients.medicalHistory,
        patientAllergies: patients.allergies,
        doctorId: visits.doctorId,
        doctorName: users.fullName,
        doctorSpecialization: users.specialization,
        visitDate: visits.visitDate,
        visitTime: visits.visitTime,
        complaints: visits.complaints,
        diagnosis: visits.diagnosis,
        notes: visits.notes,
        nextFollowUpDate: visits.nextFollowUpDate,
        totalTreatmentCost: visits.totalTreatmentCost,
        totalTestCost: visits.totalTestCost,
        additionalCharges: visits.additionalCharges,
        discount: visits.discount,
        totalCost: visits.totalCost,
        amountPaid: visits.amountPaid,
        outstandingDue: visits.outstandingDue,
        status: visits.status,
        createdAt: visits.createdAt,
      })
      .from(visits)
      .innerJoin(patients, eq(visits.patientId, patients.id))
      .innerJoin(users, eq(visits.doctorId, users.id))
      .where(eq(visits.id, visitId));

    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    const [snapshotMap, visitTreatments, visitTests, visitPaymentsRaw] = await Promise.all([
      recalculatePatientFinancials(visit.patientId),
      db
        .select({
          id: treatments.id,
          treatmentName: treatments.treatmentName,
          description: treatments.description,
          toothNumber: treatments.toothNumber,
          cost: treatments.cost,
          status: treatments.status,
          notes: treatments.notes,
          treatmentDate: treatments.treatmentDate,
          doctorName: users.fullName,
        })
        .from(treatments)
        .innerJoin(users, eq(treatments.doctorId, users.id))
        .where(eq(treatments.visitId, visitId)),
      db
        .select({
          id: diagnosticTests.id,
          testName: diagnosticTests.testName,
          category: diagnosticTests.category,
          description: diagnosticTests.description,
          cost: diagnosticTests.cost,
          status: diagnosticTests.status,
          notes: diagnosticTests.notes,
          testDate: diagnosticTests.testDate,
          doctorName: users.fullName,
        })
        .from(diagnosticTests)
        .innerJoin(users, eq(diagnosticTests.doctorId, users.id))
        .where(eq(diagnosticTests.visitId, visitId)),
      db
        .select({
          id: payments.id,
          paymentId: payments.paymentId,
          visitId: payments.visitId,
          amount: payments.amount,
          paymentMethod: payments.paymentMethod,
          transactionRef: payments.transactionRef,
          notes: payments.notes,
          paymentDate: payments.paymentDate,
          receivedBy: payments.receivedBy,
          receiverName: users.fullName,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .leftJoin(users, eq(payments.receivedBy, users.id))
        .where(eq(payments.visitId, visitId))
        .orderBy(desc(payments.paymentDate), desc(payments.id)),
    ]);

    const snap = snapshotMap.get(visitId);

    const startingPayable = snap ? snap.cumulativePayable : parseFloat(visit.totalCost || '0');
    const prevCarried = snap ? snap.previousCarriedDue : 0;
    const chronoAsc = [...visitPaymentsRaw].sort((a, b) => {
      if (a.paymentDate !== b.paymentDate) return a.paymentDate.localeCompare(b.paymentDate);
      return a.id - b.id;
    });
    const metaById = new Map<
      number,
      {
        installmentNumber: number;
        totalInstallments: number;
        cumulativePaidAfter: number;
        remainingDueAfter: number;
        previousDueBefore: number;
        previousCarriedDue: number;
      }
    >();
    let runningPaid = 0;
    chronoAsc.forEach((p, idx) => {
      const amt = parseFloat(p.amount || '0');
      const prevDue = Math.max(0, Number((startingPayable - runningPaid).toFixed(2)));
      runningPaid = Number((runningPaid + amt).toFixed(2));
      const remDue = Math.max(0, Number((startingPayable - runningPaid).toFixed(2)));
      metaById.set(p.id, {
        installmentNumber: idx + 1,
        totalInstallments: chronoAsc.length,
        cumulativePaidAfter: runningPaid,
        remainingDueAfter: remDue,
        previousDueBefore: prevDue,
        previousCarriedDue: prevCarried,
      });
    });

    const visitPayments = visitPaymentsRaw.map((p) => ({
      ...p,
      visitCode: visit.visitId,
      visitTotalCost: visit.totalCost,
      visitDiscount: visit.discount,
      ...(metaById.get(p.id) || {
        installmentNumber: 1,
        totalInstallments: 1,
        cumulativePaidAfter: parseFloat(p.amount || '0'),
        remainingDueAfter: 0,
        previousDueBefore: parseFloat(p.amount || '0'),
        previousCarriedDue: prevCarried,
      }),
    }));

    res.json({
      ...visit,
      previousCarriedDue: snap?.previousCarriedDue ?? 0,
      cumulativePayable: snap?.cumulativePayable ?? parseFloat(visit.totalCost || '0'),
      balanceAfterVisit: snap?.balanceAfterVisit ?? parseFloat(visit.outstandingDue || '0'),
      isLatestVisit: snap?.isLatestVisit ?? true,
      treatments: visitTreatments,
      diagnosticTests: visitTests,
      payments: visitPayments,
    });
  } catch (error: any) {
    console.error('Error fetching visit details:', error);
    res.status(500).json({ error: 'Failed to fetch visit details' });
  }
});

// Update visit (Doctor can edit own visit, Main Doctor / Dev can edit any)
apiRouter.put('/visits/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const visitId = parseInt(req.params.id);
    const [existing] = await db.select().from(visits).where(eq(visits.id, visitId));

    if (!existing) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    // Role check:
    const isOwnerDoctor = req.user!.id === existing.doctorId;
    const isSuperAdmin = req.user!.role === 'main_doctor' || req.user!.role === 'developer';

    if (!isOwnerDoctor && !isSuperAdmin) {
      return res.status(403).json({
        error: 'You do not have permission to edit another doctor’s visit record. Main Doctor authorization required.',
      });
    }

    const {
      complaints,
      diagnosis,
      notes,
      nextFollowUpDate,
      additionalCharges,
      discount,
      status,
      doctorId,
    } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (complaints !== undefined) updateData.complaints = complaints?.trim();
    if (diagnosis !== undefined) updateData.diagnosis = diagnosis?.trim();
    if (notes !== undefined) updateData.notes = notes?.trim();
    if (nextFollowUpDate !== undefined) updateData.nextFollowUpDate = nextFollowUpDate;
    if (additionalCharges !== undefined) updateData.additionalCharges = parseFloat(additionalCharges).toFixed(2);
    if (discount !== undefined) updateData.discount = parseFloat(discount).toFixed(2);
    if (status !== undefined) updateData.status = status;
    if (doctorId !== undefined && isSuperAdmin) updateData.doctorId = parseInt(doctorId);

    await db.update(visits).set(updateData).where(eq(visits.id, visitId));

    // Recalculate financials
    const updatedFinancials = await recalculateVisitFinancials(visitId);

    await logAudit(
      req.user,
      'UPDATE_VISIT',
      `Visit ${existing.visitId}`,
      `Updated by ${req.user!.fullName} (${req.user!.role})`
    );

    res.json({ success: true, financials: updatedFinancials });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update visit' });
  }
});

// Apply discount / concession to visit
apiRouter.post('/visits/:id/apply-discount', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const visitId = parseInt(req.params.id);
    const [existing] = await db.select().from(visits).where(eq(visits.id, visitId));
    if (!existing) return res.status(404).json({ error: 'Visit not found' });

    const { discountAmount, reason, isTotalDiscount } = req.body;
    const discNum = parseFloat(discountAmount);

    if (isNaN(discNum) || discNum < 0) {
      return res.status(400).json({ error: 'Please enter a valid discount amount.' });
    }

    const currentDiscount = parseFloat(existing.discount || '0');
    const newDiscount = isTotalDiscount ? discNum : currentDiscount + discNum;

    // Check that total discount does not exceed charges before discount
    const treatmentCost = parseFloat(existing.totalTreatmentCost || '0');
    const testCost = parseFloat(existing.totalTestCost || '0');
    const additional = parseFloat(existing.additionalCharges || '0');
    const maxDiscount = treatmentCost + testCost + additional;

    if (newDiscount > maxDiscount + 0.01) {
      return res.status(400).json({
        error: `Discount (৳${newDiscount}) cannot exceed total charges of ৳${maxDiscount}.`,
      });
    }

    let updatedNotes = existing.notes || '';
    if (reason && reason.trim()) {
      const discountNote = `[Discount: ৳${discNum} by ${req.user!.fullName} - ${reason.trim()}]`;
      updatedNotes = updatedNotes ? `${updatedNotes} ${discountNote}` : discountNote;
    }

    await db
      .update(visits)
      .set({
        discount: newDiscount.toFixed(2),
        notes: updatedNotes,
        updatedAt: new Date(),
      })
      .where(eq(visits.id, visitId));

    const updatedFinancials = await recalculateVisitFinancials(visitId);

    await logAudit(
      req.user,
      'APPLY_DISCOUNT',
      `Visit ${existing.visitId}`,
      `Discount of ৳${discNum} applied (Total discount: ৳${newDiscount.toFixed(2)}). Reason: ${reason || 'Concession'}`
    );

    res.json({
      success: true,
      newDiscount: newDiscount.toFixed(2),
      financials: updatedFinancials,
    });
  } catch (error: any) {
    console.error('Apply discount error:', error);
    res.status(500).json({ error: 'Failed to apply discount' });
  }
});

// Delete visit (Main Doctor & Developer only)
apiRouter.delete(
  '/visits/:id',
  authenticateToken,
  requireRoles('main_doctor', 'developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const visitId = parseInt(req.params.id);
      const [existing] = await db.select().from(visits).where(eq(visits.id, visitId));
      if (!existing) return res.status(404).json({ error: 'Visit not found' });

      const visitRxRows = await db
        .select({ id: prescriptions.id })
        .from(prescriptions)
        .where(eq(prescriptions.visitId, visitId));
      const visitRxIds = visitRxRows.map((r) => r.id);
      if (visitRxIds.length > 0) {
        await db
          .delete(prescriptionRevisions)
          .where(
            or(
              inArray(prescriptionRevisions.prescriptionId, visitRxIds),
              inArray(prescriptionRevisions.previousPrescriptionId, visitRxIds)
            )
          );
        await db.delete(prescriptions).where(eq(prescriptions.visitId, visitId));
      }

      await Promise.all([
        db.delete(payments).where(eq(payments.visitId, visitId)),
        db.delete(treatments).where(eq(treatments.visitId, visitId)),
        db.delete(diagnosticTests).where(eq(diagnosticTests.visitId, visitId)),
        db.delete(appointments).where(eq(appointments.visitId, visitId)),
      ]);
      await db.delete(visits).where(eq(visits.id, visitId));

      await recalculatePatientFinancials(existing.patientId);

      logAudit(
        req.user,
        'DELETE_VISIT',
        `Visit ${existing.visitId}`,
        `Deleted by ${req.user!.fullName}`
      ).catch((e) => console.error('Audit log error:', e));

      res.json({ success: true, message: 'Visit record deleted' });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete visit' });
    }
  }
);

// ==========================================
// 5. TREATMENTS MANAGEMENT
// ==========================================

apiRouter.post('/visits/:id/treatments', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const visitId = parseInt(req.params.id);
    const [visit] = await db.select().from(visits).where(eq(visits.id, visitId));
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    const { treatmentName, description, toothNumber, cost = 0, status = 'Completed', notes } = req.body;
    if (!treatmentName) {
      return res.status(400).json({ error: 'Treatment name is required.' });
    }

    const [created] = await db
      .insert(treatments)
      .values({
        visitId,
        patientId: visit.patientId,
        doctorId: req.user!.id,
        treatmentName: treatmentName.trim(),
        description: description?.trim() || null,
        toothNumber: toothNumber?.trim() || null,
        cost: parseFloat(cost).toFixed(2),
        status,
        notes: notes?.trim() || null,
        treatmentDate: visit.visitDate,
      })
      .returning();

    // Recalculate visit financials
    await recalculateVisitFinancials(visitId);

    await logAudit(
      req.user,
      'ADD_TREATMENT',
      `Treatment ${created.treatmentName} on Visit ${visit.visitId}`,
      `Cost: ৳${cost}, Tooth: ${toothNumber || 'N/A'}`
    );

    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to add treatment' });
  }
});

apiRouter.delete('/treatments/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(treatments).where(eq(treatments.id, id));
    if (!existing) return res.status(404).json({ error: 'Treatment not found' });

    // Authorization: Main Doctor, Developer, or creator doctor
    if (req.user!.role === 'doctor' && req.user!.id !== existing.doctorId) {
      return res.status(403).json({ error: 'Permission denied to delete another doctor’s treatment entry.' });
    }

    await db.delete(treatments).where(eq(treatments.id, id));
    await recalculateVisitFinancials(existing.visitId);

    await logAudit(
      req.user,
      'DELETE_TREATMENT',
      `Treatment ${existing.treatmentName} on Visit ID ${existing.visitId}`,
      `Removed cost: ৳${existing.cost}`
    );

    res.json({ success: true, message: 'Treatment removed.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete treatment' });
  }
});

// ==========================================
// 6. DIAGNOSTIC TEST & X-RAY MANAGEMENT
// ==========================================

apiRouter.post('/visits/:id/diagnostic-tests', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const visitId = parseInt(req.params.id);
    const [visit] = await db.select().from(visits).where(eq(visits.id, visitId));
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    const { testName, category, description, cost = 0, status = 'Completed', notes } = req.body;
    if (!testName) {
      return res.status(400).json({ error: 'Test name is required.' });
    }

    const [created] = await db
      .insert(diagnosticTests)
      .values({
        visitId,
        patientId: visit.patientId,
        doctorId: req.user!.id,
        testName: testName.trim(),
        category: category || 'Dental X-ray',
        description: description?.trim() || null,
        cost: parseFloat(cost).toFixed(2),
        status,
        notes: notes?.trim() || null,
        testDate: visit.visitDate,
      })
      .returning();

    // Recalculate visit financials
    await recalculateVisitFinancials(visitId);

    await logAudit(
      req.user,
      'ADD_DIAGNOSTIC_TEST',
      `Test ${created.testName} (${created.category}) on Visit ${visit.visitId}`,
      `Cost: ৳${cost}`
    );

    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to add diagnostic test' });
  }
});

apiRouter.delete('/diagnostic-tests/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(diagnosticTests).where(eq(diagnosticTests.id, id));
    if (!existing) return res.status(404).json({ error: 'Test not found' });

    if (req.user!.role === 'doctor' && req.user!.id !== existing.doctorId) {
      return res.status(403).json({ error: 'Permission denied to delete another doctor’s test entry.' });
    }

    await db.delete(diagnosticTests).where(eq(diagnosticTests.id, id));
    await recalculateVisitFinancials(existing.visitId);

    await logAudit(
      req.user,
      'DELETE_DIAGNOSTIC_TEST',
      `Test ${existing.testName} on Visit ID ${existing.visitId}`,
      `Removed cost: ৳${existing.cost}`
    );

    res.json({ success: true, message: 'Test removed.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete diagnostic test' });
  }
});

// ==========================================
// 7. PAYMENTS & FINANCIAL DUES
// ==========================================

apiRouter.post('/visits/:id/payments', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const requestedVisitId = parseInt(req.params.id);
    const [requestedVisit] = await db.select().from(visits).where(eq(visits.id, requestedVisitId));
    if (!requestedVisit) return res.status(404).json({ error: 'Visit not found' });

    const { amount, paymentMethod, transactionRef, notes, paymentDate, receivedBy } = req.body;
    const paymentAmount = parseFloat(amount);

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than 0.' });
    }

    // Fast chronological reconciliation to always take payment according to the LATEST visit & cumulative patient balance
    const snapshotMap = await recalculatePatientFinancials(requestedVisit.patientId);
    let latestSnapshot: VisitFinancialSnapshot | null = null;
    for (const snap of snapshotMap.values()) {
      if (snap.isLatestVisit) {
        latestSnapshot = snap;
      }
    }

    const targetVisitId = latestSnapshot ? latestSnapshot.visitId : requestedVisit.id;
    const targetVisitCode = latestSnapshot ? latestSnapshot.visitCode : requestedVisit.visitId;
    const currentDue = latestSnapshot
      ? latestSnapshot.outstandingDue
      : parseFloat(requestedVisit.outstandingDue || '0');

    // Prevent accidental overpayment against the latest cumulative due
    if (paymentAmount > currentDue + 0.01) {
      return res.status(400).json({
        error: `Payment amount (৳${paymentAmount}) exceeds the latest outstanding due of ৳${currentDue}. Accidental overpayments are prevented.`,
      });
    }

    let collectorId = req.user!.id;
    if (receivedBy) {
      const parsed = parseInt(receivedBy);
      if (!isNaN(parsed) && parsed > 0) {
        collectorId = parsed;
      }
    }

    // Parallel lookup for generated ID and collector profile
    const [[latestPay], [receiverUser]] = await Promise.all([
      db
        .select({ id: payments.id })
        .from(payments)
        .orderBy(desc(payments.id))
        .limit(1),
      db
        .select({ fullName: users.fullName, specialization: users.specialization })
        .from(users)
        .where(eq(users.id, collectorId)),
    ]);

    const nextPayNumber = 1000 + (latestPay?.id || 0) + 1;
    const generatedPaymentId = `PAY-${nextPayNumber}`;
    const pDate = paymentDate || new Date().toISOString().split('T')[0];

    const [newPayment] = await db
      .insert(payments)
      .values({
        paymentId: generatedPaymentId,
        patientId: requestedVisit.patientId,
        visitId: targetVisitId,
        amount: paymentAmount.toFixed(2),
        paymentMethod: paymentMethod || 'Cash',
        transactionRef: transactionRef?.trim() || null,
        notes: notes?.trim() || null,
        receivedBy: collectorId,
        paymentDate: pDate,
      })
      .returning();

    // Recalculate once after payment insertion and fetch fresh snapshot
    const updatedSnapshotMap = await recalculatePatientFinancials(requestedVisit.patientId);
    const updatedFinancials = updatedSnapshotMap.get(targetVisitId);

    // Count total installments for this visit
    const [installmentRow] = await db
      .select({ total: sql<string>`count(*)` })
      .from(payments)
      .where(eq(payments.visitId, targetVisitId));
    const totalInstallmentsCount = parseInt(installmentRow?.total || '1', 10);

    const paymentWithReceiver = {
      ...newPayment,
      visitCode: targetVisitCode,
      receiverName: receiverUser?.fullName || req.user!.fullName,
      installmentNumber: totalInstallmentsCount,
      totalInstallments: totalInstallmentsCount,
      previousDueBefore: currentDue,
      previousCarriedDue: updatedFinancials?.previousCarriedDue ?? 0,
      cumulativePaidAfter: updatedFinancials?.amountPaid ?? paymentAmount,
      remainingDueAfter: updatedFinancials?.outstandingDue ?? Math.max(0, Number((currentDue - paymentAmount).toFixed(2))),
      visitTotalCost: String(updatedFinancials?.totalCost ?? requestedVisit.totalCost),
    };

    // Non-blocking audit log
    logAudit(
      req.user,
      'RECORD_PAYMENT',
      `Payment ${newPayment.paymentId} (৳${paymentAmount}) on Latest Visit ${targetVisitCode}`,
      `Collected by: ${receiverUser?.fullName || collectorId}, Method: ${paymentMethod}, Previous Due: ৳${currentDue}, Remaining Due: ৳${updatedFinancials?.outstandingDue}`
    ).catch((e) => console.error('Audit log error:', e));

    res.status(201).json({
      payment: paymentWithReceiver,
      financials: updatedFinancials,
    });
  } catch (error: any) {
    console.error('Error recording payment:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

apiRouter.get('/payments', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { method, date, fromDate, toDate, receivedBy, search } = req.query;

    const baseQuery = db
      .select({
        id: payments.id,
        paymentId: payments.paymentId,
        patientId: payments.patientId,
        patientCode: patients.patientId,
        patientName: patients.name,
        patientPhone: patients.phone,
        visitId: payments.visitId,
        visitCode: visits.visitId,
        amount: payments.amount,
        paymentMethod: payments.paymentMethod,
        transactionRef: payments.transactionRef,
        notes: payments.notes,
        paymentDate: payments.paymentDate,
        receivedBy: payments.receivedBy,
        receiverName: users.fullName,
        visitTotalCost: visits.totalCost,
        visitAmountPaid: visits.amountPaid,
        visitOutstandingDue: visits.outstandingDue,
        visitDiscount: visits.discount,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .innerJoin(patients, eq(payments.patientId, patients.id))
      .innerJoin(visits, eq(payments.visitId, visits.id))
      .leftJoin(users, eq(payments.receivedBy, users.id));

    const conditions = [];
    if (method && method !== 'All') {
      conditions.push(eq(payments.paymentMethod, method as string));
    }
    if (date) {
      conditions.push(eq(payments.paymentDate, date as string));
    }
    if (fromDate && typeof fromDate === 'string' && fromDate.trim()) {
      conditions.push(sql`${payments.paymentDate} >= ${fromDate.trim()}`);
    }
    if (toDate && typeof toDate === 'string' && toDate.trim()) {
      conditions.push(sql`${payments.paymentDate} <= ${toDate.trim()}`);
    }
    // Role-based filtering in Payment & Dues menu:
    // Main Doctor & Developer can filter any/all doctors; regular doctors can ONLY view/filter their own collections
    if (req.user!.role === 'doctor') {
      conditions.push(eq(payments.receivedBy, req.user!.id));
    } else if (receivedBy && receivedBy !== 'All') {
      conditions.push(eq(payments.receivedBy, parseInt(receivedBy as string)));
    }
    if (search && typeof search === 'string') {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          like(sql`LOWER(${patients.name})`, q),
          like(sql`LOWER(${patients.patientId})`, q),
          like(patients.phone, `%${search.trim()}%`),
          like(sql`LOWER(${visits.visitId})`, q),
          like(sql`LOWER(${payments.paymentId})`, q),
          like(sql`LOWER(${payments.transactionRef})`, q)
        )
      );
    }

    const listQuery =
      conditions.length > 0
        ? baseQuery.where(and(...conditions)).orderBy(desc(payments.paymentDate), desc(payments.id))
        : baseQuery.orderBy(desc(payments.paymentDate), desc(payments.id));

    // Parallelize all 3 queries for maximum speed
    const [list, allVisitsChrono, allPaymentRefs] = await Promise.all([
      listQuery,
      db
        .select({
          id: visits.id,
          patientId: visits.patientId,
          totalCost: visits.totalCost,
          amountPaid: visits.amountPaid,
        })
        .from(visits)
        .orderBy(asc(visits.visitDate), asc(visits.id)),
      db
        .select({
          id: payments.id,
          visitId: payments.visitId,
          amount: payments.amount,
          paymentDate: payments.paymentDate,
          visitTotalCost: visits.totalCost,
        })
        .from(payments)
        .innerJoin(visits, eq(payments.visitId, visits.id))
        .orderBy(asc(payments.paymentDate), asc(payments.id)),
    ]);

    const visitStartingPayableMap = new Map<number, { cumulativePayable: number; previousCarriedDue: number }>();
    const patientRunningDueMap = new Map<number, number>();
    for (const v of allVisitsChrono) {
      const prevDue = patientRunningDueMap.get(v.patientId) || 0;
      const vNet = parseFloat(v.totalCost || '0');
      const vPaid = parseFloat(v.amountPaid || '0');
      const cumPayable = Number((prevDue + vNet).toFixed(2));
      const balAfter = Math.max(0, Number((cumPayable - vPaid).toFixed(2)));
      patientRunningDueMap.set(v.patientId, balAfter);
      visitStartingPayableMap.set(v.id, { cumulativePayable: cumPayable, previousCarriedDue: prevDue });
    }

    const paymentInstallmentMap = new Map<number, number>();
    const visitTotalInstallmentsMap = new Map<number, number>();
    const visitRunningPaidMap = new Map<number, number>();
    const paymentRunningMetaMap = new Map<
      number,
      { cumulativePaidAfter: number; remainingDueAfter: number; previousDueBefore: number; previousCarriedDue: number }
    >();

    for (const pr of allPaymentRefs) {
      const nextIdx = (visitTotalInstallmentsMap.get(pr.visitId) || 0) + 1;
      visitTotalInstallmentsMap.set(pr.visitId, nextIdx);
      paymentInstallmentMap.set(pr.id, nextIdx);

      const vStartInfo = visitStartingPayableMap.get(pr.visitId);
      const startingPayable = vStartInfo ? vStartInfo.cumulativePayable : parseFloat(pr.visitTotalCost || '0');
      const prevCarried = vStartInfo ? vStartInfo.previousCarriedDue : 0;
      const prevPaid = visitRunningPaidMap.get(pr.visitId) || 0;
      const amt = parseFloat(pr.amount || '0');
      const prevDue = Math.max(0, Number((startingPayable - prevPaid).toFixed(2)));
      const newPaid = Number((prevPaid + amt).toFixed(2));
      const remDue = Math.max(0, Number((startingPayable - newPaid).toFixed(2)));
      visitRunningPaidMap.set(pr.visitId, newPaid);
      paymentRunningMetaMap.set(pr.id, {
        cumulativePaidAfter: newPaid,
        remainingDueAfter: remDue,
        previousDueBefore: prevDue,
        previousCarriedDue: prevCarried,
      });
    }

    const enrichedPayments = list.map((p) => {
      const meta = paymentRunningMetaMap.get(p.id);
      return {
        ...p,
        installmentNumber: paymentInstallmentMap.get(p.id) || 1,
        totalInstallments: visitTotalInstallmentsMap.get(p.visitId) || 1,
        cumulativePaidAfter: meta?.cumulativePaidAfter ?? parseFloat(p.amount || '0'),
        remainingDueAfter: meta?.remainingDueAfter ?? parseFloat(p.visitOutstandingDue || '0'),
        previousDueBefore: meta?.previousDueBefore ?? parseFloat(p.visitTotalCost || '0'),
        previousCarriedDue: meta?.previousCarriedDue ?? 0,
      };
    });

    res.json(enrichedPayments);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Pending Dues endpoint specifically for the Payments & Dues menu
// Main Doctor / Developer can filter all doctors' dues; regular Doctor is strictly scoped to their own dues only
apiRouter.get('/payments/dues', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { doctorId, fromDate, toDate, search } = req.query;

    const allVisitRefs = await db
      .select({
        id: visits.id,
        visitId: visits.visitId,
        patientId: visits.patientId,
        patientCode: patients.patientId,
        patientName: patients.name,
        patientPhone: patients.phone,
        doctorId: visits.doctorId,
        doctorName: users.fullName,
        doctorSpecialization: users.specialization,
        visitDate: visits.visitDate,
        visitTime: visits.visitTime,
        diagnosis: visits.diagnosis,
        totalTreatmentCost: visits.totalTreatmentCost,
        totalTestCost: visits.totalTestCost,
        additionalCharges: visits.additionalCharges,
        discount: visits.discount,
        totalCost: visits.totalCost,
        amountPaid: visits.amountPaid,
        outstandingDue: visits.outstandingDue,
        status: visits.status,
        createdAt: visits.createdAt,
      })
      .from(visits)
      .innerJoin(patients, eq(visits.patientId, patients.id))
      .innerJoin(users, eq(visits.doctorId, users.id))
      .orderBy(asc(visits.visitDate), asc(visits.id));

    const patientTotalVisitsMap = new Map<number, number>();
    const patientLatestVisitIdMap = new Map<number, number>();
    const patientRunningDueMap = new Map<number, number>();
    const visitMetaMap = new Map<
      number,
      { seq: number; previousCarriedDue: number; cumulativePayable: number; balanceAfterVisit: number }
    >();

    for (const v of allVisitRefs) {
      const seq = (patientTotalVisitsMap.get(v.patientId) || 0) + 1;
      patientTotalVisitsMap.set(v.patientId, seq);
      patientLatestVisitIdMap.set(v.patientId, v.id);

      const prevDue = patientRunningDueMap.get(v.patientId) || 0;
      const vNet = parseFloat(v.totalCost || '0');
      const vPaid = parseFloat(v.amountPaid || '0');
      const cumPayable = Number((prevDue + vNet).toFixed(2));
      const balAfter = Math.max(0, Number((cumPayable - vPaid).toFixed(2)));
      patientRunningDueMap.set(v.patientId, balAfter);
      visitMetaMap.set(v.id, {
        seq,
        previousCarriedDue: prevDue,
        cumulativePayable: cumPayable,
        balanceAfterVisit: balAfter,
      });
    }

    const isSuper = req.user!.role === 'main_doctor' || req.user!.role === 'developer';
    const enforcedDoctorId = isSuper
      ? doctorId && doctorId !== 'All'
        ? parseInt(doctorId as string)
        : null
      : req.user!.id;

    const searchLower = typeof search === 'string' && search.trim() ? search.trim().toLowerCase() : '';

    const pendingDues = allVisitRefs
      .filter((v) => {
        const isLatest = patientLatestVisitIdMap.get(v.patientId) === v.id;
        const meta = visitMetaMap.get(v.id);
        const due = meta ? meta.balanceAfterVisit : parseFloat(v.outstandingDue || '0');
        if (!isLatest || due <= 0.01) return false;
        if (enforcedDoctorId !== null && !isNaN(enforcedDoctorId) && v.doctorId !== enforcedDoctorId) {
          return false;
        }
        if (fromDate && typeof fromDate === 'string' && fromDate.trim() && v.visitDate < fromDate.trim()) {
          return false;
        }
        if (toDate && typeof toDate === 'string' && toDate.trim() && v.visitDate > toDate.trim()) {
          return false;
        }
        if (searchLower) {
          const matches =
            v.patientName.toLowerCase().includes(searchLower) ||
            v.patientCode.toLowerCase().includes(searchLower) ||
            v.patientPhone.includes(searchLower) ||
            v.visitId.toLowerCase().includes(searchLower) ||
            (v.diagnosis || '').toLowerCase().includes(searchLower);
          if (!matches) return false;
        }
        return true;
      })
      .map((v) => {
        const meta = visitMetaMap.get(v.id)!;
        return {
          ...v,
          outstandingDue: meta.balanceAfterVisit.toFixed(2),
          previousCarriedDue: meta.previousCarriedDue,
          cumulativePayable: meta.cumulativePayable,
          balanceAfterVisit: meta.balanceAfterVisit,
          isLatestVisit: true,
          visitSequenceNumber: meta.seq,
          patientTotalVisits: patientTotalVisitsMap.get(v.patientId) || 1,
        };
      })
      .sort((a, b) => b.visitDate.localeCompare(a.visitDate) || b.id - a.id);

    res.json(pendingDues);
  } catch (error: any) {
    console.error('Error fetching pending dues:', error);
    res.status(500).json({ error: 'Failed to fetch pending dues' });
  }
});

// Pay patient outstanding due according to the latest visit & cumulative patient balance
apiRouter.post('/patients/:id/pay-due', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const patientId = parseInt(req.params.id);
    const { amount, paymentMethod, transactionRef, notes, paymentDate, receivedBy } = req.body;
    const payVal = parseFloat(amount);

    if (isNaN(payVal) || payVal <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than 0.' });
    }

    const snapshotMap = await recalculatePatientFinancials(patientId);
    let latestSnapshot: VisitFinancialSnapshot | null = null;
    for (const snap of snapshotMap.values()) {
      if (snap.isLatestVisit) {
        latestSnapshot = snap;
      }
    }

    if (!latestSnapshot || latestSnapshot.outstandingDue <= 0.01) {
      return res.status(400).json({ error: 'This patient has no outstanding dues to pay.' });
    }

    const totalPatientDue = latestSnapshot.outstandingDue;

    if (payVal > totalPatientDue + 0.01) {
      return res.status(400).json({
        error: `Payment amount (৳${payVal}) exceeds total patient outstanding due of ৳${totalPatientDue}.`,
      });
    }

    let collectorId = req.user!.id;
    if (receivedBy) {
      const parsed = parseInt(receivedBy);
      if (!isNaN(parsed) && parsed > 0) {
        collectorId = parsed;
      }
    }

    const [receiverUser] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, collectorId));

    const pDate = paymentDate || new Date().toISOString().split('T')[0];

    const [latestPay] = await db
      .select({ id: payments.id })
      .from(payments)
      .orderBy(desc(payments.id))
      .limit(1);
    const nextPayNumber = 1000 + (latestPay?.id || 0) + 1;
    const generatedPaymentId = `PAY-${nextPayNumber}`;

    const [newPay] = await db
      .insert(payments)
      .values({
        paymentId: generatedPaymentId,
        patientId,
        visitId: latestSnapshot.visitId,
        amount: payVal.toFixed(2),
        paymentMethod: paymentMethod || 'Cash',
        transactionRef: transactionRef?.trim() || null,
        notes: notes?.trim() || null,
        receivedBy: collectorId,
        paymentDate: pDate,
      })
      .returning();

    const updatedSnap = await recalculateVisitFinancials(latestSnapshot.visitId);
    const newRemainingPatientDue = updatedSnap
      ? updatedSnap.outstandingDue
      : Math.max(0, Number((totalPatientDue - payVal).toFixed(2)));

    const createdPayment = {
      ...newPay,
      visitCode: latestSnapshot.visitCode,
      receiverName: receiverUser?.fullName || req.user!.fullName,
      previousDueBefore: totalPatientDue,
      remainingDueAfter: newRemainingPatientDue,
    };

    await logAudit(
      req.user,
      'RECORD_PATIENT_PAYMENT',
      `Payment ${createdPayment.paymentId} (৳${payVal}) for Patient ID ${patientId} on Latest Visit ${latestSnapshot.visitCode}`,
      `Previous Due: ৳${totalPatientDue}, Remaining Due: ৳${newRemainingPatientDue}`
    );

    res.status(201).json({
      payments: [createdPayment],
      totalAllocated: payVal,
      remainingPatientDue: newRemainingPatientDue,
    });
  } catch (error: any) {
    console.error('Error recording combined patient payment:', error);
    res.status(500).json({ error: 'Failed to record patient payment' });
  }
});

// Delete / void a payment record and recalculate visit financials
apiRouter.delete('/payments/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(payments).where(eq(payments.id, id));
    if (!existing) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    await db.delete(payments).where(eq(payments.id, id));
    const updatedFinancials = await recalculateVisitFinancials(existing.visitId);

    await logAudit(
      req.user,
      'DELETE_PAYMENT',
      `Payment ${existing.paymentId} (৳${existing.amount}) on Visit ID ${existing.visitId}`,
      `Deleted by ${req.user!.fullName} (${req.user!.role})`
    );

    res.json({
      success: true,
      financials: updatedFinancials,
    });
  } catch (error: any) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ error: 'Failed to delete payment record' });
  }
});

// ==========================================
// 8. FOLLOW-UP TRACKING & CENTRALIZED SMS REMINDERS
// ==========================================

export interface SmsReminderLogEntry {
  id: string;
  appointmentId: number;
  patientId: number;
  patientCode: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  followUpDate: string;
  reason: string;
  message: string;
  sentBy: string;
  sentAt: string;
  channel: string;
  status: 'Sent' | 'Delivered';
}

async function getSmsReminderLogs(): Promise<SmsReminderLogEntry[]> {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'sms_reminder_logs'));
    if (!row || !row.value) return [];
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveSmsReminderLogs(logs: SmsReminderLogEntry[]) {
  const valStr = JSON.stringify(logs.slice(0, 500));
  await db
    .insert(systemSettings)
    .values({
      key: 'sms_reminder_logs',
      value: valStr,
      description: 'Centralized SMS follow-up reminder history',
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: valStr, updatedAt: new Date() },
    });
}

// Automatically ensure visits with nextFollowUpDate have corresponding appointment records
async function syncVisitFollowUpsToAppointments() {
  try {
    const [visitsWithFollowUp, existingAppts] = await Promise.all([
      db
        .select({
          id: visits.id,
          patientId: visits.patientId,
          doctorId: visits.doctorId,
          nextFollowUpDate: visits.nextFollowUpDate,
          diagnosis: visits.diagnosis,
        })
        .from(visits)
        .where(sql`${visits.nextFollowUpDate} IS NOT NULL AND ${visits.nextFollowUpDate} != ''`),
      db
        .select({
          visitId: appointments.visitId,
          patientId: appointments.patientId,
          followUpDate: appointments.followUpDate,
        })
        .from(appointments),
    ]);

    const existingKeys = new Set(
      existingAppts.map((a) => `${a.patientId}:${a.followUpDate}`)
    );

    const toInsert = [];
    for (const v of visitsWithFollowUp) {
      if (!v.nextFollowUpDate) continue;
      const key = `${v.patientId}:${v.nextFollowUpDate}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        toInsert.push({
          patientId: v.patientId,
          visitId: v.id,
          doctorId: v.doctorId,
          followUpDate: v.nextFollowUpDate,
          reason: v.diagnosis ? `Follow-up for: ${v.diagnosis}` : 'Scheduled post-visit dental evaluation',
          status: 'Scheduled',
        });
      }
    }

    if (toInsert.length > 0) {
      await db.insert(appointments).values(toInsert);
    }
  } catch (e) {
    console.error('Error syncing visit follow-ups:', e);
  }
}

let hasRunInitialFollowUpSync = false;

apiRouter.get('/appointments', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, doctorId, upcomingOnly, followUpDate } = req.query;

    if (!hasRunInitialFollowUpSync) {
      hasRunInitialFollowUpSync = true;
      await syncVisitFollowUpsToAppointments();
    }

    const baseQuery = db
      .select({
        id: appointments.id,
        patientId: appointments.patientId,
        patientCode: patients.patientId,
        patientName: patients.name,
        patientPhone: patients.phone,
        visitId: appointments.visitId,
        doctorId: appointments.doctorId,
        doctorName: users.fullName,
        followUpDate: appointments.followUpDate,
        reason: appointments.reason,
        status: appointments.status,
        notes: appointments.notes,
        createdAt: appointments.createdAt,
      })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .innerJoin(users, eq(appointments.doctorId, users.id));

    const conditions = [];
    if (status && status !== 'All') {
      conditions.push(eq(appointments.status, status as string));
    }
    if (doctorId) {
      conditions.push(eq(appointments.doctorId, parseInt(doctorId as string)));
    }
    if (followUpDate && typeof followUpDate === 'string' && followUpDate.trim()) {
      conditions.push(eq(appointments.followUpDate, followUpDate.trim()));
    }
    if (upcomingOnly === 'true') {
      const todayStr = new Date().toISOString().split('T')[0];
      conditions.push(sql`${appointments.followUpDate} >= ${todayStr}`);
    }

    const [list, smsLogs] = await Promise.all([
      conditions.length > 0
        ? baseQuery.where(and(...conditions)).orderBy(asc(appointments.followUpDate), asc(appointments.id))
        : baseQuery.orderBy(asc(appointments.followUpDate), desc(appointments.id)),
      getSmsReminderLogs(),
    ]);

    const smsByAppointment = new Map<number, SmsReminderLogEntry[]>();
    for (const log of smsLogs) {
      if (!smsByAppointment.has(log.appointmentId)) {
        smsByAppointment.set(log.appointmentId, []);
      }
      smsByAppointment.get(log.appointmentId)!.push(log);
    }

    const enriched = list.map((a) => {
      const apptLogs = smsByAppointment.get(a.id) || [];
      const latestSms = apptLogs[0] || null;
      return {
        ...a,
        smsReminderSent: apptLogs.length > 0,
        smsSentCount: apptLogs.length,
        lastSmsSentAt: latestSms?.sentAt || null,
        lastSmsMessage: latestSms?.message || null,
      };
    });

    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to load follow-ups' });
  }
});

apiRouter.get('/appointments/sms-logs', authenticateToken, async (_req: AuthenticatedRequest, res) => {
  try {
    const [logs, settingsRows] = await Promise.all([
      getSmsReminderLogs(),
      db.select().from(systemSettings),
    ]);
    const settingsMap: Record<string, string> = {};
    for (const s of settingsRows) {
      settingsMap[s.key] = s.value;
    }

    res.json({
      logs,
      clinicName: settingsMap.clinic_name || 'Dental Care',
      clinicPhone: settingsMap.clinic_phone || '+880 1711-234567',
      smsTemplate:
        settingsMap.sms_reminder_template ||
        'Dear {patientName} ({patientId}), friendly reminder from {clinicName}: Your dental follow-up is scheduled for {followUpDate} with {doctorName} ({reason}). Contact: {clinicPhone}.',
      smsGatewayUrl: settingsMap.sms_gateway_url || '',
      smsGatewayApiKey: settingsMap.sms_gateway_api_key || '',
      defaultMessagingChannel: settingsMap.default_messaging_channel || 'whatsapp',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to load SMS reminder logs' });
  }
});

apiRouter.post('/appointments/test-sms-gateway', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { gatewayUrl, gatewayApiKey } = req.body;
    if (!gatewayUrl || typeof gatewayUrl !== 'string' || !gatewayUrl.trim().startsWith('http')) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Android Gateway HTTP/HTTPS URL (e.g. http://192.168.1.100:8080/send).',
      });
    }

    const cleanUrl = gatewayUrl.trim();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    try {
      const response = await fetch(cleanUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(gatewayApiKey ? { Authorization: `Bearer ${gatewayApiKey}` } : {}),
        },
        body: JSON.stringify({
          to: '+8801700000000',
          phone: '+8801700000000',
          number: '+8801700000000',
          message: 'Dental Care: Android SIM Gateway Ping Test (OK)',
          test: true,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      return res.json({
        success: true,
        statusCode: response.status,
        message: `Android SIM Gateway responded successfully with HTTP ${response.status}! Ready for zero-cost SMS sending.`,
      });
    } catch (fetchErr: any) {
      clearTimeout(timer);
      return res.json({
        success: false,
        message: `Gateway unreachable (${fetchErr.name === 'AbortError' ? 'Connection timeout after 4.5s' : fetchErr.message}). Ensure Android phone is on the same Wi-Fi and the SMS gateway app is running.`,
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Server error testing gateway' });
  }
});

apiRouter.post('/appointments/send-sms-reminders', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { appointmentIds, messageTemplate, gatewayUrl, gatewayApiKey, channel } = req.body;

    if (!Array.isArray(appointmentIds) || appointmentIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one follow-up patient to send SMS reminders.' });
    }

    const cleanIds = appointmentIds.map((id) => parseInt(String(id), 10)).filter((id) => !isNaN(id));
    if (cleanIds.length === 0) {
      return res.status(400).json({ error: 'Invalid appointment IDs provided.' });
    }

    const [targetAppointments, settingsRows, existingLogs] = await Promise.all([
      db
        .select({
          id: appointments.id,
          patientId: appointments.patientId,
          patientCode: patients.patientId,
          patientName: patients.name,
          patientPhone: patients.phone,
          doctorName: users.fullName,
          followUpDate: appointments.followUpDate,
          reason: appointments.reason,
        })
        .from(appointments)
        .innerJoin(patients, eq(appointments.patientId, patients.id))
        .innerJoin(users, eq(appointments.doctorId, users.id))
        .where(inArray(appointments.id, cleanIds)),
      db.select().from(systemSettings),
      getSmsReminderLogs(),
    ]);

    if (targetAppointments.length === 0) {
      return res.status(404).json({ error: 'No matching follow-up appointments found.' });
    }

    const settingsMap: Record<string, string> = {};
    for (const s of settingsRows) {
      settingsMap[s.key] = s.value;
    }

    const clinicName = settingsMap.clinic_name || 'Dental Care';
    const clinicPhone = settingsMap.clinic_phone || '+880 1711-234567';
    const activeTemplate =
      (typeof messageTemplate === 'string' && messageTemplate.trim()) ||
      settingsMap.sms_reminder_template ||
      'Dear {patientName} ({patientId}), friendly reminder from {clinicName}: Your dental follow-up is scheduled for {followUpDate} with {doctorName} ({reason}). Contact: {clinicPhone}.';

    // Save template preference if updated
    if (typeof messageTemplate === 'string' && messageTemplate.trim()) {
      await db
        .insert(systemSettings)
        .values({
          key: 'sms_reminder_template',
          value: messageTemplate.trim(),
          description: 'Default SMS follow-up reminder template',
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: messageTemplate.trim(), updatedAt: new Date() },
        });
    }

    const activeGatewayUrl = (typeof gatewayUrl === 'string' ? gatewayUrl.trim() : '') || settingsMap.sms_gateway_url || '';
    const activeGatewayKey = (typeof gatewayApiKey === 'string' ? gatewayApiKey.trim() : '') || settingsMap.sms_gateway_api_key || '';
    const nowIso = new Date().toISOString();
    const newEntries: SmsReminderLogEntry[] = [];

    // Determine target channel
    const dispatchChannel = channel || (activeGatewayUrl ? 'Free Android SIM Gateway' : 'Central Clinic SMS Dispatch');

    for (const appt of targetAppointments) {
      const personalizedMessage = activeTemplate
        .replace(/\{patientName\}/g, appt.patientName)
        .replace(/\{patientId\}/g, appt.patientCode)
        .replace(/\{followUpDate\}/g, appt.followUpDate)
        .replace(/\{doctorName\}/g, appt.doctorName)
        .replace(/\{reason\}/g, appt.reason)
        .replace(/\{clinicName\}/g, clinicName)
        .replace(/\{clinicPhone\}/g, clinicPhone);

      // If channel is Android SIM Gateway or we have an active gateway URL, forward request
      if ((dispatchChannel === 'Free Android SIM Gateway' || !channel) && activeGatewayUrl) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 4000);
          await fetch(activeGatewayUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(activeGatewayKey ? { Authorization: `Bearer ${activeGatewayKey}` } : {}),
            },
            body: JSON.stringify({
              to: appt.patientPhone,
              phone: appt.patientPhone,
              number: appt.patientPhone,
              message: personalizedMessage,
              patientId: appt.patientCode,
              followUpDate: appt.followUpDate,
              sender: clinicName,
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);
        } catch (gwErr) {
          console.warn('Android SIM gateway forward error (recorded in logs):', gwErr);
        }
      }

      newEntries.push({
        id: `SMS-${Date.now()}-${appt.id}`,
        appointmentId: appt.id,
        patientId: appt.patientId,
        patientCode: appt.patientCode,
        patientName: appt.patientName,
        patientPhone: appt.patientPhone,
        doctorName: appt.doctorName,
        followUpDate: appt.followUpDate,
        reason: appt.reason,
        message: personalizedMessage,
        sentBy: req.user!.fullName,
        sentAt: nowIso,
        channel: dispatchChannel,
        status: 'Sent',
      });
    }

    const combinedLogs = [...newEntries, ...existingLogs];
    await saveSmsReminderLogs(combinedLogs);

    await logAudit(
      req.user,
      'SEND_CENTRAL_SMS_REMINDER',
      `Follow-Up Reminder (${newEntries.length} via ${dispatchChannel})`,
      `Recipients: ${newEntries.map((e) => `${e.patientName} (${e.patientPhone}) for ${e.followUpDate}`).join('; ')}`
    );

    res.status(200).json({
      success: true,
      channel: dispatchChannel,
      sentCount: newEntries.length,
      results: newEntries,
    });
  } catch (error: any) {
    console.error('Error sending SMS reminders:', error);
    res.status(500).json({ error: 'Failed to dispatch SMS reminders' });
  }
});

apiRouter.post('/appointments', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { patientId, visitId, doctorId, followUpDate, reason, notes } = req.body;
    if (!patientId || !followUpDate || !reason) {
      return res.status(400).json({ error: 'Patient, Follow-up Date, and Reason are required.' });
    }

    const [created] = await db
      .insert(appointments)
      .values({
        patientId: parseInt(patientId),
        visitId: visitId ? parseInt(visitId) : null,
        doctorId: doctorId ? parseInt(doctorId) : req.user!.id,
        followUpDate,
        reason: reason.trim(),
        status: 'Scheduled',
        notes: notes?.trim() || null,
      })
      .returning();

    await logAudit(
      req.user,
      'SCHEDULE_FOLLOW_UP',
      `Patient ID ${patientId}`,
      `Scheduled on ${followUpDate}: ${reason}`
    );

    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to schedule follow-up' });
  }
});

apiRouter.put('/appointments/:id/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, notes } = req.body;

    const [updated] = await db
      .update(appointments)
      .set({
        status,
        notes: notes !== undefined ? notes : undefined,
      })
      .where(eq(appointments.id, id))
      .returning();

    await logAudit(
      req.user,
      'UPDATE_APPOINTMENT_STATUS',
      `Appointment ID ${id}`,
      `Status changed to: ${status}`
    );

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update follow-up' });
  }
});

// ==========================================
// 9. DASHBOARD STATS (ROLE-SPECIFIC)
// ==========================================

apiRouter.get('/dashboard/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const todayStr = new Date().toISOString().split('T')[0];

    // Main Doctor & Developer view clinic-wide metrics (all queries in parallel)
    if (user.role === 'main_doctor' || user.role === 'developer') {
      const [
        totalPatientsRows,
        totalDoctorsRows,
        totalVisitsRows,
        todayVisitsRows,
        upcomingFollowUpsRows,
        visitAggregates,
        recentVisits,
        devCounts,
      ] = await Promise.all([
        db.select({ count: count() }).from(patients),
        db.select({ count: count() }).from(users).where(eq(users.isActive, true)),
        db.select({ count: count() }).from(visits),
        db.select({ count: count() }).from(visits).where(eq(visits.visitDate, todayStr)),
        db
          .select({ count: count() })
          .from(appointments)
          .where(
            and(
              eq(appointments.status, 'Scheduled'),
              sql`${appointments.followUpDate} >= ${todayStr}`
            )
          ),
        db
          .select({
            totalTreatment: sql<string>`COALESCE(SUM(total_treatment_cost), 0)`,
            totalTest: sql<string>`COALESCE(SUM(total_test_cost), 0)`,
            totalCost: sql<string>`COALESCE(SUM(total_cost), 0)`,
            totalPaid: sql<string>`COALESCE(SUM(amount_paid), 0)`,
            totalDue: sql<string>`COALESCE(SUM(outstanding_due), 0)`,
          })
          .from(visits),
        db
          .select({
            id: visits.id,
            visitId: visits.visitId,
            patientId: visits.patientId,
            patientName: patients.name,
            patientCode: patients.patientId,
            doctorName: users.fullName,
            visitDate: visits.visitDate,
            diagnosis: visits.diagnosis,
            totalCost: visits.totalCost,
            amountPaid: visits.amountPaid,
            outstandingDue: visits.outstandingDue,
          })
          .from(visits)
          .innerJoin(patients, eq(visits.patientId, patients.id))
          .innerJoin(users, eq(visits.doctorId, users.id))
          .orderBy(desc(visits.id))
          .limit(6),
        user.role === 'developer'
          ? Promise.all([
              db.select({ count: count() }).from(users),
              db.select({ count: count() }).from(treatments),
              db.select({ count: count() }).from(diagnosticTests),
              db.select({ count: count() }).from(payments),
              db.select({ count: count() }).from(prescriptions),
              db.select({ count: count() }).from(auditLogs),
            ])
          : Promise.resolve(null),
      ]);

      const developerStats = devCounts
        ? {
            totalUsers: devCounts[0][0]?.count || 0,
            totalTreatments: devCounts[1][0]?.count || 0,
            totalDiagnosticTests: devCounts[2][0]?.count || 0,
            totalPayments: devCounts[3][0]?.count || 0,
            totalPrescriptions: devCounts[4][0]?.count || 0,
            totalAuditLogs: devCounts[5][0]?.count || 0,
          }
        : null;

      return res.json({
        role: user.role,
        totalPatients: Number(totalPatientsRows[0]?.count || 0),
        totalDoctors: Number(totalDoctorsRows[0]?.count || 0),
        totalVisits: Number(totalVisitsRows[0]?.count || 0),
        todayVisits: Number(todayVisitsRows[0]?.count || 0),
        upcomingFollowUps: Number(upcomingFollowUpsRows[0]?.count || 0),
        totalTreatmentCharges: parseFloat(visitAggregates[0]?.totalTreatment || '0'),
        totalTestCharges: parseFloat(visitAggregates[0]?.totalTest || '0'),
        totalCollection: parseFloat(visitAggregates[0]?.totalPaid || '0'),
        totalOutstandingDues: parseFloat(visitAggregates[0]?.totalDue || '0'),
        recentVisits,
        developerStats,
      });
    }

    // Doctor dashboard (Personal statistics + clinic context, all queries in parallel)
    const [
      myVisitsRows,
      myUniquePatients,
      myTodayVisitsRows,
      myUpcomingFollowUpsRows,
      recentVisits,
      treatmentStats,
    ] = await Promise.all([
      db.select({ count: count() }).from(visits).where(eq(visits.doctorId, user.id)),
      db
        .select({ patientId: visits.patientId })
        .from(visits)
        .where(eq(visits.doctorId, user.id))
        .groupBy(visits.patientId),
      db
        .select({ count: count() })
        .from(visits)
        .where(and(eq(visits.doctorId, user.id), eq(visits.visitDate, todayStr))),
      db
        .select({ count: count() })
        .from(appointments)
        .where(
          and(
            eq(appointments.doctorId, user.id),
            eq(appointments.status, 'Scheduled'),
            sql`${appointments.followUpDate} >= ${todayStr}`
          )
        ),
      db
        .select({
          id: visits.id,
          visitId: visits.visitId,
          patientId: visits.patientId,
          patientName: patients.name,
          patientCode: patients.patientId,
          doctorName: users.fullName,
          visitDate: visits.visitDate,
          diagnosis: visits.diagnosis,
          totalCost: visits.totalCost,
          amountPaid: visits.amountPaid,
          outstandingDue: visits.outstandingDue,
        })
        .from(visits)
        .innerJoin(patients, eq(visits.patientId, patients.id))
        .innerJoin(users, eq(visits.doctorId, users.id))
        .where(eq(visits.doctorId, user.id))
        .orderBy(desc(visits.id))
        .limit(6),
      db
        .select({
          name: treatments.treatmentName,
          count: count(),
          totalEarned: sql<string>`COALESCE(SUM(cost), 0)`,
        })
        .from(treatments)
        .where(eq(treatments.doctorId, user.id))
        .groupBy(treatments.treatmentName)
        .orderBy(desc(count()))
        .limit(5),
    ]);

    res.json({
      role: 'doctor',
      doctorId: user.id,
      doctorName: user.fullName,
      totalVisits: Number(myVisitsRows[0]?.count || 0),
      uniquePatients: myUniquePatients.length,
      todayVisits: Number(myTodayVisitsRows[0]?.count || 0),
      upcomingFollowUps: Number(myUpcomingFollowUpsRows[0]?.count || 0),
      recentVisits,
      treatmentStats,
    });
  } catch (error: any) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard statistics' });
  }
});

// ==========================================
// 10. CSV EXPORT ENGINE
// ==========================================

function sendCsv(res: Response, filename: string, headers: string[], rows: (string | number)[][]) {
  // Add UTF-8 Byte Order Mark (BOM) for perfect Excel compatibility
  const BOM = '\uFEFF';
  const csvContent =
    BOM +
    headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',') +
    '\n' +
    rows
      .map((row) =>
        row
          .map((cell) => {
            if (cell === null || cell === undefined) return '""';
            const str = String(cell).replace(/"/g, '""');
            return `"${str}"`;
          })
          .join(',')
      )
      .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csvContent);
}

function getDateFilterRange(query: any): { fromDate: string | null; toDate: string | null; suffix: string } {
  const fromDate = typeof query.fromDate === 'string' && query.fromDate.trim() ? query.fromDate.trim() : null;
  const toDate = typeof query.toDate === 'string' && query.toDate.trim() ? query.toDate.trim() : null;
  const today = new Date().toISOString().split('T')[0];
  const suffix =
    fromDate && toDate
      ? `${fromDate}_to_${toDate}`
      : fromDate
      ? `from_${fromDate}`
      : toDate
      ? `until_${toDate}`
      : `all_${today}`;
  return { fromDate, toDate, suffix };
}

apiRouter.get('/export/patients.csv', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { fromDate, toDate, suffix } = getDateFilterRange(req.query);
    const conditions = [];
    if (fromDate) conditions.push(sql`${patients.registrationDate} >= ${fromDate}`);
    if (toDate) conditions.push(sql`${patients.registrationDate} <= ${toDate}`);

    const patientList =
      conditions.length > 0
        ? await db.select().from(patients).where(and(...conditions)).orderBy(asc(patients.id))
        : await db.select().from(patients).orderBy(asc(patients.id));

    const allVisitRows =
      patientList.length > 0
        ? await db
            .select({
              id: visits.id,
              patientId: visits.patientId,
              visitDate: visits.visitDate,
              treatmentCost: visits.totalTreatmentCost,
              testCost: visits.totalTestCost,
              cost: visits.totalCost,
              paid: visits.amountPaid,
            })
            .from(visits)
            .where(inArray(visits.patientId, patientList.map((p) => p.id)))
            .orderBy(asc(visits.visitDate), asc(visits.id))
        : [];

    const visitsByPat = new Map<number, typeof allVisitRows>();
    for (const vr of allVisitRows) {
      const arr = visitsByPat.get(vr.patientId) || [];
      arr.push(vr);
      visitsByPat.set(vr.patientId, arr);
    }

    const headers = [
      'Patient ID',
      'Name',
      'Phone',
      'Alternative Phone',
      'Age',
      'Gender',
      'Address',
      'Registration Date',
      'Existing Diseases',
      'Allergies',
      'Visit Count',
      'Treatment Expenses (BDT)',
      'Test / X-ray Expenses (BDT)',
      'Total Patient Cost (BDT)',
      'Total Paid (BDT)',
      'Total Outstanding Due (BDT)',
    ];

    const rows = patientList.map((p) => {
      const vRows = visitsByPat.get(p.id) || [];
      let totTx = 0;
      let totTest = 0;
      let totCost = 0;
      let totPaid = 0;
      let runningDue = 0;

      for (const v of vRows) {
        const net = parseFloat(v.cost || '0');
        const paid = parseFloat(v.paid || '0');
        totTx += parseFloat(v.treatmentCost || '0');
        totTest += parseFloat(v.testCost || '0');
        totCost += net;
        totPaid += paid;
        runningDue = Math.max(0, Number((runningDue + net - paid).toFixed(2)));
      }

      return [
        p.patientId,
        p.name,
        p.phone,
        p.altPhone || '',
        p.age || '',
        p.gender,
        p.address || '',
        p.registrationDate,
        p.existingDiseases || '',
        p.allergies || '',
        vRows.length,
        totTx.toFixed(2),
        totTest.toFixed(2),
        totCost.toFixed(2),
        totPaid.toFixed(2),
        runningDue.toFixed(2),
      ];
    });

    await logAudit(req.user, 'EXPORT_CSV', 'Patients CSV', `Exported ${rows.length} patient records (${suffix})`);
    sendCsv(res, `dental_care_patients_${suffix}.csv`, headers, rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Export failed' });
  }
});

apiRouter.get('/export/visits.csv', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { fromDate, toDate, suffix } = getDateFilterRange(req.query);
    const conditions = [];
    if (fromDate) conditions.push(sql`${visits.visitDate} >= ${fromDate}`);
    if (toDate) conditions.push(sql`${visits.visitDate} <= ${toDate}`);

    const baseQuery = db
      .select({
        visitId: visits.visitId,
        patientCode: patients.patientId,
        patientName: patients.name,
        doctorName: users.fullName,
        visitDate: visits.visitDate,
        complaints: visits.complaints,
        diagnosis: visits.diagnosis,
        treatmentCost: visits.totalTreatmentCost,
        testCost: visits.totalTestCost,
        additionalCharges: visits.additionalCharges,
        discount: visits.discount,
        totalCost: visits.totalCost,
        amountPaid: visits.amountPaid,
        outstandingDue: visits.outstandingDue,
        nextFollowUpDate: visits.nextFollowUpDate,
        status: visits.status,
      })
      .from(visits)
      .innerJoin(patients, eq(visits.patientId, patients.id))
      .innerJoin(users, eq(visits.doctorId, users.id));

    const visitList =
      conditions.length > 0
        ? await baseQuery.where(and(...conditions)).orderBy(desc(visits.visitDate), desc(visits.id))
        : await baseQuery.orderBy(desc(visits.visitDate), desc(visits.id));

    const headers = [
      'Visit ID',
      'Patient ID',
      'Patient Name',
      'Attending Doctor',
      'Visit Date',
      'Complaints',
      'Diagnosis',
      'Treatment Charges (BDT)',
      'Test/X-ray Charges (BDT)',
      'Other Charges (BDT)',
      'Discount (BDT)',
      'Total Cost (BDT)',
      'Amount Paid (BDT)',
      'Outstanding Due (BDT)',
      'Next Follow-Up Date',
      'Status',
    ];

    const rows = visitList.map((v) => [
      v.visitId,
      v.patientCode,
      v.patientName,
      v.doctorName,
      v.visitDate,
      v.complaints || '',
      v.diagnosis || '',
      v.treatmentCost,
      v.testCost,
      v.additionalCharges,
      v.discount,
      v.totalCost,
      v.amountPaid,
      v.outstandingDue,
      v.nextFollowUpDate || '',
      v.status,
    ]);

    await logAudit(req.user, 'EXPORT_CSV', 'Visits CSV', `Exported ${rows.length} visit records (${suffix})`);
    sendCsv(res, `dental_care_visits_${suffix}.csv`, headers, rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Export failed' });
  }
});

apiRouter.get('/export/treatments.csv', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { fromDate, toDate, suffix } = getDateFilterRange(req.query);
    const conditions = [];
    if (fromDate) conditions.push(sql`${treatments.treatmentDate} >= ${fromDate}`);
    if (toDate) conditions.push(sql`${treatments.treatmentDate} <= ${toDate}`);

    const baseQuery = db
      .select({
        id: treatments.id,
        patientCode: patients.patientId,
        patientName: patients.name,
        visitCode: visits.visitId,
        doctorName: users.fullName,
        treatmentName: treatments.treatmentName,
        toothNumber: treatments.toothNumber,
        description: treatments.description,
        cost: treatments.cost,
        status: treatments.status,
        treatmentDate: treatments.treatmentDate,
      })
      .from(treatments)
      .innerJoin(patients, eq(treatments.patientId, patients.id))
      .innerJoin(visits, eq(treatments.visitId, visits.id))
      .innerJoin(users, eq(treatments.doctorId, users.id));

    const list =
      conditions.length > 0
        ? await baseQuery.where(and(...conditions)).orderBy(desc(treatments.treatmentDate), desc(treatments.id))
        : await baseQuery.orderBy(desc(treatments.treatmentDate), desc(treatments.id));

    const headers = [
      'Treatment ID',
      'Patient ID',
      'Patient Name',
      'Visit ID',
      'Performing Doctor',
      'Treatment Name',
      'Tooth Number',
      'Description',
      'Cost (BDT)',
      'Status',
      'Treatment Date',
    ];

    const rows = list.map((t) => [
      t.id,
      t.patientCode,
      t.patientName,
      t.visitCode,
      t.doctorName,
      t.treatmentName,
      t.toothNumber || '',
      t.description || '',
      t.cost,
      t.status,
      t.treatmentDate,
    ]);

    await logAudit(req.user, 'EXPORT_CSV', 'Treatments CSV', `Exported ${rows.length} treatment records (${suffix})`);
    sendCsv(res, `dental_care_treatments_${suffix}.csv`, headers, rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Export failed' });
  }
});

apiRouter.get('/export/payments.csv', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { fromDate, toDate, suffix } = getDateFilterRange(req.query);
    const { method, receivedBy } = req.query;

    const conditions = [];
    if (fromDate) conditions.push(sql`${payments.paymentDate} >= ${fromDate}`);
    if (toDate) conditions.push(sql`${payments.paymentDate} <= ${toDate}`);
    if (method && typeof method === 'string' && method !== 'All') {
      conditions.push(eq(payments.paymentMethod, method));
    }
    if (req.user!.role === 'doctor') {
      conditions.push(eq(payments.receivedBy, req.user!.id));
    } else if (receivedBy && typeof receivedBy === 'string' && receivedBy !== 'All') {
      conditions.push(eq(payments.receivedBy, parseInt(receivedBy)));
    }

    const baseQuery = db
      .select({
        paymentId: payments.paymentId,
        patientCode: patients.patientId,
        patientName: patients.name,
        visitCode: visits.visitId,
        amount: payments.amount,
        paymentMethod: payments.paymentMethod,
        transactionRef: payments.transactionRef,
        notes: payments.notes,
        paymentDate: payments.paymentDate,
        receiverName: users.fullName,
      })
      .from(payments)
      .innerJoin(patients, eq(payments.patientId, patients.id))
      .innerJoin(visits, eq(payments.visitId, visits.id))
      .leftJoin(users, eq(payments.receivedBy, users.id));

    const paymentList =
      conditions.length > 0
        ? await baseQuery.where(and(...conditions)).orderBy(desc(payments.paymentDate), desc(payments.id))
        : await baseQuery.orderBy(desc(payments.paymentDate), desc(payments.id));

    const headers = [
      'Payment ID',
      'Patient ID',
      'Patient Name',
      'Visit ID',
      'Amount (BDT)',
      'Payment Method',
      'Transaction Reference',
      'Received By',
      'Payment Date',
      'Notes',
    ];

    const rows = paymentList.map((p) => [
      p.paymentId,
      p.patientCode,
      p.patientName,
      p.visitCode,
      p.amount,
      p.paymentMethod,
      p.transactionRef || '',
      p.receiverName || '',
      p.paymentDate,
      p.notes || '',
    ]);

    await logAudit(req.user, 'EXPORT_CSV', 'Payments CSV', `Exported ${rows.length} payment records (${suffix})`);
    sendCsv(res, `dental_care_payments_${suffix}.csv`, headers, rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Export failed' });
  }
});

apiRouter.get('/export/diagnostic-tests.csv', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { fromDate, toDate, suffix } = getDateFilterRange(req.query);
    const conditions = [];
    if (fromDate) conditions.push(sql`${diagnosticTests.testDate} >= ${fromDate}`);
    if (toDate) conditions.push(sql`${diagnosticTests.testDate} <= ${toDate}`);

    const baseQuery = db
      .select({
        testId: diagnosticTests.id,
        patientCode: patients.patientId,
        patientName: patients.name,
        visitCode: visits.visitId,
        doctorName: users.fullName,
        testName: diagnosticTests.testName,
        category: diagnosticTests.category,
        cost: diagnosticTests.cost,
        status: diagnosticTests.status,
        testDate: diagnosticTests.testDate,
        notes: diagnosticTests.notes,
      })
      .from(diagnosticTests)
      .innerJoin(patients, eq(diagnosticTests.patientId, patients.id))
      .innerJoin(visits, eq(diagnosticTests.visitId, visits.id))
      .innerJoin(users, eq(diagnosticTests.doctorId, users.id));

    const testList =
      conditions.length > 0
        ? await baseQuery.where(and(...conditions)).orderBy(desc(diagnosticTests.testDate), desc(diagnosticTests.id))
        : await baseQuery.orderBy(desc(diagnosticTests.testDate), desc(diagnosticTests.id));

    const headers = [
      'Test Record ID',
      'Patient ID',
      'Patient Name',
      'Visit ID',
      'Referring Doctor',
      'Test/X-ray Name',
      'Category',
      'Cost (BDT)',
      'Status',
      'Test Date',
      'Notes',
    ];

    const rows = testList.map((t) => [
      t.testId,
      t.patientCode,
      t.patientName,
      t.visitCode,
      t.doctorName,
      t.testName,
      t.category,
      t.cost,
      t.status,
      t.testDate,
      t.notes || '',
    ]);

    await logAudit(req.user, 'EXPORT_CSV', 'Diagnostic Tests CSV', `Exported ${rows.length} test records (${suffix})`);
    sendCsv(res, `dental_care_tests_xrays_${suffix}.csv`, headers, rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// Complete All-Data CSV Backup (Patients + Visits + Treatments + Diagnostic Tests + Payments + Follow-ups)
// Supports optional fromDate & toDate filtering or full unfiltered 100% database CSV download
apiRouter.get('/export/complete-data.csv', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { fromDate, toDate, suffix } = getDateFilterRange(req.query);
    const isSuper = req.user!.role === 'main_doctor' || req.user!.role === 'developer';

    const patientConditions = [];
    if (fromDate) patientConditions.push(sql`${patients.registrationDate} >= ${fromDate}`);
    if (toDate) patientConditions.push(sql`${patients.registrationDate} <= ${toDate}`);

    const visitConditions = [];
    if (fromDate) visitConditions.push(sql`${visits.visitDate} >= ${fromDate}`);
    if (toDate) visitConditions.push(sql`${visits.visitDate} <= ${toDate}`);
    if (!isSuper) visitConditions.push(eq(visits.doctorId, req.user!.id));

    const treatmentConditions = [];
    if (fromDate) treatmentConditions.push(sql`${treatments.treatmentDate} >= ${fromDate}`);
    if (toDate) treatmentConditions.push(sql`${treatments.treatmentDate} <= ${toDate}`);
    if (!isSuper) treatmentConditions.push(eq(treatments.doctorId, req.user!.id));

    const testConditions = [];
    if (fromDate) testConditions.push(sql`${diagnosticTests.testDate} >= ${fromDate}`);
    if (toDate) testConditions.push(sql`${diagnosticTests.testDate} <= ${toDate}`);
    if (!isSuper) testConditions.push(eq(diagnosticTests.doctorId, req.user!.id));

    const paymentConditions = [];
    if (fromDate) paymentConditions.push(sql`${payments.paymentDate} >= ${fromDate}`);
    if (toDate) paymentConditions.push(sql`${payments.paymentDate} <= ${toDate}`);
    if (!isSuper) paymentConditions.push(eq(payments.receivedBy, req.user!.id));

    const apptConditions = [];
    if (fromDate) apptConditions.push(sql`${appointments.followUpDate} >= ${fromDate}`);
    if (toDate) apptConditions.push(sql`${appointments.followUpDate} <= ${toDate}`);
    if (!isSuper) apptConditions.push(eq(appointments.doctorId, req.user!.id));

    const [
      patientList,
      allVisitsForPatientTotals,
      visitList,
      treatmentList,
      testList,
      paymentList,
      appointmentList,
    ] = await Promise.all([
      patientConditions.length > 0
        ? db.select().from(patients).where(and(...patientConditions)).orderBy(asc(patients.id))
        : db.select().from(patients).orderBy(asc(patients.id)),
      db
        .select({
          id: visits.id,
          patientId: visits.patientId,
          visitDate: visits.visitDate,
          treatmentCost: visits.totalTreatmentCost,
          testCost: visits.totalTestCost,
          totalCost: visits.totalCost,
          amountPaid: visits.amountPaid,
        })
        .from(visits)
        .orderBy(asc(visits.visitDate), asc(visits.id)),
      (() => {
        const q = db
          .select({
            visitId: visits.visitId,
            patientCode: patients.patientId,
            patientName: patients.name,
            doctorName: users.fullName,
            visitDate: visits.visitDate,
            visitTime: visits.visitTime,
            complaints: visits.complaints,
            diagnosis: visits.diagnosis,
            treatmentCost: visits.totalTreatmentCost,
            testCost: visits.totalTestCost,
            additionalCharges: visits.additionalCharges,
            discount: visits.discount,
            totalCost: visits.totalCost,
            amountPaid: visits.amountPaid,
            outstandingDue: visits.outstandingDue,
            nextFollowUpDate: visits.nextFollowUpDate,
            notes: visits.notes,
            status: visits.status,
          })
          .from(visits)
          .innerJoin(patients, eq(visits.patientId, patients.id))
          .innerJoin(users, eq(visits.doctorId, users.id));
        return visitConditions.length > 0
          ? q.where(and(...visitConditions)).orderBy(desc(visits.visitDate), desc(visits.id))
          : q.orderBy(desc(visits.visitDate), desc(visits.id));
      })(),
      (() => {
        const q = db
          .select({
            id: treatments.id,
            patientCode: patients.patientId,
            patientName: patients.name,
            visitCode: visits.visitId,
            doctorName: users.fullName,
            treatmentName: treatments.treatmentName,
            toothNumber: treatments.toothNumber,
            description: treatments.description,
            cost: treatments.cost,
            status: treatments.status,
            treatmentDate: treatments.treatmentDate,
          })
          .from(treatments)
          .innerJoin(patients, eq(treatments.patientId, patients.id))
          .innerJoin(visits, eq(treatments.visitId, visits.id))
          .innerJoin(users, eq(treatments.doctorId, users.id));
        return treatmentConditions.length > 0
          ? q.where(and(...treatmentConditions)).orderBy(desc(treatments.treatmentDate), desc(treatments.id))
          : q.orderBy(desc(treatments.treatmentDate), desc(treatments.id));
      })(),
      (() => {
        const q = db
          .select({
            id: diagnosticTests.id,
            patientCode: patients.patientId,
            patientName: patients.name,
            visitCode: visits.visitId,
            doctorName: users.fullName,
            testName: diagnosticTests.testName,
            category: diagnosticTests.category,
            description: diagnosticTests.description,
            cost: diagnosticTests.cost,
            status: diagnosticTests.status,
            testDate: diagnosticTests.testDate,
          })
          .from(diagnosticTests)
          .innerJoin(patients, eq(diagnosticTests.patientId, patients.id))
          .innerJoin(visits, eq(diagnosticTests.visitId, visits.id))
          .innerJoin(users, eq(diagnosticTests.doctorId, users.id));
        return testConditions.length > 0
          ? q.where(and(...testConditions)).orderBy(desc(diagnosticTests.testDate), desc(diagnosticTests.id))
          : q.orderBy(desc(diagnosticTests.testDate), desc(diagnosticTests.id));
      })(),
      (() => {
        const q = db
          .select({
            paymentId: payments.paymentId,
            patientCode: patients.patientId,
            patientName: patients.name,
            visitCode: visits.visitId,
            amount: payments.amount,
            paymentMethod: payments.paymentMethod,
            transactionRef: payments.transactionRef,
            receiverName: users.fullName,
            paymentDate: payments.paymentDate,
            notes: payments.notes,
          })
          .from(payments)
          .innerJoin(patients, eq(payments.patientId, patients.id))
          .innerJoin(visits, eq(payments.visitId, visits.id))
          .leftJoin(users, eq(payments.receivedBy, users.id));
        return paymentConditions.length > 0
          ? q.where(and(...paymentConditions)).orderBy(desc(payments.paymentDate), desc(payments.id))
          : q.orderBy(desc(payments.paymentDate), desc(payments.id));
      })(),
      (() => {
        const q = db
          .select({
            id: appointments.id,
            patientCode: patients.patientId,
            patientName: patients.name,
            patientPhone: patients.phone,
            doctorName: users.fullName,
            followUpDate: appointments.followUpDate,
            reason: appointments.reason,
            status: appointments.status,
            notes: appointments.notes,
          })
          .from(appointments)
          .innerJoin(patients, eq(appointments.patientId, patients.id))
          .innerJoin(users, eq(appointments.doctorId, users.id));
        return apptConditions.length > 0
          ? q.where(and(...apptConditions)).orderBy(desc(appointments.followUpDate), desc(appointments.id))
          : q.orderBy(desc(appointments.followUpDate), desc(appointments.id));
      })(),
    ]);

    const visitsByPat = new Map<number, typeof allVisitsForPatientTotals>();
    for (const vr of allVisitsForPatientTotals) {
      const arr = visitsByPat.get(vr.patientId) || [];
      arr.push(vr);
      visitsByPat.set(vr.patientId, arr);
    }

    const csvEscape = (cell: any) => {
      if (cell === null || cell === undefined) return '""';
      return `"${String(cell).replace(/"/g, '""')}"`;
    };
    const rowLine = (cols: any[]) => cols.map(csvEscape).join(',');

    const lines: string[] = [];
    lines.push(rowLine(['Dental Care — Complete Clinic Data Backup (CSV)']));
    lines.push(
      rowLine([
        'Generated At',
        new Date().toISOString(),
        'Date Filter',
        fromDate || toDate ? `${fromDate || 'Beginning'} to ${toDate || 'Present'}` : 'All Complete Data (Unfiltered)',
        'Exported By',
        `${req.user!.fullName} (${req.user!.role})`,
      ])
    );
    lines.push('');

    // SECTION 1: PATIENTS
    lines.push(rowLine([`=== SECTION 1: PATIENTS MASTER RECORDS (${patientList.length}) ===`]));
    lines.push(
      rowLine([
        'Patient ID',
        'Name',
        'Phone',
        'Alternative Phone',
        'Age',
        'Gender',
        'Address',
        'Registration Date',
        'Allergies',
        'Existing Diseases',
        'Visits',
        'Treatment Expenses (BDT)',
        'Test / X-ray Expenses (BDT)',
        'Total Patient Cost (BDT)',
        'Total Paid (BDT)',
        'Total Outstanding Due (BDT)',
      ])
    );
    for (const p of patientList) {
      const vRows = visitsByPat.get(p.id) || [];
      let tx = 0;
      let tst = 0;
      let cost = 0;
      let paid = 0;
      let due = 0;
      for (const v of vRows) {
        const net = parseFloat(v.totalCost || '0');
        const pAmt = parseFloat(v.amountPaid || '0');
        tx += parseFloat(v.treatmentCost || '0');
        tst += parseFloat(v.testCost || '0');
        cost += net;
        paid += pAmt;
        due = Math.max(0, Number((due + net - pAmt).toFixed(2)));
      }
      lines.push(
        rowLine([
          p.patientId,
          p.name,
          p.phone,
          p.altPhone || '',
          p.age || '',
          p.gender,
          p.address || '',
          p.registrationDate,
          p.allergies || '',
          p.existingDiseases || '',
          vRows.length,
          tx.toFixed(2),
          tst.toFixed(2),
          cost.toFixed(2),
          paid.toFixed(2),
          due.toFixed(2),
        ])
      );
    }
    lines.push('');

    // SECTION 2: VISITS
    lines.push(rowLine([`=== SECTION 2: CLINIC VISITS & ENCOUNTERS (${visitList.length}) ===`]));
    lines.push(
      rowLine([
        'Visit ID',
        'Patient ID',
        'Patient Name',
        'Attending Doctor',
        'Visit Date',
        'Visit Time',
        'Complaints',
        'Diagnosis',
        'Treatment Charges (BDT)',
        'Test Charges (BDT)',
        'Other Charges (BDT)',
        'Discount (BDT)',
        'Total Visit Cost (BDT)',
        'Amount Paid (BDT)',
        'Outstanding Due (BDT)',
        'Next Follow-Up Date',
        'Notes',
        'Status',
      ])
    );
    for (const v of visitList) {
      lines.push(
        rowLine([
          v.visitId,
          v.patientCode,
          v.patientName,
          v.doctorName,
          v.visitDate,
          v.visitTime || '',
          v.complaints || '',
          v.diagnosis || '',
          v.treatmentCost,
          v.testCost,
          v.additionalCharges,
          v.discount,
          v.totalCost,
          v.amountPaid,
          v.outstandingDue,
          v.nextFollowUpDate || '',
          v.notes || '',
          v.status,
        ])
      );
    }
    lines.push('');

    // SECTION 3: TREATMENTS
    lines.push(rowLine([`=== SECTION 3: ITEMIZED TREATMENTS (${treatmentList.length}) ===`]));
    lines.push(
      rowLine([
        'Treatment ID',
        'Patient ID',
        'Patient Name',
        'Visit ID',
        'Doctor',
        'Treatment Name',
        'Tooth #',
        'Description',
        'Cost (BDT)',
        'Status',
        'Treatment Date',
      ])
    );
    for (const t of treatmentList) {
      lines.push(
        rowLine([
          t.id,
          t.patientCode,
          t.patientName,
          t.visitCode,
          t.doctorName,
          t.treatmentName,
          t.toothNumber || '',
          t.description || '',
          t.cost,
          t.status,
          t.treatmentDate,
        ])
      );
    }
    lines.push('');

    // SECTION 4: DIAGNOSTIC TESTS
    lines.push(rowLine([`=== SECTION 4: DIAGNOSTIC TESTS & X-RAYS (${testList.length}) ===`]));
    lines.push(
      rowLine([
        'Test ID',
        'Patient ID',
        'Patient Name',
        'Visit ID',
        'Referring Doctor',
        'Test / X-ray Name',
        'Category',
        'Description',
        'Cost (BDT)',
        'Status',
        'Test Date',
      ])
    );
    for (const t of testList) {
      lines.push(
        rowLine([
          t.id,
          t.patientCode,
          t.patientName,
          t.visitCode,
          t.doctorName,
          t.testName,
          t.category,
          t.description || '',
          t.cost,
          t.status,
          t.testDate,
        ])
      );
    }
    lines.push('');

    // SECTION 5: PAYMENTS
    lines.push(rowLine([`=== SECTION 5: PAYMENTS & INSTALLMENT RECEIPTS (${paymentList.length}) ===`]));
    lines.push(
      rowLine([
        'Payment ID',
        'Patient ID',
        'Patient Name',
        'Visit ID',
        'Amount (BDT)',
        'Payment Method',
        'Transaction Ref',
        'Received By',
        'Payment Date',
        'Notes',
      ])
    );
    for (const p of paymentList) {
      lines.push(
        rowLine([
          p.paymentId,
          p.patientCode,
          p.patientName,
          p.visitCode,
          p.amount,
          p.paymentMethod,
          p.transactionRef || '',
          p.receiverName || '',
          p.paymentDate,
          p.notes || '',
        ])
      );
    }
    lines.push('');

    // SECTION 6: FOLLOW-UP APPOINTMENTS
    lines.push(rowLine([`=== SECTION 6: FOLLOW-UP APPOINTMENTS (${appointmentList.length}) ===`]));
    lines.push(
      rowLine([
        'Appointment ID',
        'Patient ID',
        'Patient Name',
        'Phone',
        'Doctor',
        'Follow-Up Date',
        'Reason',
        'Status',
        'Notes',
      ])
    );
    for (const a of appointmentList) {
      lines.push(
        rowLine([
          a.id,
          a.patientCode,
          a.patientName,
          a.patientPhone,
          a.doctorName,
          a.followUpDate,
          a.reason,
          a.status,
          a.notes || '',
        ])
      );
    }

    await logAudit(
      req.user,
      'EXPORT_COMPLETE_CSV',
      'Complete Clinic Data Backup CSV',
      `Exported ${patientList.length} patients, ${visitList.length} visits, ${treatmentList.length} treatments, ${testList.length} tests, ${paymentList.length} payments, ${appointmentList.length} appointments (${suffix})`
    );

    const filename = `dental_care_complete_data_${suffix}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send('\uFEFF' + lines.join('\n'));
  } catch (error: any) {
    console.error('Complete CSV export failed:', error);
    res.status(500).json({ error: 'Complete CSV export failed' });
  }
});

// ==========================================
// 11. AUDIT LOGS
// ==========================================

apiRouter.get(
  '/audit-logs',
  authenticateToken,
  requireRoles('main_doctor', 'developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const logs = await db
        .select({
          id: auditLogs.id,
          userId: auditLogs.userId,
          userRole: auditLogs.userRole,
          userName: users.fullName,
          username: users.username,
          action: auditLogs.action,
          affectedRecord: auditLogs.affectedRecord,
          details: auditLogs.details,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .orderBy(desc(auditLogs.id))
        .limit(100);

      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
);

// ==========================================
// 12. CLINIC SETTINGS & DEFAULT PRICING
// ==========================================

apiRouter.get('/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const list = await db.select().from(systemSettings);
    const map: Record<string, string> = {};
    for (const item of list) {
      map[item.key] = item.value;
    }
    res.json(map);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

apiRouter.put(
  '/settings',
  authenticateToken,
  requireRoles('main_doctor', 'developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { settings } = req.body;
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Invalid settings object' });
      }

      for (const [key, value] of Object.entries(settings)) {
        const valStr = typeof value === 'string' ? value : JSON.stringify(value);
        await db
          .insert(systemSettings)
          .values({ key, value: valStr })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: { value: valStr, updatedAt: new Date() },
          });
      }

      await logAudit(
        req.user,
        'UPDATE_SETTINGS',
        'Clinic Configuration & Default Prices',
        `Updated settings keys: ${Object.keys(settings).join(', ')}`
      );

      res.json({ success: true, message: 'Settings saved' });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to save settings' });
    }
  }
);

// ==========================================
// 13. DEVELOPER BACKUP & RESTORE
// ==========================================

apiRouter.get(
  '/developer/backup',
  authenticateToken,
  requireRoles('developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const allUsers = await db.select().from(users);
      const allPatients = await db.select().from(patients);
      const allVisits = await db.select().from(visits);
      const allTreatments = await db.select().from(treatments);
      const allTests = await db.select().from(diagnosticTests);
      const allPayments = await db.select().from(payments);
      const allAppointments = await db.select().from(appointments);
      const allSettings = await db.select().from(systemSettings);
      const allAuditLogs = await db.select().from(auditLogs);
      const allFeatureFlags = await db.select().from(applicationFeatureFlags);
      const allPrescriptions = await db.select().from(prescriptions);
      const allPrescriptionMedicines = await db.select().from(prescriptionMedicines);
      const allPrescriptionRevisions = await db.select().from(prescriptionRevisions);
      const allPrescriptionAuditLogs = await db.select().from(prescriptionAuditLogs);

      const backupData = {
        version: '1.1',
        exportedAt: new Date().toISOString(),
        tables: {
          users: allUsers,
          patients: allPatients,
          visits: allVisits,
          treatments: allTreatments,
          diagnosticTests: allTests,
          payments: allPayments,
          appointments: allAppointments,
          systemSettings: allSettings,
          auditLogs: allAuditLogs,
          applicationFeatureFlags: allFeatureFlags,
          prescriptions: allPrescriptions,
          prescriptionMedicines: allPrescriptionMedicines,
          prescriptionRevisions: allPrescriptionRevisions,
          prescriptionAuditLogs: allPrescriptionAuditLogs,
        },
      };

      await logAudit(req.user, 'DATABASE_BACKUP', 'PostgreSQL Cloud SQL Database', 'Full JSON snapshot downloaded');

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="dental_system_backup_${new Date().toISOString().split('T')[0]}.json"`
      );
      res.send(JSON.stringify(backupData, null, 2));
    } catch (error: any) {
      res.status(500).json({ error: 'Database backup failed' });
    }
  }
);

// ==========================================
// 14. DOCTOR SALARY SHEET (Main Doctor & Super Admin)
// ==========================================

apiRouter.get(
  '/doctor-salaries/doctor-metrics',
  authenticateToken,
  requireRoles('main_doctor', 'developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const doctorId = parseInt(String(req.query.doctorId || '0'), 10);
      if (!doctorId) {
        return res.status(400).json({ error: 'Valid doctorId is required' });
      }
      const fromDate = req.query.fromDate ? String(req.query.fromDate) : '';
      const toDate = req.query.toDate ? String(req.query.toDate) : '';

      const [doc] = await db.select().from(users).where(eq(users.id, doctorId));
      if (!doc) {
        return res.status(404).json({ error: 'Doctor not found' });
      }

      const doctorVisits = await db.select().from(visits).where(eq(visits.doctorId, doctorId));
      const filteredVisits = doctorVisits.filter((v) => {
        if (fromDate && v.visitDate < fromDate) return false;
        if (toDate && v.visitDate > toDate) return false;
        return true;
      });

      const visitIds = new Set(filteredVisits.map((v) => v.id));
      const uniqueDates = new Set(filteredVisits.map((v) => v.visitDate));

      const totalTreatmentBill = filteredVisits.reduce(
        (sum, v) => sum + (parseFloat(String(v.totalTreatmentCost || '0')) || 0),
        0
      );
      const totalVisitBill = filteredVisits.reduce(
        (sum, v) => sum + (parseFloat(String(v.totalCost || '0')) || 0),
        0
      );

      const allPayments = await db.select().from(payments);
      const paymentsInPeriod = allPayments.filter((p) => {
        if (fromDate && p.paymentDate < fromDate) return false;
        if (toDate && p.paymentDate > toDate) return false;
        return true;
      });

      const totalCollectedByDoctor = paymentsInPeriod
        .filter((p) => p.receivedBy === doctorId)
        .reduce((sum, p) => sum + (parseFloat(String(p.amount || '0')) || 0), 0);

      const totalCollectedForDoctorVisits = paymentsInPeriod
        .filter((p) => visitIds.has(p.visitId))
        .reduce((sum, p) => sum + (parseFloat(String(p.amount || '0')) || 0), 0);

      res.json({
        doctorId: doc.id,
        doctorName: doc.fullName,
        fromDate: fromDate || null,
        toDate: toDate || null,
        visitCount: filteredVisits.length,
        uniqueDaysWorked: uniqueDates.size,
        totalTreatmentBill: Number(totalTreatmentBill.toFixed(2)),
        totalVisitBill: Number(totalVisitBill.toFixed(2)),
        totalCollectedByDoctor: Number(totalCollectedByDoctor.toFixed(2)),
        totalCollectedForDoctorVisits: Number(totalCollectedForDoctorVisits.toFixed(2)),
      });
    } catch (error: any) {
      console.error('Error calculating doctor salary metrics:', error);
      res.status(500).json({ error: 'Failed to calculate doctor metrics' });
    }
  }
);

apiRouter.get(
  '/doctor-salaries',
  authenticateToken,
  requireRoles('main_doctor', 'developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { doctorId, salaryType, paymentStatus, fromDate, toDate, search } = req.query;

      const allSalaries = await db
        .select()
        .from(doctorSalaries)
        .orderBy(desc(doctorSalaries.paymentDate), desc(doctorSalaries.id));

      const allDoctors = await db.select().from(users);
      const doctorMap = new Map(allDoctors.map((d) => [d.id, d]));

      let result = allSalaries.map((s) => {
        const doc = doctorMap.get(s.doctorId);
        const rec = s.recordedBy ? doctorMap.get(s.recordedBy) : null;
        return {
          ...s,
          doctorName: doc?.fullName || `Doctor #${s.doctorId}`,
          doctorSpecialization: doc?.specialization || null,
          doctorPhone: doc?.phone || null,
          doctorRole: doc?.role || 'doctor',
          recordedByName: rec?.fullName || 'Main Doctor',
        };
      });

      if (doctorId && doctorId !== 'All') {
        const dId = parseInt(String(doctorId), 10);
        if (!isNaN(dId)) {
          result = result.filter((r) => r.doctorId === dId);
        }
      }

      if (salaryType && salaryType !== 'All') {
        result = result.filter((r) => r.salaryType === String(salaryType));
      }

      if (paymentStatus && paymentStatus !== 'All') {
        result = result.filter((r) => r.paymentStatus === String(paymentStatus));
      }

      if (fromDate) {
        const f = String(fromDate);
        result = result.filter((r) => r.paymentDate >= f);
      }

      if (toDate) {
        const t = String(toDate);
        result = result.filter((r) => r.paymentDate <= t);
      }

      if (search && String(search).trim()) {
        const q = String(search).trim().toLowerCase();
        result = result.filter(
          (r) =>
            r.salaryCode.toLowerCase().includes(q) ||
            (r.doctorName || '').toLowerCase().includes(q) ||
            (r.periodLabel || '').toLowerCase().includes(q) ||
            (r.notes || '').toLowerCase().includes(q) ||
            (r.transactionRef || '').toLowerCase().includes(q)
        );
      }

      res.json(result);
    } catch (error: any) {
      console.error('Error fetching doctor salaries:', error);
      res.status(500).json({ error: 'Failed to load doctor salary sheet' });
    }
  }
);

apiRouter.post(
  '/doctor-salaries',
  authenticateToken,
  requireRoles('main_doctor', 'developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        doctorId,
        salaryType = 'Monthly',
        periodLabel,
        periodStart,
        periodEnd,
        baseAmount = 0,
        daysWorked = 0,
        commissionBasis = 'collected',
        commissionSourceAmount = 0,
        commissionRate = 0,
        bonusAmount = 0,
        deductionAmount = 0,
        paidAmount = 0,
        paymentMethod = 'Cash',
        transactionRef,
        paymentDate,
        notes,
      } = req.body;

      const dId = parseInt(String(doctorId), 10);
      if (!dId || isNaN(dId)) {
        return res.status(400).json({ error: 'Please select a doctor.' });
      }
      if (!periodLabel || !String(periodLabel).trim()) {
        return res.status(400).json({ error: 'Period / Month label is required.' });
      }

      const [doc] = await db.select().from(users).where(eq(users.id, dId));
      if (!doc) {
        return res.status(404).json({ error: 'Selected doctor not found.' });
      }

      const base = Math.max(0, parseFloat(String(baseAmount)) || 0);
      const days = Math.max(0, parseInt(String(daysWorked), 10) || 0);
      const commSource = Math.max(0, parseFloat(String(commissionSourceAmount)) || 0);
      const commRate = Math.max(0, parseFloat(String(commissionRate)) || 0);
      const bonus = Math.max(0, parseFloat(String(bonusAmount)) || 0);
      const deduction = Math.max(0, parseFloat(String(deductionAmount)) || 0);

      let coreSalary = 0;
      let commEarned = 0;
      if (salaryType === 'Monthly') {
        coreSalary = base;
      } else if (salaryType === 'Daily') {
        coreSalary = base * (days > 0 ? days : 1);
      } else if (salaryType === 'Commission') {
        commEarned = Number(((commSource * commRate) / 100).toFixed(2));
        coreSalary = base + commEarned;
      }

      const totalPayableNum = Math.max(0, Number((coreSalary + bonus - deduction).toFixed(2)));
      const paidNum = Math.max(0, Number((parseFloat(String(paidAmount)) || 0).toFixed(2)));
      const dueNum = Math.max(0, Number((totalPayableNum - paidNum).toFixed(2)));

      let paymentStatus: 'Paid' | 'Partial' | 'Pending' = 'Pending';
      if (paidNum >= totalPayableNum && totalPayableNum > 0) {
        paymentStatus = 'Paid';
      } else if (paidNum > 0 && paidNum < totalPayableNum) {
        paymentStatus = 'Partial';
      } else if (totalPayableNum === 0) {
        paymentStatus = 'Paid';
      }

      const existing = await db.select({ id: doctorSalaries.id }).from(doctorSalaries);
      const maxId = existing.reduce((m, r) => Math.max(m, r.id), 0);
      const salaryCode = `SAL-${1001 + maxId}`;

      const payDateStr = paymentDate || new Date().toISOString().split('T')[0];
      const payrollMonth = req.body.payrollMonth || payDateStr.slice(0, 7);
      const payrollYear = req.body.payrollYear ? Number(req.body.payrollYear) : Number(payrollMonth.slice(0, 4)) || new Date().getFullYear();
      const payrollStatus =
        paymentStatus === 'Paid'
          ? 'Paid'
          : paymentStatus === 'Partial'
          ? 'Partially Paid'
          : req.body.payrollStatus || 'Draft';

      const [created] = await db
        .insert(doctorSalaries)
        .values({
          salaryCode,
          doctorId: dId,
          salaryType: String(salaryType),
          periodLabel: String(periodLabel).trim(),
          payrollMonth,
          payrollYear,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
          baseAmount: base.toFixed(2),
          daysWorked: days,
          commissionBasis: commissionBasis || 'collected',
          commissionSourceAmount: commSource.toFixed(2),
          commissionRate: commRate.toFixed(2),
          commissionEarned: commEarned.toFixed(2),
          grossSalary: coreSalary.toFixed(2),
          bonusAmount: bonus.toFixed(2),
          deductionAmount: deduction.toFixed(2),
          totalPayable: totalPayableNum.toFixed(2),
          paidAmount: paidNum.toFixed(2),
          dueAmount: dueNum.toFixed(2),
          payrollStatus,
          paymentStatus,
          paymentMethod: paymentMethod || 'Cash',
          transactionRef: transactionRef ? String(transactionRef).trim() : null,
          paymentDate: payDateStr,
          notes: notes ? String(notes).trim() : null,
          recordedBy: req.user?.id || null,
        })
        .returning();

      if (paidNum > 0) {
        const payCode = `SPAY-${created.id}-${Date.now().toString().slice(-4)}`;
        await db.insert(salaryPayments).values({
          paymentCode: payCode,
          salaryId: created.id,
          doctorId: dId,
          amount: paidNum.toFixed(2),
          paymentDate: payDateStr,
          paymentMethod: paymentMethod || 'Cash',
          transactionRef: transactionRef ? String(transactionRef).trim() : null,
          notes: notes ? String(notes).trim() : 'Initial salary disbursement',
          recordedBy: req.user?.id || null,
        });
      }

      await logAudit(
        req.user,
        'CREATE_DOCTOR_SALARY',
        `${salaryCode} (${doc.fullName})`,
        `${salaryType} Salary for ${periodLabel}: Payable ৳${totalPayableNum}, Paid ৳${paidNum}, Due ৳${dueNum} via ${paymentMethod}`
      );

      res.status(201).json({
        ...created,
        doctorName: doc.fullName,
        doctorSpecialization: doc.specialization,
        doctorPhone: doc.phone,
        recordedByName: req.user?.fullName || 'Main Doctor',
      });
    } catch (error: any) {
      console.error('Error creating doctor salary:', error);
      res.status(500).json({ error: error.message || 'Failed to save doctor salary record' });
    }
  }
);

apiRouter.put(
  '/doctor-salaries/:id',
  authenticateToken,
  requireRoles('main_doctor', 'developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [existing] = await db
        .select()
        .from(doctorSalaries)
        .where(eq(doctorSalaries.id, id));

      if (!existing) {
        return res.status(404).json({ error: 'Salary record not found' });
      }

      const salaryType = req.body.salaryType ?? existing.salaryType;
      const periodLabel = req.body.periodLabel ?? existing.periodLabel;
      const periodStart = req.body.periodStart !== undefined ? req.body.periodStart : existing.periodStart;
      const periodEnd = req.body.periodEnd !== undefined ? req.body.periodEnd : existing.periodEnd;
      const base = Math.max(0, parseFloat(String(req.body.baseAmount ?? existing.baseAmount)) || 0);
      const days = Math.max(0, parseInt(String(req.body.daysWorked ?? existing.daysWorked), 10) || 0);
      const commissionBasis = req.body.commissionBasis ?? existing.commissionBasis ?? 'collected';
      const commSource = Math.max(
        0,
        parseFloat(String(req.body.commissionSourceAmount ?? existing.commissionSourceAmount)) || 0
      );
      const commRate = Math.max(
        0,
        parseFloat(String(req.body.commissionRate ?? existing.commissionRate)) || 0
      );
      const bonus = Math.max(
        0,
        parseFloat(String(req.body.bonusAmount ?? existing.bonusAmount)) || 0
      );
      const deduction = Math.max(
        0,
        parseFloat(String(req.body.deductionAmount ?? existing.deductionAmount)) || 0
      );

      let coreSalary = 0;
      let commEarned = 0;
      if (salaryType === 'Monthly') {
        coreSalary = base;
      } else if (salaryType === 'Daily') {
        coreSalary = base * (days > 0 ? days : 1);
      } else if (salaryType === 'Commission') {
        commEarned = Number(((commSource * commRate) / 100).toFixed(2));
        coreSalary = base + commEarned;
      }

      const totalPayableNum = Math.max(0, Number((coreSalary + bonus - deduction).toFixed(2)));
      const paidNum = Math.max(
        0,
        Number((parseFloat(String(req.body.paidAmount ?? existing.paidAmount)) || 0).toFixed(2))
      );
      const dueNum = Math.max(0, Number((totalPayableNum - paidNum).toFixed(2)));

      let paymentStatus: 'Paid' | 'Partial' | 'Pending' = 'Pending';
      if (paidNum >= totalPayableNum && totalPayableNum > 0) {
        paymentStatus = 'Paid';
      } else if (paidNum > 0 && paidNum < totalPayableNum) {
        paymentStatus = 'Partial';
      } else if (totalPayableNum === 0) {
        paymentStatus = 'Paid';
      }

      const [updated] = await db
        .update(doctorSalaries)
        .set({
          doctorId: req.body.doctorId ? parseInt(String(req.body.doctorId), 10) : existing.doctorId,
          salaryType: String(salaryType),
          periodLabel: String(periodLabel).trim(),
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
          baseAmount: base.toFixed(2),
          daysWorked: days,
          commissionBasis,
          commissionSourceAmount: commSource.toFixed(2),
          commissionRate: commRate.toFixed(2),
          commissionEarned: commEarned.toFixed(2),
          bonusAmount: bonus.toFixed(2),
          deductionAmount: deduction.toFixed(2),
          totalPayable: totalPayableNum.toFixed(2),
          paidAmount: paidNum.toFixed(2),
          dueAmount: dueNum.toFixed(2),
          paymentStatus,
          paymentMethod: req.body.paymentMethod ?? existing.paymentMethod,
          transactionRef:
            req.body.transactionRef !== undefined
              ? req.body.transactionRef
                ? String(req.body.transactionRef).trim()
                : null
              : existing.transactionRef,
          paymentDate: req.body.paymentDate ?? existing.paymentDate,
          notes:
            req.body.notes !== undefined
              ? req.body.notes
                ? String(req.body.notes).trim()
                : null
              : existing.notes,
          updatedAt: new Date(),
        })
        .where(eq(doctorSalaries.id, id))
        .returning();

      const [doc] = await db.select().from(users).where(eq(users.id, updated.doctorId));

      await logAudit(
        req.user,
        'UPDATE_DOCTOR_SALARY',
        `${updated.salaryCode} (${doc?.fullName || updated.doctorId})`,
        `Updated salary record: Payable ৳${totalPayableNum}, Paid ৳${paidNum}, Due ৳${dueNum} (${paymentStatus})`
      );

      res.json({
        ...updated,
        doctorName: doc?.fullName || `Doctor #${updated.doctorId}`,
        doctorSpecialization: doc?.specialization || null,
        doctorPhone: doc?.phone || null,
      });
    } catch (error: any) {
      console.error('Error updating doctor salary:', error);
      res.status(500).json({ error: 'Failed to update doctor salary record' });
    }
  }
);

apiRouter.delete(
  '/doctor-salaries/:id',
  authenticateToken,
  requireRoles('main_doctor', 'developer'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [existing] = await db
        .select()
        .from(doctorSalaries)
        .where(eq(doctorSalaries.id, id));

      if (!existing) {
        return res.status(404).json({ error: 'Salary record not found' });
      }

      await db.delete(doctorSalaries).where(eq(doctorSalaries.id, id));

      await logAudit(
        req.user,
        'DELETE_DOCTOR_SALARY',
        existing.salaryCode,
        `Deleted doctor salary entry ${existing.salaryCode} (${existing.periodLabel}, Payable ৳${existing.totalPayable})`
      );

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete doctor salary record' });
    }
  }
);

