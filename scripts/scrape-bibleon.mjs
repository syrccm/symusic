// 수영로교회 "말씀:ON"(메세지:ON, 3분 설교요약 VOD) 스크래퍼
// ──────────────────────────────────────────────────────────────────────────
// worshiptvForm.jsp(lcode=09, mcode=74)의 funcVodShow(...) 호출을 파싱해
// public/data/bibleon.json 으로 저장한다. 영상은 전부 유튜브 임베드라
// 사진/영상 미러링은 하지 않고 youtubeId 문자열만 저장한다.
//
// - 라이프:ON(mcode=75)은 가져오지 않는다. 메세지:ON(mcode=74)만.
// - 목록에 동일 항목이 여러 번 나오므로 seq 기준 중복 제거.
//
// 실행: node scripts/scrape-bibleon.mjs
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'data');

const BASE = 'https://www.sooyoungro.org/main/new-layout/syrtv';
const CONTAINER = `${BASE}/bibleontv.jsp?tab=tab1`;
const LIST = `${BASE}/worshiptvForm.jsp?lcode=09&mcode=74`; // 메세지:ON
const UA = 'Mozilla/5.0 (compatible; SYMusicBot/1.0; +https://github.com/syrccm/symusic)';

async function fetchText(url, cookie) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: CONTAINER, ...(cookie ? { Cookie: cookie } : {}) },
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return { html: await res.text(), setCookie: res.headers.get('set-cookie') };
}

// <a href="javascript:funcVodShow('09','74','20260524',327,'Y','//www.youtube.com/embed/{ID}',...)">제목</a>
function parse(html) {
  const re = /funcVodShow\(([^)]*)\)[^>]*>\s*([^<]+?)\s*</g;
  const seen = new Set();
  const items = [];
  let m;
  while ((m = re.exec(html))) {
    const args = m[1];
    const title = m[2];
    const date = (args.match(/'(\d{8})'/) || [])[1];
    const seqM = args.match(/'(\d{8})'\s*,\s*(\d+)/);
    const seq = seqM ? parseInt(seqM[2], 10) : null;
    const youtubeId = (args.match(/embed\/([A-Za-z0-9_-]+)/) || [])[1];
    if (seq == null || !youtubeId) continue;
    if (seen.has(seq)) continue; // seq 기준 dedupe
    seen.add(seq);
    const fdate = date
      ? `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)}`
      : '';
    items.push({ date: fdate, seq, youtubeId, title });
  }
  // seq(=날짜) 내림차순, 최신이 위
  items.sort((a, b) => b.seq - a.seq);
  return items;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const { setCookie } = await fetchText(CONTAINER);
  const cookie = (setCookie || '').split(';')[0] || undefined;
  console.log(`[1/2] 세션 쿠키: ${cookie ? cookie.split('=')[0] : '(없음)'}`);

  const { html } = await fetchText(LIST, cookie);
  const items = parse(html);
  console.log(`[2/2] 메세지:ON 항목: ${items.length}건`);
  if (items.length === 0) throw new Error('파싱 결과 0건 — 페이지 구조 변경 가능성');

  const payload = {
    updatedAt: new Date().toISOString(),
    source: CONTAINER,
    count: items.length,
    items,
  };

  // 변경 없으면(updatedAt 제외) 다시 쓰지 않아 불필요한 커밋 방지
  const outFile = join(OUT_DIR, 'bibleon.json');
  const prev = existsSync(outFile) ? JSON.parse(await readFile(outFile, 'utf8')) : null;
  if (prev && JSON.stringify(prev.items) === JSON.stringify(payload.items)) {
    console.log('변경 없음 — JSON 갱신 생략');
    return;
  }
  await writeFile(outFile, JSON.stringify(payload, null, 2) + '\n');
  console.log(`저장 완료: ${items.length}건`);
}

main().catch((e) => {
  console.error('스크래핑 실패:', e);
  process.exit(1);
});
