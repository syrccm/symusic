// 일회성: 배포 앱의 "상황 검색"이 제대로 동작하는지 검증한다.
// 배포 앱과 동일한 소스(Firestore)에서 곡을 읽고,
// MusicPlayer.tsx 의 상황 필터와 동일한 로직으로 6가지 상황별 매칭을 출력한다.
//   필터: Array.isArray(s.moods) && s.moods.includes(preset.mood)
// 실행:  node scripts/verify-mood-search.mjs

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDx15L0nraNbGDdnXDTiQIHGtiJ-Qn0G9w',
  authDomain: 'symusic-7f651.firebaseapp.com',
  projectId: 'symusic-7f651',
  storageBucket: 'symusic-7f651.firebasestorage.app',
  messagingSenderId: '396203280257',
  appId: '1:396203280257:web:4d83b47410d79677260a80',
};

// MusicPlayer.tsx 의 MOOD_PRESETS 와 동일
const MOOD_PRESETS = [
  { label: '위로가 필요해요', mood: '위로' },
  { label: '감사한 마음이에요', mood: '감사' },
  { label: '예배드리고 싶어요', mood: '예배' },
  { label: '새힘이 필요해요', mood: '새힘' },
  { label: '기도하고 싶어요', mood: '기도' },
  { label: '회개하고 싶어요', mood: '회개' },
];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const snap = await getDocs(
  query(collection(db, 'songs'), orderBy('created_at', 'desc'))
);
const songs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

const withMoods = songs.filter(
  (s) => Array.isArray(s.moods) && s.moods.length > 0
);
const noMoods = songs.filter(
  (s) => !Array.isArray(s.moods) || s.moods.length === 0
);

console.log(`전체 곡: ${songs.length}곡`);
console.log(`moods 보유: ${withMoods.length}곡 / 미보유: ${noMoods.length}곡`);
if (noMoods.length) {
  console.log(
    'moods 미보유 곡:',
    noMoods.map((s) => s.title).join(' / ') || '(없음)'
  );
}
console.log('\n=== 상황별 검색 결과 (배포 앱 필터와 동일) ===');

let allOk = true;
for (const preset of MOOD_PRESETS) {
  const matched = songs.filter(
    (s) => Array.isArray(s.moods) && s.moods.includes(preset.mood)
  );
  const status = matched.length > 0 ? '✅' : '⚠️ (결과 없음)';
  console.log(
    `\n${status} "${preset.label}" (moods="${preset.mood}") → ${matched.length}곡`
  );
  console.log('   ' + (matched.map((s) => s.title).join(', ') || '-'));
  if (matched.length === 0) allOk = false;
}

console.log(
  `\n${allOk ? '✅ 모든 상황에서 결과가 반환됩니다 — 상황 검색 정상' : '⚠️ 일부 상황은 매칭 곡이 없습니다 (데이터 분포에 따라 정상일 수 있음)'}`
);
process.exit(0);
