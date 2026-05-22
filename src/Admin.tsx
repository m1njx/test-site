import { useState, useEffect } from 'react';
import { type Quiz, type Question, type QuestionType } from './data';
import { type Student } from './team';
import { getQuizResults, saveQuiz, deleteQuiz, saveStudent, deleteStudent, type Progress } from './api';
import { ArrowLeft, RefreshCw, Trash2, Edit3, Trash, Eye, EyeOff, FileText, Check, Users, UserPlus, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface AdminProps {
  onBack: () => void;
  dynamicQuizzes: Quiz[];
  onRefresh: () => void;
  dynamicTeam: Student[];
  onRefreshTeam: () => void;
}

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash'
];

// 이전에 성공한 모델 기억
let lastSuccessfulModelAdmin: string | null = null;

async function callGeminiWithFallback(apiKey: string, prompt: string): Promise<string> {
  let lastError = null;
  const timeout = 15000; // 15초 타임아웃
  
  // 성공한 모델이 있으면 먼저 시도
  const modelsToTry = lastSuccessfulModelAdmin 
    ? [lastSuccessfulModelAdmin, ...GEMINI_MODELS.filter(m => m !== lastSuccessfulModelAdmin)]
    : GEMINI_MODELS;
  
  for (const model of modelsToTry) {
    try {
      console.log(`Trying Gemini model in admin mode: ${model}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`API error ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response');
      }
      
      // 성공한 모델 기억
      lastSuccessfulModelAdmin = model;
      console.log(`Success with model: ${model}`);
      return text;
    } catch (e) {
      console.warn(`Model ${model} failed in admin preview:`, e);
      lastError = e;
    }
  }
  throw lastError || new Error('All Gemini models failed');
}

async function fetchAiPreview(qTitle: string, qDesc: string): Promise<{ correctAnswer: string; explanation: string }> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('Gemini API key is not configured');
  }

  const prompt = `너는 프로그래밍 및 IT 개념 채점 조교 AI야. 
다음 질문에 대해 학생들이 참고할 수 있는 가장 완벽하고 이상적인 모범 답안(코드 또는 개념 설명)과 핵심 요약 해설을 제공해줘.

[문제 정보]
- 질문: ${qTitle}
- 설명: ${qDesc}

[제공 규칙]
1. 이 질문에 대한 가장 모범적인 정답/코드(HTML/CSS/JS/Python 등 문제에 맞는 형식)를 'correctAnswer' field에 제공해주세요.
2. 이 질문의 핵심 개념에 대해 누구나 단번에 직관적으로 이해할 수 있도록 구구절절한 전문 용어 서술을 완전히 배제하고, 핵심 내용만 딱 요약하여 2~3문장 이내로 아주 간결하게 'explanation' field에 한국어로 작성해주세요.
3. 응답은 반드시 마크다운 백틱 없이 순수 JSON 객체 한 개로만 출력하세요. 다른 잡담이나 설명은 넣지 마세요.

응답 형식:
{
  "correctAnswer": "모범 답안 코드 또는 개념 텍스트",
  "explanation": "해당 문제의 핵심 이론 및 상세 해설 (한국어)"
}`;

  const text = await callGeminiWithFallback(apiKey, prompt);

  let cleanText = text.trim();
  if (cleanText.includes('```')) {
    const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) cleanText = match[1].trim();
    else cleanText = cleanText.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
  }

  const result = JSON.parse(cleanText);
  return {
    correctAnswer: result.correctAnswer || '',
    explanation: result.explanation || ''
  };
}

export default function Admin({ onBack, dynamicQuizzes, onRefresh, dynamicTeam, onRefreshTeam }: AdminProps) {
  const [activeTab, setActiveTab] = useState<'results' | 'create' | 'team'>('results');
  const [selectedQuizId, setSelectedQuizId] = useState(dynamicQuizzes[0]?.id || '');
  const [results, setResults] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [aiPreviews, setAiPreviews] = useState<Record<string, { correctAnswer: string; explanation: string; loading?: boolean; error?: string }>>({});
  const [showQuizAiPreview, setShowQuizAiPreview] = useState(false);

  // Team Editor State
  const [newStudent, setNewStudent] = useState({ id: '', name: '' });

  // Quiz Editor State
  const [activeQuiz, setActiveQuiz] = useState<Quiz>({
    id: `q-${new Date().toISOString().split('T')[0]}`,
    date: new Date().toISOString().split('T')[0],
    title: '',
    description: '',
    questions: [],
    isPublished: true
  });

  const fetchResults = async () => {
    if (!selectedQuizId) return;
    setLoading(true);
    try {
      const res = await getQuizResults(selectedQuizId);
      setResults(res);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'results') {
      fetchResults();
      setShowQuizAiPreview(false);
    }
  }, [selectedQuizId, activeTab]);

  const loadQuizForEdit = () => {
    const quizToEdit = dynamicQuizzes.find(q => q.id === selectedQuizId);
    if (quizToEdit) {
      const copy = JSON.parse(JSON.stringify(quizToEdit));
      if (copy.isPublished === undefined) copy.isPublished = true;
      setActiveQuiz(copy);
      setAiPreviews({});
      setActiveTab('create');
    }
  };

  const handleDeleteQuiz = async () => {
    if (!selectedQuizId) return;
    if (!window.confirm("정말로 이 퀴즈를 삭제하시겠습니까?")) return;
    setLoading(true);
    try {
      await deleteQuiz(selectedQuizId);
      onRefresh();
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleAddStudent = async () => {
    if (!newStudent.id || !newStudent.name) { alert("학번과 이름을 입력해주세요."); return; }
    setLoading(true);
    try {
      await saveStudent(newStudent);
      setNewStudent({ id: '', name: '' });
      onRefreshTeam();
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleDeleteStudent = async (id: string) => {
    if (!window.confirm("정말로 이 팀원을 삭제하시겠습니까?")) return;
    setLoading(true);
    try {
      await deleteStudent(id);
      onRefreshTeam();
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleHeaderBack = () => {
    if (activeTab !== 'results') setActiveTab('results');
    else onBack();
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const addQuestion = (type: QuestionType) => {
    const q: Question = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      title: '',
      description: '',
      options: type.includes('multiple') ? ['', '', '', ''] : undefined,
      correctAnswers: [],
      explanation: '',
      setupCode: type === 'short' ? '' : undefined,
      validationCode: type === 'short' ? '' : undefined,
      level: 1
    };
    setActiveQuiz(prev => ({ ...prev, questions: [...prev.questions, q] }));
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setActiveQuiz(prev => ({
      ...prev,
      questions: prev.questions.map(q => q.id === id ? { ...q, ...updates } : q)
    }));
  };

  const handleSaveQuiz = async () => {
    if (!activeQuiz.title || activeQuiz.questions.length === 0) { alert("제목과 문제를 입력해주세요."); return; }
    setLoading(true);
    try {
      await saveQuiz(activeQuiz);
      alert("저장 성공!");
      onRefresh();
      setActiveTab('results');
    } catch (e: any) { alert(`저장 실패: ${e.message}`); }
    setLoading(false);
  };

  const renderResults = () => {
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
        {dynamicTeam.map(member => {
          const result = results.find(r => r.studentId === member.id);
          const isCompleted = !!result;
          const isExpanded = expandedIds[member.id];
          const quiz = dynamicQuizzes.find(q => q.id === selectedQuizId);

          return (
            <div key={member.id} style={{display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden'}}>
              <div 
                onClick={() => isCompleted && toggleExpand(member.id)} 
                style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20, cursor: isCompleted ? 'pointer' : 'default'}}
              >
                <div>
                  <div style={{fontWeight: 700, fontSize: 16, marginBottom: 4}}>{member.name}</div>
                  <div style={{fontSize: 13, color: 'var(--text-secondary)'}}>{member.id}</div>
                </div>
                <div style={{textAlign: 'right', display: 'flex', alignItems: 'center', gap: 12}}>
                  {isCompleted ? (
                    <>
                      <div style={{color: '#27AE60', fontWeight: 700, fontSize: 18}}>{result.score} / {result.total}</div>
                      <ChevronRight size={20} style={{transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-tertiary)'}} />
                    </>
                  ) : (
                    <div style={{color: 'var(--text-secondary)', fontSize: 14}}>미완료</div>
                  )}
                </div>
              </div>

              {isExpanded && isCompleted && quiz && (
                <div style={{padding: '0 20px 20px 20px', borderTop: '1px solid var(--bg-color)', background: 'rgba(49, 130, 246, 0.02)'}}>
                  <div style={{marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12}}>
                    {quiz.questions.map((q, qIdx) => {
                      const isCorrect = result.detailedResults?.[q.id];
                      const studentAns = result.detailedResults ? result.detailedResults[`ans_${q.id}`] : undefined;
                      const aiReason = result.detailedResults ? result.detailedResults[`reason_${q.id}`] : undefined;
                      const aiAns = result.detailedResults ? result.detailedResults[`ai_ans_${q.id}`] : undefined;
                      const aiExp = result.detailedResults ? result.detailedResults[`ai_exp_${q.id}`] : undefined;

                      return (
                        <div key={q.id} style={{padding: 12, background: 'var(--surface)', borderRadius: 12, border: `1px solid ${isCorrect ? 'rgba(39, 174, 96, 0.2)' : 'rgba(231, 76, 60, 0.2)'}`}}>
                          <div style={{display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8}}>
                            <span style={{fontSize: 12, fontWeight: 800, color: 'var(--text-tertiary)'}}>Q{qIdx + 1}</span>
                            <div style={{fontSize: 14, fontWeight: 600, flex: 1}}>{q.title}</div>
                            {isCorrect ? <CheckCircle2 size={16} color="#27AE60" /> : <AlertCircle size={16} color="#E74C3C" />}
                          </div>
                          {q.type === 'short' ? (
                            <div style={{marginTop: 8, fontSize: 13}}>
                              <div style={{color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2}}>학생 답변:</div>
                              <pre style={{margin: 0, padding: 8, background: 'var(--bg-color)', borderRadius: 6, fontSize: 12, overflowX: 'auto', fontFamily: 'monospace'}}>{studentAns || '(답변 없음)'}</pre>
                            </div>
                          ) : (
                            <div style={{marginTop: 8, fontSize: 13}}>
                              <div style={{color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2}}>학생 답변:</div>
                              <div style={{padding: 8, background: 'var(--bg-color)', borderRadius: 6, fontSize: 13, fontWeight: 500}}>
                                {Array.isArray(studentAns) 
                                  ? studentAns.map(idx => q.options?.[parseInt(idx)]).join(', ') 
                                  : (typeof studentAns === 'string' ? q.options?.[parseInt(studentAns)] : '(답변 없음)')}
                              </div>
                            </div>
                          )}
                          
                          {aiReason && (
                            <div style={{marginTop: 8, color: 'var(--primary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4}}>
                              🤖 AI 피드백: {aiReason}
                            </div>
                          )}
                          
                          {(aiAns || aiExp) && (
                            <div style={{marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8}}>
                              {aiAns && (
                                <div style={{marginBottom: 6}}>
                                  <div style={{color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, marginBottom: 2}}>💡 AI 모범 답안:</div>
                                  <pre style={{margin: 0, padding: 8, background: 'var(--bg-color)', borderRadius: 6, fontSize: 11, fontFamily: 'monospace', overflowX: 'auto'}}>{aiAns}</pre>
                                </div>
                              )}
                              {aiExp && (
                                <div style={{fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4}}>
                                  <strong>💡 AI 상세 해설:</strong> {aiExp}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const selectedQuiz = dynamicQuizzes.find(q => q.id === selectedQuizId);

  return (
    <div className="app-container" style={{background: 'var(--surface)', padding: 0, maxWidth: 1000}}>
      <header className="app-header" style={{display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid var(--border)'}}>
        <button onClick={handleHeaderBack} style={{background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)'}}>
          <ArrowLeft size={24} />
        </button>
        <h1 style={{fontSize: 20, fontWeight: 700, margin: 0}}>관리자 센터</h1>
        
        <div style={{display: 'flex', gap: 8, marginLeft: 'auto', background: 'var(--bg-color)', padding: 4, borderRadius: 12}}>
          <button onClick={() => setActiveTab('results')} style={{padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: activeTab === 'results' ? 'var(--surface)' : 'transparent', color: activeTab === 'results' ? 'var(--primary)' : 'var(--text-secondary)'}}>결과</button>
          <button onClick={() => { setActiveTab('create'); }} style={{padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: activeTab === 'create' ? 'var(--surface)' : 'transparent', color: activeTab === 'create' ? 'var(--primary)' : 'var(--text-secondary)'}}>퀴즈 생성</button>
          <button onClick={() => setActiveTab('team')} style={{padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: activeTab === 'team' ? 'var(--surface)' : 'transparent', color: activeTab === 'team' ? 'var(--primary)' : 'var(--text-secondary)'}}>팀원 관리</button>
        </div>
      </header>

      <div style={{padding: 24, overflowY: 'auto', flex: 1}}>
        {activeTab === 'results' && (
          <>
            <div style={{marginBottom: 24}}>
              <label style={{display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)'}}>퀴즈 관리</label>
              <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12}}>
                <select value={selectedQuizId} onChange={(e) => setSelectedQuizId(e.target.value)} style={{flex: 1, minWidth: 200, padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 16}}>
                  {dynamicQuizzes.map(q => (
                    <option key={q.id} value={q.id}>{q.date} - {q.title} {q.isPublished === false ? '(비공개)' : ''}</option>
                  ))}
                </select>
                <div style={{display: 'flex', gap: 8}}>
                  <button onClick={loadQuizForEdit} style={{background: 'var(--bg-color)', border: 'none', borderRadius: 12, padding: '0 16px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6}}><Edit3 size={18} /> 수정</button>
                  <button onClick={handleDeleteQuiz} style={{background: 'rgba(231, 76, 60, 0.05)', border: 'none', borderRadius: 12, padding: '0 16px', cursor: 'pointer', color: '#E74C3C'}}><Trash size={18} /></button>
                  <button onClick={fetchResults} disabled={loading} style={{background: 'var(--bg-color)', border: 'none', borderRadius: 12, padding: '0 16px', cursor: 'pointer', color: 'var(--primary)'}}><RefreshCw size={20} className={loading ? 'animate-spin' : ''} /></button>
                </div>
              </div>
              
              {selectedQuizId && (
                <button
                  onClick={() => setShowQuizAiPreview(!showQuizAiPreview)}
                  style={{
                    width: '100%',
                    background: showQuizAiPreview ? 'rgba(49, 130, 246, 0.1)' : 'var(--bg-color)',
                    color: 'var(--primary)',
                    border: '1px solid rgba(49, 130, 246, 0.2)',
                    padding: '12px 20px',
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  🤖 이 퀴즈의 전체 AI 모범 답안 및 정답 확인
                </button>
              )}
            </div>

            {showQuizAiPreview && selectedQuiz && (
              <div style={{background: 'var(--surface)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', marginBottom: 24}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                  <h3 style={{fontSize: 16, fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6, margin: 0}}>
                    🤖 이 퀴즈의 전체 AI 모범 답안 및 정답
                  </h3>
                  <button onClick={() => setShowQuizAiPreview(false)} style={{background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700}}>닫기</button>
                </div>
                
                <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                  {selectedQuiz.questions.map((q, idx) => {
                    return (
                      <div key={q.id} style={{padding: 16, background: 'var(--bg-color)', borderRadius: 16, border: '1px solid var(--border)'}}>
                        <div style={{fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
                          <span style={{color: 'var(--primary)'}}>Q{idx + 1}.</span>
                          <span style={{flex: 1}}>{q.title}</span>
                          <span style={{fontSize: 11, background: 'rgba(49, 130, 246, 0.1)', color: 'var(--primary)', padding: '2px 6px', borderRadius: 6}}>{q.type === 'short' ? '주관식' : '객관식'}</span>
                        </div>
                        
                        {q.type === 'short' ? (
                          <div style={{marginTop: 10}}>
                            <button
                              onClick={async () => {
                                setAiPreviews(prev => ({ ...prev, [`quiz_${q.id}`]: { correctAnswer: '', explanation: '', loading: true } }));
                                try {
                                  const res = await fetchAiPreview(q.title, q.description || '');
                                  setAiPreviews(prev => ({ ...prev, [`quiz_${q.id}`]: { ...res, loading: false } }));
                                } catch (err) {
                                  setAiPreviews(prev => ({ ...prev, [`quiz_${q.id}`]: { correctAnswer: '', explanation: '', loading: false, error: 'AI 로딩 실패' } }));
                                }
                              }}
                              disabled={aiPreviews[`quiz_${q.id}`]?.loading}
                              style={{
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                color: 'var(--primary)',
                                padding: '8px 12px',
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                outline: 'none'
                              }}
                            >
                              {aiPreviews[`quiz_${q.id}`]?.loading ? (
                                <RefreshCw className="animate-spin" size={12} />
                              ) : '✨ AI 모범 답안 생성/조회'}
                            </button>
                            
                            {aiPreviews[`quiz_${q.id}`] && !aiPreviews[`quiz_${q.id}`].loading && (
                              <div style={{marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8}}>
                                {aiPreviews[`quiz_${q.id}`].error ? (
                                  <div style={{color: '#E74C3C', fontWeight: 600}}>{aiPreviews[`quiz_${q.id}`].error}</div>
                                ) : (
                                  <>
                                    <div>
                                      <div style={{fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 2}}>모범 답안:</div>
                                      <pre style={{margin: 0, padding: 8, background: 'var(--surface)', borderRadius: 8, fontSize: 11, fontFamily: 'monospace', overflowX: 'auto', border: '1px solid var(--border)'}}>
                                        {aiPreviews[`quiz_${q.id}`].correctAnswer}
                                      </pre>
                                    </div>
                                    <div>
                                      <div style={{fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 2}}>상세 해설:</div>
                                      <div style={{fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4}}>{aiPreviews[`quiz_${q.id}`].explanation}</div>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{marginTop: 10}}>
                            <div style={{fontSize: 12, color: 'var(--text-secondary)'}}>
                              <strong>선택지 정답 확인:</strong>
                              <div style={{display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4}}>
                                {q.options?.map((opt, oIdx) => {
                                  const isCorrect = q.correctAnswers?.includes(oIdx.toString());
                                  return (
                                    <div key={oIdx} style={{padding: '6px 10px', background: isCorrect ? 'rgba(39, 174, 96, 0.05)' : 'var(--surface)', borderRadius: 8, border: isCorrect ? '1px solid rgba(39, 174, 96, 0.3)' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6}}>
                                      {isCorrect ? <CheckCircle2 size={14} color="#27AE60" /> : <div style={{width: 14}} />}
                                      <span style={{color: isCorrect ? '#27AE60' : 'var(--text-secondary)', fontWeight: isCorrect ? 700 : 500}}>{opt}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div style={{marginTop: 10}}>
                              <button
                                onClick={async () => {
                                  setAiPreviews(prev => ({ ...prev, [`quiz_${q.id}`]: { correctAnswer: '', explanation: '', loading: true } }));
                                  try {
                                    const correctTexts = q.correctAnswers.map(idx => q.options?.[parseInt(idx)] || '').join(', ');
                                    const prompt = `이 객관식 질문과 정답에 대한 개념 해설을 핵심 요점 위주로 아주 간결하고 명확하게 한국어로 작성해주세요. 누구나 단번에 직관적으로 이해할 수 있도록 구구절절한 전문 용어의 나열이나 해설은 완전히 피하고, 2~3문장 이내로 핵심 요점만 명확하게 요약해 주세요.
질문: ${q.title}
선택지: ${q.options?.join(', ')}
정답: ${correctTexts}`;
                                    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
                                    if (!apiKey) throw new Error('API key not configured');
                                    
                                    const text = await callGeminiWithFallback(apiKey, prompt);
                                    setAiPreviews(prev => ({ ...prev, [`quiz_${q.id}`]: { correctAnswer: correctTexts, explanation: text, loading: false } }));
                                  } catch (err) {
                                    setAiPreviews(prev => ({ ...prev, [`quiz_${q.id}`]: { correctAnswer: '', explanation: '', loading: false, error: 'AI 해설 로딩 실패' } }));
                                  }
                                }}
                                disabled={aiPreviews[`quiz_${q.id}`]?.loading}
                                style={{
                                  background: 'var(--surface)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--primary)',
                                  padding: '6px 12px',
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  marginTop: 10,
                                  outline: 'none'
                                }}
                              >
                                {aiPreviews[`quiz_${q.id}`]?.loading ? (
                                  <RefreshCw className="animate-spin" size={12} />
                                ) : '✨ AI 해설 및 분석 미리보기'}
                              </button>

                              {aiPreviews[`quiz_${q.id}`] && !aiPreviews[`quiz_${q.id}`].loading && (
                                <div style={{marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8}}>
                                  {aiPreviews[`quiz_${q.id}`].error ? (
                                    <div style={{color: '#E74C3C', fontWeight: 600}}>{aiPreviews[`quiz_${q.id}`].error}</div>
                                  ) : (
                                    <div>
                                      <div style={{fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 2}}>AI 분석 해설:</div>
                                      <div style={{fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4}}>{aiPreviews[`quiz_${q.id}`].explanation}</div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {q.explanation && (
                              <div style={{marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px dashed var(--border)', paddingTop: 8}}>
                                <strong>해설:</strong> {q.explanation}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {renderResults()}
          </>
        )}

        {activeTab === 'create' && (
          <div style={{maxWidth: 720, margin: '0 auto'}}>
            {/* Create Quiz UI */}
            <div style={{background: 'var(--surface)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', marginBottom: 24}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                <h2 style={{fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8}}><FileText size={20} color="var(--primary)"/> 퀴즈 설정</h2>
                <div style={{display: 'flex', gap: 8}}>
                  <button onClick={() => {
                    setActiveQuiz({
                      id: `q-${new Date().toISOString().split('T')[0]}-${Math.random().toString(36).substr(2, 5)}`,
                      date: new Date().toISOString().split('T')[0],
                      title: '',
                      description: '',
                      questions: [],
                      isPublished: true,
                      visibleTo: undefined
                    });
                    setAiPreviews({});
                  }} style={{display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 14}}>
                    새 퀴즈
                  </button>
                  <button onClick={() => setActiveQuiz({...activeQuiz, isPublished: !activeQuiz.isPublished})} style={{display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', background: activeQuiz.isPublished ? 'rgba(39, 174, 96, 0.1)' : 'rgba(139, 149, 161, 0.1)', color: activeQuiz.isPublished ? '#27AE60' : 'var(--text-secondary)', fontWeight: 700, fontSize: 14}}>
                    {activeQuiz.isPublished ? <><Eye size={18} /> 공개</> : <><EyeOff size={18} /> 비공개</>}
                  </button>
                  <button onClick={handleSaveQuiz} disabled={loading} style={{display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: 14}}>{loading ? <RefreshCw className="animate-spin" size={18} /> : <><Check size={18} /> 저장하기</>}</button>
                </div>
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                <input type="text" value={activeQuiz.title} onChange={(e) => setActiveQuiz({...activeQuiz, title: e.target.value})} placeholder="퀴즈 제목" style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15}}/>
                <input type="date" value={activeQuiz.date} onChange={(e) => setActiveQuiz({...activeQuiz, date: e.target.value, id: `q-${e.target.value}`})} style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15}}/>
                <textarea value={activeQuiz.description} onChange={(e) => setActiveQuiz({...activeQuiz, description: e.target.value})} placeholder="상세 설명" style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15, minHeight: 80}}/>
                
                <div style={{borderTop: '1px solid var(--border)', paddingTop: 16}}>
                  <label style={{display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)'}}>대상 팀원 설정</label>
                  <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
                    <button
                      onClick={() => {
                        const isAllSelected = !activeQuiz.visibleTo || activeQuiz.visibleTo.length === 0;
                        if (isAllSelected) {
                          setActiveQuiz({ ...activeQuiz, visibleTo: [] });
                        } else {
                          setActiveQuiz({ ...activeQuiz, visibleTo: undefined });
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 12,
                        border: 'none',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: (!activeQuiz.visibleTo || activeQuiz.visibleTo.length === 0) ? 'var(--primary)' : 'var(--bg-color)',
                        color: (!activeQuiz.visibleTo || activeQuiz.visibleTo.length === 0) ? 'white' : 'var(--text-secondary)',
                        transition: 'all 0.2s'
                      }}
                    >
                      전체 공개
                    </button>
                    {dynamicTeam.map(student => {
                      const isSelected = activeQuiz.visibleTo?.includes(student.id);
                      const isAllMode = !activeQuiz.visibleTo || activeQuiz.visibleTo.length === 0;
                      return (
                        <button
                          key={student.id}
                          onClick={() => {
                            let currentVisibleTo = activeQuiz.visibleTo ? [...activeQuiz.visibleTo] : [];
                            if (currentVisibleTo.includes(student.id)) {
                              currentVisibleTo = currentVisibleTo.filter(id => id !== student.id);
                            } else {
                              currentVisibleTo.push(student.id);
                            }
                            setActiveQuiz({ ...activeQuiz, visibleTo: currentVisibleTo });
                          }}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 12,
                            border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(49, 130, 246, 0.1)' : 'var(--surface)',
                            color: isSelected ? 'var(--primary)' : 'var(--text-secondary)',
                            transition: 'all 0.2s',
                            opacity: isAllMode ? 0.6 : 1
                          }}
                        >
                          {student.name} ({student.id})
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            {activeQuiz.questions.map((q, idx) => (
              <div key={q.id} style={{background: 'var(--surface)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', position: 'relative', marginBottom: 20}}>
                <button onClick={() => setActiveQuiz(p => ({ ...p, questions: p.questions.filter(qu => qu.id !== q.id) }))} style={{position: 'absolute', top: 20, right: 20, background: 'rgba(231, 76, 60, 0.1)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#E74C3C'}}><Trash2 size={16} /></button>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20}}><span style={{background: 'var(--primary)', color: 'white', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800}}>{idx + 1}</span><span style={{fontSize: 14, fontWeight: 800, color: 'var(--primary)'}}>{q.type === 'short' ? '주관식' : '객관식'}</span></div>
                <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                  <input type="text" placeholder="질문" value={q.title} onChange={(e) => updateQuestion(q.id, {title: e.target.value})} style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15, fontWeight: 600}}/>
                  {q.type !== 'short' && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                      <div style={{fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)'}}>객관식 보기 설정 (체크박스를 선택하면 정답으로 지정됩니다)</div>
                      {q.options?.map((opt, oIdx) => {
                        const isCorrect = q.correctAnswers?.includes(oIdx.toString());
                        return (
                          <div key={oIdx} style={{display: 'flex', alignItems: 'center', gap: 10}}>
                            <input
                              type="checkbox"
                              checked={isCorrect}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                let updatedCorrects = [...(q.correctAnswers || [])];
                                if (checked) {
                                  if (!updatedCorrects.includes(oIdx.toString())) {
                                    updatedCorrects.push(oIdx.toString());
                                  }
                                } else {
                                  updatedCorrects = updatedCorrects.filter(c => c !== oIdx.toString());
                                }
                                updateQuestion(q.id, { correctAnswers: updatedCorrects });
                              }}
                              style={{width: 20, height: 20, cursor: 'pointer'}}
                            />
                            <input
                              type="text"
                              placeholder={`보기 ${oIdx + 1}`}
                              value={opt}
                              onChange={(e) => {
                                const newOpts = [...(q.options || [])];
                                newOpts[oIdx] = e.target.value;
                                updateQuestion(q.id, { options: newOpts });
                              }}
                              style={{flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14}}
                            />
                            {(q.options && q.options.length > 2) && (
                              <button
                                onClick={() => {
                                  const newOpts = q.options!.filter((_, oi) => oi !== oIdx);
                                  // Adjust correctAnswers indices after deletion
                                  let newCorrects = (q.correctAnswers || [])
                                    .map(c => parseInt(c))
                                    .filter(c => c !== oIdx)
                                    .map(c => c > oIdx ? (c - 1).toString() : c.toString());
                                  updateQuestion(q.id, { options: newOpts, correctAnswers: newCorrects });
                                }}
                                style={{background: 'transparent', border: 'none', color: '#E74C3C', cursor: 'pointer', fontSize: 13, fontWeight: 600}}
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <button
                        onClick={() => {
                          const newOpts = [...(q.options || []), ''];
                          updateQuestion(q.id, { options: newOpts });
                        }}
                        style={{alignSelf: 'flex-start', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer'}}
                      >
                        + 보기 추가
                      </button>
                    </div>
                  )}
                  {q.type === 'short' && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8}}>
                      <button
                        onClick={async () => {
                          if (!q.title.trim()) {
                            alert('질문을 먼저 입력해 주세요.');
                            return;
                          }
                          setAiPreviews(prev => ({ ...prev, [q.id]: { correctAnswer: '', explanation: '', loading: true } }));
                          try {
                            const res = await fetchAiPreview(q.title, q.description || '');
                            setAiPreviews(prev => ({ ...prev, [q.id]: { ...res, loading: false } }));
                          } catch (err) {
                            setAiPreviews(prev => ({ ...prev, [q.id]: { correctAnswer: '', explanation: '', loading: false, error: 'AI 모범 답안 로딩 실패' } }));
                          }
                        }}
                        disabled={aiPreviews[q.id]?.loading}
                        style={{
                          alignSelf: 'flex-start',
                          background: 'rgba(49, 130, 246, 0.1)',
                          color: 'var(--primary)',
                          border: 'none',
                          padding: '10px 16px',
                          borderRadius: 12,
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          outline: 'none',
                          transition: 'all 0.2s'
                        }}
                      >
                        {aiPreviews[q.id]?.loading ? (
                          <>
                            <RefreshCw className="animate-spin" size={14} /> AI 분석 및 답안 생성 중...
                          </>
                        ) : (
                          <>✨ AI 모범 답안 및 해설 미리보기</>
                        )}
                      </button>

                      {aiPreviews[q.id] && !aiPreviews[q.id].loading && (
                        <div style={{background: 'var(--bg-color)', padding: 16, borderRadius: 16, border: '1px solid var(--border)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 12}}>
                          {aiPreviews[q.id].error ? (
                            <div style={{color: '#E74C3C', fontWeight: 600}}>{aiPreviews[q.id].error}</div>
                          ) : (
                            <>
                              <div>
                                <div style={{color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, marginBottom: 4}}>💡 생성된 AI 모범 답안:</div>
                                <pre style={{margin: 0, padding: 10, background: 'var(--surface)', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', overflowX: 'auto', border: '1px solid var(--border)'}}>
                                  {aiPreviews[q.id].correctAnswer}
                                </pre>
                              </div>
                              <div>
                                <div style={{color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, marginBottom: 4}}>💡 생성된 AI 상세 해설:</div>
                                <div style={{color: 'var(--text-secondary)', lineHeight: 1.5}}>
                                  {aiPreviews[q.id].explanation}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div style={{display: 'flex', gap: 8, marginBottom: 100}}>
              <button onClick={() => addQuestion('multiple')} className="btn btn-secondary">+ 객관식</button>
              <button onClick={() => addQuestion('short')} className="btn btn-secondary">+ 주관식</button>
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div style={{maxWidth: 600, margin: '0 auto'}}>
            <div style={{background: 'var(--surface)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', marginBottom: 24}}>
              <h2 style={{fontSize: 18, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8}}><UserPlus size={20} color="var(--primary)"/> 팀원 추가</h2>
              <div style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
                <input type="text" placeholder="학번 (ID)" value={newStudent.id} onChange={(e) => setNewStudent({...newStudent, id: e.target.value})} style={{flex: '1 1 200px', padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15, background: 'var(--bg-color)', outline: 'none'}}/>
                <input type="text" placeholder="이름" value={newStudent.name} onChange={(e) => setNewStudent({...newStudent, name: e.target.value})} style={{flex: '1 1 150px', padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15, background: 'var(--bg-color)', outline: 'none'}}/>
                <button onClick={handleAddStudent} disabled={loading} className="btn btn-primary" style={{flex: '0 0 auto', minWidth: 120, padding: '0 28px', borderRadius: 12, fontWeight: 700, fontSize: 15, height: 48, boxShadow: '0 4px 12px rgba(49, 130, 246, 0.2)'}}>팀원 등록</button>
              </div>
            </div>
            <div style={{background: 'var(--surface)', padding: 24, borderRadius: 20, border: '1px solid var(--border)'}}>
              <h2 style={{fontSize: 18, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8}}><Users size={20} color="var(--primary)"/> 팀원 목록 ({dynamicTeam.length})</h2>
              {dynamicTeam.map(student => (
                <div key={student.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-color)', borderRadius: 12, marginBottom: 8}}>
                  <div><span style={{fontWeight: 700, marginRight: 12}}>{student.name}</span><span style={{fontSize: 13, color: 'var(--text-secondary)'}}>{student.id}</span></div>
                  <button onClick={() => handleDeleteStudent(student.id)} style={{background: 'transparent', border: 'none', color: '#E74C3C', cursor: 'pointer'}}><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
