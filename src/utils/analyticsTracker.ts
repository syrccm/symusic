import { db } from '@/lib/firebase';
import { doc, setDoc, increment } from 'firebase/firestore';

const ANALYTICS_COLLECTION = 'analytics';
const ANALYTICS_DOC = 'stats';
const VISITOR_ID_KEY = 'symusic-visitor-id';
const LAST_VISIT_DATE_KEY = 'symusic-last-visit-date';
const LAST_VISIT_MONTH_KEY = 'symusic-last-visit-month';

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

// KST(UTC+9) 기준 오늘/이번 달 키. 영신님 사용자는 한국 기준이라 UTC가 아닌 KST로 일자 분리.
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

function getVisitorId(): string {
  if (typeof localStorage === 'undefined') return generateUUID();
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id = generateUUID();
    try {
      localStorage.setItem(VISITOR_ID_KEY, id);
    } catch {
      // LS 사용 불가 — 무시
    }
  }
  return id;
}

export async function trackVisit(): Promise<void> {
  if (!db) return;
  const { date, month } = getCurrentDateKeys();
  // visitorId 보장(없으면 신규 발급)
  getVisitorId();

  const lastVisitDate =
    typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_VISIT_DATE_KEY) : null;
  const lastVisitMonth =
    typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_VISIT_MONTH_KEY) : null;
  const isEverFirst = lastVisitDate === null;
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
