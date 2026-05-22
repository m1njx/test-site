import { db, isMock } from './firebase';
import { collection, setDoc, getDocs, doc, query, where, deleteDoc } from 'firebase/firestore';
import type { Quiz } from './data';

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

export async function getQuizzes(): Promise<Quiz[]> {
  try {
    if (isMock) return [];
    if (!db) return [];
    
    const snap = await getDocs(collection(db, 'quizzes'));
    if (snap.empty) return [];
    return snap.docs.map(d => d.data() as Quiz).sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error("Error getting quizzes:", error);
    return [];
  }
}

export async function saveQuiz(quiz: Quiz) {
  if (isMock) return;
  if (!db) return;
  
  try {
    // Firestore에 저장하기 전에 undefined 값 제거
    const cleanedQuiz = {
      ...quiz,
      questions: quiz.questions.map(q => {
        const cleaned: any = {
          id: q.id,
          type: q.type,
          title: q.title || '',
          description: q.description || '',
          correctAnswers: q.correctAnswers || [],
          explanation: q.explanation || ''
        };
        // 선택적 필드는 undefined가 아닐 때만 추가
        if (q.options !== undefined) cleaned.options = q.options;
        if (q.setupCode !== undefined) cleaned.setupCode = q.setupCode;
        if (q.validationCode !== undefined) cleaned.validationCode = q.validationCode;
        if (q.level !== undefined) cleaned.level = q.level;
        return cleaned;
      }),
      visibleTo: quiz.visibleTo && quiz.visibleTo.length > 0 ? quiz.visibleTo : undefined
    };
    
    const docRef = doc(db, 'quizzes', quiz.id);
    await setDoc(docRef, cleanedQuiz);
  } catch (error) {
    console.error("Error saving quiz:", error);
    throw error;
  }
}

export async function deleteQuiz(quizId: string) {
  if (isMock) return;
  if (!db) return;
  
  try {
    const docRef = doc(db, 'quizzes', quizId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting quiz:", error);
    throw error;
  }
}

export async function getStudents(): Promise<any[]> {
  try {
    if (isMock) return [];
    if (!db) return [];
    const snap = await getDocs(collection(db, 'students'));
    return snap.docs.map(d => d.data());
  } catch (error) {
    console.error("Error getting students:", error);
    return [];
  }
}

export async function saveStudent(student: { id: string, name: string }) {
  if (isMock) return;
  if (!db) return;
  try {
    const docRef = doc(db, 'students', student.id);
    await setDoc(docRef, student);
  } catch (error) {
    console.error("Error saving student:", error);
    throw error;
  }
}

export async function deleteStudent(id: string) {
  if (isMock) return;
  if (!db) return;
  try {
    const docRef = doc(db, 'students', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting student:", error);
    throw error;
  }
}
