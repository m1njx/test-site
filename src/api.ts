import { db, auth, isMock } from './firebase';
import { collection, setDoc, getDocs, doc, query, where, deleteDoc, orderBy, getDoc } from 'firebase/firestore';
import type { Quiz, QuizAnswerDocument } from './data';
import type { Student } from './team';

const SERVER_URL = (import.meta.env.VITE_VIDEO_SERVER_URL || '').replace(/\/$/, '');

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
  quizAnswers: 'aim_mock_quiz_answers',
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
function mockUpsert<T>(key: string, row: T, idField = 'id') {
  const rows = mockRead<T>(key);
  const i = rows.findIndex((r) => (r as Record<string, unknown>)[idField] === (row as Record<string, unknown>)[idField]);
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
  detailedResults?: Record<string, unknown>;
  bestScore?: number;
  attempts?: number;
  attemptId?: string;
  submissionToken?: string;
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

export interface SaveScoreOptions {
  deadline?: string;
  maxAttempts?: number;
  authoritativeScore?: number;
  authoritativeTotal?: number;
  attemptId?: string;
  submissionToken?: string;
}

export async function saveScore(
  studentId: string,
  quizId: string,
  score: number,
  total: number,
  detailedResults?: Record<string, unknown>,
  options?: SaveScoreOptions
) {
  if (!studentId || !quizId) return;
  
  // 점수 범위 및 타입 무결성 검증
  if (typeof score !== 'number' || typeof total !== 'number' || isNaN(score) || isNaN(total)) {
    throw new Error('점수와 총점은 유효한 숫자여야 합니다.');
  }
  if (score < 0 || total < 0 || score > total) {
    throw new Error(`유효하지 않은 점수 범위입니다 (점수: ${score}, 총점: ${total}).`);
  }

  // 공식 채점 결과와 점수 위변조 방지 검증 (TEST D)
  if (typeof options?.authoritativeScore === 'number' && score !== options.authoritativeScore) {
    throw new Error(`공식 채점 결과와 일치하지 않는 점수(${score}점)는 저장할 수 없습니다 (위변조 차단).`);
  }
  if (typeof options?.authoritativeTotal === 'number' && total !== options.authoritativeTotal) {
    throw new Error(`공식 채점 총점과 일치하지 않는 총점(${total}점)은 저장할 수 없습니다.`);
  }

  // 마감 기한 검증 (네트워크 지연 감안 1분 유예 허용)
  if (options?.deadline) {
    const rawDeadline = options.deadline.includes('T') ? options.deadline : `${options.deadline}T23:59:59`;
    const deadlineMs = new Date(rawDeadline).getTime();
    if (!isNaN(deadlineMs) && Date.now() > deadlineMs + 60 * 1000) {
      throw new Error('시험 마감 시간이 지나 성적을 저장할 수 없습니다.');
    }
  }

  // Firestore 호환 데이터로 정제
  const cleanValue = (val: unknown): unknown => {
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
      .filter(([, v]) => v !== undefined)
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
  if (options?.attemptId) {
    data.attemptId = options.attemptId;
  }
  if (options?.submissionToken) {
    data.submissionToken = options.submissionToken;
  }

  try {
    if (isMock) {
      const rows = MOCK_DB.progress;
      const idx = rows.findIndex((p) => p.studentId === studentId && p.quizId === quizId);
      const existing = idx >= 0 ? rows[idx] : null;
      const currentAttempts = existing?.attempts ?? (existing ? 1 : 0);

      // 최대 응시 횟수 검증
      if (options?.maxAttempts && currentAttempts >= options.maxAttempts) {
        throw new Error(`최대 응시 가능 횟수(${options.maxAttempts}회)를 초과했습니다.`);
      }

      data.attempts = currentAttempts + 1;
      data.bestScore = existing ? Math.max(existing.bestScore || existing.score || 0, score) : score;

      if (idx >= 0) rows[idx] = data;
      else rows.push(data);
      MOCK_DB.progress = rows;
      return;
    }
    
    if (!db) return;
    const docRef = doc(db, 'progress', `${studentId}_${quizId}`);
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      const existing = existingSnap.data() as Progress;
      const currentAttempts = existing.attempts ?? 1;

      // 최대 응시 횟수 검증
      if (options?.maxAttempts && currentAttempts >= options.maxAttempts) {
        throw new Error(`최대 응시 가능 횟수(${options.maxAttempts}회)를 초과했습니다.`);
      }

      data.attempts = currentAttempts + 1;
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
    if (!db) return [];
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
  if (isMock) {
    mockUpsert(MOCK_KEYS.quizzes, quiz);
    const mockAnswerDoc: QuizAnswerDocument = {
      quizId: quiz.id,
      updatedAt: Date.now(),
      questions: quiz.questions.map((q) => ({
        id: q.id,
        correctAnswers: q.correctAnswers || [],
        explanation: q.explanation || '',
        setupCode: q.setupCode || '',
        validationCode: q.validationCode || '',
      })),
    };
    mockUpsert(MOCK_KEYS.quizAnswers, mockAnswerDoc, 'quizId');
    return;
  }
  if (!db) return;
  
  try {
    // Firestore에 저장하기 전에 undefined 값 제거
    const cleanedQuiz: Record<string, unknown> = {
      ...quiz,
      questions: quiz.questions.map(q => {
        const cleaned: Record<string, unknown> = {
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

    // 정답 및 해설 분리 컬렉션(quizAnswers) 동기화 저장 (관리자만 접근 가능)
    const answersData: Record<string, unknown> = {
      quizId: quiz.id,
      updatedAt: Date.now(),
      questions: quiz.questions.map((q) => ({
        id: q.id,
        correctAnswers: q.correctAnswers || [],
        explanation: q.explanation || '',
        setupCode: q.setupCode || '',
        validationCode: q.validationCode || '',
      })),
    };
    await setDoc(doc(db, 'quizAnswers', quiz.id), answersData);

    // video-server 정답 키 저장소 동기화 (관리자 인증 기반, 번들 노출 토큰 분리)
    if (SERVER_URL) {
      try {
        const headers = await getAdminAuthHeaders();
        await fetch(`${SERVER_URL}/api/quiz-keys`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            quizId: quiz.id,
            title: quiz.title,
            description: quiz.description,
            deadline: quiz.deadline,
            maxAttempts: quiz.maxAttempts,
            isPublished: quiz.isPublished !== false,
            questions: quiz.questions,
          }),
        });
      } catch (err) {
        console.warn('Syncing quiz keys to video-server failed:', err);
      }
    }
  } catch (error) {
    console.error("Error saving quiz:", error);
    throw error;
  }
}

/** 관리자 전용 서버 인증 헤더 생성기 (VITE_VIDEO_UPLOAD_TOKEN 번들 노출 방지) */
async function getAdminAuthHeaders(adminTokenOrKey?: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminTokenOrKey) {
    headers['x-admin-key'] = adminTokenOrKey;
    return headers;
  }
  if (auth?.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
        return headers;
      }
    } catch {}
  }
  const viteAdminKey = (import.meta.env as Record<string, string | undefined>).VITE_ADMIN_API_KEY;
  if (viteAdminKey) {
    headers['x-admin-key'] = viteAdminKey;
  }
  return headers;
}

/**
 * 학생 답안을 서버에 전송하여 권위 있게 채점 (클라이언트 정답 노출 방지 및 멱등성 보장)
 */
export async function submitForServerGrading(
  quizId: string,
  answers: Record<string, unknown>,
  opts?: {
    studentId?: string;
    attemptId?: string;
    currentAttempts?: number;
    authToken?: string;
  }
): Promise<{
  ok: boolean;
  score: number;
  total: number;
  percentage?: number;
  results: Record<string, boolean>;
  detailedResults?: Record<string, unknown>;
  idempotent?: boolean;
  attemptId?: string;
  status?: string;
  submissionToken?: string;
} | null> {
  if (!SERVER_URL) return null;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let token = opts?.authToken;
    if (!token && auth?.currentUser) {
      token = await auth.currentUser.getIdToken().catch(() => undefined);
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${SERVER_URL}/api/grade-submission`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        quizId,
        answers,
        studentId: opts?.studentId,
        attemptId: opts?.attemptId,
        currentAttempts: opts?.currentAttempts,
      }),
    });
    if (res.ok) {
      return await res.json();
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `서버 채점 실패 (HTTP ${res.status})`);
  } catch (err) {
    console.warn('Server grading request error:', err);
    throw err;
  }
}

/**
 * 관리자 로그인/화면 진입 시 서버(Render Sleep/Wake 대비)에 퀴즈 정답 키 일괄 재동기화
 */
export async function syncAllQuizKeysToServer(quizzes: Quiz[], adminTokenOrKey?: string): Promise<boolean> {
  if (!SERVER_URL || !Array.isArray(quizzes) || quizzes.length === 0) return false;
  try {
    const headers = await getAdminAuthHeaders(adminTokenOrKey);
    const res = await fetch(`${SERVER_URL}/api/quiz-keys`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        quizzes: quizzes.map((q) => ({
          id: q.id,
          title: q.title,
          description: q.description,
          deadline: q.deadline,
          maxAttempts: q.maxAttempts,
          isPublished: q.isPublished !== false,
          questions: q.questions,
        })),
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Bulk sync to video-server failed:', err);
    return false;
  }
}

export async function deleteQuiz(quizId: string) {
  if (isMock) {
    mockWrite(MOCK_KEYS.quizzes, mockRead<Quiz>(MOCK_KEYS.quizzes).filter((q) => q.id !== quizId));
    mockWrite(MOCK_KEYS.quizAnswers, mockRead<QuizAnswerDocument>(MOCK_KEYS.quizAnswers).filter((a) => a.quizId !== quizId));
    return;
  }
  if (!db) return;
  
  try {
    const docRef = doc(db, 'quizzes', quizId);
    await deleteDoc(docRef);
    try {
      await deleteDoc(doc(db, 'quizAnswers', quizId));
    } catch {
      // 레거시 퀴즈의 경우 quizAnswers 문서가 없을 수 있음
    }
  } catch (error) {
    console.error("Error deleting quiz:", error);
    throw error;
  }
}

export async function getStudents(): Promise<Student[]> {
  try {
    if (isMock) return mockRead<Student>(MOCK_KEYS.students);
    if (!db) return [];
    const snap = await getDocs(collection(db, 'students'));
    return snap.docs.map(d => d.data() as Student);
  } catch (error) {
    console.error("Error getting students:", error);
    return [];
  }
}

export async function verifyStudent(studentId: string): Promise<Student | null> {
  if (!studentId) return null;
  try {
    if (isMock) {
      return mockRead<Student>(MOCK_KEYS.students).find((s) => s.id === studentId) || null;
    }
    if (!db) return null;
    const docRef = doc(db, 'students', studentId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as Student;
    }
    return null;
  } catch (error) {
    console.error("Error verifying student:", error);
    return null;
  }
}

export async function saveStudent(student: { id: string, name: string, email?: string }) {
  const clean: { id: string; name: string; email?: string } = { id: student.id, name: student.name };
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
    mockWrite(MOCK_KEYS.students, mockRead<Student>(MOCK_KEYS.students).filter((s) => s.id !== id));
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

export interface Announcement {
  id: string;
  text: string;
  date: number;
}

export async function getAnnouncements(): Promise<Announcement[]> {
  try {
    if (isMock) {
      return mockRead<Announcement>(MOCK_KEYS.announcements).sort((a, b) => b.date - a.date);
    }
    if (!db) return [];
    const q = query(collection(db, "announcements"), orderBy("date", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<Announcement, 'id'>) }));
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
  if (!db) return;
  const newRef = doc(collection(db, 'announcements'));
  await setDoc(newRef, { text, date: Date.now() });
}

export async function deleteAnnouncement(id: string) {
  if (isMock) {
    mockWrite(MOCK_KEYS.announcements, mockRead<Announcement>(MOCK_KEYS.announcements).filter((a) => a.id !== id));
    return;
  }
  if (!db) return;
  await deleteDoc(doc(db, 'announcements', id));
}
