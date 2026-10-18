export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  description: string;
  options?: string[];
  correctAnswers: string[];
  explanation: string;
  setupCode?: string;
  validationCode?: string;
  level?: number;
}

export type QuestionType = 'multiple' | 'multiple-multi' | 'short';

export interface Quiz {
  id: string;
  date: string;
  title: string;
  description: string;
  questions: Question[];
  isPublished?: boolean;
  visibleTo?: string[];
  timeLimit?: number; // 퀴즈 제한 시간 (분)
  shuffleQuestions?: boolean; // 문제 순서 셔플 여부
  maxAttempts?: number; // 최대 응시 가능 횟수
  deadline?: string; // 마감 기한 (ISO 문자열)
  proctoring?: 'off' | 'log' | 'strict'; // 부정행위 모니터링 수준 (기본: log)
}

/**
 * 학생 화면에 안전하게 전달되는 문제 타입 (정답, 해설, 검증 코드 마스킹)
 */
export type SanitizedQuestion = Omit<Question, 'correctAnswers' | 'explanation' | 'validationCode'>;

export interface SanitizedQuiz extends Omit<Quiz, 'questions'> {
  questions: SanitizedQuestion[];
}

/**
 * 별도 보호 컬렉션(quizAnswers)에 저장되는 정답 및 해설 데이터 스키마
 */
export interface QuizAnswerDocument {
  quizId: string;
  updatedAt: number;
  questions: Array<{
    id: string;
    correctAnswers: string[];
    explanation?: string;
    setupCode?: string;
    validationCode?: string;
  }>;
}

/**
 * 학생 응시 화면용 퀴즈 정제 함수
 * 브라우저 메모리 및 DevTools에서 정답과 해설, 파이썬 검증 코드를 탈취하지 못하도록 제거
 */
export function sanitizeQuizForStudent(quiz: Quiz): Quiz {
  return {
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
  };
}

export const quizzes: Quiz[] = [];

