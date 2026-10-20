import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Test workspace directories
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-tx-test-'));
const testDataDir = path.join(tempDir, 'data');
const testVideoDir = path.join(tempDir, 'videos');
fs.mkdirSync(testDataDir, { recursive: true });
fs.mkdirSync(testVideoDir, { recursive: true });

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = testDataDir;
process.env.VIDEO_DIR = testVideoDir;
process.env.PORT = '0';
process.env.ADMIN_API_KEY = 'tx-test-admin-secret-key';
process.env.UPLOAD_TOKEN = 'tx-test-upload-token';
process.env.FIREBASE_PROJECT_ID = 'demo-aim-lms-tx';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  test('FIRESTORE TRANSACTION: skipped when FIRESTORE_EMULATOR_HOST is not set (run via npm run test:emulator)', (t) => {
    t.skip('Emulator host not configured. Use npm run test:emulator');
  });
} else {

// Load server module
const {
  app,
  saveQuizKeys,
  loadSubmissions,
  saveSubmissionRecord,
  loadSubmissionRecord,
  fetchFirestoreAttempt,
  saveFirestoreAttempt,
  saveFirestoreProgress,
  SERVER_SIGNING_SECRET,
} = require(path.join(PROJECT_ROOT, 'video-server', 'server.js'));

let server1;
let server2;
let baseUrl1;
let baseUrl2;

function base64Url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function createStudentJwt(studentId, uid) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { uid: uid || `uid_${studentId}`, studentId, role: 'student' };
  const h = base64Url(header);
  const p = base64Url(payload);
  const sig = crypto.createHmac('sha256', SERVER_SIGNING_SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

test.before((_, done) => {
  // Pre-seed quiz keys in memory/file
  const sampleKeys = {
    'quiz-tx-101': {
      quizId: 'quiz-tx-101',
      title: '트랜잭션 무결성 평가',
      maxAttempts: 2,
      isPublished: true,
      questions: [
        {
          id: 'q1',
          type: 'multiple',
          title: 'ACID의 I는?',
          options: ['Isolation', 'Index', 'Input'],
          correctAnswers: ['0'],
        },
        {
          id: 'q2',
          type: 'short',
          title: '원자적 연산이란?',
          correctAnswers: ['atomic', '원자적'],
        },
      ],
    },
  };
  saveQuizKeys(sampleKeys);

  // Start Server 1
  server1 = http.createServer(app);
  server1.listen(0, '127.0.0.1', () => {
    baseUrl1 = `http://127.0.0.1:${server1.address().port}`;

    // Start Server 2 (Simulating multi-process clustering on same database)
    server2 = http.createServer(app);
    server2.listen(0, '127.0.0.1', () => {
      baseUrl2 = `http://127.0.0.1:${server2.address().port}`;
      done();
    });
  });
});

test.after((_, done) => {
  if (server1) server1.close();
  if (server2) server2.close();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
  done();
});

// Helper to query Firestore directly
async function getFirestoreDoc(collectionName, docId) {
  const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088';
  const url = `http://${host}/v1/projects/demo-aim-lms-tx/databases/(default)/documents/${collectionName}/${docId}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) return null;
  return await res.json();
}

// ---------------------------------------------------------------------------
// TEST A: 동일 Attempt ID 동시 제출 20회 (원자적 단일 채점 및 멱등성 보장)
// ---------------------------------------------------------------------------
test('TEST A: 동일 Attempt ID 동시 제출 20회', async () => {
  const studentId = 'student_tx_A';
  const token = createStudentJwt(studentId);
  const attemptId = `att-tx-A-${Date.now()}`;
  const quizId = 'quiz-tx-101';

  const payload = {
    quizId,
    studentId,
    attemptId,
    answers: { q1: ['0'], q2: 'atomic' }, // 2/2 full marks
  };

  // Launch 20 concurrent requests with the identical Attempt ID
  const requests = Array.from({ length: 20 }, () =>
    fetch(`${baseUrl1}/api/grade-submission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
  );

  const responses = await Promise.all(requests);
  const dataList = await Promise.all(responses.map((r) => r.json()));

  // All 20 requests must succeed with HTTP 200
  for (const res of responses) {
    assert.equal(res.status, 200);
  }

  // All 20 must return the identical authoritative score
  for (const d of dataList) {
    assert.equal(d.score, 2);
    assert.equal(d.total, 2);
    assert.equal(d.attemptId, attemptId);
  }

  // Verify in Firestore database that exactly 1 attempt was registered
  const attemptDoc = await getFirestoreDoc('quizAttempts', attemptId);
  assert.ok(attemptDoc);
  assert.equal(attemptDoc.fields?.attemptId?.stringValue, attemptId);

  // Verify in Firestore progress that attempts count is exactly 1 (NOT 20!)
  const progressDoc = await getFirestoreDoc('progress', `${studentId}_${quizId}`);
  assert.ok(progressDoc);
  assert.equal(parseInt(progressDoc.fields?.attempts?.integerValue, 10), 1);
  assert.equal(parseInt(progressDoc.fields?.bestScore?.integerValue, 10), 2);
});

// ---------------------------------------------------------------------------
// TEST B: 서로 다른 Attempt ID 동시 제출 (모든 정상 응시 유실 없이 반영)
// ---------------------------------------------------------------------------
test('TEST B: 서로 다른 Attempt ID 동시 제출', async () => {
  const studentId = 'student_tx_B';
  const token = createStudentJwt(studentId);
  const quizId = 'quiz-tx-101';

  const attemptId1 = `att-tx-B1-${Date.now()}`;
  const attemptId2 = `att-tx-B2-${Date.now()}`;

  // Two different valid attempts submitted concurrently
  const [res1, res2] = await Promise.all([
    fetch(`${baseUrl1}/api/grade-submission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        quizId,
        studentId,
        attemptId: attemptId1,
        answers: { q1: ['0'] }, // 1/2
      }),
    }),
    fetch(`${baseUrl1}/api/grade-submission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        quizId,
        studentId,
        attemptId: attemptId2,
        answers: { q1: ['0'], q2: 'atomic' }, // 2/2
      }),
    }),
  ]);

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);

  // Both attempts must exist in Firestore
  const att1Doc = await getFirestoreDoc('quizAttempts', attemptId1);
  const att2Doc = await getFirestoreDoc('quizAttempts', attemptId2);
  assert.ok(att1Doc);
  assert.ok(att2Doc);

  // Progress attempts count must be exactly 2, and bestScore must be 2
  const progressDoc = await getFirestoreDoc('progress', `${studentId}_${quizId}`);
  assert.ok(progressDoc);
  assert.equal(parseInt(progressDoc.fields?.attempts?.integerValue, 10), 2);
  assert.equal(parseInt(progressDoc.fields?.bestScore?.integerValue, 10), 2);
});

// ---------------------------------------------------------------------------
// TEST C: 서버 프로세스 2개에서 동시 제출 (다중 프로세스 동시성 및 일관성)
// ---------------------------------------------------------------------------
test('TEST C: 서버 프로세스 2개에서 동시 제출', async () => {
  const studentId = 'student_tx_C';
  const token = createStudentJwt(studentId);
  const quizId = 'quiz-tx-101';
  const attemptId = `att-tx-C-${Date.now()}`;

  const payload = {
    quizId,
    studentId,
    attemptId,
    answers: { q1: ['0'], q2: 'atomic' },
  };

  // Submit simultaneously across Server 1 and Server 2
  const [resServer1, resServer2] = await Promise.all([
    fetch(`${baseUrl1}/api/grade-submission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }),
    fetch(`${baseUrl2}/api/grade-submission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }),
  ]);

  assert.equal(resServer1.status, 200);
  assert.equal(resServer2.status, 200);

  const [d1, d2] = await Promise.all([resServer1.json(), resServer2.json()]);
  assert.equal(d1.score, 2);
  assert.equal(d2.score, 2);
  assert.equal(d1.attemptId, attemptId);
  assert.equal(d2.attemptId, attemptId);

  // Firestore must contain exactly 1 attempt document
  const attemptDoc = await getFirestoreDoc('quizAttempts', attemptId);
  assert.ok(attemptDoc);

  // Progress attempts count must be exactly 1
  const progressDoc = await getFirestoreDoc('progress', `${studentId}_${quizId}`);
  assert.ok(progressDoc);
  assert.equal(parseInt(progressDoc.fields?.attempts?.integerValue, 10), 1);
});

// ---------------------------------------------------------------------------
// TEST D: Firestore 저장 중 네트워크 장애 시 성공 응답 금지 (500 에러 반환)
// ---------------------------------------------------------------------------
test('TEST D: Firestore 저장 중 네트워크 장애 시 500 차단 및 성공 응답 금지', async () => {
  const studentId = 'student_tx_D';
  const token = createStudentJwt(studentId);
  const quizId = 'quiz-tx-101';
  const attemptId = `att-tx-D-${Date.now()}`;

  // Temporarily point Firestore emulator to an unreachable port to simulate network outage
  const originalHost = process.env.FIRESTORE_EMULATOR_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9999';

  try {
    const res = await fetch(`${baseUrl1}/api/grade-submission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        quizId,
        studentId,
        attemptId,
        answers: { q1: ['0'] },
      }),
    });

    // Invariant 8: Firestore failure must NEVER return 200 success!
    assert.notEqual(res.status, 200);
    assert.equal(res.status, 500);
    const errData = await res.json();
    assert.match(errData.error, /서버 오류|fetch/);
  } finally {
    process.env.FIRESTORE_EMULATOR_HOST = originalHost;
  }
});

// ---------------------------------------------------------------------------
// TEST E: 영구 저장 완료 후 API 응답 유실 시 재시도 (멱등성 복구)
// ---------------------------------------------------------------------------
test('TEST E: 영구 저장 완료 후 API 응답 유실 시 재전송 멱등 복구', async () => {
  const studentId = 'student_tx_E';
  const token = createStudentJwt(studentId);
  const quizId = 'quiz-tx-101';
  const attemptId = `att-tx-E-${Date.now()}`;

  // 1. Initial submission successfully stored
  const res1 = await fetch(`${baseUrl1}/api/grade-submission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quizId,
      studentId,
      attemptId,
      answers: { q1: ['0'], q2: 'atomic' },
    }),
  });
  assert.equal(res1.status, 200);

  // 2. Client lost connection / response and resends the exact same attempt
  const resRetry = await fetch(`${baseUrl1}/api/grade-submission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quizId,
      studentId,
      attemptId,
      answers: { q1: ['0'], q2: 'atomic' },
    }),
  });

  assert.equal(resRetry.status, 200);
  const retryData = await resRetry.json();
  assert.equal(retryData.idempotent, true);
  assert.equal(retryData.score, 2);

  // Invariant 2: Attempts count in progress must remain 1
  const progressDoc = await getFirestoreDoc('progress', `${studentId}_${quizId}`);
  assert.ok(progressDoc);
  assert.equal(parseInt(progressDoc.fields?.attempts?.integerValue, 10), 1);
});

// ---------------------------------------------------------------------------
// TEST F: 서버 재시작 후 동일 제출 시 중복 채점 없이 멱등성 유지
// ---------------------------------------------------------------------------
test('TEST F: 서버 재시작 후 동일 제출 시 Firestore 자동 복구 및 중복 채점 방지', async () => {
  const studentId = 'student_tx_F';
  const token = createStudentJwt(studentId);
  const quizId = 'quiz-tx-101';
  const attemptId = `att-tx-F-${Date.now()}`;

  // Initial submission
  const res1 = await fetch(`${baseUrl1}/api/grade-submission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quizId,
      studentId,
      attemptId,
      answers: { q1: ['0'], q2: 'atomic' },
    }),
  });
  assert.equal(res1.status, 200);

  // Simulate server restart: delete local submissions.json and clear memory
  const subFile = path.join(testDataDir, 'submissions.json');
  if (fs.existsSync(subFile)) fs.unlinkSync(subFile);
  const all = loadSubmissions();
  delete all[`${quizId}:${studentId}:${attemptId}`];

  // Resubmit to Server 2 (or fresh server)
  const resAfterRestart = await fetch(`${baseUrl2}/api/grade-submission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quizId,
      studentId,
      attemptId,
      answers: { q1: ['0'], q2: 'atomic' },
    }),
  });

  assert.equal(resAfterRestart.status, 200);
  const restartData = await resAfterRestart.json();
  assert.equal(restartData.idempotent, true);
  assert.equal(restartData.score, 2);

  // Verify attempts count did NOT increase
  const progressDoc = await getFirestoreDoc('progress', `${studentId}_${quizId}`);
  assert.ok(progressDoc);
  assert.equal(parseInt(progressDoc.fields?.attempts?.integerValue, 10), 1);
});

// ---------------------------------------------------------------------------
// TEST G: 최고 점수보다 낮은 점수 제출 시 기존 최고 점수 역전 금지
// ---------------------------------------------------------------------------
test('TEST G: 최고 점수보다 낮은 점수 제출 시 최고 점수 역전 금지 (Monotonic Best Score)', async () => {
  const studentId = 'student_tx_G';
  const token = createStudentJwt(studentId);
  const quizId = 'quiz-tx-101';

  // Attempt 1: score 2/2
  const att1 = `att-tx-G1-${Date.now()}`;
  const res1 = await fetch(`${baseUrl1}/api/grade-submission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quizId,
      studentId,
      attemptId: att1,
      answers: { q1: ['0'], q2: 'atomic' },
    }),
  });
  assert.equal(res1.status, 200);

  // Attempt 2: score 1/2 (lower than Attempt 1)
  const att2 = `att-tx-G2-${Date.now()}`;
  const res2 = await fetch(`${baseUrl1}/api/grade-submission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quizId,
      studentId,
      attemptId: att2,
      answers: { q1: ['0'], q2: 'wrong_answer' },
    }),
  });
  assert.equal(res2.status, 200);

  // Invariant 4: progress.bestScore must remain 2, even though Attempt 2 was 1
  const progressDoc = await getFirestoreDoc('progress', `${studentId}_${quizId}`);
  assert.ok(progressDoc);
  assert.equal(parseInt(progressDoc.fields?.bestScore?.integerValue, 10), 2);
  assert.equal(parseInt(progressDoc.fields?.attempts?.integerValue, 10), 2);
});

// ---------------------------------------------------------------------------
// TEST H: 최대 응시 횟수 도달 상태에서 추가 제출 시도 차단
// ---------------------------------------------------------------------------
test('TEST H: 최대 응시 횟수 도달 상태에서 추가 제출 시도 403 차단', async () => {
  const studentId = 'student_tx_H';
  const token = createStudentJwt(studentId);
  const quizId = 'quiz-tx-101'; // maxAttempts: 2

  // Attempt 1
  const res1 = await fetch(`${baseUrl1}/api/grade-submission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quizId,
      studentId,
      attemptId: `att-tx-H1-${Date.now()}`,
      answers: { q1: ['0'] },
    }),
  });
  assert.equal(res1.status, 200);

  // Attempt 2 (Reaching maxAttempts = 2)
  const res2 = await fetch(`${baseUrl1}/api/grade-submission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quizId,
      studentId,
      attemptId: `att-tx-H2-${Date.now()}`,
      answers: { q1: ['0'] },
    }),
  });
  assert.equal(res2.status, 200);

  // Attempt 3: Exceeding maxAttempts -> Must return 403 Forbidden!
  const res3 = await fetch(`${baseUrl1}/api/grade-submission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      quizId,
      studentId,
      attemptId: `att-tx-H3-${Date.now()}`,
      answers: { q1: ['0'] },
    }),
  });

  assert.equal(res3.status, 403);
  const errData = await res3.json();
  assert.match(errData.error, /최대 응시 가능 횟수/);
});
}
