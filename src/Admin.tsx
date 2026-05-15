import { useState, useEffect } from 'react';
import { quizzes } from './data';
import { teamMembers } from './team';
import { getQuizResults, type Progress } from './api';
import { ArrowLeft, RefreshCw, Users, CheckCircle2, XCircle } from 'lucide-react';

interface AdminProps {
  onBack: () => void;
}

export default function Admin({ onBack }: AdminProps) {
  const [selectedQuizId, setSelectedQuizId] = useState(quizzes[0]?.id || '');
  const [results, setResults] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(false);

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
    fetchResults();
  }, [selectedQuizId]);

  return (
    <div className="app-container" style={{background: 'var(--surface)', padding: 0}}>
      <header className="app-header" style={{display: 'flex', alignItems: 'center', gap: 16}}>
        <button onClick={onBack} style={{background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)'}}>
          <ArrowLeft size={24} />
        </button>
        <h1 style={{fontSize: 20, fontWeight: 700, margin: 0}}>관리자 대시보드</h1>
        <button onClick={fetchResults} disabled={loading} style={{marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--primary)'}}>
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div style={{padding: 24}}>
        <div style={{marginBottom: 24}}>
          <label style={{display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)'}}>날짜 / 퀴즈 선택</label>
          <select 
            value={selectedQuizId} 
            onChange={(e) => setSelectedQuizId(e.target.value)}
            style={{width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 16, cursor: 'pointer', outline: 'none', appearance: 'none', boxShadow: 'var(--shadow-sm)'}}
          >
            {quizzes.map(q => (
              <option key={q.id} value={q.id}>{q.date} - {q.title}</option>
            ))}
          </select>
        </div>

        <div style={{display: 'flex', gap: 12, marginBottom: 24}}>
          <div style={{flex: 1, background: 'rgba(49, 130, 246, 0.05)', padding: 16, borderRadius: 12, textAlign: 'center'}}>
            <div style={{color: 'var(--primary)', fontWeight: 700, fontSize: 24}}>{results.length} / {teamMembers.length}</div>
            <div style={{fontSize: 13, color: 'var(--text-secondary)', marginTop: 4}}>완료 인원</div>
          </div>
          <div style={{flex: 1, background: 'rgba(39, 174, 96, 0.05)', padding: 16, borderRadius: 12, textAlign: 'center'}}>
            <div style={{color: '#27AE60', fontWeight: 700, fontSize: 24}}>
              {results.length ? Math.round(results.reduce((acc, r) => acc + (r.score / r.total) * 100, 0) / results.length) : 0}점
            </div>
            <div style={{fontSize: 13, color: 'var(--text-secondary)', marginTop: 4}}>평균 점수</div>
          </div>
        </div>

        <h3 style={{fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8}}>
          <Users size={18} /> 팀원별 현황
        </h3>

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
                          width: 28, 
                          height: 28, 
                          borderRadius: 6, 
                          background: correct ? 'rgba(39, 174, 96, 0.1)' : 'rgba(231, 76, 60, 0.1)', 
                          color: correct ? '#27AE60' : '#E74C3C',
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontSize: 12, 
                          fontWeight: 800,
                          border: `1px solid ${correct ? 'rgba(39, 174, 96, 0.2)' : 'rgba(231, 76, 60, 0.2)'}`
                        }}
                        title={`문제 ${idx + 1}: ${correct ? '정답' : '오답'}`}
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
      </div>
    </div>
  );
}
