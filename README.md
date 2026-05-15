# 🚀 학생 퀴즈 및 평가 플랫폼 (Quiz Platform)

학생들이 일일 퀴즈를 풀고 실시간으로 점수를 확인할 수 있는 React 기반의 교육용 플랫폼입니다. 파이썬 코드 채점 엔진(Pyodide)과 Firebase를 연동하여 강력한 기능을 제공합니다.

## ✨ 주요 기능

- **실시간 코드 채점**: Pyodide를 브라우저에서 실행하여 파이썬 코드를 즉시 평가합니다.
- **개인별 진도 관리**: 학생 ID로 로그인하여 자신의 퀴즈 완주율과 점수를 추적합니다.
- **관리자 대시보드**: 강사가 팀원 전체의 퀴즈 제출 현황과 평균 점수를 실시간으로 모니터링합니다.
- **반응형 UI**: 깔끔하고 직관적인 디자인으로 모바일과 데스크톱 모두에서 쾌적하게 사용 가능합니다.
- **방어적 코딩 적용**: 데이터 손실 방지 및 네트워크 예외 처리가 강화되어 있습니다.

## 🛠 기술 스택

- **Frontend**: React (TypeScript), Vite, Framer Motion
- **Database**: Firebase Firestore
- **Engine**: Pyodide (WebAssembly-based Python)
- **Styling**: Vanilla CSS (Custom Variable System)
- **Icons**: Lucide React

## 📦 설치 및 실행 방법

### 1. 저장소 클론

```bash
git clone https://github.com/m1njx/test-site.git
cd test-site
```

### 2. 패키지 설치

```bash
npm install
```

### 3. 환경 변수 설정 (.env)

루트 디렉토리에 `.env` 파일을 생성하고 Firebase 정보를 입력하세요. (정보가 없으면 Mock 모드로 동작합니다.)

```env
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. 개발 서버 실행

```bash
npm run dev
```

## 🚀 배포

이 프로젝트는 **Render**에 최적화되어 있습니다. `render.yaml` 파일을 포함하고 있어 별도의 설정 없이 바로 배포가 가능합니다.

---

Developed by **AIM TEAM**
