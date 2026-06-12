// 성경암송 데이터 — 1차(tier 1): 웨스트민스터 신앙고백서(WCF) 증거구절 기반 30구절.
//
// 선정 방식: WCF 33장의 증거구절(proof text) 중 '단일 절'만 후보로 추출하고,
//   13개 교리 주제별로 인용 빈도(여러 항에서 반복 인용 = 대표성)를 참고해 신학적으로 선별.
//   파싱·본문 존재는 src/utils/bibleParser.ts(parseRef)와 public/bible/krv.json으로 사전 검증함(30/30 통과).
//
// 포함 관계 설계: tier 누적(1 ⊂ 2 ⊂ 3). 2차(소요리)·3차(대요리)는 같은 배열에 tier 2/3로 덧붙이면
//   `verses.filter(v => v.tier <= N)` 로 30 → 50 → 70 누적 필터링이 된다.
//
// 본문 텍스트는 저장하지 않는다(저작권·중복 방지). 화면에서 ref → parseRef → krv.json 으로 개역한글 본문을 가져온다.

export interface MemoryVerse {
  /** 정규화된 고유 식별자 "책약어 장:절" (예: "딤후 3:16"). 진도 저장 키로도 사용. */
  id: string;
  /** parseRef 입력용 참조 문자열. 본문 추출 시 사용. (현재는 id와 동일하지만 의미가 다르므로 분리 유지) */
  ref: string;
  /** 암송 단계. 1=신앙고백 30, 2=소요리 누적 50, 3=대요리 누적 70 */
  tier: 1 | 2 | 3;
  /** 교리 주제 분류 (주제별 보기용). MEMORY_TOPICS 중 하나. */
  topic: string;
  /** 대표 출처 — 해당 절이 배정 주제의 장 범위 안에서 인용된 WCF 장.항 (예: "WCF 1.2") */
  source: string;
}

// 주제 표시 순서 (1차 13개 분류). 주제별 보기에서 이 순서를 사용.
export const MEMORY_TOPICS = [
  '계시·성경',
  '신론',
  '인간론·죄',
  '언약',
  '기독론',
  '구원론',
  '율법·자유',
  '예배·서약',
  '국가·결혼',
  '교회론',
  '성례',
  '권징·회의',
  '종말론',
] as const;

export const memoryVerses: MemoryVerse[] = [
  // 1. 계시·성경
  { id: '딤후 3:16', ref: '딤후 3:16', tier: 1, topic: '계시·성경', source: 'WCF 1.2' },
  { id: '시 119:105', ref: '시 119:105', tier: 1, topic: '계시·성경', source: 'WCF 1.7' },
  // 2. 신론
  { id: '엡 1:11', ref: '엡 1:11', tier: 1, topic: '신론', source: 'WCF 2.1' },
  { id: '롬 8:28', ref: '롬 8:28', tier: 1, topic: '신론', source: 'WCF 3.6' },
  { id: '약 1:17', ref: '약 1:17', tier: 1, topic: '신론', source: 'WCF 2.1' },
  // 3. 인간론·죄
  { id: '창 1:27', ref: '창 1:27', tier: 1, topic: '인간론·죄', source: 'WCF 6.3' },
  { id: '엡 2:3', ref: '엡 2:3', tier: 1, topic: '인간론·죄', source: 'WCF 6.4' },
  // 4. 언약
  { id: '창 3:15', ref: '창 3:15', tier: 1, topic: '언약', source: 'WCF 7.3' },
  { id: '눅 22:20', ref: '눅 22:20', tier: 1, topic: '언약', source: 'WCF 7.4' },
  // 5. 기독론
  { id: '갈 4:4', ref: '갈 4:4', tier: 1, topic: '기독론', source: 'WCF 8.2' },
  { id: '딤전 2:5', ref: '딤전 2:5', tier: 1, topic: '기독론', source: 'WCF 8.1' },
  { id: '요 1:14', ref: '요 1:14', tier: 1, topic: '기독론', source: 'WCF 8.2' },
  // 6. 구원론
  { id: '엡 2:8', ref: '엡 2:8', tier: 1, topic: '구원론', source: 'WCF 10.2' },
  { id: '롬 3:24', ref: '롬 3:24', tier: 1, topic: '구원론', source: 'WCF 11.1' },
  { id: '요 1:12', ref: '요 1:12', tier: 1, topic: '구원론', source: 'WCF 11.2' },
  { id: '요 10:28', ref: '요 10:28', tier: 1, topic: '구원론', source: 'WCF 11.5' },
  { id: '갈 5:17', ref: '갈 5:17', tier: 1, topic: '구원론', source: 'WCF 9.4' },
  { id: '눅 22:32', ref: '눅 22:32', tier: 1, topic: '구원론', source: 'WCF 11.5' },
  // 7. 율법·자유
  { id: '롬 8:1', ref: '롬 8:1', tier: 1, topic: '율법·자유', source: 'WCF 19.6' },
  { id: '갈 5:1', ref: '갈 5:1', tier: 1, topic: '율법·자유', source: 'WCF 20.1' },
  // 8. 예배·서약
  { id: '출 20:8', ref: '출 20:8', tier: 1, topic: '예배·서약', source: 'WCF 21.7' },
  { id: '마 4:10', ref: '마 4:10', tier: 1, topic: '예배·서약', source: 'WCF 21.1' },
  // 9. 국가·결혼
  { id: '롬 13:1', ref: '롬 13:1', tier: 1, topic: '국가·결혼', source: 'WCF 23.2' },
  { id: '마 19:6', ref: '마 19:6', tier: 1, topic: '국가·결혼', source: 'WCF 24.1' },
  // 10. 교회론
  { id: '골 1:18', ref: '골 1:18', tier: 1, topic: '교회론', source: 'WCF 25.1' },
  // 11. 성례
  { id: '마 28:19', ref: '마 28:19', tier: 1, topic: '성례', source: 'WCF 27.1' },
  { id: '고전 10:16', ref: '고전 10:16', tier: 1, topic: '성례', source: 'WCF 27.1' },
  // 12. 권징·회의
  { id: '마 18:17', ref: '마 18:17', tier: 1, topic: '권징·회의', source: 'WCF 30.2' },
  // 13. 종말론
  { id: '고후 5:10', ref: '고후 5:10', tier: 1, topic: '종말론', source: 'WCF 33.1' },
  { id: '마 25:21', ref: '마 25:21', tier: 1, topic: '종말론', source: 'WCF 33.2' },
];
