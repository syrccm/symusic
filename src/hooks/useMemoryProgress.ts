import { useState, useEffect, useCallback, useMemo } from 'react';

const MEMORY_STORAGE_KEY = 'sy-memory-progress';

// 진도 상태. 저장은 learning/memorized만 하고, 키가 없으면 '안외움'(none)으로 간주.
export type MemoryStatus = 'none' | 'learning' | 'memorized';
type StoredProgress = Record<string, 'learning' | 'memorized'>;

// 안외움 → 외우는중 → 외움 → 안외움 순환 순서
const STATUS_CYCLE: MemoryStatus[] = ['none', 'learning', 'memorized'];

function loadInitial(): StoredProgress {
  try {
    const saved = localStorage.getItem(MEMORY_STORAGE_KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: StoredProgress = {};
    for (const [id, v] of Object.entries(parsed)) {
      if (v === 'learning' || v === 'memorized') out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 성경암송 진도 훅. useFavorites 패턴(useState 초기화 + useEffect 저장)을 복제하되,
 * 값 형태를 즐겨찾기의 string[] 대신 3상태 맵(verseId → 'learning' | 'memorized')으로 바꾼 것.
 * 키가 없는 구절은 '안외움'(none)으로 간주해 저장 공간을 줄인다.
 */
export function useMemoryProgress() {
  const [progress, setProgress] = useState<StoredProgress>(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // localStorage 사용 불가 환경(시크릿 모드 등) — 무시
    }
  }, [progress]);

  const status = useCallback(
    (id: string): MemoryStatus => progress[id] ?? 'none',
    [progress],
  );

  const setStatus = useCallback((id: string, s: MemoryStatus) => {
    setProgress((prev) => {
      const next = { ...prev };
      if (s === 'none') delete next[id];
      else next[id] = s;
      return next;
    });
  }, []);

  // 진도 뱃지 탭: 안외움 → 외우는중 → 외움 → 안외움 순환
  const cycleStatus = useCallback((id: string) => {
    setProgress((prev) => {
      const cur: MemoryStatus = prev[id] ?? 'none';
      const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
      const next = { ...prev };
      if (nextStatus === 'none') delete next[id];
      else next[id] = nextStatus;
      return next;
    });
  }, []);

  const counts = useMemo(() => {
    let learning = 0, memorized = 0;
    for (const v of Object.values(progress)) {
      if (v === 'learning') learning++;
      else if (v === 'memorized') memorized++;
    }
    return { learning, memorized };
  }, [progress]);

  return { progress, status, setStatus, cycleStatus, ...counts };
}
