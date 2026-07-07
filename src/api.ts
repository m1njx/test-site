import { db, isMock } from './firebase';
import { collection, setDoc, getDocs, doc, query, where, deleteDoc, orderBy, getDoc } from 'firebase/firestore';
import type { Quiz } from './data';

import { ADMIN_ID } from './team';

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
  detailedResults?: Record<string, any>;
  bestScore?: number;
  attempts?: number;
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

export async function saveScore(studentId: string, quizId: string, score: number, total: number, detailedResults?: Record<string, any>) {
  if (!studentId || !quizId) return;
  if (studentId === ADMIN_ID) return;
  
  // Firestore 호환 데이터로 정제
  const cleanValue = (val: any): any => {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'boolean' || typeof val === 'number') return val;
    if (typeof val === 'string') {
      const cleaned = val.trim();
      // 너무 긴 문자열 자르기 (Firestore 한계 대비)
      return cleaned.length > 5000 ? cleaned.substring(0, 5000) : cleaned;
    }
    if (Array.isArray(val)) {
      return val.map(v => cleanValue(v)).filter(v => v !== undefined);
    }
    return undefined; // 객체나 다른 타입은 제거
  };

  const cleanedResults = detailedResults ? Object.fromEntries(
    Object.entries(detailedResults)
      .map(([k, v]) => [k, cleanValue(v)])
      .filter(([_, v]) => v !== undefined)
  ) : undefined;
  
  const data: Progress = { 
    studentId, 
    quizId, 
    score, 
    total, 
    timestamp: Date.now(), 
    detailedResults: Object.keys(cleanedResults || {}).length > 0 ? cleanedResults : undefined
  };
  
  try {
    if (isMock) {
      const idx = MOCK_DB.progress.findIndex((p: any) => p.studentId === studentId && p.quizId === quizId);
      const existing = idx >= 0 ? MOCK_DB.progress[idx] : null;
      data.attempts = existing ? (existing.attempts || 1) + 1 : 1;
      data.bestScore = existing ? Math.max(existing.bestScore || existing.score || 0, score) : score;
      
      if (idx >= 0) MOCK_DB.progress[idx] = data;
      else MOCK_DB.progress.push(data);
      return;
    }
    
    const docRef = doc(db, 'progress', `${studentId}_${quizId}`);
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      const existing = existingSnap.data() as Progress;
      data.attempts = (existing.attempts || 1) + 1;
      data.bestScore = Math.max(existing.bestScore || existing.score || 0, score);
    } else {
      data.attempts = 1;
      data.bestScore = score;
    }
    
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

export async function getAllProgress(): Promise<Progress[]> {
  try {
    if (isMock) {
      const stored = localStorage.getItem('aim_progress');
      return stored ? JSON.parse(stored) : [];
    }
    const q = query(collection(db, "progress"), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as Progress);
  } catch (error) {
    console.error("Error getting all progress:", error);
    return [];
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
    const cleanedQuiz: any = {
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
      })
    };
    
    // visibleTo는 값이 있을 때만 추가
    if (quiz.visibleTo && quiz.visibleTo.length > 0) {
      cleanedQuiz.visibleTo = quiz.visibleTo;
    }
    
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

export async function getAnnouncements(): Promise<{id: string, text: string, date: number}[]> {
  try {
    if (isMock) return [];
    const q = query(collection(db, "announcements"), orderBy("date", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function saveAnnouncement(text: string) {
  if (isMock) return;
  const newRef = doc(collection(db, 'announcements'));
  await setDoc(newRef, { text, date: Date.now() });
}

export async function deleteAnnouncement(id: string) {
  if (isMock) return;
  await deleteDoc(doc(db, 'announcements', id));
}
