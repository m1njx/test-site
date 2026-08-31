/**
 * AIM TEAM LMS - 자체 비디오 서버
 *  - POST /upload        : mp4 업로드 (헤더 x-upload-token 필요)
 *  - GET  /videos/<file> : Range 지원 스트리밍 (express.static 자동 처리)
 *  - GET  /list          : 업로드된 파일 목록
 *  - GET  /health        : 헬스체크
 *
 * 환경변수
 *  PORT           서버 포트 (기본 8080)
 *  UPLOAD_TOKEN   업로드 인증 토큰 (프론트 VITE_ADMIN_PASSWORD 와 동일하게)
 *  VIDEO_DIR      저장 경로 (기본 ./videos) - 영구 디스크/볼륨을 마운트할 것
 *  ALLOW_ORIGIN   CORS 허용 오리진 (기본 *)
 *  MAX_MB         업로드 최대 크기 MB (기본 2048)
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const PORT = process.env.PORT || 8080;
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || '';
const VIDEO_DIR = path.resolve(process.env.VIDEO_DIR || path.join(__dirname, 'videos'));
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const MAX_MB = parseInt(process.env.MAX_MB || '2048', 10);

fs.mkdirSync(VIDEO_DIR, { recursive: true });

const app = express();
app.use(cors({ origin: ALLOW_ORIGIN }));

// 정적 스트리밍: express.static 은 Range 요청을 자동 지원
app.use(
  '/videos',
  express.static(VIDEO_DIR, {
    acceptRanges: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  }),
);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEO_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^\w가-힣.-]/g, '_')
      .slice(0, 60);
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: MAX_MB * 1024 * 1024 } });

function requireToken(req, res, next) {
  if (!UPLOAD_TOKEN) return res.status(500).json({ error: 'UPLOAD_TOKEN 미설정' });
  if (req.get('x-upload-token') !== UPLOAD_TOKEN) return res.status(401).json({ error: '인증 실패' });
  next();
}

app.post('/upload', requireToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일 없음' });
  res.json({ file: req.file.filename, url: `/videos/${req.file.filename}`, size: req.file.size });
});

app.get('/list', (_req, res) => {
  const files = fs
    .readdirSync(VIDEO_DIR)
    .filter((f) => !f.startsWith('.'))
    .map((f) => {
      const st = fs.statSync(path.join(VIDEO_DIR, f));
      return { file: f, url: `/videos/${f}`, size: st.size, mtime: st.mtimeMs };
    });
  res.json(files);
});

app.get('/health', (_req, res) => res.json({ ok: true, dir: VIDEO_DIR, count: fs.readdirSync(VIDEO_DIR).length }));

app.listen(PORT, () => console.log(`video-server on :${PORT}  dir=${VIDEO_DIR}`));
