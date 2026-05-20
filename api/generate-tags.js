// Vercel 서버리스 함수 — 가사를 받아 Claude API로 핵심 태그를 추출한다.
// API 키(ANTHROPIC_API_KEY)는 서버 환경변수에서만 읽으며 클라이언트로 노출되지 않는다.
//
// 환경변수 설정:
//  - 배포: Vercel 프로젝트 Settings → Environment Variables 에 ANTHROPIC_API_KEY 추가
//  - 로컬: 프로젝트 루트 .env 파일에 ANTHROPIC_API_KEY=... (vercel dev 사용 시)
import Anthropic from '@anthropic-ai/sdk';

// 곡 상황 분류는 아래 10가지로 고정. 모델이 다른 값을 반환하면 걸러낸다.
// 각 상황의 정의는 system 프롬프트에 명시되어 있으며, 한 곡당 가장 잘 맞는 1~2개만 부착되도록 안내한다.
const VALID_MOODS = [
  '위로',
  '감사',
  '예배',
  '새힘',
  '기도',
  '회개',
  '두려움',
  '결단',
  '고난',
  '영적전쟁',
];

// 응답 텍스트에서 첫 '{' ~ 마지막 '}' 구간만 잘라 JSON 객체로 파싱한다.
// 모델이 앞뒤에 군더더기 텍스트를 붙여도 안전하게 tags/moods만 추출한다.
function parseResult(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('응답에서 JSON 객체를 찾지 못했습니다: ' + text.slice(0, 200));
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  const rawTags = Array.isArray(parsed?.tags) ? parsed.tags : [];
  const rawMoods = Array.isArray(parsed?.moods) ? parsed.moods : [];
  const tags = rawTags
    .map((t) => String(t).trim())
    .filter((t) => t.length > 0)
    .slice(0, 5);
  const moods = rawMoods
    .map((m) => String(m).trim())
    .filter((m, i, arr) => VALID_MOODS.includes(m) && arr.indexOf(m) === i)
    // 곡당 mood 과부착을 방지하기 위해 최대 3개로 제한 (실제로는 1~2개를 권장)
    .slice(0, 3);
  return { tags, moods };
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
      max_tokens: 300,
      system:
        '당신은 기독교 찬양곡의 가사를 분석해 (1) 핵심 주제 태그와 (2) 어울리는 상황(mood)을 분류하는 도우미입니다. ' +
        '반드시 JSON 객체 형식으로만 응답하고 그 외 텍스트(설명·머리말·코드블록 표시 등)는 절대 포함하지 않습니다. ' +
        '예시: {"tags":["십자가","은혜","구원","소망","예배"],"moods":["예배","감사"]}',
      messages: [
        {
          role: 'user',
          content:
            '다음 찬양곡 가사를 분석해 JSON으로만 응답해 주세요.\n\n' +
            '## 1. 핵심 주제 태그 (tags)\n' +
            '- 한국어 2~4글자 명사로 5개 이내 추출\n' +
            '- 예: 십자가, 은혜, 구원, 사랑, 헌신, 회개, 부활, 인도 등\n\n' +
            '## 2. 어울리는 상황 (moods)\n' +
            '아래 10가지 중에서 **가장 잘 맞는 1~2개만** 선택하세요 (최대 3개). ' +
            '여러 상황에 두루 어울리더라도 핵심 정서·메시지에 가장 가까운 것만 고르고, ' +
            '"기독교 찬양이니까 예배" 식의 광의 부착은 금지합니다.\n\n' +
            '- **위로**: 슬픔·낙심·외로움 가운데 주의 위로로 회복되는 곡\n' +
            '- **감사**: 받은 사랑·은혜·구원에 대한 감사·고백이 핵심인 곡\n' +
            '- **예배**: 직접적인 경배·찬양·임재 가운데 머무는 곡 (결단/고백/헌신곡은 제외)\n' +
            '- **새힘**: 지친 영혼이 일어서서 다시 걷고 승리·회복하는 곡\n' +
            '- **기도**: 부르짖음·간구·새벽기도의 분위기 (단순 "~게 하소서" 결단곡은 제외)\n' +
            '- **회개**: 죄 자각·돌이킴이 명시된 곡 (자기부인·헌신만으로는 회개 아님)\n' +
            '- **두려움**: 두려움·불안·흔들림 속에서 평안과 담대함을 얻는 곡\n' +
            '- **결단**: "~게 하소서" "보내소서" 등 헌신·소명·자기부인 결단이 핵심인 곡\n' +
            '- **고난**: 환난·내리막·낙심의 한복판을 다루며 인내·신뢰하는 곡\n' +
            '- **영적전쟁**: 영적 싸움·악한 세력·승리의 선포가 명시된 곡\n\n' +
            '## 출력\n' +
            '{"tags": ["태그1","태그2"], "moods": ["상황1","상황2"]}\n\n' +
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

    const { tags, moods } = parseResult(text);
    res.status(200).json({ tags, moods });
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
