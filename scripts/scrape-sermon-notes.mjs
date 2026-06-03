// 수영로교회 "말씀나눔지"(수영로편지 PDF) 스크래퍼
// ──────────────────────────────────────────────────────────────────────────
// elibrary 게시판(lcode=HOM, mcode=H11)의 주간 나눔지(설교 요약 PDF)를 긁어
// public/data/sermon-notes.json 으로 저장하고, "말씀:ON" 영상(bibleon.json)에
// 정규화 제목으로 매칭해 각 영상에 noteSeq / notePdfUrl 을 연결한다.
//
// - 목록(noticeForm.jsp)은 페이저가 없어 최신 1페이지(약 10건)만 반환한다.
//   → 목록의 seq 범위(최대 seq)에서 상세(boardSub.jsp)를 seq 내림차순으로 순회해
//     영상 범위(가장 오래된 영상 주차)까지 수집한다.
// - 상세 페이지에 PDF 절대경로(/hompi/files/...pdf)가 직접 들어 있다. 한글/공백
//   파일명은 퍼센트인코딩해 원본 절대 URL로 저장한다.
// - 영상에 없는 특별호 나눔지(예: 영문 예배)는 notes 에는 남기되 영상엔 연결하지 않는다.
//
// 실행: node scripts/scrape-sermon-notes.mjs  (scrape-bibleon.mjs 이후 실행 권장)
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'data');

const ORIGIN = 'https://www.sooyoungro.org';
const CONTAINER = `${ORIGIN}/main/new-layout/syrintro/elibrary.jsp?tab=tab1`; // 세션/Referer
const LIST = `${ORIGIN}/main/new-layout/board/noticeForm.jsp?lcode=HOM&mcode=H11`;
const DETAIL = (seq) => `${ORIGIN}/main/new-layout/board/boardSub.jsp?lcode=HOM&mcode=H11&seq=${seq}`;
const UA = 'Mozilla/5.0 (compatible; SYMusicBot/1.0; +https://github.com/syrccm/symusic)';
const SCAN_MARGIN = 30; // 최대 seq 에서 더 내려가며 훑을 상한(런어웨이 방지)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url, cookie) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: CONTAINER, ...(cookie ? { Cookie: cookie } : {}) },
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // charset: 검증상 UTF-8 정상. 깨질 경우(치환문자 다수) EUC-KR 폴백.
  let html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if ((html.match(/�/g) || []).length > 5) html = new TextDecoder('euc-kr').decode(buf);
  return { html, setCookie: res.headers.get('set-cookie') };
}

// 제목 정규화: 모든 공백 제거 + 언더스코어·물음표·느낌표·쉼표·마침표·따옴표·괄호 등 문장부호 제거 + 소문자
const normTitle = (s) =>
  (s || '')
    .replace(/\s+/g, '')
    .replace(/[_?!,.'"“”‘’「」『』《》<>()\[\]{}:;~∼…·・、，。！？\-–—\/]/g, '')
    .trim()
    .toLowerCase();

// 한글/공백 포함 경로를 세그먼트 단위로 퍼센트인코딩(슬래시는 유지)
const encPath = (p) => p.split('/').map((seg) => encodeURIComponent(seg)).join('/');

// 상세 HTML 파싱: 제목 <div class="titlebox"><font>, 날짜 <span class="dates">,
// PDF class='filedownload' href='/hompi/files/...pdf'
function parseDetail(html) {
  const title = (html.match(/<div class="titlebox">\s*<font[^>]*>\s*([^<]+?)\s*<\/font>/i) || [])[1] || null;
  const date = (html.match(/<span class="dates">\s*([^<]+?)\s*<\/span>/i) || [])[1] || null;
  const rawPdf = (html.match(/class='filedownload'[\s\S]*?href='([^']+\.pdf)'/i) || [])[1] || null;
  const pdfUrl = rawPdf ? `${ORIGIN}${encPath(rawPdf)}` : null;
  return { title, date, pdfUrl };
}

const parseDate = (s) => {
  const m = (s || '').match(/(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // 1) 세션 쿠키
  const { setCookie } = await fetchHtml(CONTAINER);
  const cookie = (setCookie || '').split(';')[0] || undefined;
  console.log(`[1/4] 세션 쿠키: ${cookie ? cookie.split('=')[0] : '(없음)'}`);

  // 2) 목록에서 seq 범위 파악(페이저 없음 → 최신 1페이지)
  const { html: listHtml } = await fetchHtml(LIST, cookie);
  const listSeqs = [...new Set([...listHtml.matchAll(/boardSub\.jsp\?lcode=HOM&mcode=H11&seq=(\d+)/g)].map((m) => +m[1]))];
  if (listSeqs.length === 0) throw new Error('목록 파싱 0건 — 페이지 구조 변경 가능성');
  const maxSeq = Math.max(...listSeqs);
  console.log(`[2/4] 목록 seq: ${Math.min(...listSeqs)}~${maxSeq} (${listSeqs.length}건)`);

  // 영상(매칭/스캔 범위 기준)
  const bibleonFile = join(OUT_DIR, 'bibleon.json');
  const bibleon = existsSync(bibleonFile) ? JSON.parse(await readFile(bibleonFile, 'utf8')) : null;
  const vidDates = (bibleon?.items ?? []).map((v) => parseDate(v.date)).filter(Boolean);
  const oldestVid = vidDates.length ? new Date(Math.min(...vidDates.map((d) => +d))) : null;

  // 3) 상세 순회(seq 내림차순). 영상 가장 오래된 주차보다 2건 더 과거면 종료.
  const notes = [];
  let below = 0;
  for (let seq = maxSeq; seq >= maxSeq - SCAN_MARGIN; seq--) {
    const { html } = await fetchHtml(DETAIL(seq), cookie);
    const p = parseDetail(html);
    await sleep(250); // 서버 부하 방지
    if (!p.title) continue;
    const dt = parseDate(p.date);
    notes.push({ seq, title: p.title, date: p.date, pdfUrl: p.pdfUrl, normTitle: normTitle(p.title) });
    if (oldestVid && dt && dt < oldestVid) {
      below += 1;
      if (below >= 2) break;
    }
  }
  notes.sort((a, b) => b.seq - a.seq);
  const pdfMiss = notes.filter((n) => !n.pdfUrl).length;
  console.log(`[3/4] 나눔지 수집: ${notes.length}건 (PDF 누락 ${pdfMiss}건)`);

  // 4) sermon-notes.json 저장(변경 없으면 생략)
  const payload = {
    updatedAt: new Date().toISOString(),
    source: CONTAINER,
    count: notes.length,
    notes,
  };
  const outFile = join(OUT_DIR, 'sermon-notes.json');
  const prev = existsSync(outFile) ? JSON.parse(await readFile(outFile, 'utf8')) : null;
  if (prev && JSON.stringify(prev.notes) === JSON.stringify(payload.notes)) {
    console.log('변경 없음 — sermon-notes.json 갱신 생략');
  } else {
    await writeFile(outFile, JSON.stringify(payload, null, 2) + '\n');
    console.log(`[4/4] 저장: sermon-notes.json (${notes.length}건)`);
  }

  // 5) 영상 ↔ 나눔지 매핑(정규화 제목 기준). bibleon.json 에 noteSeq/notePdfUrl 반영.
  if (!bibleon) {
    console.log('bibleon.json 없음 — 매핑 생략');
    return;
  }
  const byNorm = new Map();
  notes.forEach((n) => { if (!byNorm.has(n.normTitle)) byNorm.set(n.normTitle, n); });
  let mapped = 0;
  const items = bibleon.items.map((v) => {
    const n = byNorm.get(normTitle(v.title));
    const { noteSeq, notePdfUrl, ...rest } = v; // 기존 매핑 제거 후 재계산
    if (n && n.pdfUrl) {
      mapped += 1;
      return { ...rest, noteSeq: n.seq, notePdfUrl: n.pdfUrl };
    }
    console.log(`[UNMATCHED] ${v.date} #${v.seq} "${v.title}"`);
    return { ...rest };
  });
  console.log(`매핑: ${mapped}/${items.length} 영상에 나눔지 연결`);

  const nextBibleon = { ...bibleon, items };
  if (JSON.stringify(bibleon.items) === JSON.stringify(items)) {
    console.log('bibleon 매핑 변경 없음 — 갱신 생략');
  } else {
    await writeFile(bibleonFile, JSON.stringify(nextBibleon, null, 2) + '\n');
    console.log('bibleon.json 매핑 반영 완료');
  }
}

main().catch((e) => {
  console.error('스크래핑 실패:', e);
  process.exit(1);
});
