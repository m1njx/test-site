import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldAlert, ChevronDown, ChevronUp, Flag } from 'lucide-react';
import type { ProctorSession } from '../types';
import { PROCTOR_EVENT_LABELS, PROCTOR_FLAG_THRESHOLD, PROCTOR_WEIGHTS } from '../types';
import type { Student } from '../../team';
import { getStudentName } from '../../team';
import { getProctorSessions } from '../lmsApi';

interface Props {
  team: Student[];
}

function fmtDur(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}분 ${s % 60}초`;
}

export default function ProctorLogBoard({ team }: Props) {
  const [sessions, setSessions] = useState<ProctorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [quizFilter, setQuizFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getProctorSessions();
    setSessions(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    let ignore = false;
    getProctorSessions().then((data) => {
      if (!ignore) {
        setSessions(data);
        setLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  const quizOptions = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.quizTitle || s.quizId))).sort(),
    [sessions],
  );

  const rows = useMemo(() => {
    let r = [...sessions];
    if (onlyFlagged) r = r.filter((s) => s.flagged);
    if (quizFilter) r = r.filter((s) => (s.quizTitle || s.quizId) === quizFilter);
    return r.sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.flagScore - a.flagScore || b.startedAt - a.startedAt);
  }, [sessions, onlyFlagged, quizFilter]);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={20} color="var(--incorrect)" /> 부정행위 로그
        </h2>
        <button className="btn btn-secondary" onClick={load}>
          <RefreshCw size={15} /> 새로고침
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
          플래그된 것만
        </label>
        <select
          value={quizFilter}
          onChange={(e) => setQuizFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
        >
          <option value="">전체 퀴즈</option>
          {quizOptions.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          임계 점수 {PROCTOR_FLAG_THRESHOLD}점 이상 자동 플래그
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <RefreshCw className="animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 40 }}>기록이 없습니다.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((s) => {
            const name = s.studentName || getStudentName(s.studentId, team);
            const isOpen = open[s.id];
            return (
              <div
                key={s.id}
                style={{
                  border: s.flagged ? '1px solid var(--incorrect)' : '1px solid var(--border)',
                  background: s.flagged ? 'var(--incorrect-soft)' : 'var(--surface)',
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={Boolean(isOpen)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', outline: 'none' }}
                  onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpen((o) => ({ ...o, [s.id]: !o[s.id] }));
                    }
                  }}
                >
                  {s.flagged && <Flag size={16} color="var(--incorrect)" />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800 }}>
                      {name} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 12 }}>{s.studentId}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {s.quizTitle || s.quizId} · {new Date(s.startedAt).toLocaleString()}
                      {s.endedAt ? ` · ${fmtDur(s.endedAt - s.startedAt)}` : ' · 진행 중'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: s.flagged ? 'var(--incorrect)' : 'var(--text-secondary)' }}>
                      {s.flagScore.toFixed(1)}점
                    </div>
                    {s.submitted && (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {s.score}/{s.total}
                      </div>
                    )}
                  </div>
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>

                {isOpen && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    {s.events.length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>이벤트 없음</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {s.events.map((e, i) => {
                          const w = PROCTOR_WEIGHTS[e.type] ?? 0;
                          return (
                            <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, alignItems: 'baseline' }}>
                              <span style={{ color: 'var(--text-tertiary)', minWidth: 62 }}>
                                +{((e.ts - s.startedAt) / 1000).toFixed(0)}s
                              </span>
                              <span style={{ fontWeight: 600, color: w >= 2 ? 'var(--incorrect)' : w > 0 ? 'var(--warn)' : 'var(--text-secondary)' }}>
                                {PROCTOR_EVENT_LABELS[e.type] || e.type}
                              </span>
                              {e.detail && <span style={{ color: 'var(--text-tertiary)' }}>{e.detail}</span>}
                              {w > 0 && <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>+{w}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
