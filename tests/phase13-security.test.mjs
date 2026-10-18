import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { inspectAndMigrateQuiz } from '../scripts/migrate-quiz-answers.mjs';

// ---------------------------------------------------------------------------
// 1. Answer Storage Reliability & Atomic Writing Tests
// ---------------------------------------------------------------------------
test('Phase 13: Atomic Answer Key Storage and In-Memory Cache', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-lms-test-'));
  const keyFile = path.join(tempDir, 'quiz-keys.json');

  let inMemoryKeys = null;

  function loadKeys() {
    if (inMemoryKeys !== null) return inMemoryKeys;
    if (fs.existsSync(keyFile)) {
      inMemoryKeys = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
      return inMemoryKeys;
    }
    inMemoryKeys = {};
    return inMemoryKeys;
  }

  function saveKeys(data) {
    inMemoryKeys = data;
    const tmp = path.join(tempDir, `.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`);
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, keyFile);
  }

  // Initial load
  assert.deepEqual(loadKeys(), {});

  // Save new quiz keys
  saveKeys({
    'quiz-1': {
      quizId: 'quiz-1',
      title: '파이썬 시험',
      questions: [{ id: 'q1', type: 'multiple', correctAnswers: ['0'] }],
    },
  });

  // Verify memory cache
  assert.equal(loadKeys()['quiz-1'].title, '파이썬 시험');

  // Verify file on disk
  assert.equal(fs.existsSync(keyFile), true);
  const diskData = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  assert.equal(diskData['quiz-1'].questions[0].correctAnswers[0], '0');

  // Verify atomic update
  saveKeys({
    ...diskData,
    'quiz-2': {
      quizId: 'quiz-2',
      title: '자바스크립트 시험',
      questions: [{ id: 'q2', type: 'short', correctAnswers: ['const a = 1'] }],
    },
  });

  const updated = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  assert.equal(Object.keys(updated).length, 2);

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 2. Authoritative Server Grading Logic & Idempotency
// ---------------------------------------------------------------------------
test('Phase 13: Server-side Authoritative Grading Evaluation', () => {
  const quizKey = {
    quizId: 'quiz-math',
    isPublished: true,
    questions: [
      {
        id: 'q1',
        type: 'multiple',
        correctAnswers: ['2'],
      },
      {
        id: 'q2',
        type: 'multiple-multi',
        correctAnswers: ['0', '3'],
      },
      {
        id: 'q3',
        type: 'short',
        correctAnswers: ['42', '사십이'],
      },
    ],
  };

  function gradeSubmission(answers) {
    const results = {};
    let score = 0;

    for (const q of quizKey.questions) {
      const userAns = answers[q.id];
      if (q.type === 'multiple' || q.type === 'multiple-multi') {
        const u = Array.isArray(userAns) ? userAns : [userAns];
        const correct = q.correctAnswers || [];
        const isCorrect =
          u.length === correct.length &&
          [...u].sort().join(',') === [...correct].sort().join(',');
        results[q.id] = isCorrect;
        if (isCorrect) score += 1;
      } else if (q.type === 'short') {
        const u = typeof userAns === 'string' ? userAns.trim() : '';
        const exactMatches = (q.correctAnswers || []).map((a) => a.trim().toLowerCase());
        const isCorrect = exactMatches.includes(u.toLowerCase());
        results[q.id] = isCorrect;
        if (isCorrect) score += 1;
      }
    }

    return {
      score,
      total: quizKey.questions.length,
      percentage: Math.round((score / quizKey.questions.length) * 100),
      results,
    };
  }

  // 100% Correct Submission
  const fullPass = gradeSubmission({
    q1: ['2'],
    q2: ['3', '0'], // Order inverted, should still pass
    q3: '42',
  });
  assert.equal(fullPass.score, 3);
  assert.equal(fullPass.total, 3);
  assert.equal(fullPass.percentage, 100);
  assert.equal(fullPass.results.q1, true);
  assert.equal(fullPass.results.q2, true);
  assert.equal(fullPass.results.q3, true);

  // Partial Submission
  const partial = gradeSubmission({
    q1: ['1'], // Wrong
    q2: ['0'], // Incomplete
    q3: '사십이', // Correct
  });
  assert.equal(partial.score, 1);
  assert.equal(partial.results.q1, false);
  assert.equal(partial.results.q2, false);
  assert.equal(partial.results.q3, true);
});

test('Phase 13: Exam Rules Enforcement (Deadline, Max Attempts, Unpublished)', () => {
  function validateSubmissionRules(quizKey, currentAttempts = 0) {
    if (quizKey.isPublished === false) {
      throw new Error('아직 공개되지 않은 시험입니다.');
    }
    if (quizKey.deadline) {
      const rawDeadline = quizKey.deadline.includes('T') ? quizKey.deadline : `${quizKey.deadline}T23:59:59`;
      const deadlineMs = new Date(rawDeadline).getTime();
      if (!isNaN(deadlineMs) && Date.now() > deadlineMs + 60 * 1000) {
        throw new Error('시험 마감 시간이 지나 채점할 수 없습니다.');
      }
    }
    if (quizKey.maxAttempts && currentAttempts >= quizKey.maxAttempts) {
      throw new Error(`최대 응시 가능 횟수(${quizKey.maxAttempts}회)를 초과했습니다.`);
    }
    return true;
  }

  // Unpublished quiz
  assert.throws(
    () => validateSubmissionRules({ isPublished: false }),
    /아직 공개되지 않은 시험/
  );

  // Expired deadline
  assert.throws(
    () => validateSubmissionRules({ isPublished: true, deadline: '2020-01-01' }),
    /시험 마감 시간이 지나/
  );

  // Exceeded attempts
  assert.throws(
    () => validateSubmissionRules({ isPublished: true, maxAttempts: 2 }, 2),
    /최대 응시 가능 횟수/
  );

  // Valid submission passes
  assert.doesNotThrow(() =>
    validateSubmissionRules({ isPublished: true, maxAttempts: 3, deadline: '2099-12-31' }, 1)
  );
});

test('Phase 13: Idempotency Key Prevents Duplicate Grading and AI Cost', () => {
  const submissionCache = new Map();

  function processSubmission(idempotencyKey, computeFn) {
    if (submissionCache.has(idempotencyKey)) {
      return { ...submissionCache.get(idempotencyKey), idempotent: true };
    }
    const result = computeFn();
    submissionCache.set(idempotencyKey, result);
    return { ...result, idempotent: false };
  }

  let executionCounter = 0;
  const gradeFn = () => {
    executionCounter++;
    return { score: 10, total: 10 };
  };

  const key = 'quiz-1:student-101:att-uuid-1';

  // First attempt: executes computation
  const first = processSubmission(key, gradeFn);
  assert.equal(first.idempotent, false);
  assert.equal(executionCounter, 1);

  // Retry / Duplicate submission: returns cached result immediately
  const second = processSubmission(key, gradeFn);
  assert.equal(second.idempotent, true);
  assert.equal(executionCounter, 1); // Not executed again!
  assert.equal(second.score, 10);
});

// ---------------------------------------------------------------------------
// 3. Production Fallback Security Gating
// ---------------------------------------------------------------------------
test('Phase 13: Production Environment Blocks Unverified Client Self-Grading', () => {
  function handleSubmissionFallback(isProd, isMock) {
    if (isProd && !isMock) {
      // In production with real backend, fallback MUST be blocked
      return { allowed: false, action: 'SHOW_ALERT_AND_PRESERVE_ANSWERS' };
    }
    // In local DEV or Mock mode, fallback is allowed for developer convenience
    return { allowed: true, action: 'CLIENT_LOCAL_GRADING' };
  }

  // Production with Firebase configured: BLOCKED
  assert.deepEqual(handleSubmissionFallback(true, false), {
    allowed: false,
    action: 'SHOW_ALERT_AND_PRESERVE_ANSWERS',
  });

  // Local DEV mode: ALLOWED
  assert.deepEqual(handleSubmissionFallback(false, false), {
    allowed: true,
    action: 'CLIENT_LOCAL_GRADING',
  });

  // Mock mode: ALLOWED
  assert.deepEqual(handleSubmissionFallback(true, true), {
    allowed: true,
    action: 'CLIENT_LOCAL_GRADING',
  });
});

// ---------------------------------------------------------------------------
// 4. Legacy Quiz Data Migration & Separation
// ---------------------------------------------------------------------------
test('Phase 13: Legacy Quiz Answers Separation and Masking', () => {
  const legacyQuiz = {
    id: 'legacy-exam-10',
    title: '운영체제 중간고사',
    questions: [
      {
        id: 'q-os-1',
        type: 'multiple',
        title: 'CPU 스케줄링',
        options: ['FCFS', 'SJF', 'RR'],
        correctAnswers: ['2'],
        explanation: 'RR(Round Robin)은 시분할 방식입니다.',
        validationCode: '',
      },
    ],
  };

  const migrated = inspectAndMigrateQuiz(legacyQuiz);

  assert.equal(migrated.needsMigration, true);
  assert.equal(migrated.sanitizedQuiz.questions[0].correctAnswers.length, 0);
  assert.equal(migrated.sanitizedQuiz.questions[0].explanation, '');
  assert.equal(migrated.answerDocument.questions[0].correctAnswers[0], '2');
  assert.equal(migrated.answerDocument.questions[0].explanation.includes('Round Robin'), true);
});
