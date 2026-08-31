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

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`video-server on :${PORT}  dir=${VIDEO_DIR}`));
