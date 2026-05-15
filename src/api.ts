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
}

export async function saveScore(studentId: string, quizId: string, score: number, total: number) {
  if (!studentId || !quizId) return;
  if (studentId === 'admin') return; // Admin doesn't save scores
  
  const data: Progress = { studentId, quizId, score, total, timestamp: Date.now() };
  
  try {
    if (isMock) {
      const idx = MOCK_DB.progress.findIndex((p: any) => p.studentId === studentId && p.quizId === quizId);
      if (idx >= 0) MOCK_DB.progress[idx] = data;
      else MOCK_DB.progress.push(data);
      return;
    }
    
    const docRef = doc(db, 'progress', `${studentId}_${quizId}`);
    await setDoc(docRef, data);
  } catch (error) {
    console.error("Error saving score:", error);
    throw error;
  }
}

export async function getStudentProgress(studentId: string): Promise<Progress[]> {
  if (!studentId) return [];
  
  try {
    if (isMock) {
      return [...MOCK_DB.progress.filter((p: any) => p.studentId === studentId)];
    }
    
    if (!db) return [];
    const q = query(collection(db, 'progress'), where('studentId', '==', studentId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Progress);
  } catch (error) {
    console.error("Error getting student progress:", error);
    return [];
  }
}

export async function getQuizResults(quizId: string): Promise<Progress[]> {
  if (!quizId) return [];
  
  try {
    if (isMock) {
      return [...MOCK_DB.progress.filter((p: any) => p.quizId === quizId)];
    }
    
    if (!db) return [];
    const q = query(collection(db, 'progress'), where('quizId', '==', quizId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Progress);
  } catch (error) {
    console.error("Error getting quiz results:", error);
    return [];
  }
}
