// 수영로교회 교역자/장로 명단 스크래퍼
// ──────────────────────────────────────────────────────────────────────────
// 수영로교회 공식 페이지의 직분별 조각(JSP) 페이지를 받아 cheerio로 파싱하고,
// 사진을 앱 도메인(public/data/ministers/)으로 미러링한 뒤
// public/data/ministers.json 으로 정규화해 저장한다.
//
// - 사이트 URL 구조는 고정. 바뀌는 것은 명단 안의 "사람"뿐이므로
//   파서는 한 번 맞춰두면 사람이 교체돼도 수정 없이 동작한다.
// - 개인정보(전화·이메일)는 수집/저장하지 않는다.
// - 장로는 "시무장로"만 포함한다(원로·은퇴 제외).
//
// 실행: node scripts/scrape-ministers.mjs
// (주 1회 GitHub Actions가 자동 실행 → 변경분만 커밋)
import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readdir, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'data');
const IMG_DIR = join(OUT_DIR, 'ministers');

const ORIGIN = 'https://www.sooyoungro.org';
const BASE = `${ORIGIN}/main/new-layout/syrintro`;
const REFERER = `${BASE}/minister.jsp`;
const UA = 'Mozilla/5.0 (compatible; SYMusicBot/1.0; +https://github.com/syrccm/symusic)';

// 직분별 소스. list = minist_list.jsp 공통 구조, elder = minister_05.jsp(별도 구조).
const SOURCES = [
  { role: '목사', url: `${BASE}/minist_list.jsp?duty=73`, type: 'list' },
  { role: '강도사', url: `${BASE}/minist_list.jsp?duty=61`, type: 'list' },
  { role: '전임전도사', url: `${BASE}/minist_list.jsp?duty=51,52,57`, type: 'list' },
  { role: '교육전도사', url: `${BASE}/minist_list.jsp?duty=53`, type: 'list' },
  { role: '장로', url: `${BASE}/minister_05.jsp`, type: 'elder', section: '시무장로' },
];

// text_box01 의 "이름 직분"에서 직분 접미사를 떼어 이름만 추출
const stripTitle = (s) =>
  s.replace(/\s*(원로장로|은퇴장로|시무장로|목사|강도사|전도사)$/, '').trim();

// 상대/절대 사진 경로를 절대 URL로 변환
const toAbsUrl = (src) =>
  src.startsWith('/') ? `${ORIGIN}${src}` : `${BASE}/${src.replace(/^\.\//, '')}`;

// 소스 경로 기준 결정적 파일명(한글 파일명을 ASCII 해시로 — 같은 사진이면 같은 파일)
const photoFileName = (absUrl) => {
  const hash = createHash('sha1').update(absUrl).digest('hex').slice(0, 12);
  const ext = (absUrl.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
  return `${hash}.${/^(jpg|jpeg|png|gif|webp)$/.test(ext) ? ext : 'jpg'}`;
};

async function fetchText(url, cookie) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: REFERER, ...(cookie ? { Cookie: cookie } : {}) },
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const setCookie = res.headers.get('set-cookie');
  return { html: await res.text(), setCookie };
}

// div-box 한 개(=교역자 1명)를 정규화. 제외 대상이면 null.
function parseBox($, el, role) {
  const $el = $(el);
  if (($el.attr('style') || '').includes('display:none')) return null; // 숨김 카드 제외

  const raw = $el.find('.text_box01').first().text().trim().replace(/\s+/g, ' ');
  if (!raw) return null;
  const name = stripTitle(raw);
  if (!name) return null;

  const src = $el.find('.img_box img').first().attr('src');
  if (!src) return null;
  const absUrl = toAbsUrl(src.trim());

  // 부서/담당: list = "사역 : XXX", elder = "담당사역: XXX"(또는 라벨 없는 사역 줄)
  let department = '';
  const ps = $el
    .find('.text_box02 p')
    .map((_, p) => $(p).text().trim().replace(/\s+/g, ' '))
    .get();
  for (const t of ps) {
    if (/^사역\s*[:：]/.test(t)) department = t.replace(/^사역\s*[:：]\s*/, '').trim();
    else if (/담당사역/.test(t)) department = t.replace(/^담당사역\s*[:：]?\s*/, '').trim();
  }
  // elder 폴백: 시무기간/추대일이 아닌 첫 줄을 담당으로
  if (!department && role === '장로') {
    department = ps.find((t) => t && !/^시무기간|^추\s*대\s*일/.test(t)) || '';
  }

  return { role, name, department, absUrl, photoUrl: `/data/ministers/${photoFileName(absUrl)}` };
}

function parseList(html, role) {
  const $ = load(html);
  const out = [];
  $('.minister .div-box').each((_, el) => {
    const m = parseBox($, el, role);
    if (m) out.push(m);
  });
  return out;
}

// 장로: minister_title(원로/은퇴/시무) 섹션 중 지정 섹션만
function parseElder(html, role, section) {
  const $ = load(html);
  const out = [];
  $('.minister_title').each((_, t) => {
    if ($(t).text().trim() !== section) return;
    const $block = $(t).nextAll('.minister').first();
    $block.find('.div-box').each((_, el) => {
      const m = parseBox($, el, role);
      if (m) out.push(m);
    });
  });
  return out;
}

async function downloadPhoto(absUrl, fileName, cookie) {
  const dest = join(IMG_DIR, fileName);
  if (existsSync(dest)) return; // 결정적 파일명 → 이미 있으면 동일 사진, 재다운로드 불필요
  const res = await fetch(encodeURI(absUrl), {
    headers: { 'User-Agent': UA, Referer: REFERER, ...(cookie ? { Cookie: cookie } : {}) },
  });
  if (!res.ok) throw new Error(`IMG ${absUrl} → ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  await mkdir(IMG_DIR, { recursive: true });

  // 1) 컨테이너 호출로 세션 쿠키 확보
  const { setCookie } = await fetchText(REFERER);
  const cookie = (setCookie || '').split(';')[0] || undefined;
  console.log(`[1/4] 세션 쿠키: ${cookie ? cookie.split('=')[0] : '(없음)'}`);

  // 2) 5개 엔드포인트 파싱
  const ministers = [];
  for (const s of SOURCES) {
    const { html } = await fetchText(s.url, cookie);
    const items = s.type === 'elder' ? parseElder(html, s.role, s.section) : parseList(html, s.role);
    items.forEach((m, i) => ministers.push({ ...m, order: i }));
    console.log(`[2/4] ${s.role}: ${items.length}명`);
  }

  // 3) 사진 미러링 + 사용 파일 집합 수집
  const kept = new Set();
  let downloaded = 0;
  for (const m of ministers) {
    const fileName = m.photoUrl.split('/').pop();
    kept.add(fileName);
    if (!existsSync(join(IMG_DIR, fileName))) {
      try {
        await downloadPhoto(m.absUrl, fileName, cookie);
        downloaded += 1;
      } catch (e) {
        console.warn(`  ! 사진 실패 (${m.name}): ${e.message}`);
      }
    }
  }
  console.log(`[3/4] 사진: 신규 ${downloaded}장 / 전체 ${kept.size}장`);

  // 4) 더 이상 쓰이지 않는 사진 정리
  let removed = 0;
  for (const f of await readdir(IMG_DIR)) {
    if (/^[0-9a-f]{12}\.(jpg|jpeg|png|gif|webp)$/.test(f) && !kept.has(f)) {
      await unlink(join(IMG_DIR, f));
      removed += 1;
    }
  }

  // JSON 저장 (absUrl 등 내부 필드는 제외하고 공개 스키마만)
  const payload = {
    updatedAt: new Date().toISOString(),
    source: REFERER,
    count: ministers.length,
    ministers: ministers.map(({ role, name, photoUrl, department, order }) => ({
      role,
      name,
      photoUrl,
      department,
      order,
    })),
  };

  // 변경 없으면(updatedAt 제외) 파일을 다시 쓰지 않아 불필요한 커밋 방지
  const outFile = join(OUT_DIR, 'ministers.json');
  const prev = existsSync(outFile) ? JSON.parse(await readFile(outFile, 'utf8')) : null;
  const sameData =
    prev && JSON.stringify(prev.ministers) === JSON.stringify(payload.ministers) && removed === 0;
  if (sameData) {
    console.log('[4/4] 명단 변경 없음 — JSON 갱신 생략');
    return;
  }
  await writeFile(outFile, JSON.stringify(payload, null, 2) + '\n');
  console.log(`[4/4] 저장 완료: ${ministers.length}명, 사진 정리 ${removed}장`);
}

main().catch((e) => {
  console.error('스크래핑 실패:', e);
  process.exit(1);
});
