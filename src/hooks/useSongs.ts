import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';

export interface Song {
  id: string;
  title: string;
  category: string;
  date?: string;
  description?: string;
  audioUrl?: string;
  sermon?: string;
  musicVideo?: string;
  lyrics?: string;
  youtubeUrl?: string;
  duration?: string;
  created_at: string;
}

interface UseSongsOptions {
  /** 사용자 알림 토스트(오프라인 모드/연결 성공)를 비활성화 */
  silent?: boolean;
}

type SetSongsLocalUpdater = Song[] | ((prev: Song[]) => Song[]);

interface UseSongsResult {
  songs: Song[];
  loading: boolean;
  isOfflineMode: boolean;
  /** 오프라인 모드에서 곡을 직접 추가/수정/삭제할 때 사용. LS 캐시도 함께 갱신. */
  setSongsLocal: (next: SetSongsLocalUpdater) => void;
}

const SONGS_CACHE_KEY = 'symusic-songs';

export function useSongs({ silent = false }: UseSongsOptions = {}): UseSongsResult {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    const init = async () => {
      try {
        if (!db) {
          if (cancelled) return;
          setIsOfflineMode(true);

          const cached = localStorage.getItem(SONGS_CACHE_KEY);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed)) {
                setSongs(parsed);
              }
            } catch {
              // 캐시 파싱 실패 — 무시
            }
          }

          if (!silent) {
            toast.info('🔌 오프라인 모드로 실행 중입니다');
          }
          return;
        }

        setIsOfflineMode(false);

        const songsQuery = query(
          collection(db, 'songs'),
          orderBy('created_at', 'desc')
        );

        unsubscribe = onSnapshot(
          songsQuery,
          (snapshot) => {
            const data = snapshot.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            } as Song));

            if (cancelled) return;
            setSongs(data);

            try {
              localStorage.setItem(SONGS_CACHE_KEY, JSON.stringify(data));
            } catch {
              // LS 사용 불가 — 무시
            }
          },
          (error) => {
            console.error('[useSongs] onSnapshot error:', error);
            if (!silent) {
              toast.error('곡 목록 로드 중 오류가 발생했습니다: ' + error.message);
            }
          }
        );

        if (!silent) {
          toast.success('🎵 음악 플레이어가 준비되었습니다! (Firebase 연결됨)');
        }
      } catch (error) {
        console.error('[useSongs] init error:', error);
        if (cancelled) return;
        setIsOfflineMode(true);

        const cached = localStorage.getItem(SONGS_CACHE_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              setSongs(parsed);
            }
          } catch {
            // 무시
          }
        }

        if (!silent) {
          const message = error instanceof Error ? error.message : String(error);
          toast.error('데이터 초기화 중 오류가 발생했습니다: ' + message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [silent]);

  const setSongsLocal = useCallback((next: SetSongsLocalUpdater) => {
    setSongs((prev) => {
      const value =
        typeof next === 'function' ? (next as (p: Song[]) => Song[])(prev) : next;
      try {
        localStorage.setItem(SONGS_CACHE_KEY, JSON.stringify(value));
      } catch {
        // LS 사용 불가 — 무시
      }
      return value;
    });
  }, []);

  return { songs, loading, isOfflineMode, setSongsLocal };
}
