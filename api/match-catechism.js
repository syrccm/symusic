// Vercel 서버리스 함수 — 찬양 제목+가사를 받아 Claude API로
// 웨스트민스터 소요리문답 중 의미적으로 가장 가까운 문답 1~3개를 추천한다.
// API 키(ANTHROPIC_API_KEY)는 서버 환경변수에서만 읽으며 클라이언트로 노출되지 않는다.
//
// 요청 본문: { title, lyrics, catechism: [{ number, question }, ...] }
// 응답:      { matches: [{ number, reason }, ...] }  (1~3개)
import Anthropic from '@anthropic-ai/sdk';

// 응답 텍스트에서 첫 '{' ~ 마지막 '}' 구간만 잘라 JSON으로 파싱한다.
function parseResult(text, validNumbers) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('응답에서 JSON 객체를 찾지 못했습니다: ' + text.slice(0, 200));
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  const raw = Array.isArray(parsed?.matches) ? parsed.matches : [];
  const seen = new Set();
  const matches = [];
  for (const m of raw) {
    const number = Number(m?.number);
    if (!Number.isInteger(number) || !validNumbers.has(number) || seen.has(number)) continue;
    seen.add(number);
    matches.push({ number, reason: String(m?.reason ?? '').trim().slice(0, 120) });
    if (matches.length >= 3) break;
  }
  return matches;
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
  const { title, lyrics, catechism } = body;

  if (!lyrics || typeof lyrics !== 'string' || !lyrics.trim()) {
    res.status(400).json({ error: '가사(lyrics)가 필요합니다.' });
    return;
  }
  if (!Array.isArray(catechism) || catechism.length === 0) {
    res.status(400).json({ error: '소요리문답 목록(catechism)이 필요합니다.' });
    return;
  }

  const validNumbers = new Set(
    catechism.map((c) => Number(c?.number)).filter((n) => Number.isInteger(n))
  );

  // 문답 목록을 "번호. 질문" 형태로 직렬화 (질문만 보내 토큰 절약)
  const catechismList = catechism
    .filter((c) => Number.isInteger(Number(c?.number)) && c?.question)
    .map((c) => `${c.number}. ${String(c.question).trim()}`)
    .join('\n');

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system:
        '당신은 한국어 기독교 찬양 가사를 웨스트민스터 소요리문답과 매칭하는 신학 보조자입니다. ' +
        '제시된 문답 목록 안에서만 골라야 하며, 찬양의 (1) 제목이 담은 신학 주제, (2) 후렴의 반복된 고백, ' +
        '(3) 마지막 절의 결론적 고백을 종합하여 의미가 가장 가까운 문답을 1~3개 선정합니다. ' +
        '느슨한 연상이 아니라 핵심 메시지가 실제로 일치하는 것만 고릅니다. ' +
        '반드시 JSON 객체로만 응답하고 그 외 텍스트는 절대 포함하지 않습니다. ' +
        '형식: {"matches":[{"number":1,"reason":"한 줄 이유"}]}',
      messages: [
        {
          role: 'user',
          content:
            '다음 찬양과 가장 의미가 일치하는 소요리문답을 1~3개 골라 JSON으로만 응답하세요. ' +
            'number 는 반드시 아래 목록에 있는 번호여야 하며, reason 은 한국어 한 줄로 적습니다.\n\n' +
            '## 소요리문답 목록\n' +
            catechismList +
            '\n\n## 분석할 찬양\n' +
            (title ? `제목: ${title}\n` : '') +
            `가사:\n${lyrics.trim().slice(0, 4000)}\n\n` +
            '## 출력\n{"matches":[{"number":1,"reason":"..."}]}',
        },
      ],
    });

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    const matches = parseResult(text, validNumbers);
    res.status(200).json({ matches });
  } catch (error) {
    const status =
      typeof error?.status === 'number' && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
    console.error('[match-catechism] 오류:', error?.message || error);
    res.status(status).json({
      error: error?.message || '문답 매핑 중 오류가 발생했습니다.',
    });
  }
}
