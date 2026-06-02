// 한국어 성경 약어 → 책 정보 매핑 (개역한글 66권).
// 웨스트민스터 요리문답/신앙고백서 references와 krv.json 에서 공통으로 사용하는 약어 기준.

export interface BibleBook {
  /** 책 전체 이름 (예: 시편, 로마서) */
  fullName: string;
}

export const bibleBookMap: Record<string, BibleBook> = {
  // 구약 (39)
  창: { fullName: '창세기' }, 출: { fullName: '출애굽기' }, 레: { fullName: '레위기' },
  민: { fullName: '민수기' }, 신: { fullName: '신명기' }, 수: { fullName: '여호수아' },
  삿: { fullName: '사사기' }, 룻: { fullName: '룻기' }, 삼상: { fullName: '사무엘상' },
  삼하: { fullName: '사무엘하' }, 왕상: { fullName: '열왕기상' }, 왕하: { fullName: '열왕기하' },
  대상: { fullName: '역대상' }, 대하: { fullName: '역대하' }, 스: { fullName: '에스라' },
  느: { fullName: '느헤미야' }, 에: { fullName: '에스더' }, 욥: { fullName: '욥기' },
  시: { fullName: '시편' }, 잠: { fullName: '잠언' }, 전: { fullName: '전도서' },
  아: { fullName: '아가' }, 사: { fullName: '이사야' }, 렘: { fullName: '예레미야' },
  애: { fullName: '예레미야애가' }, 겔: { fullName: '에스겔' }, 단: { fullName: '다니엘' },
  호: { fullName: '호세아' }, 욜: { fullName: '요엘' }, 암: { fullName: '아모스' },
  옵: { fullName: '오바댜' }, 욘: { fullName: '요나' }, 미: { fullName: '미가' },
  나: { fullName: '나훔' }, 합: { fullName: '하박국' }, 습: { fullName: '스바냐' },
  학: { fullName: '학개' }, 슥: { fullName: '스가랴' }, 말: { fullName: '말라기' },
  // 신약 (27)
  마: { fullName: '마태복음' }, 막: { fullName: '마가복음' }, 눅: { fullName: '누가복음' },
  요: { fullName: '요한복음' }, 행: { fullName: '사도행전' }, 롬: { fullName: '로마서' },
  고전: { fullName: '고린도전서' }, 고후: { fullName: '고린도후서' }, 갈: { fullName: '갈라디아서' },
  엡: { fullName: '에베소서' }, 빌: { fullName: '빌립보서' }, 골: { fullName: '골로새서' },
  살전: { fullName: '데살로니가전서' }, 살후: { fullName: '데살로니가후서' },
  딤전: { fullName: '디모데전서' }, 딤후: { fullName: '디모데후서' }, 딛: { fullName: '디도서' },
  몬: { fullName: '빌레몬서' }, 히: { fullName: '히브리서' }, 약: { fullName: '야고보서' },
  벧전: { fullName: '베드로전서' }, 벧후: { fullName: '베드로후서' }, 요일: { fullName: '요한일서' },
  요이: { fullName: '요한이서' }, 요삼: { fullName: '요한삼서' }, 유: { fullName: '유다서' },
  계: { fullName: '요한계시록' },
};

/** 약어로 책 전체 이름을 반환. 모르면 입력 그대로 반환. */
export function bookFullName(abbr: string): string {
  return bibleBookMap[abbr]?.fullName ?? abbr;
}

/** krv.json / references 에서 유효한 책 약어인지 확인. */
export function isKnownBook(abbr: string): boolean {
  return abbr in bibleBookMap;
}
