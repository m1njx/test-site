<div align="center">

# 🎓 AIM TEAM LMS

**동아리를 위한 학습 관리 플랫폼**

영상 강의 이수 관리와 AI 채점 퀴즈를 제공하는 React 기반 LMS입니다.
정적 프론트엔드와 Firebase를 사용하며, 운영 환경의 공식 채점은 별도 서버에서 처리합니다.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?logo=firebase&logoColor=black)
![Gemini](https://img.shields.io/badge/Gemini_API-8E75B2?logo=googlegemini&logoColor=white)

</div>

---

## 이 프로젝트가 푸는 문제

온라인으로 강의를 돌리면 늘 두 가지가 문제입니다.

> **"영상을 진짜로 봤을까?"** — 재생만 걸어두고 자리를 비우거나, 진행바를 끝으로 당겨버리면 그만입니다.
>
> **"시험을 혼자 풀었을까?"** — 화면을 벗어나 검색하거나 답을 복사해도 알 길이 없습니다.

이 앱은 **실제로 시청한 구간만 누적 집계**해서 이수를 판정하고, **응시 중 이탈·복사·개발자도구
사용을 타임라인으로 기록**해 관리자가 검토할 수 있게 합니다.

---

## ✨ 주요 기능

### 🎬 꼼수가 통하지 않는 영상 시청

| 시도 | 결과 |
|---|---|
| 진행바를 앞으로 드래그 | 아직 안 본 지점이면 **되돌려짐** |
| 2배속·8배속 재생 | **1배속으로 강제 리셋** |
| 다른 탭으로 이동 | **자동 일시정지** |
| 끝부분만 잠깐 재생 | 누적 시청 구간이 부족해 **미이수** |

시청 구간을 `[시작, 끝]` 범위로 병합해 관리하므로 **겹치는 구간은 중복 집계하지 않습니다.**
기본 기준은 95% 이상 시청이며 레슨별로 조정할 수 있습니다. 이어보기와 순차 잠금도 지원합니다.

YouTube 링크와 직접 업로드한 mp4 **양쪽 모두** 동일한 규칙이 적용됩니다.

### 🔍 부정행위 모니터링

응시 중 아래 활동이 **시각과 함께** 기록되고, 가중 점수가 임계치를 넘으면 자동으로 표시됩니다.

`화면 이탈` · `창 포커스 이탈` · `전체화면 해제` · `복사` · `붙여넣기` · `잘라내기`
`우클릭` · `개발자도구 단축키` · `PrintScreen / Cmd+Shift+3~5` · `새로고침 시도`

퀴즈마다 수준을 고를 수 있습니다.

| 수준 | 기록 | 전체화면 강제 | 권장 용도 |
|---|:---:|:---:|---|
| 없음 | ✕ | ✕ | 연습 문제 |
| **로그만** | ✅ | ✕ | 일일 퀴즈 *(기본값)* |
| 엄격 | ✅ | ✅ | 중요 시험 |

> ⚠️ 웹에서는 **실제 스크린샷 촬영을 감지할 수 없습니다**(특히 모바일).
> 기록되는 것은 키 입력과 화면 이탈 이벤트이며, 캡처 여부 자체는 알 수 없습니다.
> 한계는 [docs/SECURITY.md](docs/SECURITY.md) 에 솔직하게 정리해 두었습니다.

### 🤖 AI 채점

주관식 답안을 Gemini 가 채점하고 **오답 원인 · 모범 답안 · 핵심 해설**을 함께 제공합니다.
운영 환경에서는 `/api/grade-submission`을 통해 서버가 공식 성적을 산출합니다.
서버 채점이 실패하면 답안을 보존하고 재시도를 안내합니다.
개발 또는 Mock 모드에서는 브라우저 채점도 지원하며, AI 호출 실패 시 **Pyodide로 파이썬을 실행**하는 대체 경로를 사용합니다.

### 📚 코스 · 학습 관리

```
코스 ─┬─ 모듈 1 ─┬─ 🎬 영상 레슨   (완청해야 통과)
      │          └─ 📝 퀴즈 레슨   (통과 기준 % 설정)
      └─ 모듈 2 ─── …
```

모든 레슨을 완료하면 **이수 완료**. 진행률은 홈에서 원형 그래프로 확인합니다.

### 👩‍🏫 관리자 기능

- **코스 빌더** — 모듈/레슨 구성, 순서 변경, 대상 팀원 지정, 공개 여부
- **퀴즈 생성기** — 객관식(단일/복수정답)·주관식, 저장 전 유효성 검사, 복제
- **이수 현황** — 학생 × 코스 매트릭스, 레슨별 완료 여부, CSV 내보내기
- **부정행위 로그** — 응시 세션별 이벤트 타임라인, 플래그 자동 표시, 필터
- **통계** — 평균 정답률, 자주 틀리는 문제, 리더보드, 미제출자
- **공지** — 홈 상단 배너

### 🎨 그 외

- 따뜻한 우드톤 + 파스텔 테마, **다크 모드** 지원
- 모바일 대응, 키보드 접근성(`:focus-visible`), `prefers-reduced-motion` 존중
- 답안 자동 임시 저장, 오프라인 감지, 오류 발생 시 복구 화면

---

## 🔐 보안 모델

프론트엔드는 정적 사이트로 배포하며, **Firestore 접근 권한은 보안 규칙이 강제**합니다.
공식 성적은 인증된 채점 서버가 처리하고, 퀴즈 정답·해설은 관리자 전용 `quizAnswers` 컬렉션에 분리합니다.

| 항목 | 방식 |
|---|---|
| 로그인 | 학번 + 비밀번호 (Firebase Auth). 명부에 등록된 학번만 계정 생성 가능 |
| 관리자 | `admins/{uid}` 문서 존재 여부. 앱에서 만들 수 없어 **위조 불가** |
| 성적·진도 | `students/{학번}.uid == request.auth.uid` — **본인 것만 쓰기** |
| 성적·부정행위 로그 | **삭제 불가** (규칙상 원천 차단) |

설정 절차는 [docs/AUTH-SETUP.md](docs/AUTH-SETUP.md) 를 순서대로 따라가세요.
**관리자 계정을 만든 뒤에 규칙을 배포해야 합니다.** 순서를 바꾸면 관리자 화면이 잠깁니다.

```bash
firebase deploy --only firestore:rules
```

브라우저에서 수집하는 이벤트의 한계와 운영 시 점검 항목은 [docs/SECURITY.md](docs/SECURITY.md)에서 확인할 수 있습니다.
기존 퀴즈를 운영하던 환경은 정답 분리 여부도 확인하세요. 마이그레이션 도구는 `scripts/migrate-quiz-answers.mjs`입니다.

---

## 🛠 기술 스택

| 영역 | 사용 기술 |
|---|---|
| Frontend | React 19 · TypeScript · Vite · Framer Motion · lucide-react |
| 인증 · DB | Firebase Authentication · Cloud Firestore *(무료 Spark 플랜)* |
| AI 채점 | Google Gemini API |
| 코드 실행 | Pyodide *(WebAssembly Python, 필요할 때만 지연 로딩)* |
| 영상 호스팅 | YouTube 링크 또는 자체 비디오 서버 *(Express + Docker)* |
| 배포 | Render *(정적 사이트)* |

---

## 📦 시작하기

Node.js는 Vite 8 실행 요건에 맞는 **20.x(20.19 이상) 또는 22.12 이상**을 사용하세요.

```bash
git clone https://github.com/m1njx/test-site.git
cd test-site
npm ci
cp .env.example .env    # 값을 채워주세요
npm run dev
```

> 💡 **Firebase 설정 없이도 실행됩니다.**
> 키가 없으면 브라우저 localStorage 를 쓰는 **Mock 모드**로 동작하므로,
> 계정 없이 전체 기능을 둘러볼 수 있습니다.

### 환경 변수

| 변수 | 설명 |
|---|---|
| `VITE_FIREBASE_*` | Firebase 설정 6종. `VITE_FIREBASE_API_KEY`가 비어 있으면 Mock 모드 |
| `VITE_GEMINI_API_KEY` | 개발 모드의 브라우저 직접 호출용 키. 운영 서버는 `GEMINI_API_KEY` 사용 |
| `VITE_GEMINI_MODELS` | 시도할 모델 목록(쉼표 구분). 생략 시 기본값 |
| `VITE_ADMIN_PASSWORD_HASH` | Mock 모드 관리자 게이트용 **SHA-256 해시** |
| `VITE_VIDEO_SERVER_URL` | 공식 채점·AI 프록시·mp4 업로드에 사용하는 서버 주소 |
| `VITE_VIDEO_UPLOAD_TOKEN` | 일부 AI 요청에서 사용하는 레거시 토큰. 관리자 업로드는 Firebase ID 토큰 또는 관리자 키로 인증 |

```bash
# 관리자 비밀번호 해시 만들기
printf '원하는비밀번호' | shasum -a 256
```

> ⚠️ `VITE_` 로 시작하는 값은 **모두 빌드 결과물에 포함되어 공개**됩니다.
> 서버 전용 `GEMINI_API_KEY`, `ADMIN_API_KEY`, 서비스 계정 자격 증명은 프론트엔드 환경 변수에 넣지 마세요.

### 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 + 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | ESLint |
| `npm test` | Node.js 기반 회귀·보안 테스트 |
| `npm run test:emulator` | Firestore 에뮬레이터에서 보안 규칙·트랜잭션 검증 |
| `npm run test:all` | 일반 테스트와 에뮬레이터 테스트 순차 실행 |

테스트를 실행하기 전에 서버 의존성도 설치하세요.

```bash
npm ci --prefix video-server
npm test
```

에뮬레이터 테스트는 `firebase` CLI와 Java 실행 환경이 필요하며,
`demo-aim-lms-gate` 프로젝트 ID와 로컬 `127.0.0.1:8088`을 사용합니다.

---

## 📁 프로젝트 구조

```
src/
├── App.tsx                 # 라우팅, 퀴즈 응시/채점 흐름
├── Admin.tsx               # 관리자 센터 (결과·통계·퀴즈·팀원·공지·코스·이수·부정행위)
├── Login.tsx               # 학번 → 비밀번호 / 최초 설정 3단계 로그인
├── session.ts              # Firebase Auth 세션, 학번↔이메일 매핑, 관리자 판정
├── api.ts                  # Firestore CRUD (+ Mock 모드)
├── gemini.ts               # AI 채점 · 해설 생성
├── ErrorBoundary.tsx       # 렌더 오류 복구 화면
└── lms/
    ├── types.ts            # 코스·레슨·진도·부정행위 타입
    ├── lmsApi.ts           # 코스/진도/로그 저장, 시청 구간 병합
    ├── VideoPlayer.tsx     # 안티스킵 플레이어 (HTML5 + YouTube IFrame)
    ├── useProctor.ts       # 부정행위 이벤트 수집 훅
    ├── ProctorShell.tsx    # 응시 화면 래퍼 (전체화면·경고)
    ├── CourseHome.tsx      # 코스 목록 + 진행률
    ├── CoursePlayer.tsx    # 코스 상세 (레슨 목록·잠금·이동)
    └── admin/              # 코스 빌더 · 이수 현황 · 부정행위 로그
video-server/               # 공식 채점·AI 프록시·mp4 서버 (Express + Docker)
tests/                      # 회귀·보안 테스트 및 Firestore 에뮬레이터 테스트
scripts/                    # 정답 마이그레이션 등 운영 도구
docs/                       # 설정·보안·점검 문서
firestore.rules             # Firestore 보안 규칙
```

---

## 🎥 영상 호스팅

**YouTube 미등록(unlisted) 링크** — 비용 0, 별도 인프라 불필요. 대부분의 경우 권장합니다.

**자체 mp4 호스팅** — 외부에 올릴 수 없는 강의용. `video-server/` 를 Docker 로 띄웁니다.
Range 스트리밍, 형식 화이트리스트, 토큰 인증, 레이트 리밋을 포함합니다.
설치·배포·비용 계산은 [video-server/README.md](video-server/README.md) 참고.

```bash
cd video-server && docker compose up -d --build
```

---

## 🚀 배포

Render 정적 사이트로 배포되며 GitHub push 시 자동 빌드됩니다.

| 설정 | 값 |
|---|---|
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |
| Environment | `.env` 와 동일한 값을 대시보드에 입력 |

배포 후 Firebase 콘솔 → Authentication → Settings → **승인된 도메인**에 배포 도메인을 추가하세요.
채점·비디오 서버는 상시 실행 프로세스라 **별도 배포**가 필요합니다.
Firebase를 사용하는 운영 빌드에서는 영상이 YouTube에 있어도 공식 채점 서버가 필요합니다.
프론트엔드의 `VITE_VIDEO_SERVER_URL`과 서버의 `FIREBASE_PROJECT_ID`, `GEMINI_API_KEY`,
Firestore 접근 자격 증명을 구성하세요. 서비스 계정은 서버의 `GOOGLE_APPLICATION_CREDENTIALS` 등으로 제공합니다.

---

## 📖 문서

| 문서 | 내용 |
|---|---|
| [AUTH-SETUP.md](docs/AUTH-SETUP.md) | Firebase Auth 설정 순서, 관리자 권한 부여, 트러블슈팅 |
| [SECURITY.md](docs/SECURITY.md) | 막히는 것 / 안 막히는 것, 규칙 배포, 남은 한계 |
| [GO-LIVE-CHECKLIST.md](docs/GO-LIVE-CHECKLIST.md) | 팀원에게 열기 전 점검 목록 |
| [video-server/README.md](video-server/README.md) | mp4 서버 설치·배포·비용 |

---

<div align="center">

Developed by **AIM TEAM** · Main Developer **강민제**

</div>
