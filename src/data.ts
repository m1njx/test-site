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
}

export const quizzes: Quiz[] = [
  {
    id: 'q-python-part1',
    date: '2026-05-22',
    title: 'Python 기초 문법 - PART 1 (객관식)',
    description: 'Python 리스트, 튜플, 문자열, 딕셔너리, 세트 기본 개념 이해',
    isPublished: true,
    questions: [
      {
        id: 'q1',
        type: 'multiple',
        title: '리스트의 가장 끝에 새로운 요소를 추가하는 메서드는?',
        description: '',
        options: ['insert()', 'append()', 'extend()', 'pop()'],
        correctAnswers: ['1'],
        explanation: 'append() 메서드는 리스트의 끝에 하나의 요소를 추가합니다.',
        level: 1
      },
      {
        id: 'q2',
        type: 'multiple',
        title: 'a = [10, 20, 30]일 때, a.pop()을 실행한 후 리스트 a의 모습은?',
        description: '',
        options: ['[10, 20]', '[20, 30]', '[10, 30]', '[10, 20, 30]'],
        correctAnswers: ['0'],
        explanation: 'pop() 메서드는 리스트의 마지막 요소(30)를 제거하고 반환하므로 [10, 20]이 남습니다.',
        level: 1
      },
      {
        id: 'q3',
        type: 'multiple',
        title: '리스트에서 특정 값의 인덱스(위치)를 찾는 메서드는?',
        description: '',
        options: ['find()', 'search()', 'index()', 'count()'],
        correctAnswers: ['2'],
        explanation: 'index() 메서드는 특정 값이 처음 나타나는 위치(인덱스)를 반환합니다.',
        level: 1
      },
      {
        id: 'q4',
        type: 'multiple',
        title: '리스트의 모든 요소를 삭제하여 빈 리스트로 만드는 것은?',
        description: '',
        options: ['remove()', 'delete()', 'clear()', 'discard()'],
        correctAnswers: ['2'],
        explanation: 'clear() 메서드는 리스트의 모든 요소를 삭제합니다.',
        level: 1
      },
      {
        id: 'q5',
        type: 'multiple',
        title: '다음 중 튜플(tuple)을 올바르게 생성한 것은?',
        description: '',
        options: ['t = [1, 2, 3]', 't = {1, 2, 3}', 't = (1, 2, 3)', 't = <1, 2, 3>'],
        correctAnswers: ['2'],
        explanation: '튜플은 괄호 ()를 사용하여 생성합니다.',
        level: 1
      },
      {
        id: 'q6',
        type: 'multiple',
        title: '리스트 [0, 1, 2]의 모든 요소를 문자열로 바꾸고 싶을 때 빈칸에 알맞은 것은? list(map(____, [0, 1, 2]))',
        description: '',
        options: ['int', 'str', 'float', 'list'],
        correctAnswers: ['1'],
        explanation: 'str 함수를 map() 함수와 함께 사용하여 모든 요소를 문자열로 변환할 수 있습니다.',
        level: 2
      },
      {
        id: 'q7',
        type: 'multiple',
        title: '2차원 리스트 m = [[1, 2], [3, 4]]에서 숫자 3을 가져오는 코드는?',
        description: '',
        options: ['m[0][0]', 'm[1][0]', 'm[0][1]', 'm[1][1]'],
        correctAnswers: ['1'],
        explanation: 'm[1][0]은 2번째 행의 1번째 요소인 3을 가져옵니다.',
        level: 2
      },
      {
        id: 'q8',
        type: 'multiple',
        title: "문자열 'python'.upper()의 결과는?",
        description: '',
        options: ['Python', 'pythoN', 'PYTHON', 'pYtHoN'],
        correctAnswers: ['2'],
        explanation: 'upper() 메서드는 문자열을 모두 대문자로 변환합니다.',
        level: 1
      },
      {
        id: 'q9',
        type: 'multiple',
        title: '문자열의 왼쪽과 오른쪽 공백을 모두 제거하는 메서드는?',
        description: '',
        options: ['lstrip()', 'rstrip()', 'strip()', 'split()'],
        correctAnswers: ['2'],
        explanation: 'strip() 메서드는 문자열의 양쪽 끝 공백을 모두 제거합니다.',
        level: 1
      },
      {
        id: 'q10',
        type: 'multiple',
        title: "'apple,banana,cherry'.split(',')의 결과는?",
        description: '',
        options: ["['apple', 'banana', 'cherry']", "('apple', 'banana', 'cherry')", "'applebananacherry'", "['apple,banana,cherry']"],
        correctAnswers: ['0'],
        explanation: "split() 메서드는 문자열을 구분자로 나누어 리스트로 반환합니다.",
        level: 1
      },
      {
        id: 'q11',
        type: 'multiple',
        title: '다음 중 f-string 포매팅 사용법이 올바른 것은? (name = \'Kim\')',
        description: '',
        options: ["f'Hello, name'", "f'Hello, {name}'", "f'Hello, (name)'", "f'Hello, [name]'"],
        correctAnswers: ['1'],
        explanation: "f-string에서 변수는 중괄호 {}로 감싸서 사용합니다.",
        level: 1
      },
      {
        id: 'q12',
        type: 'multiple',
        title: '딕셔너리에서 키(Key)와 값(Value)을 쌍으로 묶어서 꺼내오는 메서드는?',
        description: '',
        options: ['keys()', 'values()', 'items()', 'get()'],
        correctAnswers: ['2'],
        explanation: 'items() 메서드는 딕셔너리의 (키, 값) 쌍을 튜플로 반환합니다.',
        level: 1
      },
      {
        id: 'q13',
        type: 'multiple',
        title: "d = {'a': 10}일 때, 'a'라는 키가 있는지 확인하는 연산자는?",
        description: '',
        options: ['in', 'is', '==', 'exists'],
        correctAnswers: ['0'],
        explanation: "'in' 연산자를 사용하여 딕셔너리에 특정 키가 있는지 확인합니다.",
        level: 1
      },
      {
        id: 'q14',
        type: 'multiple',
        title: "딕셔너리 d = {'x': 100}에서 키 'x'의 값을 200으로 바꾸는 방법은?",
        description: '',
        options: ["d['x'] = 200", "d.set('x', 200)", "d.change('x', 200)", "d.replace('x', 200)"],
        correctAnswers: ['0'],
        explanation: "딕셔너리의 값을 변경하려면 d['x'] = 200처럼 직접 할당합니다.",
        level: 1
      },
      {
        id: 'q15',
        type: 'multiple',
        title: '세트(set)의 특징이 아닌 것은?',
        description: '',
        options: ['중복을 허용하지 않는다.', '순서가 없다.', '인덱스([0])로 접근할 수 있다.', '집합 연산이 가능하다.'],
        correctAnswers: ['2'],
        explanation: '세트는 인덱스로 접근할 수 없습니다. 순서가 없기 때문입니다.',
        level: 2
      },
      {
        id: 'q16',
        type: 'multiple',
        title: '다음 중 세트(set)를 만드는 기호는?',
        description: '',
        options: ['[]', '()', '{}', '<>'],
        correctAnswers: ['2'],
        explanation: '세트는 중괄호 {}를 사용하여 만듭니다. (빈 세트는 set())',
        level: 1
      },
      {
        id: 'q17',
        type: 'multiple',
        title: "두 세트의 공통된 요소만 뽑아내는 '교집합' 연산자는?",
        description: '',
        options: ['|', '&', '-', '^'],
        correctAnswers: ['1'],
        explanation: '& 연산자는 교집합(공통 요소)을 구합니다.',
        level: 2
      },
      {
        id: 'q18',
        type: 'multiple',
        title: '리스트 a = [1, 1, 2, 2, 3]에서 중복을 제거하고 싶을 때 가장 쉬운 방법은?',
        description: '',
        options: ['tuple(a)', 'set(a)', 'dict(a)', 'str(a)'],
        correctAnswers: ['1'],
        explanation: 'set(a)를 사용하면 중복된 요소를 자동으로 제거합니다.',
        level: 2
      },
      {
        id: 'q19',
        type: 'multiple',
        title: '리스트 표현식 [i for i in range(3)]의 결과는?',
        description: '',
        options: ['[1, 2, 3]', '[0, 1, 2]', '[0, 1, 2, 3]', '[3, 3, 3]'],
        correctAnswers: ['1'],
        explanation: 'range(3)은 0부터 2까지 생성합니다.',
        level: 2
      },
      {
        id: 'q20',
        type: 'multiple',
        title: 'a = [1, 2, 3]이고 b = a일 때, a를 수정하면 b도 변한다.',
        description: '참(O) 또는 거짓(X)을 선택하세요.',
        options: ['O (그렇다)', 'X (아니다)'],
        correctAnswers: ['0'],
        explanation: 'a = b는 같은 객체를 참조하므로 a를 수정하면 b도 함께 변합니다.',
        level: 2
      }
    ]
  },
  {
    id: 'q-python-part2',
    date: '2026-05-22',
    title: 'Python 기초 문법 - PART 2 (주관식)',
    description: 'Python 코드 작성 실습 문제',
    isPublished: true,
    questions: [
      {
        id: 'q21',
        type: 'short',
        title: '리스트 추가: colors = [\'red\', \'blue\'] 리스트 끝에 \'green\'을 추가하는 코드를 작성하세요.',
        description: '',
        correctAnswers: [],
        explanation: '정답: colors.append(\'green\') - append() 메서드로 리스트 끝에 요소를 추가합니다.',
        setupCode: "colors = ['red', 'blue']",
        validationCode: '',
        level: 1
      },
      {
        id: 'q22',
        type: 'short',
        title: '문자열 바꾸기: \'Hello World\'라는 문자열에서 \'World\'를 \'Python\'으로 바꾸는 코드를 작성하세요.',
        description: '',
        correctAnswers: [],
        explanation: "정답: 'Hello World'.replace('World', 'Python') - replace() 메서드로 문자열의 일부를 다른 문자열로 교체합니다.",
        level: 1
      },
      {
        id: 'q23',
        type: 'short',
        title: '딕셔너리 생성: 이름(name)은 \'Tom\', 나이(age)는 20인 딕셔너리 person을 만드세요.',
        description: '',
        correctAnswers: [],
        explanation: "정답: person = {'name': 'Tom', 'age': 20} 또는 person = dict(name='Tom', age=20)",
        level: 1
      },
      {
        id: 'q24',
        type: 'short',
        title: '세트 합집합: 세트 s1 = {1, 2}와 s2 = {2, 3}의 합집합을 구하는 코드를 작성하세요. (연산자 사용)',
        description: '',
        correctAnswers: [],
        explanation: '정답: s1 | s2 - | 연산자는 합집합을 구합니다. 또는 s1.union(s2)',
        setupCode: 's1 = {1, 2}\ns2 = {2, 3}',
        validationCode: '',
        level: 2
      },
      {
        id: 'q25',
        type: 'short',
        title: '간단한 반복: 리스트 nums = [1, 2, 3]의 모든 요소를 하나씩 출력하는 for문을 작성하세요.',
        description: '',
        correctAnswers: [],
        explanation: '정답: for num in nums: print(num) - for 루프로 리스트의 각 요소를 순회하며 출력합니다.',
        setupCode: 'nums = [1, 2, 3]',
        validationCode: '',
        level: 1
      }
    ]
  }
];
