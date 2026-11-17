import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let firebaseConfig: any = { projectId: 'basic-correlate-f01dl' };
try {
  firebaseConfig = require('../../firebase-applet-config.json');
} catch (e) {
  console.warn('Could not read firebase-applet-config.json, using fallback projectId:', e);
}

if (!getApps().length) {
  try {
    initializeApp({
      projectId: firebaseConfig.projectId,
    });
  } catch (e) {
    console.warn('Firebase admin initialization note:', e);
  }
}

let auth: any = null;
try {
  auth = getAuth();
} catch (e) {
  console.warn('Firebase admin getAuth note:', e);
}

export const adminAuth = auth;
