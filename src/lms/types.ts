// LMS 코스/레슨/진도/부정행위 로그 타입 정의

export interface LessonCommon {
  id: string;
  title: string;
  order: number;
}

export interface VideoLesson extends LessonCommon {
  kind: 'video';
  source: 'youtube' | 'upload';
  youtubeId?: string; // source === 'youtube'
  storagePath?: string; // source === 'upload' (Firebase Storage 경로)
  url?: string; // source === 'upload' 다운로드 URL, 또는 외부 mp4/HLS URL
  durationSec?: number; // 등록/최초 재생 시 확정
  completionRatio: number; // 완청 기준 (기본 0.95)
}

export interface QuizLesson extends LessonCommon {
  kind: 'quiz';
  quizId: string; // 기존 quizzes 컬렉션 문서 참조
  passScore: number; // 통과 정답률 % (기본 60). 0이면 제출만 하면 통과
  proctored: boolean; // 응시 중 부정행위 로깅 여부 (기본 true)
}

export type Lesson = VideoLesson | QuizLesson;

export interface Module {
  id: string;
  title: string;
  order: number;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  order: number;
  isPublished: boolean;
  visibleTo?: string[]; // 빈 배열/undefined = 전체 공개 (기존 quiz.visibleTo 규칙)
  requireSequential: boolean; // true면 직전 레슨 완료 전 다음 레슨 잠금
  modules: Module[];
  createdAt: number;
  updatedAt: number;
}

export interface LessonProgress {
  studentId: string;
  courseId: string;
  lessonId: string;
  kind: 'video' | 'quiz';
  status: 'in_progress' | 'completed';
  // video 전용
  watchedRanges?: [number, number][];
  watchedSec?: number;
  durationSec?: number;
  lastPositionSec?: number;
  maxReachedSec?: number;
  // quiz 전용
  bestScore?: number;
  total?: number;
  lastAttemptId?: string;
  updatedAt: number;
  completedAt?: number;
}

export type ProctorEventType =
  | 'quiz_start'
  | 'quiz_submit'
  | 'tab_hidden'
  | 'tab_visible'
  | 'window_blur'
  | 'window_focus'
  | 'fullscreen_enter'
  | 'fullscreen_exit'
  | 'copy'
  | 'paste'
  | 'cut'
  | 'contextmenu'
  | 'devtools_key'
  | 'printscreen_key'
  | 'reload_attempt';

export interface ProctorEvent {
  ts: number;
  type: ProctorEventType;
  detail?: string;
}

export interface ProctorSession {
  id: string;
  studentId: string;
  studentName?: string;
  courseId?: string;
  lessonId?: string;
  quizId: string;
  quizTitle?: string;
  startedAt: number;
  endedAt?: number;
  events: ProctorEvent[];
  flagScore: number;
  flagged: boolean;
  submitted: boolean;
  score?: number;
  total?: number;
}

// 부정행위 이벤트 가중치
export const PROCTOR_WEIGHTS: Record<ProctorEventType, number> = {
  quiz_start: 0,
  quiz_submit: 0,
  tab_hidden: 2,
  tab_visible: 0,
  window_blur: 2,
  window_focus: 0,
  fullscreen_enter: 0,
  fullscreen_exit: 2,
  copy: 1,
  paste: 2,
  cut: 1,
  contextmenu: 0.5,
  devtools_key: 2,
  printscreen_key: 1,
  reload_attempt: 1,
};

// 이 점수 이상이면 자동 플래그
export const PROCTOR_FLAG_THRESHOLD = 5;

export const PROCTOR_EVENT_LABELS: Record<ProctorEventType, string> = {
  quiz_start: '응시 시작',
  quiz_submit: '답안 제출',
  tab_hidden: '탭 전환 / 화면 이탈',
  tab_visible: '화면 복귀',
  window_blur: '창 포커스 이탈',
  window_focus: '창 포커스 복귀',
  fullscreen_enter: '전체화면 진입',
  fullscreen_exit: '전체화면 이탈',
  copy: '복사(Copy)',
  paste: '붙여넣기(Paste)',
  cut: '잘라내기(Cut)',
  contextmenu: '우클릭 메뉴',
  devtools_key: '개발자도구 단축키',
  printscreen_key: 'PrintScreen 키',
  reload_attempt: '새로고침/이탈 시도',
};

export function computeFlagScore(events: ProctorEvent[]): number {
  return events.reduce((sum, e) => sum + (PROCTOR_WEIGHTS[e.type] ?? 0), 0);
}

// 코스 내 전체 레슨 개수
export function countLessons(course: Course): number {
  return course.modules.reduce((n, m) => n + m.lessons.length, 0);
}

// 평탄화된 레슨 목록 (모듈/레슨 order 순)
export function flattenLessons(course: Course): { module: Module; lesson: Lesson }[] {
  const out: { module: Module; lesson: Lesson }[] = [];
  [...course.modules]
    .sort((a, b) => a.order - b.order)
    .forEach((module) => {
      [...module.lessons]
        .sort((a, b) => a.order - b.order)
        .forEach((lesson) => out.push({ module, lesson }));
    });
  return out;
}
