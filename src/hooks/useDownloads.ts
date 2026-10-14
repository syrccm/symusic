// downloads 컬렉션 구독 + 쓰기 헬퍼 — useDaylongMembers 패턴.
// - 문서 구조: downloads/{id} = { title, url(MEGA 폴더 공유 링크), note?, active, createdAt, updatedAt }
//   곡 문서와 연결하지 않는다. createdAt / updatedAt 은 serverTimestamp(Timestamp). 파서는 toMillis(), 없으면 0.
// - orderBy 없이 전체를 받아 클라이언트에서 createdAt 내림차순 정렬(콘솔 수동 입력 문서가 필드를 빠뜨려도 사라지지 않게).
// - active 필터는 하지 않는다. 게시판(DownloadBoard)이 active !== false 만 보여 주고, 관리 모달은 전체를 쓴다.
// - 규칙(콘솔 수동 반영): 읽기 개방, 쓰기 로그인 사용자. firestore.rules 참고.
import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type FirestoreError,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const DOWNLOADS_COLLECTION = 'downloads';

export interface DownloadItem {
  id: string;
  title: string;
  url: string;
  note: string;
  active: boolean;
  /** createdAt millis. 없으면 0 */
  createdAt: number;
  /** updatedAt millis. 없으면 0 */
  updatedAt: number;
}

export interface DownloadInput {
  title: string;
  url: string;
  note: string;
}

export interface UseDownloadsResult {
  downloads: DownloadItem[];
  loading: boolean;
  error: FirestoreError | null;
}

function toMillis(value: unknown): number {
  const ts = value as Timestamp | null | undefined;
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}

/** 필드 누락·타입 불일치 시 기본값으로 채운다(콘솔 수동 입력 대비). */
export function parseDownload(id: string, raw: Record<string, unknown>): DownloadItem {
  return {
    id,
    title: typeof raw.title === 'string' ? raw.title : '',
    url: typeof raw.url === 'string' ? raw.url.trim() : '',
    note: typeof raw.note === 'string' ? raw.note : '',
    active: raw.active !== false,
    createdAt: toMillis(raw.createdAt),
    updatedAt: toMillis(raw.updatedAt),
  };
}

export function useDownloads(): UseDownloadsResult {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }
    const unsubscribe = onSnapshot(
      collection(db, DOWNLOADS_COLLECTION),
      (snapshot) => {
        // serverTimestamps 'estimate': 추가 직후 로컬 스냅샷에서 createdAt 이 null → 0 으로 정렬돼 맨 아래에
        // 갔다가 서버 확인 후 맨 위로 튀는 현상 방지(추정 시각으로 채운다).
        const list = snapshot.docs
          .map((d) => parseDownload(d.id, d.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>))
          .sort((a, b) => b.createdAt - a.createdAt);
        setDownloads(list);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('[useDownloads] onSnapshot error:', err);
        setError(err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  return { downloads, loading, error };
}

// ── 쓰기 헬퍼 ───────────────────────────────────────────────────────────
// 호출 측(DownloadManagerDialog)이 !isAdmin → 입력 검증 → !db → 재진입 방지 → try/catch 를 담당한다.

export async function addDownload(input: DownloadInput): Promise<void> {
  if (!db) throw new Error('Firebase 연결이 필요합니다.');
  await addDoc(collection(db, DOWNLOADS_COLLECTION), {
    title: input.title,
    url: input.url,
    note: input.note,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateDownload(id: string, patch: Partial<DownloadInput> & { active?: boolean }): Promise<void> {
  if (!db) throw new Error('Firebase 연결이 필요합니다.');
  await updateDoc(doc(db, DOWNLOADS_COLLECTION, id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteDownload(id: string): Promise<void> {
  if (!db) throw new Error('Firebase 연결이 필요합니다.');
  await deleteDoc(doc(db, DOWNLOADS_COLLECTION, id));
}
