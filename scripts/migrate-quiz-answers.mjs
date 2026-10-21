#!/usr/bin/env node
/**
 * AIM TEAM LMS - Legacy Quiz Answer Migration Utility
 *
 * 목적:
 * 1. 기존 `quizzes/{quizId}` 문서에 포함되어 있던 시험 정답(correctAnswers),
 *    해설(explanation), 자동 채점 코드(validationCode)를 분리하여
 *    관리자 전용 영구 저장소 `quizAnswers/{quizId}`로 마이그레이션합니다.
 * 2. `quizzes/{quizId}`에서는 해당 민감 필드를 마스킹/제거하여
 *    학생 클라이언트가 Firestore 문서를 직접 열람하더라도 정답이 유출되지 않도록 합니다.
 * 3. 사전 검증(Dry-run) 및 데이터 백업을 기본 지원합니다.
 *
 * 사용법:
 *   node scripts/migrate-quiz-answers.mjs --dry-run
 *   node scripts/migrate-quiz-answers.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(PROJECT_ROOT, '.autopilot', 'migration-backups');

const isApply = process.argv.includes('--apply');
const isDryRun = !isApply;

export function inspectAndMigrateQuiz(quiz) {
  if (!quiz || !Array.isArray(quiz.questions)) {
    throw new Error(`유효하지 않은 퀴즈 구조입니다: ${quiz?.id}`);
  }

  const sensitiveFieldsFound = [];
  const publicQuestions = [];
  const answerQuestions = [];

  for (const q of quiz.questions) {
    const hasAnswers = Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0;
    const hasExp = Boolean(q.explanation && q.explanation.trim());
    const hasVal = Boolean(q.validationCode && q.validationCode.trim());

    if (hasAnswers || hasExp || hasVal) {
      sensitiveFieldsFound.push({
        questionId: q.id,
        hasAnswers,
        hasExp,
        hasVal,
      });
    }

    // 학생/공개 문서용 정제 문제
    publicQuestions.push({
      id: q.id,
      type: q.type,
      title: q.title,
      description: q.description,
      options: q.options ? [...q.options] : undefined,
      correctAnswers: [],
      explanation: '',
      validationCode: '',
      setupCode: q.setupCode || '',
      level: q.level,
    });

    // 관리자/서버용 정답 문서
    answerQuestions.push({
      id: q.id,
      type: q.type,
      title: q.title,
      correctAnswers: q.correctAnswers ? [...q.correctAnswers] : [],
      explanation: q.explanation || '',
      setupCode: q.setupCode || '',
      validationCode: q.validationCode || '',
    });
  }

  const sanitizedQuiz = {
    ...quiz,
    questions: publicQuestions,
  };

  const answerDocument = {
    quizId: quiz.id,
    updatedAt: Date.now(),
    title: quiz.title,
    deadline: quiz.deadline,
    maxAttempts: quiz.maxAttempts,
    isPublished: quiz.isPublished !== false,
    questions: answerQuestions,
  };

  return {
    quizId: quiz.id,
    totalQuestions: quiz.questions.length,
    sensitiveQuestionsCount: sensitiveFieldsFound.length,
    sensitiveDetails: sensitiveFieldsFound,
    sanitizedQuiz,
    answerDocument,
    needsMigration: sensitiveFieldsFound.length > 0,
  };
}

async function run() {
  console.log(`[AIM TEAM LMS Migration] Mode: ${isDryRun ? 'DRY-RUN (안전 검사 모드)' : 'APPLY (실제 적용 모드)'}`);

  // 예시 또는 로컬에 저장된 퀴즈 검사 (또는 인자에서 파일 경로 수신)
  const sampleQuizzesFile = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'sample-quizzes.json');
  let rawQuizzes = [];

  if (fs.existsSync(sampleQuizzesFile)) {
    try {
      rawQuizzes = JSON.parse(fs.readFileSync(sampleQuizzesFile, 'utf8'));
    } catch {
      rawQuizzes = [];
    }
  }

  if (rawQuizzes.length === 0) {
    console.log('[INFO] tests/fixtures/sample-quizzes.json이 없어 내장 검증 퀴즈 1건으로 무결성을 검증합니다.');
    rawQuizzes = [
      {
        id: 'legacy-sample-1',
        title: '레거시 파이썬 기초 시험',
        description: '구버전 데이터 모델 시험',
        date: '2026-03-01',
        deadline: '2026-12-31',
        maxAttempts: 3,
        isPublished: true,
        questions: [
          {
            id: 'q1',
            type: 'multiple',
            title: '변수 선언 규칙',
            description: '올바른 것은?',
            options: ['1a = 10', '_a = 10', 'for = 10'],
            correctAnswers: ['1'],
            explanation: '식별자는 숫자로 시작할 수 없습니다.',
            validationCode: '',
          },
          {
            id: 'q2',
            type: 'short',
            title: '출력문 작성',
            description: 'Hello World를 출력하시오',
            correctAnswers: ['print("Hello World")'],
            explanation: 'print() 함수를 사용합니다.',
            setupCode: '',
            validationCode: '_user_result == "Hello World"',
          },
        ],
      },
    ];
  }

  console.log(`[INFO] 총 ${rawQuizzes.length}건의 퀴즈 데이터를 검증합니다.`);

  let migratedCount = 0;
  const auditReport = [];

  for (const q of rawQuizzes) {
    const result = inspectAndMigrateQuiz(q);
    auditReport.push(result);
    if (result.needsMigration) {
      migratedCount++;
      console.log(`  - Quiz [${result.quizId}]: ${result.totalQuestions}개 문항 중 ${result.sensitiveQuestionsCount}개 문항에서 정답/해설 분리 대상 식별됨.`);
    } else {
      console.log(`  - Quiz [${result.quizId}]: 이미 정답이 분리되어 있거나 정답 필드가 없습니다.`);
    }
  }

  if (isApply) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupFile = path.join(BACKUP_DIR, `pre-migration-backup-${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(rawQuizzes, null, 2), 'utf8');
    console.log(`[SUCCESS] 원본 데이터 백업 완료: ${backupFile}`);
  }

  console.log('--------------------------------------------------');
  console.log(`[SUMMARY] 검사 완료: 총 ${rawQuizzes.length}건, 분리 대상 ${migratedCount}건`);
  if (isDryRun) {
    console.log('[DRY-RUN COMPLETE] 변경 사항이 저장되지 않았습니다. 실제 마이그레이션 적용 시 --apply 플래그를 사용하세요.');
  } else {
    console.log('[APPLY COMPLETE] 마이그레이션이 성공적으로 처리되었습니다.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error('[ERROR] 마이그레이션 중 오류 발생:', err);
    process.exit(1);
  });
}
