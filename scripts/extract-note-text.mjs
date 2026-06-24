// 말씀나눔지 PDF → 구조화 JSON 추출 (STEP 1: 메타 + 성경본문 + 설교 본문 문단)
// 모임 순서(4페이지)는 STEP 2에서 다룸 — 여기서는 "축원합니다."까지의 본문만 추출.
// 사용: node scripts/extract-note-text.mjs [pdf경로] [--write]
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

// ── 본문 3단 컬럼: x 범위로 단 배정(연속줄 base x ≈ 46.8 / 218.7 / 390.7) ──────
// 범위 기준이라야 줄 안에서 띄어쓰기로 분할된 조각(예: x=104.9)도 같은 단에 묶인다.
const COL_BOUNDS = [210, 383]; // x<210→1단, <383→2단, 그 외→3단
const COL_MIN_X = 44;          // 본문 좌측 시작 한계(헤더 잡텍스트 배제용 하한)
const colOf = (x) => (x < COL_MIN_X ? -1 : x < COL_BOUNDS[0] ? 0 : x < COL_BOUNDS[1] ? 1 : 2);
// 본문 글자 높이는 주차마다 다르다(약 8.6~9.5). 고정값 대신 PDF별로 동적 검출한다:
// 3단 밴드(colOf>=0) 안 글자들의 최빈 높이를 그 PDF의 본문 높이로 잡고, ±0.3 여유로 인식.
// (제목 h≈23, 성경 위첨자 h≈7.5 는 본문 밴드의 최빈이 아니므로 자연 제외)
const BODY_H_TOL = 0.3;
const makeIsBody = (h0) => (h) => Math.abs(h - h0) <= BODY_H_TOL;
const PARA_INDENT = 1.5;                           // 문단 첫 줄 들여쓰기 임계(px)
const SENTENCE_END = /[.!?。…”’"』」)）]$/;          // 줄 끝 공백 복원용 종결/닫힘 기호

const round1 = (n) => Math.round(n * 10) / 10;

// 페이지의 텍스트 아이템 로드
async function loadItems(doc, p) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = tc.items
    .filter((it) => 'str' in it && it.str !== '')
    .map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width, h: it.height, s: it.str }));
  return { vp, items };
}

// 3단 밴드 안 글자들의 최빈 높이 = 그 PDF의 본문 높이. (allItems: 전 페이지 아이템 배열들)
function detectBodyHeight(allItems) {
  const tally = new Map();
  for (const items of allItems) {
    for (const it of items) {
      if (colOf(it.x) < 0) continue;
      if (it.h < 5 || it.h > 15) continue; // 제목(≈23)·잡텍스트 제외
      const k = round1(it.h);
      tally.set(k, (tally.get(k) || 0) + 1);
    }
  }
  let best = 9.4, bestN = -1; // 검출 실패 시 합리적 기본값
  for (const [h, n] of tally) if (n > bestN) { bestN = n; best = h; }
  return best;
}

// 같은 행(y)·같은 컬럼 아이템을 x순으로 합쳐 한 줄 텍스트로
function buildColumnLines(items, isBody) {
  const map = new Map(); // `${col}@${y}` -> { col, y, parts:[{x,s}], minX }
  for (const it of items) {
    if (!isBody(it.h)) continue;
    const col = colOf(it.x);
    if (col < 0) continue;
    const y = round1(it.y);
    const key = `${col}@${y}`;
    if (!map.has(key)) map.set(key, { col, y, parts: [] });
    map.get(key).parts.push({ x: it.x, s: it.s });
  }
  const lines = [];
  for (const ln of map.values()) {
    ln.parts.sort((a, b) => a.x - b.x);
    ln.minX = ln.parts[0].x;
    // 한 줄 안의 분할 조각은 정의상 공백으로 나뉘므로 공백으로 연결
    // (justified 공백 글자는 height=0이라 걸러져, 그냥 이어붙이면 공백이 사라짐)
    ln.text = ln.parts.map((p) => p.s).join(' ').replace(/\s+/g, ' ');
    lines.push(ln);
  }
  return lines;
}

// 본문 행은 항상 3단(C1·C2·C3)이 같은 y에 정렬된다. 헤더 성경본문(2단)·
// 모임순서 찬양곡(2단)·질문(1~2단)은 3단을 채우지 않으므로,
// "3단이 모두 있는 행"의 y범위를 본문 구간으로 잡으면 그 외는 자연 배제된다.
// 반환: 페이지 읽기순서(1단→2단→3단, 각 단 위→아래)로 정렬된 본문 줄 배열.
function bodyLinesForPage(lines) {
  // y 허용오차로 행 묶기(3단의 같은 줄은 동일 y를 가짐)
  const rows = [];
  for (const l of lines.slice().sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs(r.y - l.y) <= 3);
    if (row) { row.cols.add(l.col); row.y = (row.y + l.y) / 2; }
    else rows.push({ y: l.y, cols: new Set([l.col]) });
  }
  const full = rows.filter((r) => r.cols.has(0) && r.cols.has(1) && r.cols.has(2));
  if (!full.length) return [];
  // 3단 행들을 y간격으로 군집화해 "가장 큰 연속 군집"만 본문으로 채택.
  // → 1페이지 헤더 성경본문이 우연히 3단을 채운 외톨이 행(예: 20260607)이
  //   본문 위쪽에 떨어져 있어도 본문 띠에 흡수되지 않는다.
  const sorted = full.map((r) => r.y).sort((a, b) => b - a);
  const clusters = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1] - sorted[i] > 45) clusters.push([sorted[i]]);
    else clusters[clusters.length - 1].push(sorted[i]);
  }
  clusters.sort((a, b) => b.length - a.length);
  const body = clusters[0];
  const maxY = Math.max(...body);
  const minY = Math.min(...body);
  const inBand = lines.filter((l) => l.y <= maxY + 3 && l.y >= minY - 3);
  return inBand.sort((a, b) => (a.col !== b.col ? a.col - b.col : b.y - a.y));
}

// 본문 줄들을 문단으로 접기 (들여쓰기=문단시작, 그 외엔 이어붙이기)
function foldParagraphs(orderedLines) {
  // 컬럼별 base x(연속줄 최소값) 산출 → 들여쓰기 판별 기준
  const baseByCol = {};
  for (const col of [0, 1, 2]) {
    const xs = orderedLines.filter((l) => l.col === col).map((l) => l.minX);
    if (xs.length) baseByCol[col] = Math.min(...xs);
  }
  const paras = [];
  let cur = '';
  for (const ln of orderedLines) {
    const isParaStart = ln.minX - (baseByCol[ln.col] ?? ln.minX) > PARA_INDENT;
    if (isParaStart && cur) {
      paras.push(cur);
      cur = '';
    }
    if (!cur) {
      cur = ln.text;
    } else {
      // 줄 이어붙이기: 기본은 공백 없이(어절 중간 줄바꿈 복원),
      // 앞 줄이 종결/닫힘 기호로 끝나면 공백 삽입(문장/구 경계)
      const sep = SENTENCE_END.test(cur) ? ' ' : '';
      cur += sep + ln.text;
    }
  }
  if (cur) paras.push(cur);
  return paras;
}

// 위첨자 절번호 → 유니코드 위첨자
const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const toSup = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('');
const isVerseNum = (it) => /^\d{1,3}$/.test(it.s.trim()) && it.h < 8.6;

// y 허용오차로 같은 행 묶기(위첨자 절번호와 본문이 1~2px 어긋나는 것 흡수)
function groupRows(items, tol = 2.6) {
  const sorted = items.slice().sort((a, b) => b.y - a.y);
  const rows = [];
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= tol);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  return rows; // 위→아래
}

// ── 1페이지 헤더 메타 + 성경본문 ────────────────────────────────────────────
// bodyTopY: 본문 3단 블록의 최상단 y(헤더와의 경계). 호출부에서 본문 런으로 산출.
function extractMeta(items, bodyTopY) {
  const header = items.filter((it) => it.y > bodyTopY + 5);

  // 제목: 가장 큰 글자
  const title = header.slice().sort((a, b) => b.h - a.h)[0]?.s.trim() ?? '';

  // 성경 출처: "마태복음 5:43-48" 형태
  const refItem = header.find((it) => /[가-힣]+\s*\d+:\d+(\s*[-~]\s*\d+)?/.test(it.s));
  const scripture = refItem ? refItem.s.trim() : '';

  // 날짜: yyyy/m/d
  const dateItem = header.find((it) => /\d{4}\/\d{1,2}\/\d{1,2}/.test(it.s));
  let date = '';
  if (dateItem) {
    const m = dateItem.s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    date = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }

  // 설교자: 헤더를 행단위로 합친 뒤 "목사/전도사/…" 포함 행에서 추출
  let preacher = '';
  for (const row of groupRows(header)) {
    const merged = row.items
      .sort((a, b) => a.x - b.x)
      .reduce((acc, it, i) => {
        if (i === 0) return it.s;
        const prev = row.items[i - 1];
        return acc + (it.x - (prev.x + prev.w) > 3 ? ' ' : '') + it.s;
      }, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (/(목사|전도사|강도사|목자)\s*$/.test(merged)) { preacher = merged; break; }
  }

  // 성경본문: "출처 줄(refY) 아래 ~ 본문 3단블록 시작 위" y-구간의 모든 글자.
  // ★고정 높이 상한 제거 — 성경 글자 높이가 주마다 다르므로(예: 9.7) y-구간으로만
  //   한정한다. header 가 이미 (본문top+5) 위로 제한되어 있어, 본문은 자연 제외된다.
  //   절번호(위첨자)는 isVerseNum(작은 높이)로 구분, 본문 조각은 단·절 경계에서만 공백.
  const refY = refItem ? refItem.y : 645;
  const verseItems = header.filter((it) => it.y < refY - 2);
  const scriptureText = groupRows(verseItems)
    .map((row) => {
      const arr = row.items.sort((a, b) => a.x - b.x);
      let out = '';
      let attach = false; // 직전이 절번호면 다음 본문을 공백 없이 붙임
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        if (isVerseNum(it)) {
          out += (out ? ' ' : '') + toSup(it.s.trim());
          attach = true;
        } else {
          out += attach ? it.s : (out ? ' ' : '') + it.s;
          attach = false;
        }
      }
      return out;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { title, scripture, preacher, date, scriptureText };
}

// ── 추출 본체 ────────────────────────────────────────────────────────────────
// PDF 경로 → 구조화 JSON({date,title,scripture,preacher,scriptureText,body[]}).
// 띄어쓰기 보정(LLM)은 이 단계 밖에서 body 에만 적용한다(fix-note-spacing.mjs).
export async function extractNote(pdfPath) {
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await getDocument({ data }).promise;

  // 전 페이지 아이템 선로딩 → 본문 높이 동적 검출
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) pages.push((await loadItems(doc, p)).items);
  const bodyH = detectBodyHeight(pages);
  const isBody = makeIsBody(bodyH);

  // 전 페이지 본문 줄 수집(페이지 순서대로, 각 페이지 내 1단→2단→3단)
  const allOrdered = [];
  let bodyTopY1 = 0; // 1페이지 본문 최상단 y(헤더 경계)
  for (let p = 1; p <= doc.numPages; p++) {
    const lines = buildColumnLines(pages[p - 1], isBody);
    const bodyLines = bodyLinesForPage(lines);
    if (p === 1 && bodyLines.length) bodyTopY1 = Math.max(...bodyLines.map((l) => l.y));
    for (const ln of bodyLines) allOrdered.push(ln);
  }

  const meta = extractMeta(pages[0], bodyTopY1);

  let paras = foldParagraphs(allOrdered);

  // "축원합니다."까지만 (그 이후 잔여 제거)
  const endIdx = paras.findIndex((p) => p.includes('축원합니다'));
  if (endIdx >= 0) {
    const p = paras[endIdx];
    const cut = p.indexOf('축원합니다');
    paras = paras.slice(0, endIdx).concat(p.slice(0, cut + '축원합니다.'.length));
  }

  const dateFromName = basename(pdfPath).replace(/\D/g, '').slice(0, 8);
  const isoFromName = dateFromName.length === 8
    ? `${dateFromName.slice(0, 4)}-${dateFromName.slice(4, 6)}-${dateFromName.slice(6, 8)}`
    : '';

  return {
    date: meta.date || isoFromName,
    title: meta.title,
    scripture: meta.scripture,
    preacher: meta.preacher,
    scriptureText: meta.scriptureText,
    body: paras,
  };
}

// ── CLI(직접 실행 시에만) ─────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pdfPath = process.argv[2] || 'public/data/notes/20260614.pdf';
  const doWrite = process.argv.includes('--write');
  const result = await extractNote(pdfPath);
  console.log(JSON.stringify(result, null, 2));
  if (doWrite) {
    const dateFromName = basename(pdfPath).replace(/\D/g, '').slice(0, 8);
    mkdirSync('public/data/notes-text', { recursive: true });
    const out = `public/data/notes-text/${dateFromName}.json`;
    writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
    console.error(`\n[written] ${out}`);
  }
}
