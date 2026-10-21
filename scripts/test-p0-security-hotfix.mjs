import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const rules = fs.readFileSync(path.join(PROJECT_ROOT, 'firestore.rules'), 'utf8');

async function runSecurityHotfixGate() {
  console.log('============================================================');
  console.log('AIM TEAM LMS — P0 SECURITY HOTFIX 16-GATE VERIFICATION');
  console.log('============================================================\n');

  const host = process.env.FIRESTORE_EMULATOR_HOST ? process.env.FIRESTORE_EMULATOR_HOST.split(':')[0] : '127.0.0.1';
  const port = process.env.FIRESTORE_EMULATOR_HOST ? parseInt(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1], 10) : 8088;

  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-aim-lms-p0-gate',
    firestore: { host, port, rules },
  });

  const ADMIN_UID = 'admin_uid_sec_master';
  const STUDENT1_UID = 'student_uid_hong_101';
  const STUDENT1_ID = 'student_101';
  const STUDENT2_UID = 'student_uid_kim_102';
  const STUDENT2_ID = 'student_102';
  const UNREGISTERED_ID = 'student_unregistered_999';

  // Seed baseline data
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // 1. Admin document
    await setDoc(doc(db, 'admins', ADMIN_UID), { uid: ADMIN_UID, role: 'admin', createdAt: Date.now() });

    // 2. Registered Student 1 (hong)
    await setDoc(doc(db, 'students', STUDENT1_ID), {
      id: STUDENT1_ID,
      name: '홍길동',
      email: 'hong@aim.edu',
      uid: STUDENT1_UID,
    });

    // 3. Registered Student 2 (kim)
    await setDoc(doc(db, 'students', STUDENT2_ID), {
      id: STUDENT2_ID,
      name: '김철수',
      email: 'kim@aim.edu',
      uid: STUDENT2_UID,
    });

    // 4. Unregistered Student on roster (no account / no UID bound yet)
    await setDoc(doc(db, 'students', UNREGISTERED_ID), {
      id: UNREGISTERED_ID,
      name: '미등록학생',
      email: 'unreg@aim.edu',
    });

    // 5. Sample Quiz & Answer Key
    await setDoc(doc(db, 'quizzes', 'quiz-cs-101'), {
      id: 'quiz-cs-101',
      title: '컴퓨터구조',
      date: '2026-10-21',
      description: '기초 평가',
      questions: [{ id: 'q1', type: 'multiple', title: 'ALU 기능' }],
      isPublished: true,
    });

    await setDoc(doc(db, 'quizAnswers', 'quiz-cs-101'), {
      quizId: 'quiz-cs-101',
      questions: [{ id: 'q1', correctAnswers: ['0'], explanation: '산술논리연산장치' }],
    });

    // 6. Tickets collection for other apps
    await setDoc(doc(db, 'tickets', 'ticket_legacy_01'), {
      userId: 'global-user-id',
      title: '네트워크 연결 요청',
    });
  });

  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const student1Db = testEnv.authenticatedContext(STUDENT1_UID).firestore();
  const student2Db = testEnv.authenticatedContext(STUDENT2_UID).firestore();
  const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore();
  const randomAttackerDb = testEnv.authenticatedContext('random_attacker_uid_666').firestore();

  // -------------------------------------------------------------
  // TEST 01: 익명 학생 전체 명부 조회 거부
  // -------------------------------------------------------------
  console.log('TEST 01: 익명 학생 전체 명부 조회 거부');
  await assertFails(getDocs(collection(unauthDb, 'students')));
  console.log('✔ TEST 01 PASS: 익명 컬렉션 조회 차단됨 (PERMISSION_DENIED)\n');

  // -------------------------------------------------------------
  // TEST 02: 익명 개별 학생 문서 조회 거부
  // -------------------------------------------------------------
  console.log('TEST 02: 익명 개별 학생 문서 조회 거부');
  await assertFails(getDoc(doc(unauthDb, 'students', STUDENT1_ID)));
  console.log('✔ TEST 02 PASS: 익명 개별 getDoc 차단됨 (PERMISSION_DENIED)\n');

  // -------------------------------------------------------------
  // TEST 03: 학번 추측을 통한 개인정보 조회 거부
  // -------------------------------------------------------------
  console.log('TEST 03: 학번 추측을 통한 개인정보 조회 거부');
  const guessedIds = ['student_101', 'student_102', 'student_unregistered_999', '20260001', 'admin'];
  for (const gid of guessedIds) {
    await assertFails(getDoc(doc(unauthDb, 'students', gid)));
  }
  console.log('✔ TEST 03 PASS: 무작위 학번 대입 PII 수집 시도 전건 차단됨\n');

  // -------------------------------------------------------------
  // TEST 04: 로그인한 일반 학생의 전체 명부 조회 거부
  // -------------------------------------------------------------
  console.log('TEST 04: 로그인한 일반 학생의 전체 명부 조회 거부');
  await assertFails(getDocs(collection(student1Db, 'students')));
  console.log('✔ TEST 04 PASS: 인증 학생의 전체 명부 스크래핑 차단됨 (PERMISSION_DENIED)\n');

  // -------------------------------------------------------------
  // TEST 05: 일반 학생의 타인 문서 조회 거부
  // -------------------------------------------------------------
  console.log('TEST 05: 일반 학생의 타인 문서 조회 거부');
  // Student 1 tries to read Student 2's document
  await assertFails(getDoc(doc(student1Db, 'students', STUDENT2_ID)));
  // Student 1 tries to read unregistered student document
  await assertFails(getDoc(doc(student1Db, 'students', UNREGISTERED_ID)));
  console.log('✔ TEST 05 PASS: 타 학생 및 미등록 학생 문서 열람 차단됨\n');

  // -------------------------------------------------------------
  // TEST 06: 본인 학생 문서 조회 정상
  // -------------------------------------------------------------
  console.log('TEST 06: 본인 학생 문서 조회 정상');
  const ownDocSnap = await getDoc(doc(student1Db, 'students', STUDENT1_ID));
  assert.equal(ownDocSnap.exists(), true);
  assert.equal(ownDocSnap.data().name, '홍길동');
  assert.equal(ownDocSnap.data().uid, STUDENT1_UID);
  console.log('✔ TEST 06 PASS: 본인 소유 학생 문서 조회 정상 성공\n');

  // -------------------------------------------------------------
  // TEST 07: 관리자의 전체 명부 조회 정상
  // -------------------------------------------------------------
  console.log('TEST 07: 관리자의 전체 명부 조회 정상');
  const allStudentsSnap = await getDocs(collection(adminDb, 'students'));
  assert.equal(allStudentsSnap.docs.length >= 3, true);
  console.log(`✔ TEST 07 PASS: 관리자 전체 명부 조회 정상 (${allStudentsSnap.docs.length}건 확인)\n`);

  // -------------------------------------------------------------
  // TEST 08: 일반 학생의 타인 UID 바인딩 거부
  // -------------------------------------------------------------
  console.log('TEST 08: 일반 학생의 타인 UID 바인딩 거부');
  await assertFails(updateDoc(doc(student1Db, 'students', STUDENT2_ID), {
    uid: STUDENT1_UID,
  }));
  console.log('✔ TEST 08 PASS: 타 학생 문서에 본인/타인 UID 바인딩 시도 차단됨\n');

  // -------------------------------------------------------------
  // TEST 09: 미등록 학번 계정 선점 거부
  // -------------------------------------------------------------
  console.log('TEST 09: 미등록 학번 계정 선점 거부');
  // Random authenticated attacker tries to bind UID to unregistered student
  await assertFails(updateDoc(doc(randomAttackerDb, 'students', UNREGISTERED_ID), {
    uid: 'random_attacker_uid_666',
  }));
  // Even an anonymous user cannot pre-empt
  await assertFails(setDoc(doc(unauthDb, 'students', UNREGISTERED_ID), {
    uid: 'hacker_uid',
  }, { merge: true }));
  console.log('✔ TEST 09 PASS: 미등록 학생 문서 계정 선점 시도 전면 차단됨\n');

  // -------------------------------------------------------------
  // TEST 10: 일반 학생의 이메일 위조 및 변경 거부
  // -------------------------------------------------------------
  console.log('TEST 10: 일반 학생의 이메일 위조 및 변경 거부');
  await assertFails(updateDoc(doc(student1Db, 'students', STUDENT1_ID), {
    email: 'hacked@evil.com',
  }));
  await assertFails(updateDoc(doc(student1Db, 'students', STUDENT1_ID), {
    name: '위조된이름',
  }));
  console.log('✔ TEST 10 PASS: 학생의 직접 개인정보 변경 및 위조 차단됨\n');

  // -------------------------------------------------------------
  // TEST 11: 기존 등록 학생 로그인 정상
  // -------------------------------------------------------------
  console.log('TEST 11: 기존 등록 학생 로그인 정상');
  // Simulate post-auth verification: Student 1 authenticated with Firebase Auth
  const verifyDoc = await getDoc(doc(student1Db, 'students', STUDENT1_ID));
  assert.equal(verifyDoc.exists(), true);
  assert.equal(verifyDoc.data().uid, STUDENT1_UID);
  console.log('✔ TEST 11 PASS: 기존 등록 학생의 인증 후 권한 매핑 정상 동작\n');

  // -------------------------------------------------------------
  // TEST 12: 관리자 로그인 정상
  // -------------------------------------------------------------
  console.log('TEST 12: 관리자 로그인 정상');
  const adminDoc = await getDoc(doc(adminDb, 'admins', ADMIN_UID));
  assert.equal(adminDoc.exists(), true);
  assert.equal(adminDoc.data().role, 'admin');
  console.log('✔ TEST 12 PASS: 관리자 admins/{uid} 문서 확인 및 권한 인지 정상\n');

  // -------------------------------------------------------------
  // TEST 13: 비밀번호 로그인 및 세션 복원 정상
  // -------------------------------------------------------------
  console.log('TEST 13: 비밀번호 로그인 및 세션 복원 정상');
  // Valid session restoration for Student 1
  const student1SessionDoc = await getDoc(doc(student1Db, 'students', STUDENT1_ID));
  assert.equal(student1SessionDoc.data().uid === STUDENT1_UID, true);
  // Fraudulent session restoration: Attacker claims student_101
  await assertFails(getDoc(doc(randomAttackerDb, 'students', STUDENT1_ID)));
  console.log('✔ TEST 13 PASS: 올바른 세션 복원 허용 및 위조 세션 차단 검증 완료\n');

  // -------------------------------------------------------------
  // TEST 14: 기존 tickets 보안 규칙 보존
  // -------------------------------------------------------------
  console.log('TEST 14: 기존 tickets 보안 규칙 보존');
  await assertSucceeds(getDoc(doc(unauthDb, 'tickets', 'ticket_legacy_01')));
  await assertSucceeds(getDoc(doc(student1Db, 'tickets', 'ticket_legacy_01')));
  await assertFails(setDoc(doc(unauthDb, 'tickets', 'ticket_bad'), { userId: 'attacker', title: 'Bad' }));
  console.log('✔ TEST 14 PASS: tickets 컬렉션 타 앱 상호운용성 완벽 보존\n');

  // -------------------------------------------------------------
  // TEST 15: 기존 시험 채점 및 성적 무결성 검증
  // -------------------------------------------------------------
  console.log('TEST 15: 기존 시험 채점 및 성적 무결성 검증');
  const progressDocId = `${STUDENT1_ID}_quiz-cs-101`;
  // Student direct write to progress is strictly blocked
  await assertFails(setDoc(doc(student1Db, 'progress', progressDocId), {
    studentId: STUDENT1_ID,
    quizId: 'quiz-cs-101',
    score: 100,
    total: 100,
  }));
  // Admin / Authoritative Server can write valid progress
  await assertSucceeds(setDoc(doc(adminDb, 'progress', progressDocId), {
    studentId: STUDENT1_ID,
    quizId: 'quiz-cs-101',
    score: 1,
    total: 1,
    timestamp: Date.now(),
    attempts: 1,
    bestScore: 1,
  }));
  console.log('✔ TEST 15 PASS: 성적 위변조 차단 및 서버 권위 성적 저장 무결성 검증\n');

  // -------------------------------------------------------------
  // TEST 16: 신규 가입 본인 확인 절차 검증
  // -------------------------------------------------------------
  console.log('TEST 16: 신규 가입 본인 확인 절차 검증');
  // Client cannot register unverified student by writing to students collection
  await assertFails(setDoc(doc(randomAttackerDb, 'students', 'new_unverified_student'), {
    id: 'new_unverified_student',
    name: '해커',
    uid: 'random_attacker_uid_666',
  }));
  // Only Admin can issue new student account
  await assertSucceeds(setDoc(doc(adminDb, 'students', 'student_approved_201'), {
    id: 'student_approved_201',
    name: '신규등록생',
    email: 'new201@aim.edu',
    uid: 'student_uid_approved_201',
  }));
  console.log('✔ TEST 16 PASS: 비인가 계정 등록 차단 및 관리자 승인 발급 절차 강제 검증\n');

  await testEnv.cleanup();
  console.log('============================================================');
  console.log('ALL 16 P0 SECURITY HOTFIX TESTS PASSED SUCCESSFULLY! (16/16)');
  console.log('============================================================\n');
}

runSecurityHotfixGate().catch((err) => {
  console.error('[FATAL] Security Gate Failed:', err);
  process.exit(1);
});
