// 말씀나눔지 PDF → 구조화 JSON 파이프라인 (STEP 3a)
// ──────────────────────────────────────────────────────────────────────────
// extract-note-text(본문·메타) + extract-note-meeting(나눔질문·기도제목)
// + fix-note-spacing(LLM 띄어쓰기 보정 + 검증 게이트 + 원문 글리프 재구성)
// 을 하나로 묶어, PDF 한 개 → public/data/notes-text/[날짜].json 한 개를 만든다.
//
// 사용:
//   node scripts/build-note-json.mjs                 # notes/ 의 PDF 중 "JSON 없는 신규만" 변환
//   node scripts/build-note-json.mjs --force          # 전체 재생성(기존 JSON 덮어쓰기)
//   node scripts/build-note-json.mjs <pdf경로> [...]  # 지정한 PDF만(역시 신규만, --force 시 전체)
// 전체(폴더) 모드에선 PDF가 없는 notes-text/*.json(고아)을 자동 삭제하고 index.json 을 재생성한다.
// API 키는 .env 또는 환경변수(ANTHROPIC_API_KEY)에서 읽는다. 키 없거나 API 실패 시 원문 폴백.
import { readdirSync, mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { extractNote } from './extract-note-text.mjs';
import { extractMeeting } from './extract-note-meeting.mjs';
import { correctBody, loadEnvKey } from './fix-note-spacing.mjs';

const NOTES_DIR = 'public/data/notes';
const OUT_DIR = 'public/data/notes-text';

// 한 PDF를 변환해 JSON 객체를 만든다. client 가 null 이면 보정 없이 원문.
async function buildOne(pdfPath, client) {
  const note = await extractNote(pdfPath); // {date,title,scripture,preacher,scriptureText,body}
  const meeting = await extractMeeting(pdfPath); // {questions,prayers,garbled}

  const counts = { fixed: 0, reverted: 0, error: 0 };
  const fix = async (arr) => {
    if (!client || !arr.length) return arr;
    const { paras } = await correctBody(client, arr, { onLog: (r) => counts[r.status]++ });
    return paras;
  };

  const body = await fix(note.body);
  const questions = await fix(meeting.questions);
  const prayers = await fix(meeting.prayers);

  const json = {
    date: note.date,
    title: note.title,
    scripture: note.scripture,
    preacher: note.preacher,
    scriptureText: note.scriptureText,
    body,
    questions,
    prayers,
  };
  return { json, counts, garbled: meeting.garbled };
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const pdfArgs = args.filter((a) => a !== '--force');
const fullMode = pdfArgs.length === 0; // 폴더 전체 모드(고아 정리 수행)
const pdfs = fullMode
  ? readdirSync(NOTES_DIR)
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .sort()
      .map((f) => join(NOTES_DIR, f))
  : pdfArgs;

const key = loadEnvKey();
const client = key ? new Anthropic({ apiKey: key }) : null;
if (!client) console.log('⚠️ ANTHROPIC_API_KEY 없음 — 보정 없이 원문으로 생성합니다.\n');

mkdirSync(OUT_DIR, { recursive: true });

console.log(`### 대상 ${pdfs.length}개 PDF${force ? ' (--force 전체 재생성)' : ' (신규만)'}\n`);
const summary = [];
let made = 0, skipped = 0;
for (const pdfPath of pdfs) {
  const dateName = basename(pdfPath).replace(/\D/g, '').slice(0, 8);
  const out = join(OUT_DIR, `${dateName}.json`);
  // 이미 JSON 있으면 스킵(신규만 보정). --force 면 전체 재생성.
  if (!force && existsSync(out)) {
    skipped++;
    console.log(`⏭️  ${dateName}.json 이미 있음 — 스킵`);
    continue;
  }
  try {
    const { json, counts, garbled } = await buildOne(pdfPath, client);
    writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
    made++;
    const tot = counts.fixed + counts.reverted + counts.error;
    const bodyChars = json.body.reduce((a, p) => a + p.length, 0);
    const g = garbled.length ? ` / 깨진글자 ${garbled.reduce((a, x) => a + x.codepoints.length, 0)}자(${garbled.length}줄)` : '';
    console.log(
      `✅ ${dateName}.json  본문 ${bodyChars}자(${json.body.length}문단)·질문 ${json.questions.length}·기도 ${json.prayers.length}·성경 ${(json.scriptureText || '').length}자` +
      `  | 보정 채택 ${counts.fixed}/폐기 ${counts.reverted}/실패 ${counts.error} (총 ${tot})${g}`
    );
    summary.push({ dateName, ...counts, garbled: garbled.length });
  } catch (err) {
    console.log(`❌ ${dateName}: ${err?.message || err} (이 PDF만 건너뜀)`);
  }
}

// 고아 정리: notes/ 에 PDF 없는 notes-text/*.json 삭제 (폴더 전체 모드에서만)
let removed = 0;
if (fullMode) {
  const pdfDates = new Set(
    readdirSync(NOTES_DIR).filter((f) => f.toLowerCase().endsWith('.pdf')).map((f) => f.replace(/\D/g, '').slice(0, 8))
  );
  for (const f of readdirSync(OUT_DIR).filter((f) => /^\d{8}\.json$/.test(f))) {
    if (!pdfDates.has(f.replace('.json', ''))) {
      unlinkSync(join(OUT_DIR, f));
      removed++;
      console.log(`🗑️  고아 삭제 ${f} (대응 PDF 없음)`);
    }
  }
}

const sum = summary.reduce(
  (a, s) => ({ fixed: a.fixed + s.fixed, reverted: a.reverted + s.reverted, error: a.error + s.error }),
  { fixed: 0, reverted: 0, error: 0 }
);
console.log(`\n=== 요약: 신규 ${made}개 생성 / 스킵 ${skipped}개 / 고아 ${removed}개 삭제 · 보정(채택 ${sum.fixed}/폐기 ${sum.reverted}/실패 ${sum.error}) ===`);

// 목록 인덱스(index.json) 재생성 — OUT_DIR 의 모든 노트를 읽어 날짜 내림차순.
// 앱(사랑방 화면)이 어떤 노트들이 있는지 이걸로 파악한다.
const indexEntries = readdirSync(OUT_DIR)
  .filter((f) => /^\d{8}\.json$/.test(f))
  .map((f) => {
    const j = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'));
    return { date: j.date, title: j.title, scripture: j.scripture };
  })
  .sort((a, b) => (a.date < b.date ? 1 : -1));
writeFileSync(
  join(OUT_DIR, 'index.json'),
  JSON.stringify({ updatedAt: new Date().toISOString(), count: indexEntries.length, notes: indexEntries }, null, 2) + '\n'
);
console.log(`출력: ${OUT_DIR}/ (index.json ${indexEntries.length}건 포함)`);
