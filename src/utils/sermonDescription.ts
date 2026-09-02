// 곡 설명(description = "설교제목|설교본문|설교자|구분|날짜") 저장 전 구분자 오타 정리.
// 파서(parseSermon)는 그대로 '|'만 인식한다. 이 함수는 저장 직전에만 쓰여
// 제목↔본문 사이에 ' ! '로 잘못 입력된 구분자를 조건부로 ' | '로 바꿔 준다.
//
// 규칙(안전 우선):
// - '|' 조각이 5개 이상 → 그대로 반환
// - 조각이 4개이고 ' ! '(앞뒤 공백 포함)가 정확히 1개 → 그것을 ' | '로 교체,
//   교체 결과가 5조각이면 반환, 아니면 원본 반환
// - 그 외 모든 경우 → 원본 반환
// - 단어에 붙은 느낌표("찬양하라!")는 ' ! ' 패턴이 아니므로 대상 아님
const splitPipe = (s: string) =>
  s
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

export function fixSermonSeparator(desc: string): string {
  if (splitPipe(desc).length >= 5) return desc;
  if (splitPipe(desc).length !== 4) return desc;
  if (desc.split(' ! ').length !== 2) return desc; // ' ! ' 정확히 1개
  const fixed = desc.replace(' ! ', ' | ');
  return splitPipe(fixed).length === 5 ? fixed : desc;
}
