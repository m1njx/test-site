import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, AlertCircle, CheckCircle2, Loader2, Calendar, ArrowRight, Home, LogOut, Shield, Moon, Sun, Clock } from 'lucide-react';
import { quizzes, type Quiz } from './data';
import { ADMIN_ID, getStudentName, type Student } from './team';
import { saveScore, getStudentProgress, getQuizzes, getStudents, type Progress } from './api';
import Login from './Login';
import Admin from './Admin';
import './index.css';

declare global {
  interface Window {
    loadPyodide: (config?: any) => Promise<any>;
  }
}

import { gradeWithGemini } from './gemini';

export default function App() {
  const [loggedInUser, setLoggedInUser] = useState<string | null>(() => {
    return localStorage.getItem('aim_team_user');
  });

  useEffect(() => {
    if (loggedInUser) {
      localStorage.setItem('aim_team_user', loggedInUser);
    } else {
      localStorage.removeItem('aim_team_user');
    }
  }, [loggedInUser]);
  
  const [currentView, setCurrentView] = useState<'home' | 'quiz' | 'admin'>('home');
  const [dynamicQuizzes, setDynamicQuizzes] = useState<Quiz[]>(quizzes);
  const [dynamicTeam, setDynamicTeam] = useState<Student[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<Record<string, any>>({});
  const [pyodide, setPyodide] = useState<any>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [studentProgress, setStudentProgress] = useState<Progress[]>([]);
  const [expandedAnswers, setExpandedAnswers] = useState<Record<string, boolean>>({});

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('aim_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false);

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

  useEffect(() => {
    if (shouldAutoSubmit) {
      setShouldAutoSubmit(false);
      alert("제한 시간이 초과되었습니다. 자동으로 답안을 제출합니다.");
      gradeQuiz();
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

  useEffect(() => {
    loadQuizzes();
    loadTeam();
  }, []);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');

  const enterAdmin = () => {
    setShowPasswordModal(true);
    setAdminPassword('');
  };

  const handlePasswordSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const correctPassword = import.meta.env.VITE_ADMIN_PASSWORD;
    if (adminPassword === correctPassword && correctPassword) {
      setShowPasswordModal(false);
      setCurrentView('admin');
    } else {
      alert("비밀번호가 틀렸습니다.");
      setAdminPassword('');
    }
  };

  useEffect(() => {
    let retryCount = 0;
    const initPyodide = async () => {
      try {
        if (window.loadPyodide) {
          const p = await window.loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
          });
          setPyodide(p);
        } else {
          if (retryCount < 20) {
            retryCount++;
            setTimeout(initPyodide, 500);
          }
        }
      } catch (err) { console.error("Pyodide init error:", err); }
    };
    initPyodide();
  }, []);

  const fetchProgress = useCallback(async () => {
    if (loggedInUser && loggedInUser !== ADMIN_ID) {
      const p = await getStudentProgress(loggedInUser);
      setStudentProgress(p);
    }
  }, [loggedInUser]);

  useEffect(() => {
    if (loggedInUser && currentView === 'home') {
      fetchProgress();
    }
  }, [loggedInUser, currentView, fetchProgress]);

  if (!loggedInUser) return <Login onLogin={setLoggedInUser} dynamicTeam={dynamicTeam} />;

  const startQuiz = (quiz: Quiz) => {
    if (quiz.questions.length === 0) return;
    
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
    setCurrentView('home');
    setSelectedQuiz(null);
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    setStudentProgress([]);
    setCurrentView('home');
  };

  useEffect(() => {
    if (selectedQuiz && loggedInUser && Object.keys(answers).length > 0) {
      localStorage.setItem(`aim_quiz_answers_${selectedQuiz.id}_${loggedInUser}`, JSON.stringify(answers));
    }
  }, [answers, selectedQuiz, loggedInUser]);

  const resetQuiz = () => {
    setCurrentQuestionIdx(0);
    setAnswers({});
    setResults({});
    setShowResults(false);
    setExpandedAnswers({});
    if (selectedQuiz && loggedInUser) {
      localStorage.removeItem(`aim_quiz_answers_${selectedQuiz.id}_${loggedInUser}`);
    }
  };

  const gradeQuiz = async () => {
    setIsGrading(true);
    const gradingResults: Record<string, boolean> = {};
    const fullResults: Record<string, any> = {};
    let correctCount = 0;
    const questions = selectedQuiz!.questions;
    for (const q of questions) {
      const userAns = answers[q.id];
      if (!userAns) { gradingResults[q.id] = false; continue; }
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
        
        if (!graded && pyodide) {
          try {
            pyodide.runPython(`locals().clear()`);
            if (q.setupCode) pyodide.runPython(q.setupCode);
            let userRes = null;
            try { userRes = pyodide.runPython(u); } catch (err) { console.log(`Execution error in Q${q.id}:`, err); }
            pyodide.globals.set('_user_result', userRes);
            const isCorrect = pyodide.runPython(q.validationCode || 'False');
            gradingResults[q.id] = isCorrect === true;
          } catch (err) {
            gradingResults[q.id] = false;
          }
        }
      } else if (q.type === 'multiple' || q.type === 'multiple-multi') {
        const u = Array.isArray(userAns) ? userAns : [userAns];
        const isCorrect = u.length === q.correctAnswers.length && [...u].sort().join(',') === [...q.correctAnswers].sort().join(',');
        gradingResults[q.id] = isCorrect;
        
        try {
          const userSelectedTexts = u.map(idx => q.options?.[parseInt(idx)] || '').join(', ');
          const correctTexts = q.correctAnswers.map(idx => q.options?.[parseInt(idx)] || '').join(', ');
          const geminiResult = await gradeWithGemini(q, `학생이 선택한 보기: ${userSelectedTexts} (실제 정답 보기: ${correctTexts})`);
          fullResults[`reason_${q.id}`] = geminiResult.reason;
          if (geminiResult.explanation) fullResults[`ai_exp_${q.id}`] = geminiResult.explanation;
        } catch (e) {
          console.warn("Gemini explanation failed for multiple-choice:", e);
        }
      } else { gradingResults[q.id] = false; }
      if (gradingResults[q.id]) correctCount++;
    }

    Object.assign(fullResults, gradingResults);
    questions.forEach(q => {
      fullResults[`ans_${q.id}`] = answers[q.id];
    });

    setResults(fullResults);

    try {
      await saveScore(loggedInUser!, selectedQuiz!.id, correctCount, questions.length, fullResults);
      await fetchProgress();
      localStorage.removeItem(`aim_quiz_answers_${selectedQuiz!.id}_${loggedInUser}`);
    } catch (e) { alert("결과 저장 실패"); }
    setIsGrading(false);
    setShowResults(true);
  };

  // Helper variables for Home view
  const visibleQuizzes = dynamicQuizzes.filter(q => {
    if (loggedInUser === ADMIN_ID) return true;
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
  const isAnswered = currentQuestion ? (currentQuestion.type === 'short' ? !!(currentAnswer && (currentAnswer as string).trim()) : (Array.isArray(currentAnswer) && currentAnswer.length > 0)) : false;

  return (
    <div className="app-container" style={{background: 'transparent', boxShadow: 'none'}}>
      
      {currentView === 'admin' && (
        <Admin onBack={() => setCurrentView('home')} dynamicQuizzes={dynamicQuizzes} onRefresh={loadQuizzes} dynamicTeam={dynamicTeam} onRefreshTeam={loadTeam} />
      )}

      {currentView === 'home' && (
        <div className="home-container" style={{paddingTop: 24}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24}}>
            <div style={{fontWeight: 700, color: 'var(--text-secondary)'}}>
              안녕하세요, <span style={{color: 'var(--primary)'}}>{getStudentName(loggedInUser, dynamicTeam)}</span>님
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

          {loggedInUser === ADMIN_ID ? (
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
            </div>
          )}

          <h1 className="home-title">일일 퀴즈 점검</h1>
          <p className="home-subtitle">날짜별로 할당된 문제를 풀고 실력을 점검하세요.</p>
          <div className="quiz-list">
            {visibleQuizzes.map((q) => {
              const p = studentProgress.find(p => p.quizId === q.id);
              const isCompleted = !!p;
              const isLocked = q.questions.length === 0 || (q.isPublished === false && loggedInUser !== ADMIN_ID);
              return (
                <div key={q.id} className={`quiz-card ${isLocked ? 'disabled' : ''}`} onClick={() => !isLocked && startQuiz(q)} style={isCompleted ? {borderColor: 'rgba(39, 174, 96, 0.4)'} : {}}>
                  <div className="quiz-info">
                    <div className="quiz-date" style={{color: isLocked ? 'var(--text-tertiary)' : (isCompleted ? '#27AE60' : 'var(--primary)')}}>
                      <Calendar size={12} style={{display: 'inline', marginRight: 4}}/> {q.date} {isCompleted && '✓ 완료'} {q.isPublished === false && '(비공개)'}
                      {loggedInUser === ADMIN_ID && q.visibleTo && q.visibleTo.length > 0 && (
                        <span style={{marginLeft: 8, padding: '2px 6px', background: 'rgba(49, 130, 246, 0.1)', color: 'var(--primary)', borderRadius: 6, fontSize: 10, fontWeight: 700}}>
                          대상: {q.visibleTo.length}명
                        </span>
                      )}
                    </div>
                    <h3 className="quiz-name">{q.title}</h3>
                    <p className="quiz-desc">{q.description}</p>
                    {isCompleted && <p style={{fontSize: 12, fontWeight: 700, color: '#27AE60', marginTop: 8}}>내 점수: {p.score} / {p.total}</p>}
                  </div>
                  <div className="quiz-action" style={{color: isCompleted ? '#27AE60' : undefined}}><ArrowRight size={20} /></div>
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
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                {questions.map((q, idx) => (
                  <div key={q.id} style={{padding: 20, background: 'var(--surface)', borderRadius: 16, border: results[q.id] ? '1px solid #27AE60' : '1px solid #E74C3C'}}>
                    <div style={{display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12}}>
                      <span style={{background: results[q.id] ? '#27AE60' : '#E74C3C', color: 'white', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700}}>Q{idx+1}</span>
                      <strong style={{fontSize: 16}}>{q.title}</strong>
                      {results[q.id] ? <CheckCircle2 color="#27AE60" size={20} /> : <AlertCircle color="#E74C3C" size={20} />}
                    </div>
                    <div style={{fontSize: 14, color: 'var(--text-secondary)', padding: 12, background: 'var(--bg-color)', borderRadius: 12}}>
                      <div style={{marginBottom: 8}}><strong style={{color: results[q.id] ? '#27AE60' : '#E74C3C'}}>내 답변:</strong> {Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).join(', ') : (answers[q.id] || '(없음)')}</div>
                      
                      {results[`reason_${q.id}`] && (
                        <div style={{marginBottom: 8, color: results[q.id] ? 'var(--primary)' : '#E74C3C', fontWeight: 600, display: 'flex', gap: 6, alignItems: 'flex-start'}}>
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
            <>
              <header className="app-header" style={{padding: '20px 0'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
                  <button onClick={goHome} style={{background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--text-secondary)'}}><Home size={18} /> 나가기</button>
                  <div style={{fontWeight: 800, fontSize: 16}}>{selectedQuiz.title}</div>
                  {timeLeft !== null ? (
                    <div style={{display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 15, color: timeLeft <= 60 ? 'var(--incorrect)' : 'var(--text-secondary)'}}>
                      <Clock size={16} />
                      {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                    </div>
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
                          background: currentQuestionIdx === idx ? 'var(--primary)' : (hasAns ? 'rgba(49, 130, 246, 0.1)' : 'var(--surface)'),
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
                <h2 style={{fontSize: 22, fontWeight: 800, marginBottom: 24}}>{currentQuestion.title}</h2>
                {currentQuestion.type === 'short' ? (
                  <textarea autoFocus value={(currentAnswer as string) || ''} onChange={(e) => setAnswers({...answers, [currentQuestion.id]: e.target.value})} placeholder="코드를 작성하세요..." style={{width: '100%', minHeight: 200, padding: 20, borderRadius: 20, border: '1px solid var(--border)', fontSize: 16, fontFamily: 'monospace', background: 'var(--surface)'}} />
                ) : (
                  <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                    {currentQuestion.options?.map((opt, idx) => (
                      <button key={idx} onClick={() => setAnswers({...answers, [currentQuestion.id]: [idx.toString()]})} style={{padding: 20, textAlign: 'left', borderRadius: 16, border: (Array.isArray(currentAnswer) && currentAnswer.includes(idx.toString())) ? '2px solid var(--primary)' : '1px solid var(--border)', background: (Array.isArray(currentAnswer) && currentAnswer.includes(idx.toString())) ? 'rgba(49, 130, 246, 0.05)' : 'var(--surface)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12}}>
                        <div style={{width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{(Array.isArray(currentAnswer) && currentAnswer.includes(idx.toString())) && <div style={{width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)'}} />}</div>
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </main>
              <footer style={{display: 'flex', justifyContent: 'space-between', marginTop: 40}}>
                <button onClick={() => setCurrentQuestionIdx(v => v - 1)} disabled={currentQuestionIdx === 0} className="btn btn-secondary">이전</button>
                <button onClick={() => currentQuestionIdx === totalQuestions - 1 ? gradeQuiz() : setCurrentQuestionIdx(v => v + 1)} disabled={!isAnswered || isGrading} className="btn btn-primary" style={{minWidth: 120}}>{isGrading ? <Loader2 className="animate-spin" /> : (currentQuestionIdx === totalQuestions - 1 ? '제출하기' : '다음')}</button>
              </footer>
            </>
          )}
        </div>
      )}

      <AnimatePresence>
        {showPasswordModal && (
          <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)'}}>
            <motion.div initial={{scale: 0.9, opacity: 0}} animate={{scale: 1, opacity: 1}} exit={{scale: 0.9, opacity: 0}} style={{background: 'var(--surface)', padding: 40, borderRadius: 32, width: '100%', maxWidth: 400, textAlign: 'center', boxShadow: '0 24px 48px rgba(0,0,0,0.2)'}}>
              <h2 style={{fontSize: 24, fontWeight: 800, marginBottom: 12}}>관리자 인증</h2>
              <p style={{fontSize: 15, color: 'var(--text-secondary)', marginBottom: 32}}>보안을 위해 비밀번호를 입력해주세요.</p>
              <form onSubmit={handlePasswordSubmit}>
                <div style={{position: 'relative', marginBottom: 32}}>
                  <input type="password" autoFocus value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} style={{width: '100%', padding: '20px', borderRadius: 20, border: '1px solid var(--border)', fontSize: 16, textAlign: 'center', background: 'var(--bg-color)', color: 'transparent', caretColor: 'var(--primary)', outline: 'none'}} />
                  <div style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontSize: 24, letterSpacing: 8}}>
                    {adminPassword.split('').map((_, i) => <motion.span key={i} initial={{scale: 0}} animate={{scale: 1}}>💩</motion.span>)}
                  </div>
                </div>
                <div style={{display: 'flex', gap: 16}}>
                  <button type="button" onClick={() => setShowPasswordModal(false)} className="btn btn-secondary" style={{flex: 1, padding: 16}}>취소</button>
                  <button type="submit" className="btn btn-primary" style={{flex: 1, padding: 16}}>확인</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
