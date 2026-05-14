import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface Notice {
  id: string;
  title: string;
  content: string;
  createdAt: Timestamp | null;
}

const LAST_READ_KEY = 'symusic-last-notice-read';

interface UseNoticesResult {
  notices: Notice[];
  loading: boolean;
  unreadCount: number;
  lastReadAt: number;
  markAllRead: () => void;
}

function readLastReadAt(): number {
  try {
    const raw = localStorage.getItem(LAST_READ_KEY);
    if (!raw) return 0;
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
}

function noticeTimeMs(n: Notice): number {
  if (!n.createdAt) return 0;
  // Firestore Timestamp → millis
  if (typeof (n.createdAt as Timestamp).toMillis === 'function') {
    return (n.createdAt as Timestamp).toMillis();
  }
  return 0;
}

export function useNotices(): UseNoticesResult {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastReadAt, setLastReadAt] = useState<number>(() => readLastReadAt());

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => {
          const raw = d.data();
          return {
            id: d.id,
            title: raw.title ?? '',
            content: raw.content ?? '',
            createdAt: (raw.createdAt as Timestamp) ?? null,
          } as Notice;
        });
        setNotices(data);
        setLoading(false);
      },
      (err) => {
        console.error('[useNotices] onSnapshot error:', err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const unreadCount = useMemo(() => {
    if (lastReadAt === 0) return notices.length;
    return notices.filter((n) => noticeTimeMs(n) > lastReadAt).length;
  }, [notices, lastReadAt]);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(LAST_READ_KEY, now);
    } catch {
      // LS 사용 불가 — 무시
    }
    setLastReadAt(Date.parse(now));
  }, []);

  return { notices, loading, unreadCount, lastReadAt, markAllRead };
}

export function isNoticeUnread(notice: Notice, lastReadAt: number): boolean {
  if (lastReadAt === 0) return true;
  return noticeTimeMs(notice) > lastReadAt;
}
