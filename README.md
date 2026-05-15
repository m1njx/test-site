# 🚀 학생 퀴즈 및 평가 플랫폼 (Quiz Platform)

학생들이 일일 퀴즈를 풀고 실시간으로 실력을 점검할 수 있는 React 기반의 고성능 교육용 플랫폼입니다. 파이썬 코드 채점 엔진(Pyodide)과 Firebase를 연동하여 강력한 관리 기능을 제공합니다.

## ✨ 주요 기능

### 👨‍🎓 학생용 기능
- **실시간 코드 채점**: Pyodide를 브라우저에서 실행하여 파이썬 코드를 즉시 평가 및 채점합니다.
- **다양한 문제 유형**: 객관식, 주관식(파이썬 코딩) 등 혼합형 퀴즈를 지원합니다.
- **개인별 진도 관리**: 로그인 유지 기능을 통해 자신의 퀴즈 완주율과 점수를 지속적으로 추적합니다.
- **직관적인 피드백**: 제출 후 문항별 정답 여부와 상세 해설을 즉시 확인할 수 있습니다.

### 👩‍🏫 관리자 전용 기능 (Admin Dashboard)
- **동적 퀴즈 생성기**: 코드 수정 없이 브라우저 상에서 즉시 새로운 퀴즈를 생성하고 배포할 수 있습니다.
- **퀴즈 관리**: 기존 퀴즈의 내용을 수정하거나 삭제할 수 있으며, 공개/비공개 상태를 설정하여 배포 시점을 조절할 수 있습니다.
- **대량 문제 추가 (Bulk Import)**: JSON 형식을 지원하여 수많은 문제를 한꺼번에 등록할 수 있습니다.
- **실시간 모니터링**: 팀원 전체의 제출 현황, 평균 점수, 문항별 정답률을 시각화된 대시보드로 확인합니다.

## 🛠 기술 스택

- **Frontend**: React (TypeScript), Vite, Framer Motion
- **Database**: Firebase Firestore
- **Engine**: Pyodide (WebAssembly-based Python)
- **Styling**: Vanilla CSS (Toss Style Design System)
- **Deployment**: Render

## 📦 설치 및 실행 방법

### 1. 저장소 클론 및 패키지 설치
```bash
git clone https://github.com/m1njx/test-site.git
cd test-site
npm install
```

### 2. 환경 변수 설정 (.env)
루트 디렉토리에 `.env` 파일을 생성하고 Firebase 정보를 입력하세요. (정보가 없으면 Mock 모드로 동작합니다.)
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 3. 개발 서버 실행
```bash
npm run dev
```

## 🚀 배포 및 자동화
이 프로젝트는 **Render**와 연동되어 GitHub Push 시 자동으로 빌드 및 배포됩니다.
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist`

---
Developed by **AIM TEAM** (Main Developer: 강민제)
