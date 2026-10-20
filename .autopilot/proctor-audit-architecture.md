# AIM TEAM LMS — Proctor Session Audit Log Security Architecture

본 문서는 AIM TEAM LMS의 부정행위 모니터링 로그(`proctorSessions`)의 무결성 검증, 공격 시나리오 분석 및 향후 Subcollection 전환 설계에 대한 공식 기술 보고서입니다.

---

## 1. 현행 단일 문서 배열(`events[]`) 및 `hasAll` 검증의 한계 분석

### 1.1 공격 시나리오별 방어 평가

| 공격 시나리오 | 현행 rules (`size >= ...`) | 권장 patch (`hasAll`) | 세부 취약점 및 평가 |
| :--- | :---: | :---: | :--- |
| **1. 기존 이벤트 삭제** | 차단 | 차단 | `size()` 감소 및 기존 요소 누락으로 거부됨 (PASS) |
| **2. 기존 이벤트 내용 수정** | **취약 (변조 가능)** | 차단 | 기존 객체와 불일치 시 `hasAll` 실패 (PASS) |
| **3. 기존 이벤트 순서 변경** | **취약 (순서 무시)** | **취약 (순서 무시)** | `hasAll`은 Set 포함 관계만 검사하므로 `[B, A]`가 `[A, B]`를 통과함 (FAIL) |
| **4. 동일 개수 허위 이벤트 대체** | **취약 (대체 가능)** | 차단 | 원본 이벤트 객체가 부재하므로 거부됨 (PASS) |
| **5. 이벤트 유지 후 허위 이벤트 추가** | **취약 (추가 가능)** | **취약 (추가 가능)** | 기존 이벤트를 유지한 채 조작된 이벤트를 덧붙이는 것 방어 불가 (PARTIAL) |
| **6. 이벤트 발생 시각(`ts`) 조작** | **취약 (조작 가능)** | **취약 (조작 가능)** | 클라이언트가 생성하는 `ts` 필드의 미래/과거 조작 방어 불가 (PARTIAL) |
| **7. 타 학생 세션에 이벤트 작성** | 차단 | 차단 | `ownsStudent(resource.data.studentId)`로 차단됨 (PASS) |
| **8. 이벤트 ID/키 중복** | 해당 없음 | 해당 없음 | 배열 요소 형태로 별도 식별자 없음 |
| **9. 로그 문서 전체 삭제** | 차단 | 차단 | `allow delete: if false;`로 완전 차단 (PASS) |
| **10. 직접 Firestore API 호출** | 규칙 통과 시 가능 | 규칙 통과 시 가능 | 브라우저 콘솔에서 `updateDoc` 직접 실행 가능 (PARTIAL) |

### 1.2 핵심 결론
`request.resource.data.events.hasAll(resource.data.events)`는 **기존 이벤트의 내용 변조 및 개수 축소 삭제를 차단하는 데는 매우 효과적**이지만, **이벤트 발생 순서 보장**, **허위 추가 이벤트의 타임스탬프 유효성 검증**, **1MB 문서 용량 한계**를 극복할 수 없습니다.

---

## 2. 권장 아키텍처: Subcollection 기반 불변 감사 로그

### 2.1 계층 구조
```
proctorSessions/{sessionId}                     ← 세션 메타데이터 (학번, 시험ID, 점수, 요약)
    ├── /events/{eventId}                       ← 개별 감사 이벤트 (불변 문서)
```

### 2.2 보안 규칙 설계 (`firestore.rules` 권장안)
```javascript
match /proctorSessions/{sessionId} {
  allow read: if isAdmin() || ownsStudent(resource.data.studentId);
  allow create: if ownsStudent(request.resource.data.studentId);
  // 세션 종료(제출) 시 관리자 또는 본인의 점수/종료시각 마킹만 허용, 삭제 불가
  allow update: if (isAdmin() || ownsStudent(resource.data.studentId))
                && request.resource.data.studentId == resource.data.studentId
                && request.resource.data.quizId == resource.data.quizId
                && request.resource.data.startedAt == resource.data.startedAt;
  allow delete: if false;

  // Subcollection: 불변 개별 이벤트 로그
  match /events/{eventId} {
    allow read: if isAdmin() || ownsStudent(get(/databases/$(database)/documents/proctorSessions/$(sessionId)).data.studentId);
    
    // 이벤트는 오직 생성만 허용, 생성 후 절대 수정 및 삭제 불가 (True Append-Only)
    allow create: if ownsStudent(get(/databases/$(database)/documents/proctorSessions/$(sessionId)).data.studentId)
                  && request.resource.data.keys().hasAll(['ts', 'type'])
                  && request.resource.data.ts is int
                  && request.resource.data.ts <= request.time.toMillis() + 5000 // 미래 시각 생성 차단
                  && request.resource.data.type in [
                    'quiz_start', 'quiz_submit', 'tab_hidden', 'tab_visible',
                    'window_blur', 'window_focus', 'fullscreen_enter', 'fullscreen_exit',
                    'copy', 'paste', 'cut', 'contextmenu', 'devtools_key', 'printscreen_key', 'reload_attempt'
                  ];
    allow update, delete: if false; // 변조 및 삭제 원천 차단
  }
}
```

### 2.3 Subcollection의 기술적 장점
1. **문서 크기 제한(1MB) 완전 해소**: 응시 시간이 길어지거나 이벤트가 수천 건 발생해도 1MB 제한에 걸리지 않음.
2. **동시성 충돌(Contention) 제거**: 배열 `arrayUnion`은 동시 업데이트 시 문서 락 및 경쟁 상태를 유발할 수 있으나, 독립 문서는 완전 병렬 생성이 가능함.
3. **엄격한 불변성**: `allow update, delete: if false;`로 각 이벤트의 불변성이 Firestore 엔진 레벨에서 100% 보장됨.

---

## 3. 클라이언트 원격 감시의 본질적 한계 (Non-repudiation)

1. **클라이언트 런타임의 신뢰성 한계**:
   브라우저의 `visibilitychange`, `blur`, `focus` 등 이벤트는 전적으로 클라이언트 OS와 브라우저가 생성합니다. 학생이 특수하게 개조된 브라우저(Headless Chrome, DevTools 프로토콜 차단 브라우저)를 사용하거나 가상 머신(VM) 외부에서 다른 기기로 검색하는 행위는 클라이언트 스크립트만으로 100% 탐지할 수 없습니다.
2. **다층 방어(Defense-in-Depth) 전략**:
   - 1계층: 클라이언트 Proctor 모니터링 (우발적 이탈 억제 및 감사 증적 확보)
   - 2계층: 서버 권위 채점 및 정답 은닉 (클라이언트 시험 정답 사전 유출 차단)
   - 3계층: 시험 시간 제한, 문제 셔플링, AI 유연 채점 (단순 검색 방지)

---

## 4. 하위 호환성 및 운영 전환 전략

1. 관리자 화면(`Admin.tsx`)은 수백 건의 세션 목록을 빠르게 조회해야 하므로, 개별 서브컬렉션을 모두 조회하지 않고 루트 세션 문서의 `flagScore`, `flagged`, `eventCount`, `lastEventType`을 캐시 필드로 유지합니다.
2. 상세 감사 팝업을 클릭했을 때만 해당 세션의 `/events` 서브컬렉션을 비동기로 로드하여 성능과 비용을 최적화합니다.
