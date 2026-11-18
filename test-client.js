import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

const app = initializeApp({
  projectId: config.projectId,
  apiKey: config.apiKey,
  authDomain: config.authDomain
});

const db = getFirestore(app, config.firestoreDatabaseId);

setDoc(doc(db, 'test', 'test'), { test: 1 })
  .then(() => console.log('success'))
  .catch(console.error);
