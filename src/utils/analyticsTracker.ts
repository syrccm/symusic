import { db } from '@/lib/firebase';
import { doc, setDoc, increment } from 'firebase/firestore';

const ANALYTICS_COLLECTION = 'analytics';
const ANALYTICS_DOC = 'stats';
// v2: total/monthly/daily 일관성 재집계를 위해 키 네임스페이스 갱신. 이전 v1 키는 그대로 두어 다음
// 방문 시 v2 기준 신규 사용자로 카운트되도록 한다.
const VISITOR_ID_KEY = 'symusic-visitor-id-v2';
const LAST_VISIT_DATE_KEY = 'symusic-last-visit-date-v2';
const LAST_VISIT_MONTH_KEY = 'symusic-last-visit-month-v2';

export interface AnalyticsBucket {
  visits?: number;
  unique_visitors?: number;
  song_plays?: number;
  shares?: number;
  installs?: number;
}

export interface AnalyticsSongStat {
  plays?: number;
  shares?: number;
}

export interface AnalyticsStats {
  total_visits?: number;
  total_unique_visitors?: number;
  total_song_plays?: number;
  total_shares?: number;
  total_installs?: number;
  daily?: Record<string, AnalyticsBucket>;
  monthly?: Record<string, AnalyticsBucket>;
  songs?: Record<string, AnalyticsSongStat>;
}

function getStatsRef() {
  return doc(db, ANALYTICS_COLLECTION, ANALYTICS_DOC);
}

// KST(UTC+9) 기준 오늘/이번 달 키. 사용자가 한국 기준이라 UTC가 아닌 KST로 일자 분리.
export function getCurrentDateKeys(): { date: string; month: string } {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, month: `${yyyy}-${mm}` };
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getVisitorId(): { id: string; isNew: boolean } {
  if (typeof localStorage === 'undefined') return { id: generateUUID(), isNew: true };
  const existing = localStorage.getItem(VISITOR_ID_KEY);
  if (existing) return { id: existing, isNew: false };
  const id = generateUUID();
  try {
    localStorage.setItem(VISITOR_ID_KEY, id);
  } catch {
    // LS 사용 불가 — 무시
  }
  return { id, isNew: true };
}

export async function trackVisit(): Promise<void> {
  if (!db) return;
  const { date, month } = getCurrentDateKeys();
  // visitorId 신규 발급 여부가 곧 "이 디바이스가 처음 방문" 여부. total_unique_visitors는 이걸 기준으로 한다.
  // (예전엔 lastVisitDate === null로 판정했는데, Firebase 리셋 후 사용자 LS가 그대로면 monthly만 증가하고
  //  total은 안 증가해 monthly > total 모순이 났다. v2 키와 함께 이 판정도 visitorId 기반으로 바꾼다.)
  const { isNew: isEverFirst } = getVisitorId();

  const lastVisitDate =
    typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_VISIT_DATE_KEY) : null;
  const lastVisitMonth =
    typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_VISIT_MONTH_KEY) : null;
  const isNewVisitorToday = lastVisitDate !== date;
  const isNewVisitorThisMonth = lastVisitMonth !== month;

  if (typeof localStorage !== 'undefined') {
    try {
      if (isNewVisitorToday) localStorage.setItem(LAST_VISIT_DATE_KEY, date);
      if (isNewVisitorThisMonth) localStorage.setItem(LAST_VISIT_MONTH_KEY, month);
    } catch {
      // 무시
    }
  }

  const dailyBucket: AnalyticsBucket = { visits: increment(1) as unknown as number };
  const monthlyBucket: AnalyticsBucket = { visits: increment(1) as unknown as number };
  if (isNewVisitorToday) {
    dailyBucket.unique_visitors = increment(1) as unknown as number;
  }
  if (isNewVisitorThisMonth) {
    monthlyBucket.unique_visitors = increment(1) as unknown as number;
  }

  const payload: Record<string, unknown> = {
    total_visits: increment(1),
    daily: { [date]: dailyBucket },
    monthly: { [month]: monthlyBucket },
  };
  if (isEverFirst) {
    payload.total_unique_visitors = increment(1);
  }

  await setDoc(getStatsRef(), payload, { merge: true });
}

export async function trackSongPlay(songId: string): Promise<void> {
  if (!db || !songId) return;
  const { date, month } = getCurrentDateKeys();
  await setDoc(
    getStatsRef(),
    {
      total_song_plays: increment(1),
      daily: { [date]: { song_plays: increment(1) } },
      monthly: { [month]: { song_plays: increment(1) } },
      songs: { [songId]: { plays: increment(1) } },
    },
    { merge: true },
  );
}

export async function trackShare(songId: string): Promise<void> {
  if (!db) return;
  const { date, month } = getCurrentDateKeys();
  const payload: Record<string, unknown> = {
    total_shares: increment(1),
    daily: { [date]: { shares: increment(1) } },
    monthly: { [month]: { shares: increment(1) } },
  };
  if (songId) {
    payload.songs = { [songId]: { shares: increment(1) } };
  }
  await setDoc(getStatsRef(), payload, { merge: true });
}

export async function trackInstall(): Promise<void> {
  if (!db) return;
  const { date, month } = getCurrentDateKeys();
  await setDoc(
    getStatsRef(),
    {
      total_installs: increment(1),
      daily: { [date]: { installs: increment(1) } },
      monthly: { [month]: { installs: increment(1) } },
    },
    { merge: true },
  );
}
