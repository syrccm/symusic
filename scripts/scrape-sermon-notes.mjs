// 수영로교회 "말씀나눔지"(수영로편지 PDF) 스크래퍼 + 미러링
// ──────────────────────────────────────────────────────────────────────────
// elibrary 게시판(lcode=HOM, mcode=H11)의 주간 나눔지(설교 요약 PDF)를 긁어
// "말씀:ON" 영상(bibleon.json)에 정규화 제목으로 매칭하고, 영상 설교일이 최근
// 60일 이내인 나눔지의 PDF를 교회 서버에서 받아 public/data/notes/ 에 미러링한다.
// 60일이 지난 PDF는 삭제하고 매핑도 제거(버튼 자동 소멸)한다 — 멱등하게 동작.
//
// - 보관 기준은 "영상 설교일"(나눔지 발행일 아님 — 경계 어긋남 방지).
// - 미러 파일명은 영상 날짜 기준: notes/YYYYMMDD.pdf
// - 매핑 경로(bibleon.json / sermon-notes.json)는 교회 절대 URL이 아니라
//   저장소 정적 경로(/data/notes/YYYYMMDD.pdf)로 저장 → 프론트는 CORS/referer 무관.
// - 목록(noticeForm.jsp)은 페이저가 없어 최신 1페이지만 반환 → 상세(boardSub.jsp)를
//   seq 내림차순으로 순회해 영상 범위까지 수집한다.
// - PDF 다운로드에는 Referer 가 필요하다(없으면 빈 응답). 한글/공백 경로는 퍼센트인코딩.
//
// 실행: node scripts/scrape-sermon-notes.mjs  (scrape-bibleon.mjs 이후 실행)
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'data');
const NOTES_DIR = join(OUT_DIR, 'notes');

const ORIGIN = 'https://www.sooyoungro.org';
const CONTAINER = `${ORIGIN}/main/new-layout/syrintro/elibrary.jsp?tab=tab1`; // 세션/Referer
const LIST = `${ORIGIN}/main/new-layout/board/noticeForm.jsp?lcode=HOM&mcode=H11`;
const DETAIL = (seq) => `${ORIGIN}/main/new-layout/board/boardSub.jsp?lcode=HOM&mcode=H11&seq=${seq}`;
const UA = 'Mozilla/5.0 (compatible; SYMusicBot/1.0; +https://github.com/syrccm/symusic)';
const SCAN_MARGIN = 30; // 최대 seq 에서 더 내려가며 훑을 상한(런어웨이 방지)
const RETENTION_DAYS = 60; // 영상 설교일 기준 보관 기간
const DAY = 86400000;
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

// referer 붙여 PDF를 받아 dest 로 저장(매직넘버 검증). 이미 있으면 재다운로드 생략.
async function mirrorPdf(url, dest, cookie) {
  if (existsSync(dest)) return 'kept';
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: CONTAINER, ...(cookie ? { Cookie: cookie } : {}) },
  });
  if (!res.ok) throw new Error(`PDF GET ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.slice(0, 4).toString('latin1') !== '%PDF') throw new Error(`PDF 매직넘버 불일치: ${url}`);
  await writeFile(dest, buf);
  return `saved(${buf.length}B)`;
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

// 상세 HTML 파싱: 제목 <div class="titlebox"><font>, PDF class='filedownload' href='/hompi/...pdf'
function parseDetail(html) {
  const title = (html.match(/<div class="titlebox">\s*<font[^>]*>\s*([^<]+?)\s*<\/font>/i) || [])[1] || null;
  const date = (html.match(/<span class="dates">\s*([^<]+?)\s*<\/span>/i) || [])[1] || null;
  const rawPdf = (html.match(/class='filedownload'[\s\S]*?href='([^']+\.pdf)'/i) || [])[1] || null;
  const churchPdfUrl = rawPdf ? `${ORIGIN}${encPath(rawPdf)}` : null;
  return { title, date, churchPdfUrl };
}

const parseDate = (s) => {
  const m = (s || '').match(/(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const ymd = (s) => (s || '').replace(/\D/g, ''); // "2026.05.24" → "20260524"

async function main() {
  await mkdir(NOTES_DIR, { recursive: true });

  // 1) 세션 쿠키
  const { setCookie } = await fetchHtml(CONTAINER);
  const cookie = (setCookie || '').split(';')[0] || undefined;
  console.log(`[1/6] 세션 쿠키: ${cookie ? cookie.split('=')[0] : '(없음)'}`);

  // 2) 목록에서 seq 범위(페이저 없음 → 최신 1페이지)
  const { html: listHtml } = await fetchHtml(LIST, cookie);
  const listSeqs = [...new Set([...listHtml.matchAll(/boardSub\.jsp\?lcode=HOM&mcode=H11&seq=(\d+)/g)].map((m) => +m[1]))];
  if (listSeqs.length === 0) throw new Error('목록 파싱 0건 — 페이지 구조 변경 가능성');
  const maxSeq = Math.max(...listSeqs);
  console.log(`[2/6] 목록 seq: ${Math.min(...listSeqs)}~${maxSeq} (${listSeqs.length}건)`);

  // 영상
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
    notes.push({ seq, title: p.title, date: p.date, churchPdfUrl: p.churchPdfUrl, normTitle: normTitle(p.title) });
    if (oldestVid && dt && dt < oldestVid) {
      below += 1;
      if (below >= 2) break;
    }
  }
  console.log(`[3/6] 나눔지 수집: ${notes.length}건 (seq ${notes[notes.length - 1]?.seq}~${notes[0]?.seq})`);

  // 4) 영상 ↔ 나눔지 매칭 + 60일 이내 PDF 미러링
  const noteByNorm = new Map();
  notes.forEach((n) => { if (!noteByNorm.has(n.normTitle)) noteByNorm.set(n.normTitle, n); });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const keepFiles = new Set(); // 유지할 미러 파일명
  const mirroredByNorm = new Map(); // normTitle → /data/notes/...pdf
  let mapped = 0, mirrored = 0;

  const items = bibleon ? [] : null;
  if (bibleon) {
    for (const v of bibleon.items) {
      const { noteSeq, notePdfUrl, ...rest } = v; // 기존 매핑 제거 후 재계산
      const n = noteByNorm.get(normTitle(v.title));
      const vd = parseDate(v.date);
      const ageDays = vd ? Math.floor((startOfToday - vd) / DAY) : Infinity;

      if (n && n.churchPdfUrl && ageDays <= RETENTION_DAYS) {
        const fname = `${ymd(v.date)}.pdf`;
        const dest = join(NOTES_DIR, fname);
        const localUrl = `/data/notes/${fname}`;
        try {
          const how = await mirrorPdf(n.churchPdfUrl, dest, cookie);
          keepFiles.add(fname);
          mirroredByNorm.set(n.normTitle, localUrl);
          mapped += 1;
          if (how.startsWith('saved')) mirrored += 1;
          console.log(`  미러 ${v.date} #${v.seq} "${v.title}" → ${localUrl} [${how}, ${ageDays}일]`);
          items.push({ ...rest, noteSeq: n.seq, notePdfUrl: localUrl });
        } catch (e) {
          console.log(`  [MIRROR-FAIL] ${v.date} #${v.seq} "${v.title}": ${e.message}`);
          items.push({ ...rest });
        }
      } else {
        if (!n) console.log(`  [UNMATCHED] ${v.date} #${v.seq} "${v.title}"`);
        else if (ageDays > RETENTION_DAYS) console.log(`  만료(미러 제외) ${v.date} #${v.seq} "${v.title}" [${ageDays}일 > ${RETENTION_DAYS}]`);
        items.push({ ...rest });
      }
    }
  }
  console.log(`[4/6] 매핑 ${mapped}건 (신규 다운로드 ${mirrored}건)`);

  // 5) 만료/고아 정리: keepFiles 에 없는 notes/*.pdf 삭제
  const existing = (await readdir(NOTES_DIR)).filter((f) => f.toLowerCase().endsWith('.pdf'));
  let removed = 0;
  for (const f of existing) {
    if (!keepFiles.has(f)) {
      await unlink(join(NOTES_DIR, f));
      removed += 1;
      console.log(`  삭제 notes/${f} (60일 초과/고아)`);
    }
  }
  console.log(`[5/6] 정리: 유지 ${keepFiles.size}건, 삭제 ${removed}건`);

  // 경계 로그: 가장 오래된 영상의 만료 여부
  if (oldestVid) {
    const oldAge = Math.floor((startOfToday - oldestVid) / DAY);
    const oldStr = `${oldestVid.getFullYear()}.${String(oldestVid.getMonth() + 1).padStart(2, '0')}.${String(oldestVid.getDate()).padStart(2, '0')}`;
    console.log(`  경계: 최古 영상 ${oldStr} = ${oldAge}일 → ${oldAge <= RETENTION_DAYS ? '유지 대상' : '삭제선 초과'}`);
  }

  // 6) sermon-notes.json 저장(미러 경로 반영). 미러 안 된 노트는 pdfUrl=null.
  const outNotes = notes.map((n) => ({
    seq: n.seq,
    title: n.title,
    date: n.date,
    pdfUrl: mirroredByNorm.get(n.normTitle) ?? null,
    normTitle: n.normTitle,
  }));
  const payload = {
    updatedAt: new Date().toISOString(),
    source: CONTAINER,
    retentionDays: RETENTION_DAYS,
    count: outNotes.length,
    notes: outNotes,
  };
  const outFile = join(OUT_DIR, 'sermon-notes.json');
  const prevNotes = existsSync(outFile) ? JSON.parse(await readFile(outFile, 'utf8')) : null;
  if (prevNotes && JSON.stringify(prevNotes.notes) === JSON.stringify(payload.notes)) {
    console.log('sermon-notes.json 변경 없음 — 갱신 생략');
  } else {
    await writeFile(outFile, JSON.stringify(payload, null, 2) + '\n');
    console.log(`[6/6] 저장: sermon-notes.json (${outNotes.length}건)`);
  }

  // bibleon.json 매핑 반영
  if (bibleon) {
    if (JSON.stringify(bibleon.items) === JSON.stringify(items)) {
      console.log('bibleon 매핑 변경 없음 — 갱신 생략');
    } else {
      await writeFile(bibleonFile, JSON.stringify({ ...bibleon, items }, null, 2) + '\n');
      console.log('bibleon.json 매핑 반영 완료');
    }
  } else {
    console.log('bibleon.json 없음 — 매핑 생략');
  }
}

main().catch((e) => {
  console.error('스크래핑 실패:', e);
  process.exit(1);
});
