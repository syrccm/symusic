// 설교노트 도메인 타입.

// 찬양검색 '예배' 구분값(DEFAULT_CATEGORIES)과 동일한 분류축.
export type Worship = '주일' | '금철' | 'QT' | '기타';

export interface SermonNote {
  id: string;
  worship: Worship;
  date: string; // 'YYYY-MM-DD'
  passage?: string; // 본문(선택)
  content: string; // 내용(텍스트만)
  locked: boolean; // 노트별 잠금
  createdAt: number;
  updatedAt: number;
}

export interface SermonNoteSettings {
  defaultLock: boolean; // 새 노트 기본 잠금 여부
  pinHash: string | null; // 4자리 PIN의 SHA-256 해시 (평문 저장 금지)
}
