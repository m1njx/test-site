import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, RotateCcw, AlertCircle, CheckCircle2, Loader2, Calendar, ArrowRight, Home, LogOut, Shield } from 'lucide-react';
import { quizzes, type Quiz } from './data';
import { ADMIN_ID, getStudentName } from './team';
import { saveScore, getStudentProgress, getQuizzes, type Progress } from './api';
import Login from './Login';
import Admin from './Admin';
import './index.css';

declare global {
  interface Window {
    loadPyodide: (config?: any) => Promise<any>;
  }
}

export default function App() {
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);
  
  const [currentView, setCurrentView] = useState<'home' | 'quiz' | 'admin'>('home');
  const [dynamicQuizzes, setDynamicQuizzes] = useState<Quiz[]>(quizzes);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);

  useEffect(() => {
    const loadQuizzes = async () => {
      const qs = await getQuizzes();
      // 기존 정적 퀴즈와 Firestore의 동적 퀴즈를 합칩니다 (ID 중복 방지)
      setDynamicQuizzes(prev => {
        const merged = [...qs];
        quizzes.forEach(sq => {
          if (!merged.find(mq => mq.id === sq.id)) {
            merged.push(sq);
          }
        });
        return merged.sort((a, b) => b.date.localeCompare(a.date));
      });
    };
    loadQuizzes();
  }, []);

  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<Record<string, boolean>>({});
  
  const [pyodide, setPyodide] = useState<any>(null);
  const [isLoadingPyodide, setIsLoadingPyodide] = useState(true);
  const [isGrading, setIsGrading] = useState(false);

  // Student progress state
  const [studentProgress, setStudentProgress] = useState<Progress[]>([]);

  useEffect(() => {
    let retryCount = 0;
    const initPyodide = async () => {
      try {
        if (window.loadPyodide) {
          const p = await window.loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
          });
          setPyodide(p);
          setIsLoadingPyodide(false);
        } else {
          if (retryCount < 20) {
            retryCount++;
            setTimeout(initPyodide, 500);
          }
        }
      } catch (err) {
        console.error("Pyodide init error:", err);
      }
    };
    initPyodide();
  }, []);

  const fetchProgress = async () => {
    if (loggedInUser && loggedInUser !== ADMIN_ID) {
      const p = await getStudentProgress(loggedInUser);
      setStudentProgress(p);
    }
  };

  useEffect(() => {
    if (loggedInUser && currentView === 'home') {
      fetchProgress();
    }
  }, [loggedInUser, currentView]);

  if (!loggedInUser) {
    return <Login onLogin={setLoggedInUser} />;
  }

  if (currentView === 'admin') {
    return <Admin onBack={() => setCurrentView('home')} dynamicQuizzes={dynamicQuizzes} />;
  }

  const startQuiz = (quiz: Quiz) => {
    if (quiz.questions.length === 0) return;
    setSelectedQuiz(quiz);
    setCurrentQuestionIdx(0);
    setAnswers({});
    setResults({});
    setIsSubmitted(false);
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

  if (currentView === 'home') {
    const validQuizzes = dynamicQuizzes.filter(q => q.questions.length > 0);
    const completionRate = validQuizzes.length > 0 ? Math.round((studentProgress.length / validQuizzes.length) * 100) : 0;

    return (
      <div className="app-container" style={{background: 'transparent', boxShadow: 'none'}}>
        <div className="home-container" style={{paddingTop: 24}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24}}>
            <div style={{fontWeight: 700, color: 'var(--text-secondary)'}}>
              안녕하세요, <span style={{color: 'var(--primary)'}}>{getStudentName(loggedInUser)}</span>님
            </div>
            <button onClick={handleLogout} style={{background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4}}>
              <LogOut size={16} /> 로그아웃
            </button>
          </div>

          {loggedInUser === ADMIN_ID ? (
            <button 
              onClick={() => setCurrentView('admin')}
              className="btn btn-primary" 
              style={{width: '100%', marginBottom: 32, padding: 20}}
            >
              <Shield size={24} /> 관리자 대시보드 입장
            </button>
          ) : (
            <div style={{background: 'var(--surface)', padding: 24, borderRadius: 20, boxShadow: 'var(--shadow-sm)', marginBottom: 32}}>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 12}}>
                <span style={{fontWeight: 700}}>나의 완주율</span>
                <span style={{fontWeight: 800, color: 'var(--primary)'}}>{completionRate}%</span>
              </div>
              <div style={{height: 12, background: 'var(--bg-color)', borderRadius: 6, overflow: 'hidden'}}>
                <motion.div 
                  initial={{width: 0}} 
                  animate={{width: `${completionRate}%`}} 
                  style={{height: '100%', background: 'var(--primary)'}}
                  transition={{duration: 1, ease: 'easeOut'}}
                />
              </div>
              <div style={{marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right'}}>
                {studentProgress.length} / {validQuizzes.length} 완료
              </div>
            </div>
          )}

          <h1 className="home-title">일일 퀴즈 점검</h1>
          <p className="home-subtitle">날짜별로 할당된 문제를 풀고 실력을 점검하세요.</p>
          
          <div className="quiz-list">
            {dynamicQuizzes.map((q) => {
              const p = studentProgress.find(p => p.quizId === q.id);
              const isCompleted = !!p;
              
              return (
                <div 
                  key={q.id} 
                  className={`quiz-card ${q.questions.length === 0 ? 'disabled' : ''}`}
                  onClick={() => startQuiz(q)}
                  style={isCompleted ? {borderColor: 'rgba(39, 174, 96, 0.4)'} : {}}
                >
                  <div className="quiz-info">
                    <div className="quiz-date" style={{color: isCompleted ? '#27AE60' : 'var(--primary)'}}>
                      <Calendar size={12} style={{display: 'inline', marginRight: 4, verticalAlign: 'middle', marginTop: '-2px'}}/>
                      {q.date} {isCompleted && '✓ 완료됨'}
                    </div>
                    <h3 className="quiz-name">{q.title}</h3>
                    <p className="quiz-desc">{q.description}</p>
                    {isCompleted && (
                       <p style={{fontSize: 12, fontWeight: 700, color: '#27AE60', marginTop: 8}}>
                         내 점수: {p.score} / {p.total}
                       </p>
                    )}
                  </div>
                  <div className="quiz-action" style={{color: isCompleted ? '#27AE60' : undefined}}>
                    <ArrowRight size={20} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const questions = selectedQuiz!.questions;
  const currentQuestion = questions[currentQuestionIdx];
  const totalQuestions = questions.length;
  
  const progress = ((currentQuestionIdx + 1) / totalQuestions) * 100;

  const handleShortAnswerChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setAnswers({ ...answers, [currentQuestion.id]: e.target.value });
  };

  const handleMultipleChoiceChange = (optionIdx: number) => {
    if (currentQuestion.type === 'multiple-multi') {
      const currentAns = (answers[currentQuestion.id] as string[]) || [];
      const idxStr = optionIdx.toString();
      if (currentAns.includes(idxStr)) {
        setAnswers({ ...answers, [currentQuestion.id]: currentAns.filter(i => i !== idxStr) });
      } else {
        setAnswers({ ...answers, [currentQuestion.id]: [...currentAns, idxStr] });
      }
    } else {
      setAnswers({ ...answers, [currentQuestion.id]: [optionIdx.toString()] });
    }
  };

  const gradeQuiz = async () => {
    setIsGrading(true);
    const gradingResults: Record<string, boolean> = {};
    let correctCount = 0;
    
    for (const q of questions) {
      const userAns = answers[q.id];
      if (!userAns) {
        gradingResults[q.id] = false;
        continue;
      }

      if (q.type === 'short' && pyodide) {
        const u = typeof userAns === 'string' ? userAns : '';
        try {
          pyodide.runPython(`locals().clear()`);
          if (q.setupCode) pyodide.runPython(q.setupCode);
          
          let userRes = null;
          try {
             userRes = pyodide.runPython(u);
          } catch (e) {
             console.log(`Execution error in Q${q.id}:`, e);
          }
          
          pyodide.globals.set('_user_result', userRes);
          const isCorrect = pyodide.runPython(q.validationCode || 'False');
          gradingResults[q.id] = isCorrect === true;
        } catch (e) {
          console.error('Pyodide validation error on', q.id, e);
          gradingResults[q.id] = false;
        }
      } else if (q.type === 'multiple' || q.type === 'multiple-multi') {
        const u = Array.isArray(userAns) ? userAns : [userAns];
        if (u.length !== q.correctAnswers.length) {
          gradingResults[q.id] = false;
        } else {
          gradingResults[q.id] = [...u].sort().join(',') === [...q.correctAnswers].sort().join(',');
        }
      } else {
        gradingResults[q.id] = false;
      }
      
      if (gradingResults[q.id]) correctCount++;
    }
    
    setResults(gradingResults);
    
    // Save score to DB
    try {
      await saveScore(loggedInUser!, selectedQuiz!.id, correctCount, totalQuestions, gradingResults);
      // Defensive: Update local state immediately so home screen is updated
      setStudentProgress(prev => {
        const existingIdx = prev.findIndex(p => p.quizId === selectedQuiz!.id);
        const newData: Progress = { 
          studentId: loggedInUser!, 
          quizId: selectedQuiz!.id, 
          score: correctCount, 
          total: totalQuestions, 
          timestamp: Date.now(),
          detailedResults: gradingResults
        };
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = newData;
          return next;
        }
        return [...prev, newData];
      });
    } catch (dbError) {
      console.error("Failed to save score to Firebase:", dbError);
      alert("결과를 데이터베이스에 저장하는데 실패했습니다. (파이어베이스 권한 설정이나 네트워크를 확인해주세요)");
    }
    
    setIsGrading(false);
    setIsSubmitted(true);
    setShowResults(true);
  };

  const handleNext = () => {
    if (currentQuestionIdx < totalQuestions - 1) {
      setCurrentQuestionIdx(currentQuestionIdx + 1);
    } else {
      gradeQuiz();
    }
  };

  const handlePrev = () => {
    if (currentQuestionIdx > 0) {
      setCurrentQuestionIdx(currentQuestionIdx - 1);
    }
  };

  const calculateScore = () => {
    return questions.reduce((score, q) => (results[q.id] ? score + 1 : score), 0);
  };

  const resetQuiz = () => {
    setCurrentQuestionIdx(0);
    setAnswers({});
    setResults({});
    setIsSubmitted(false);
    setShowResults(false);
  };

  if (showResults) {
    const score = calculateScore();
    return (
      <div className="app-container">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="result-container"
        >
          <div className="result-header">
            <h1 className="result-title">평가 결과</h1>
            <div className="score-circle">
              <span>{score}</span>
              <span className="total">/ {totalQuestions}</span>
            </div>
          </div>
          
          <div className="result-list">
            {questions.map((q, idx) => {
              const correct = results[q.id];
              return (
                <div key={q.id} className={`result-item ${correct ? 'correct' : 'incorrect'}`}>
                  <div className="result-item-header">
                    <span className="q-badge">Q{idx + 1}</span>
                    <h3 className="q-title">{q.title}</h3>
                    {correct ? <CheckCircle2 className="icon-correct" /> : <AlertCircle className="icon-incorrect" />}
                  </div>
                  <div className="result-explanation">
                    {!correct && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ marginBottom: 12, padding: 12, background: 'rgba(231, 76, 60, 0.1)', borderRadius: 8 }}>
                          <strong style={{ display: 'block', marginBottom: 4, color: '#E74C3C', fontSize: 13 }}>내 답변:</strong>
                          <pre style={{ fontSize: 14, whiteSpace: 'pre-wrap', fontFamily: 'Courier New' }}>
                            {q.type === 'short' ? answers[q.id] || '(미입력)' : (Array.isArray(answers[q.id]) && answers[q.id].length > 0 ? (answers[q.id] as string[]).map(a => q.options?.[parseInt(a)]).join(', ') : '(미입력)')}
                          </pre>
                        </div>
                        
                        <div style={{ marginBottom: 12, padding: 12, background: 'rgba(39, 174, 96, 0.1)', borderRadius: 8 }}>
                          <strong style={{ display: 'block', marginBottom: 4, color: '#27AE60', fontSize: 13 }}>모범 정답:</strong>
                          <pre style={{ fontSize: 14, whiteSpace: 'pre-wrap', fontFamily: 'Courier New' }}>
                            {q.type === 'short' ? q.correctAnswers[0].replace(/\\n/g, '\n') : q.options?.map((opt, i) => q.correctAnswers.includes(i.toString()) ? opt : null).filter(Boolean).join(', ')}
                          </pre>
                        </div>
                        
                        <div style={{ padding: 12, background: 'var(--bg-color)', borderRadius: 8 }}>
                          <strong style={{ display: 'block', marginBottom: 4, color: 'var(--text-primary)', fontSize: 13 }}>틀린 이유 (해설):</strong>
                          <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{q.explanation}</p>
                        </div>
                      </div>
                    )}
                    
                    {correct && (
                      <div style={{ marginTop: 12, padding: 12, background: 'rgba(49, 130, 246, 0.05)', borderRadius: 8 }}>
                        <strong style={{ display: 'block', marginBottom: 4, color: 'var(--primary)', fontSize: 13 }}>해설:</strong>
                        <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{q.explanation}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{display: 'flex', gap: 12, margin: 24}}>
            <button onClick={resetQuiz} className="btn btn-secondary" style={{flex: 1}}>
              <RotateCcw size={20} />
              다시 풀기
            </button>
            <button onClick={goHome} className="btn btn-primary" style={{flex: 1}}>
              <Home size={20} />
              홈으로
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const currentAnswer = answers[currentQuestion.id];
  const isAnswered = currentQuestion.type === 'short' 
    ? !!(typeof currentAnswer === 'string' && currentAnswer.trim())
    : (Array.isArray(currentAnswer) && currentAnswer.length > 0);

  return (
    <div className="app-container">
      {isLoadingPyodide && (
        <div style={{position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--primary)'}}>
          <Loader2 size={14} className="animate-spin" style={{animation: 'spin 2s linear infinite'}} />
          파이썬 채점 엔진 로딩 중...
        </div>
      )}
      
      <header className="app-header" style={{display: 'flex', flexDirection: 'column'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
          <button onClick={goHome} className="btn-secondary" style={{display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', padding: 8, cursor: 'pointer', borderRadius: 8}}>
            <Home size={16} /> <span style={{fontSize: 14, fontWeight: 600}}>나가기</span>
          </button>
          <div style={{fontSize: 14, fontWeight: 600}}>{selectedQuiz?.title}</div>
        </div>
        <div className="progress-bar" style={{marginBottom: 16}}>
          <motion.div 
            className="progress-fill" 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
        <div className="header-meta">
          <span className="q-counter">문제 {currentQuestionIdx + 1} / {totalQuestions}</span>
          {currentQuestion.level && <span className="level-badge">Level {currentQuestion.level}</span>}
        </div>
      </header>

      <main className="q-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="q-content"
          >
            <h2 className="q-title">{currentQuestion.title}</h2>
            {currentQuestion.description && <p className="q-desc">{currentQuestion.description}</p>}

            <div className="q-input-area">
              {currentQuestion.type === 'short' ? (
                <textarea
                  className="short-input"
                  placeholder="코드를 입력하세요..."
                  value={(currentAnswer as string) || ''}
                  onChange={handleShortAnswerChange}
                  rows={4}
                />
              ) : (
                <div className="options-list">
                  {currentQuestion.options?.map((opt, idx) => {
                    const isSelected = Array.isArray(currentAnswer) && currentAnswer.includes(idx.toString());
                    return (
                      <button
                        key={idx}
                        className={`option-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleMultipleChoiceChange(idx)}
                      >
                        <div className="option-indicator">
                          {isSelected && <Check size={16} />}
                        </div>
                        <span className="option-text">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="app-footer">
        <button 
          className={`btn btn-secondary ${currentQuestionIdx === 0 ? 'hidden' : ''}`}
          onClick={handlePrev}
          disabled={isGrading}
        >
          이전
        </button>
        <button 
          className="btn btn-primary"
          onClick={handleNext}
          disabled={(!isAnswered && !isSubmitted) || isLoadingPyodide || isGrading}
        >
          {isGrading ? (
            <><Loader2 size={20} style={{animation: 'spin 2s linear infinite'}} /> 채점 중...</>
          ) : currentQuestionIdx === totalQuestions - 1 ? (
            '제출하기'
          ) : (
            <>다음 <ChevronRight size={20} /></>
          )}
        </button>
      </footer>
    </div>
  );
}
