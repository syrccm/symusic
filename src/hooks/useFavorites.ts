import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const FAVORITES_STORAGE_KEY = 'sy-music-favorites';

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  });

  const [isFavoritesMode, setIsFavoritesMode] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // localStorage 사용 불가 환경 (시크릿 모드 등) — 무시
    }
  }, [favorites]);

  const isFavorite = useCallback(
    (id: string) => favorites.includes(id),
    [favorites]
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      if (prev.includes(id)) {
        toast('즐겨찾기에서 제거됨');
        return prev.filter((f) => f !== id);
      }
      toast('즐겨찾기에 추가됨 ✨');
      return [...prev, id];
    });
  }, []);

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    isFavoritesMode,
    setIsFavoritesMode,
  };
}
