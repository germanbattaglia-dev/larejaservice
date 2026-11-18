import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, writeBatch, collection } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function migrate() {
  console.log('Reading db.json...');
  const dbPath = path.join(process.cwd(), 'db.json');
  if (!fs.existsSync(dbPath)) {
    console.log('No db.json found');
    return;
  }

  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  const collections = ['products', 'orders', 'repairs', 'reviews'];
  for (const collectionName of collections) {
    if (data[collectionName] && Array.isArray(data[collectionName])) {
      console.log(`Migrating ${data[collectionName].length} items to ${collectionName}...`);
      const batch = writeBatch(db);
      for (const item of data[collectionName]) {
        const docRef = item.id ? doc(db, collectionName, String(item.id)) : doc(collection(db, collectionName));
        batch.set(docRef, item);
      }
      await batch.commit();
      console.log(`Migrated ${collectionName}`);
    }
  }

  const stringArrays = ['categories', 'applianceCategories'];
  for (const arrName of stringArrays) {
    if (data[arrName] && Array.isArray(data[arrName])) {
      console.log(`Migrating ${arrName}...`);
      await setDoc(doc(db, 'settings', arrName), { items: data[arrName] });
      console.log(`Migrated ${arrName}`);
    }
  }

  console.log('Migration complete!');
  process.exit(0);
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
