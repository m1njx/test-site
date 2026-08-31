# 🎓 AIM TEAM LMS

동아리 학습 관리 플랫폼. **영상 강의 이수 관리**와 **AI 채점 퀴즈**를 한 곳에서 운영합니다.
React(TypeScript) + Firestore 기반의 서버리스 앱입니다.

## ✨ 주요 기능

### 👨‍🎓 학생
- **코스 학습** — `코스 > 모듈 > 레슨(영상 | 퀴즈)` 구조. 진행률과 이수 여부를 한눈에.
- **꼼수 없는 영상 시청** — 앞으로 건너뛰기 차단, 배속 제한, 탭 이탈 시 자동 일시정지,
  실제로 본 구간만 누적 집계. 설정한 비율(기본 95%) 이상 시청해야 이수 처리됩니다.
  이어보기와 순차 잠금(이전 레슨 완료 전 다음 레슨 잠금)도 지원합니다.
- **퀴즈 응시** — 객관식(단일/복수정답), 주관식(파이썬 코드) 혼합. 제한 시간, 응시 횟수 제한,
  문제 셔플, 답안 임시 저장, 미답변 건너뛰기.
- **AI 채점 및 피드백** — Gemini 가 주관식을 채점하고 오답 원인·모범 답안·해설을 제공합니다.
  (실패 시 브라우저 내 Pyodide 로 파이썬 실행 채점으로 대체)
- **오답 노트** — 틀린 문제를 자동으로 모아 다시 볼 수 있습니다.

### 👩‍🏫 관리자
- **코스 빌더** — 모듈/레슨 구성, 순서 변경, 대상 팀원 지정, 공개 여부.
  영상은 **YouTube 링크** 또는 **직접 업로드한 mp4**(자체 비디오 서버) 모두 가능합니다.
- **퀴즈 생성기** — 브라우저에서 문제 작성·수정·복제, 저장 전 유효성 검사.
- **이수 현황** — 학생 × 코스 매트릭스, 레슨별 완료 여부, CSV 내보내기.
- **부정행위 로그** — 응시 중 화면 이탈·복사·붙여넣기·우클릭·개발자도구·PrintScreen 입력을
  타임라인으로 기록하고, 가중 점수가 임계치를 넘으면 자동으로 표시합니다.
  퀴즈마다 모니터링 수준을 **없음 / 로그만 / 엄격(전체화면 강제)** 중에서 고를 수 있습니다.
- **통계** — 퀴즈별 평균 정답률, 자주 틀리는 문제, 리더보드, 미제출자 확인.

> ⚠️ 웹에서는 실제 스크린샷 캡처를 감지할 수 없습니다(특히 모바일).
> 기록되는 것은 키 입력과 화면 이탈 이벤트이며, 한계는 [docs/SECURITY.md](docs/SECURITY.md)에 정리해 두었습니다.

## 🛠 기술 스택

| 영역 | 사용 기술 |
|---|---|
| Frontend | React 19 (TypeScript), Vite, Framer Motion, lucide-react |
| Database | Firebase Firestore (무료 Spark 플랜 범위) |
| AI 채점 | Google Gemini API |
| 코드 실행 | Pyodide (WebAssembly Python, 필요할 때만 지연 로딩) |
| 영상 호스팅 | YouTube 링크 또는 자체 비디오 서버 (`video-server/`, Docker) |
| 배포 | Render (정적 사이트) |

## 📦 설치 및 실행

```bash
git clone https://github.com/m1njx/test-site.git
cd test-site
npm install
cp .env.example .env    # 값을 채워주세요
npm run dev
```

### 환경 변수

`.env.example` 을 복사해 채웁니다. Firebase 키가 없으면 브라우저 localStorage 를 쓰는
**Mock 모드**로 동작하므로, 설정 없이도 전체 기능을 시험해볼 수 있습니다.

| 변수 | 설명 |
|---|---|
| `VITE_FIREBASE_*` | Firebase 설정 6종. 없으면 Mock 모드 |
| `VITE_GEMINI_API_KEY` | AI 채점용 키 |
| `VITE_ADMIN_PASSWORD_HASH` | 관리자 비밀번호의 **SHA-256 해시** |
| `VITE_VIDEO_SERVER_URL` | 자체 비디오 서버 주소 (mp4 업로드 시에만) |
| `VITE_VIDEO_UPLOAD_TOKEN` | 업로드 토큰. **관리자 비밀번호와 반드시 다르게** |

관리자 비밀번호 해시 만들기:

```bash
printf '원하는비밀번호' | shasum -a 256
```

## 🎥 영상 호스팅

- **YouTube 미등록(unlisted) 링크** — 비용 0, 별도 인프라 불필요. 대부분의 경우 권장.
- **자체 mp4 호스팅** — 외부에 올릴 수 없는 강의용. `video-server/` 를 Docker 로 띄웁니다.
  설치·배포·비용은 [video-server/README.md](video-server/README.md) 참고.

## 🔒 보안

서버가 없는 정적 사이트라 구조적으로 클라이언트를 신뢰해야 하는 지점이 있습니다.
**무엇이 막히고 무엇이 안 막히는지**와 Firestore 규칙 배포 방법은
[docs/SECURITY.md](docs/SECURITY.md) 에 정리되어 있습니다. 운영 전에 한 번 읽어보세요.

```bash
firebase deploy --only firestore:rules
```

## 🚀 배포

Render 정적 사이트로 배포되며 GitHub push 시 자동 빌드됩니다.

- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist`
- 환경 변수는 Render 대시보드의 **Environment** 탭에도 동일하게 넣어야 합니다.

비디오 서버는 별도 배포가 필요합니다(같은 서비스에 얹을 수 없음).

---
Developed by **AIM TEAM** (Main Developer: 강민제)
