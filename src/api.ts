import { db, isMock } from './firebase';
import { collection, setDoc, getDocs, doc, query, where, deleteDoc, orderBy, getDoc } from 'firebase/firestore';
import type { Quiz } from './data';


/**
 * Firebase 미설정(=isMock) 시 사용하는 로컬 저장소.
 *
 * 예전에는 쓰기 함수들이 조용히 no-op 이라, 관리자 화면에서 "저장 성공!" 을 띄워도
 * 실제로는 아무것도 남지 않았다. Firebase 없이 개발/데모하려면 실제로 저장돼야 하므로
 * localStorage 에 보관한다. (새로고침해도 유지)
 */
const MOCK_KEYS = {
  progress: 'aim_mock_progress',
  quizzes: 'aim_mock_quizzes',
  students: 'aim_mock_students',
  announcements: 'aim_mock_announcements',
};

function mockRead<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}
function mockWrite<T>(key: string, rows: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch (e) {
    console.warn('mock 저장 실패(용량 초과 등):', e);
  }
}
/** id 기준 upsert */
function mockUpsert<T extends Record<string, any>>(key: string, row: T, idField = 'id') {
  const rows = mockRead<T>(key);
  const i = rows.findIndex((r) => r[idField] === row[idField]);
  if (i >= 0) rows[i] = row;
  else rows.push(row);
  mockWrite(key, rows);
}

const MOCK_DB = {
  get progress(): Progress[] {
    return mockRead<Progress>(MOCK_KEYS.progress);
  },
  set progress(rows: Progress[]) {
    mockWrite(MOCK_KEYS.progress, rows);
  },
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
  };
  // Firestore는 undefined 필드를 거부하므로 값이 있을 때만 추가
  if (cleanedResults && Object.keys(cleanedResults).length > 0) {
    data.detailedResults = cleanedResults;
  }

  try {
    if (isMock) {
      const rows = MOCK_DB.progress;
      const idx = rows.findIndex((p) => p.studentId === studentId && p.quizId === quizId);
      const existing = idx >= 0 ? rows[idx] : null;
      data.attempts = existing ? (existing.attempts || 1) + 1 : 1;
      data.bestScore = existing ? Math.max(existing.bestScore || existing.score || 0, score) : score;

      if (idx >= 0) rows[idx] = data;
      else rows.push(data);
      MOCK_DB.progress = rows;
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
      return MOCK_DB.progress.filter((p) => p.studentId === studentId);
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
      // saveScore가 기록하는 것과 동일한 저장소를 읽어야 함
      return [...MOCK_DB.progress].sort((a: Progress, b: Progress) => b.timestamp - a.timestamp);
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
      return MOCK_DB.progress.filter((p) => p.quizId === quizId);
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
    if (isMock) {
      return mockRead<Quiz>(MOCK_KEYS.quizzes).sort((a, b) => b.date.localeCompare(a.date));
    }
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
  if (isMock) { mockUpsert(MOCK_KEYS.quizzes, quiz); return; }
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

    // 모니터링 수준 (미설정 시 'log' 기본값)
    cleanedQuiz.proctoring = quiz.proctoring || 'log';

    // 남은 최상위 undefined 값 제거 (Firestore는 undefined 저장 불가)
    Object.keys(cleanedQuiz).forEach((k) => cleanedQuiz[k] === undefined && delete cleanedQuiz[k]);

    const docRef = doc(db, 'quizzes', quiz.id);
    await setDoc(docRef, cleanedQuiz);
  } catch (error) {
    console.error("Error saving quiz:", error);
    throw error;
  }
}

export async function deleteQuiz(quizId: string) {
  if (isMock) {
    mockWrite(MOCK_KEYS.quizzes, mockRead<Quiz>(MOCK_KEYS.quizzes).filter((q) => q.id !== quizId));
    return;
  }
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
    if (isMock) return mockRead<any>(MOCK_KEYS.students);
    if (!db) return [];
    const snap = await getDocs(collection(db, 'students'));
    return snap.docs.map(d => d.data());
  } catch (error) {
    console.error("Error getting students:", error);
    return [];
  }
}

export async function verifyStudent(studentId: string): Promise<any | null> {
  if (!studentId) return null;
  try {
    if (isMock) {
      return mockRead<any>(MOCK_KEYS.students).find((s) => s.id === studentId) || null;
    }
    if (!db) return null;
    const docRef = doc(db, 'students', studentId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (error) {
    console.error("Error verifying student:", error);
    return null;
  }
}

export async function saveStudent(student: { id: string, name: string, email?: string }) {
  const clean: any = { id: student.id, name: student.name };
  if (student.email && student.email.trim()) clean.email = student.email.trim();

  if (isMock) { mockUpsert(MOCK_KEYS.students, clean); return; }
  if (!db) return;
  try {
    // merge: 이미 가입한 팀원의 uid 를 관리자 수정 때 날려버리지 않도록
    await setDoc(doc(db, 'students', student.id), clean, { merge: true });
  } catch (error) {
    console.error("Error saving student:", error);
    throw error;
  }
}

export async function deleteStudent(id: string) {
  if (isMock) {
    mockWrite(MOCK_KEYS.students, mockRead<any>(MOCK_KEYS.students).filter((s) => s.id !== id));
    return;
  }
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
    if (isMock) {
      return mockRead<any>(MOCK_KEYS.announcements).sort((a, b) => b.date - a.date);
    }
    const q = query(collection(db, "announcements"), orderBy("date", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function saveAnnouncement(text: string) {
  if (isMock) {
    mockUpsert(MOCK_KEYS.announcements, { id: `ann-${Date.now()}`, text, date: Date.now() });
    return;
  }
  const newRef = doc(collection(db, 'announcements'));
  await setDoc(newRef, { text, date: Date.now() });
}

export async function deleteAnnouncement(id: string) {
  if (isMock) {
    mockWrite(MOCK_KEYS.announcements, mockRead<any>(MOCK_KEYS.announcements).filter((a) => a.id !== id));
    return;
  }
  await deleteDoc(doc(db, 'announcements', id));
}
