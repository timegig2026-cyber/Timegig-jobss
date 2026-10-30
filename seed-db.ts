import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function seed() {
  try {
    await setDoc(doc(db, 'system', 'platform_stats'), {
      tenantProfit: 1250.50,
      userProfit: 450.75,
      totalReferrals: 0
    }, { merge: true });
    console.log('Database seeded successfully');
    process.exit(0);
  } catch (e) {
    console.error('Seeding failed:', e);
    process.exit(1);
  }
}

seed();
