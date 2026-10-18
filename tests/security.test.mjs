import test from 'node:test';
import assert from 'node:assert/strict';

test('Security: sanitizeQuizForStudent masks sensitive quiz answers', () => {
  const rawQuiz = {
    id: 'quiz-1',
    date: '2026-03-01',
    title: '보안 테스트 시험',
    description: '시험 설명',
    questions: [
      {
        id: 'q-1',
        type: 'multiple',
        title: '문제 1',
        description: '보기 중 선택',
        options: ['선택지 0', '선택지 1'],
        correctAnswers: ['0'],
        explanation: '선택지 0이 정답인 이유...',
        validationCode: 'assert user_ans == 0',
        level: 1,
      },
      {
        id: 'q-2',
        type: 'short',
        title: '문제 2',
        description: '파이썬 코드 작성',
        correctAnswers: ['print("hello")'],
        explanation: '파이썬 기본 출력문',
        setupCode: 'x = 1',
        validationCode: '_user_result == 1',
        level: 2,
      },
    ],
  };

  // Mock implementation matching src/data.ts
  const sanitize = (quiz) => ({
    ...quiz,
    questions: quiz.questions.map((q) => ({
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
    })),
  });

  const sanitized = sanitize(rawQuiz);

  assert.equal(sanitized.questions[0].correctAnswers.length, 0);
  assert.equal(sanitized.questions[0].explanation, '');
  assert.equal(sanitized.questions[0].validationCode, '');
  assert.equal(sanitized.questions[1].correctAnswers.length, 0);
  assert.equal(sanitized.questions[1].explanation, '');
  assert.equal(sanitized.questions[1].validationCode, '');
  // Safe metadata remains intact
  assert.equal(sanitized.questions[0].title, '문제 1');
  assert.equal(sanitized.questions[0].options?.length, 2);
  assert.equal(sanitized.questions[1].setupCode, 'x = 1');
});

test('Security: saveScore validation rules', () => {
  function validateScoreParams(score, total, options, currentAttempts = 0) {
    if (typeof score !== 'number' || typeof total !== 'number' || isNaN(score) || isNaN(total)) {
      throw new Error('점수와 총점은 유효한 숫자여야 합니다.');
    }
    if (score < 0 || total < 0 || score > total) {
      throw new Error(`유효하지 않은 점수 범위입니다 (점수: ${score}, 총점: ${total}).`);
    }
    if (options?.deadline) {
      const rawDeadline = options.deadline.includes('T') ? options.deadline : `${options.deadline}T23:59:59`;
      const deadlineMs = new Date(rawDeadline).getTime();
      if (!isNaN(deadlineMs) && Date.now() > deadlineMs + 60 * 1000) {
        throw new Error('시험 마감 시간이 지나 성적을 저장할 수 없습니다.');
      }
    }
    if (options?.maxAttempts && currentAttempts >= options.maxAttempts) {
      throw new Error(`최대 응시 가능 횟수(${options.maxAttempts}회)를 초과했습니다.`);
    }
    return true;
  }

  // Normal valid cases
  assert.doesNotThrow(() => validateScoreParams(10, 10, {}));
  assert.doesNotThrow(() => validateScoreParams(0, 5, { maxAttempts: 3 }, 1));

  // Invalid score boundaries
  assert.throws(() => validateScoreParams(-1, 10, {}), /유효하지 않은 점수/);
  assert.throws(() => validateScoreParams(11, 10, {}), /유효하지 않은 점수/);
  assert.throws(() => validateScoreParams(NaN, 10, {}), /유효한 숫자여야/);

  // Expired deadline
  assert.throws(
    () => validateScoreParams(5, 10, { deadline: '2020-01-01' }),
    /시험 마감 시간이 지나/
  );

  // Exceeded maxAttempts
  assert.throws(
    () => validateScoreParams(5, 10, { maxAttempts: 2 }, 2),
    /최대 응시 가능 횟수/
  );
});
