import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let config: any = {};
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const configFile = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configFile);
  }
} catch (e) {
  console.warn('Could not read firebase-applet-config.json', e);
}

let app: any = null;
let firestoreDb: any = null;

try {
  if (getApps().length === 0) {
    app = initializeApp({
      projectId: config.projectId
    });
  } else {
    app = getApps()[0];
  }
  firestoreDb = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);
} catch (e) {
  console.warn('Firebase Admin fallback initialization notice:', e);
}

export const db = firestoreDb;

