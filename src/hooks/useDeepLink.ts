import { useEffect, useRef } from 'react';

interface DeepLinkSong {
  id: string;
}

interface UseDeepLinkOptions<T extends DeepLinkSong> {
  songs: T[];
  onSongFound: (song: T) => void;
  onSongMissing?: (songId: string) => void;
}

const SONG_PATH_PATTERN = /^\/song\/([^/?#]+)\/?$/;
const NOT_FOUND_GRACE_MS = 3000;

function extractSongIdFromPath(pathname: string): string | null {
  const match = pathname.match(SONG_PATH_PATTERN);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function cleanDeepLinkUrl() {
  const url = new URL(window.location.href);
  url.pathname = '/';
  window.history.replaceState({}, '', url.toString());
}

export function useDeepLink<T extends DeepLinkSong>({
  songs,
  onSongFound,
  onSongMissing,
}: UseDeepLinkOptions<T>) {
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    if (typeof window === 'undefined') return;

    const songId = extractSongIdFromPath(window.location.pathname);
    if (!songId) {
      processedRef.current = true;
      return;
    }

    // songs가 아직 안 채워졌으면 다음 업데이트까지 대기 (effect 재실행 됨)
    if (songs.length === 0) {
      console.log('[DeepLink] Waiting for songs… (target:', songId, ')');
      return;
    }

    const target = songs.find((s) => s.id === songId);
    if (target) {
      processedRef.current = true;
      cleanDeepLinkUrl();
      console.log('[DeepLink] Found song:', target);
      onSongFound(target);
      return;
    }

    // 첫 도착 분에 없음 — Firestore 캐시→서버 순차 콜백 등으로 추가 도착 가능
    // grace 기간 동안 songs가 변경되면 effect cleanup으로 timer 취소되고 재시도
    console.warn(
      '[DeepLink] Target not in current songs — waiting',
      NOT_FOUND_GRACE_MS,
      'ms.\n  target:',
      songId,
      '\n  available IDs:',
      songs.map((s) => s.id)
    );

    const timer = window.setTimeout(() => {
      if (processedRef.current) return;
      processedRef.current = true;
      cleanDeepLinkUrl();
      console.error('[DeepLink] Song not found after grace period:', songId);
      onSongMissing?.(songId);
    }, NOT_FOUND_GRACE_MS);

    return () => window.clearTimeout(timer);
  }, [songs, onSongFound, onSongMissing]);
}
