import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.ts';
import { users, auditLogs } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'dental_clinic_jwt_secret_bangladesh_v1';

export interface UserPayload {
  id: number;
  uid?: string | null;
  username: string;
  fullName: string;
  role: 'main_doctor' | 'developer' | 'doctor';
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
  specialization?: string | null;
  qualifications?: string | null;
  registrationNumber?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}

export function generateToken(user: UserPayload): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 1. Try custom JWT first
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded && decoded.id) {
        // Fetch fresh user record
        const [foundUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, decoded.id));

        if (!foundUser) {
          return res.status(401).json({ error: 'User account not found.' });
        }
        if (!foundUser.isActive) {
          return res.status(403).json({ error: 'Account is deactivated. Contact administrator.' });
        }

        req.user = {
          id: foundUser.id,
          uid: foundUser.uid,
          username: foundUser.username,
          fullName: foundUser.fullName,
          role: foundUser.role as any,
          email: foundUser.email,
          phone: foundUser.phone,
          isActive: foundUser.isActive,
          specialization: foundUser.specialization,
          qualifications: foundUser.qualifications,
          registrationNumber: foundUser.registrationNumber,
        };
        return next();
      }
    } catch (jwtErr) {
      // If not our JWT, try Firebase Auth token
    }

    // 2. Try Firebase ID token
    try {
      if (adminAuth && typeof adminAuth.verifyIdToken === 'function') {
        const decodedFirebase = await adminAuth.verifyIdToken(token);
        if (decodedFirebase) {
        // Find user by Firebase UID or email
        let [foundUser] = await db
          .select()
          .from(users)
          .where(eq(users.uid, decodedFirebase.uid));

        if (!foundUser && decodedFirebase.email) {
          const emailLower = decodedFirebase.email.toLowerCase();
          let [byEmail] = await db
            .select()
            .from(users)
            .where(eq(users.email, decodedFirebase.email));

          if (!byEmail && (emailLower === 'aminulislamaymon@gmail.com' || emailLower === 'aymon@dentalcare.com')) {
            const [devAcc] = await db
              .select()
              .from(users)
              .where(eq(users.username, 'dev_admin'));
            if (devAcc) {
              byEmail = devAcc;
            }
          }

          if (byEmail) {
            // Update UID
            await db
              .update(users)
              .set({ uid: decodedFirebase.uid })
              .where(eq(users.id, byEmail.id));
            foundUser = { ...byEmail, uid: decodedFirebase.uid };
          }
        }

        // If still not found, create a doctor or user record
        if (!foundUser) {
          const [created] = await db
            .insert(users)
            .values({
              uid: decodedFirebase.uid,
              username: decodedFirebase.email?.split('@')[0] || `user_${Date.now()}`,
              email: decodedFirebase.email || null,
              fullName: decodedFirebase.name || 'Clinic Doctor',
              role: 'doctor',
              isActive: true,
              joiningDate: new Date().toISOString().split('T')[0],
            })
            .returning();
          foundUser = created;
        }

        if (!foundUser.isActive) {
          return res.status(403).json({ error: 'Account is deactivated. Contact administrator.' });
        }

        req.user = {
          id: foundUser.id,
          uid: foundUser.uid,
          username: foundUser.username,
          fullName: foundUser.fullName,
          role: foundUser.role as any,
          email: foundUser.email,
          phone: foundUser.phone,
          isActive: foundUser.isActive,
          specialization: foundUser.specialization,
          qualifications: foundUser.qualifications,
          registrationNumber: foundUser.registrationNumber,
        };
        return next();
        }
      }
    } catch (fbErr) {
      console.error('Firebase token verification error:', fbErr);
    }

    return res.status(401).json({ error: 'Invalid or expired session token.' });
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Internal authentication error.' });
  }
}

export function requireRoles(...allowedRoles: ('main_doctor' | 'developer' | 'doctor')[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Permission denied. Required role: [${allowedRoles.join(', ')}], your role: [${req.user.role}]`,
      });
    }
    next();
  };
}

export async function logAudit(
  user: UserPayload | undefined,
  action: string,
  affectedRecord: string,
  details?: string
) {
  try {
    await db.insert(auditLogs).values({
      userId: user?.id || null,
      userRole: user?.role || 'system',
      action,
      affectedRecord,
      details: details || null,
    });
  } catch (e) {
    console.error('Failed to write audit log:', e);
  }
}
