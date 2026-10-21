import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

let testEnv;

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  test('FIRESTORE RULES EMULATOR: skipped when FIRESTORE_EMULATOR_HOST is not set (run via npm run test:emulator)', (t) => {
    t.skip('Emulator host not configured. Use npm run test:emulator');
  });
} else {

// Test roles & UIDs
const ADMIN_UID = 'admin_user_001';
const STUDENT1_UID = 'student_uid_101';
const STUDENT1_ID = 'student_101';
const STUDENT2_UID = 'student_uid_102';
const STUDENT2_ID = 'student_102';

test.before(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST ? process.env.FIRESTORE_EMULATOR_HOST.split(':')[0] : '127.0.0.1';
  const port = process.env.FIRESTORE_EMULATOR_HOST ? parseInt(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1], 10) : 8088;

  testEnv = await initializeTestEnvironment({
    projectId: 'demo-aim-lms-rules',
    firestore: {
      host,
      port,
      rules: fs.readFileSync(path.join(PROJECT_ROOT, 'firestore.rules'), 'utf8'),
    },
  });

  // Pre-seed baseline documents with admin / bypass permissions
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // 1. Admin record
    await setDoc(doc(db, 'admins', ADMIN_UID), {
      uid: ADMIN_UID,
      role: 'admin',
      createdAt: Date.now(),
    });

    // 2. Student 1 directory record
    await setDoc(doc(db, 'students', STUDENT1_ID), {
      id: STUDENT1_ID,
      name: '김학생',
      uid: STUDENT1_UID,
      email: 'student1@aim.edu',
    });

    // 3. Student 2 directory record
    await setDoc(doc(db, 'students', STUDENT2_ID), {
      id: STUDENT2_ID,
      name: '이학생',
      uid: STUDENT2_UID,
      email: 'student2@aim.edu',
    });

    // 4. Sample quiz
    await setDoc(doc(db, 'quizzes', 'quiz-os-201'), {
      id: 'quiz-os-201',
      date: '2026-10-19',
      title: '운영체제 기말고사',
      description: '운영체제 공식 평가',
      questions: [
        { id: 'q1', title: '가상 메모리', type: 'multiple' },
      ],
      isPublished: true,
      maxAttempts: 3,
    });

    // 5. Separated quiz answer in quizAnswers
    await setDoc(doc(db, 'quizAnswers', 'quiz-os-201'), {
      quizId: 'quiz-os-201',
      updatedAt: Date.now(),
      questions: [
        { id: 'q1', type: 'multiple', correctAnswers: ['0'], explanation: '페이징 기법 해설' },
      ],
    });

    // 6. Existing progress for Student 1 and Student 2
    await setDoc(doc(db, 'progress', `${STUDENT1_ID}_quiz-os-201`), {
      studentId: STUDENT1_ID,
      quizId: 'quiz-os-201',
      score: 1,
      total: 1,
      timestamp: Date.now(),
      attempts: 1,
      bestScore: 1,
    });

    await setDoc(doc(db, 'progress', `${STUDENT2_ID}_quiz-os-201`), {
      studentId: STUDENT2_ID,
      quizId: 'quiz-os-201',
      score: 0,
      total: 1,
      timestamp: Date.now(),
      attempts: 1,
      bestScore: 0,
    });

    // 7. Proctor sessions
    await setDoc(doc(db, 'proctorSessions', 'session_student1'), {
      id: 'session_student1',
      studentId: STUDENT1_ID,
      quizId: 'quiz-os-201',
      startedAt: Date.now(),
      events: [],
      flagScore: 0,
      flagged: false,
      submitted: false,
    });

    await setDoc(doc(db, 'proctorSessions', 'session_student2'), {
      id: 'session_student2',
      studentId: STUDENT2_ID,
      quizId: 'quiz-os-201',
      startedAt: Date.now(),
      events: [],
      flagScore: 0,
      flagged: false,
      submitted: false,
    });

    // 8. Quiz attempts
    await setDoc(doc(db, 'quizAttempts', 'att_student1_001'), {
      attemptId: 'att_student1_001',
      studentId: STUDENT1_ID,
      quizId: 'quiz-os-201',
      status: 'COMPLETED',
      score: 1,
      total: 1,
      gradedAt: Date.now(),
    });

    await setDoc(doc(db, 'quizAttempts', 'att_student2_001'), {
      attemptId: 'att_student2_001',
      studentId: STUDENT2_ID,
      quizId: 'quiz-os-201',
      status: 'COMPLETED',
      score: 0,
      total: 1,
      gradedAt: Date.now(),
    });

    // 9. Preserved ticket for other apps
    await setDoc(doc(db, 'tickets', 'ticket_legacy_01'), {
      userId: 'global-user-id',
      title: 'IT Helpdesk Ticket',
      status: 'OPEN',
    });
  });
});

test.after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

// Helper contexts
function getUnauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function getStudent1Db() {
  return testEnv.authenticatedContext(STUDENT1_UID, { email: 'student1@aim.edu' }).firestore();
}

function getStudent2Db() {
  return testEnv.authenticatedContext(STUDENT2_UID, { email: 'student2@aim.edu' }).firestore();
}

function getAdminDb() {
  return testEnv.authenticatedContext(ADMIN_UID, { email: 'admin@aim.edu' }).firestore();
}

// ---------------------------------------------------------------------------
// 1. 학생의 quizAnswers 읽기 거부
// ---------------------------------------------------------------------------
test('RULE TEST 1: 학생의 quizAnswers 읽기 거부 (PERMISSION_DENIED)', async () => {
  const dbStudent = getStudent1Db();
  const dbUnauth = getUnauthDb();

  await assertFails(getDoc(doc(dbStudent, 'quizAnswers', 'quiz-os-201')));
  await assertFails(getDoc(doc(dbUnauth, 'quizAnswers', 'quiz-os-201')));
});

// ---------------------------------------------------------------------------
// 2. 학생의 quizAnswers 쓰기 거부
// ---------------------------------------------------------------------------
test('RULE TEST 2: 학생의 quizAnswers 쓰기 거부 (create/update/delete 차단)', async () => {
  const dbStudent = getStudent1Db();

  await assertFails(setDoc(doc(dbStudent, 'quizAnswers', 'quiz-os-201'), {
    quizId: 'quiz-os-201',
    updatedAt: Date.now(),
    questions: [],
  }));

  await assertFails(deleteDoc(doc(dbStudent, 'quizAnswers', 'quiz-os-201')));
});

// ---------------------------------------------------------------------------
// 3. 학생의 progress 생성 거부
// ---------------------------------------------------------------------------
test('RULE TEST 3: 학생의 progress 직접 생성 거부 (공식 성적 변조 차단)', async () => {
  const dbStudent = getStudent1Db();

  await assertFails(setDoc(doc(dbStudent, 'progress', `${STUDENT1_ID}_quiz-new`), {
    studentId: STUDENT1_ID,
    quizId: 'quiz-new',
    score: 100,
    total: 100,
    timestamp: Date.now(),
  }));
});

// ---------------------------------------------------------------------------
// 4. 학생의 progress 수정 거부
// ---------------------------------------------------------------------------
test('RULE TEST 4: 학생의 progress 수정 거부 (공식 성적 조작 원천 차단)', async () => {
  const dbStudent = getStudent1Db();

  await assertFails(updateDoc(doc(dbStudent, 'progress', `${STUDENT1_ID}_quiz-os-201`), {
    score: 100,
    bestScore: 100,
  }));
});

// ---------------------------------------------------------------------------
// 5. 학생의 quizAttempts 임의 생성 거부
// ---------------------------------------------------------------------------
test('RULE TEST 5: 학생의 quizAttempts 임의 생성 거부 (서버 권위 채점 강제)', async () => {
  const dbStudent = getStudent1Db();

  await assertFails(setDoc(doc(dbStudent, 'quizAttempts', 'att_forged_999'), {
    attemptId: 'att_forged_999',
    studentId: STUDENT1_ID,
    quizId: 'quiz-os-201',
    status: 'COMPLETED',
    score: 100,
    total: 100,
    gradedAt: Date.now(),
  }));
});

// ---------------------------------------------------------------------------
// 6. 다른 학생 결과 조회 거부
// ---------------------------------------------------------------------------
test('RULE TEST 6: 다른 학생 결과 조회 거부 (성적 및 응시 기록 격리)', async () => {
  const dbStudent1 = getStudent1Db();

  // Student 1 cannot read Student 2's progress
  await assertFails(getDoc(doc(dbStudent1, 'progress', `${STUDENT2_ID}_quiz-os-201`)));

  // Student 1 cannot read Student 2's attempt
  await assertFails(getDoc(doc(dbStudent1, 'quizAttempts', 'att_student2_001')));
});

// ---------------------------------------------------------------------------
// 7. 학생의 관리자 권한 획득 시도 차단
// ---------------------------------------------------------------------------
test('RULE TEST 7: 학생의 관리자 권한 획득 시도 차단 (admins 컬렉션 임의 쓰기 차단)', async () => {
  const dbStudent = getStudent1Db();

  // Try to insert own UID into admins collection
  await assertFails(setDoc(doc(dbStudent, 'admins', STUDENT1_UID), {
    uid: STUDENT1_UID,
    role: 'admin',
  }));

  // Try to overwrite existing admin
  await assertFails(updateDoc(doc(dbStudent, 'admins', ADMIN_UID), {
    role: 'revoked',
  }));
});

// ---------------------------------------------------------------------------
// 8. 정상 학생의 본인 학습 진도 저장 허용
// ---------------------------------------------------------------------------
test('RULE TEST 8: 정상 학생의 본인 학습 진도 저장 허용 (lessonProgress)', async () => {
  const dbStudent1 = getStudent1Db();
  const docId = `${STUDENT1_ID}_lesson_os_01`;

  // Student 1 can create own lesson progress
  await assertSucceeds(setDoc(doc(dbStudent1, 'lessonProgress', docId), {
    studentId: STUDENT1_ID,
    courseId: 'course_os',
    lessonId: 'lesson_os_01',
    kind: 'video',
    status: 'in_progress',
    watchedSec: 120,
    durationSec: 600,
    updatedAt: Date.now(),
  }));

  // Student 1 can update own lesson progress
  await assertSucceeds(updateDoc(doc(dbStudent1, 'lessonProgress', docId), {
    watchedSec: 300,
    updatedAt: Date.now(),
  }));

  // Student 1 cannot delete lesson progress
  await assertFails(deleteDoc(doc(dbStudent1, 'lessonProgress', docId)));
});

// ---------------------------------------------------------------------------
// 9. 부정행위 이벤트 정상 생성 허용
// ---------------------------------------------------------------------------
test('RULE TEST 9: 부정행위 이벤트 정상 생성 허용 (events 서브컬렉션)', async () => {
  const dbStudent1 = getStudent1Db();
  const sessionDocRef = doc(dbStudent1, 'proctorSessions', 'session_student1');

  // Student 1 creates event in own session
  await assertSucceeds(setDoc(doc(sessionDocRef, 'events', 'ev_blur_01'), {
    id: 'ev_blur_01',
    sessionId: 'session_student1',
    type: 'tab_switch',
    ts: Date.now(),
    detail: 'Window lost focus',
  }));
});

// ---------------------------------------------------------------------------
// 10. 부정행위 이벤트 수정 거부
// ---------------------------------------------------------------------------
test('RULE TEST 10: 부정행위 이벤트 수정 거부 (Audit Log 불변성 강제)', async () => {
  const dbStudent1 = getStudent1Db();
  const eventDocRef = doc(dbStudent1, 'proctorSessions', 'session_student1', 'events', 'ev_blur_01');

  await assertFails(updateDoc(eventDocRef, {
    detail: 'Altered record: normal behavior',
  }));
});

// ---------------------------------------------------------------------------
// 11. 부정행위 이벤트 삭제 거부
// ---------------------------------------------------------------------------
test('RULE TEST 11: 부정행위 이벤트 삭제 거부 (증거 인멸 방지)', async () => {
  const dbStudent1 = getStudent1Db();
  const eventDocRef = doc(dbStudent1, 'proctorSessions', 'session_student1', 'events', 'ev_blur_01');

  await assertFails(deleteDoc(eventDocRef));
});

// ---------------------------------------------------------------------------
// 12. 다른 학생 세션에 이벤트 생성 거부
// ---------------------------------------------------------------------------
test('RULE TEST 12: 다른 학생 세션에 이벤트 생성 거부 (세션 격리)', async () => {
  const dbStudent1 = getStudent1Db();
  const otherSessionDocRef = doc(dbStudent1, 'proctorSessions', 'session_student2');

  // Student 1 attempts to inject fraudulent cheating event into Student 2's session
  await assertFails(setDoc(doc(otherSessionDocRef, 'events', 'ev_fake_01'), {
    id: 'ev_fake_01',
    sessionId: 'session_student2',
    type: 'cheat_fake',
    ts: Date.now(),
    detail: 'Framing another student',
  }));
});

// ---------------------------------------------------------------------------
// 13. 관리자에게 필요한 정상 조회 허용
// ---------------------------------------------------------------------------
test('RULE TEST 13: 관리자에게 필요한 정상 조회 허용 (quizAnswers, progress, attempts)', async () => {
  const dbAdmin = getAdminDb();

  // Admin can read quizAnswers
  await assertSucceeds(getDoc(doc(dbAdmin, 'quizAnswers', 'quiz-os-201')));

  // Admin can read any student progress
  await assertSucceeds(getDoc(doc(dbAdmin, 'progress', `${STUDENT1_ID}_quiz-os-201`)));
  await assertSucceeds(getDoc(doc(dbAdmin, 'progress', `${STUDENT2_ID}_quiz-os-201`)));

  // Admin can read any student attempt
  await assertSucceeds(getDoc(doc(dbAdmin, 'quizAttempts', 'att_student1_001')));
  await assertSucceeds(getDoc(doc(dbAdmin, 'quizAttempts', 'att_student2_001')));
});

// ---------------------------------------------------------------------------
// 14. 기존 tickets 등 다른 앱의 규칙 보존
// ---------------------------------------------------------------------------
test('RULE TEST 14: 기존 tickets 등 다른 앱의 규칙 보존 (공유 프로젝트 호환성)', async () => {
  const dbStudent = getStudent1Db();
  const dbUnauth = getUnauthDb();

  // Authenticated user can read/write ticket
  await assertSucceeds(getDoc(doc(dbStudent, 'tickets', 'ticket_legacy_01')));

  // Unauthenticated can read if resource userId is global-user-id
  await assertSucceeds(getDoc(doc(dbUnauth, 'tickets', 'ticket_legacy_01')));

  // Unauthenticated writing without global-user-id is rejected
  await assertFails(setDoc(doc(dbUnauth, 'tickets', 'ticket_unauth_bad'), {
    userId: 'malicious-anon-id',
    title: 'Hack',
  }));
});
}
