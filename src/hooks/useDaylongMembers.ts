// daylongMembers 컬렉션 구독 — useNotices 패턴.
// - orderBy 없이 전체를 받아 클라이언트에서 order 오름차순(동률이면 이름) 정렬.
//   콘솔에서 손으로 넣은 문서가 order 필드를 빠뜨려도 조회에서 사라지지 않게 하기 위함.
// - enabled=false 면 구독하지 않는다(PIN 통과 전 불필요한 읽기 방지).
// - 오류 시 loading 해제 + error 보관(permission-denied 는 페이지에서 안내).
import { useEffect, useState } from 'react';
import { collection, onSnapshot, type FirestoreError } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseMember, type DaylongMember } from '@/types/daylong';

export interface UseDaylongMembersResult {
  members: DaylongMember[];
  loading: boolean;
  error: FirestoreError | null;
}

export function sortMembers(list: DaylongMember[]): DaylongMember[] {
  return [...list].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ko'));
}

export function useDaylongMembers(enabled = true): UseDaylongMembersResult {
  const [members, setMembers] = useState<DaylongMember[]>([]);
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
      collection(db, 'daylongMembers'),
      (snapshot) => {
        setMembers(sortMembers(snapshot.docs.map((d) => parseMember(d.id, d.data() as Record<string, unknown>))));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('[useDaylongMembers] onSnapshot error:', err);
        setError(err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [enabled]);

  return { members, loading, error };
}
