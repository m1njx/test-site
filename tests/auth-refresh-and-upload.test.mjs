import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = import.meta.dirname || path.dirname(new URL(import.meta.url).pathname);

// Test environment setup
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-auth-refresh-test-'));
const testDataDir = path.join(tempDir, 'data');
const testVideoDir = path.join(tempDir, 'videos');
fs.mkdirSync(testDataDir, { recursive: true });
fs.mkdirSync(testVideoDir, { recursive: true });

process.env.DATA_DIR = testDataDir;
process.env.VIDEO_DIR = testVideoDir;
process.env.ADMIN_API_KEY = 'test-admin-secret-key-2026';
process.env.UPLOAD_TOKEN = 'test-video-upload-token-2026';
process.env.PORT = '0';

const {
  app,
  saveQuizKeys,
  ServerCredentialProvider,
  serverCredentialProvider,
  getFirestoreHeaders,
  isFirestoreConfigured,
  requireUploadAuth,
  SERVER_SIGNING_SECRET,
} = require('../video-server/server.js');

let server;
let baseUrl;

function base64Url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function createSignedJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = base64Url(header);
  const p = base64Url(payload);
  const sig = crypto.createHmac('sha256', SERVER_SIGNING_SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

function createMultipartPayload(fieldName, fileName, mimeType, fileBuffer) {
  const boundary = '----WebKitFormBoundary' + crypto.randomBytes(8).toString('hex');
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, fileBuffer, footer]);
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body,
  };
}

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  if (server) server.close();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

// ---------------------------------------------------------------------------
// TEST A: 서버 자격증명 로딩 성공
// ---------------------------------------------------------------------------
test('TEST A: 서버 자격증명 로딩 성공 (Service Account JSON 및 Base64 파싱)', () => {
  const provider = new ServerCredentialProvider();

  const mockSa = {
    type: 'service_account',
    project_id: 'aim-team-lms-test',
    private_key_id: 'key_123',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD...\n-----END PRIVATE KEY-----\n',
    client_email: 'test-admin@aim-team-lms-test.iam.gserviceaccount.com',
  };

  // 1. Raw JSON string
  const parsedDirect = provider._parseServiceAccountJson(JSON.stringify(mockSa));
  assert.equal(parsedDirect?.project_id, 'aim-team-lms-test');
  assert.equal(parsedDirect?.client_email, mockSa.client_email);

  // 2. Base64 encoded JSON string
  const base64Sa = Buffer.from(JSON.stringify(mockSa)).toString('base64');
  const parsedBase64 = provider._parseServiceAccountJson(base64Sa);
  assert.equal(parsedBase64?.project_id, 'aim-team-lms-test');
  assert.equal(parsedBase64?.client_email, mockSa.client_email);

  // 3. File path
  const saFilePath = path.join(tempDir, 'sa.json');
  fs.writeFileSync(saFilePath, JSON.stringify(mockSa));
  const parsedFile = provider._parseServiceAccountJson(saFilePath);
  assert.equal(parsedFile?.project_id, 'aim-team-lms-test');
});

// ---------------------------------------------------------------------------
// TEST B: 정적 OAuth 토큰 없이 Firestore 조회 가능
// ---------------------------------------------------------------------------
test('TEST B: 정적 OAuth 토큰 없이 Firestore 조회 가능 (Dynamic Credential Provider)', async () => {
  // 정적 환경변수 비활성화
  const originalToken = process.env.FIREBASE_SERVER_TOKEN;
  delete process.env.FIREBASE_SERVER_TOKEN;

  try {
    serverCredentialProvider.setMockTokenProvider(async () => {
      return {
        token: 'dynamic-sa-bearer-token-xyz',
        source: 'google-auth',
        expiresAt: Date.now() + 3600000,
      };
    });

    assert.equal(isFirestoreConfigured(), true);

    const headers = await getFirestoreHeaders();
    assert.equal(headers['Authorization'], 'Bearer dynamic-sa-bearer-token-xyz');
    assert.equal(headers['Content-Type'], 'application/json');
    assert.equal(headers['Accept'], 'application/json');
  } finally {
    if (originalToken) process.env.FIREBASE_SERVER_TOKEN = originalToken;
    serverCredentialProvider.clearCache();
  }
});

// ---------------------------------------------------------------------------
// TEST C: 액세스 토큰 만료 시 자동 갱신
// ---------------------------------------------------------------------------
test('TEST C: 액세스 토큰 만료 시 자동 갱신 (In-Memory Expiry & Refresh)', async () => {
  let issueCount = 0;
  serverCredentialProvider.setMockTokenProvider(async () => {
    issueCount++;
    return {
      token: `refreshed-token-v${issueCount}`,
      source: 'auto-refresh',
      expiresAt: Date.now() + 600000, // 10분 유효
    };
  });

  // 1. 첫 번째 토큰 발급
  const firstRes = await serverCredentialProvider.getAccessToken();
  assert.equal(firstRes.token, 'refreshed-token-v1');
  assert.equal(issueCount, 1);

  // 2. 만료 전 재호출 시 캐시된 동일 토큰 반환
  const cachedRes = await serverCredentialProvider.getAccessToken();
  assert.equal(cachedRes.token, 'refreshed-token-v1');
  assert.equal(issueCount, 1);

  // 3. 토큰 만료 강제 시뮬레이션 (과거 시점으로 조작)
  serverCredentialProvider.tokenExpiresAt = Date.now() - 1000;

  // 4. 만료 후 재호출 시 자동 갱신 수행
  const refreshedRes = await serverCredentialProvider.getAccessToken();
  assert.equal(refreshedRes.token, 'refreshed-token-v2');
  assert.equal(issueCount, 2);

  serverCredentialProvider.clearCache();
});

// ---------------------------------------------------------------------------
// TEST D: 인증 갱신 실패 시 안전한 오류 처리
// ---------------------------------------------------------------------------
test('TEST D: 인증 갱신 실패 시 안전한 오류 처리 (No Process Crash & No Leaks)', async () => {
  serverCredentialProvider.setMockTokenProvider(async () => {
    throw new Error('Google OAuth 2.0 token endpoint 503 Unavailable');
  });

  const res = await serverCredentialProvider.getAccessToken();
  assert.equal(res.token, null);
  assert.match(res.error, /503 Unavailable/);

  // Firestore 헤더 조회 시도 시 예외 없이 안전한 기본 헤더 반환
  const headers = await getFirestoreHeaders();
  assert.equal(headers['Authorization'], undefined);
  assert.equal(headers['Content-Type'], 'application/json');

  serverCredentialProvider.clearCache();
});

// ---------------------------------------------------------------------------
// TEST E: 서버 재시작 후 정상 인증
// ---------------------------------------------------------------------------
test('TEST E: 서버 재시작 후 정상 인증 (Cold Start Provider Initialization)', async () => {
  // 새로운 인스턴스로 콜드 스타트 시뮬레이션
  const freshProvider = new ServerCredentialProvider();
  freshProvider.setMockTokenProvider(async () => 'cold-start-token-999');

  const authRes = await freshProvider.getAccessToken();
  assert.equal(authRes.token, 'cold-start-token-999');
  assert.equal(authRes.source, 'mock');
});

// ---------------------------------------------------------------------------
// TEST F: 학생의 정답 조회 및 수정 차단
// ---------------------------------------------------------------------------
test('TEST F: 학생의 정답 조회 및 수정 차단 (403 Forbidden)', async () => {
  const studentJwt = createSignedJwt({
    uid: 'student_tester',
    studentId: '2026001',
    role: 'student',
  });

  // 1. 학생 계정으로 정답 키 등록/수정 시도 차단
  const resModify = await fetch(`${baseUrl}/api/quiz-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentJwt}`,
    },
    body: JSON.stringify({ quizId: 'q-forbidden', questions: [] }),
  });
  assert.equal(resModify.status, 403);
  const dataModify = await resModify.json();
  assert.match(dataModify.error, /관리자 권한/);

  // 2. 학생 계정으로 정답 키 상태 조회 시도 차단
  const resStatus = await fetch(`${baseUrl}/api/quiz-keys/status`, {
    headers: {
      'Authorization': `Bearer ${studentJwt}`,
    },
  });
  assert.equal(resStatus.status, 403);
});

// ---------------------------------------------------------------------------
// TEST G: 학생의 공식 점수 직접 수정 차단
// ---------------------------------------------------------------------------
test('TEST G: 학생의 공식 점수 직접 수정 차단 (서버 권위 점수 산출 및 조작 점수 무효화)', async () => {
  // 관리자 정답 키 등록
  const quizId = 'q-score-tamper-audit';
  saveQuizKeys({
    [quizId]: {
      quizId,
      questions: [
        { id: 'q1', type: 'multiple', options: ['A', 'B'], correctAnswers: ['0'] },
        { id: 'q2', type: 'multiple', options: ['A', 'B'], correctAnswers: ['1'] },
      ],
    },
  });

  const studentJwt = createSignedJwt({
    uid: 'student_tester',
    studentId: '2026001',
    role: 'student',
  });

  // 학생이 조작된 score=999 를 바디에 포함시켜 제출 시도
  const res = await fetch(`${baseUrl}/api/grade-submission`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentJwt}`,
    },
    body: JSON.stringify({
      quizId,
      studentId: '2026001',
      answers: { q1: ['0'], q2: ['0'] },
      score: 999, // 조작된 점수
      total: 2,
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  // 서버가 계산한 권위 점수(1점)만 인정되고 학생 조작(999점)은 무시됨
  assert.equal(data.score, 1);
  assert.equal(data.total, 2);
  assert.equal(Boolean(data.submissionToken), true);
});

// ---------------------------------------------------------------------------
// TEST H: 미인증 영상 업로드 차단
// ---------------------------------------------------------------------------
test('TEST H: 미인증 영상 업로드 차단 (인증 헤더 부재 401 및 x-upload-token 단독 거부 403)', async () => {
  const dummyVideo = Buffer.from('fake-mp4-data-000');
  const multipart = createMultipartPayload('file', 'test.mp4', 'video/mp4', dummyVideo);

  // 1. 인증 헤더 없이 업로드 시도 -> 401 Unauthorized
  const resNoAuth = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': multipart.contentType,
    },
    body: multipart.body,
  });
  assert.equal(resNoAuth.status, 401);

  // 2. 프론트엔드 번들에 노출된 x-upload-token 만 단독 전송 -> 403 Forbidden
  const resUploadTokenOnly = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': multipart.contentType,
      'x-upload-token': process.env.UPLOAD_TOKEN,
    },
    body: multipart.body,
  });
  assert.equal(resUploadTokenOnly.status, 403);
  const dataUploadOnly = await resUploadTokenOnly.json();
  assert.match(dataUploadOnly.error, /관리자 전용 인증이 필요합니다/);
});

// ---------------------------------------------------------------------------
// TEST I: 일반 학생의 영상 업로드 차단
// ---------------------------------------------------------------------------
test('TEST I: 일반 학생의 영상 업로드 차단 (403 Forbidden)', async () => {
  const studentJwt = createSignedJwt({
    uid: 'student_tester',
    studentId: '2026001',
    role: 'student',
  });

  const dummyVideo = Buffer.from('fake-student-video-payload');
  const multipart = createMultipartPayload('file', 'student-lecture.mp4', 'video/mp4', dummyVideo);

  const res = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': multipart.contentType,
      'Authorization': `Bearer ${studentJwt}`,
      'x-upload-token': process.env.UPLOAD_TOKEN,
    },
    body: multipart.body,
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.match(data.error, /관리자 권한이 없습니다/);
});

// ---------------------------------------------------------------------------
// TEST J: 관리자의 영상 업로드 정상 처리
// ---------------------------------------------------------------------------
test('TEST J: 관리자의 영상 업로드 정상 처리 (200 OK & Range 스트리밍 검증)', async () => {
  const adminJwt = createSignedJwt({
    uid: 'admin_master',
    role: 'admin',
    isAdmin: true,
  });

  const dummyVideo = Buffer.from('test-mp4-streamable-content-bytes');
  const multipart = createMultipartPayload('file', 'lesson-math.mp4', 'video/mp4', dummyVideo);

  // 1. 관리자 권한으로 업로드 수행
  const res = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': multipart.contentType,
      'Authorization': `Bearer ${adminJwt}`,
    },
    body: multipart.body,
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(Boolean(data.file), true);
  assert.match(data.file, /lesson-math\.mp4$/);
  assert.equal(data.size, dummyVideo.length);

  // 2. 업로드된 영상 스트리밍 확인 (Range 헤더 지원)
  const videoUrl = `${baseUrl}${data.url}`;
  const streamRes = await fetch(videoUrl, {
    headers: { Range: 'bytes=0-10' },
  });
  assert.equal(streamRes.status, 206); // Partial Content
  assert.equal(streamRes.headers.get('accept-ranges'), 'bytes');
  const streamBytes = await streamRes.arrayBuffer();
  assert.equal(streamBytes.byteLength, 11);
});

// ---------------------------------------------------------------------------
// TEST K: 서버 채점 및 성적 저장 정상
// ---------------------------------------------------------------------------
test('TEST K: 서버 채점 및 성적 저장 정상 (권위 채점 및 서명 발급)', async () => {
  const quizId = 'q-authoritative-grading';
  saveQuizKeys({
    [quizId]: {
      quizId,
      questions: [
        { id: 'q1', type: 'multiple', options: ['A', 'B'], correctAnswers: ['0'] },
        { id: 'q2', type: 'multiple', options: ['A', 'B'], correctAnswers: ['1'] },
      ],
    },
  });

  const studentJwt = createSignedJwt({
    uid: 'student_tester',
    studentId: '2026001',
    role: 'student',
  });

  const res = await fetch(`${baseUrl}/api/grade-submission`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentJwt}`,
    },
    body: JSON.stringify({
      quizId,
      studentId: '2026001',
      answers: { q1: ['0'], q2: ['1'] },
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.score, 2);
  assert.equal(data.total, 2);
  assert.equal(data.results.q1, true);
  assert.equal(data.results.q2, true);
  assert.equal(Boolean(data.submissionToken), true);
});

// ---------------------------------------------------------------------------
// TEST L: Firestore Emulator 기존 규칙 테스트 유지
// ---------------------------------------------------------------------------
test('TEST L: Firestore Emulator 기존 규칙 테스트 파일 및 스크립트 온전성 검증', () => {
  const rulesTestPath = path.join(__dirname, 'emulator', 'firestore-rules-emulator.test.mjs');
  const txTestPath = path.join(__dirname, 'emulator', 'firestore-transaction.test.mjs');

  assert.equal(fs.existsSync(rulesTestPath), true);
  assert.equal(fs.existsSync(txTestPath), true);

  const rulesContent = fs.readFileSync(rulesTestPath, 'utf8');
  assert.match(rulesContent, /RULE TEST 1: 학생의 quizAnswers 읽기 거부/);
  assert.match(rulesContent, /RULE TEST 14: 기존 tickets 등 다른 앱의 규칙 보존/);

  const txContent = fs.readFileSync(txTestPath, 'utf8');
  assert.match(txContent, /TEST A: 동일 Attempt ID 동시 제출 20회/);
  assert.match(txContent, /TEST H: 최대 응시 횟수 도달 상태에서 추가 제출 시도/);
});
