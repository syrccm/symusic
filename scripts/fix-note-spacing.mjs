// 말씀나눔지 본문 문단 띄어쓰기 보정 (LLM 공백 삽입 + 엄격한 검증 게이트)
// ──────────────────────────────────────────────────────────────────────────
// 설계 원칙(이규현 목사 설교 저작물 → 원문 보존이 최우선):
//   • LLM은 "공백만" 삽입/조정할 수 있다. 글자(음절)·문장부호·숫자·인용구는 불변.
//   • ★검증 게이트: LLM 출력에서 모든 공백을 제거한 문자열이 원문에서 모든 공백을
//     제거한 문자열과 글자 단위로 100% 일치할 때만 채택. 한 글자라도 다르면 폐기하고
//     원문 그대로 사용 → 어떤 경우에도 원문 글자는 절대 바뀌지 않는다.
//   • API 실패/타임아웃 → 그 문단은 원문 폴백. 파이프라인은 깨지지 않는다.
//   • 대상은 body(설교 본문 문단)뿐. scriptureText/제목/날짜/설교자는 보정하지 않는다.
//
// 사용:
//   ANTHROPIC_API_KEY=... node scripts/fix-note-spacing.mjs [pdf경로]
//   (.env 의 ANTHROPIC_API_KEY 도 자동으로 읽는다)
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { extractNote } from './extract-note-text.mjs';

const MODEL = 'claude-haiku-4-5'; // 단순 작업 + 검증 게이트 → 가벼운 모델로 충분
const TIMEOUT_MS = 30000;

// 공백(스페이스·탭·개행 등)을 모두 제거 → 글자열만 남김
const stripWS = (s) => s.replace(/\s+/g, '');

// 따옴표 글리프 정규화(비교 전용, 1:1 치환만): 모델이 곡선따옴표 “ ” ‘ ’ 를
// 직선따옴표 " ' 로 바꿔도 "같은 글자"로 취급. 길이를 바꾸는 정규화(…→...)는 안 함.
const normQuotes = (s) =>
  s
    .replace(/[“”„‟″〃〝〞〟]/g, '"')
    .replace(/[‘’‚‛′]/g, "'");

// 비교 키: 공백 제거 + 따옴표 정규화
const cmpKey = (s) => normQuotes(stripWS(s));

// ★검증 게이트: 공백/따옴표모양만 다른가? (true면 글자 자체는 동일)
export const isSpacingOnly = (original, candidate) => cmpKey(original) === cmpKey(candidate);

// 비공백 글자열 + "각 글자 앞에 공백이 있었는지" 배열로 분해
function splitGlyphsAndGaps(s) {
  const glyph = [];
  const gap = []; // gap[k] = k번째 비공백 글자 앞에 공백이 있었나
  let pendingWs = false;
  for (const ch of s) {
    if (/\s/.test(ch)) { pendingWs = true; continue; }
    glyph.push(ch);
    gap.push(pendingWs);
    pendingWs = false;
  }
  return { glyph, gap };
}

// 원문 글리프로 재구성하되, 공백은 "원문 공백 ∪ 모델이 추가한 공백"(합집합)으로 둔다.
// → 글자는 100% 원문(따옴표·인용 포함), 원문의 기존 공백은 절대 삭제되지 않고
//   모델은 "빠진 공백을 추가"만 할 수 있다. (모델이 멀쩡한 공백을 지워도 무해)
// 비공백 글자 개수가 원문과 다르면 null.
export function rebuildWithOriginalGlyphs(original, candidate) {
  const O = splitGlyphsAndGaps(original);
  const C = splitGlyphsAndGaps(candidate);
  if (O.glyph.length !== C.glyph.length) return null;
  let out = O.glyph[0] ?? '';
  for (let k = 1; k < O.glyph.length; k++) {
    const space = O.gap[k] || C.gap[k]; // 합집합: 원문 공백 보존 + 모델 추가 공백
    out += (space ? ' ' : '') + O.glyph[k];
  }
  return out;
}

// 한 문단을 LLM에 보내 띄어쓰기만 교정 → 원시 출력 텍스트 반환
async function requestSpacing(client, text) {
  const message = await client.messages.create(
    {
      model: MODEL,
      max_tokens: Math.min(4096, Math.ceil(text.length * 1.5) + 200),
      system:
        '너는 한국어 띄어쓰기 교정기다. 입력 텍스트의 띄어쓰기(공백)만 바로잡아라. ' +
        '절대 규칙: 음절(글자)을 추가·삭제·변경·재배열하지 말 것. 조사·어미·단어·문장부호·' +
        '숫자·따옴표·괄호를 바꾸지 말 것. 성경 인용 구절도 글자를 절대 바꾸지 말 것. ' +
        '오직 단어 사이의 공백만 넣거나 빼라. 줄바꿈은 넣지 마라. ' +
        '교정된 텍스트 한 줄만 출력하고, 설명·머리말·따옴표·코드블록 표시를 붙이지 마라.',
      messages: [{ role: 'user', content: text }],
    },
    { timeout: TIMEOUT_MS }
  );
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// body 문단 배열을 보정. 각 문단: LLM 시도 → 게이트 검증 → 채택/폴백.
// 반환: { paras: 보정된배열, report: [{i, status, before, after}] }
export async function correctBody(client, paras, { onLog } = {}) {
  const out = [];
  const report = [];
  for (let i = 0; i < paras.length; i++) {
    const original = paras[i];
    let status = 'reverted', finalText = original;
    try {
      // 모델 출력은 확률적 → 게이트 폐기 시 최대 2회까지 재시도(게이트가 있어 안전)
      for (let attempt = 0; attempt < 2; attempt++) {
        const candidate = await requestSpacing(client, original);
        const rebuilt = isSpacingOnly(original, candidate)
          ? rebuildWithOriginalGlyphs(original, candidate)
          : null;
        // 최종 강검증: 재구성 결과의 공백제외 글자열이 원문과 글자 단위로 정확히 동일
        if (rebuilt !== null && stripWS(rebuilt) === stripWS(original)) {
          status = 'fixed'; // 띄어쓰기만 반영, 글자는 원문 그대로 → 채택
          finalText = rebuilt;
          break;
        }
        // 통과 못 하면 재시도; 끝까지 실패하면 reverted(원문 유지) 그대로
      }
    } catch (err) {
      status = 'error'; // API 실패/타임아웃 → 원문 폴백
      finalText = original;
      report.push({ i, status, error: err?.message || String(err), before: original, after: original });
      out.push(finalText);
      onLog?.(report[report.length - 1]);
      continue;
    }
    report.push({ i, status, before: original, after: finalText });
    out.push(finalText);
    onLog?.(report[report.length - 1]);
  }
  return { paras: out, report };
}

// ── ANTHROPIC_API_KEY 로드 ───────────────────────────────────────────────────
// .env 파일을 먼저 본다(프로젝트의 로컬 키 방식). 셸에 무효/만료 키가 export 돼
// 있어도 .env 가 있으면 그것을 우선해 막히지 않게 한다. 없으면 process.env 사용.
export function loadEnvKey() {
  if (existsSync('.env')) {
    const m = readFileSync('.env', 'utf8').match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+)\s*$/m);
    if (m) {
      const k = m[1].trim().replace(/^["']|["']$/g, '');
      if (k) return k;
    }
  }
  return process.env.ANTHROPIC_API_KEY || '';
}

// ── 검증 게이트 셀프테스트(키 없이도 동작 증명) ────────────────────────────────
function gateSelfTest() {
  const orig = '현실적으로 어려운말씀입니다.';
  const cases = [
    { name: '공백만 삽입(정상)', cand: '현실적으로 어려운 말씀입니다.' },
    { name: '글자 변경(말씀→말슴)', cand: '현실적으로 어려운 말슴입니다.' },
    { name: '단어 추가(아주)', cand: '현실적으로 아주 어려운 말씀입니다.' },
    { name: '글자 삭제(다 빠짐)', cand: '현실적으로 어려운 말씀입니.' },
    { name: '문장부호 변경(.→!)', cand: '현실적으로 어려운 말씀입니다!' },
  ];
  console.log('=== 검증 게이트 셀프테스트 (원문: "' + orig + '") ===');
  for (const c of cases) {
    const ok = isSpacingOnly(orig, c.cand);
    const verdict = ok ? '채택(공백만 변경)' : '폐기→원문 유지';
    console.log(`  [${ok ? 'PASS' : 'BLOCK'}] ${c.name.padEnd(18)} → ${verdict}`);
    console.log(`         "${c.cand}"`);
  }
  console.log('  기대: 첫 케이스만 PASS, 나머지는 모두 BLOCK(원문 보존).\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pdfPath = process.argv[2] || 'public/data/notes/20260614.pdf';

  // 1) 게이트가 실제로 작동하는지 먼저 증명 (키 불필요)
  gateSelfTest();

  // 2) 추출
  const note = await extractNote(pdfPath);
  console.log(`=== 추출: ${pdfPath} — 본문 ${note.body.length}개 문단 ===\n`);

  const apiKey = loadEnvKey();
  if (!apiKey) {
    console.log('ANTHROPIC_API_KEY 가 없어 라이브 보정은 생략합니다.');
    console.log('키를 .env 에 넣고 다시 실행하면 6개 문단 보정 전/후를 출력합니다:');
    console.log('  echo "ANTHROPIC_API_KEY=sk-ant-..." > .env');
    console.log('  node scripts/fix-note-spacing.mjs');
    process.exit(0);
  }

  // 3) 라이브 보정 + 검증 게이트
  const client = new Anthropic({ apiKey });
  const counts = { fixed: 0, reverted: 0, error: 0 };
  const { report } = await correctBody(client, note.body, {
    onLog: (r) => {
      counts[r.status]++;
      const tag = { fixed: '✅ 채택', reverted: '⛔ 폐기→원문', error: '⚠️ 실패→원문' }[r.status];
      console.log(`\n──── 문단 ${r.i + 1} : ${tag}${r.error ? ' (' + r.error + ')' : ''} ────`);
      console.log(`[전] ${r.before}`);
      console.log(`[후] ${r.after}`);
      console.log(`[검증] 공백제외 글자열 ${isSpacingOnly(r.before, r.after) ? '일치(원문 글자 보존 확인)' : '불일치'}`);
    },
  });

  console.log(`\n=== 요약: 채택 ${counts.fixed} / 폐기 ${counts.reverted} / 실패 ${counts.error} ===`);
}
