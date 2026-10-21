/**
 * 로그인 세션 관리.
 *
 * Firebase Auth(이메일/비밀번호)를 쓰되, 팀원들이 쓰던 **학번 로그인 UX는 유지**한다.
 *   학번 → 이메일 매핑 → Firebase Auth
 *
 * 명부(`students/{학번}`)에 등록된 학번만 계정을 만들 수 있고,
 * 계정을 만들면 그 학번 문서에 `uid` 가 기록된다.
 * Firestore 규칙은 이 `uid` 로 "본인 문서만 쓰기"를 강제한다(firestore.rules).
 *
 * Firebase 미설정(Mock) 환경에서는 예전처럼 학번만으로 통과시킨다.
 */
import { auth, db, hasAuth } from './firebase';
import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updatePassword,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { ADMIN_ID } from './team';
import { verifyStudent } from './api';

/** 실제 이메일이 없는 팀원을 위한 내부 도메인 (수신 불가 — 비밀번호 재설정 메일은 못 받는다) */
const INTERNAL_DOMAIN = 'aim.local';

export function studentIdToEmail(studentId: string, email?: string): string {
  const trimmed = (email || '').trim();
  if (trimmed) return trimmed;
  return `${studentId}@${INTERNAL_DOMAIN}`;
}

export function isInternalEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith(`@${INTERNAL_DOMAIN}`);
}

export interface SessionUser {
  studentId: string;
  name: string;
  isAdmin: boolean;
  email: string | null;
  /** 실제 이메일이 연결돼 있어 비밀번호 재설정 메일을 받을 수 있는지 */
  canResetByEmail: boolean;
}

/* ------------------------------------------------------------------ *
 * 관리자 판정
 * ------------------------------------------------------------------ */
/**
 * 관리자 여부는 클라이언트 값이 아니라 Firestore 의 `admins/{uid}` 문서 존재로 정한다.
 * 이 컬렉션은 규칙상 앱에서 쓸 수 없고 Firebase 콘솔에서만 만들 수 있어,
 * 개발자도구로 상태를 바꿔도 관리자 권한을 얻을 수 없다.
 */
export async function checkIsAdmin(uid: string): Promise<boolean> {
  if (!db) return false;
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (e) {
    console.warn('관리자 확인 실패:', e);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * uid → 학번
 * ------------------------------------------------------------------ */
async function studentIdFromUser(user: User): Promise<string | null> {
  // 내부 이메일이면 로컬 파트가 곧 학번 (읽기 없이 해결)
  if (isInternalEmail(user.email)) {
    return user.email!.split('@')[0];
  }
  if (user.displayName) {
    return user.displayName;
  }
  const cachedId = localStorage.getItem('aim_team_user');
  if (cachedId) {
    return cachedId;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 세션 구독
 * ------------------------------------------------------------------ */
/**
 * 로그인 상태 변화를 구독한다. 구독 해제 함수를 반환.
 * Mock 모드에서는 localStorage 기반의 예전 세션을 그대로 흉내낸다.
 */
export function observeSession(cb: (user: SessionUser | null) => void): () => void {
  if (!hasAuth || !auth) {
    const legacyId = localStorage.getItem('aim_team_user');
    if (legacyId) {
      verifyStudent(legacyId).then((s) =>
        cb({
          studentId: legacyId,
          name: s?.name || (legacyId === ADMIN_ID ? '관리자' : legacyId),
          isAdmin: legacyId === ADMIN_ID,
          email: null,
          canResetByEmail: false,
        }),
      );
    } else {
      cb(null);
    }
    return () => {};
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (!user) {
      cb(null);
      return;
    }
    const isAdmin = await checkIsAdmin(user.uid);
    const studentId = await studentIdFromUser(user);

    if (!studentId && !isAdmin) {
      // 명부에 없는 계정 — 로그인 상태를 유지할 이유가 없다
      if (auth) await fbSignOut(auth).catch(() => {});
      cb(null);
      return;
    }

    const effectiveStudentId = studentId || (isAdmin ? ADMIN_ID : 'unknown');
    const student = studentId ? await verifyStudent(studentId) : null;

    // 관리자가 아닌 일반 학생의 경우, 학생 문서의 uid가 현재 auth.uid와 반드시 일치해야 함
    if (!isAdmin && (!student || student.uid !== user.uid)) {
      if (auth) await fbSignOut(auth).catch(() => {});
      cb(null);
      return;
    }

    cb({
      studentId: effectiveStudentId,
      name: student?.name || (isAdmin ? '관리자' : effectiveStudentId),
      isAdmin,
      email: user.email,
      canResetByEmail: !isInternalEmail(user.email),
    });
  });
}

/* ------------------------------------------------------------------ *
 * 로그인 / 가입
 * ------------------------------------------------------------------ */
export type AuthResult =
  | { ok: true }
  | { ok: false; code: 'not_on_roster' | 'needs_signup' | 'wrong_password' | 'weak_password' | 'already_registered' | 'too_many' | 'unknown'; message: string };

function mapFirebaseError(e: unknown): AuthResult {
  const code = (e as { code?: string })?.code || '';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return { ok: false, code: 'wrong_password', message: '비밀번호가 올바르지 않습니다.' };
  }
  if (code === 'auth/user-not-found') {
    return { ok: false, code: 'needs_signup', message: '아직 비밀번호가 설정되지 않은 계정입니다.' };
  }
  if (code === 'auth/too-many-requests') {
    return { ok: false, code: 'too_many', message: '시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' };
  }
  if (code === 'auth/weak-password') {
    return { ok: false, code: 'weak_password', message: '비밀번호는 6자 이상이어야 합니다.' };
  }
  if (code === 'auth/email-already-in-use') {
    return { ok: false, code: 'already_registered', message: '이미 비밀번호가 설정된 학번입니다. 로그인해주세요.' };
  }
  console.error('auth error:', e);
  return { ok: false, code: 'unknown', message: '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' };
}

/** 학번이 명부에 있는지 + 이미 계정이 만들어졌는지 확인 (비인증 PII 노출 방지) */
export async function lookupStudent(
  studentId: string,
): Promise<{ onRoster: boolean; hasAccount: boolean; name?: string; email?: string }> {
  if (!hasAuth || !auth) {
    const s = await verifyStudent(studentId);
    if (!s) return { onRoster: false, hasAccount: false };
    return { onRoster: true, hasAccount: !!s.uid, name: s.name, email: s.email };
  }
  // Firebase Auth 환경: 비인증 상태에서는 학번 추측을 통한 PII 유출을 방지하기 위해 직접 문서를 노출하지 않음
  if (auth.currentUser) {
    const s = await verifyStudent(studentId);
    if (s && s.uid === auth.currentUser.uid) {
      return { onRoster: true, hasAccount: true, name: s.name, email: s.email };
    }
  }
  return { onRoster: true, hasAccount: true };
}

export async function signIn(studentId: string, password: string): Promise<AuthResult> {
  if (!hasAuth || !auth) {
    // Mock 모드: 예전처럼 명부 확인만
    const s = await verifyStudent(studentId);
    if (!s) return { ok: false, code: 'not_on_roster', message: '등록되지 않은 학번입니다.' };
    localStorage.setItem('aim_team_user', studentId);
    return { ok: true };
  }

  const trimmedId = studentId.trim();
  if (!trimmedId) {
    return { ok: false, code: 'not_on_roster', message: '학번을 입력해주세요.' };
  }

  try {
    // 비인증 상태에서 PII를 사전 조회하지 않고, Firebase Auth를 통해 인증 시도
    const email = studentIdToEmail(trimmedId);
    const cred = await signInWithEmailAndPassword(auth, email, password);

    // 인증 완료 후, 본인의 학생 문서 권한 검증 (signedIn() && resource.data.uid == request.auth.uid)
    const student = await verifyStudent(trimmedId);
    const isAdmin = await checkIsAdmin(cred.user.uid);

    if (!isAdmin && (!student || student.uid !== cred.user.uid)) {
      // 명부에 등록되지 않았거나 타인의 학번으로 우회 접속한 경우 세션 즉시 파기
      await fbSignOut(auth).catch(() => {});
      return {
        ok: false,
        code: 'not_on_roster',
        message: '해당 학번에 대한 권한이 확인되지 않았습니다. 관리자에게 문의해주세요.',
      };
    }

    localStorage.setItem('aim_team_user', trimmedId);
    return { ok: true };
  } catch (e) {
    return mapFirebaseError(e);
  }
}

/** 최초 1회 비밀번호 설정 (미인가 계정 선점 방지: 관리자 발급 절차 강제) */
export async function signUp(studentId: string, password: string): Promise<AuthResult> {
  if (!hasAuth || !auth || !db) return signIn(studentId, password);

  // 보안 강화: 타인 학번 최초 가입 및 미등록 계정 선점 차단
  // 최초 계정 등록 및 UID 바인딩은 관리자 승인/발급 절차를 통해서만 가능합니다.
  return {
    ok: false,
    code: 'not_on_roster',
    message: '계정 발급 및 초기 설정은 관리자 승인 절차를 통해서만 가능합니다. 관리자에게 문의하세요.',
  };
}

export async function signOutUser(): Promise<void> {
  localStorage.removeItem('aim_team_user');
  if (hasAuth && auth) await fbSignOut(auth).catch(() => {});
}

/** 비밀번호 변경 (현재 비밀번호 확인 후) */
export async function changePassword(currentPw: string, newPw: string): Promise<AuthResult> {
  if (!hasAuth || !auth || !auth.currentUser) {
    return { ok: false, code: 'unknown', message: '로그인 상태가 아닙니다.' };
  }
  if (newPw.length < 6) {
    return { ok: false, code: 'weak_password', message: '비밀번호는 6자 이상이어야 합니다.' };
  }
  try {
    const cred = EmailAuthProvider.credential(auth.currentUser.email!, currentPw);
    await reauthenticateWithCredential(auth.currentUser, cred);
    await updatePassword(auth.currentUser, newPw);
    return { ok: true };
  } catch (e) {
    return mapFirebaseError(e);
  }
}

/** 비밀번호 재설정 메일 (실제 이메일이 연결된 계정만 가능) */
export async function sendReset(studentId: string): Promise<AuthResult> {
  if (!hasAuth || !auth) return { ok: false, code: 'unknown', message: '이 환경에서는 지원되지 않습니다.' };
  const info = await lookupStudent(studentId);
  if (!info.onRoster) {
    return { ok: false, code: 'not_on_roster', message: '등록되지 않은 학번입니다.' };
  }
  if (!info.email) {
    return {
      ok: false,
      code: 'unknown',
      message: '이 계정에는 이메일이 연결되어 있지 않아 재설정 메일을 보낼 수 없습니다. 관리자에게 문의해주세요.',
    };
  }
  try {
    await sendPasswordResetEmail(auth, info.email);
    return { ok: true };
  } catch (e) {
    return mapFirebaseError(e);
  }
}
