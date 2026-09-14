// daylongTransactions 컬렉션 구독 — useNotices 패턴.
// - orderBy 없이 전체를 받아 클라이언트에서 date 내림차순 → createdAt 내림차순 정렬.
//   (orderBy 는 해당 필드가 없는 문서를 조용히 제외하므로 피한다.)
// - enabled=false 면 구독하지 않는다(PIN 통과 전 불필요한 읽기 방지).
// - 오류 시 loading 해제 + error 보관.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, type FirestoreError } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseTransaction, type DaylongTransaction } from '@/types/daylong';

export interface UseDaylongTransactionsResult {
  transactions: DaylongTransaction[];
  loading: boolean;
  error: FirestoreError | null;
}

export function sortTransactions(list: DaylongTransaction[]): DaylongTransaction[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function useDaylongTransactions(enabled = true): UseDaylongTransactionsResult {
  const [transactions, setTransactions] = useState<DaylongTransaction[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'daylongTransactions'),
      (snapshot) => {
        setTransactions(
          sortTransactions(snapshot.docs.map((d) => parseTransaction(d.id, d.data() as Record<string, unknown>))),
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('[useDaylongTransactions] onSnapshot error:', err);
        setError(err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [enabled]);

  return { transactions, loading, error };
}
