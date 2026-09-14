// config/daylong 단일 문서 구독 — { config, loading, error }.
// - useBanner 와 같은 onSnapshot 패턴이되, loading 을 성공·오류 콜백 양쪽에서 해제한다(규칙 미설정 시 영원한 로딩 방지).
// - 문서가 없으면 config = null (페이지가 "아직 준비 중" 안내).
import { useEffect, useState } from 'react';
import { doc, onSnapshot, type FirestoreError } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseConfig, type DaylongConfig } from '@/types/daylong';

export interface UseDaylongConfigResult {
  config: DaylongConfig | null;
  loading: boolean;
  error: FirestoreError | null;
}

export function useDaylongConfig(): UseDaylongConfigResult {
  const [config, setConfig] = useState<DaylongConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, 'config', 'daylong'),
      (snap) => {
        setConfig(snap.exists() ? parseConfig(snap.data() as Record<string, unknown>) : null);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('[useDaylongConfig] onSnapshot error:', err);
        setConfig(null);
        setError(err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  return { config, loading, error };
}
