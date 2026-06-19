// 성경말씀(전체 성경) 뷰어용 데이터 헬퍼.
// 새 66권 데이터를 만들지 않고 기존 자산을 재사용한다:
//  - 풀네임/약어: @/data/bibleBookMap
//  - 정경 순서: Object.keys(bibleBookMap) (창세기→요한계시록 순서 보장)
//  - 장별 절 수: @/data/bibleVerseCounts
//  - 본문 로드: @/utils/bibleParser 의 loadKrv(), getVerseText()

import { bibleBookMap, bookFullName } from '@/data/bibleBookMap';
import { verseCounts } from '@/data/bibleVerseCounts';
import { loadKrv, getVerseText } from '@/utils/bibleParser';

export interface BibleBookMeta {
  abbr: string; // "창"
  name: string; // "창세기"
  testament: 'ot' | 'nt';
  chapterCount: number;
}

// 구약 39권 / 신약 27권 — bibleBookMap 키 삽입 순서 기준 경계.
const OT_BOOK_COUNT = 39;

/** 정경 순서대로 66권 메타데이터를 반환. */
export function getBooks(): BibleBookMeta[] {
  return Object.keys(bibleBookMap).map((abbr, index) => ({
    abbr,
    name: bookFullName(abbr),
    testament: index < OT_BOOK_COUNT ? 'ot' : 'nt',
    chapterCount: getChapterCount(abbr),
  }));
}

/** 해당 책의 장 개수. 모르는 약어면 0. */
export function getChapterCount(abbr: string): number {
  const chapters = verseCounts[abbr];
  return chapters ? Object.keys(chapters).length : 0;
}

/**
 * 해당 장의 모든 절을 번호 순서대로 반환.
 * 절 키는 문자열이므로 숫자로 변환해 정렬한다.
 */
export async function getChapter(
  abbr: string,
  chapter: number
): Promise<{ verse: number; text: string }[]> {
  const data = await loadKrv();
  const chapterData = verseCounts[abbr];
  const maxVerse = chapterData?.[String(chapter)];
  if (!maxVerse) return [];

  const out: { verse: number; text: string }[] = [];
  for (let v = 1; v <= maxVerse; v++) {
    const text = getVerseText(data, abbr, chapter, v);
    if (text != null) out.push({ verse: v, text });
  }
  return out;
}
