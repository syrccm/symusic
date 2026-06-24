// 말씀나눔지 PDF → 구조화 JSON 파이프라인 (STEP 3a)
// ──────────────────────────────────────────────────────────────────────────
// extract-note-text(본문·메타) + extract-note-meeting(나눔질문·기도제목)
// + fix-note-spacing(LLM 띄어쓰기 보정 + 검증 게이트 + 원문 글리프 재구성)
// 을 하나로 묶어, PDF 한 개 → public/data/notes-text/[날짜].json 한 개를 만든다.
//
// 사용:
//   node scripts/build-note-json.mjs                 # public/data/notes/ 의 모든 PDF 변환
//   node scripts/build-note-json.mjs <pdf경로> [...]  # 지정한 PDF만 변환
// API 키는 .env 에서 읽는다. 키 없거나 API 실패 시 해당 항목은 원문 폴백.
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
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

const pdfArgs = process.argv.slice(2);
const pdfs = pdfArgs.length
  ? pdfArgs
  : readdirSync(NOTES_DIR)
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .sort()
      .map((f) => join(NOTES_DIR, f));

const key = loadEnvKey();
const client = key ? new Anthropic({ apiKey: key }) : null;
if (!client) console.log('⚠️ ANTHROPIC_API_KEY 없음 — 보정 없이 원문으로 생성합니다.\n');

mkdirSync(OUT_DIR, { recursive: true });

console.log(`### 변환 대상 ${pdfs.length}개\n`);
const summary = [];
for (const pdfPath of pdfs) {
  const dateName = basename(pdfPath).replace(/\D/g, '').slice(0, 8);
  try {
    const { json, counts, garbled } = await buildOne(pdfPath, client);
    const out = join(OUT_DIR, `${dateName}.json`);
    writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
    const tot = counts.fixed + counts.reverted + counts.error;
    const bodyChars = json.body.reduce((a, p) => a + p.length, 0);
    const g = garbled.length ? ` / 깨진글자 ${garbled.reduce((a, x) => a + x.codepoints.length, 0)}자(${garbled.length}줄)` : '';
    console.log(
      `✅ ${dateName}.json  본문 ${bodyChars}자(${json.body.length}문단)·질문 ${json.questions.length}·기도 ${json.prayers.length}·성경 ${(json.scriptureText || '').length}자` +
      `  | 보정 채택 ${counts.fixed}/폐기 ${counts.reverted}/실패 ${counts.error} (총 ${tot})${g}`
    );
    summary.push({ dateName, ...counts, garbled: garbled.length });
  } catch (err) {
    console.log(`❌ ${dateName}: ${err?.message || err}`);
  }
}

const sum = summary.reduce(
  (a, s) => ({ fixed: a.fixed + s.fixed, reverted: a.reverted + s.reverted, error: a.error + s.error }),
  { fixed: 0, reverted: 0, error: 0 }
);
console.log(`\n=== 합계: JSON ${summary.length}개 / 보정 채택 ${sum.fixed} · 폐기 ${sum.reverted} · 실패 ${sum.error} ===`);
console.log(`출력: ${OUT_DIR}/`);
