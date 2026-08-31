import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, AlertCircle, CheckCircle2, Loader2, Calendar, ArrowRight, Home, LogOut, Shield, Moon, Sun, Clock, ChevronDown, ChevronUp, Check, WifiOff } from 'lucide-react';
import { quizzes, type Quiz } from './data';
import { type Student } from './team';
import { observeSession, signOutUser, type SessionUser } from './session';
import { hasAuth } from './firebase';
import { saveScore, getStudentProgress, getQuizzes, getStudents, getAnnouncements, type Progress } from './api';
import Login from './Login';
import Admin from './Admin';
import CourseHome from './lms/CourseHome';
import CoursePlayer, { type QuizLessonContext } from './lms/CoursePlayer';
import ProctorShell from './lms/ProctorShell';
import type { Course, LessonProgress } from './lms/types';
import { getCourses, getLessonProgress, markQuizLesson, createProctorSession, finishProctorSession } from './lms/lmsApi';
import { verifyAdminPassword } from './auth';
import './index.css';

const genId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * 저장된 답안을 사람이 읽을 수 있는 형태로.
 * 객관식 답안은 보기 "인덱스"로 저장되므로, 그대로 보여주면
 * 학생에게 "내 답변: 0, 2" 같은 의미 없는 숫자가 보인다.
 */
export function formatAnswer(
  q: { type: string; options?: string[] } | undefined,
  ans: string | string[] | undefined,
): string {
  if (ans === undefined || ans === null || (Array.isArray(ans) && ans.length === 0)) return '(없음)';
  if (!q || q.type === 'short') return String(ans);
  const idxs = Array.isArray(ans) ? ans : [ans];
  return idxs
    .map((i) => {
      const opt = q.options?.[parseInt(String(i), 10)];
      return opt !== undefined && opt !== '' ? opt : `보기 ${parseInt(String(i), 10) + 1}`;
    })
    .join(', ');
}

declare global {
  interface Window {
    loadPyodide: (config?: any) => Promise<any>;
  }
}

import { gradeWithGemini } from './gemini';

const CodeEditor = ({ value, onChange, placeholder }: { value: string, onChange: (val: string) => void, placeholder?: string }) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      onChange(value.substring(0, start) + '  ' + value.substring(end));
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  const lineCount = (value.match(/\n/g) || []).length + 1;
  const lines = Array.from({ length: Math.max(10, lineCount) }, (_, i) => i + 1);

  return (
    <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 20, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '20px 10px', background: 'var(--bg-color)', borderRight: '1px solid var(--border)', color: 'var(--text-tertiary)', textAlign: 'right', fontFamily: 'monospace', fontSize: 16, userSelect: 'none', minHeight: 200, lineHeight: '1.5' }}>
        {lines.map(n => <div key={n} style={{ lineHeight: '1.5' }}>{n}</div>)}
      </div>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        style={{
          flex: 1, padding: 20, border: 'none', fontSize: 16, fontFamily: 'monospace',
          background: 'transparent', outline: 'none', resize: 'vertical', minHeight: 200, lineHeight: '1.5', whiteSpace: 'pre'
        }}
      />
    </div>
  );
};

export default function App() {
  // 세션은 Firebase Auth 가 관리한다. (Mock 환경에서는 localStorage 기반으로 흉내)
  const [session, setSession] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [sessionNonce, setSessionNonce] = useState(0);

  useEffect(() => {
    const unsub = observeSession((u) => {
      setSession(u);
      setAuthReady(true);
    });
    return unsub;
  }, [sessionNonce]);

  const loggedInUser = session?.studentId ?? null;
  /** 관리자 여부는 Firestore 의 admins/{uid} 문서로 판정된다 (클라이언트에서 위조 불가) */
  const isAdminUser = session?.isAdmin ?? false;


  const [currentView, setCurrentView] = useState<'home' | 'quiz' | 'admin' | 'course'>('home');
  const [dynamicQuizzes, setDynamicQuizzes] = useState<Quiz[]>(quizzes);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [courseCtx, setCourseCtx] = useState<QuizLessonContext | null>(null);
  const [quizOrigin, setQuizOrigin] = useState<'home' | 'course'>('home');
  const [proctorSessionId, setProctorSessionId] = useState<string | null>(null);
  const [proctorMode, setProctorMode] = useState<'log' | 'strict'>('log');
  const [dynamicTeam, setDynamicTeam] = useState<Student[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<Record<string, any>>({});
  const [pyodide, setPyodide] = useState<any>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [gradingProgress, setGradingProgress] = useState<{done: number, total: number} | null>(null);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [studentProgress, setStudentProgress] = useState<Progress[]>([]);
  const [expandedAnswers, setExpandedAnswers] = useState<Record<string, boolean>>({});

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('aim_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showOnlyWrong, setShowOnlyWrong] = useState(false);
  const [showWrongNotes, setShowWrongNotes] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark');
      localStorage.setItem('aim_theme', 'dark');
    } else {
      document.body.classList.remove('dark');
      localStorage.setItem('aim_theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    let timerId: ReturnType<typeof setInterval>;
    if (currentView === 'quiz' && timeLeft !== null && timeLeft > 0 && !showResults && !isGrading) {
      timerId = setInterval(() => {
        setTimeLeft(prev => {
          if (prev && prev <= 1) {
            clearInterval(timerId);
            setShouldAutoSubmit(true);
            return 0;
          }
          return prev ? prev - 1 : 0;
        });
      }, 1000);
    }
    return () => clearInterval(timerId);
  }, [currentView, timeLeft, showResults, isGrading]);

  // gradeQuiz 는 아래(early return 뒤)에서 선언되므로 직접 참조하면 TDZ 위험이 있다.
  // ref 로 최신 구현을 넘겨받아 호출한다.
  const gradeQuizRef = useRef<null | (() => Promise<void>)>(null);

  useEffect(() => {
    if (shouldAutoSubmit) {
      setShouldAutoSubmit(false);
      alert("제한 시간이 초과되었습니다. 자동으로 답안을 제출합니다.");
      gradeQuizRef.current?.();
    }
  }, [shouldAutoSubmit]);

  const loadTeam = async () => {
    const students = await getStudents();
    setDynamicTeam(students);
  };

  const loadQuizzes = async () => {
    const qs = await getQuizzes();
    setDynamicQuizzes(() => {
      const merged = [...qs];
      quizzes.forEach(sq => {
        if (!merged.find(mq => mq.id === sq.id)) merged.push(sq);
      });
      return merged.sort((a, b) => {
        const pubA = a.isPublished !== false;
        const pubB = b.isPublished !== false;
        if (pubA !== pubB) return pubA ? -1 : 1;
        return b.date.localeCompare(a.date);
      });
    });
  };

  const [announcements, setAnnouncements] = useState<{id: string, text: string, date: number}[]>([]);

  const loadAnnouncements = async () => {
    const data = await getAnnouncements();
    setAnnouncements(data);
  };

  const loadCourses = useCallback(async () => {
    setCourses(await getCourses());
  }, []);

  const loadLessonProgress = useCallback(async () => {
    if (loggedInUser && !isAdminUser) {
      setLessonProgress(await getLessonProgress(loggedInUser));
    } else {
      setLessonProgress([]);
    }
  }, [loggedInUser]);

  useEffect(() => {
    loadQuizzes();
    loadAnnouncements();
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    loadLessonProgress();
  }, [loadLessonProgress]);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [checkingPassword, setCheckingPassword] = useState(false);

  const enterAdmin = () => {
    // Firebase Auth 사용 시 관리자 권한은 이미 서버(admins/{uid})에서 확인됐다.
    // 클라이언트 비밀번호 모달은 Auth 가 없는 Mock 환경에서만 의미가 있다.
    if (hasAuth) {
      loadTeam();
      setCurrentView('admin');
      return;
    }
    setShowPasswordModal(true);
    setAdminPassword('');
    setPasswordError('');
  };

  const handlePasswordSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (checkingPassword) return;
    setCheckingPassword(true);
    setPasswordError('');
    try {
      const res = await verifyAdminPassword(adminPassword);
      if (res.ok) {
        setShowPasswordModal(false);
        setAdminPassword('');
        loadTeam();
        setCurrentView('admin');
      } else if (res.reason === 'locked') {
        setPasswordError(`시도 횟수를 초과했습니다. ${Math.ceil(res.remainingMs / 60000)}분 후 다시 시도해주세요.`);
        setAdminPassword('');
      } else if (res.reason === 'unconfigured') {
        setPasswordError('관리자 비밀번호가 설정되지 않았습니다. (.env 의 VITE_ADMIN_PASSWORD_HASH 확인)');
      } else {
        setPasswordError(`비밀번호가 틀렸습니다. (남은 시도 ${res.attemptsLeft}회)`);
        setAdminPassword('');
      }
    } finally {
      setCheckingPassword(false);
    }
  };

  // Pyodide(수십 MB)는 주관식 채점 fallback 에만 쓰이므로 필요할 때 한 번만 받는다.
  const pyodidePromise = useRef<Promise<any> | null>(null);
  const ensurePyodide = useCallback(async (): Promise<any | null> => {
    if (pyodide) return pyodide;
    if (!pyodidePromise.current) {
      pyodidePromise.current = (async () => {
        // index.html 의 로더 스크립트가 아직 준비되지 않았을 수 있어 잠시 기다린다
        for (let i = 0; i < 20 && !window.loadPyodide; i++) {
          await new Promise((r) => setTimeout(r, 250));
        }
        if (!window.loadPyodide) throw new Error('Pyodide loader unavailable');
        return window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/' });
      })();
    }
    try {
      const p = await pyodidePromise.current;
      setPyodide(p);
      return p;
    } catch (err) {
      console.error('Pyodide init error:', err);
      pyodidePromise.current = null;
      return null;
    }
  }, [pyodide]);

  // 주관식이 포함된 퀴즈를 시작하면 미리 데워둔다 (제출 시 대기 시간 감소)
  useEffect(() => {
    if (currentView === 'quiz' && selectedQuiz?.questions.some(q => q.type === 'short')) {
      ensurePyodide();
    }
  }, [currentView, selectedQuiz, ensurePyodide]);

  const fetchProgress = useCallback(async () => {
    if (loggedInUser && !isAdminUser) {
      const p = await getStudentProgress(loggedInUser);
      setStudentProgress(p);
    }
  }, [loggedInUser]);

  useEffect(() => {
    if (loggedInUser && currentView === 'home') {
      fetchProgress();
    }
  }, [loggedInUser, currentView, fetchProgress]);

  // 네트워크 끊김 감지 — 오프라인 상태에서는 저장/채점이 실패하므로 미리 알린다
  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // 퀴즈 답안 자동 저장 (early-return 위에 있어야 Hook 순서가 안정적)
  useEffect(() => {
    if (selectedQuiz && loggedInUser && Object.keys(answers).length > 0) {
      localStorage.setItem(`aim_quiz_answers_${selectedQuiz.id}_${loggedInUser}`, JSON.stringify(answers));
    }
  }, [answers, selectedQuiz, loggedInUser]);

  if (!authReady) {
    return (
      <div className="app-container" style={{background: 'transparent', boxShadow: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh'}}>
        <Loader2 className="animate-spin" size={28} color="var(--primary)" />
      </div>
    );
  }

  if (!loggedInUser) return <Login onLogin={() => setSessionNonce(n => n + 1)} />;

  const startQuiz = async (quiz: Quiz, ctx?: QuizLessonContext) => {
    if (quiz.questions.length === 0) return;

    setCourseCtx(ctx ?? null);
    setQuizOrigin(ctx ? 'course' : 'home');

    // 부정행위 모니터링 수준 결정
    //  - 코스 퀴즈 레슨: ctx.proctored(boolean) → strict / off
    //  - 단독 퀴즈: quiz.proctoring ('off' | 'log' | 'strict', 기본 'log')
    //  - 관리자는 항상 off
    const rawMode: 'off' | 'log' | 'strict' = ctx
      ? (ctx.proctored ? 'strict' : 'off')
      : (quiz.proctoring || 'log');
    const mode: 'off' | 'log' | 'strict' = isAdminUser ? 'off' : rawMode;
    setProctorMode(mode === 'strict' ? 'strict' : 'log');

    if (mode !== 'off' && loggedInUser) {
      try {
        const sid = await createProctorSession({
          id: genId(),
          studentId: loggedInUser,
          studentName: session?.name,
          quizId: quiz.id,
          quizTitle: quiz.title,
          courseId: ctx?.courseId,
          lessonId: ctx?.lessonId,
        });
        setProctorSessionId(sid);
      } catch (e) {
        console.warn('proctor session create failed', e);
        setProctorSessionId(null);
      }
    } else {
      setProctorSessionId(null);
    }

    let quizToStart = quiz;
    if (quiz.shuffleQuestions) {
      const shuffled = [...quiz.questions].sort(() => Math.random() - 0.5);
      quizToStart = { ...quiz, questions: shuffled };
    }
    
    setSelectedQuiz(quizToStart);
    setCurrentQuestionIdx(0);
    
    const savedKey = `aim_quiz_answers_${quizToStart.id}_${loggedInUser}`;
    const saved = localStorage.getItem(savedKey);
    if (saved) {
      try {
        setAnswers(JSON.parse(saved));
      } catch (e) {
        setAnswers({});
      }
    } else {
      setAnswers({});
    }
    
    if (quizToStart.timeLimit) {
      setTimeLeft(quizToStart.timeLimit * 60);
    } else {
      setTimeLeft(null);
    }
    
    setResults({});
    setShowResults(false);
    setCurrentView('quiz');
  };

  const goHome = () => {
    // 제출 없이 나가는 경우 세션을 미제출로 종료
    if (proctorSessionId && !showResults) {
      finishProctorSession(proctorSessionId, { submitted: false });
    }
    setProctorSessionId(null);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    setSelectedQuiz(null);
    if (quizOrigin === 'course' && selectedCourse) {
      loadLessonProgress();
      setCurrentView('course');
    } else {
      setCourseCtx(null);
      setCurrentView('home');
    }
  };

  const handleLogout = async () => {
    await signOutUser();
    setSession(null);
    setStudentProgress([]);
    setLessonProgress([]);
    setSelectedQuiz(null);
    setSelectedCourse(null);
    setCurrentView('home');
    setSessionNonce(n => n + 1);
  };

  const resetQuiz = async () => {
    setCurrentQuestionIdx(0);
    setAnswers({});
    setResults({});
    setShowResults(false);
    setExpandedAnswers({});
    if (selectedQuiz && loggedInUser) {
      localStorage.removeItem(`aim_quiz_answers_${selectedQuiz.id}_${loggedInUser}`);
    }
    // 재응시: 새 모니터링 세션 시작 (직전 응시와 동일한 수준)
    const rawMode: 'off' | 'log' | 'strict' = courseCtx
      ? (courseCtx.proctored ? 'strict' : 'off')
      : (selectedQuiz?.proctoring || 'log');
    const mode: 'off' | 'log' | 'strict' = isAdminUser ? 'off' : rawMode;
    setProctorMode(mode === 'strict' ? 'strict' : 'log');
    if (mode !== 'off' && selectedQuiz && loggedInUser) {
      try {
        const sid = await createProctorSession({
          id: genId(),
          studentId: loggedInUser,
          studentName: session?.name,
          quizId: selectedQuiz.id,
          quizTitle: selectedQuiz.title,
          courseId: courseCtx?.courseId,
          lessonId: courseCtx?.lessonId,
        });
        setProctorSessionId(sid);
      } catch { setProctorSessionId(null); }
    }
    if (selectedQuiz?.timeLimit) setTimeLeft(selectedQuiz.timeLimit * 60);
  };

  const gradeQuiz = async () => {
    if (isGrading) return; // 자동 제출과 수동 제출이 겹쳐 두 번 채점되는 것 방지
    setIsGrading(true);
    const gradingResults: Record<string, boolean> = {};
    const fullResults: Record<string, any> = {};
    let correctCount = 0;
    const questions = selectedQuiz!.questions;
    setGradingProgress({ done: 0, total: questions.length });

    // 객관식은 즉시 로컬 채점하고, AI 호출이 필요한 부분만 병렬로 처리한다.
    // (직렬 호출 시 문항 수 × 최대 15초까지 걸려 제출이 사실상 멈춘 것처럼 보였다)
    let done = 0;
    const bump = () => { done++; setGradingProgress({ done, total: questions.length }); };

    const gradeOne = async (q: typeof questions[number]) => {
      const userAns = answers[q.id];
      const isBlank = q.type === 'short'
        ? !(typeof userAns === 'string' && userAns.trim())
        : !(Array.isArray(userAns) && userAns.length > 0);
      if (isBlank) { gradingResults[q.id] = false; bump(); return; }

      if (q.type === 'short') {
        const u = typeof userAns === 'string' ? userAns : '';
        let graded = false;
        try {
          const geminiResult = await gradeWithGemini(q, u);
          gradingResults[q.id] = geminiResult.isCorrect;
          fullResults[`reason_${q.id}`] = geminiResult.reason;
          if (geminiResult.correctAnswer) fullResults[`ai_ans_${q.id}`] = geminiResult.correctAnswer;
          if (geminiResult.explanation) fullResults[`ai_exp_${q.id}`] = geminiResult.explanation;
          graded = true;
        } catch (e) {
          console.warn("Gemini grading failed, falling back to Pyodide:", e);
        }

        if (!graded) {
          const py = pyodide || (await ensurePyodide());
          if (py) {
            try {
              py.runPython(`locals().clear()`);
              if (q.setupCode) py.runPython(q.setupCode);
              let userRes = null;
              try { userRes = py.runPython(u); } catch (err) { console.log(`Execution error in Q${q.id}:`, err); }
              py.globals.set('_user_result', userRes);
              const isCorrect = py.runPython(q.validationCode || 'False');
              gradingResults[q.id] = isCorrect === true;
            } catch (err) {
              gradingResults[q.id] = false;
            }
          } else {
            // 채점 수단이 모두 실패 — 오답 처리 대신 사유를 남긴다
            gradingResults[q.id] = false;
            fullResults[`reason_${q.id}`] = '자동 채점에 실패했습니다. 관리자에게 문의해주세요.';
          }
        }
      } else if (q.type === 'multiple' || q.type === 'multiple-multi') {
        const u = Array.isArray(userAns) ? userAns : [userAns as string];
        const correct = q.correctAnswers || [];
        gradingResults[q.id] =
          u.length === correct.length &&
          [...u].sort().join(',') === [...correct].sort().join(',');

        try {
          const userSelectedTexts = u.map(idx => q.options?.[parseInt(idx)] || '').join(', ');
          const correctTexts = correct.map(idx => q.options?.[parseInt(idx)] || '').join(', ');
          const geminiResult = await gradeWithGemini(q, `학생이 선택한 보기: ${userSelectedTexts} (실제 정답 보기: ${correctTexts})`);
          fullResults[`reason_${q.id}`] = geminiResult.reason;
          if (geminiResult.explanation) fullResults[`ai_exp_${q.id}`] = geminiResult.explanation;
        } catch (e) {
          console.warn("Gemini explanation failed for multiple-choice:", e);
        }
      } else {
        gradingResults[q.id] = false;
      }
      bump();
    };

    await Promise.all(questions.map(gradeOne));
    correctCount = questions.reduce((n, q) => (gradingResults[q.id] ? n + 1 : n), 0);

    Object.assign(fullResults, gradingResults);
    questions.forEach(q => {
      fullResults[`ans_${q.id}`] = answers[q.id];
    });

    setResults(fullResults);

    try {
      if (!isAdminUser) {
        await saveScore(loggedInUser!, selectedQuiz!.id, correctCount, questions.length, fullResults);
        await fetchProgress();
      }
      localStorage.removeItem(`aim_quiz_answers_${selectedQuiz!.id}_${loggedInUser}`);
    } catch (e) { alert("결과 저장 실패"); }

    // 코스 퀴즈 레슨이면 이수 여부 기록
    if (courseCtx && loggedInUser && !isAdminUser) {
      try {
        await markQuizLesson({
          studentId: loggedInUser,
          courseId: courseCtx.courseId,
          lessonId: courseCtx.lessonId,
          score: correctCount,
          total: questions.length,
          passScore: courseCtx.passScore,
          attemptId: proctorSessionId ?? undefined,
        });
        await loadLessonProgress();
      } catch (e) { console.warn('markQuizLesson failed', e); }
    }

    // 부정행위 세션 종료
    if (proctorSessionId) {
      try {
        await finishProctorSession(proctorSessionId, { submitted: true, score: correctCount, total: questions.length });
      } catch (e) { console.warn('finishProctorSession failed', e); }
    }

    setIsGrading(false);
    setGradingProgress(null);
    setShowResults(true);
  };
  gradeQuizRef.current = gradeQuiz;

  // Helper variables for Home view
  const visibleQuizzes = dynamicQuizzes.filter(q => {
    if (isAdminUser) return true;
    if (!q.visibleTo || q.visibleTo.length === 0) return true;
    return q.visibleTo.includes(loggedInUser);
  });
  const validQuizzes = visibleQuizzes.filter(q => q.questions.length > 0);
  const uniqueCompletedQuizIds = new Set(studentProgress.map(p => p.quizId));
  const completedValidCount = validQuizzes.filter(q => uniqueCompletedQuizIds.has(q.id)).length;
  const completionRate = validQuizzes.length > 0 ? Math.min(100, Math.round((completedValidCount / validQuizzes.length) * 100)) : 0;

  // Helper variables for Quiz view
  const questions = selectedQuiz?.questions || [];
  const currentQuestion = questions[currentQuestionIdx];
  const totalQuestions = questions.length;
  const progress = totalQuestions > 0 ? ((currentQuestionIdx + 1) / totalQuestions) * 100 : 0;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : null;
  const isMultiSelect = currentQuestion?.type === 'multiple-multi';
  const isAnswered = currentQuestion ? (currentQuestion.type === 'short' ? !!(currentAnswer && (currentAnswer as string).trim()) : (Array.isArray(currentAnswer) && currentAnswer.length > 0)) : false;
  const answeredCount = questions.filter(q => {
    const a = answers[q.id];
    return q.type === 'short' ? !!(a && (a as string).trim()) : (Array.isArray(a) && a.length > 0);
  }).length;

  return (
    <div className="app-container" style={{background: 'transparent', boxShadow: 'none'}}>

      {isOffline && (
        <div role="status" style={{position: 'sticky', top: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', background: 'var(--incorrect)', color: '#fff', fontSize: 13, fontWeight: 700}}>
          <WifiOff size={16} /> 인터넷 연결이 끊겼습니다. 답안은 기기에 임시 저장되며, 연결 후 제출해주세요.
        </div>
      )}

      {isGrading && (
        <div style={{position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{background: 'var(--surface)', padding: 32, borderRadius: 24, textAlign: 'center', minWidth: 260, boxShadow: 'var(--shadow-lg)'}}>
            <Loader2 className="animate-spin" size={32} color="var(--primary)" style={{margin: '0 auto 16px'}} />
            <div style={{fontWeight: 800, fontSize: 17, marginBottom: 6}}>채점 중입니다</div>
            <div style={{fontSize: 13, color: 'var(--text-secondary)'}}>
              {gradingProgress ? `${gradingProgress.done} / ${gradingProgress.total} 문항 완료` : '잠시만 기다려주세요'}
            </div>
            {gradingProgress && gradingProgress.total > 0 && (
              <div style={{height: 6, background: 'var(--bg-color)', borderRadius: 3, overflow: 'hidden', marginTop: 14}}>
                <div style={{height: '100%', width: `${(gradingProgress.done / gradingProgress.total) * 100}%`, background: 'var(--primary)', transition: 'width 0.3s'}} />
              </div>
            )}
          </div>
        </div>
      )}

      {currentView === 'admin' && (
        <Admin onBack={() => setCurrentView('home')} dynamicQuizzes={dynamicQuizzes} onRefresh={loadQuizzes} dynamicTeam={dynamicTeam} onRefreshTeam={loadTeam} />
      )}

      {currentView === 'course' && selectedCourse && (
        <CoursePlayer
          course={selectedCourse}
          studentId={loggedInUser}
          isAdmin={isAdminUser}
          lessonProgress={lessonProgress}
          quizzesById={Object.fromEntries(dynamicQuizzes.map((q) => [q.id, q]))}
          onBack={() => { setSelectedCourse(null); setCurrentView('home'); loadLessonProgress(); }}
          onStartQuizLesson={(quiz, ctx) => { startQuiz(quiz, ctx); }}
          onVideoCompleted={loadLessonProgress}
        />
      )}

      {currentView === 'home' && (
        <div className="home-container" style={{paddingTop: 24}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24}}>
            <div style={{fontWeight: 700, color: 'var(--text-secondary)'}}>
              안녕하세요, <span style={{color: 'var(--primary)'}}>{session?.name || "로딩 중..."}</span>님
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
              <button onClick={() => setIsDarkMode(!isDarkMode)} style={{background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center'}}>
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button onClick={handleLogout} style={{background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4}}>
                <LogOut size={16} /> 로그아웃
              </button>
            </div>
          </div>

          {isAdminUser ? (
            <button onClick={enterAdmin} className="btn btn-primary" style={{width: '100%', marginBottom: 32, padding: 20}}>
              <Shield size={24} /> 관리자 대시보드 입장
            </button>
          ) : (
            <div style={{background: 'var(--surface)', padding: 24, borderRadius: 20, boxShadow: 'var(--shadow-sm)', marginBottom: 32}}>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 12}}>
                <span style={{fontWeight: 700}}>나의 완주율</span>
                <span style={{fontWeight: 800, color: 'var(--primary)'}}>{completionRate}%</span>
              </div>
              <div style={{height: 12, background: 'var(--bg-color)', borderRadius: 6, overflow: 'hidden'}}>
                <div style={{height: '100%', background: 'var(--primary)', width: `${completionRate}%`, transition: 'width 1s ease-out'}} />
              </div>
              
              <div style={{marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16}}>
                <button 
                  onClick={() => setShowHistory(!showHistory)}
                  style={{width: '100%', background: 'transparent', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 600, color: 'var(--text-secondary)', padding: '8px 0'}}
                >
                  내 성적 히스토리 보기 {showHistory ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <AnimatePresence>
                  {showHistory && (
                    <motion.div initial={{height: 0, opacity: 0}} animate={{height: 'auto', opacity: 1}} exit={{height: 0, opacity: 0}} style={{overflow: 'hidden'}}>
                      <div style={{marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12}}>
                        {studentProgress.length === 0 ? (
                          <div style={{textAlign: 'center', padding: 20, color: 'var(--text-tertiary)', fontSize: 14}}>아직 응시한 퀴즈가 없습니다.</div>
                        ) : (
                          studentProgress.sort((a, b) => b.timestamp - a.timestamp).map(p => {
                            const q = dynamicQuizzes.find(quiz => quiz.id === p.quizId);
                            if (!q) return null;
                            const rate = Math.round((p.bestScore ?? p.score) / p.total * 100);
                            return (
                              <div key={p.quizId} style={{padding: 16, background: 'var(--bg-color)', borderRadius: 12}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8}}>
                                  <span style={{fontWeight: 700, fontSize: 14}}>{q.title}</span>
                                  <span style={{fontWeight: 800, color: 'var(--primary)', fontSize: 14}}>{rate}% ({p.bestScore ?? p.score}/{p.total})</span>
                                </div>
                                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8}}>
                                  <span>응시일: {new Date(p.timestamp).toLocaleDateString()}</span>
                                  <span>응시 횟수: {p.attempts || 1}회</span>
                                </div>
                                <div style={{height: 6, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden'}}>
                                  <div style={{height: '100%', background: rate >= 80 ? 'var(--correct)' : (rate >= 50 ? 'var(--primary)' : 'var(--incorrect)'), width: `${rate}%`}} />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div style={{marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 16}}>
                <button 
                  onClick={() => setShowWrongNotes(!showWrongNotes)}
                  style={{width: '100%', background: 'transparent', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 600, color: 'var(--text-secondary)', padding: '8px 0'}}
                >
                  📝 나의 오답 노트 모아보기 {showWrongNotes ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <AnimatePresence>
                  {showWrongNotes && (
                    <motion.div initial={{height: 0, opacity: 0}} animate={{height: 'auto', opacity: 1}} exit={{height: 0, opacity: 0}} style={{overflow: 'hidden'}}>
                      <div style={{marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16}}>
                        {(() => {
                          const wrongItems: any[] = [];
                          studentProgress.forEach(p => {
                            if (!p.detailedResults) return;
                            const q = dynamicQuizzes.find(quiz => quiz.id === p.quizId);
                            if (!q) return;
                            
                            q.questions.forEach(question => {
                              if (p.detailedResults![question.id] === false) {
                                wrongItems.push({
                                  quizTitle: q.title,
                                  questionTitle: question.title,
                                  userAns: formatAnswer(question, p.detailedResults![`ans_${question.id}`]),
                                  correctAns: question.type !== 'short' ? formatAnswer(question, question.correctAnswers) : '',
                                  aiFeedback: p.detailedResults![`reason_${question.id}`]
                                });
                              }
                            });
                          });

                          if (wrongItems.length === 0) {
                            return <div style={{textAlign: 'center', padding: 20, color: 'var(--text-tertiary)', fontSize: 14}}>틀린 문제가 없습니다. 훌륭해요! 🎉</div>;
                          }

                          return wrongItems.map((item, i) => (
                            <div key={i} style={{padding: 16, background: 'var(--incorrect-soft)', border: '1px solid var(--incorrect)', borderRadius: 12}}>
                              <div style={{fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4}}>{item.quizTitle}</div>
                              <div style={{fontSize: 14, fontWeight: 700, marginBottom: 12}}>{item.questionTitle}</div>
                              <div style={{fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, padding: 8, background: 'var(--bg-color)', borderRadius: 8}}>
                                <strong>나의 답변:</strong> {item.userAns}
                                {item.correctAns && (
                                  <div style={{marginTop: 4, color: 'var(--correct)'}}><strong>정답:</strong> {item.correctAns}</div>
                                )}
                              </div>
                              {item.aiFeedback && (
                                <div style={{fontSize: 13, color: 'var(--incorrect)', fontWeight: 600, padding: 8, background: 'var(--incorrect-soft)', borderRadius: 8}}>
                                  <strong>AI 분석:</strong> {item.aiFeedback}
                                </div>
                              )}
                            </div>
                          ));
                        })()}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          <CourseHome
            courses={courses}
            lessonProgress={lessonProgress}
            studentId={loggedInUser}
            isAdmin={isAdminUser}
            onSelect={(c) => { setSelectedCourse(c); setCurrentView('course'); }}
          />

          <h1 className="home-title">일일 퀴즈 점검</h1>
          <p className="home-subtitle">날짜별로 할당된 문제를 풀고 실력을 점검하세요.</p>
          
          {announcements.length > 0 && (
            <div style={{background: 'linear-gradient(135deg, var(--primary-soft), var(--primary-soft))', border: '1px solid var(--primary-soft-strong)', padding: '16px 20px', borderRadius: 16, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12}}>
              <span style={{fontSize: 20}}>📢</span>
              <div style={{flex: 1}}>
                <div style={{fontSize: 14, fontWeight: 600, color: 'var(--primary)'}}>공지사항</div>
                <div style={{fontSize: 15, color: 'var(--text-primary)', marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap'}}>{announcements[0].text}</div>
              </div>
            </div>
          )}

          <div className="quiz-list">
            {visibleQuizzes.map((q) => {
              const p = studentProgress.find(p => p.quizId === q.id);
              const attempts = p?.attempts || (p ? 1 : 0);
              const isExhausted = q.maxAttempts ? attempts >= q.maxAttempts : false;
              const isCompleted = !!p;
              
              const isPastDeadline = q.deadline ? new Date(`${q.deadline}T23:59:59`).getTime() < Date.now() : false;
              const isNearDeadline = q.deadline && !isPastDeadline && !isCompleted ? new Date(`${q.deadline}T23:59:59`).getTime() - Date.now() < 24 * 60 * 60 * 1000 : false;
              
              const isLocked = q.questions.length === 0 || (q.isPublished === false && !isAdminUser) || (isExhausted && !isAdminUser) || (isPastDeadline && !isAdminUser);
              return (
                <div key={q.id} className={`quiz-card ${isLocked ? 'disabled' : ''}`} onClick={() => !isLocked && startQuiz(q)} style={isCompleted ? {borderColor: 'var(--correct)'} : {}}>
                  <div className="quiz-info">
                    <div className="quiz-date" style={{color: isLocked ? 'var(--text-tertiary)' : (isCompleted ? 'var(--correct)' : 'var(--primary)')}}>
                      <Calendar size={12} style={{display: 'inline', marginRight: 4}}/> {q.date} {isCompleted && '✓ 완료'} {q.isPublished === false && '(비공개)'} {isExhausted && '(횟수 초과)'} {isPastDeadline && '(마감됨)'}
                      {isAdminUser && q.visibleTo && q.visibleTo.length > 0 && (
                        <span style={{marginLeft: 8, padding: '2px 6px', background: 'var(--primary-soft)', color: 'var(--primary)', borderRadius: 6, fontSize: 10, fontWeight: 700}}>
                          대상: {q.visibleTo.length}명
                        </span>
                      )}
                      {q.deadline && !isPastDeadline && (
                        <span style={{marginLeft: 8, padding: '2px 6px', background: isNearDeadline ? 'var(--incorrect-soft)' : 'var(--muted-soft)', color: isNearDeadline ? 'var(--incorrect)' : 'var(--text-secondary)', borderRadius: 6, fontSize: 10, fontWeight: 700}}>
                          마감: {q.deadline} {isNearDeadline && '⚠️ 임박'}
                        </span>
                      )}
                    </div>
                    <h3 className="quiz-name">{q.title}</h3>
                    <p className="quiz-desc">{q.description}</p>
                    {isCompleted && (
                      <div style={{marginTop: 8, display: 'flex', gap: 12}}>
                        <p style={{fontSize: 12, fontWeight: 700, color: 'var(--correct)'}}>내 최고 점수: {p.bestScore ?? p.score} / {p.total}</p>
                        <p style={{fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)'}}>응시 횟수: {attempts} {q.maxAttempts ? `/ ${q.maxAttempts}` : ''}</p>
                      </div>
                    )}
                  </div>
                  <div className="quiz-action" style={{color: isCompleted ? 'var(--correct)' : undefined}}><ArrowRight size={20} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {currentView === 'quiz' && selectedQuiz && (
        <div className="quiz-view-container">
          {showResults ? (
            <div className="result-container" style={{padding: 24}}>
              <div className="result-header" style={{textAlign: 'center', marginBottom: 40}}>
                <h1 style={{fontSize: 28, fontWeight: 800, marginBottom: 16}}>평가 결과</h1>
                <div style={{fontSize: 48, fontWeight: 900, color: 'var(--primary)'}}>{questions.reduce((s, q) => (results[q.id] ? s + 1 : s), 0)} <span style={{fontSize: 20, color: 'var(--text-tertiary)'}}>/ {totalQuestions}</span></div>
                <button 
                  onClick={() => setShowOnlyWrong(!showOnlyWrong)} 
                  className={`btn ${showOnlyWrong ? 'btn-primary' : 'btn-secondary'}`}
                  style={{marginTop: 16, padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700}}
                >
                  {showOnlyWrong ? '전체 보기' : '오답만 보기'}
                </button>
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                {questions.filter(q => showOnlyWrong ? !results[q.id] : true).map((q, idx) => (
                  <div key={q.id} style={{padding: 20, background: 'var(--surface)', borderRadius: 16, border: results[q.id] ? '1px solid var(--correct)' : '1px solid var(--incorrect)'}}>
                    <div style={{display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12}}>
                      <span style={{background: results[q.id] ? 'var(--correct)' : 'var(--incorrect)', color: 'white', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700}}>Q{idx+1}</span>
                      <strong style={{fontSize: 16}}>{q.title}</strong>
                      {q.level === 2 && <span style={{fontSize: 11, padding: '2px 6px', background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 6, fontWeight: 700}}>🟡 보통</span>}
                      {q.level === 3 && <span style={{fontSize: 11, padding: '2px 6px', background: 'var(--incorrect-soft)', color: 'var(--incorrect)', borderRadius: 6, fontWeight: 700}}>🔴 심화</span>}
                      {(!q.level || q.level === 1) && <span style={{fontSize: 11, padding: '2px 6px', background: 'var(--correct-soft)', color: 'var(--correct)', borderRadius: 6, fontWeight: 700}}>🟢 기초</span>}
                      <div style={{marginLeft: 'auto'}}>
                        {results[q.id] ? <CheckCircle2 color="var(--correct)" size={20} /> : <AlertCircle color="var(--incorrect)" size={20} />}
                      </div>
                    </div>
                    <div style={{fontSize: 14, color: 'var(--text-secondary)', padding: 12, background: 'var(--bg-color)', borderRadius: 12}}>
                      <div style={{marginBottom: 8}}><strong style={{color: results[q.id] ? 'var(--correct)' : 'var(--incorrect)'}}>내 답변:</strong> {formatAnswer(q, answers[q.id])}</div>
                      {q.type !== 'short' && !results[q.id] && (
                        <div style={{marginBottom: 8}}><strong style={{color: 'var(--correct)'}}>정답:</strong> {formatAnswer(q, q.correctAnswers)}</div>
                      )}
                      
                      {results[`reason_${q.id}`] && (
                        <div style={{marginBottom: 8, color: results[q.id] ? 'var(--primary)' : 'var(--incorrect)', fontWeight: 600, display: 'flex', gap: 6, alignItems: 'flex-start'}}>
                          <span>🤖</span>
                          <div>
                            <span style={{fontWeight: 700}}>{results[q.id] ? 'AI 피드백: ' : 'AI 오답 분석: '}</span>
                            {results[`reason_${q.id}`]}
                          </div>
                        </div>
                      )}
                      
                      {(results[`ai_ans_${q.id}`] || results[`ai_exp_${q.id}`] || q.explanation) && (
                        <div style={{marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8}}>
                          <button
                            onClick={() => setExpandedAnswers(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--primary)',
                              fontWeight: 700,
                              fontSize: 13,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: 0,
                              outline: 'none'
                            }}
                          >
                            {expandedAnswers[q.id] ? '▲ 답안 및 해설 접기' : '▼ AI 모범 답안 및 해설 보기'}
                          </button>
                          
                          {expandedAnswers[q.id] && (
                            <div style={{marginTop: 8, fontSize: 13, color: 'var(--text-secondary)'}}>
                              {results[`ai_ans_${q.id}`] && (
                                <div style={{marginBottom: 8}}>
                                  <div style={{fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 2}}>모범 답안:</div>
                                  <pre style={{margin: 0, padding: 8, background: 'var(--surface)', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', overflowX: 'auto', border: '1px solid var(--border)'}}>
                                    {results[`ai_ans_${q.id}`]}
                                  </pre>
                                </div>
                              )}
                              {(results[`ai_exp_${q.id}`] || q.explanation) && (
                                <div>
                                  <div style={{fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 2}}>상세 해설:</div>
                                  <div style={{lineHeight: 1.5}}>{results[`ai_exp_${q.id}`] || q.explanation}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{display: 'flex', gap: 12, marginTop: 40}}>
                <button onClick={resetQuiz} className="btn btn-secondary" style={{flex: 1}}><RotateCcw size={20} /> 다시 풀기</button>
                <button onClick={goHome} className="btn btn-primary" style={{flex: 1}}><Home size={20} /> 홈으로</button>
              </div>
            </div>
          ) : (
            <ProctorShell active={!!proctorSessionId} sessionId={proctorSessionId} mode={proctorMode}>
              <header className="app-header" style={{padding: '20px 0'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
                  <button onClick={goHome} style={{background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--text-secondary)'}}><Home size={18} /> 나가기</button>
                  <div style={{fontWeight: 800, fontSize: 16}}>{selectedQuiz.title}</div>
                  {timeLeft !== null ? (
                    <motion.div 
                      animate={timeLeft <= 120 ? { scale: [1, 1.03, 1], opacity: [1, 0.8, 1] } : {}}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      style={{
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 6, 
                        fontWeight: 700, 
                        fontSize: 15, 
                        color: timeLeft <= 120 ? 'var(--incorrect)' : 'var(--text-secondary)',
                        background: timeLeft <= 120 ? 'var(--incorrect-soft)' : 'transparent',
                        padding: timeLeft <= 120 ? '4px 10px' : '0',
                        borderRadius: 8,
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <Clock size={16} />
                      <span>{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</span>
                    </motion.div>
                  ) : <div style={{width: 80}}></div>}
                </div>
                <div style={{height: 6, background: 'var(--bg-color)', borderRadius: 3, overflow: 'hidden'}}><div style={{height: '100%', background: 'var(--primary)', width: `${progress}%`, transition: 'width 0.3s'}} /></div>
                <div style={{display: 'flex', gap: 8, marginTop: 16, overflowX: 'auto', paddingBottom: 8}}>
                  {questions.map((q, idx) => {
                    const ans = answers[q.id];
                    const hasAns = q.type === 'short' ? !!(ans && (ans as string).trim()) : (Array.isArray(ans) && ans.length > 0);
                    return (
                      <button
                        key={q.id}
                        onClick={() => setCurrentQuestionIdx(idx)}
                        style={{
                          width: 32, height: 32, flexShrink: 0, borderRadius: '50%',
                          border: currentQuestionIdx === idx ? '2px solid var(--primary)' : (hasAns ? '1px solid var(--primary)' : '1px solid var(--border)'),
                          background: currentQuestionIdx === idx ? 'var(--primary)' : (hasAns ? 'var(--primary-soft)' : 'var(--surface)'),
                          color: currentQuestionIdx === idx ? '#fff' : (hasAns ? 'var(--primary)' : 'var(--text-secondary)'),
                          fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        {idx + 1}
                      </button>
                    )
                  })}
                </div>
              </header>
              <main style={{padding: '40px 0'}}>
                <h2 style={{fontSize: 22, fontWeight: 800, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12}}>
                  {currentQuestion.title}
                  {currentQuestion.level === 2 && <span style={{fontSize: 12, padding: '2px 6px', background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 6, fontWeight: 700}}>🟡 보통</span>}
                  {currentQuestion.level === 3 && <span style={{fontSize: 12, padding: '2px 6px', background: 'var(--incorrect-soft)', color: 'var(--incorrect)', borderRadius: 6, fontWeight: 700}}>🔴 심화</span>}
                  {(!currentQuestion.level || currentQuestion.level === 1) && <span style={{fontSize: 12, padding: '2px 6px', background: 'var(--correct-soft)', color: 'var(--correct)', borderRadius: 6, fontWeight: 700}}>🟢 기초</span>}
                </h2>
                {currentQuestion.type === 'short' ? (
                  <CodeEditor
                    value={(currentAnswer as string) || ''}
                    onChange={(val) => setAnswers(prev => ({...prev, [currentQuestion.id]: val}))}
                    placeholder="코드를 작성하세요..."
                  />
                ) : (
                  <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                    {isMultiSelect && (
                      <div style={{fontSize: 13, fontWeight: 700, color: 'var(--primary)', marginBottom: 4}}>
                        정답을 모두 고르세요 (복수 선택)
                      </div>
                    )}
                    {currentQuestion.options?.map((opt, idx) => {
                      const key = idx.toString();
                      const selectedArr = Array.isArray(currentAnswer) ? currentAnswer as string[] : [];
                      const selected = selectedArr.includes(key);
                      const toggle = () => {
                        // 복수정답 문항은 누를 때마다 토글, 단일정답은 교체
                        setAnswers(prev => {
                          const cur = Array.isArray(prev[currentQuestion.id])
                            ? (prev[currentQuestion.id] as string[])
                            : [];
                          const next = isMultiSelect
                            ? (cur.includes(key) ? cur.filter(v => v !== key) : [...cur, key])
                            : [key];
                          return { ...prev, [currentQuestion.id]: next };
                        });
                      };
                      return (
                        <button
                          key={idx}
                          onClick={toggle}
                          aria-pressed={selected}
                          style={{padding: 20, textAlign: 'left', borderRadius: 16, border: selected ? '2px solid var(--primary)' : '1px solid var(--border)', background: selected ? 'var(--primary-soft)' : 'var(--surface)', color: 'var(--text-primary)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12}}
                        >
                          <div style={{width: 20, height: 20, flexShrink: 0, borderRadius: isMultiSelect ? 6 : '50%', border: selected ? '2px solid var(--primary)' : '2px solid var(--border)', background: selected && isMultiSelect ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                            {selected && (isMultiSelect
                              ? <Check size={14} color="#fff" strokeWidth={3} />
                              : <div style={{width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)'}} />)}
                          </div>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}
              </main>
              <footer style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 40}}>
                <button onClick={() => setCurrentQuestionIdx(v => v - 1)} disabled={currentQuestionIdx === 0} className="btn btn-secondary">이전</button>
                {/* 미답변 문제도 건너뛸 수 있게 허용 — 제출 확인 모달에서 최종 확인한다 */}
                {!isAnswered && currentQuestionIdx < totalQuestions - 1 && (
                  <span style={{fontSize: 12, color: 'var(--text-tertiary)'}}>답을 비워두고 넘어갈 수 있어요</span>
                )}
                <button
                  onClick={() => currentQuestionIdx === totalQuestions - 1 ? setShowConfirmModal(true) : setCurrentQuestionIdx(v => v + 1)}
                  disabled={isGrading}
                  className="btn btn-primary"
                  style={{minWidth: 120, flex: 'none'}}
                >
                  {isGrading ? <Loader2 className="animate-spin" /> : (currentQuestionIdx === totalQuestions - 1 ? '제출하기' : '다음')}
                </button>
              </footer>
            </ProctorShell>
          )}
        </div>
      )}

      {showConfirmModal && selectedQuiz && (
          <motion.div
            key="confirm-modal"
            role="dialog"
            aria-modal="true"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.15}}
            style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)'}}
          >
            <motion.div initial={{scale: 0.9, opacity: 0}} animate={{scale: 1, opacity: 1}} exit={{scale: 0.9, opacity: 0}} style={{background: 'var(--surface)', padding: 40, borderRadius: 32, width: '100%', maxWidth: 400, textAlign: 'center', boxShadow: '0 24px 48px rgba(0,0,0,0.2)'}}>
              <h2 style={{fontSize: 24, fontWeight: 800, marginBottom: 12}}>답안 제출 확인</h2>
              <div style={{fontSize: 15, color: 'var(--text-secondary)', marginBottom: 24}}>
                총 {totalQuestions}문제 중 <strong style={{color: 'var(--primary)'}}>{answeredCount}</strong>문제의 답안을 작성했습니다.
              </div>

              {totalQuestions > answeredCount && (
                <div style={{background: 'var(--incorrect-soft)', padding: 16, borderRadius: 16, marginBottom: 24, textAlign: 'left'}}>
                  <div style={{fontSize: 13, fontWeight: 700, color: 'var(--incorrect)', marginBottom: 8}}><AlertCircle size={14} style={{display: 'inline', verticalAlign: 'text-bottom'}} /> 미답변 문제</div>
                  <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                    {questions.map((q, idx) => {
                      const ans = answers[q.id];
                      const hasAns = q.type === 'short' ? !!(ans && (ans as string).trim()) : (Array.isArray(ans) && ans.length > 0);
                      if (!hasAns) return <span key={q.id} style={{background: 'var(--incorrect)', color: 'white', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700}}>Q{idx + 1}</span>;
                      return null;
                    })}
                  </div>
                </div>
              )}
              
              <div style={{display: 'flex', gap: 16}}>
                <button type="button" onClick={() => setShowConfirmModal(false)} className="btn btn-secondary" style={{flex: 1, padding: 16}}>돌아가기</button>
                <button type="button" onClick={() => { setShowConfirmModal(false); gradeQuiz(); }} className="btn btn-primary" style={{flex: 1, padding: 16}}>제출하기</button>
              </div>
          </motion.div>
        </motion.div>
      )}

      {showPasswordModal && (
          <motion.div
            key="admin-modal"
            role="dialog"
            aria-modal="true"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.15}}
            style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)'}}
          >
            <motion.div initial={{scale: 0.9, opacity: 0}} animate={{scale: 1, opacity: 1}} exit={{scale: 0.9, opacity: 0}} style={{background: 'var(--surface)', padding: 40, borderRadius: 32, width: '100%', maxWidth: 400, textAlign: 'center', boxShadow: '0 24px 48px rgba(0,0,0,0.2)'}}>
              <h2 style={{fontSize: 24, fontWeight: 800, marginBottom: 12}}>관리자 인증</h2>
              <p style={{fontSize: 15, color: 'var(--text-secondary)', marginBottom: 32}}>보안을 위해 비밀번호를 입력해주세요.</p>
              <form onSubmit={handlePasswordSubmit}>
                <div style={{position: 'relative', marginBottom: passwordError ? 12 : 32}}>
                  <input
                    type="password"
                    autoFocus
                    aria-label="관리자 비밀번호"
                    value={adminPassword}
                    onChange={(e) => { setAdminPassword(e.target.value); setPasswordError(''); }}
                    style={{width: '100%', padding: '20px', borderRadius: 20, border: passwordError ? '1px solid var(--incorrect)' : '1px solid var(--border)', fontSize: 16, textAlign: 'center', background: 'var(--bg-color)', color: 'transparent', caretColor: 'var(--primary)', outline: 'none'}}
                  />
                  <div style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontSize: 24, letterSpacing: 8}}>
                    {adminPassword.split('').map((_, i) => <motion.span key={i} initial={{scale: 0}} animate={{scale: 1}}>💩</motion.span>)}
                  </div>
                </div>
                {passwordError && (
                  <div role="alert" style={{fontSize: 13, color: 'var(--incorrect)', fontWeight: 600, marginBottom: 20, lineHeight: 1.5}}>
                    {passwordError}
                  </div>
                )}
                <div style={{display: 'flex', gap: 16}}>
                  <button type="button" onClick={() => setShowPasswordModal(false)} className="btn btn-secondary" style={{flex: 1, padding: 16}}>취소</button>
                  <button type="submit" disabled={checkingPassword || !adminPassword} className="btn btn-primary" style={{flex: 1, padding: 16}}>
                    {checkingPassword ? <Loader2 className="animate-spin" size={18} /> : '확인'}
                  </button>
                </div>
              </form>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
