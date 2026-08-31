import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  PlayCircle,
  FileQuestion,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { Course, Lesson, LessonProgress, QuizLesson } from './types';
import { flattenLessons } from './types';
import type { Quiz } from '../data';
import VideoPlayer from './VideoPlayer';

export interface QuizLessonContext {
  courseId: string;
  lessonId: string;
  passScore: number;
  proctored: boolean;
}

interface Props {
  course: Course;
  studentId: string;
  isAdmin: boolean;
  lessonProgress: LessonProgress[];
  quizzesById: Record<string, Quiz>;
  onBack: () => void;
  onStartQuizLesson: (quiz: Quiz, ctx: QuizLessonContext) => void;
  onVideoCompleted: () => void;
}

export default function CoursePlayer({
  course,
  studentId,
  isAdmin,
  lessonProgress,
  quizzesById,
  onBack,
  onStartQuizLesson,
  onVideoCompleted,
}: Props) {
  const flat = useMemo(() => flattenLessons(course), [course]);
  const progressByLesson = useMemo(() => {
    const m: Record<string, LessonProgress> = {};
    lessonProgress.forEach((p) => {
      if (p.courseId === course.id) m[p.lessonId] = p;
    });
    return m;
  }, [lessonProgress, course.id]);

  const isDone = (lessonId: string) => progressByLesson[lessonId]?.status === 'completed';

  // 순차 잠금: 직전 레슨이 완료돼야 열림 (관리자는 전체 개방)
  const unlockedUntil = useMemo(() => {
    if (isAdmin || !course.requireSequential) return flat.length;
    let i = 0;
    for (; i < flat.length; i++) {
      if (!isDone(flat[i].lesson.id)) return i + 1; // 현재 미완료 레슨까지 개방
    }
    return flat.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, isAdmin, course.requireSequential, lessonProgress]);

  const firstOpenIdx = useMemo(() => {
    const idx = flat.findIndex(({ lesson }) => !isDone(lesson.id));
    return idx === -1 ? 0 : idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, lessonProgress]);

  const [selectedIdx, setSelectedIdx] = useState(firstOpenIdx);
  // 레슨 수가 바뀌어(코스 편집 등) 인덱스가 범위를 벗어나면 보정
  const safeIdx = Math.min(selectedIdx, Math.max(0, flat.length - 1));
  const current = flat[safeIdx];

  const doneCount = flat.filter(({ lesson }) => isDone(lesson.id)).length;
  const finished = flat.length > 0 && doneCount === flat.length;

  const nextLesson = flat[safeIdx + 1];
  const nextUnlocked = !!nextLesson && safeIdx + 1 < unlockedUntil;

  const renderLessonBody = (lesson: Lesson) => {
    if (lesson.kind === 'video') {
      return (
        <VideoPlayer
          key={lesson.id}
          lesson={lesson}
          studentId={studentId}
          courseId={course.id}
          initialProgress={progressByLesson[lesson.id] || null}
          preview={isAdmin}
          onCompleted={onVideoCompleted}
        />
      );
    }
    // quiz lesson
    const ql = lesson as QuizLesson;
    const quiz = quizzesById[ql.quizId];
    const prog = progressByLesson[lesson.id];
    const passed = prog?.status === 'completed';
    if (!quiz) {
      return (
        <div style={{ padding: 20, background: 'var(--bg-color)', borderRadius: 12, fontSize: 14, color: 'var(--incorrect)' }}>
          연결된 퀴즈를 찾을 수 없습니다. (quizId: {ql.quizId})
        </div>
      );
    }
    return (
      <div style={{ padding: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', marginBottom: 6 }}>퀴즈</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>{quiz.title}</h3>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>{quiz.description}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>
          <span>문항 {quiz.questions.length}개</span>
          <span>통과 기준 {ql.passScore}%</span>
          {ql.proctored && <span style={{ color: 'var(--incorrect)' }}>🔒 부정행위 모니터링</span>}
          {prog && (
            <span style={{ color: passed ? 'var(--correct)' : 'var(--text-secondary)' }}>
              내 최고점 {prog.bestScore}/{prog.total}
            </span>
          )}
        </div>
        {passed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--correct)', fontWeight: 700, fontSize: 14 }}>
            <CheckCircle2 size={18} /> 통과함 · 다시 응시할 수 있습니다
          </div>
        ) : null}
        <button
          className="btn btn-primary"
          style={{ marginTop: 14 }}
          onClick={() =>
            onStartQuizLesson(quiz, {
              courseId: course.id,
              lessonId: lesson.id,
              passScore: ql.passScore,
              proctored: ql.proctored,
            })
          }
        >
          {prog ? '다시 응시하기' : '응시 시작'}
        </button>
      </div>
    );
  };

  return (
    <div className="home-container" style={{ paddingTop: 24 }}>
      <button
        onClick={onBack}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16 }}
      >
        <ArrowLeft size={18} /> 코스 목록
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <h1 className="home-title" style={{ margin: 0 }}>
          {course.title}
        </h1>
        {finished && (
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--correct)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <GraduationCap size={16} /> 이수 완료
          </span>
        )}
      </div>
      <div style={{ height: 8, background: 'var(--bg-color)', borderRadius: 4, overflow: 'hidden', margin: '10px 0 4px' }}>
        <div
          style={{
            height: '100%',
            width: `${flat.length ? (doneCount / flat.length) * 100 : 0}%`,
            background: finished ? 'var(--correct)' : 'var(--primary)',
            transition: 'width 0.5s',
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>
        {doneCount}/{flat.length} 레슨 완료
      </div>

      <div className="course-layout">
        {/* 좌측: 레슨 목록 */}
        <div className="course-lesson-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {course.modules
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((mod) => (
              <div key={mod.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-tertiary)', padding: '6px 4px', textTransform: 'uppercase' }}>
                  {mod.title}
                </div>
                {mod.lessons
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((lesson) => {
                    const gIdx = flat.findIndex((f) => f.lesson.id === lesson.id);
                    const locked = gIdx >= unlockedUntil;
                    const done = isDone(lesson.id);
                    const active = gIdx === safeIdx;
                    return (
                      <button
                        key={lesson.id}
                        disabled={locked}
                        onClick={() => setSelectedIdx(gIdx)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: active ? '1px solid var(--primary)' : '1px solid transparent',
                          background: active ? 'var(--primary-soft)' : 'transparent',
                          color: locked ? 'var(--text-tertiary)' : 'var(--text-primary)',
                          cursor: locked ? 'not-allowed' : 'pointer',
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {locked ? (
                          <Lock size={14} />
                        ) : done ? (
                          <CheckCircle2 size={14} color="var(--correct)" />
                        ) : lesson.kind === 'video' ? (
                          <PlayCircle size={14} color="var(--primary)" />
                        ) : (
                          <FileQuestion size={14} color="var(--primary)" />
                        )}
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lesson.title}
                        </span>
                      </button>
                    );
                  })}
              </div>
            ))}
        </div>

        {/* 우측: 현재 레슨 */}
        <div style={{ minWidth: 0 }}>
          {current ? (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 14px' }}>{current.lesson.title}</h2>
              {safeIdx >= unlockedUntil ? (
                <div style={{ padding: 24, background: 'var(--bg-color)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 14 }}>
                  <Lock size={18} /> 이전 레슨을 먼저 완료해야 열람할 수 있습니다.
                </div>
              ) : (
                renderLessonBody(current.lesson)
              )}

              {/* 레슨 사이 이동 — 완료 후 다음으로 이어가기 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  disabled={selectedIdx === 0}
                  onClick={() => setSelectedIdx((i) => Math.max(0, i - 1))}
                  style={{ flex: 'none' }}
                >
                  <ChevronLeft size={16} /> 이전 레슨
                </button>

                {nextLesson && (
                  <button
                    className={nextUnlocked ? 'btn btn-primary' : 'btn btn-secondary'}
                    disabled={!nextUnlocked}
                    onClick={() => setSelectedIdx((i) => i + 1)}
                    style={{ flex: 'none', marginLeft: 'auto' }}
                    title={nextUnlocked ? undefined : '현재 레슨을 완료해야 열립니다'}
                  >
                    {nextUnlocked ? <>다음 레슨 <ChevronRight size={16} /></> : <><Lock size={14} /> 다음 레슨 잠김</>}
                  </button>
                )}

                {!nextLesson && finished && (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--correct)', fontWeight: 800, fontSize: 14 }}>
                    <GraduationCap size={18} /> 모든 레슨을 완료했습니다
                  </div>
                )}
              </div>

              {isDone(current.lesson.id) && nextLesson && nextUnlocked && (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--correct)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={15} /> 이 레슨을 완료했습니다 — 다음 레슨으로 넘어가세요.
                </div>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--text-tertiary)' }}>레슨이 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}
