const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'feisty-oath-j5fd2'
});
const db = getFirestore(app, 'ai-studio-weblarejarepuest-4241cd65-9ec6-46b1-9de7-463892642ef5');
db.collection('test').doc('test').set({test: 1}).then(() => console.log('success')).catch(console.error);
