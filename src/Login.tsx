import React, { useState } from 'react';
import { LogIn, ArrowLeft, KeyRound, Loader2 } from 'lucide-react';
import { hasAuth } from './firebase';
import { lookupStudent, signIn, signUp, sendReset } from './session';

interface LoginProps {
  /** 로그인 성공 시 호출. 실제 세션 반영은 observeSession 이 담당한다 */
  onLogin: (studentId: string) => void;
}

type Step = 'id' | 'password' | 'signup';

export default function Login({ onLogin }: LoginProps) {
  const [step, setStep] = useState<Step>('id');
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep('id');
    setPassword('');
    setPassword2('');
    setError('');
    setNotice('');
  };

  /* 1단계: 학번이 명부에 있는지 확인 */
  const handleIdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      // Auth 미사용 환경(Mock)에서는 예전처럼 학번만으로 입장
      if (!hasAuth) {
        const res = await signIn(studentId.trim(), '');
        if (res.ok) onLogin(studentId.trim());
        else setError(res.message);
        return;
      }
      const info = await lookupStudent(studentId.trim());
      if (!info.onRoster) {
        setError('등록되지 않은 학번입니다. 관리자에게 문의해주세요.');
        return;
      }
      setStudentName(info.name || '');
      setStep(info.hasAccount ? 'password' : 'signup');
    } catch {
      setError('확인 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  /* 2단계: 비밀번호 로그인 */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const res = await signIn(studentId.trim(), password);
    setBusy(false);
    if (res.ok) onLogin(studentId.trim());
    else {
      setError(res.message);
      if (res.code === 'needs_signup') setStep('signup');
    }
  };

  /* 2단계(최초): 비밀번호 설정 */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return; }
    if (password !== password2) { setError('비밀번호가 서로 다릅니다.'); return; }
    setBusy(true);
    setError('');
    const res = await signUp(studentId.trim(), password);
    setBusy(false);
    if (res.ok) onLogin(studentId.trim());
    else {
      setError(res.message);
      if (res.code === 'already_registered') setStep('password');
    }
  };

  const handleReset = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    const res = await sendReset(studentId.trim());
    setBusy(false);
    if (res.ok) setNotice('비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해주세요.');
    else setError(res.message);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '16px 20px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--bg-color)',
    fontSize: 16,
    color: 'var(--text-primary)',
    marginBottom: 12,
    outline: 'none',
  };

  const backButton = (
    <button
      type="button"
      onClick={reset}
      style={{background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, marginBottom: 16, padding: 0}}
    >
      <ArrowLeft size={14} /> 학번 다시 입력
    </button>
  );

  return (
    <div className="app-container" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'transparent', boxShadow: 'none'}}>
      <div style={{background: 'var(--surface)', padding: 40, borderRadius: 24, boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 400}}>

        {step === 'id' && (
          <form onSubmit={handleIdSubmit}>
            <h1 style={{fontSize: 24, fontWeight: 800, marginBottom: 8, textAlign: 'center'}}>로그인</h1>
            <p style={{color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 32, fontSize: 14}}>
              학번을 입력해주세요.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              aria-label="학번"
              placeholder="학번 (예: 20201111)"
              value={studentId}
              disabled={busy}
              onChange={(e) => { setStudentId(e.target.value); setError(''); }}
              style={inputStyle}
            />
            {error && <p role="alert" style={{color: 'var(--incorrect)', fontSize: 13, marginBottom: 16}}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{width: '100%', justifyContent: 'center', marginTop: 12}} disabled={busy || !studentId.trim()}>
              {busy ? <Loader2 className="animate-spin" size={20} /> : <>다음 <LogIn size={18} /></>}
            </button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handleLogin}>
            {backButton}
            <h1 style={{fontSize: 22, fontWeight: 800, marginBottom: 6}}>
              {studentName ? `${studentName}님, 안녕하세요` : '비밀번호 입력'}
            </h1>
            <p style={{color: 'var(--text-secondary)', marginBottom: 28, fontSize: 14}}>비밀번호를 입력해주세요.</p>
            <input
              type="password"
              autoFocus
              aria-label="비밀번호"
              placeholder="비밀번호"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              style={inputStyle}
            />
            {error && <p role="alert" style={{color: 'var(--incorrect)', fontSize: 13, marginBottom: 12}}>{error}</p>}
            {notice && <p style={{color: 'var(--correct)', fontSize: 13, marginBottom: 12}}>{notice}</p>}
            <button type="submit" className="btn btn-primary" style={{width: '100%', justifyContent: 'center', marginTop: 8}} disabled={busy || !password}>
              {busy ? <Loader2 className="animate-spin" size={20} /> : <>입장하기 <LogIn size={18} /></>}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={busy}
              style={{width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12, marginTop: 16}}
            >
              비밀번호를 잊으셨나요?
            </button>
          </form>
        )}

        {step === 'signup' && (
          <form onSubmit={handleSignUp}>
            {backButton}
            <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6}}>
              <KeyRound size={20} color="var(--primary)" />
              <h1 style={{fontSize: 20, fontWeight: 800}}>비밀번호 설정</h1>
            </div>
            <p style={{color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14, lineHeight: 1.6}}>
              {studentName ? <><strong>{studentName}</strong>님, </> : null}
              첫 로그인입니다. 앞으로 사용할 비밀번호를 만들어주세요. (6자 이상)
            </p>
            <input
              type="password"
              autoFocus
              aria-label="새 비밀번호"
              placeholder="새 비밀번호 (6자 이상)"
              autoComplete="new-password"
              value={password}
              disabled={busy}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              style={inputStyle}
            />
            <input
              type="password"
              aria-label="비밀번호 확인"
              placeholder="비밀번호 확인"
              autoComplete="new-password"
              value={password2}
              disabled={busy}
              onChange={(e) => { setPassword2(e.target.value); setError(''); }}
              style={inputStyle}
            />
            {error && <p role="alert" style={{color: 'var(--incorrect)', fontSize: 13, marginBottom: 12}}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{width: '100%', justifyContent: 'center', marginTop: 8}} disabled={busy || !password || !password2}>
              {busy ? <Loader2 className="animate-spin" size={20} /> : '설정하고 시작하기'}
            </button>
            <p style={{fontSize: 11, color: 'var(--text-tertiary)', marginTop: 16, lineHeight: 1.5, textAlign: 'center'}}>
              비밀번호를 잊으면 관리자만 초기화할 수 있으니 잘 기억해주세요.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
