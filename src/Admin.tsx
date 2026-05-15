import { useState, useEffect } from 'react';
import { type Quiz, type Question, type QuestionType } from './data';
import { teamMembers } from './team';
import { getQuizResults, saveQuiz, deleteQuiz, type Progress } from './api';
import { ArrowLeft, RefreshCw, Trash2, Edit3, Trash, Eye, EyeOff, Upload, FileText } from 'lucide-react';

interface AdminProps {
  onBack: () => void;
  dynamicQuizzes: Quiz[];
  onRefresh: () => void;
}

export default function Admin({ onBack, dynamicQuizzes, onRefresh }: AdminProps) {
  const [activeTab, setActiveTab] = useState<'results' | 'create'>('results');
  const [selectedQuizId, setSelectedQuizId] = useState(dynamicQuizzes[0]?.id || '');
  const [results, setResults] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkJson, setBulkJson] = useState('');

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
      const copy = JSON.parse(JSON.stringify(quizToEdit));
      if (copy.isPublished === undefined) copy.isPublished = true;
      setActiveQuiz(copy);
      setActiveTab('create');
    }
  };

  const handleDeleteQuiz = async () => {
    if (!selectedQuizId) return;
    if (!window.confirm("정말로 이 퀴즈를 삭제하시겠습니까?")) return;
    
    setLoading(true);
    try {
      await deleteQuiz(selectedQuizId);
      alert("퀴즈가 삭제되었습니다.");
      onRefresh();
      if (dynamicQuizzes.length > 1) {
        setSelectedQuizId(dynamicQuizzes[0].id === selectedQuizId ? dynamicQuizzes[1].id : dynamicQuizzes[0].id);
      }
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
    setLoading(false);
  };

  const resetEditor = () => {
    setActiveQuiz({
      id: `q-${new Date().toISOString().split('T')[0]}`,
      date: new Date().toISOString().split('T')[0],
      title: '',
      description: '',
      questions: [],
      isPublished: true
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

  const handleBulkImport = () => {
    try {
      const parsed = JSON.parse(bulkJson);
      if (Array.isArray(parsed)) {
        setActiveQuiz(prev => ({ ...prev, questions: [...prev.questions, ...parsed] }));
        setShowBulkImport(false);
        setBulkJson('');
        alert(`${parsed.length}개의 문제가 추가되었습니다.`);
      } else {
        alert("JSON 형식이 올바르지 않습니다. 배열 형태여야 합니다.");
      }
    } catch (e) {
      alert("JSON 파싱 오류: 형식을 확인해주세요.");
    }
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
      alert("제목과 문제를 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      const cleanedQuiz = JSON.parse(JSON.stringify(activeQuiz));
      await saveQuiz(cleanedQuiz);
      alert("저장 성공!");
      onRefresh();
      setActiveTab('results');
      setSelectedQuizId(activeQuiz.id);
    } catch (e: any) {
      console.error(e);
      alert(`저장 실패: ${e.message}`);
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
          <button onClick={() => setActiveTab('results')} style={{padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: activeTab === 'results' ? 'var(--surface)' : 'transparent', color: activeTab === 'results' ? 'var(--primary)' : 'var(--text-secondary)'}}>
            결과 확인
          </button>
          <button onClick={() => { resetEditor(); setActiveTab('create'); }} style={{padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: activeTab === 'create' ? 'var(--surface)' : 'transparent', color: activeTab === 'create' ? 'var(--primary)' : 'var(--text-secondary)'}}>
            새 퀴즈
          </button>
        </div>
      </header>

      <div style={{padding: 24, overflowY: 'auto', flex: 1}}>
        {activeTab === 'results' ? (
          <>
            <div style={{marginBottom: 24}}>
              <label style={{display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)'}}>퀴즈 관리</label>
              <div style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
                <select value={selectedQuizId} onChange={(e) => setSelectedQuizId(e.target.value)} style={{flex: 1, minWidth: 200, padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 16}}>
                  {dynamicQuizzes.map(q => (
                    <option key={q.id} value={q.id}>{q.date} - {q.title} {q.isPublished === false ? '(비공개)' : ''}</option>
                  ))}
                </select>
                <div style={{display: 'flex', gap: 8}}>
                  <button onClick={loadQuizForEdit} style={{background: 'var(--bg-color)', border: 'none', borderRadius: 12, padding: '0 16px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6}}>
                    <Edit3 size={18} /> 수정
                  </button>
                  <button onClick={handleDeleteQuiz} style={{background: 'rgba(231, 76, 60, 0.05)', border: 'none', borderRadius: 12, padding: '0 16px', cursor: 'pointer', color: '#E74C3C'}}>
                    <Trash size={18} />
                  </button>
                  <button onClick={fetchResults} disabled={loading} style={{background: 'var(--bg-color)', border: 'none', borderRadius: 12, padding: '0 16px', cursor: 'pointer', color: 'var(--primary)'}}>
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
              {teamMembers.map(member => {
                const result = results.find(r => r.studentId === member.id);
                const isCompleted = !!result;
                return (
                  <div key={member.id}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)'}}>
                      <div>
                        <div style={{fontWeight: 700, fontSize: 16, marginBottom: 4}}>{member.name}</div>
                        <div style={{fontSize: 13, color: 'var(--text-secondary)'}}>{member.id}</div>
                      </div>
                      <div style={{textAlign: 'right'}}>
                        {isCompleted ? <div style={{color: '#27AE60', fontWeight: 700}}>{result.score} / {result.total}</div> : <div style={{color: 'var(--text-secondary)'}}>미완료</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{maxWidth: 720, margin: '0 auto'}}>
            <div style={{background: 'var(--surface)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', marginBottom: 24}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                <h2 style={{fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8}}>
                  <FileText size={20} color="var(--primary)"/> 퀴즈 설정
                </h2>
                <button 
                  onClick={() => setActiveQuiz({...activeQuiz, isPublished: !activeQuiz.isPublished})}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: activeQuiz.isPublished ? 'rgba(39, 174, 96, 0.1)' : 'rgba(139, 149, 161, 0.1)',
                    color: activeQuiz.isPublished ? '#27AE60' : 'var(--text-secondary)',
                    fontWeight: 700, fontSize: 14
                  }}
                >
                  {activeQuiz.isPublished ? <><Eye size={18} /> 공개 상태</> : <><EyeOff size={18} /> 비공개 상태</>}
                </button>
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                <input type="text" value={activeQuiz.title} onChange={(e) => setActiveQuiz({...activeQuiz, title: e.target.value})} placeholder="퀴즈 제목" style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15}}/>
                <input type="date" value={activeQuiz.date} onChange={(e) => setActiveQuiz({...activeQuiz, date: e.target.value, id: `q-${e.target.value}`})} style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15}}/>
                <textarea value={activeQuiz.description} onChange={(e) => setActiveQuiz({...activeQuiz, description: e.target.value})} placeholder="상세 설명" style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15, minHeight: 80}}/>
              </div>
            </div>

            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
              <h2 style={{fontSize: 18, fontWeight: 700}}>문제 리스트 ({activeQuiz.questions.length})</h2>
              <div style={{display: 'flex', gap: 8}}>
                <button onClick={() => setShowBulkImport(!showBulkImport)} className="btn btn-secondary" style={{padding: '8px 12px', fontSize: 13, background: 'rgba(49, 130, 246, 0.05)', color: 'var(--primary)'}}>
                  <Upload size={16} /> 대량 추가
                </button>
                <button onClick={() => addQuestion('multiple')} className="btn btn-secondary" style={{padding: '8px 12px', fontSize: 13}}>+ 객관식</button>
                <button onClick={() => addQuestion('short')} className="btn btn-secondary" style={{padding: '8px 12px', fontSize: 13}}>+ 주관식</button>
              </div>
            </div>

            {showBulkImport && (
              <div style={{background: 'var(--bg-color)', padding: 20, borderRadius: 20, marginBottom: 20, border: '1px dashed var(--primary)'}}>
                <label style={{display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 10}}>JSON 데이터 붙여넣기 (Question 배열)</label>
                <textarea 
                  value={bulkJson}
                  onChange={(e) => setBulkJson(e.target.value)}
                  placeholder='[{"type":"multiple","title":"질문",...}]'
                  style={{width: '100%', minHeight: 150, padding: 12, borderRadius: 12, border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 12, marginBottom: 12}}
                />
                <div style={{display: 'flex', gap: 8}}>
                  <button onClick={handleBulkImport} className="btn btn-primary" style={{padding: '10px 20px', fontSize: 14}}>가져오기</button>
                  <button onClick={() => setShowBulkImport(false)} className="btn btn-secondary" style={{padding: '10px 20px', fontSize: 14}}>취소</button>
                </div>
              </div>
            )}

            <div style={{display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 100}}>
              {activeQuiz.questions.map((q, idx) => (
                <div key={q.id} style={{background: 'var(--surface)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', position: 'relative'}}>
                  <button onClick={() => removeQuestion(q.id)} style={{position: 'absolute', top: 20, right: 20, background: 'rgba(231, 76, 60, 0.1)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#E74C3C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><Trash2 size={16} /></button>
                  <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20}}>
                    <span style={{background: 'var(--primary)', color: 'white', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800}}>{idx + 1}</span>
                    <span style={{fontSize: 14, fontWeight: 800, color: 'var(--primary)'}}>{q.type === 'short' ? '주관식(코딩)' : '객관식'}</span>
                  </div>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                    <input type="text" placeholder="질문" value={q.title} onChange={(e) => updateQuestion(q.id, {title: e.target.value})} style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 15, fontWeight: 600}}/>
                    {q.type === 'multiple' && q.options && (
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} style={{display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-color)', padding: '8px 12px', borderRadius: 12, border: q.correctAnswers[0] === optIdx.toString() ? '1px solid var(--primary)' : '1px solid transparent'}}>
                            <input type="radio" checked={q.correctAnswers[0] === optIdx.toString()} onChange={() => updateQuestion(q.id, {correctAnswers: [optIdx.toString()]})}/>
                            <input type="text" value={opt} onChange={(e) => { const n = [...q.options!]; n[optIdx] = e.target.value; updateQuestion(q.id, {options: n}); }} style={{flex: 1, background: 'transparent', border: 'none', fontSize: 14, outline: 'none'}}/>
                          </div>
                        ))}
                      </div>
                    )}
                    {q.type === 'short' && (
                      <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                        <textarea value={q.setupCode} onChange={(e) => updateQuestion(q.id, {setupCode: e.target.value})} placeholder="초기 코드" style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'monospace', minHeight: 60}}/>
                        <textarea value={q.validationCode} onChange={(e) => updateQuestion(q.id, {validationCode: e.target.value})} placeholder="검증 코드" style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'monospace', minHeight: 60}}/>
                      </div>
                    )}
                    <textarea value={q.explanation} onChange={(e) => updateQuestion(q.id, {explanation: e.target.value})} placeholder="해설" style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 14, minHeight: 60}}/>
                  </div>
                </div>
              ))}
            </div>

            <div style={{position: 'sticky', bottom: 20, zIndex: 100, display: 'flex', gap: 12}}>
              <button onClick={() => setActiveTab('results')} className="btn btn-secondary" style={{flex: 1, padding: 18}}>취소</button>
              <button onClick={handleSaveQuiz} disabled={loading} className="btn btn-primary" style={{flex: 2, padding: 18, boxShadow: '0 8px 32px rgba(49, 130, 246, 0.3)'}}>{loading ? <RefreshCw className="animate-spin" /> : '저장하기'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
