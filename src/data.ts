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
    id: 'python-basic-concepts',
    date: '2026-05-29',
    title: '파이썬 기초 및 핵심 문법 평가',
    description: '파일 I/O, 함수와 매개변수, 가변 인수, 재귀 호출, 람다식, 클로저 등을 점검합니다.',
    isPublished: true,
    questions: [
      {
        id: 'q1',
        type: 'multiple',
        title: '1. 파일을 쓰기 모드(write)로 열기 위한 올바른 코드는?',
        description: '파이썬에서 파일을 열 때 목적에 맞는 모드를 선택해야 합니다. 쓰기용 파일 객체를 올바르게 만드는 코드를 고르세요.',
        options: [
          "file = open('hello.txt', 'r')",
          "file = open('hello.txt', 'w')",
          "file = open('hello.txt', 'a')",
          "file = open('hello.txt', 'b')"
        ],
        correctAnswers: ['1'],
        explanation: "'w' 모드는 파일을 쓰기(write) 모드로 엽니다. 파일이 존재하지 않으면 새로 생성하고, 이미 존재하면 기존 내용을 지우고 새로 덮어씁니다. 참고로 'r'은 읽기(read) 모드, 'a'는 기존 내용 뒤에 추가(append) 모드입니다."
      },
      {
        id: 'q2',
        type: 'multiple',
        title: "2. with open('test.txt', 'r') as file: 문법을 사용하는 가장 큰 이유는?",
        description: '파이썬 파일 입출력에서 with 블록(Context Manager)을 자주 활용합니다. 이 문법을 사용하는 주요 목적은 무엇일까요?',
        options: [
          '파일 속도가 빨라져서',
          '파일을 자동으로 닫아주기(close) 위해서',
          '파일 내용을 암호화하기 위해서',
          '파일 쓰기만 가능하게 하려고'
        ],
        correctAnswers: ['1'],
        explanation: "with 문을 사용하면 블록 실행이 끝나거나 내부에서 예외가 발생하더라도 파이썬이 자동으로 file.close()를 호출하여 파일을 안전하게 닫아줍니다. 개발자가 close() 호출을 깜빡하여 시스템 자원이 낭비되는 것을 방지합니다."
      },
      {
        id: 'q3',
        type: 'multiple',
        title: '3. 문자열에서 2-gram(2글자씩 출력)을 만드는 올바른 방법은?',
        description: '임의의 문자열 text가 있을 때, 두 글자씩 쌍을 지어 출력하는 반복문 범위를 골라보세요.',
        options: [
          'for i in range(len(text)): print(text[i:i+2])',
          'for i in range(len(text) - 1): print(text[i:i+2])',
          'for i in range(len(text) + 1): print(text[i:i+2])',
          'text.split(2)'
        ],
        correctAnswers: ['1'],
        explanation: "2-gram(두 글자 단위 추출)은 text[i:i+2]로 가져올 수 있습니다. 이때 마지막에 2글자를 정상적으로 가져오기 위해서는 반복문의 마지막 인덱스 i가 len(text) - 2 여야 하므로, range의 끝 범위는 len(text) - 1이 되어야 에러나 빈 문자열 없이 깔끔하게 동작합니다."
      },
      {
        id: 'q4',
        type: 'multiple',
        title: '4. 두 수를 더해서 결과를 반환하는 올바른 함수 정의는?',
        description: '매개변수 a와 b를 입력받아 두 수의 합을 계산하여 반환하는 파이썬 함수 형식을 선택하세요.',
        options: [
          'def add(a, b): print(a + b)',
          'def add(a, b): return a + b',
          'add(a, b): return a + b',
          'def add(a, b) return a + b'
        ],
        correctAnswers: ['1'],
        explanation: '파이썬 함수는 def 키워드로 정의하고 매개변수 목록 괄호 뒤에 콜론(:)을 붙여 블록을 시작합니다. 결과를 외부로 전달하여 변수에 담거나 활용하려면 print가 아닌 return 문을 사용해야 합니다.'
      },
      {
        id: 'q5',
        type: 'multiple',
        title: '5. 함수에서 값을 여러 개 반환하면 어떤 자료형으로 반환될까요?',
        description: "예: 'return a, b, c' 처럼 리턴값들을 쉼표로 나열하여 한 번에 여러 개의 값을 던졌을 때의 파이썬 객체 구조입니다.",
        options: [
          '리스트(List)',
          '딕셔너리(Dict)',
          '튜플(Tuple)',
          '세트(Set)'
        ],
        correctAnswers: ['2'],
        explanation: '파이썬에서 여러 값을 쉼표로 묶어 return하면, 파이썬 인터프리터가 자동으로 값들을 묶어서 튜플(Tuple) 객체로 만들어 반환합니다. 이를 튜플 패킹(Packing)이라고 합니다.'
      },
      {
        id: 'q6',
        type: 'multiple',
        title: "6. print(10, 20, sep='-')를 실행했을 때 결과는?",
        description: 'print 함수 내부 인자들 중 sep 옵션을 사용할 때 화면에 어떻게 출력되는지 골라보세요.',
        options: [
          '10 20 -',
          '1020-',
          '10-20',
          '(10, 20)'
        ],
        correctAnswers: ['2'],
        explanation: "sep 인자는 'separator'의 약자로, print로 여러 개의 값을 연속으로 출력할 때 값들 사이에 끼워 넣을 구분 문자를 지정합니다. 따라서 10과 20 사이에 하이픈이 삽입되어 '10-20'이 출력됩니다."
      },
      {
        id: 'q7',
        type: 'multiple',
        title: '7. 리스트 x = [1, 2, 3]을 함수 func(*x)처럼 넣는 것을 무엇이라 하나요?',
        description: '리스트 내부에 들어있는 요소들을 낱개로 풀어내어 각각의 개별 위치 인수로 전달하는 연산을 고르세요.',
        options: [
          '리스트 패킹',
          '리스트 언패킹',
          '리스트 슬라이싱',
          '리스트 맵핑'
        ],
        correctAnswers: ['1'],
        explanation: "리스트나 튜플 앞에 별표(*)를 붙여 함수의 인수로 넘기면, 해당 컨테이너 내부의 요소들이 순서대로 풀어져서 각 매개변수로 하나씩 대입됩니다. 이 작업을 '위치 인수 언패킹(Unpacking)'이라고 합니다."
      },
      {
        id: 'q8',
        type: 'multiple',
        title: "8. 키워드 인수 사용이 올바른 것은? (함수: def greet(name, age):)",
        description: '파이썬에서 인수 이름을 지정하여 값을 매칭시키는 방식 중 문법 오류가 없는 올바른 형태를 고르세요.',
        options: [
          "greet(age=20, 'Tom')",
          "greet(name='Tom', 20)",
          "greet(age=20, name='Tom')",
          "greet('Tom', name='Tom')"
        ],
        correctAnswers: ['2'],
        explanation: '파이썬 문법 상 키워드 인수(age=20 등)는 반드시 위치 인수보다 항상 뒤쪽에 나와야 합니다. 또한 매개변수 name에 이미 키워드로 중복 할당하지 않으면서 모든 변수가 1번씩 정상 대입되는 greet(age=20, name=\'Tom\')이 문법상 완벽하게 일치합니다.'
      },
      {
        id: 'q9',
        type: 'multiple',
        title: '9. 매개변수에 초깃값을 설정하는 올바른 방법은?',
        description: '함수 선언 시 인수 기본값(Default Value)을 정해두는 올바른 꼴과 주의해야 할 배치 순서를 고르세요.',
        options: [
          'def func(a=10, b):',
          'def func(a, b=10):',
          'def func(a=10, b=20)',
          'def func(=10, =20):'
        ],
        correctAnswers: ['1'],
        explanation: '초깃값(디폴트 값)을 지정한 매개변수는 초깃값이 없는 일반 매개변수보다 항상 오른쪽에 몰아서 위치시켜야 합니다. 그렇지 않으면 어떤 순서로 값이 할당되어야 하는지 모호해지므로 컴파일(구문) 에러가 발생합니다.'
      },
      {
        id: 'q10',
        type: 'multiple',
        title: "10. 인수의 개수가 정해지지 않은 '가변 인수'를 만드는 매개변수 형태는?",
        description: '몇 개의 입력값(위치 인수)이 들어올지 모르는 상태에서 가변적인 개수의 인수를 처리하기 위해 선언해야 할 형태를 고르세요.',
        options: [
          'def func(args):',
          'def func(*args):',
          'def func(**args):',
          'def func(args*):'
        ],
        correctAnswers: ['1'],
        explanation: "매개변수명 앞에 하나의 별표(*)를 붙이면 가변 인수(Varargs)가 됩니다. 전달된 위치 인수들이 튜플(tuple) 형태로 묶여 해당 변수에 저장됩니다."
      },
      {
        id: 'q11',
        type: 'multiple',
        title: '11. 키워드 인수를 딕셔너리 형태로 한꺼번에 받는 매개변수는?',
        description: '함수에 임의 개수의 키워드 인수(예: a=1, b=2)가 들어올 때, 이를 받아 딕셔너리로 관리하는 특수 매개변수 표기를 고르세요.',
        options: [
          '*args',
          '&kwargs',
          '**kwargs',
          '*kwargs*'
        ],
        correctAnswers: ['2'],
        explanation: "매개변수 앞에 두 개의 별표(**)를 붙이면 가변 키워드 인수(Keyword Varargs)로 선언됩니다. 호출할 때 명시한 키워드 인수들이 사전(dict) 형태로 묶여 전달됩니다."
      },
      {
        id: 'q12',
        type: 'multiple',
        title: '12. 재귀 호출 함수에서 반드시 포함되어야 하는 조건은?',
        description: '함수 내에서 자기 자신을 다시 호출하는 재귀 함수(Recursive Function)를 작성할 때 무한 루프 예방을 위해 꼭 갖춰야 할 논리를 고르세요.',
        options: [
          'for문',
          'while문',
          '종료 조건(Base Case)',
          'global 선언'
        ],
        correctAnswers: ['2'],
        explanation: '재귀 호출은 스택(Stack) 메모리를 소모하며 진행됩니다. 특정 시점에 더 이상 자기 자신을 호출하지 않고 복귀할 수 있는 종료 조건(Base Case)이 반드시 있어야 호출 스택이 무한히 쌓여 프로그램이 강제 종료(RecursionError)되는 것을 막을 수 있습니다.'
      },
      {
        id: 'q13',
        type: 'multiple',
        title: '13. 재귀 함수 f(n)에 f(3)을 넣었을 때 호출 횟수는? (종료 조건 제외)',
        description: '아래 재귀 알고리즘 f(n)에서 n이 3으로 들어올 때, 종료 조건(Base Case)에 다다르기 직전까지 f가 실제로 실행/호출된 횟수를 찾으세요.\n\ndef f(n):\n    if n == 0: return\n    print(n)\n    f(n-1)',
        options: [
          '1번',
          '2번',
          '3번',
          '4번'
        ],
        correctAnswers: ['2'],
        explanation: 'f(3)이 호출되면 다음과 같이 순서대로 호출됩니다: 1. f(3) 실행 (f(2) 호출) -> 2. f(2) 실행 (f(1) 호출) -> 3. f(1) 실행 (f(0) 호출). 총 3회 호출되며, f(0)은 종료 조건이므로 이를 제외하면 호출은 딱 3번 일어납니다.'
      },
      {
        id: 'q14',
        type: 'multiple',
        title: '14. lambda를 사용해 두 수를 더하는 올바른 코드는?',
        description: '익명 함수(lambda expression)를 작성하여 입력 a, b의 덧셈 결과를 리턴해주는 문법에 부합하는 코드를 고르세요.',
        options: [
          'lambda a, b: return a + b',
          'lambda a, b: a + b',
          'def lambda a, b: a + b',
          'lambda(a, b) = a + b'
        ],
        correctAnswers: ['1'],
        explanation: '람다(lambda) 표현식은 문법 특성상 내부에 식(Expression)만 포함할 수 있으며, 이 식의 최종 연산 결과가 자동으로 반환됩니다. 따라서 별도의 return 키워드를 쓸 수 없고 써서도 안 됩니다.'
      },
      {
        id: 'q15',
        type: 'multiple',
        title: '15. list(map(lambda x: x * 2, [1, 2, 3]))의 결과는?',
        description: 'map 함수와 람다를 활용해 리스트 [1, 2, 3]의 각 항을 가공하고 이를 리스트로 재변환한 계산 결과를 예측해보세요.',
        options: [
          '[1, 2, 3]',
          '[1, 4, 9]',
          '[2, 4, 6]',
          '[2, 2, 2]'
        ],
        correctAnswers: ['2'],
        explanation: 'map 함수는 두 번째 인자로 전달받은 반복가능객체([1, 2, 3]) 내의 각 아이템들을 하나씩 람다 함수(x: x * 2)의 x에 전달하여 가공합니다. 1*2, 2*2, 3*2가 차례대로 매핑되어 최종적으로 [2, 4, 6] 리스트가 만들어집니다.'
      },
      {
        id: 'q16',
        type: 'multiple',
        title: '16. 람다 표현식 안에서 if를 사용할 때 올바른 형식은?',
        description: '람다 함수 내부에서 조건에 따른 동적 분기를 하려고 할 때의 3항 표현식 구조를 골라보세요.',
        options: [
          'lambda x: x if x > 0',
          'lambda x: x if x > 0 else 0',
          'lambda x: if x > 0: x else: 0',
          'lambda x: x > 0 ? x : 0'
        ],
        correctAnswers: ['1'],
        explanation: '람다 내부의 조건식은 파이썬 조건부 표현식(Conditional Expression)을 따릅니다. 형식은 [참일때_값] if [조건식] else [거짓일때_값] 입니다. 람다 내에서는 else 문을 생략할 수 없어 반드시 else 뒤의 기본값을 서술해야 합니다.'
      },
      {
        id: 'q17',
        type: 'multiple',
        title: '17. 리스트 a = [1, 2, 3, 4]에서 짝수만 걸러내고(filter) 싶을 때 올바른 코드는?',
        description: 'filter 내장 함수를 써서 리스트에서 특정 참(True)/거짓(False) 조건을 통과한 요소만 남기는 정밀 필터링 코드를 골라보세요.',
        options: [
          'filter(lambda x: x % 2 == 0, a)',
          'filter(lambda x: x / 2, a)',
          'map(lambda x: x % 2 == 0, a)',
          'reduce(lambda x: x % 2 == 0, a)'
        ],
        correctAnswers: ['0'],
        explanation: 'filter(판별_함수, 대상_리스트) 함수는 리스트의 각 값에 대해 판별 함수의 반환값이 참(True)인 요소만 걸러냅니다. lambda x: x % 2 == 0은 x를 2로 나눈 나머지가 0인 짝수일 때만 참을 반환하여 정상적으로 짝수 리스트를 만들어 줍니다.'
      },
      {
        id: 'q18',
        type: 'multiple',
        title: '18. 함수 안에서 전역 변수의 값을 수정하고 싶을 때 사용하는 키워드는?',
        description: '함수 블록 바깥에 전역 범위로 선언되어 있는 전역 변수의 값을 함수 안에서 직접 수정(재할당)하기 위한 지시어를 고르세요.',
        options: [
          'local',
          'nonlocal',
          'global',
          'public'
        ],
        correctAnswers: ['2'],
        explanation: '함수 내부에서 스코프 바깥에 존재하는 전역(글로벌) 변수를 읽는 것은 가능하지만, 새로운 값을 덮어쓰거나 할당하려고 하면 에러가 나거나 로컬 변수가 새로 정의됩니다. 이를 온전히 전역 변수의 값 수정으로 연결시키려면 global 키워드로 그 변수를 명시해 주어야 합니다.'
      },
      {
        id: 'q19',
        type: 'multiple',
        title: '19. 중첩 함수 안에서 바깥쪽 함수의 지역 변수를 수정할 때 사용하는 키워드는?',
        description: '중첩된 구조의 함수(바깥 함수 안의 내부 함수)에서 바깥쪽 함수의 스코프 영역의 지역 변수를 수정하기 위해 매칭시키는 특수한 키워드를 고르세요.',
        options: [
          'local',
          'nonlocal',
          'global',
          'outer'
        ],
        correctAnswers: ['1'],
        explanation: '클로저나 중첩 함수를 구현할 때 내부 함수에서 바깥쪽 영역 함수의 지역 변수(전역 변수가 아닌 변수)를 재할당하여 상태를 업데이트하고자 할 때 nonlocal 키워드를 선언해주어야 정상 동기화가 이루어집니다.'
      },
      {
        id: 'q20',
        type: 'multiple',
        title: '20. 클로저(Closure)에 대한 설명으로 옳은 것은?',
        description: '파이썬의 고급 스코프 개념 중 하나인 클로저(Closure)의 성질과 특징을 서술한 보기를 선택하세요.',
        options: [
          '함수가 끝난 뒤에도 지역 변수를 기억하는 함수',
          '프로그램이 종료될 때까지 살아있는 변수',
          '함수 안에서 자기 자신을 호출하는 것',
          '한 줄로 끝내는 익명 함수'
        ],
        correctAnswers: ['0'],
        explanation: '클로저는 내부 함수가 자신이 태어났을 때 바깥 함수의 지역 변수를 레퍼런스로 가지고 있으며, 바깥 함수의 생명 주기가 끝난 이후에도 그 바깥 환경(자유 변수)을 유지하고 상태를 관리해 주는 특수 함수입니다.'
      },
      {
        id: 'q21',
        type: 'multiple',
        title: "21. 다음 중 '팩토리얼(5!)'을 구하는 올바른 재귀 호출 코드는?",
        description: 'n의 팩토리얼(n!)을 재귀적인 정밀 수학식과 Base Case를 잘 결합해 구현한 코드를 고르세요.',
        options: [
          'def fact(n): return n + fact(n-1)',
          'def fact(n): return n * fact(n-1) (단, n=1일 때 종료)',
          'def fact(n): return fact(n-1)',
          'def fact(n): print(n * (n-1))'
        ],
        correctAnswers: ['1'],
        explanation: '팩토리얼 n! 은 n * (n-1) * (n-2)... 즉, n * (n-1)! 입니다. 따라서 재귀 함수의 n * fact(n-1) 호출 꼴로 문제를 풀 수 있으며, 1! 은 1로 수렴하므로 n == 1 혹은 n == 0이 되었을 때 return 1 을 하며 중단하는 구조가 올바른 팩토리얼 계산식입니다.'
      },
      {
        id: 'q22',
        type: 'multiple',
        title: '22. *args와 **kwargs를 동시에 사용할 때 올바른 매개변수 순서는?',
        description: '위치 가변 인수(*args)와 키워드 가변 인수(**kwargs)를 다 받아내는 함수 정의에서 배치해야 하는 순서 규칙을 고르세요.',
        options: [
          'def f(**kwargs, *args):',
          'def f(*args, **kwargs):',
          'def f(args*, kwargs**):',
          '순서는 상관없다.'
        ],
        correctAnswers: ['1'],
        explanation: '파이썬의 문법 규칙 상 매개변수를 배치할 때 위치 가변 인수(*args)를 무조건 키워드 가변 인수(**kwargs)보다 앞자리에 정의해야 파서가 인수를 혼선 없이 올바르게 분류하여 할당해 줍니다.'
      },
      {
        id: 'q23',
        type: 'multiple',
        title: '23. 파일에서 모든 줄을 리스트 형태로 한꺼번에 읽어오는 메서드는?',
        description: '열려 있는 파일의 텍스트 콘텐츠의 모든 행들을 읽어서 각 줄을 요소로 보관하는 문자열 리스트로 만드는 내장 API 메서드를 고르세요.',
        options: [
          'read()',
          'readline()',
          'readlines()',
          'write()'
        ],
        correctAnswers: ['2'],
        explanation: 'readlines() 메서드는 파일 내용 전체를 스캔하여 개행 문자(\\n) 단위로 한 줄씩 잘라 리스트 객체의 원소들로 보관해 반환합니다. 참고로 read()는 전체 단일 텍스트, readline()은 딱 한 개의 행만 읽어옵니다.'
      },
      {
        id: 'q24',
        type: 'multiple',
        title: '24. lambda x, y: x * y를 map에 사용해 [1, 2]와 [3, 4]를 곱하는 코드는?',
        description: '두 개의 매개변수를 취하는 람다 함수와 map을 사용하여 두 개 리스트의 각 원소들을 서로 곱하게 하는 다중 컬렉션 매핑 코드를 고르세요.',
        options: [
          'map(lambda x, y: x * y, [1, 2, 3, 4])',
          'map(lambda x, y: x * y, [1, 2], [3, 4])',
          'map(lambda x: x * y, [1, 2], [3, 4])',
          'map(lambda x, y: x * y, ([1, 2], [3, 4]))'
        ],
        correctAnswers: ['1'],
        explanation: "map 함수는 매개변수를 여러 개 취하는 함수를 위해, 여러 컬렉션([1, 2]와 [3, 4])을 콤마(,)로 차례대로 인수로 넘겨줄 수 있습니다. map은 각 컬렉션의 동일한 인덱스 번호 요소들을 람다 함수의 x, y 매개변수에 각각 주입하여 매치시켜 줍니다."
      },
      {
        id: 'q25',
        type: 'multiple',
        title: '25. 다음 중 에러가 발생하는 코드는?',
        description: '함수를 선언할 때 매개변수들 사이에 정의해 둔 기본 매핑 구조(초깃값 유무) 중 구문 오류가 나는 형태를 고르세요.',
        options: [
          'def f(a, b=10): pass',
          'def f(a=10, b=20): pass',
          'def f(a=10, b): pass',
          'def f(a, b): pass'
        ],
        correctAnswers: ['2'],
        explanation: "매개변수의 초깃값 배치 시, 초깃값이 없는 일반 인수가 초깃값이 설정된 인수 뒤에 선언될 수 없습니다. def f(a=10, b)의 경우, f(5)를 호출했을 때 5가 a의 대체값인지 b의 대체값인지 모호해지므로 파이썬에서는 'SyntaxError: non-default argument follows default argument'가 발생합니다."
      }
    ]
  }
];
