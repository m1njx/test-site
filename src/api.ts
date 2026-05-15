import { db, isMock } from './firebase';
import { collection, setDoc, getDocs, doc, query, where } from 'firebase/firestore';

// In-memory DB for when Firebase is not configured yet
const MOCK_DB: any = {
  progress: []
};

export interface Progress {
  studentId: string;
  quizId: string;
  score: number;
  total: number;
  timestamp: number;
  detailedResults?: Record<string, boolean>;
}

// Cache for Firebase results to improve performance
const FIREBASE_CACHE: {
  progress: Record<string, { data: Progress[], timestamp: number }>,
  quizResults: Record<string, { data: Progress[], timestamp: number }>
} = {
  progress: {},
  quizResults: {}
};

const CACHE_TTL = 1000 * 30; // 30 seconds cache

export async function saveScore(studentId: string, quizId: string, score: number, total: number, detailedResults?: Record<string, boolean>) {
  if (!studentId || !quizId) return;
  if (studentId === 'admin') return;
  
  const data: Progress = { studentId, quizId, score, total, timestamp: Date.now(), detailedResults };
  
  try {
    if (isMock) {
      const idx = MOCK_DB.progress.findIndex((p: any) => p.studentId === studentId && p.quizId === quizId);
      if (idx >= 0) MOCK_DB.progress[idx] = data;
      else MOCK_DB.progress.push(data);
      return;
    }
    
    const docRef = doc(db, 'progress', `${studentId}_${quizId}`);
    await setDoc(docRef, data);

    // Invalidate/Update cache
    delete FIREBASE_CACHE.progress[studentId];
    delete FIREBASE_CACHE.quizResults[quizId];
  } catch (error) {
    console.error("Error saving score:", error);
    throw error;
  }
}

export async function getStudentProgress(studentId: string): Promise<Progress[]> {
  if (!studentId) return [];
  
  // Return cached data if available and fresh
  const cached = FIREBASE_CACHE.progress[studentId];
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  try {
    if (isMock) {
      return [...MOCK_DB.progress.filter((p: any) => p.studentId === studentId)];
    }
    
    if (!db) return [];
    const q = query(collection(db, 'progress'), where('studentId', '==', studentId));
    const snap = await getDocs(q);
    const data = snap.docs.map(d => d.data() as Progress);
    
    // Update cache
    FIREBASE_CACHE.progress[studentId] = { data, timestamp: Date.now() };
    return data;
  } catch (error) {
    console.error("Error getting student progress:", error);
    return cached ? cached.data : [];
  }
}

export async function getQuizResults(quizId: string): Promise<Progress[]> {
  if (!quizId) return [];
  
  const cached = FIREBASE_CACHE.quizResults[quizId];
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  try {
    if (isMock) {
      return [...MOCK_DB.progress.filter((p: any) => p.quizId === quizId)];
    }
    
    if (!db) return [];
    const q = query(collection(db, 'progress'), where('quizId', '==', quizId));
    const snap = await getDocs(q);
    const data = snap.docs.map(d => d.data() as Progress);
    
    FIREBASE_CACHE.quizResults[quizId] = { data, timestamp: Date.now() };
    return data;
  } catch (error) {
    console.error("Error getting quiz results:", error);
    return cached ? cached.data : [];
  }
}
