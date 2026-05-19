// 일회성: 가사가 있고 tags/moods 가 비어있는 모든 곡에 대해
// 배포된 /api/generate-tags 를 호출해 태그+상황을 생성하고 Firestore에 저장한다.
// 관리자 화면의 "전체 곡 태그 일괄 생성" 버튼(handleBatchGenerateTags)과 동일 로직.
// 차이점: 개별 곡 실패 시 기존 데이터를 빈 배열로 덮지 않고 건너뛴다(데이터 보존).
//
// 실행:  node scripts/batch-generate-tags.mjs
//        node scripts/batch-generate-tags.mjs https://<배포도메인>   # 도메인 지정
// 끝나면 이 파일은 삭제해도 된다.

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore';

const BASE = (process.argv[2] || 'https://sy-music.vercel.app').replace(/\/+$/, '');
const ENDPOINT = BASE + '/api/generate-tags';

const firebaseConfig = {
  apiKey: 'AIzaSyDx15L0nraNbGDdnXDTiQIHGtiJ-Qn0G9w',
  authDomain: 'symusic-7f651.firebaseapp.com',
  projectId: 'symusic-7f651',
  storageBucket: 'symusic-7f651.firebasestorage.app',
  messagingSenderId: '396203280257',
  appId: '1:396203280257:web:4d83b47410d79677260a80',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function requestTagsMoods(lyrics, title) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lyrics, title }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const d = await res.json();
      if (d?.error) msg = d.error;
    } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  if (!Array.isArray(data?.tags)) throw new Error('응답 형식 오류 (tags 없음)');
  return {
    tags: data.tags,
    moods: Array.isArray(data?.moods) ? data.moods : [],
  };
}

console.log(`엔드포인트: ${ENDPOINT}`);
console.log('곡 목록 로딩 중...');

const snap = await getDocs(
  query(collection(db, 'songs'), orderBy('created_at', 'desc'))
);
const songs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
console.log(`전체 곡: ${songs.length}곡`);

const targets = songs.filter((s) => {
  if (s.id.startsWith('local-')) return false;
  const hasLyrics = !!s.lyrics && String(s.lyrics).trim().length > 0;
  if (!hasLyrics) return false;
  const tagsMissing = !Array.isArray(s.tags) || s.tags.length === 0;
  const moodsMissing = !Array.isArray(s.moods) || s.moods.length === 0;
  return tagsMissing || moodsMissing;
});

console.log(`처리 대상(가사 있음 + tags/moods 미보유): ${targets.length}곡\n`);

if (targets.length === 0) {
  console.log('처리할 곡이 없습니다. (이미 모두 완료)');
  process.exit(0);
}

let success = 0;
let fail = 0;
const failed = [];

for (let i = 0; i < targets.length; i++) {
  const s = targets[i];
  const label = `[${i + 1}/${targets.length}] ${s.title}`;
  try {
    const { tags, moods } = await requestTagsMoods(
      String(s.lyrics),
      s.title
    );
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'songs', s.id), {
      tags,
      tagsGeneratedAt: now,
      moods,
      moodsGeneratedAt: now,
    });
    success++;
    console.log(
      `${label} ✅ tags=[${tags.join(', ')}] moods=[${moods.join(', ')}]`
    );
  } catch (err) {
    fail++;
    failed.push(s.title);
    console.log(`${label} ❌ ${err.message} (건너뜀, 기존 데이터 보존)`);
  }
  if (i < targets.length - 1) await sleep(500);
}

console.log(`\n완료 — 성공 ${success}곡, 실패 ${fail}곡`);
if (failed.length) console.log('실패 곡:', failed.join(' / '));
process.exit(0);
