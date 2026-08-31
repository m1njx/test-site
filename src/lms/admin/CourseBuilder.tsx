import { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Check,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Film,
  Upload,
  GraduationCap,
} from 'lucide-react';
import type { Course, Lesson, Module, VideoLesson, QuizLesson } from '../types';
import type { Quiz } from '../../data';
import type { Student } from '../../team';
import {
  getCourses,
  saveCourse,
  deleteCourse,
  uploadCourseVideo,
  parseYouTubeId,
  hasVideoServer,
  VIDEO_SERVER_URL,
} from '../lmsApi';

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function blankCourse(order: number): Course {
  return {
    id: uid('course'),
    title: '',
    description: '',
    order,
    isPublished: false,
    requireSequential: true,
    visibleTo: undefined,
    modules: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

interface Props {
  quizzes: Quiz[];
  team: Student[];
}

export default function CourseBuilder({ quizzes, team }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [editing, setEditing] = useState<Course | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadPct, setUploadPct] = useState<Record<string, number>>({});

  const load = async () => {
    setLoading(true);
    setCourses(await getCourses());
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const patch = (u: Partial<Course>) => setEditing((c) => (c ? { ...c, ...u } : c));

  const setModules = (fn: (m: Module[]) => Module[]) =>
    setEditing((c) => (c ? { ...c, modules: fn(c.modules) } : c));

  const addModule = () =>
    setModules((m) => [...m, { id: uid('mod'), title: `모듈 ${m.length + 1}`, order: m.length, lessons: [] }]);

  const updateModule = (mid: string, u: Partial<Module>) =>
    setModules((m) => m.map((x) => (x.id === mid ? { ...x, ...u } : x)));

  const removeModule = (mid: string) => setModules((m) => m.filter((x) => x.id !== mid));

  const moveItem = <T,>(arr: T[], idx: number, dir: -1 | 1): T[] => {
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return arr;
    const copy = [...arr];
    [copy[idx], copy[j]] = [copy[j], copy[idx]];
    return copy.map((x: any, i) => ({ ...x, order: i }));
  };

  const addLesson = (mid: string, kind: 'video' | 'quiz') => {
    setModules((mods) =>
      mods.map((m) => {
        if (m.id !== mid) return m;
        const order = m.lessons.length;
        const lesson: Lesson =
          kind === 'video'
            ? { id: uid('les'), title: '새 영상', order, kind: 'video', source: 'youtube', completionRatio: 0.95 }
            : {
                id: uid('les'),
                title: '새 퀴즈',
                order,
                kind: 'quiz',
                quizId: quizzes[0]?.id || '',
                passScore: 60,
                proctored: true,
              };
        return { ...m, lessons: [...m.lessons, lesson] };
      }),
    );
  };

  const updateLesson = (mid: string, lid: string, u: Partial<Lesson>) =>
    setModules((mods) =>
      mods.map((m) =>
        m.id === mid
          ? { ...m, lessons: m.lessons.map((l) => (l.id === lid ? ({ ...l, ...u } as Lesson) : l)) }
          : m,
      ),
    );

  const removeLesson = (mid: string, lid: string) =>
    setModules((mods) =>
      mods.map((m) => (m.id === mid ? { ...m, lessons: m.lessons.filter((l) => l.id !== lid) } : m)),
    );

  const handleUpload = async (mid: string, lid: string, file: File) => {
    try {
      setUploadPct((p) => ({ ...p, [lid]: 0 }));
      const res = await uploadCourseVideo(file, (pct) => setUploadPct((p) => ({ ...p, [lid]: pct })));
      updateLesson(mid, lid, { source: 'upload', url: res.url, storagePath: res.storagePath, durationSec: res.durationSec } as Partial<VideoLesson>);
      setUploadPct((p) => {
        const n = { ...p };
        delete n[lid];
        return n;
      });
    } catch (e: any) {
      alert(`업로드 실패: ${e.message || e}`);
      setUploadPct((p) => {
        const n = { ...p };
        delete n[lid];
        return n;
      });
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim()) return alert('코스 제목을 입력하세요.');
    // 유효성: 영상 레슨은 youtubeId 또는 url 필요
    for (const m of editing.modules) {
      for (const l of m.lessons) {
        if (l.kind === 'video' && !l.youtubeId && !l.url) {
          return alert(`"${l.title}" 영상 레슨에 YouTube 링크 또는 업로드가 필요합니다.`);
        }
        if (l.kind === 'quiz' && !l.quizId) {
          return alert(`"${l.title}" 퀴즈 레슨에 연결할 퀴즈를 선택하세요.`);
        }
      }
    }
    setLoading(true);
    try {
      await saveCourse(editing);
      await load();
      setEditing(null);
    } catch (e: any) {
      alert(`저장 실패: ${e.message || e}`);
    }
    setLoading(false);
  };

  /* ------------------------------ list view ------------------------------ */
  if (!editing) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <GraduationCap size={20} color="var(--primary)" /> 코스 관리
          </h2>
          <button
            className="btn btn-primary"
            onClick={() => setEditing(blankCourse(courses.length))}
          >
            <Plus size={16} /> 새 코스
          </button>
        </div>

        {!hasVideoServer && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-color)', padding: 12, borderRadius: 10, marginBottom: 16, lineHeight: 1.6 }}>
            ⚠️ 비디오 서버(<code>VITE_VIDEO_SERVER_URL</code>)가 설정되지 않았습니다. mp4 업로드는 비활성화되며 YouTube 링크 또는 직접 URL 입력만 가능합니다.
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <RefreshCw className="animate-spin" />
          </div>
        ) : courses.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 40 }}>등록된 코스가 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {courses.map((c) => (
              <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>
                    {c.title || '(제목 없음)'}{' '}
                    <span style={{ fontSize: 11, color: c.isPublished ? 'var(--correct)' : 'var(--text-tertiary)' }}>
                      {c.isPublished ? '공개' : '비공개'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    모듈 {c.modules.length} · 레슨 {c.modules.reduce((n, m) => n + m.lessons.length, 0)}
                  </div>
                </div>
                <button className="btn btn-secondary" onClick={() => setEditing(JSON.parse(JSON.stringify(c)))}>
                  편집
                </button>
                <button
                  onClick={async () => {
                    if (confirm(`"${c.title}" 코스를 삭제할까요?`)) {
                      await deleteCourse(c.id);
                      load();
                    }
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--incorrect)', cursor: 'pointer' }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------ edit view ------------------------------ */
  const allSelected = !editing.visibleTo || editing.visibleTo.length === 0;

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button className="btn btn-secondary" onClick={() => setEditing(null)}>
          ← 목록
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => patch({ isPublished: !editing.isPublished })}
            style={{
              padding: '8px 16px',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 14,
              background: editing.isPublished ? 'var(--correct-soft)' : 'var(--muted-soft)',
              color: editing.isPublished ? 'var(--correct)' : 'var(--text-secondary)',
            }}
          >
            {editing.isPublished ? '공개' : '비공개'}
          </button>
          <button className="btn btn-primary" disabled={loading} onClick={save}>
            {loading ? <RefreshCw className="animate-spin" size={18} /> : <><Check size={18} /> 저장</>}
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
        <input
          value={editing.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="코스 제목"
          style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 16, fontWeight: 700 }}
        />
        <textarea
          value={editing.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="코스 설명"
          style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, minHeight: 64 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={editing.requireSequential}
            onChange={(e) => patch({ requireSequential: e.target.checked })}
            style={{ width: 18, height: 18 }}
          />
          순차 학습 강제 (이전 레슨 완료 전 다음 레슨 잠금)
        </label>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>
            대상 팀원
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => patch({ visibleTo: allSelected ? [] : undefined })}
              style={{
                padding: '6px 14px',
                borderRadius: 10,
                border: 'none',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                background: allSelected ? 'var(--primary)' : 'var(--bg-color)',
                color: allSelected ? '#fff' : 'var(--text-secondary)',
              }}
            >
              전체 공개
            </button>
            {team.map((s) => {
              const sel = editing.visibleTo?.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    let v = editing.visibleTo ? [...editing.visibleTo] : [];
                    v = v.includes(s.id) ? v.filter((x) => x !== s.id) : [...v, s.id];
                    patch({ visibleTo: v });
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 10,
                    border: sel ? '1px solid var(--primary)' : '1px solid var(--border)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: sel ? 'var(--primary-soft)' : 'var(--surface)',
                    color: sel ? 'var(--primary)' : 'var(--text-secondary)',
                    opacity: allSelected ? 0.5 : 1,
                  }}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* modules */}
      {editing.modules.map((mod, mIdx) => (
        <div key={mod.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input
              value={mod.title}
              onChange={(e) => updateModule(mod.id, { title: e.target.value })}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontWeight: 700 }}
            />
            <button onClick={() => setModules((m) => moveItem(m, mIdx, -1))} style={iconBtn}>
              <ChevronUp size={16} />
            </button>
            <button onClick={() => setModules((m) => moveItem(m, mIdx, 1))} style={iconBtn}>
              <ChevronDown size={16} />
            </button>
            <button onClick={() => removeModule(mod.id)} style={{ ...iconBtn, color: 'var(--incorrect)' }}>
              <Trash2 size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mod.lessons.map((lesson, lIdx) => (
              <div key={lesson.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--bg-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)' }}>
                    {lesson.kind === 'video' ? 'VIDEO' : 'QUIZ'}
                  </span>
                  <input
                    value={lesson.title}
                    onChange={(e) => updateLesson(mod.id, lesson.id, { title: e.target.value })}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}
                  />
                  <button onClick={() => updateModule(mod.id, { lessons: moveItem(mod.lessons, lIdx, -1) })} style={iconBtn}>
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={() => updateModule(mod.id, { lessons: moveItem(mod.lessons, lIdx, 1) })} style={iconBtn}>
                    <ChevronDown size={14} />
                  </button>
                  <button onClick={() => removeLesson(mod.id, lesson.id)} style={{ ...iconBtn, color: 'var(--incorrect)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>

                {lesson.kind === 'video' ? (
                  <VideoLessonEditor
                    lesson={lesson}
                    uploadPct={uploadPct[lesson.id]}
                    onChange={(u) => updateLesson(mod.id, lesson.id, u)}
                    onFile={(f) => handleUpload(mod.id, lesson.id, f)}
                  />
                ) : (
                  <QuizLessonEditor
                    lesson={lesson as QuizLesson}
                    quizzes={quizzes}
                    onChange={(u) => updateLesson(mod.id, lesson.id, u)}
                  />
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={() => addLesson(mod.id, 'video')}>
              + 영상 레슨
            </button>
            <button className="btn btn-secondary" onClick={() => addLesson(mod.id, 'quiz')}>
              + 퀴즈 레슨
            </button>
          </div>
        </div>
      ))}

      <button className="btn btn-secondary" onClick={addModule} style={{ marginBottom: 60 }}>
        <Plus size={16} /> 모듈 추가
      </button>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  width: 30,
  height: 30,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
};

function VideoLessonEditor({
  lesson,
  uploadPct,
  onChange,
  onFile,
}: {
  lesson: VideoLesson;
  uploadPct?: number;
  onChange: (u: Partial<VideoLesson>) => void;
  onFile: (f: File) => void;
}) {
  const [ytInput, setYtInput] = useState(lesson.youtubeId || '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => onChange({ source: 'youtube' })}
          style={pill(lesson.source === 'youtube')}
        >
          <Film size={13} /> YouTube
        </button>
        <button onClick={() => onChange({ source: 'upload' })} style={pill(lesson.source === 'upload')}>
          <Upload size={13} /> 파일/URL
        </button>
      </div>

      {lesson.source === 'youtube' ? (
        <div>
          <input
            value={ytInput}
            onChange={(e) => {
              setYtInput(e.target.value);
              const id = parseYouTubeId(e.target.value);
              onChange({ youtubeId: id || undefined });
            }}
            placeholder="YouTube URL 또는 영상 ID"
            style={inp}
          />
          <div style={{ fontSize: 11, color: lesson.youtubeId ? 'var(--correct)' : 'var(--text-tertiary)', marginTop: 4 }}>
            {lesson.youtubeId ? `인식됨: ${lesson.youtubeId}` : 'URL을 붙여넣으면 영상 ID를 자동 추출합니다'}
          </div>
        </div>
      ) : (
        <div>
          <input
            value={lesson.url || ''}
            onChange={(e) => onChange({ url: e.target.value || undefined, youtubeId: undefined })}
            placeholder="mp4 / HLS URL (직접 입력 가능)"
            style={inp}
          />
          {hasVideoServer && (
            <div style={{ marginTop: 6 }}>
              <label style={{ ...pill(false), display: 'inline-flex', cursor: 'pointer' }}>
                <Upload size={13} /> mp4 업로드
                <input
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                />
              </label>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>→ {VIDEO_SERVER_URL}</span>
              {typeof uploadPct === 'number' && (
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${uploadPct}%`, background: 'var(--primary)' }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        완료 기준
        <input
          type="number"
          min={50}
          max={100}
          value={Math.round(lesson.completionRatio * 100)}
          onChange={(e) => onChange({ completionRatio: Math.min(1, Math.max(0.5, (parseInt(e.target.value) || 95) / 100)) })}
          style={{ width: 64, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
        />
        % 이상 시청
      </label>
    </div>
  );
}

function QuizLessonEditor({
  lesson,
  quizzes,
  onChange,
}: {
  lesson: QuizLesson;
  quizzes: Quiz[];
  onChange: (u: Partial<QuizLesson>) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <select value={lesson.quizId} onChange={(e) => onChange({ quizId: e.target.value })} style={{ ...inp, flex: '1 1 240px' }}>
        <option value="">— 퀴즈 선택 —</option>
        {quizzes.map((q) => (
          <option key={q.id} value={q.id}>
            {q.title} ({q.questions.length}문항)
          </option>
        ))}
      </select>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
        통과 기준
        <input
          type="number"
          min={0}
          max={100}
          value={lesson.passScore}
          onChange={(e) => onChange({ passScore: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
          style={{ width: 56, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
        />
        %
      </label>
      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
        <input type="checkbox" checked={lesson.proctored} onChange={(e) => onChange({ proctored: e.target.checked })} />
        모니터링
      </label>
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  fontSize: 13,
  width: '100%',
  background: 'var(--surface)',
};
const pill = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 10px',
  borderRadius: 8,
  border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
  background: active ? 'var(--primary-soft)' : 'var(--surface)',
  color: active ? 'var(--primary)' : 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
});
