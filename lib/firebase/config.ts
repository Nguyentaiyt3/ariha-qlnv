import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  Firestore,
} from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";
import { getStorage, FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

if (typeof window !== "undefined") {
  console.log("[Firebase] Config check:", {
    apiKey: firebaseConfig.apiKey ? firebaseConfig.apiKey.substring(0, 8) + "..." : "UNDEFINED",
    projectId: firebaseConfig.projectId || "UNDEFINED",
    authDomain: firebaseConfig.authDomain || "UNDEFINED",
  });
}

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let storage: FirebaseStorage;

function getFirebaseApp(): FirebaseApp {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  return app;
}

export function getDb(): Firestore {
  if (!db) {
    const firebaseApp = getFirebaseApp();
    const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID;

    try {
      // memoryLocalCache avoids IndexedDB state issues in dev (React Strict Mode + HMR)
      db = initializeFirestore(
        firebaseApp,
        { localCache: memoryLocalCache() },
        databaseId || undefined,
      );
    } catch {
      // initializeFirestore throws if called a second time — fall back to getFirestore
      db = databaseId ? getFirestore(firebaseApp, databaseId) : getFirestore(firebaseApp);
    }
  }
  return db;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    const app = getFirebaseApp();
    auth = getAuth(app);
  }
  return auth;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) {
    const app = getFirebaseApp();
    storage = getStorage(app);
  }
  return storage;
}
