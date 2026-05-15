import { useState, useEffect } from 'react';
import { quizzes as staticQuizzes, type Quiz, type Question, type QuestionType } from './data';
import { teamMembers } from './team';
import { getQuizResults, saveQuiz, type Progress } from './api';
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, Plus, Trash2, Save, ListChecks, FileText, Edit3 } from 'lucide-react';

interface AdminProps {
  onBack: () => void;
  dynamicQuizzes: Quiz[];
}

export default function Admin({ onBack, dynamicQuizzes }: AdminProps) {
  const [activeTab, setActiveTab] = useState<'results' | 'create'>('results');
  const [selectedQuizId, setSelectedQuizId] = useState(dynamicQuizzes[0]?.id || '');
  const [results, setResults] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(false);

  // Quiz Editor State
  const [activeQuiz, setActiveQuiz] = useState<Quiz>({
    id: `q-${new Date().toISOString().split('T')[0]}`,
    date: new Date().toISOString().split('T')[0],
    title: '',
    description: '',
    questions: []
  });

  const fetchResults = async () => {
    if (!selectedQuizId) return;
    setLoading(true);
    try {
      const res = await getQuizResults(selectedQuizId);
      setResults(res);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'results') {
      fetchResults();
    }
  }, [selectedQuizId, activeTab]);

  const loadQuizForEdit = () => {
    const quizToEdit = dynamicQuizzes.find(q => q.id === selectedQuizId);
    if (quizToEdit) {
      setActiveQuiz(JSON.parse(JSON.stringify(quizToEdit))); // Deep copy
      setActiveTab('create');
    }
  };

  const resetEditor = () => {
    setActiveQuiz({
      id: `q-${new Date().toISOString().split('T')[0]}`,
      date: new Date().toISOString().split('T')[0],
      title: '',
      description: '',
      questions: []
    });
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
      validationCode: type === 'short' ? '' : undefined
    };
    setActiveQuiz(prev => ({ ...prev, questions: [...prev.questions, q] }));
  };

  const removeQuestion = (id: string) => {
    setActiveQuiz(prev => ({ ...prev, questions: prev.questions.filter(q => q.id !== id) }));
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setActiveQuiz(prev => ({
      ...prev,
      questions: prev.questions.map(q => q.id === id ? { ...q, ...updates } : q)
    }));
  };

  const handleSaveQuiz = async () => {
    if (!activeQuiz.title || activeQuiz.questions.length === 0) {
      alert("제목과 최소 1개 이상의 문제를 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      // Remove any undefined/null fields that Firestore might reject
      const cleanedQuiz = JSON.parse(JSON.stringify(activeQuiz));
      await saveQuiz(cleanedQuiz);
      alert("퀴즈가 성공적으로 저장되었습니다!");
      setActiveTab('results');
      setSelectedQuizId(activeQuiz.id);
    } catch (e: any) {
      console.error("Save error:", e);
      alert(`저장 실패: ${e.message || '알 수 없는 오류'}\n\nFirebase Console에서 Firestore 보안 규칙(Rules)이 'allow read, write: if true;'로 설정되어 있는지 확인해주세요.`);
    }
    setLoading(false);
  };

  return (
    <div className="app-container" style={{background: 'var(--surface)', padding: 0, maxWidth: 1000}}>
      <header className="app-header" style={{display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid var(--border)'}}>
        <button onClick={onBack} style={{background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)'}}>
          <ArrowLeft size={24} />
        </button>
        <h1 style={{fontSize: 20, fontWeight: 700, margin: 0}}>관리자 센터</h1>
        
        <div style={{display: 'flex', gap: 8, marginLeft: 'auto', background: 'var(--bg-color)', padding: 4, borderRadius: 12}}>
          <button 
            onClick={() => setActiveTab('results')}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: activeTab === 'results' ? 'var(--surface)' : 'transparent',
              boxShadow: activeTab === 'results' ? 'var(--shadow-sm)' : 'none',
              color: activeTab === 'results' ? 'var(--primary)' : 'var(--text-secondary)'
            }}
          >
            <ListChecks size={16} style={{display: 'inline', marginRight: 4, verticalAlign: 'middle'}}/> 결과 확인
          </button>
          <button 
            onClick={() => {
              resetEditor();
              setActiveTab('create');
            }}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: activeTab === 'create' ? 'var(--surface)' : 'transparent',
              boxShadow: activeTab === 'create' ? 'var(--shadow-sm)' : 'none',
              color: activeTab === 'create' ? 'var(--primary)' : 'var(--text-secondary)'
            }}
          >
            <Plus size={16} style={{display: 'inline', marginRight: 4, verticalAlign: 'middle'}}/> 새 퀴즈
          </button>
        </div>
      </header>

      <div style={{padding: 24, overflowY: 'auto', flex: 1}}>
        {activeTab === 'results' ? (
          <>
            <div style={{marginBottom: 24}}>
              <label style={{display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)'}}>퀴즈 선택</label>
              <div style={{display: 'flex', gap: 12}}>
                <select 
                  value={selectedQuizId} 
                  onChange={(e) => setSelectedQuizId(e.target.value)}
                  style={{flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 16, cursor: 'pointer', outline: 'none', appearance: 'none', boxShadow: 'var(--shadow-sm)'}}
                >
                  {dynamicQuizzes.map(q => (
                    <option key={q.id} value={q.id}>{q.date} - {q.title}</option>
                  ))}
                </select>
                <button onClick={loadQuizForEdit} style={{background: 'var(--bg-color)', border: 'none', borderRadius: 12, padding: '0 16px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6}}>
                  <Edit3 size={18} /> 수정
                </button>
                <button onClick={fetchResults} disabled={loading} style={{background: 'var(--bg-color)', border: 'none', borderRadius: 12, padding: '0 16px', cursor: 'pointer', color: 'var(--primary)'}}>
                  <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            <div style={{display: 'flex', gap: 12, marginBottom: 24}}>
              <div className="admin-stat-card">
                <div style={{color: 'var(--primary)', fontWeight: 700, fontSize: 24}}>{results.length} / {teamMembers.length}</div>
                <div style={{fontSize: 13, color: 'var(--text-secondary)', marginTop: 4}}>완료 인원</div>
              </div>
              <div className="admin-stat-card">
                <div style={{color: '#27AE60', fontWeight: 700, fontSize: 24}}>
                  {results.length ? Math.round(results.reduce((acc, r) => acc + (r.score / r.total) * 100, 0) / results.length) : 0}점
                </div>
                <div style={{fontSize: 13, color: 'var(--text-secondary)', marginTop: 4}}>평균 점수</div>
              </div>
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
              {teamMembers.map(member => {
                const result = results.find(r => r.studentId === member.id);
                const isCompleted = !!result;
                
                return (
                  <div key={member.id}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', position: 'relative', zIndex: 2}}>
                      <div>
                        <div style={{fontWeight: 700, fontSize: 16, marginBottom: 4}}>{member.name}</div>
                        <div style={{fontSize: 13, color: 'var(--text-secondary)'}}>{member.id}</div>
                      </div>
                      
                      <div style={{textAlign: 'right'}}>
                        {isCompleted ? (
                          <>
                            <div style={{display: 'flex', alignItems: 'center', gap: 6, color: '#27AE60', fontWeight: 700, marginBottom: 4, justifyContent: 'flex-end'}}>
                              <CheckCircle2 size={16} /> 완료
                            </div>
                            <div style={{fontSize: 14, fontWeight: 600}}>
                              {result.score} / {result.total}
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontWeight: 600, justifyContent: 'flex-end'}}>
                              <XCircle size={16} /> 미완료
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {isCompleted && result.detailedResults && (
                      <div style={{padding: '32px 20px 20px', marginTop: -20, background: 'var(--surface)', borderRadius: '0 0 16px 16px', border: '1px solid var(--border)', borderTop: 'none', display: 'flex', gap: 6, flexWrap: 'wrap', position: 'relative', zIndex: 1}}>
                        {Object.values(result.detailedResults).map((correct, idx) => (
                          <div 
                            key={idx} 
                            style={{
                              width: 28, height: 28, borderRadius: 6, 
                              background: correct ? 'rgba(39, 174, 96, 0.1)' : 'rgba(231, 76, 60, 0.1)', 
                              color: correct ? '#27AE60' : '#E74C3C',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
                              border: `1px solid ${correct ? 'rgba(39, 174, 96, 0.2)' : 'rgba(231, 76, 60, 0.2)'}`
                            }}
                          >
                            {idx + 1}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{maxWidth: 720, margin: '0 auto'}}>
            <div style={{background: 'var(--surface)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', marginBottom: 24}}>
              <h2 style={{fontSize: 18, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8}}>
                <FileText size={20} color="var(--primary)"/> 퀴즈 정보 수정
              </h2>
              <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                <div>
                  <label style={{display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)'}}>퀴즈 제목</label>
                  <input 
                    type="text" 
                    value={activeQuiz.title}
                    onChange={(e) => setActiveQuiz({...activeQuiz, title: e.target.value})}
                    placeholder="예: 2주차 파이썬 기초 점검"
                    style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15}}
                  />
                </div>
                <div style={{display: 'flex', gap: 12}}>
                  <div style={{flex: 1}}>
                    <label style={{display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)'}}>날짜</label>
                    <input 
                      type="date" 
                      value={activeQuiz.date}
                      onChange={(e) => setActiveQuiz({...activeQuiz, date: e.target.value, id: `q-${e.target.value}`})}
                      style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15}}
                    />
                  </div>
                  <div style={{flex: 1}}>
                    <label style={{display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)'}}>고유 ID (날짜 변경 시 자동 갱신)</label>
                    <input 
                      type="text" 
                      value={activeQuiz.id}
                      disabled
                      style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15, background: 'var(--bg-color)', color: 'var(--text-tertiary)'}}
                    />
                  </div>
                </div>
                <div>
                  <label style={{display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)'}}>상세 설명</label>
                  <textarea 
                    value={activeQuiz.description}
                    onChange={(e) => setActiveQuiz({...activeQuiz, description: e.target.value})}
                    placeholder="퀴즈에 대한 설명을 입력하세요."
                    style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15, minHeight: 80}}
                  />
                </div>
              </div>
            </div>

            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
              <h2 style={{fontSize: 18, fontWeight: 700}}>문제 리스트 ({activeQuiz.questions.length})</h2>
              <div style={{display: 'flex', gap: 8}}>
                <button onClick={() => addQuestion('multiple')} className="btn btn-secondary" style={{padding: '8px 12px', fontSize: 13}}>
                  + 객관식 추가
                </button>
                <button onClick={() => addQuestion('short')} className="btn btn-secondary" style={{padding: '8px 12px', fontSize: 13}}>
                  + 주관식 추가
                </button>
              </div>
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 40}}>
              {activeQuiz.questions.map((q, idx) => (
                <div key={q.id} style={{background: 'var(--surface)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', position: 'relative'}}>
                  <button 
                    onClick={() => removeQuestion(q.id)}
                    style={{position: 'absolute', top: 20, right: 20, background: 'transparent', border: 'none', color: '#E74C3C', cursor: 'pointer'}}
                  >
                    <Trash2 size={18} />
                  </button>
                  
                  <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16}}>
                    <span style={{background: 'var(--primary)', color: 'white', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700}}>
                      {idx + 1}
                    </span>
                    <span style={{fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase'}}>
                      {q.type === 'short' ? '주관식(코딩)' : '객관식'}
                    </span>
                  </div>

                  <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                    <input 
                      type="text" 
                      placeholder="질문 제목을 입력하세요."
                      value={q.title}
                      onChange={(e) => updateQuestion(q.id, {title: e.target.value})}
                      style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15, fontWeight: 600}}
                    />
                    
                    {q.type === 'multiple' && q.options && (
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} style={{display: 'flex', alignItems: 'center', gap: 8}}>
                            <input 
                              type="radio" 
                              name={`correct-${q.id}`}
                              checked={q.correctAnswers[0] === optIdx.toString()}
                              onChange={() => updateQuestion(q.id, {correctAnswers: [optIdx.toString()]})}
                            />
                            <input 
                              type="text" 
                              placeholder={`보기 ${optIdx + 1}`}
                              value={opt}
                              onChange={(e) => {
                                const newOpts = [...q.options!];
                                newOpts[optIdx] = e.target.value;
                                updateQuestion(q.id, {options: newOpts});
                              }}
                              style={{flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14}}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {q.type === 'short' && (
                      <>
                        <div>
                          <label style={{display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)'}}>초기 코드 (Setup Code)</label>
                          <textarea 
                            value={q.setupCode}
                            onChange={(e) => updateQuestion(q.id, {setupCode: e.target.value})}
                            placeholder="예: a = [1, 2, 3]"
                            style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'monospace', minHeight: 60}}
                          />
                        </div>
                        <div>
                          <label style={{display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)'}}>검증 코드 (Validation Code)</label>
                          <textarea 
                            value={q.validationCode}
                            onChange={(e) => updateQuestion(q.id, {validationCode: e.target.value})}
                            placeholder="예: a == [1, 2, 3, 4]"
                            style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'monospace', minHeight: 60}}
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label style={{display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)'}}>해설</label>
                      <textarea 
                        value={q.explanation}
                        onChange={(e) => updateQuestion(q.id, {explanation: e.target.value})}
                        style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 14, minHeight: 60}}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={handleSaveQuiz}
              disabled={loading}
              className="btn btn-primary" 
              style={{width: '100%', padding: 20, position: 'sticky', bottom: 20, boxShadow: '0 8px 32px rgba(49, 130, 246, 0.3)', zIndex: 100}}
            >
              {loading ? <RefreshCw className="animate-spin" /> : <><Save size={20} /> 퀴즈 저장하기</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
