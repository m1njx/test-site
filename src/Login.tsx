import React, { useState } from 'react';
import type { Student } from './team';
import { ADMIN_ID } from './team';
import { LogIn } from 'lucide-react';

interface LoginProps {
  onLogin: (studentId: string) => void;
  dynamicTeam: Student[];
}

export default function Login({ onLogin, dynamicTeam }: LoginProps) {
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId.trim()) return;

    if (studentId === ADMIN_ID) {
      onLogin(studentId);
      return;
    }

    const member = dynamicTeam.find(m => m.id === studentId);
    if (member) {
      onLogin(studentId);
    } else {
      setError('등록되지 않은 학번입니다.');
    }
  };

  return (
    <div className="app-container" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'transparent', boxShadow: 'none'}}>
      <form onSubmit={handleLogin} style={{background: 'var(--surface)', padding: 40, borderRadius: 24, boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 400}}>
        <h1 style={{fontSize: 24, fontWeight: 800, marginBottom: 8, textAlign: 'center'}}>로그인</h1>
        <p style={{color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 32}}>학번을 입력해주세요.</p>
        
        <input
          type="text"
          placeholder="학번 입력 (예: 20201111)"
          value={studentId}
          onChange={(e) => {
            setStudentId(e.target.value);
            setError('');
          }}
          style={{
            width: '100%',
            padding: '16px 20px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--bg-color)',
            fontSize: 16,
            color: 'var(--text-primary)',
            marginBottom: error ? 8 : 24,
            outline: 'none'
          }}
        />
        
        {error && <p style={{color: '#E74C3C', fontSize: 14, marginBottom: 24}}>{error}</p>}
        
        <button type="submit" className="btn btn-primary" style={{width: '100%', justifyContent: 'center'}}>
          입장하기
          <LogIn size={20} />
        </button>
      </form>
    </div>
  );
}
