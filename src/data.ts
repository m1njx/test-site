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
}

export const quizzes: Quiz[] = [];
