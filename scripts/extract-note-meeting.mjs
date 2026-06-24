// 말씀나눔지 4페이지 → 나눔질문(questions) + 기도제목(prayers) 추출 (STEP 2)
// ──────────────────────────────────────────────────────────────────────────
// 4페이지는 표·다단 레이아웃. 좌표로 좌/우 단을 분리해 항목 순서·번호를 복원한다.
//   • 나눔질문: 좌측. 마커 "N_"(x≈46.8) + 질문문(x≈60.8), y≈124~352.
//   • 기도제목: 우측 컬럼(x≈426). ➊➋➌ 로 시작, y≈210~525.
//   • ★찬양곡번호·암송구절은 추출하지 않음(별도 영역이라 y·x 범위로 자연 배제).
// 줄바꿈 어절경계 공백 유실은 STEP 1 보정(LLM 공백삽입 + 검증 게이트 + 원문 글리프
// 재구성)을 그대로 재사용해 바로잡는다(fix-note-spacing.mjs).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { correctBody, isSpacingOnly } from './fix-note-spacing.mjs';

// 좌/우 단 경계 및 영역 y범위.
// ★고정 y하한 제거: 마커(질문 N_ / 기도 ➊➋➌)가 영역의 "시작"을 정하고(그 위 줄은
//   groupByMarker 가 무시), 하한은 푸터(발행인 y≈16·영상안내 y≈52) 직전(58)까지 연다.
//   상한 560 은 4페이지 본문 블록(y≳610)만 배제하기 위한 것(그 사이 모임 소제목·찬양·
//   암송은 첫 마커 위라 groupByMarker 가 자연 제외). → 주마다 길이가 달라도 잘리지 않음.
const COL_SPLIT = 380;            // x<380=좌(질문), x>=380=우(기도)
const Q_Y = [58, 560];            // 질문 영역 y (마커~푸터 직전)
const P_Y = [58, 560];            // 기도 영역 y (마커~푸터 직전)
const Q_MARK = /^\s*(\d+)_\s*/;    // 질문 마커 "1_"
const P_MARK = /^\s*[➊➋➌➍➎➏➐➑➒➓]\s*/; // 기도 마커

const round1 = (n) => Math.round(n * 10) / 10;

// 줄 이어붙이기: 앞 줄이 종결/닫힘 기호로 끝나면 공백, 아니면 공백 없이(어절 중간 복원)
const SENTENCE_END = /[.!?。…”’")\]]$/;
function joinLines(lines) {
  let out = '';
  for (const ln of lines) out += out ? (SENTENCE_END.test(out) ? ' ' : '') + ln : ln;
  return out;
}

// 같은 y(허용오차)로 묶어 x순 결합 → 줄 배열(위→아래)
function toLines(items, tol = 2.5) {
  const rows = [];
  for (const it of items.slice().sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= tol);
    if (row) row.parts.push(it);
    else rows.push({ y: it.y, parts: [it] });
  }
  return rows.map((r) => ({
    y: r.y,
    x: Math.min(...r.parts.map((p) => p.x)),
    text: r.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim(),
  }));
}

// 마커로 시작하는 줄을 구분점으로, 마커~다음마커 사이 줄들을 한 항목으로 묶는다.
function groupByMarker(lines, markRe) {
  const items = [];
  let cur = null;
  for (const ln of lines) {
    if (markRe.test(ln.text)) {
      if (cur) items.push(cur);
      cur = [ln.text.replace(markRe, '')];
    } else if (cur) {
      cur.push(ln.text);
    }
  }
  if (cur) items.push(cur);
  return items.map(joinLines);
}

// 깨진 글자(폰트 매핑 누락) 탐지용 — 한글/ASCII/일반기호/원문자/위첨자 외
const isOkCp = (cp) =>
  (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f) ||
  (cp >= 0x20 && cp <= 0x7e) || cp === 0xa0 || (cp >= 0x2018 && cp <= 0x201f) ||
  cp === 0x2013 || cp === 0x2014 || cp === 0x2026 || cp === 0x00b7 || cp === 0x223c ||
  (cp >= 0x2070 && cp <= 0x209f) || (cp >= 0x2460 && cp <= 0x24ff) || (cp >= 0x2776 && cp <= 0x2793) ||
  (cp >= 0x3000 && cp <= 0x303f) || (cp >= 0xff00 && cp <= 0xffef);
const garbledChars = (s) => [...s].filter((c) => !isOkCp(c.codePointAt(0)));

export async function extractMeeting(pdfPath) {
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await getDocument({ data }).promise;
  const page = await doc.getPage(4);
  const tc = await page.getTextContent();
  const items = tc.items
    .filter((it) => 'str' in it && it.str.trim() !== '')
    .map((it) => ({ x: it.transform[4], y: round1(it.transform[5]), s: it.str }));

  // 질문: 좌측(x<COL_SPLIT) + y범위
  const qItems = items.filter((it) => it.x < COL_SPLIT && it.y >= Q_Y[0] && it.y <= Q_Y[1]);
  const questions = groupByMarker(toLines(qItems), Q_MARK);

  // 기도: 우측(x>=COL_SPLIT) + y범위
  const pItems = items.filter((it) => it.x >= COL_SPLIT && it.y >= P_Y[0] && it.y <= P_Y[1]);
  const prayers = groupByMarker(toLines(pItems), P_MARK);

  // 깨진 글자 보고(4페이지 전체 줄 기준; 추출 대상 밖이라도 위치·개수 보고)
  const garbled = [];
  for (const ln of toLines(items)) {
    const bad = garbledChars(ln.text);
    if (bad.length) garbled.push({ y: ln.y, text: ln.text, codepoints: bad.map((c) => 'U+' + c.codePointAt(0).toString(16)) });
  }

  return { questions, prayers, garbled };
}

// ── 키 로드(.env 우선) ────────────────────────────────────────────────────────
function loadEnvKey() {
  if (existsSync('.env')) {
    const m = readFileSync('.env', 'utf8').match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+)\s*$/m);
    if (m) { const k = m[1].trim().replace(/^["']|["']$/g, ''); if (k) return k; }
  }
  return process.env.ANTHROPIC_API_KEY || '';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pdfPath = process.argv[2] || 'public/data/notes/20260614.pdf';
  const { questions, prayers, garbled } = await extractMeeting(pdfPath);

  const dump = (title, arr) => {
    console.log(`\n=== ${title} (${arr.length}개) ===`);
    arr.forEach((t, i) => console.log(`[${i + 1}] ${t}`));
  };

  console.log(`### 추출(보정 전): ${pdfPath}`);
  dump('나눔질문 questions', questions);
  dump('기도제목 prayers', prayers);

  console.log(`\n=== 깨진 글자 보고 ===`);
  if (!garbled.length) console.log('없음');
  else for (const g of garbled) console.log(`y=${g.y} (${g.codepoints.length}자: ${g.codepoints.join(',')}) | ${g.text}`);

  const key = loadEnvKey();
  if (!key) { console.log('\n(ANTHROPIC_API_KEY 없음 — 띄어쓰기 보정 생략)'); process.exit(0); }

  // STEP 1 보정 재사용: questions / prayers 각각 보정 + 게이트
  const client = new Anthropic({ apiKey: key });
  const runFix = async (label, arr) => {
    const counts = { fixed: 0, reverted: 0, error: 0 };
    const { paras } = await correctBody(client, arr, { onLog: (r) => counts[r.status]++ });
    console.log(`\n=== ${label} (보정 후) — 채택 ${counts.fixed}/폐기 ${counts.reverted}/실패 ${counts.error} ===`);
    paras.forEach((t, i) => {
      const changed = t !== arr[i];
      console.log(`[${i + 1}]${changed ? ' ✏️' : '  '} ${t}`);
      if (changed) console.log(`     (전) ${arr[i]}`);
    });
    return paras;
  };
  await runFix('나눔질문 questions', questions);
  await runFix('기도제목 prayers', prayers);
}
