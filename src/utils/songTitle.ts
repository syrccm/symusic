// 곡 제목 파싱 — 괄호 태그가 맨 앞이든 중간이든 "처음부터 첫 ')'까지"를 윗줄 태그로,
// 그 뒤 나머지를 아랫줄 제목으로 나눈다.
//   "(영권3) 주를 기쁘시게"    → tag "(영권3)",  rest "주를 기쁘시게"
//   "특새(1) 사랑의 길 걷는다" → tag "특새(1)",  rest "사랑의 길 걷는다"
//   "오늘 임하시네"            → 괄호 없음 → tag null, 한 줄 그대로
export function parseTitle(title: string): { tag: string | null; rest: string } {
  const t = title.trimStart();
  const open = t.indexOf('(');
  const close = t.indexOf(')');
  // 여는 괄호와 닫는 괄호가 순서대로 있고, 닫는 괄호 뒤에 실제 제목이 남을 때만 분리
  if (open < 0 || close < 0 || close < open) return { tag: null, rest: title };
  const tag = t.slice(0, close + 1);        // 처음부터 첫 ')'까지 (예: "(영권3)" 또는 "특새(1)")
  const rest = t.slice(close + 1).trim();   // 그 뒤 나머지
  return rest ? { tag, rest } : { tag: null, rest: title }; // 나머지 없으면 현행 한 줄
}
