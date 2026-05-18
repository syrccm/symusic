import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface GeneratedTagsResult {
  tags: string[];
  /** 곡이 어울리는 상황 (위로/감사/예배/새힘/기도/회개) */
  moods: string[];
}

/**
 * 서버리스 함수(/api/generate-tags)에 가사를 보내 태그/상황을 받아온다.
 * API 키는 서버에만 있으므로 프론트엔드에서는 노출되지 않는다.
 */
export async function requestTags(
  lyrics: string,
  title?: string
): Promise<GeneratedTagsResult> {
  const res = await fetch('/api/generate-tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lyrics, title }),
  });

  if (!res.ok) {
    let message = `태그 생성 요청 실패 (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // 응답 본문 파싱 실패 — 기본 메시지 사용
    }
    throw new Error(message);
  }

  const data = await res.json();
  if (!Array.isArray(data?.tags)) {
    throw new Error('서버 응답 형식이 올바르지 않습니다.');
  }
  return {
    tags: data.tags as string[],
    moods: Array.isArray(data?.moods) ? (data.moods as string[]) : [],
  };
}

/**
 * 곡의 태그를 생성하여 Firestore 문서에 저장한다.
 * 실패하더라도 곡 자체는 유지되도록 tags: [] 를 기록한 뒤 에러를 다시 던진다.
 * (호출 측에서 토스트 등으로 실패를 알리되, 곡 저장은 롤백되지 않음)
 */
export async function generateAndSaveTags(
  songId: string,
  lyrics: string,
  title?: string
): Promise<string[]> {
  if (!db) {
    throw new Error('Firebase 연결이 필요합니다.');
  }

  try {
    const { tags, moods } = await requestTags(lyrics, title);
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'songs', songId), {
      tags,
      tagsGeneratedAt: now,
      moods,
      moodsGeneratedAt: now,
    });
    return tags;
  } catch (err) {
    // 태그 생성 실패 시에도 곡은 유효하게 유지: tags/moods 를 빈 배열로 기록
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'songs', songId), {
        tags: [],
        tagsGeneratedAt: now,
        moods: [],
        moodsGeneratedAt: now,
      });
    } catch {
      // 빈 배열 기록까지 실패하면 무시 (다음 일괄 생성에서 재시도 가능)
    }
    throw err;
  }
}
