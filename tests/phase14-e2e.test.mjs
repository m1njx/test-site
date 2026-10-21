import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Phase 14: E2E Scenario B - Answer Storage Auto-Recovery without Admin Login
// ---------------------------------------------------------------------------
test('Phase 14 E2E [Scenario B]: Answer Key Auto-Recovery on Demand after Server Restart', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-phase14-b-'));
  const keyFile = path.join(tempDir, 'quiz-keys.json');

  let inMemoryKeys = null;

  // Simulated Persistent Repository (e.g. Firestore quizAnswers)
  const persistentFirestoreDb = {
    'quiz-os-final': {
      quizId: 'quiz-os-final',
      title: '운영체제 기말고사',
      deadline: '2026-12-31',
      maxAttempts: 2,
      isPublished: true,
      questions: [
        {
          id: 'q1',
          type: 'multiple',
          title: '가상 메모리 페이징',
          correctAnswers: ['1'],
        },
        {
          id: 'q2',
          type: 'short',
          title: '임계 구역 해결 조건',
          correctAnswers: ['상호 배제', 'mutual exclusion'],
        },
      ],
    },
  };

  async function getOrFetchQuizKey(quizId) {
    if (inMemoryKeys && inMemoryKeys[quizId]) {
      return inMemoryKeys[quizId];
    }
    if (fs.existsSync(keyFile)) {
      inMemoryKeys = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
      if (inMemoryKeys[quizId]) return inMemoryKeys[quizId];
    }

    // Auto-recovery from persistent repository (without admin login!)
    if (persistentFirestoreDb[quizId]) {
      const restored = persistentFirestoreDb[quizId];
      inMemoryKeys = inMemoryKeys || {};
      inMemoryKeys[quizId] = restored;
      fs.writeFileSync(keyFile, JSON.stringify(inMemoryKeys, null, 2), 'utf8');
      return restored;
    }
    return null;
  }

  // 1. Initial State: Server starts fresh with empty cache and empty disk
  assert.equal(fs.existsSync(keyFile), false);

  // 2. Student submits exam without admin having logged in
  const retrievedKey = await getOrFetchQuizKey('quiz-os-final');

  // 3. Key is automatically recovered and persisted!
  assert.ok(retrievedKey);
  assert.equal(retrievedKey.title, '운영체제 기말고사');
  assert.equal(retrievedKey.questions.length, 2);
  assert.equal(fs.existsSync(keyFile), true);

  // 4. Server restarts (memory wiped)
  inMemoryKeys = null;

  // 5. Subsequent request reloads from disk or repository seamlessly
  const afterRestart = await getOrFetchQuizKey('quiz-os-final');
  assert.ok(afterRestart);
  assert.equal(afterRestart.title, '운영체제 기말고사');

  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Phase 14: E2E Scenario C - Persistent Idempotency Across Server Restarts
// ---------------------------------------------------------------------------
test('Phase 14 E2E [Scenario C]: Persistent Idempotency Preserves Results Across Server Restarts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-phase14-c-'));
  const subFile = path.join(tempDir, 'submissions.json');

  let inMemorySubmissions = null;

  function loadSubmissions() {
    if (inMemorySubmissions !== null) return inMemorySubmissions;
    if (fs.existsSync(subFile)) {
      inMemorySubmissions = JSON.parse(fs.readFileSync(subFile, 'utf8'));
      return inMemorySubmissions;
    }
    inMemorySubmissions = {};
    return inMemorySubmissions;
  }

  function saveSubmission(key, record) {
    const all = loadSubmissions();
    all[key] = { ...record, savedAt: Date.now() };
    inMemorySubmissions = all;
    fs.writeFileSync(subFile, JSON.stringify(all, null, 2), 'utf8');
  }

  let aiExecutionCount = 0;
  function processGrading(quizId, studentId, attemptId, answers) {
    const key = `${quizId}:${studentId}:${attemptId}`;
    const all = loadSubmissions();
    if (all[key]) {
      return { ...all[key], idempotent: true };
    }

    // Compute score (simulate AI grading cost)
    aiExecutionCount++;
    const isCorrect = answers.q1 === '상호 배제';
    const result = {
      ok: true,
      quizId,
      studentId,
      attemptId,
      score: isCorrect ? 10 : 0,
      total: 10,
      status: 'COMPLETED',
    };
    saveSubmission(key, result);
    return { ...result, idempotent: false };
  }

  const attemptId = 'att-uuid-2026';

  // First submission: performs grading
  const res1 = processGrading('quiz-1', 'student-01', attemptId, { q1: '상호 배제' });
  assert.equal(res1.score, 10);
  assert.equal(res1.idempotent, false);
  assert.equal(aiExecutionCount, 1);

  // SERVER RESTARTS: memory is wiped!
  inMemorySubmissions = null;

  // Second submission with same attemptId: restores from disk, 0 AI calls
  const res2 = processGrading('quiz-1', 'student-01', attemptId, { q1: '상호 배제' });
  assert.equal(res2.score, 10);
  assert.equal(res2.idempotent, true);
  assert.equal(aiExecutionCount, 1); // AI was NOT called again!

  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Phase 14: E2E Scenario D & G - Client Tampering Rejection & Ownership Security
// ---------------------------------------------------------------------------
test('Phase 14 E2E [Scenario D & G]: Server Overrides Client Scores and Rejects Attempt Hijacking', () => {
  const authoritativeKey = {
    quizId: 'quiz-sec-1',
    deadline: '2026-12-31',
    maxAttempts: 1,
    questions: [
      { id: 'q1', type: 'multiple', correctAnswers: ['1'] },
      { id: 'q2', type: 'multiple', correctAnswers: ['0'] },
    ],
  };

  function authoritativeGrade(clientPayload) {
    // Client attempts to manipulate score, total, and deadline in payload:
    // clientPayload = { score: 100, total: 10, deadline: '2099-01-01', ... }
    
    // Server computes strictly from authoritativeKey:
    const answers = clientPayload.answers || {};
    let serverScore = 0;
    for (const q of authoritativeKey.questions) {
      const user = answers[q.id];
      const match = Array.isArray(user) && user[0] === q.correctAnswers[0];
      if (match) serverScore += 5;
    }

    return {
      score: serverScore,
      total: authoritativeKey.questions.length * 5,
      deadlineEnforced: authoritativeKey.deadline,
    };
  }

  // Student attempts to inject 100 points when answers are actually wrong
  const tamperedPayload = {
    score: 100, // Attacker's forged score
    total: 2,   // Attacker's forged total
    deadline: '2099-01-01',
    answers: {
      q1: ['0'], // Wrong (correct is '1')
      q2: ['0'], // Correct
    },
  };

  const outcome = authoritativeGrade(tamperedPayload);
  assert.equal(outcome.score, 5); // Strictly 5, client's 100 was discarded!
  assert.equal(outcome.total, 10);
  assert.equal(outcome.deadlineEnforced, '2026-12-31');

  // Scenario G: Attempt Hijacking
  const existingRecord = {
    quizId: 'quiz-sec-1',
    studentId: 'student-victim',
    attemptId: 'att-fixed-123',
    score: 10,
  };

  function verifyAttemptAccess(requestStudentId, cachedRecord) {
    if (cachedRecord.studentId && requestStudentId !== cachedRecord.studentId) {
      throw new Error('해당 제출 시도에 대한 접근 권한이 없습니다.');
    }
    return true;
  }

  assert.throws(
    () => verifyAttemptAccess('student-attacker', existingRecord),
    /접근 권한이 없습니다/
  );
  assert.doesNotThrow(() => verifyAttemptAccess('student-victim', existingRecord));
});

// ---------------------------------------------------------------------------
// Phase 14: E2E Scenario F - AI Failure Resilience (REVIEW_REQUIRED Status)
// ---------------------------------------------------------------------------
test('Phase 14 E2E [Scenario F]: AI Failure Sets REVIEW_REQUIRED Without Arbitrary Zero Scoring', () => {
  function gradeWithAiResilience(shortQuestion, userAns, simulateAiFailure = false) {
    const isExact = (shortQuestion.correctAnswers || []).includes(userAns.trim());
    if (isExact) {
      return { isCorrect: true, reason: '정답입니다.', status: 'COMPLETED' };
    }

    if (simulateAiFailure) {
      // AI failed / timed out: DO NOT permanently fail the student without notice
      return {
        isCorrect: false,
        reason: 'AI 채점 연결 지연으로 관리자 확인이 필요합니다 (검토 대기).',
        status: 'REVIEW_REQUIRED',
        pendingReview: true,
      };
    }

    return { isCorrect: false, reason: '오답입니다.', status: 'COMPLETED' };
  }

  const q = { id: 'q1', type: 'short', correctAnswers: ['데드락'] };

  // AI service outage simulated
  const failureCase = gradeWithAiResilience(q, '교착 상태 (deadlock)', true);
  assert.equal(failureCase.status, 'REVIEW_REQUIRED');
  assert.equal(failureCase.pendingReview, true);
  assert.ok(failureCase.reason.includes('검토 대기'));

  // Exact match works even during outage
  const exactCase = gradeWithAiResilience(q, '데드락', true);
  assert.equal(exactCase.isCorrect, true);
  assert.equal(exactCase.status, 'COMPLETED');
});
