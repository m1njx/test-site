import { useEffect, useRef, useState, useCallback } from 'react';
import { appendProctorEvents } from './lmsApi';
import {
  computeFlagScore,
  PROCTOR_FLAG_THRESHOLD,
  type ProctorEvent,
  type ProctorEventType,
} from './types';

const FLUSH_MS = 3000;

export function isFullscreen(): boolean {
  return !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
}
export async function enterFullscreen(el?: HTMLElement) {
  const target = el || document.documentElement;
  try {
    if (target.requestFullscreen) await target.requestFullscreen();
    else if ((target as any).webkitRequestFullscreen) (target as any).webkitRequestFullscreen();
  } catch {
    /* 사용자 제스처 없이 호출되면 실패 — 무시 */
  }
}
export async function exitFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
  } catch {
    /* noop */
  }
}

interface Options {
  enabled: boolean;
  sessionId: string | null;
  onEvent?: (e: ProctorEvent, flagScore: number) => void;
}

interface ProctorState {
  flagScore: number;
  flagged: boolean;
  eventCount: number;
  fullscreenActive: boolean;
  /** 화면 이탈(탭 전환/blur) 누적 횟수 */
  awayCount: number;
}

export function useProctor({ enabled, sessionId, onEvent }: Options): ProctorState {
  const [state, setState] = useState<ProctorState>({
    flagScore: 0,
    flagged: false,
    eventCount: 0,
    fullscreenActive: isFullscreen(),
    awayCount: 0,
  });

  const buffer = useRef<ProctorEvent[]>([]);
  const allEvents = useRef<ProctorEvent[]>([]);
  const flushTimer = useRef<number | null>(null);
  const flagScoreRef = useRef(0);
  /** quiz_start 를 세션당 한 번만 남기기 위한 표식 (StrictMode 재실행/재마운트 대비) */
  const startedSessionRef = useRef<string | null>(null);

  const flush = useCallback(async () => {
    if (!sessionId || buffer.current.length === 0) return;
    const batch = buffer.current;
    buffer.current = [];
    // flagScore를 클라이언트에서 계산해 함께 보내면 Firestore 왕복 1회로 끝난다
    await appendProctorEvents(sessionId, batch, flagScoreRef.current);
  }, [sessionId]);

  const record = useCallback(
    (type: ProctorEventType, detail?: string) => {
      const ev: ProctorEvent = { ts: Date.now(), type, ...(detail ? { detail } : {}) };
      buffer.current.push(ev);
      allEvents.current.push(ev);
      const flagScore = computeFlagScore(allEvents.current);
      flagScoreRef.current = flagScore;
      setState((prev) => ({
        flagScore,
        flagged: flagScore >= PROCTOR_FLAG_THRESHOLD,
        eventCount: allEvents.current.length,
        fullscreenActive: isFullscreen(),
        awayCount:
          prev.awayCount + (type === 'tab_hidden' || type === 'window_blur' ? 1 : 0),
      }));
      onEvent?.(ev, flagScore);
    },
    [onEvent],
  );

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const isNewSession = startedSessionRef.current !== sessionId;
    if (isNewSession) {
      // 새 응시 세션이므로 이전 세션의 누적 이벤트/점수를 비운다
      startedSessionRef.current = sessionId;
      buffer.current = [];
      allEvents.current = [];
      flagScoreRef.current = 0;
      setState({
        flagScore: 0,
        flagged: false,
        eventCount: 0,
        fullscreenActive: isFullscreen(),
        awayCount: 0,
      });
      record('quiz_start');
    }

    const onVisibility = () =>
      record(document.hidden ? 'tab_hidden' : 'tab_visible');
    const onBlur = () => record('window_blur');
    const onFocus = () => record('window_focus');
    const onFsChange = () => {
      const fs = isFullscreen();
      record(fs ? 'fullscreen_enter' : 'fullscreen_exit');
      setState((p) => ({ ...p, fullscreenActive: fs }));
    };
    const onCopy = () => record('copy');
    const onPaste = () => record('paste');
    const onCut = () => record('cut');
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      record('contextmenu');
    };
    // keydown: 개발자도구 / macOS 스크린샷 조합
    // (PrintScreen 은 keydown 이 전달되지 않는 브라우저가 있어 keyup 에서만 처리한다.
    //  두 리스너에 같은 핸들러를 달면 한 번의 입력이 두 번 집계되므로 반드시 분리할 것)
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      const ctrlish = e.ctrlKey || e.metaKey;
      if (k === 'PrintScreen') return; // keyup 에서 처리
      // 개발자도구: F12, Ctrl/Cmd+Shift+I/J/C, Ctrl+U
      if (
        k === 'F12' ||
        (ctrlish && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(k)) ||
        (ctrlish && ['U', 'u'].includes(k))
      ) {
        e.preventDefault();
        record('devtools_key', k);
        return;
      }
      // macOS 스크린샷: Cmd+Shift+3/4/5
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(k)) {
        record('printscreen_key', `Cmd+Shift+${k}`);
      }
    };

    // keyup: PrintScreen 전용
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') record('printscreen_key');
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      record('reload_attempt');
      // 즉시 저장 시도 (best-effort)
      flush();
      e.preventDefault();
      e.returnValue = '';
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange as any);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('cut', onCut);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('beforeunload', onBeforeUnload);

    flushTimer.current = window.setInterval(flush, FLUSH_MS) as unknown as number;

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange as any);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (flushTimer.current) window.clearInterval(flushTimer.current);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId]);

  return state;
}
