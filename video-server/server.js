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
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function requireToken(req, res, next) {
  if (!UPLOAD_TOKEN) return res.status(500).json({ error: 'UPLOAD_TOKEN 미설정' });
  if (!safeEqual(req.get('x-upload-token') || '', UPLOAD_TOKEN)) {
    return res.status(401).json({ error: '인증 실패' });
  }
  next();
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
app.post('/api/ai-preview', requireToken, aiRateLimit, async (req, res) => {
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
app.post('/api/ai-explain', requireToken, aiRateLimit, async (req, res) => {
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

app.get('/health', (_req, res) => res.json({ ok: true, aiConfigured: Boolean(GEMINI_API_KEY) }));

app.listen(PORT, () => console.log(`video-server on :${PORT}  dir=${VIDEO_DIR}`));
