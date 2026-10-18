import { useEffect, useRef, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import type { VideoLesson, LessonProgress } from './types';
import { upsertVideoProgress, mergeRanges, rangesTotal } from './lmsApi';

const MAX_RATE = 1; // 배속 상한 (꼼수 방지)
const SEEK_TOLERANCE = 1.5; // 이 이상 앞으로 점프하면 되돌림
const SAVE_INTERVAL_MS = 15000;

interface YouTubePlayer {
  getDuration?: () => number;
  getPlaybackRate?: () => number;
  setPlaybackRate: (rate: number) => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getPlayerState?: () => number;
  pauseVideo: () => void;
  destroy?: () => void;
  getCurrentTime?: () => number;
}
interface YouTubeNamespace {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer;
  PlayerState: {
    PLAYING: number;
    PAUSED: number;
    ENDED: number;
  };
}
interface YouTubeWindow extends Window {
  YT?: YouTubeNamespace;
  onYouTubeIframeAPIReady?: () => void;
}

/* ------------------------------------------------------------------ *
 * YouTube IFrame API 로더 (Pyodide 동적 로드 방식과 동일)
 * ------------------------------------------------------------------ */
let ytApiPromise: Promise<YouTubeNamespace> | null = null;
function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const w = window as unknown as YouTubeWindow;
    if (w.YT && w.YT.Player) return resolve(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      if (w.YT) resolve(w.YT);
    };
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script');
      s.id = 'yt-iframe-api';
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
  return ytApiPromise;
}

interface Props {
  lesson: VideoLesson;
  studentId: string;
  courseId: string;
  initialProgress?: LessonProgress | null;
  onCompleted?: () => void;
  /** 관리자 미리보기: 제약/저장 없음 */
  preview?: boolean;
}

export default function VideoPlayer({
  lesson,
  studentId,
  courseId,
  initialProgress,
  onCompleted,
  preview,
}: Props) {
  const restricted = !preview;
  const isYouTube = lesson.source === 'youtube' || !!lesson.youtubeId;
  const error = !isYouTube && !lesson.url
    ? '영상 URL이 없습니다. 관리자에게 문의하세요.'
    : isYouTube && !lesson.youtubeId
      ? 'YouTube 영상 ID가 없습니다.'
      : null;

  const [duration, setDuration] = useState(lesson.durationSec || initialProgress?.durationSec || 0);
  const [watchedSec, setWatchedSec] = useState(initialProgress?.watchedSec || 0);
  const [completed, setCompleted] = useState(initialProgress?.status === 'completed');
  const [toast, setToast] = useState<string | null>(null);

  // 추적 상태 (렌더 유발 X)
  const tr = useRef({
    allRanges: mergeRanges([...(initialProgress?.watchedRanges || [])]) as [number, number][],
    pendingRanges: [] as [number, number][],
    maxReached: initialProgress?.maxReachedSec || 0,
    lastSample: null as number | null,
    lastPos: initialProgress?.lastPositionSec || 0,
    duration: duration,
    completedFired: initialProgress?.status === 'completed',
    snapping: false,
    lastSaveAt: 0,
    resumed: false,
  });

  // 토스트 타이머는 ref 로 관리한다 (함수 자신에 프로퍼티를 다는 방식은
  // 선언 전 자기 참조라 취약하고, 언마운트 시 타이머가 남는다)
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600) as unknown as number;
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  const recompute = useCallback(() => {
    const merged = mergeRanges([...tr.current.allRanges, ...tr.current.pendingRanges]);
    tr.current.allRanges = merged;
    tr.current.pendingRanges = [];
    const w = rangesTotal(merged);
    setWatchedSec(w);
    return w;
  }, []);

  const flush = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (!force && now - tr.current.lastSaveAt < SAVE_INTERVAL_MS) return;
      tr.current.lastSaveAt = now;
      const w = recompute();
      if (!restricted) {
        // 관리자/미리보기: 저장 안 함
        if (
          !tr.current.completedFired &&
          tr.current.duration > 0 &&
          w >= tr.current.duration * lesson.completionRatio
        ) {
          tr.current.completedFired = true;
          setCompleted(true);
          onCompleted?.();
        }
        return;
      }
      try {
        const res = await upsertVideoProgress({
          studentId,
          courseId,
          lessonId: lesson.id,
          newRanges: tr.current.allRanges,
          durationSec: tr.current.duration,
          lastPositionSec: tr.current.lastPos,
          maxReachedSec: tr.current.maxReached,
          completionRatio: lesson.completionRatio,
        });
        if (res.completed && !tr.current.completedFired) {
          tr.current.completedFired = true;
          setCompleted(true);
          onCompleted?.();
        }
      } catch (e) {
        console.warn('video progress save failed', e);
      }
    },
    [recompute, restricted, studentId, courseId, lesson.id, lesson.completionRatio, onCompleted],
  );

  // 재생 중 1초 샘플 처리. getTime(): 현재 재생 위치(초)
  const onSample = useCallback(
    (t: number, seekBack: (to: number) => void) => {
      const s = tr.current;
      s.duration = s.duration || 0;
      const prev = s.lastSample;

      if (prev != null) {
        const dt = t - prev;
        if (dt > 0 && dt <= 1.8) {
          // 연속 재생 → 시청 구간 누적 + 도달점 갱신
          s.pendingRanges.push([prev, t]);
          if (t > s.maxReached) s.maxReached = t;
        } else if (dt > 1.8) {
          // 앞으로 점프 (seek)
          if (restricted && t > s.maxReached + SEEK_TOLERANCE) {
            s.snapping = true;
            seekBack(s.maxReached);
            showToast('아직 보지 않은 구간으로 건너뛸 수 없습니다.');
            s.lastSample = s.maxReached;
            return;
          }
          if (t > s.maxReached) s.maxReached = t;
        }
        // dt < 0 : 뒤로 감기 → 허용, 구간 누적만 스킵
      }
      s.lastSample = t;
      s.lastPos = t;
      recompute();

      if (Date.now() - s.lastSaveAt >= SAVE_INTERVAL_MS) flush();
    },
    [restricted, showToast, recompute, flush],
  );

  /* --------------------------- HTML5 <video> --------------------------- */
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (isYouTube) return;
    const v = videoElRef.current;
    if (!v) return;
    if (!lesson.url) {
      return;
    }

    let raf = 0;
    const tick = () => {
      if (!v.paused && !v.ended) {
        onSample(v.currentTime, (to) => {
          v.currentTime = to;
        });
      }
      raf = window.setTimeout(tick, 1000) as unknown as number;
    };

    const onMeta = () => {
      const d = v.duration && isFinite(v.duration) ? v.duration : 0;
      if (d) {
        setDuration(d);
        tr.current.duration = d;
      }
      if (!tr.current.resumed && tr.current.lastPos > 0 && tr.current.lastPos < (d || Infinity)) {
        tr.current.resumed = true;
        v.currentTime = Math.min(tr.current.lastPos, tr.current.maxReached || tr.current.lastPos);
      }
    };
    const onSeeking = () => {
      if (!restricted) return;
      if (tr.current.snapping) {
        tr.current.snapping = false;
        return;
      }
      if (v.currentTime > tr.current.maxReached + SEEK_TOLERANCE) {
        tr.current.snapping = true;
        v.currentTime = tr.current.maxReached;
        showToast('아직 보지 않은 구간으로 건너뛸 수 없습니다.');
      }
    };
    const onRateChange = () => {
      if (restricted && v.playbackRate > MAX_RATE) {
        v.playbackRate = MAX_RATE;
        showToast('배속 재생은 제한됩니다.');
      }
    };
    const onPause = () => flush(true);
    const onVisibility = () => {
      if (document.hidden && !v.paused) v.pause();
    };
    const onBlur = () => {
      if (!v.paused) v.pause();
    };

    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('seeking', onSeeking);
    v.addEventListener('ratechange', onRateChange);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onPause);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('beforeunload', onPause);
    raf = window.setTimeout(tick, 1000) as unknown as number;

    return () => {
      window.clearTimeout(raf);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('seeking', onSeeking);
      v.removeEventListener('ratechange', onRateChange);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onPause);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('beforeunload', onPause);
      flush(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, lesson.url]);

  /* --------------------------- YouTube --------------------------- */
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isYouTube) return;
    if (!lesson.youtubeId) {
      return;
    }
    let player: YouTubePlayer | null = null;
    let poll = 0;
    let cancelled = false;

    loadYouTubeApi().then((YT) => {
      if (cancelled || !ytHostRef.current) return;
      player = new YT.Player(ytHostRef.current, {
        videoId: lesson.youtubeId,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, modestbranding: 1, disablekb: 1, playsinline: 1 },
        events: {
          onReady: () => {
            const d = player?.getDuration?.() || 0;
            if (d) {
              setDuration(d);
              tr.current.duration = d;
            }
            if (!tr.current.resumed && tr.current.lastPos > 1) {
              tr.current.resumed = true;
              player?.seekTo(Math.min(tr.current.lastPos, tr.current.maxReached || tr.current.lastPos), true);
            }
          },
          onPlaybackRateChange: () => {
            if (restricted && (player?.getPlaybackRate?.() || 1) > MAX_RATE) {
              player?.setPlaybackRate(MAX_RATE);
              showToast('배속 재생은 제한됩니다.');
            }
          },
          onStateChange: (e: { data: number }) => {
            const YTP = (window as unknown as YouTubeWindow).YT?.PlayerState;
            if (!YTP) return;
            if (e.data === YTP.PLAYING) {
              if (!tr.current.duration) {
                const d = player?.getDuration?.() || 0;
                if (d) {
                  setDuration(d);
                  tr.current.duration = d;
                }
              }
              if (!poll) {
                poll = window.setInterval(() => {
                  const st = player?.getPlayerState?.();
                  if (st !== YTP.PLAYING) return;
                  if (document.hidden) {
                    player?.pauseVideo();
                    return;
                  }
                  onSample(player?.getCurrentTime?.() || 0, (to) => player?.seekTo(to, true));
                }, 1000) as unknown as number;
              }
            } else {
              if (poll) {
                window.clearInterval(poll);
                poll = 0;
              }
              if (e.data === YTP.PAUSED || e.data === YTP.ENDED) flush(true);
            }
          },
        },
      });
    });

    const onVisibility = () => {
      if (document.hidden && player?.pauseVideo) player.pauseVideo();
    };
    const onBlur = () => player?.pauseVideo && player.pauseVideo();
    const onUnload = () => flush(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('beforeunload', onUnload);

    return () => {
      cancelled = true;
      if (poll) window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('beforeunload', onUnload);
      flush(true);
      try {
        player?.destroy?.();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, lesson.youtubeId]);

  const pct = duration > 0 ? Math.min(100, Math.round((watchedSec / duration) * 100)) : 0;
  const needPct = Math.round(lesson.completionRatio * 100);

  return (
    <div>
      <div
        onContextMenu={(e) => restricted && e.preventDefault()}
        style={{
          position: 'relative',
          background: '#000',
          borderRadius: 16,
          overflow: 'hidden',
          aspectRatio: '16 / 9',
        }}
      >
        {error ? (
          <div style={{ color: '#fff', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <AlertCircle size={18} /> {error}
          </div>
        ) : isYouTube ? (
          <div ref={ytHostRef} style={{ width: '100%', height: '100%' }} />
        ) : (
          <video
            ref={videoElRef}
            src={lesson.url}
            controls
            playsInline
            preload="metadata"
            controlsList={restricted ? 'nodownload noplaybackrate noremoteplayback' : 'nodownload'}
            disablePictureInPicture
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        )}

        {toast && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 60,
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.82)',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              zIndex: 5,
            }}
          >
            <Lock size={13} /> {toast}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          <span style={{ color: completed ? 'var(--correct)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {completed ? (
              <>
                <CheckCircle2 size={15} /> 시청 완료
              </>
            ) : (
              `시청 진행률 ${pct}%`
            )}
          </span>
          {!completed && (
            <span style={{ color: 'var(--text-tertiary)' }}>완료 기준 {needPct}%</span>
          )}
        </div>
        <div style={{ height: 8, background: 'var(--bg-color)', borderRadius: 4, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: completed ? 'var(--correct)' : 'var(--primary)',
              transition: 'width 0.4s',
            }}
          />
        </div>
        {restricted && !completed && (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
            영상을 끝까지 시청해야 이수 처리됩니다. 앞으로 건너뛰기·배속은 제한되며, 다른 탭으로 이동하면 자동으로 일시정지됩니다.
          </p>
        )}
      </div>
    </div>
  );
}
