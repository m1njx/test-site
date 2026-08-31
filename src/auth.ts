/**
 * 관리자 게이트.
 *
 * ⚠️ 중요한 한계
 * 이 앱은 백엔드 없는 정적 사이트라, 클라이언트에서 하는 어떤 검사도
 * 결국 우회 가능하다(개발자도구로 상태를 바꾸면 그만). 여기서 막는 것은
 * "번들 파일을 열어 비밀번호를 그대로 읽어가는" 가장 흔한 공격이다.
 *
 * 진짜 권한 분리가 필요해지면 Firebase Auth + Firestore 보안 규칙으로
 * 서버 측에서 강제해야 한다 (docs/SECURITY.md 참고).
 */

const LOCK_KEY = 'aim_admin_lock';
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000; // 5분

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface LockState {
  fails: number;
  until: number;
}

function readLock(): LockState {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return { fails: 0, until: 0 };
    return JSON.parse(raw) as LockState;
  } catch {
    return { fails: 0, until: 0 };
  }
}

function writeLock(s: LockState) {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

/** 잠금 남은 시간(ms). 0이면 시도 가능 */
export function lockRemainingMs(): number {
  const { until } = readLock();
  return Math.max(0, until - Date.now());
}

export function resetLock() {
  writeLock({ fails: 0, until: 0 });
}

export type AdminCheck =
  | { ok: true }
  | { ok: false; reason: 'locked'; remainingMs: number }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'unconfigured' };

/**
 * 비밀번호 검증.
 * VITE_ADMIN_PASSWORD_HASH(권장, SHA-256 hex)가 있으면 그것을 쓰고,
 * 없으면 예전 방식인 VITE_ADMIN_PASSWORD 평문과 비교한다(하위 호환).
 */
export async function verifyAdminPassword(input: string): Promise<AdminCheck> {
  const remainingMs = lockRemainingMs();
  if (remainingMs > 0) return { ok: false, reason: 'locked', remainingMs };

  const hash = import.meta.env.VITE_ADMIN_PASSWORD_HASH as string | undefined;
  const plain = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined;
  if (!hash && !plain) return { ok: false, reason: 'unconfigured' };

  let matched = false;
  if (hash) {
    matched = (await sha256Hex(input)) === hash.trim().toLowerCase();
  } else if (plain) {
    matched = input === plain;
  }

  if (matched) {
    resetLock();
    return { ok: true };
  }

  const state = readLock();
  const fails = state.fails + 1;
  if (fails >= MAX_ATTEMPTS) {
    writeLock({ fails: 0, until: Date.now() + LOCK_MS });
    return { ok: false, reason: 'locked', remainingMs: LOCK_MS };
  }
  writeLock({ fails, until: 0 });
  return { ok: false, reason: 'wrong', attemptsLeft: MAX_ATTEMPTS - fails };
}
