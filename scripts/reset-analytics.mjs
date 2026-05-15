// 일회성: analytics/stats 문서를 0/빈 객체로 리셋한다.
// 실행:  node scripts/reset-analytics.mjs
// 끝나면 이 파일은 삭제해도 된다.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

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
const ref = doc(db, 'analytics', 'stats');

const before = await getDoc(ref);
console.log('--- BEFORE ---');
if (before.exists()) {
  const data = before.data();
  console.log('total_visits          :', data.total_visits ?? 0);
  console.log('total_unique_visitors :', data.total_unique_visitors ?? 0);
  console.log('total_song_plays      :', data.total_song_plays ?? 0);
  console.log('total_shares          :', data.total_shares ?? 0);
  console.log('total_installs        :', data.total_installs ?? 0);
  console.log('monthly keys          :', Object.keys(data.monthly ?? {}));
  console.log('daily keys count      :', Object.keys(data.daily ?? {}).length);
  if (data.monthly) {
    for (const [k, v] of Object.entries(data.monthly)) {
      console.log(`  monthly[${k}]        :`, v);
    }
  }
} else {
  console.log('(document does not exist)');
}

// 전체 덮어쓰기 (merge:false). songs는 곡별 누적이라 보존.
const songs = before.exists() ? (before.data().songs ?? {}) : {};
await setDoc(ref, {
  total_visits: 0,
  total_unique_visitors: 0,
  total_song_plays: 0,
  total_shares: 0,
  total_installs: 0,
  daily: {},
  monthly: {},
  songs,
});

const after = await getDoc(ref);
console.log('\n--- AFTER ---');
const d = after.data();
console.log('total_visits          :', d.total_visits);
console.log('total_unique_visitors :', d.total_unique_visitors);
console.log('total_song_plays      :', d.total_song_plays);
console.log('total_shares          :', d.total_shares);
console.log('total_installs        :', d.total_installs);
console.log('monthly keys          :', Object.keys(d.monthly));
console.log('daily keys count      :', Object.keys(d.daily).length);
console.log('songs preserved       :', Object.keys(d.songs).length, 'entries');

console.log('\n✅ reset complete');
process.exit(0);
