import { type FirebaseApp, initializeApp } from 'firebase/app';
import { type Firestore, getFirestore } from 'firebase/firestore';
import { type Auth, getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';

// Firebase configuration using Vite env variables (prefixed with VITE_)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// If any required env var is missing, treat as mock (no real Firebase connection)
export const isMock = !firebaseConfig.apiKey;

let app: FirebaseApp | undefined;
let db: Firestore | null = null;
let auth: Auth | null = null;

if (!isMock) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  // 새로고침해도 로그인 유지 (기본값이지만 명시)
  setPersistence(auth, browserLocalPersistence).catch((e) =>
    console.warn('auth persistence 설정 실패:', e),
  );
}

/** Firebase Auth 사용 가능 여부. false 면 예전 방식(학번만 입력)으로 동작한다. */
export const hasAuth = !isMock && !!auth;

export { db, auth };
