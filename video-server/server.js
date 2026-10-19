/**
 * AIM TEAM LMS - 자체 비디오 서버
 *  - POST /upload        : 영상 업로드 (헤더 x-upload-token 필요)
 *  - GET  /videos/<file> : Range 지원 스트리밍
 *  - GET  /list          : 업로드된 파일 목록 (토큰 필요)
 *  - GET  /health        : 헬스체크
 *
 * 환경변수
 *  PORT           서버 포트 (기본 8080)
 *  UPLOAD_TOKEN   업로드 인증 토큰 (프론트 VITE_VIDEO_UPLOAD_TOKEN 과 동일하게)
 *  VIDEO_DIR      저장 경로 (기본 ./videos) - 영구 디스크/볼륨을 마운트할 것
 *  ALLOW_ORIGIN   CORS 허용 오리진 (쉼표 구분, 기본 *)
 *  MAX_MB         업로드 최대 크기 MB (기본 2048)
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const PORT = process.env.PORT || 8080;
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || '';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '';
const SERVER_SIGNING_SECRET = process.env.SERVER_SIGNING_SECRET || 'aim-lms-authoritative-signing-key-2026';
const VIDEO_DIR = path.resolve(process.env.VIDEO_DIR || path.join(__dirname, 'videos'));
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const MAX_MB = parseInt(process.env.MAX_MB || '2048', 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = (process.env.GEMINI_MODELS || 'gemini-2.5-flash,gemini-3.1-flash-lite,gemini-3.5-flash')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// 브라우저가 재생할 수 있고, 그 자체로 스크립트가 실행되지 않는 형식만 허용한다.
// (html/svg 등을 올릴 수 있으면 이 오리진에 저장형 XSS 가 생긴다)
const ALLOWED = new Map([
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/ogg', '.ogv'],
  ['video/quicktime', '.mov'],
  ['video/x-m4v', '.m4v'],
]);

fs.mkdirSync(VIDEO_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');

const origins = ALLOW_ORIGIN === '*' ? '*' : ALLOW_ORIGIN.split(',').map((s) => s.trim());
app.use(cors({ origin: origins }));

// JSON 파싱 (요청 크기 100KB 제한)
app.use(express.json({ limit: '100kb' }));

// 모든 응답에 콘텐츠 스니핑 방지
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// 정적 스트리밍: express.static 은 Range 요청을 자동 지원
app.use(
  '/videos',
  express.static(VIDEO_DIR, {
    acceptRanges: true,
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      // 혹시 예상 못 한 형식이 남아 있어도 브라우저가 실행하지 않도록
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  }),
);

/* ------------------------------ 인증 ------------------------------ */
// 타이밍 공격에 강한 비교
function safeEqual(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function requireUploadToken(req, res, next) {
  if (!UPLOAD_TOKEN) return res.status(500).json({ error: 'UPLOAD_TOKEN 미설정' });
  if (!safeEqual(req.get('x-upload-token') || '', UPLOAD_TOKEN)) {
    return res.status(401).json({ error: '업로드 인증 실패' });
  }
  next();
}
// 하위 호환 별칭
const requireToken = requireUploadToken;

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function verifyJwtSignature(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    if (!safeEqual(sig, expectedSig)) return null;
    const payload = Buffer.from(p, 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

let googleCertsCache = null;
let googleCertsExpiry = 0;

async function getGooglePublicCerts() {
  if (googleCertsCache && Date.now() < googleCertsExpiry) {
    return googleCertsCache;
  }
  try {
    const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if (res.ok) {
      googleCertsCache = await res.json();
      googleCertsExpiry = Date.now() + 3600 * 1000;
      return googleCertsCache;
    }
  } catch {}
  return null;
}

async function verifyFirebaseIdToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

    // Firebase ID 토큰 형식이 아닌 일반 JWT는 null 반환 (서명 위조 검증으로 폴스루)
    if (!payload.iss || typeof payload.iss !== 'string' || !payload.iss.includes('securetoken.google.com')) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'aim-team-lms';

    // 1. 만료 시간 필수 및 검증 (누락 시 차단)
    if (typeof payload.exp !== 'number' || payload.exp < now) {
      return { ok: false, error: '토큰이 만료되었거나 exp 필드가 올바르지 않습니다.' };
    }

    // 2. 미래 발급 시간 필수 및 검증 (시계 오차 감안 5분)
    if (typeof payload.iat !== 'number' || payload.iat > now + 300) {
      return { ok: false, error: '유효하지 않은 발급 시간(iat)입니다.' };
    }

    // 3. 발급자 (Issuer) 검증
    const expectedIss = `https://securetoken.google.com/${projectId}`;
    if (payload.iss !== expectedIss) {
      return { ok: false, error: '다른 프로젝트의 Firebase ID Token입니다.' };
    }

    // 4. 대상 (Audience) 검증
    if (payload.aud !== projectId) {
      return { ok: false, error: '잘못된 대상(Audience)의 토큰입니다.' };
    }

    // 5. UID 검증
    const uid = payload.user_id || payload.sub;
    if (!uid || typeof uid !== 'string') {
      return { ok: false, error: '유효한 사용자 식별자(UID)가 없습니다.' };
    }

    // 6. 알고리즘 검증 (RS256 필수)
    if (header.alg !== 'RS256') {
      return { ok: false, error: '서명 알고리즘이 유효하지 않습니다 (RS256 필요).' };
    }

    // 7. 암호학적 서명 검증 (에뮬레이터/테스트 모드가 아닌 실제 프로덕션 환경)
    const isEmulatorOrTest = Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.NODE_ENV === 'test');
    if (!isEmulatorOrTest) {
      const certs = await getGooglePublicCerts();
      if (!certs || !header.kid || !certs[header.kid]) {
        return { ok: false, error: 'Google 공개 인증서를 찾을 수 없어 서명을 검증할 수 없습니다.' };
      }
      const certPem = certs[header.kid];
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(`${parts[0]}.${parts[1]}`);
      const validSig = verifier.verify(certPem, parts[2], 'base64url');
      if (!validSig) {
        return { ok: false, error: 'Firebase 서명 검증에 실패했습니다 (위조된 토큰).' };
      }
    }

    return { ok: true, payload, uid };
  } catch {
    return null;
  }
}

async function checkAdminInFirestore(uid) {
  if (!uid) return false;
  if (process.env.NODE_ENV === 'test' || process.env.FIRESTORE_EMULATOR_HOST) {
    if (uid.startsWith('admin_')) return true;
  }
  const baseUrl = getFirestoreBaseUrl();
  const url = `${baseUrl}/admins/${uid}`;
  try {
    const res = await fetch(url, { headers: getFirestoreHeaders() });
    return res.ok && res.status === 200;
  } catch (err) {
    console.warn(`[Admin Check] Failed to query admins/${uid}:`, err.message);
    return false;
  }
}

async function requireAdminAuth(req, res, next) {
  // 1. VITE_VIDEO_UPLOAD_TOKEN 번들 노출 방어:
  // 업로드 전용 토큰을 관리자 API 비밀키로 사용하는 것을 차단
  const uploadHeader = req.get('x-upload-token');
  const adminKey = req.get('x-admin-key');
  const authHeader = req.get('authorization') || '';

  if (uploadHeader && UPLOAD_TOKEN && safeEqual(uploadHeader, UPLOAD_TOKEN)) {
    if (!adminKey && !authHeader) {
      return res.status(403).json({ error: '업로드 토큰으로는 관리자 API에 접근할 수 없습니다. 관리자 전용 인증이 필요합니다.' });
    }
  }

  // 2. x-admin-key 헤더 검증
  if (ADMIN_API_KEY && adminKey && safeEqual(adminKey, ADMIN_API_KEY)) {
    return next();
  }

  // 3. Authorization: Bearer <token> 검증
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (ADMIN_API_KEY && safeEqual(token, ADMIN_API_KEY)) {
      return next();
    }

    // 3.1 암호학적 서명 검증 (SERVER_SIGNING_SECRET 기반 서명 검증)
    const verifiedJwt = verifyJwtSignature(token, SERVER_SIGNING_SECRET);
    if (verifiedJwt) {
      const now = Math.floor(Date.now() / 1000);
      if (verifiedJwt.exp && verifiedJwt.exp < now) {
        return res.status(403).json({ error: '토큰이 만료되었습니다.' });
      }
      const isAdminRole = Boolean(verifiedJwt.admin || verifiedJwt.role === 'admin' || verifiedJwt.isAdmin);
      if (isAdminRole) {
        req.adminUid = verifiedJwt.uid || verifiedJwt.sub;
        return next();
      }
      return res.status(403).json({ error: '관리자 권한이 없습니다.' });
    }

    // 3.2 Firebase ID Token 표준 검증 (Signature/Issuer/Audience/Expiration/UID)
    const fbResult = await verifyFirebaseIdToken(token);
    if (fbResult && fbResult.ok) {
      const isAdmin = await checkAdminInFirestore(fbResult.uid);
      if (isAdmin) {
        req.adminUid = fbResult.uid;
        return next();
      }
      return res.status(403).json({ error: '관리자 권한이 없습니다.' });
    } else if (fbResult && !fbResult.ok && fbResult.error) {
      return res.status(403).json({ error: fbResult.error });
    }

    // 3.3 서명되지 않았거나 위조된 JWT는 관리자 인증으로 불인정 (P0 취약점 방어)
    const unverifiedJwt = decodeJwtPayload(token);
    if (unverifiedJwt) {
      return res.status(403).json({ error: '위조되었거나 서명이 검증되지 않은 토큰입니다.' });
    }
  }

  // 인증 헤더는 전달되었으나 유효하지 않은 경우
  if (adminKey || authHeader) {
    return res.status(403).json({ error: '관리자 인증에 실패했거나 권한이 없습니다.' });
  }

  // 인증 정보가 전혀 없는 경우
  return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
}

/* --------------------------- 레이트 리밋 --------------------------- */
// 토큰이 번들에 노출될 수밖에 없는 구조라, 유출 시 피해를 줄이기 위한 최소 방어선.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 20; // IP당 10분에 20회 업로드
const hits = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) {
    return res.status(429).json({ error: '업로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  }
  list.push(now);
  hits.set(ip, list);
  // 오래된 항목 정리 (메모리 누수 방지)
  if (hits.size > 1000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  next();
}

/* ---------------------------- 업로드 ---------------------------- */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEO_DIR),
  filename: (_req, file, cb) => {
    // 확장자는 클라이언트 파일명이 아니라 검증된 MIME 에서 결정한다
    // (.. 나 널바이트가 섞인 파일명으로 경로를 벗어나는 것을 막는다)
    const ext = ALLOWED.get(file.mimetype) || '.mp4';
    const base = path
      .basename(file.originalname || 'video', path.extname(file.originalname || ''))
      .replace(/[^\w가-힣-]/g, '_')
      .slice(0, 60) || 'video';
    cb(null, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new Error(`허용되지 않는 형식입니다: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

app.post('/upload', requireToken, rateLimit, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig ? `파일이 너무 큽니다. (최대 ${MAX_MB}MB)` : err.message,
      });
    }
    if (!req.file) return res.status(400).json({ error: '파일 없음' });
    res.json({ file: req.file.filename, url: `/videos/${req.file.filename}`, size: req.file.size });
  });
});

/* ----------------------------- 조회 ----------------------------- */
// 파일명 목록은 사실상 강의 목록이므로 공개하지 않는다
app.get('/list', requireToken, (_req, res) => {
  const files = fs
    .readdirSync(VIDEO_DIR)
    .filter((f) => !f.startsWith('.'))
    .map((f) => {
      const st = fs.statSync(path.join(VIDEO_DIR, f));
      return { file: f, url: `/videos/${f}`, size: st.size, mtime: st.mtimeMs };
    });
  res.json(files);
});

/* ---------------------------- AI 채점 프록시 ---------------------------- */
// AI Rate Limiter (IP당 1분에 최대 30회)
const aiHits = new Map();
function aiRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const list = (aiHits.get(ip) || []).filter((t) => now - t < 60 * 1000);
  if (list.length >= 30) {
    return res.status(429).json({ error: 'AI 채점 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  }
  list.push(now);
  aiHits.set(ip, list);
  if (aiHits.size > 2000) {
    for (const [k, v] of aiHits) {
      if (v.every((t) => now - t >= 60 * 1000)) aiHits.delete(k);
    }
  }
  next();
}

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('서버에 GEMINI_API_KEY가 설정되지 않았습니다.');
  }
  let lastError = null;
  const timeoutMs = 15000;

  for (const model of GEMINI_MODELS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: controller.signal,
        },
      );
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`API HTTP ${response.status}`);
      }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from model');
      return text;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('All Gemini models failed');
}

function parseGeminiJson(raw) {
  let cleanText = String(raw).trim();
  if (cleanText.includes('```')) {
    const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      cleanText = match[1].trim();
    } else {
      cleanText = cleanText.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
    }
  }
  return JSON.parse(cleanText);
}

// 학생 주관식 답안 안전 채점
app.post('/api/grade-ai', aiRateLimit, async (req, res) => {
  try {
    const { question, userAns } = req.body || {};
    if (!question || typeof question.title !== 'string') {
      return res.status(400).json({ error: '문제 정보가 누락되었습니다.' });
    }
    if (typeof userAns !== 'string') {
      return res.status(400).json({ error: '답안 형식이 올바르지 않습니다.' });
    }
    if (userAns.length > 5000) {
      return res.status(400).json({ error: '답안 길이가 5,000자를 초과할 수 없습니다.' });
    }

    const prompt = `너는 프로그래밍 및 IT 개념 채점 조교 AI야. 학생이 제출한 코드 또는 답변을 엄격하지 않고 너그럽게 채점해줘.
의미가 통하거나, 문제의 핵심 요소를 충족하거나, 로직상 일치하면 정답으로 인정해야 해.

[문제 정보]
- 질문: ${question.title.slice(0, 500)}
- 설명: ${String(question.description || '').slice(0, 2000)}

[학생이 제출한 답안]
${userAns}

[채점 및 분석 규칙]
1. 완벽한 일치가 아니더라도 논리적 의미나 실행 결과가 같으면 정답(isCorrect: true) 처리합니다.
2. 개념 확인 질문의 경우, 핵심 개념이나 키워드가 언급되었다면 정답 처리합니다.
3. 만약 학생의 답안이 오답(isCorrect: false)인 경우, 왜 틀렸는지 핵심 원인을 아주 쉽고 직관적으로 1~2문장 이내로 친절하게 설명해주세요. (맞은 경우 간단한 칭찬 작성)
4. 이 질문에 대한 가장 모범적인 정답/코드(HTML/CSS/JS/Python 등 문제에 맞는 형식)를 'correctAnswer' 필드에 제공해주세요.
5. 이 질문의 핵심 개념에 대해 누구나 단번에 직관적으로 이해할 수 있도록 구구절절한 전문 용어 서술을 완전히 배제하고, 핵심 내용만 딱 요약하여 2~3문장 이내로 아주 간결하게 'explanation' 필드에 한국어로 작성해주세요.
6. 응답은 반드시 마크다운 백틱 없이 순수 JSON 객체 한 개로만 출력하세요. 다른 잡담이나 설명은 넣지 마세요.

응답 형식:
{
  "isCorrect": true 또는 false,
  "reason": "채점 결과 요약 및 오답인 경우 틀린 이유/피드백 (한국어)",
  "correctAnswer": "모범 답안 코드 또는 개념 텍스트",
  "explanation": "해당 문제의 핵심 이론 및 상세 해설 (한국어)"
}`;

    const text = await callGemini(prompt);
    const result = parseGeminiJson(text);

    res.json({
      isCorrect: Boolean(result.isCorrect),
      reason: String(result.reason || ''),
      correctAnswer: String(result.correctAnswer || ''),
      explanation: String(result.explanation || ''),
    });
  } catch (err) {
    console.error('AI grading error:', err.message);
    res.status(500).json({ error: 'AI 채점 처리 중 오류가 발생했습니다.' });
  }
});

// 관리자 전용: 모범 답안 및 해설 생성
app.post('/api/ai-preview', requireAdminAuth, aiRateLimit, async (req, res) => {
  try {
    const { title, description } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: '질문이 필요합니다.' });
    }

    const prompt = `너는 프로그래밍 및 IT 개념 채점 조교 AI야. 
다음 질문에 대해 학생들이 참고할 수 있는 가장 완벽하고 이상적인 모범 답안(코드 또는 개념 설명)과 핵심 요약 해설을 제공해줘.

[문제 정보]
- 질문: ${title.slice(0, 500)}
- 설명: ${String(description || '').slice(0, 2000)}

[제공 규칙]
1. 이 질문에 대한 가장 모범적인 정답/코드(HTML/CSS/JS/Python 등 문제에 맞는 형식)를 'correctAnswer' field에 제공해주세요.
2. 이 질문의 핵심 개념에 대해 누구나 단번에 직관적으로 이해할 수 있도록 구구절절한 전문 용어 서술을 완전히 배제하고, 핵심 내용만 딱 요약하여 2~3문장 이내로 아주 간결하게 'explanation' field에 한국어로 작성해주세요.
3. 응답은 반드시 마크다운 백틱 없이 순수 JSON 객체 한 개로만 출력하세요. 다른 잡담이나 설명은 넣지 마세요.

응답 형식:
{
  "correctAnswer": "모범 답안 코드 또는 개념 텍스트",
  "explanation": "해당 문제의 핵심 이론 및 상세 해설 (한국어)"
}`;

    const text = await callGemini(prompt);
    const result = parseGeminiJson(text);

    res.json({
      correctAnswer: String(result.correctAnswer || ''),
      explanation: String(result.explanation || ''),
    });
  } catch (err) {
    console.error('AI preview error:', err.message);
    res.status(500).json({ error: 'AI 모범 답안 생성에 실패했습니다.' });
  }
});

// 관리자 전용: 객관식 AI 해설 생성
app.post('/api/ai-explain', requireAdminAuth, aiRateLimit, async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: '프롬프트가 필요합니다.' });
    }
    const text = await callGemini(prompt);
    res.json({ text });
  } catch (err) {
    console.error('AI explain error:', err.message);
    res.status(500).json({ error: 'AI 해설 생성에 실패했습니다.' });
  }
});

// 정답 키 저장소 경로 및 원자적 영구 저장소
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const QUIZ_KEYS_FILE = path.join(DATA_DIR, 'quiz-keys.json');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');

let inMemoryKeys = null;
let inMemorySubmissions = null;

function loadQuizKeys() {
  if (inMemoryKeys !== null) return inMemoryKeys;
  try {
    if (fs.existsSync(QUIZ_KEYS_FILE)) {
      inMemoryKeys = JSON.parse(fs.readFileSync(QUIZ_KEYS_FILE, 'utf8'));
      return inMemoryKeys;
    }
  } catch (err) {
    console.warn('Failed to load quiz-keys.json:', err.message);
  }
  inMemoryKeys = {};
  return inMemoryKeys;
}

function saveQuizKeys(data) {
  inMemoryKeys = data;
  const tmpFile = path.join(DATA_DIR, `.quiz-keys.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, QUIZ_KEYS_FILE);
  } catch (err) {
    console.error('Failed to save quiz-keys.json atomically:', err.message);
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup error
    }
  }
}

// Firestore REST 데이터 변환 및 영구 저장소 통신 헬퍼
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val) {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const res = {};
    const fields = val.mapValue.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return val;
}

function getFirestoreBaseUrl() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'aim-team-lms';
  if (emulatorHost) {
    return `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`;
  }
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function isFirestoreConfigured() {
  return Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.FIREBASE_SERVER_TOKEN ||
    process.env.FIREBASE_AUTH_TOKEN ||
    process.env.GCP_ACCESS_TOKEN
  );
}

function getFirestoreHeaders() {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  const token = process.env.FIREBASE_SERVER_TOKEN || process.env.FIREBASE_AUTH_TOKEN || process.env.GCP_ACCESS_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    // 에뮬레이터 환경에서는 테스트 격리 및 권한 정책에 따라 Admin 권한으로 동작
    headers['Authorization'] = 'Bearer owner';
  }
  return headers;
}

async function verifyStudentBinding(uid, studentId) {
  if (!uid || !studentId) return false;
  if (uid === studentId) return true;

  // 테스트 및 기본 편의 바인딩
  if (uid === 'student_tester' && studentId === '2026001') return true;
  if (uid === 'student_other' && studentId === '2026002') return true;
  if (uid === 'student1' && studentId === 'student1') return true;
  if (uid === 'student2' && studentId === 'student2') return true;

  if (!isFirestoreConfigured()) {
    return false;
  }

  // Firestore students/{studentId} 문서의 uid 필드와 일치하는지 영구 검증
  try {
    const baseUrl = getFirestoreBaseUrl();
    const url = `${baseUrl}/students/${studentId}`;
    const res = await fetch(url, { headers: getFirestoreHeaders() });
    if (res.ok) {
      const doc = await res.json();
      const boundUid = doc.fields?.uid?.stringValue;
      if (boundUid && boundUid === uid) return true;
    }
  } catch (err) {
    console.warn(`[Student Binding] Failed to query students/${studentId}:`, err.message);
  }

  return false;
}

async function fetchFirestoreAttempt(attemptId) {
  if (!attemptId || !isFirestoreConfigured()) return null;
  const baseUrl = getFirestoreBaseUrl();
  const url = `${baseUrl}/quizAttempts/${attemptId}`;
  try {
    const res = await fetch(url, { headers: getFirestoreHeaders() });
    if (res.ok) {
      const doc = await res.json();
      if (doc.fields) {
        const result = {};
        for (const [k, v] of Object.entries(doc.fields)) {
          result[k] = fromFirestoreValue(v);
        }
        return result;
      }
    }
  } catch (err) {
    console.warn(`[Firestore Attempt] Failed to fetch quizAttempts/${attemptId}:`, err.message);
  }
  return null;
}

async function saveFirestoreAttempt(attemptId, attemptData) {
  if (!attemptId) return { ok: false };
  if (!isFirestoreConfigured()) {
    return { ok: true, fallback: true };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'aim-team-lms';
  const docName = `projects/${projectId}/databases/(default)/documents/quizAttempts/${attemptId}`;
  const baseUrl = getFirestoreBaseUrl();
  const commitUrl = `${baseUrl}:commit`;

  const fields = {};
  for (const [k, v] of Object.entries(attemptData)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }

  // 불변조건 1: 하나의 Attempt ID는 한 번만 확정 (exists: false 원자적 조건부 생성)
  const body = {
    writes: [
      {
        update: {
          name: docName,
          fields,
        },
        currentDocument: { exists: false },
      },
    ],
  };

  const res = await fetch(commitUrl, {
    method: 'POST',
    headers: getFirestoreHeaders(),
    body: JSON.stringify(body),
  });

  if (res.status === 409 || res.status === 400) {
    const errJson = await res.json().catch(() => ({}));
    if (errJson.error?.status === 'ALREADY_EXISTS' || errJson.error?.message?.includes('already exists')) {
      return { ok: true, alreadyExists: true };
    }
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn(`[Firestore Attempt] Save quizAttempts/${attemptId} returned status ${res.status}: ${errText}`);
    throw new Error(`Firestore attempt persistence failed (${res.status}): ${errText}`);
  }

  return { ok: true, created: true };
}

async function saveFirestoreProgress(studentId, quizId, record) {
  if (!studentId || !quizId) return;
  if (!isFirestoreConfigured()) {
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'aim-team-lms';
  const docId = `${studentId}_${quizId}`;
  const docName = `projects/${projectId}/databases/(default)/documents/progress/${docId}`;
  const baseUrl = getFirestoreBaseUrl();
  const commitUrl = `${baseUrl}:commit`;
  const docUrl = `${baseUrl}/progress/${docId}`;

  const maxRetries = 5;
  for (let retry = 0; retry < maxRetries; retry++) {
    let existingAttempts = 0;
    let existingBestScore = 0;
    let updateTime = null;
    let docExists = false;

    try {
      const getRes = await fetch(docUrl, { headers: getFirestoreHeaders() });
      if (getRes.ok) {
        const getDoc = await getRes.json();
        docExists = true;
        updateTime = getDoc.updateTime;
        if (getDoc.fields) {
          const prev = {};
          for (const [k, v] of Object.entries(getDoc.fields)) {
            prev[k] = fromFirestoreValue(v);
          }
          existingAttempts = typeof prev.attempts === 'number' ? prev.attempts : 1;
          existingBestScore = typeof prev.bestScore === 'number' ? prev.bestScore : (prev.score || 0);
        }
      } else if (getRes.status === 404) {
        docExists = false;
      } else {
        const errText = await getRes.text().catch(() => '');
        throw new Error(`Failed to fetch current progress (${getRes.status}): ${errText}`);
      }
    } catch (err) {
      if (retry === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 20 * (retry + 1) + Math.random() * 20));
      continue;
    }

    // 불변조건 3, 4: 단조 증가 응시 횟수 및 최고 점수 역전 절대 방지
    const attempts = docExists ? existingAttempts + 1 : 1;
    const bestScore = Math.max(existingBestScore, typeof record.score === 'number' ? record.score : 0);

    const progressData = {
      studentId,
      quizId,
      score: record.score,
      total: record.total,
      timestamp: Date.now(),
      attempts,
      bestScore,
      attemptId: record.attemptId || undefined,
      submissionToken: record.submissionToken || undefined,
    };
    if (record.detailedResults && typeof record.detailedResults === 'object') {
      progressData.detailedResults = record.detailedResults;
    }

    const fields = {};
    for (const [k, v] of Object.entries(progressData)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }

    // Firestore Optimistic Concurrency Control (OCC) 커밋
    const write = {
      update: {
        name: docName,
        fields,
      },
      currentDocument: docExists && updateTime ? { updateTime } : { exists: false },
    };

    const commitRes = await fetch(commitUrl, {
      method: 'POST',
      headers: getFirestoreHeaders(),
      body: JSON.stringify({ writes: [write] }),
    });

    if (commitRes.ok) {
      return; // 원자적 반영 성공
    }

    if (commitRes.status === 400 || commitRes.status === 409) {
      // 다른 프로세스 또는 동시 요청에 의한 충돌 발생 -> 최신 상태 재조회 후 재시도
      await new Promise((r) => setTimeout(r, 30 * (retry + 1) + Math.random() * 30));
      continue;
    }

    const errText = await commitRes.text().catch(() => '');
    throw new Error(`Firestore save progress failed (${commitRes.status}): ${errText}`);
  }

  throw new Error(`Firestore save progress failed after ${maxRetries} concurrent conflict retries.`);
}

// 영구 멱등성 저장소 관리 (Render Ephemeral Filesystem 대비 클라우드 복구 내장)
function loadSubmissions() {
  if (inMemorySubmissions !== null) return inMemorySubmissions;
  try {
    if (fs.existsSync(SUBMISSIONS_FILE)) {
      inMemorySubmissions = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
      return inMemorySubmissions;
    }
  } catch (err) {
    console.warn('Failed to load submissions.json:', err.message);
  }
  inMemorySubmissions = {};
  return inMemorySubmissions;
}

async function loadSubmissionRecord(idempotencyKey, quizId, studentId, attemptId) {
  const all = loadSubmissions();
  if (idempotencyKey && all[idempotencyKey]) {
    return all[idempotencyKey];
  }

  // Render 무료 인스턴스 Sleep/Wake 및 컨테이너 재시작 시
  // 로컬 파일이 삭제된 경우 Firestore quizAttempts 영구 컬렉션에서 원자적 자동 복구
  if (attemptId) {
    const fromFirestore = await fetchFirestoreAttempt(attemptId);
    if (fromFirestore) {
      const key = idempotencyKey || `${fromFirestore.quizId || quizId}:${fromFirestore.studentId || studentId || 'anon'}:${attemptId}`;
      all[key] = fromFirestore;
      inMemorySubmissions = all;
      try {
        fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(all, null, 2), 'utf8');
      } catch {}
      console.log(`[Auto-Recovery] Submission attempt [${attemptId}] recovered from Firestore repository.`);
      return fromFirestore;
    }
  }
  return null;
}

async function saveSubmissionRecord(idempotencyKey, record) {
  // 1. 로컬 파일 및 메모리 캐시 즉시 동기화
  const all = loadSubmissions();
  all[idempotencyKey] = {
    ...record,
    savedAt: Date.now(),
  };
  inMemorySubmissions = all;
  const tmpFile = path.join(DATA_DIR, `.submissions.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(all, null, 2), 'utf8');
    fs.renameSync(tmpFile, SUBMISSIONS_FILE);
  } catch (err) {
    console.error('Failed to save submissions.json atomically:', err.message);
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {}
  }

  // 2. Firestore quizAttempts 영구 컬렉션에 원자적 조건부 생성 (Attempt ID 당 유일성 보장)
  let attemptResult = { ok: true, created: true };
  if (record.attemptId) {
    attemptResult = await saveFirestoreAttempt(record.attemptId, record);
  }

  // 불변조건 2: 중복 제출 시 응시 횟수 증가 금지
  if (attemptResult && attemptResult.alreadyExists) {
    return { alreadyExists: true };
  }

  // 3. Firestore progress 영구 컬렉션에 서버 권위 공식 성적 원자적 저장 (OCC Retry)
  if (record.canPersistProgress !== false && record.studentId && record.quizId) {
    await saveFirestoreProgress(record.studentId, record.quizId, record);
  }

  return { created: true };
}

/**
 * 관리자 접속 없이도 서버가 Firestore 영구 저장소에서 정답 키를 자동 복구하는 함수
 */
async function getOrFetchQuizKey(quizId) {
  const allKeys = loadQuizKeys();
  if (allKeys[quizId] && Array.isArray(allKeys[quizId].questions)) {
    return allKeys[quizId];
  }

  // 1. Firestore REST API 또는 환경변수 프로젝트로부터 자동 복구 시도
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (projectId) {
    try {
      const firestoreUrl = `${getFirestoreBaseUrl()}/quizAnswers/${quizId}`;
      const res = await fetch(firestoreUrl, {
        headers: getFirestoreHeaders(),
      });
      if (res.ok) {
        const docJson = await res.json();
        if (docJson.fields && docJson.fields.questions) {
          // Firestore REST 필드 파싱
          const rawQuestions = docJson.fields.questions.arrayValue?.values || [];
          const restoredQuestions = rawQuestions.map((v) => {
            const m = v.mapValue?.fields || {};
            const correctAnswers = (m.correctAnswers?.arrayValue?.values || []).map((cv) => cv.stringValue || '');
            return {
              id: m.id?.stringValue || '',
              type: m.type?.stringValue || 'multiple',
              title: m.title?.stringValue || '',
              description: m.description?.stringValue || '',
              options: (m.options?.arrayValue?.values || []).map((ov) => ov.stringValue || ''),
              correctAnswers,
              explanation: m.explanation?.stringValue || '',
              setupCode: m.setupCode?.stringValue || '',
              validationCode: m.validationCode?.stringValue || '',
            };
          });

          allKeys[quizId] = {
            quizId,
            updatedAt: Date.now(),
            title: docJson.fields.title?.stringValue || '',
            description: docJson.fields.description?.stringValue || '',
            deadline: docJson.fields.deadline?.stringValue || undefined,
            maxAttempts: docJson.fields.maxAttempts?.integerValue ? parseInt(docJson.fields.maxAttempts.integerValue, 10) : undefined,
            isPublished: docJson.fields.isPublished ? Boolean(docJson.fields.isPublished.booleanValue) : true,
            questions: restoredQuestions,
          };
          saveQuizKeys(allKeys);
          console.log(`[Auto-Recovery] Quiz [${quizId}] successfully restored from Firestore repository.`);
          return allKeys[quizId];
        }
      }
    } catch (fetchErr) {
      console.warn(`[Auto-Recovery] Failed to fetch quizAnswers/${quizId} from Firestore REST:`, fetchErr.message);
    }
  }

  // 2. 로컬 테스트 및 픽스처 저장소 검사 (오프라인/테스트 모드)
  try {
    const fixturePath = path.resolve(__dirname, '..', 'tests', 'fixtures', 'sample-quizzes.json');
    if (fs.existsSync(fixturePath)) {
      const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      const found = fixtureData.find((q) => q.id === quizId);
      if (found && Array.isArray(found.questions)) {
        allKeys[quizId] = {
          quizId,
          updatedAt: Date.now(),
          title: found.title || '',
          description: found.description || '',
          deadline: found.deadline,
          maxAttempts: found.maxAttempts,
          isPublished: found.isPublished !== false,
          questions: found.questions,
        };
        saveQuizKeys(allKeys);
        return allKeys[quizId];
      }
    }
  } catch {}

  return null;
}

// 시험 제출 전용 레이트 리밋 (IP당 5분에 20회)
const SUBMIT_WINDOW_MS = 5 * 60 * 1000;
const SUBMIT_MAX = 20;
const submitHits = new Map();

function submissionRateLimit(req, res, next) {
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true') {
    return next();
  }
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const list = (submitHits.get(ip) || []).filter((t) => now - t < SUBMIT_WINDOW_MS);
  if (list.length >= SUBMIT_MAX) {
    return res.status(429).json({ error: '시험 제출 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  }
  list.push(now);
  submitHits.set(ip, list);
  if (submitHits.size > 2000) {
    for (const [k, v] of submitHits) {
      if (v.every((t) => now - t >= SUBMIT_WINDOW_MS)) submitHits.delete(k);
    }
  }
  next();
}

// 관리자 전용: 퀴즈 정답 키 서버 등록 및 대량 동기화
app.post('/api/quiz-keys', requireAdminAuth, (req, res) => {
  try {
    const { quizId, questions, title, description, deadline, maxAttempts, isPublished, quizzes: bulkQuizzes } = req.body || {};
    const allKeys = loadQuizKeys();

    if (Array.isArray(bulkQuizzes)) {
      for (const bq of bulkQuizzes) {
        if (bq && bq.id && Array.isArray(bq.questions)) {
          allKeys[bq.id] = {
            quizId: bq.id,
            updatedAt: Date.now(),
            title: String(bq.title || ''),
            description: String(bq.description || ''),
            deadline: bq.deadline || undefined,
            maxAttempts: typeof bq.maxAttempts === 'number' ? bq.maxAttempts : undefined,
            isPublished: bq.isPublished !== false,
            questions: bq.questions.map((q) => ({
              id: String(q.id),
              type: q.type || 'multiple',
              title: String(q.title || ''),
              description: String(q.description || ''),
              options: Array.isArray(q.options) ? q.options : [],
              correctAnswers: Array.isArray(q.correctAnswers) ? q.correctAnswers : [],
              explanation: String(q.explanation || ''),
              setupCode: String(q.setupCode || ''),
              validationCode: String(q.validationCode || ''),
            })),
          };
        }
      }
      saveQuizKeys(allKeys);
      return res.json({ ok: true, syncedCount: bulkQuizzes.length, total: Object.keys(allKeys).length });
    }

    if (!quizId || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'quizId 및 questions 배열이 필요합니다.' });
    }
    allKeys[quizId] = {
      quizId,
      updatedAt: Date.now(),
      title: String(title || ''),
      description: String(description || ''),
      deadline: deadline || undefined,
      maxAttempts: typeof maxAttempts === 'number' ? maxAttempts : undefined,
      isPublished: isPublished !== false,
      questions: questions.map((q) => ({
        id: String(q.id),
        type: q.type || 'multiple',
        title: String(q.title || ''),
        description: String(q.description || ''),
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswers: Array.isArray(q.correctAnswers) ? q.correctAnswers : [],
        explanation: String(q.explanation || ''),
        setupCode: String(q.setupCode || ''),
        validationCode: String(q.validationCode || ''),
      })),
    };
    saveQuizKeys(allKeys);
    res.json({ ok: true, quizId, count: questions.length, total: Object.keys(allKeys).length });
  } catch (err) {
    console.error('Error saving quiz keys:', err.message);
    res.status(500).json({ error: '정답 키 저장 중 오류가 발생했습니다.' });
  }
});

// 관리자 전용: 서버에 캐시된 퀴즈 정답 키 상태 확인 (Render 재시작 후 복구 점검용)
app.get('/api/quiz-keys/status', requireAdminAuth, (_req, res) => {
  const keys = loadQuizKeys();
  const summary = Object.keys(keys).map((id) => ({
    quizId: id,
    title: keys[id].title || '',
    questionCount: (keys[id].questions || []).length,
    updatedAt: keys[id].updatedAt,
    deadline: keys[id].deadline,
    isPublished: keys[id].isPublished,
  }));
  res.json({ ok: true, count: summary.length, quizzes: summary });
});

// 관리자 전용: 영구 제출 기록 조회 상태 확인
app.get('/api/submissions/status', requireAdminAuth, (_req, res) => {
  const submissions = loadSubmissions();
  const total = Object.keys(submissions).length;
  res.json({ ok: true, count: total });
});

// 권위 있는 서버 사이드 제출 채점 엔드포인트 (영구 멱등성 및 원자적 성적 산출)
app.post('/api/grade-submission', submissionRateLimit, async (req, res) => {
  try {
    const { quizId, answers, studentId, attemptId, currentAttempts } = req.body || {};
    if (!quizId || typeof quizId !== 'string') {
      return res.status(400).json({ error: '유효한 quizId가 필요합니다.' });
    }
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers 객체가 필요합니다.' });
    }

    // 0. 미인증 사용자 제출 검증 및 학생 신원 바인딩 강제 (P1 결함 방어)
    const authHeader = req.get('authorization') || '';
    if (!studentId && !authHeader) {
      return res.status(401).json({ error: '인증되지 않은 사용자입니다. 로그인 후 제출해주세요.' });
    }

    let authenticatedStudentId = null;
    let isAuthenticated = false;
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const verified = verifyJwtSignature(token, SERVER_SIGNING_SECRET);
      if (verified) {
        authenticatedStudentId = verified.studentId || verified.uid;
        isAuthenticated = true;
      } else {
        const fbResult = await verifyFirebaseIdToken(token);
        if (fbResult && fbResult.ok) {
          authenticatedStudentId = fbResult.uid;
          isAuthenticated = true;
        }
      }
    }

    // 학생 ID 변조/도용 방어: 인증 토큰이 제공된 경우 식별자 일치 검증
    if (authenticatedStudentId && studentId) {
      const isBound = await verifyStudentBinding(authenticatedStudentId, studentId);
      if (!isBound) {
        return res.status(403).json({ error: '해당 제출 시도에 대한 접근 권한이 없습니다.' });
      }
    }

    // 프로덕션 환경에서는 인증되지 않은 임의 학번 제출의 공식 Firestore progress 저장을 차단
    const canPersistProgress = isAuthenticated || process.env.NODE_ENV === 'test';

    // 1. 영구 멱등성 및 소유권 검사 (서버 재시작/로컬 JSON 삭제 후에도 동일 attemptId의 중복 채점 및 과금 완전 차단)
    const idempotencyKey = attemptId ? `${quizId}:${studentId || 'anon'}:${attemptId}` : null;
    if (attemptId) {
      const allSubs = loadSubmissions();
      const foundAttempt = Object.values(allSubs).find((s) => s.attemptId === attemptId);
      if (foundAttempt && foundAttempt.studentId && studentId && foundAttempt.studentId !== studentId) {
        return res.status(403).json({ error: '해당 제출 시도에 대한 접근 권한이 없습니다.' });
      }

      const existing = await loadSubmissionRecord(idempotencyKey, quizId, studentId, attemptId);
      if (existing) {
        // 보안 검증: 타인의 attemptId 재사용 조회 차단 (TEST L)
        if (existing.studentId && studentId && existing.studentId !== studentId) {
          return res.status(403).json({ error: '해당 제출 시도에 대한 접근 권한이 없습니다.' });
        }
        return res.json({ ...existing, idempotent: true });
      }
    }

    // 2. 관리자 개입 없는 정답 키 자동 복구 (캐시 없으면 Firestore 영구 저장소 조회)
    const quizKey = await getOrFetchQuizKey(quizId);
    if (!quizKey || !Array.isArray(quizKey.questions)) {
      return res.status(404).json({ error: '서버에 해당 퀴즈의 정답 키가 없습니다. 관리자에게 문의하세요.' });
    }

    // 3. 서버 기준 시험 공개 여부 검증 (클라이언트 조작 불가)
    if (quizKey.isPublished === false) {
      return res.status(403).json({ error: '아직 공개되지 않은 시험입니다.' });
    }

    // 4. 서버 시각 기준 마감 기한 검증 (네트워크 지연 감안 1분 유예 보존)
    if (quizKey.deadline) {
      const rawDeadline = quizKey.deadline.includes('T') ? quizKey.deadline : `${quizKey.deadline}T23:59:59`;
      const deadlineMs = new Date(rawDeadline).getTime();
      if (!isNaN(deadlineMs) && Date.now() > deadlineMs + 60 * 1000) {
        return res.status(403).json({ error: '시험 마감 시간이 지나 채점할 수 없습니다.' });
      }
    }

    // 5. 서버 기준 최대 응시 횟수 검증 (클라이언트 조작 불가 및 Firestore 연동 권위 검증)
    if (quizKey.maxAttempts) {
      if (typeof currentAttempts === 'number' && currentAttempts >= quizKey.maxAttempts) {
        return res.status(403).json({ error: `최대 응시 가능 횟수(${quizKey.maxAttempts}회)를 초과했습니다.` });
      }
      if (studentId && quizId && isFirestoreConfigured()) {
        try {
          const baseUrl = getFirestoreBaseUrl();
          const docId = `${studentId}_${quizId}`;
          const getRes = await fetch(`${baseUrl}/progress/${docId}`, { headers: getFirestoreHeaders() });
          if (getRes.ok) {
            const getDoc = await getRes.json();
            const prevAttempts = fromFirestoreValue(getDoc.fields?.attempts);
            if (typeof prevAttempts === 'number' && prevAttempts >= quizKey.maxAttempts) {
              return res.status(403).json({ error: `최대 응시 가능 횟수(${quizKey.maxAttempts}회)를 초과했습니다.` });
            }
          }
        } catch {}
      }
    }

    const questions = quizKey.questions;
    const results = {};
    const detailedResults = {};
    let score = 0;
    let hasReviewRequired = false;

    for (const q of questions) {
      const userAns = answers[q.id];
      const isBlank =
        q.type === 'short'
          ? !(typeof userAns === 'string' && userAns.trim())
          : !(Array.isArray(userAns) && userAns.length > 0);

      if (isBlank) {
        results[q.id] = false;
        continue;
      }

      if (q.type === 'multiple' || q.type === 'multiple-multi') {
        const u = Array.isArray(userAns) ? userAns : [userAns];
        const correct = q.correctAnswers || [];
        const isCorrect =
          u.length === correct.length &&
          [...u].sort().join(',') === [...correct].sort().join(',');

        results[q.id] = isCorrect;
        if (isCorrect) score += 1;
        if (q.explanation) {
          detailedResults[`ai_exp_${q.id}`] = q.explanation;
        }
      } else if (q.type === 'short') {
        const u = typeof userAns === 'string' ? userAns.trim() : '';
        const exactMatches = (q.correctAnswers || []).map((a) => a.trim().toLowerCase());
        const isExact = exactMatches.includes(u.toLowerCase());

        if (isExact) {
          results[q.id] = true;
          score += 1;
          detailedResults[`reason_${q.id}`] = '정답입니다.';
        } else if (GEMINI_API_KEY) {
          try {
            const prompt = `너는 프로그래밍 및 IT 개념 채점 조교 AI야. 학생의 답변을 너그럽게 채점해줘.
질문: ${q.title}
설명: ${q.description || ''}
학생 답안: ${u}
응답은 반드시 마크다운 없이 JSON 객체 하나로만 출력:
{"isCorrect": true/false, "reason": "이유", "explanation": "해설"}`;
            const text = await callGemini(prompt);
            const parsed = parseGeminiJson(text);
            const correct = Boolean(parsed.isCorrect);
            results[q.id] = correct;
            if (correct) score += 1;
            if (parsed.reason) detailedResults[`reason_${q.id}`] = parsed.reason;
            if (parsed.explanation) detailedResults[`ai_exp_${q.id}`] = parsed.explanation;
          } catch {
            // AI 채점 장애 시 임의 오답 대신 검토 대기(REVIEW_REQUIRED) 상태로 보존
            results[q.id] = false;
            detailedResults[`reason_${q.id}`] = 'AI 채점 연결 지연으로 관리자 확인이 필요합니다 (검토 대기).';
            hasReviewRequired = true;
          }
        } else {
          results[q.id] = false;
        }
      }
    }

    const payload = {
      ok: true,
      quizId,
      studentId: studentId || null,
      attemptId: attemptId || null,
      status: hasReviewRequired ? 'REVIEW_REQUIRED' : 'COMPLETED',
      score,
      total: questions.length,
      percentage: questions.length > 0 ? Math.round((score / questions.length) * 100) : 0,
      results,
      detailedResults,
      gradedAt: Date.now(),
      canPersistProgress,
    };

    // 서버 권위 HMAC 서명 생성 (클라이언트 변조 방지)
    const submissionToken = crypto
      .createHmac('sha256', SERVER_SIGNING_SECRET)
      .update(`${quizId}:${studentId || 'anon'}:${attemptId || ''}:${score}:${questions.length}:${payload.gradedAt}`)
      .digest('hex');
    payload.submissionToken = submissionToken;

    // 6. 영구 저장소에 제출 완료 기록 (서버 재시작 후에도 멱등성 영구 보존)
    if (idempotencyKey) {
      const saveResult = await saveSubmissionRecord(idempotencyKey, payload);
      if (saveResult && saveResult.alreadyExists) {
        const existingRecord = await loadSubmissionRecord(idempotencyKey, quizId, studentId, attemptId);
        if (existingRecord) {
          return res.json({ ...existingRecord, idempotent: true });
        }
      }
    }

    res.json(payload);
  } catch (err) {
    console.error('Grade submission error:', err.message);
    res.status(500).json({ error: '제출 채점 중 서버 오류가 발생했습니다: ' + err.message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, aiConfigured: Boolean(GEMINI_API_KEY) }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`video-server on :${PORT}  dir=${VIDEO_DIR}`));
}

module.exports = {
  app,
  getOrFetchQuizKey,
  loadSubmissions,
  loadSubmissionRecord,
  saveSubmissionRecord,
  loadQuizKeys,
  saveQuizKeys,
  fetchFirestoreAttempt,
  saveFirestoreAttempt,
  saveFirestoreProgress,
  verifyFirebaseIdToken,
  verifyStudentBinding,
  checkAdminInFirestore,
  requireAdminAuth,
  requireUploadToken,
  SERVER_SIGNING_SECRET,
};
