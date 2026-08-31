import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * 렌더링 중 예외가 나도 흰 화면 대신 복구 UI를 보여준다.
 * (예: 퀴즈 응시 중 예외가 나면 학생이 아무것도 못 하고 답안을 잃는다)
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  private handleReset = () => {
    // 손상된 로컬 상태(테마/세션 등)로 인한 반복 크래시 탈출구.
    // 임시 저장된 답안(aim_quiz_answers_*)은 일부러 남겨둔다.
    try {
      localStorage.removeItem('aim_team_user');
      localStorage.removeItem('aim_theme');
    } catch {
      /* noop */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 24,
            boxShadow: 'var(--shadow-md)',
            padding: 40,
            maxWidth: 460,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🪵</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>문제가 발생했어요</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
            화면을 그리는 중 오류가 생겼습니다. 작성 중이던 답안은 기기에 임시 저장되어 있습니다.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={this.handleReload} style={{ flex: 'none' }}>
              새로고침
            </button>
            <button className="btn btn-secondary" onClick={this.handleReset} style={{ flex: 'none' }}>
              로그아웃 후 초기화
            </button>
          </div>
          <details style={{ marginTop: 24, textAlign: 'left' }}>
            <summary style={{ fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer' }}>
              오류 정보 (관리자 문의 시 첨부)
            </summary>
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                background: 'var(--bg-color)',
                borderRadius: 10,
                fontSize: 11,
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 180,
                overflow: 'auto',
              }}
            >
              {this.state.error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
