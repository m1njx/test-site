# AIM TEAM LMS — 자체 비디오 서버

YouTube에 올리기 곤란한 mp4 강의를 직접 호스팅하기 위한 아주 작은 서버.
Express + multer 로 **업로드**와 **Range 스트리밍**(구간 이어보기)만 담당한다.
데이터(코스/진도/부정행위 로그)는 그대로 Firestore 무료 한도를 쓴다.

## 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/upload` | `multipart/form-data` 의 `file` 필드. 헤더 `x-upload-token` 필요 |
| `GET` | `/videos/<파일명>` | mp4 스트리밍 (Range 지원) |
| `GET` | `/list` | 업로드된 파일 목록 |
| `GET` | `/health` | 상태 확인 |

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8080` | 포트 |
| `UPLOAD_TOKEN` | (없음) | 업로드 인증 토큰. **프론트 `.env` 의 `VITE_ADMIN_PASSWORD` 와 동일하게 설정** |
| `VIDEO_DIR` | `./videos` | 저장 경로. 배포 시 **영구 디스크/볼륨**을 여기에 마운트 |
| `ALLOW_ORIGIN` | `*` | CORS 허용 오리진. 운영 시 프론트 도메인으로 제한 권장 |
| `MAX_MB` | `2048` | 업로드 최대 크기(MB) |

## 로컬 실행

```bash
cd video-server
npm install
UPLOAD_TOKEN=$(grep VITE_ADMIN_PASSWORD ../.env | cut -d= -f2) node server.js
# → http://localhost:8080
```

또는 Docker:

```bash
docker compose up --build
```

## 프론트 연결

앱 루트 `.env` 에 추가:

```env
VITE_VIDEO_SERVER_URL=http://localhost:8080     # 또는 배포된 도메인
```

관리자 → 코스 → 영상 레슨 → "파일/URL" → **mp4 업로드** 버튼이 활성화된다.
업로드 없이 이미 어딘가 올라간 mp4/HLS URL을 직접 붙여넣어도 된다.

## 무료로 배포하기

### 네이버클라우드(NCP) — 20만원 크레딧 보유 시 권장
- **Micro/Compact 서버 1대** + **Block Storage 10~50GB**(영상 보관용) 를 붙인다.
- 서버에 Docker 설치 후:
  ```bash
  git clone <repo> && cd test/video-server
  # docker-compose.yml 의 UPLOAD_TOKEN 을 실제 값으로 수정
  docker compose up -d --build
  ```
- 방화벽(ACG)에서 8080(또는 80/443) 인바운드 허용. 도메인+HTTPS 는 Caddy/Nginx 리버스 프록시 권장.
- **대략 비용**: 서버 월 1~2만원 + 디스크 월 수천원 → 크레딧 20만원으로 **약 1년** 사용 가능.
  단, 아웃바운드 트래픽은 별도 과금이므로 영상이 매우 크거나 재시청이 많으면 더 빨리 소진될 수 있다.
  (예: 500MB 영상 × 40명 × 3회 ≈ 60GB/월)

### Fly.io (무료 볼륨 소량)
```bash
fly launch --no-deploy       # fly.toml 생성
fly volumes create video_data --size 3      # 3GB 무료 범위
fly secrets set UPLOAD_TOKEN=...
fly deploy
```
`fly.toml` 에 `[mounts] source="video_data" destination="/data/videos"` 추가.

### Railway / Render
- Docker 배포 지원. **주의**: 두 플랫폼의 무료 플랜은 영구 디스크가 없어
  재배포 시 업로드 파일이 사라진다 → 소수의 영상을 repo(또는 이미지)에 포함시키거나
  NCP/Fly 처럼 볼륨 있는 곳을 쓰는 편이 안전하다.

## 한계

- 실제 인증 체계가 없어 토큰 하나로 업로드를 막는다. 토큰 유출 시 누구나 업로드 가능.
- 트랜스코딩/썸네일 없음. 브라우저 호환 mp4(H.264/AAC)로 미리 인코딩해서 올릴 것.
