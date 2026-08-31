import { db, isMock } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  arrayUnion,
  query,
  where,
} from 'firebase/firestore';
import { ADMIN_ID } from '../team';
import type { Course, LessonProgress, ProctorEvent, ProctorSession } from './types';
import { computeFlagScore, PROCTOR_FLAG_THRESHOLD } from './types';

/* ------------------------------------------------------------------ *
 * Mock 저장소 (firebase 미설정 시 localStorage 로 로컬 개발 가능)
 * ------------------------------------------------------------------ */
const LS = {
  courses: 'aim_lms_courses',
  progress: 'aim_lms_lesson_progress',
  proctor: 'aim_lms_proctor_sessions',
};

function lsGet<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}
function lsSet<T>(key: string, val: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.warn('localStorage set failed', e);
  }
}

/* ------------------------------------------------------------------ *
 * 유틸: Firestore 저장 전 undefined 제거 (기존 api.ts saveQuiz 패턴)
 * ------------------------------------------------------------------ */
function stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (v === undefined ? undefined : v)));
}

/* ================================================================== *
 * Courses
 * ================================================================== */
export async function getCourses(): Promise<Course[]> {
  try {
    if (isMock || !db) return lsGet<Course>(LS.courses).sort((a, b) => a.order - b.order);
    const snap = await getDocs(collection(db, 'courses'));
    return snap.docs.map((d) => d.data() as Course).sort((a, b) => a.order - b.order);
  } catch (e) {
    console.error('getCourses error:', e);
    return [];
  }
}

export async function saveCourse(course: Course): Promise<void> {
  const clean = stripUndefined({ ...course, updatedAt: Date.now() });
  if (isMock || !db) {
    const all = lsGet<Course>(LS.courses);
    const idx = all.findIndex((c) => c.id === course.id);
    if (idx >= 0) all[idx] = clean;
    else all.push(clean);
    lsSet(LS.courses, all);
    return;
  }
  try {
    await setDoc(doc(db, 'courses', course.id), clean);
  } catch (e) {
    console.error('saveCourse error:', e);
    throw e;
  }
}

export async function deleteCourse(courseId: string): Promise<void> {
  if (isMock || !db) {
    lsSet(LS.courses, lsGet<Course>(LS.courses).filter((c) => c.id !== courseId));
    return;
  }
  try {
    await deleteDoc(doc(db, 'courses', courseId));
  } catch (e) {
    console.error('deleteCourse error:', e);
    throw e;
  }
}

/* ================================================================== *
 * Lesson progress
 * ================================================================== */
function progressId(studentId: string, lessonId: string) {
  return `${studentId}_${lessonId}`;
}

export async function getLessonProgress(studentId: string): Promise<LessonProgress[]> {
  if (!studentId) return [];
  try {
    if (isMock || !db) {
      return lsGet<LessonProgress>(LS.progress).filter((p) => p.studentId === studentId);
    }
    const q = query(collection(db, 'lessonProgress'), where('studentId', '==', studentId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as LessonProgress);
  } catch (e) {
    console.error('getLessonProgress error:', e);
    return [];
  }
}

export async function getAllLessonProgress(): Promise<LessonProgress[]> {
  try {
    if (isMock || !db) return lsGet<LessonProgress>(LS.progress);
    const snap = await getDocs(collection(db, 'lessonProgress'));
    return snap.docs.map((d) => d.data() as LessonProgress);
  } catch (e) {
    console.error('getAllLessonProgress error:', e);
    return [];
  }
}

async function readOneProgress(studentId: string, lessonId: string): Promise<LessonProgress | null> {
  if (isMock || !db) {
    return (
      lsGet<LessonProgress>(LS.progress).find(
        (p) => p.studentId === studentId && p.lessonId === lessonId,
      ) || null
    );
  }
  const s = await getDoc(doc(db, 'lessonProgress', progressId(studentId, lessonId)));
  return s.exists() ? (s.data() as LessonProgress) : null;
}

async function writeProgress(p: LessonProgress): Promise<void> {
  const clean = stripUndefined(p);
  if (isMock || !db) {
    const all = lsGet<LessonProgress>(LS.progress);
    const idx = all.findIndex((x) => x.studentId === p.studentId && x.lessonId === p.lessonId);
    if (idx >= 0) all[idx] = clean;
    else all.push(clean);
    lsSet(LS.progress, all);
    return;
  }
  await setDoc(doc(db, 'lessonProgress', progressId(p.studentId, p.lessonId)), clean);
}

// 시청 구간 병합: 0.5초 이내 인접 구간은 합침
export function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [[...sorted[0]] as [number, number]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur[0] <= last[1] + 0.5) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      out.push([...cur] as [number, number]);
    }
  }
  return out;
}

export function rangesTotal(ranges: [number, number][]): number {
  return ranges.reduce((s, [a, b]) => s + Math.max(0, b - a), 0);
}

export interface VideoProgressPatch {
  studentId: string;
  courseId: string;
  lessonId: string;
  newRanges: [number, number][];
  durationSec: number;
  lastPositionSec: number;
  maxReachedSec: number;
  completionRatio: number;
}

// 영상 진행 저장. 완료 조건 충족 시 completed 로 전환하고 true 반환.
export async function upsertVideoProgress(patch: VideoProgressPatch): Promise<{ completed: boolean; watchedSec: number }> {
  if (patch.studentId === ADMIN_ID) return { completed: true, watchedSec: 0 };
  const existing = await readOneProgress(patch.studentId, patch.lessonId);
  const merged = mergeRanges([...(existing?.watchedRanges || []), ...patch.newRanges]);
  const watchedSec = rangesTotal(merged);
  const duration = patch.durationSec || existing?.durationSec || 0;
  const alreadyDone = existing?.status === 'completed';
  const completed =
    alreadyDone || (duration > 0 && watchedSec >= duration * patch.completionRatio);

  const next: LessonProgress = {
    studentId: patch.studentId,
    courseId: patch.courseId,
    lessonId: patch.lessonId,
    kind: 'video',
    status: completed ? 'completed' : 'in_progress',
    watchedRanges: merged,
    watchedSec,
    durationSec: duration || undefined,
    lastPositionSec: patch.lastPositionSec,
    maxReachedSec: Math.max(patch.maxReachedSec, existing?.maxReachedSec || 0),
    updatedAt: Date.now(),
    completedAt: completed ? existing?.completedAt || Date.now() : undefined,
  };
  await writeProgress(next);
  return { completed, watchedSec };
}

// 퀴즈 레슨 완료 기록 (App.gradeQuiz 에서 호출)
export async function markQuizLesson(opts: {
  studentId: string;
  courseId: string;
  lessonId: string;
  score: number;
  total: number;
  passScore: number;
  attemptId?: string;
}): Promise<void> {
  if (opts.studentId === ADMIN_ID) return;
  const existing = await readOneProgress(opts.studentId, opts.lessonId);
  const bestScore = Math.max(existing?.bestScore ?? 0, opts.score);
  const rate = opts.total > 0 ? (bestScore / opts.total) * 100 : 0;
  const passed = rate >= opts.passScore;
  const next: LessonProgress = {
    studentId: opts.studentId,
    courseId: opts.courseId,
    lessonId: opts.lessonId,
    kind: 'quiz',
    status: passed ? 'completed' : 'in_progress',
    bestScore,
    total: opts.total,
    lastAttemptId: opts.attemptId,
    updatedAt: Date.now(),
    completedAt: passed ? existing?.completedAt || Date.now() : undefined,
  };
  await writeProgress(next);
}

/* ================================================================== *
 * Proctor sessions
 * ================================================================== */
export async function createProctorSession(
  init: Omit<ProctorSession, 'events' | 'flagScore' | 'flagged' | 'submitted' | 'startedAt'> &
    Partial<Pick<ProctorSession, 'startedAt'>>,
): Promise<string> {
  const session: ProctorSession = {
    events: [],
    flagScore: 0,
    flagged: false,
    submitted: false,
    startedAt: init.startedAt ?? Date.now(),
    ...init,
  };
  const clean = stripUndefined(session);
  if (isMock || !db) {
    const all = lsGet<ProctorSession>(LS.proctor);
    all.push(clean);
    lsSet(LS.proctor, all);
    return session.id;
  }
  try {
    await setDoc(doc(db, 'proctorSessions', session.id), clean);
  } catch (e) {
    console.error('createProctorSession error:', e);
  }
  return session.id;
}

export async function appendProctorEvents(sessionId: string, events: ProctorEvent[]): Promise<void> {
  if (events.length === 0) return;
  if (isMock || !db) {
    const all = lsGet<ProctorSession>(LS.proctor);
    const s = all.find((x) => x.id === sessionId);
    if (s) {
      s.events.push(...events);
      s.flagScore = computeFlagScore(s.events);
      s.flagged = s.flagScore >= PROCTOR_FLAG_THRESHOLD;
      lsSet(LS.proctor, all);
    }
    return;
  }
  try {
    const dref = doc(db, 'proctorSessions', sessionId);
    await updateDoc(dref, { events: arrayUnion(...events.map((e) => stripUndefined(e))) });
    // flagScore 는 스냅샷 다시 읽어 재계산
    const snap = await getDoc(dref);
    if (snap.exists()) {
      const all = (snap.data() as ProctorSession).events || [];
      const flagScore = computeFlagScore(all);
      await updateDoc(dref, { flagScore, flagged: flagScore >= PROCTOR_FLAG_THRESHOLD });
    }
  } catch (e) {
    console.error('appendProctorEvents error:', e);
  }
}

export async function finishProctorSession(
  sessionId: string,
  result: { submitted: boolean; score?: number; total?: number },
): Promise<void> {
  const patch = stripUndefined({ ...result, endedAt: Date.now() });
  if (isMock || !db) {
    const all = lsGet<ProctorSession>(LS.proctor);
    const s = all.find((x) => x.id === sessionId);
    if (s) Object.assign(s, patch);
    lsSet(LS.proctor, all);
    return;
  }
  try {
    await updateDoc(doc(db, 'proctorSessions', sessionId), patch);
  } catch (e) {
    console.error('finishProctorSession error:', e);
  }
}

export async function getProctorSessions(): Promise<ProctorSession[]> {
  try {
    if (isMock || !db) {
      return lsGet<ProctorSession>(LS.proctor).sort((a, b) => b.startedAt - a.startedAt);
    }
    const snap = await getDocs(collection(db, 'proctorSessions'));
    return snap.docs.map((d) => d.data() as ProctorSession).sort((a, b) => b.startedAt - a.startedAt);
  } catch (e) {
    console.error('getProctorSessions error:', e);
    return [];
  }
}

/* ================================================================== *
 * 자체 비디오 서버 (mp4 업로드/서빙) — video-server/ 참고
 *   VITE_VIDEO_SERVER_URL : 예) https://lms-video.example.com
 *   업로드 인증: 관리자 비밀번호(VITE_ADMIN_PASSWORD)를 x-upload-token 헤더로 전달
 * ================================================================== */
export const VIDEO_SERVER_URL: string = (import.meta.env.VITE_VIDEO_SERVER_URL || '').replace(/\/$/, '');
export const hasVideoServer = !!VIDEO_SERVER_URL;

export async function uploadCourseVideo(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ url: string; durationSec?: number; storagePath: string }> {
  if (!VIDEO_SERVER_URL) {
    throw new Error(
      '비디오 서버가 설정되지 않았습니다. .env 의 VITE_VIDEO_SERVER_URL 을 지정하거나 YouTube 링크를 사용하세요.',
    );
  }
  const durationSec = await readVideoDuration(file).catch(() => undefined);
  const token = import.meta.env.VITE_ADMIN_PASSWORD || '';

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${VIDEO_SERVER_URL}/upload`);
    xhr.setRequestHeader('x-upload-token', token);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText); // { file, url }
          const url = res.url?.startsWith('http') ? res.url : `${VIDEO_SERVER_URL}${res.url || '/videos/' + res.file}`;
          resolve({ url, durationSec, storagePath: res.file });
        } catch (e) {
          reject(new Error('업로드 응답 파싱 실패'));
        }
      } else {
        reject(new Error(`업로드 실패 (${xhr.status}) ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('업로드 네트워크 오류 (CORS/서버 확인)'));
    xhr.send(form);
  });
}

// 파일에서 재생 길이를 로컬로 읽어냄 (메타데이터만)
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(v.duration);
    };
    v.onerror = () => reject(new Error('video metadata read failed'));
    v.src = URL.createObjectURL(file);
  });
}

/* ================================================================== *
 * 유튜브 URL → videoId 추출
 * ================================================================== */
export function parseYouTubeId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
    /(?:youtube\.com\/live\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  return null;
}
