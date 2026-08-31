import { GraduationCap, PlayCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import type { Course, LessonProgress } from './types';
import { countLessons, flattenLessons } from './types';
import { ADMIN_ID } from '../team';

interface Props {
  courses: Course[];
  lessonProgress: LessonProgress[];
  studentId: string;
  onSelect: (course: Course) => void;
}

function Ring({ pct, done }: { pct: number; done: boolean }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <svg width={48} height={48} viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <circle cx={24} cy={24} r={r} fill="none" stroke="var(--border)" strokeWidth={5} />
      <circle
        cx={24}
        cy={24}
        r={r}
        fill="none"
        stroke={done ? 'var(--correct)' : 'var(--primary)'}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        transform="rotate(-90 24 24)"
        style={{ transition: 'stroke-dashoffset 0.6s' }}
      />
      <text x={24} y={28} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--text-primary)">
        {pct}
      </text>
    </svg>
  );
}

export default function CourseHome({ courses, lessonProgress, studentId, onSelect }: Props) {
  const isAdmin = studentId === ADMIN_ID;
  const completedIds = new Set(
    lessonProgress.filter((p) => p.status === 'completed').map((p) => p.lessonId),
  );

  const visible = courses
    .filter((c) => isAdmin || c.isPublished)
    .filter((c) => isAdmin || !c.visibleTo || c.visibleTo.length === 0 || c.visibleTo.includes(studentId))
    .sort((a, b) => a.order - b.order);

  if (visible.length === 0) return null;

  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <GraduationCap size={20} color="var(--primary)" /> 강의 코스
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        영상 강의를 끝까지 시청하고 퀴즈를 통과하면 이수됩니다.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visible.map((course) => {
          const total = countLessons(course);
          const done = flattenLessons(course).filter(({ lesson }) => completedIds.has(lesson.id)).length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const finished = total > 0 && done === total;
          const videoCount = course.modules.reduce(
            (n, m) => n + m.lessons.filter((l) => l.kind === 'video').length,
            0,
          );
          const quizCount = total - videoCount;

          return (
            <button
              key={course.id}
              onClick={() => onSelect(course)}
              className="quiz-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                textAlign: 'left',
                width: '100%',
                border: finished ? '1px solid rgba(39,174,96,0.4)' : undefined,
              }}
            >
              <Ring pct={pct} done={finished} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 className="quiz-name" style={{ margin: 0 }}>
                    {course.title}
                  </h3>
                  {finished && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: 'var(--correct)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <CheckCircle2 size={12} /> 이수
                    </span>
                  )}
                  {isAdmin && !course.isPublished && (
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>(비공개)</span>
                  )}
                </div>
                <p className="quiz-desc" style={{ margin: '4px 0 0' }}>
                  {course.description || `영상 ${videoCount}개 · 퀴즈 ${quizCount}개`}
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <PlayCircle size={12} /> {videoCount}
                  </span>
                  <span>퀴즈 {quizCount}</span>
                  <span>
                    {done}/{total} 완료
                  </span>
                </div>
              </div>
              <ArrowRight size={20} color={finished ? 'var(--correct)' : 'var(--text-tertiary)'} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
