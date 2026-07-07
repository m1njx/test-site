import type { Question } from './data';

// .env에서 모델 목록 읽기 (쉼표로 구분)
const GEMINI_MODELS_ENV = import.meta.env.VITE_GEMINI_MODELS || 'gemini-2.5-flash,gemini-3.1-flash-lite,gemini-3.5-flash';
const GEMINI_MODELS = GEMINI_MODELS_ENV.split(',').map((m: string) => m.trim()).filter((m: string) => m);

// 이전에 성공한 모델 기억
let lastSuccessfulModel: string | null = null;

export async function callGeminiWithFallback(apiKey: string, prompt: string): Promise<string> {
  let lastError = null;
  const timeout = 15000; // 15초 타임아웃
  
  // 성공한 모델이 있으면 먼저 시도
  const modelsToTry = lastSuccessfulModel 
    ? [lastSuccessfulModel, ...GEMINI_MODELS.filter((m: string) => m !== lastSuccessfulModel)]
    : GEMINI_MODELS;
  
  for (const model of modelsToTry) {
    try {
      console.log(`Trying Gemini model: ${model}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`API error ${response.status}: ${response.statusText}`);
      }
      const json = await response.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response');
      }
      
      // 성공한 모델 기억
      lastSuccessfulModel = model;
      console.log(`Success with model: ${model}`);
      return text;
    } catch (e) {
      console.warn(`Model ${model} failed:`, e);
      lastError = e;
    }
  }
  throw lastError || new Error('All Gemini models failed');
}

export async function gradeWithGemini(q: Question, userAns: string): Promise<{ isCorrect: boolean; reason: string; correctAnswer?: string; explanation?: string }> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('Gemini API key is not configured');
  }
  
  const prompt = `너는 프로그래밍 및 IT 개념 채점 조교 AI야. 학생이 제출한 코드 또는 답변을 엄격하지 않고 너그럽게 채점해줘.
의미가 통하거나, 문제의 핵심 요소를 충족하거나, 로직상 일치하면 정답으로 인정해야 해.

[문제 정보]
- 질문: ${q.title}
- 설명: ${q.description}

[학생이 제출한 답안]
${userAns}

[채점 및 분석 규칙]
1. 완벽한 일치가 아니더라도 논리적 의미나 실행 결과가 같으면 정답(isCorrect: true) 처리합니다.
2. 개념 확인 질문의 경우, 핵심 개념이나 키워드가 언급되었다면 정답 처리합니다.
3. 만약 학생의 답안이 오답(isCorrect: false)인 경우, 왜 틀렸는지 핵심 원인을 아주 쉽고 직관적으로 1~2문장 이내로 친절하게 설명해주세요. (맞은 경우 간단한 칭찬 작성)
4. 이 질문에 대한 가장 모범적인 정답/코드(HTML/CSS/JS/Python 등 문제에 맞는 형식)를 'correctAnswer' 필드에 제공해주세요.
5. 이 질문의 핵심 개념에 대해 누구나 단번에 직관적으로 이해할 수 있도록 구구절절한 전문 용어 서술을 완전히 배제하고, 핵심 내용만 딱 요약하여 2~3문장 이내로 아주 간결하게 'explanation' 필드에 한국어로 작성해주세요.
6. 응답은 반드시 마크다운 백틱 없이 순수 JSON 객체 한 개로만 출력하세요. 다른 잡담이나 설명은 넣지 마세요.

응답 형식:
{
  "isCorrect": true 또는 false,
  "reason": "채점 결과 요약 및 오답인 경우 틀린 이유/피드백 (한국어)",
  "correctAnswer": "모범 답안 코드 또는 개념 텍스트",
  "explanation": "해당 문제의 핵심 이론 및 상세 해설 (한국어)"
}`;

  const text = await callGeminiWithFallback(apiKey, prompt);

  let cleanText = text.trim();
  if (cleanText.includes('\`\`\`')) {
    const match = cleanText.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/);
    if (match) {
      cleanText = match[1].trim();
    } else {
      cleanText = cleanText.replace(/\`\`\`(?:json)?/g, '').replace(/\`\`\`/g, '').trim();
    }
  }

  let result;
  try {
    result = JSON.parse(cleanText);
  } catch (parseErr) {
    console.error('Gemini JSON parse failed:', cleanText);
    throw new Error('AI 응답 파싱 실패');
  }
  
  return {
    isCorrect: !!result.isCorrect,
    reason: result.reason || '',
    correctAnswer: result.correctAnswer || '',
    explanation: result.explanation || ''
  };
}

export async function fetchAiPreview(qTitle: string, qDesc: string): Promise<{ correctAnswer: string; explanation: string }> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('Gemini API key is not configured');
  }

  const prompt = `너는 프로그래밍 및 IT 개념 채점 조교 AI야. 
다음 질문에 대해 학생들이 참고할 수 있는 가장 완벽하고 이상적인 모범 답안(코드 또는 개념 설명)과 핵심 요약 해설을 제공해줘.

[문제 정보]
- 질문: ${qTitle}
- 설명: ${qDesc}

[제공 규칙]
1. 이 질문에 대한 가장 모범적인 정답/코드(HTML/CSS/JS/Python 등 문제에 맞는 형식)를 'correctAnswer' field에 제공해주세요.
2. 이 질문의 핵심 개념에 대해 누구나 단번에 직관적으로 이해할 수 있도록 구구절절한 전문 용어 서술을 완전히 배제하고, 핵심 내용만 딱 요약하여 2~3문장 이내로 아주 간결하게 'explanation' field에 한국어로 작성해주세요.
3. 응답은 반드시 마크다운 백틱 없이 순수 JSON 객체 한 개로만 출력하세요. 다른 잡담이나 설명은 넣지 마세요.

응답 형식:
{
  "correctAnswer": "모범 답안 코드 또는 개념 텍스트",
  "explanation": "해당 문제의 핵심 이론 및 상세 해설 (한국어)"
}`;

  const text = await callGeminiWithFallback(apiKey, prompt);

  let cleanText = text.trim();
  if (cleanText.includes('\`\`\`')) {
    const match = cleanText.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/);
    if (match) cleanText = match[1].trim();
    else cleanText = cleanText.replace(/\`\`\`(?:json)?/g, '').replace(/\`\`\`/g, '').trim();
  }

  let result;
  try {
    result = JSON.parse(cleanText);
  } catch (parseErr) {
    console.error('Gemini JSON parse failed:', cleanText);
    throw new Error('AI 응답 파싱 실패');
  }
  
  return {
    correctAnswer: result.correctAnswer || '',
    explanation: result.explanation || ''
  };
}
