// Vercel 서버리스 함수 — 가사를 받아 Claude API로 핵심 태그를 추출한다.
// API 키(ANTHROPIC_API_KEY)는 서버 환경변수에서만 읽으며 클라이언트로 노출되지 않는다.
//
// 환경변수 설정:
//  - 배포: Vercel 프로젝트 Settings → Environment Variables 에 ANTHROPIC_API_KEY 추가
//  - 로컬: 프로젝트 루트 .env 파일에 ANTHROPIC_API_KEY=... (vercel dev 사용 시)
import Anthropic from '@anthropic-ai/sdk';

// 응답 텍스트에서 첫 '[' ~ 마지막 ']' 구간만 잘라 JSON 배열로 파싱한다.
// 모델이 앞뒤에 군더더기 텍스트를 붙여도 안전하게 태그만 추출한다.
function parseTags(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('응답에서 JSON 배열을 찾지 못했습니다: ' + text.slice(0, 200));
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) {
    throw new Error('JSON 배열 형식이 아닙니다.');
  }
  return parsed
    .map((t) => String(t).trim())
    .filter((t) => t.length > 0)
    .slice(0, 5);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다. (Vercel 환경변수 또는 .env 확인)',
    });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { lyrics, title } = body;

  if (!lyrics || typeof lyrics !== 'string' || !lyrics.trim()) {
    res.status(400).json({ error: '가사(lyrics)가 필요합니다.' });
    return;
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system:
        '당신은 기독교 찬양곡의 가사를 분석해 핵심 주제 태그를 뽑는 도우미입니다. ' +
        '태그는 한국어 2~4글자 명사로, 5개 이내로 추출합니다. ' +
        '반드시 JSON 배열 형식으로만 응답하고 그 외 텍스트는 절대 포함하지 않습니다. ' +
        '예시: ["십자가","은혜","구원","소망","예배"]',
      messages: [
        {
          role: 'user',
          content:
            '다음은 기독교 찬양곡의 가사입니다. ' +
            '이 가사의 핵심 주제를 분석하여 태그를 5개 이내로 추출해주세요. ' +
            '태그는 한국어 2~4글자 명사로, JSON 배열 형식으로만 응답하세요.\n\n' +
            (title ? `제목: ${title}\n` : '') +
            `가사:\n${lyrics.trim().slice(0, 4000)}`,
        },
      ],
    });

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    const tags = parseTags(text);
    res.status(200).json({ tags });
  } catch (error) {
    const status =
      typeof error?.status === 'number' && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
    console.error('[generate-tags] 오류:', error?.message || error);
    res.status(status).json({
      error: error?.message || '태그 생성 중 오류가 발생했습니다.',
    });
  }
}
