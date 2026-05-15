export type QuestionType = 'short' | 'multiple' | 'multiple-multi';

export interface Question {
  id: string;
  type: QuestionType;
  level?: 1 | 2;
  title: string;
  description?: string;
  options?: string[];
  correctAnswers: string[]; // Still used for multiple choice / fallback display
  explanation: string;
  
  // For execution-based grading (short answer)
  setupCode?: string;
  validationCode?: string;
}

export interface Quiz {
  id: string;
  date: string;
  title: string;
  description: string;
  questions: Question[];
}

const quiz1Questions: Question[] = [
  // Short Answer
  {
    id: 's1',
    type: 'short',
    level: 1,
    title: '리스트 a = [10, 20, 30]의 마지막에 40을 추가하고, 20과 30 사이에 25를 삽입하는 코드를 작성하세요.',
    description: '여러 줄 코드는 줄바꿈으로 작성해주세요.',
    correctAnswers: ['a.append(40)\\na.insert(2, 25)'],
    explanation: 'a.append(40)으로 마지막에 추가하고, a.insert(2, 25)로 인덱스 2에 삽입합니다.',
    setupCode: 'a = [10, 20, 30]',
    validationCode: 'a == [10, 20, 25, 30, 40]'
  },
  {
    id: 's2',
    type: 'short',
    level: 1,
    title: "문자열 path = 'C:\\\\Users\\\\Python\\\\main.py'에서 파일명인 'main.py'만 추출하는 코드를 작성하세요.",
    description: '단, 슬래시나 백슬래시의 위치가 변해도 작동해야 함',
    correctAnswers: ["path.split('\\\\')[-1]"],
    explanation: "path.split('\\\\')[-1] 또는 / 기준일 경우 /로 split하여 마지막 요소를 가져옵니다.",
    setupCode: "path = 'C:\\\\Users\\\\Python\\\\main.py'",
    validationCode: "_user_result == 'main.py' or locals().get('filename') == 'main.py' or locals().get('name') == 'main.py'"
  },
  {
    id: 's3',
    type: 'short',
    level: 1,
    title: '1부터 10까지의 숫자 중 홀수만 담긴 세트(set)를 생성하는 코드를 작성하세요.',
    correctAnswers: ['{i for i in range(1, 11) if i % 2 != 0}'],
    explanation: '세트 컴프리헨션 {i for i in range(1, 11) if i % 2 != 0} 또는 set(range(1, 11, 2))를 사용합니다.',
    setupCode: '',
    validationCode: '_user_result == {1, 3, 5, 7, 9}'
  },
  {
    id: 's4',
    type: 'short',
    level: 2,
    title: '2차원 리스트 data = [[1, 2], [3, 4], [5, 6]]를 1차원 리스트 [1, 2, 3, 4, 5, 6]으로 변환하는 리스트 표현식을 작성하세요.',
    correctAnswers: ['[val for row in data for val in row]'],
    explanation: '중첩 루프를 사용한 리스트 컴프리헨션 [val for row in data for val in row]를 작성합니다.',
    setupCode: 'data = [[1, 2], [3, 4], [5, 6]]',
    validationCode: '_user_result == [1, 2, 3, 4, 5, 6]'
  },
  {
    id: 's5',
    type: 'short',
    level: 2,
    title: "두 딕셔너리 dict1 = {'a': 1, 'b': 2}와 dict2 = {'c': 3, 'd': 4}를 합쳐서 하나의 딕셔너리로 만드는 코드를 작성하세요.",
    description: '중복 키는 없다고 가정합니다.',
    correctAnswers: ['dict1.update(dict2)'],
    explanation: 'dict1.update(dict2) 메서드를 사용하거나 {**dict1, **dict2} 언패킹을 사용합니다. 파이썬 3.9 이상에서는 dict1 | dict2 도 가능합니다.',
    setupCode: "dict1 = {'a': 1, 'b': 2}\ndict2 = {'c': 3, 'd': 4}",
    validationCode: "(_user_result == {'a': 1, 'b': 2, 'c': 3, 'd': 4}) or (dict1 == {'a': 1, 'b': 2, 'c': 3, 'd': 4})"
  },

  // Multiple Choice
  {
    id: 'm1',
    type: 'multiple',
    title: '리스트 a = [1, 2, 3]일 때 a.extend([4, 5])의 결과로 옳은 것은?',
    options: ['[1, 2, 3, [4, 5]]', '[1, 2, 3, 4, 5]', '[4, 5, 1, 2, 3]', '에러 발생'],
    correctAnswers: ['1'],
    explanation: 'extend는 리스트의 요소들을 풀어서 원본 리스트를 확장합니다.'
  },
  {
    id: 'm2',
    type: 'multiple',
    title: '튜플(Tuple)에 대한 설명 중 틀린 것은?',
    options: ['요소를 변경하거나 삭제할 수 없다.', '리스트보다 메모리 사용이 효율적이다.', '(1)은 튜플 자료형이다.', '함수의 리턴값으로 자주 사용된다.'],
    correctAnswers: ['2'],
    explanation: '요소가 하나인 튜플은 (1,) 처럼 콤마가 있어야 합니다. (1)은 그냥 정수 1입니다.'
  },
  {
    id: 'm3',
    type: 'multiple',
    title: '2차원 리스트 m = [[1, 2], [3, 4]]에서 숫자 4를 가져오는 인덱싱은?',
    options: ['m[1][1]', 'm[2][2]', 'm[0][1]', 'm[1][0]'],
    correctAnswers: ['0'],
    explanation: '인덱스는 0부터 시작하므로 두 번째 행의 두 번째 열은 m[1][1]입니다.'
  },
  {
    id: 'm4',
    type: 'multiple',
    title: '문자열 메서드 중 모든 문자를 소문자로 바꾸는 것은?',
    options: ['upper()', 'strip()', 'lower()', 'replace()'],
    correctAnswers: ['2'],
    explanation: 'lower()는 모든 문자를 소문자로 변환합니다.'
  },
  {
    id: 'm5',
    type: 'multiple',
    title: "'{0:<10}'.format('python')이 의미하는 것은?",
    options: ['오른쪽 정렬', '왼쪽 정렬', '가운데 정렬', '10자리 소수점 출력'],
    correctAnswers: ['1'],
    explanation: '<는 왼쪽 정렬을 의미합니다. >는 오른쪽 정렬입니다.'
  },
  {
    id: 'm6',
    type: 'multiple',
    title: '딕셔너리에서 키(Key)로 사용할 수 없는 자료형은?',
    options: ['문자열', '정수', '튜플', '리스트'],
    correctAnswers: ['3'],
    explanation: '리스트는 변경 가능한(mutable) 자료형이므로 해시(hash)가 불가능하여 딕셔너리의 키가 될 수 없습니다.'
  },
  {
    id: 'm7',
    type: 'multiple',
    title: "딕셔너리 d = {'name': 'James'}에서 존재하지 않는 키로 접근할 때 에러를 방지하며 값을 가져오는 메서드는?",
    options: ['pop()', 'get()', 'items()', 'keys()'],
    correctAnswers: ['1'],
    explanation: 'get() 메서드는 키가 존재하지 않으면 에러 대신 None을 반환합니다.'
  },
  {
    id: 'm8',
    type: 'multiple-multi',
    title: '세트(Set)의 특징으로 알맞은 것을 모두 고르면?',
    options: ['순서가 있다.', '중복을 허용하지 않는다.', '인덱스로 접근할 수 없다.', '수정이 불가능하다.'],
    correctAnswers: ['1', '2'],
    explanation: '세트는 순서가 없고(unordered) 중복을 허용하지 않으며, 인덱싱이 불가능합니다. 하지만 요소를 추가/삭제하는 수정은 가능합니다.'
  },
  {
    id: 'm9',
    type: 'multiple',
    title: 'a = [1, 2, 3]일 때 b = a를 한 뒤 a[0] = 100을 하면 b[0]의 값은?',
    options: ['1', '100', '에러 발생', '0'],
    correctAnswers: ['1'],
    explanation: '단순 할당(b = a)은 객체의 참조(주소)를 공유하므로 한쪽을 수정하면 다른 쪽도 같이 변경됩니다.'
  },
  {
    id: 'm10',
    type: 'multiple',
    title: '리스트 표현식 [i * 2 for i in range(3)]의 결과는?',
    options: ['[0, 2, 4]', '[2, 4, 6]', '[0, 1, 2]', '[0, 2, 4, 6]'],
    correctAnswers: ['0'],
    explanation: 'range(3)은 0, 1, 2를 생성하고, 각각에 2를 곱한 리스트 [0, 2, 4]가 됩니다.'
  }
];

export const quizzes: Quiz[] = [
  {
    id: 'q-2026-05-15',
    date: '2026-05-15',
    title: '자료구조 & 파이썬 기초 점검',
    description: 'Level 1~2 주관식 및 개념 확인 객관식 15문제',
    questions: quiz1Questions
  },
  {
    id: 'q-2026-05-22',
    date: '2026-05-22',
    title: '공개 예정',
    description: '공개 예정',
    questions: []
  }
];
