import { useEffect, useState, useCallback, Fragment } from 'react';
import { RefreshCw, Download, CheckCircle2, Circle } from 'lucide-react';
import type { Course, LessonProgress } from '../types';
import { flattenLessons } from '../types';
import type { Student } from '../../team';
import { getCourses, getAllLessonProgress } from '../lmsApi';

interface Props {
  team: Student[];
}

export default function CompletionBoard({ team }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<LessonProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, p] = await Promise.all([getCourses(), getAllLessonProgress()]);
    setCourses(c.sort((a, b) => a.order - b.order));
    setProgress(p);
    setLoading(false);
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.all([getCourses(), getAllLessonProgress()]).then(([c, p]) => {
      if (!ignore) {
        setCourses(c.sort((a, b) => a.order - b.order));
        setProgress(p);
        setLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  const doneSet = new Set(progress.filter((p) => p.status === 'completed').map((p) => `${p.studentId}__${p.lessonId}`));

  const courseStats = (course: Course, studentId: string) => {
    const lessons = flattenLessons(course);
    const done = lessons.filter(({ lesson }) => doneSet.has(`${studentId}__${lesson.id}`)).length;
    return { done, total: lessons.length, pct: lessons.length ? Math.round((done / lessons.length) * 100) : 0 };
  };

  const exportCSV = () => {
    const headers = ['이름', '학번', ...courses.map((c) => c.title)];
    const rows = team.map((s) => {
      const cells = courses.map((c) => {
        const st = courseStats(c, s.id);
        return `${st.pct}% (${st.done}/${st.total})`;
      });
      return [s.name, s.id, ...cells];
    });
    const csv = '﻿' + [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `이수현황_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>이수 현황</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={load}>
            <RefreshCw size={15} /> 새로고침
          </button>
          <button className="btn btn-secondary" onClick={exportCSV}>
            <Download size={15} /> CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <RefreshCw className="animate-spin" />
        </div>
      ) : courses.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 40 }}>코스가 없습니다.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>팀원</th>
                {courses.map((c) => (
                  <th key={c.id} style={th}>
                    {c.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((s) => (
                <Fragment key={s.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                    <td style={{ ...td, fontWeight: 700 }}>
                      {s.name}
                      <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 6 }}>{s.id}</span>
                    </td>
                    {courses.map((c) => {
                      const st = courseStats(c, s.id);
                      const full = st.total > 0 && st.done === st.total;
                      return (
                        <td key={c.id} style={{ ...td, textAlign: 'center' }}>
                          <span style={{ fontWeight: 800, color: full ? 'var(--correct)' : st.pct > 0 ? 'var(--primary)' : 'var(--text-tertiary)' }}>
                            {st.pct}%
                          </span>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {st.done}/{st.total}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  {expanded === s.id && (
                    <tr>
                      <td colSpan={courses.length + 1} style={{ ...td, background: 'var(--bg-color)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 8 }}>
                          {courses.map((c) => (
                            <div key={c.id}>
                              <div style={{ fontWeight: 700, marginBottom: 4 }}>{c.title}</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {flattenLessons(c).map(({ lesson }) => {
                                  const ok = doneSet.has(`${s.id}__${lesson.id}`);
                                  return (
                                    <span key={lesson.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: ok ? 'var(--correct)' : 'var(--text-tertiary)' }}>
                                      {ok ? <CheckCircle2 size={13} /> : <Circle size={13} />} {lesson.title}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '2px solid var(--border)',
  textAlign: 'left',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
};
