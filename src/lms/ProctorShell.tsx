import { useEffect, useRef, useState } from 'react';
import { ShieldAlert, Maximize, Eye } from 'lucide-react';
import { useProctor, enterFullscreen, isFullscreen } from './useProctor';
import { PROCTOR_FLAG_THRESHOLD } from './types';

interface Props {
  active: boolean;
  sessionId: string | null;
  requireFullscreen?: boolean;
  children: React.ReactNode;
}

/**
 * 퀴즈 응시 UI 를 감싸 부정행위 로깅 + 전체화면 유도 + 경고 배너를 제공.
 * 학생을 차단하지 않고 "경고 + 전부 기록" 방침.
 */
export default function ProctorShell({ active, sessionId, requireFullscreen = true, children }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [fsDismissed, setFsDismissed] = useState(false);
  const { flagScore, flagged, awayCount, fullscreenActive } = useProctor({
    enabled: active,
    sessionId,
  });

  // 시작 시 전체화면 요청 (사용자 제스처 맥락에서 최초 1회)
  useEffect(() => {
    if (!active || !requireFullscreen) return;
    const t = window.setTimeout(() => {
      if (!isFullscreen()) enterFullscreen(wrapRef.current || undefined);
    }, 300);
    return () => window.clearTimeout(t);
  }, [active, requireFullscreen]);

  if (!active) return <>{children}</>;

  const showFsBar = requireFullscreen && !fullscreenActive && !fsDismissed;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* 상시 안내 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '8px 14px',
          borderRadius: 12,
          marginBottom: 12,
          fontSize: 12,
          fontWeight: 600,
          background: flagged ? 'rgba(231,76,60,0.12)' : 'rgba(49,130,246,0.08)',
          color: flagged ? 'var(--incorrect)' : 'var(--primary)',
        }}
      >
        <Eye size={14} />
        {flagged ? (
          <span>부정행위 의심 활동이 다수 감지되었습니다. 모든 활동이 기록되고 있습니다.</span>
        ) : (
          <span>응시 중 화면 이탈·복사·개발자도구 사용은 자동으로 기록됩니다.</span>
        )}
        {awayCount > 0 && (
          <span style={{ marginLeft: 'auto', color: 'var(--incorrect)' }}>화면 이탈 {awayCount}회</span>
        )}
      </div>

      {showFsBar && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            padding: '10px 14px',
            borderRadius: 12,
            marginBottom: 12,
            fontSize: 13,
            fontWeight: 700,
            background: 'rgba(231,76,60,0.1)',
            color: 'var(--incorrect)',
          }}
        >
          <ShieldAlert size={16} />
          <span style={{ flex: 1 }}>전체화면이 해제되었습니다. 시험 무결성을 위해 전체화면을 유지해주세요.</span>
          <button
            onClick={() => enterFullscreen(wrapRef.current || undefined)}
            className="btn btn-primary"
            style={{ padding: '6px 12px', fontSize: 12 }}
          >
            <Maximize size={14} /> 전체화면
          </button>
          <button
            onClick={() => setFsDismissed(true)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12 }}
          >
            무시
          </button>
        </div>
      )}

      {children}

      {flagScore >= PROCTOR_FLAG_THRESHOLD && (
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>
          ⚠️ 이 응시 기록은 관리자 검토 대상으로 표시됩니다.
        </div>
      )}
    </div>
  );
}
