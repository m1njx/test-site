import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// TODO: 파이어베이스 프로젝트를 생성한 후 아래 설정값을 실제 값으로 변경해주세요!
const firebaseConfig = {
  apiKey: "AIzaSyDUwHZQwA7_1IaUIt7RFicO7GV6ekXhy0Q",
  authDomain: "test-site-666b3.firebaseapp.com",
  projectId: "test-site-666b3",
  storageBucket: "test-site-666b3.firebasestorage.app",
  messagingSenderId: "35645918205",
  appId: "1:35645918205:web:d25d2ba7afddb579432794",
  measurementId: "G-XQST0PCH8C"
};

export const isMock = firebaseConfig.apiKey === "YOUR_API_KEY";

let app;
let db: any = null;

if (!isMock) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export { db };
