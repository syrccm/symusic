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

function extractSongIdFromPath(pathname: string): string | null {
  const match = pathname.match(SONG_PATH_PATTERN);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
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
    if (songs.length === 0) return;

    const songId = extractSongIdFromPath(window.location.pathname);
    if (!songId) {
      processedRef.current = true;
      return;
    }

    processedRef.current = true;

    // 처리 후 URL을 루트로 정리 (쿼리/해시는 보존)
    const url = new URL(window.location.href);
    url.pathname = '/';
    window.history.replaceState({}, '', url.toString());

    const target = songs.find((s) => s.id === songId);
    if (target) {
      onSongFound(target);
    } else {
      onSongMissing?.(songId);
    }
  }, [songs, onSongFound, onSongMissing]);
}
