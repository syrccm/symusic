// 곡 제목 공통 렌더 — '(' 로 시작하는 제목은 괄호 태그를 윗줄, 나머지 제목을 아랫줄로 2줄 표시.
// 태그가 없으면 기존과 동일하게 title 한 줄을 그대로 그린다.
// subtitle/note 가 있으면 제목 아래에 "(부제: …)" 줄과 한 줄 설명을 작은 글씨로 덧붙인다(가사 카드용).
// 보조 줄이 하나라도 있으면 auxClassName(예: 가사와의 여백 mb-14)을 보조 줄 묶음에 적용한다.
import { parseTitle } from '@/utils/songTitle';

interface SongTitleProps {
  title: string;
  className?: string;
  /** 태그(윗줄) 전용 클래스 */
  tagClassName?: string;
  /** 제목(아랫줄) 전용 클래스 — 예: line-clamp-1 */
  restClassName?: string;
  as?: 'span' | 'h3';
  /** 부제(선택). 비어 있으면 줄을 그리지 않는다 */
  subtitle?: string;
  /** 한 줄 설명(선택). 비어 있으면 줄을 그리지 않는다 */
  note?: string;
  /** 보조 줄(부제·설명) 묶음 추가 클래스 — 예: 가사 본문과의 여백 mb-14 */
  auxClassName?: string;
}

export function SongTitle({
  title,
  className,
  tagClassName,
  restClassName,
  as: Tag = 'span',
  subtitle,
  note,
  auxClassName,
}: SongTitleProps) {
  const { tag, rest } = parseTitle(title);
  const sub = subtitle?.trim();
  const noteText = note?.trim();
  const aux =
    sub || noteText ? (
      <span className={`block text-sm font-normal text-center ${auxClassName ?? ''}`}>
        {sub && <span className="block text-purple-200/70">(부제: {sub})</span>}
        {noteText && <span className="block text-purple-200/60">{noteText}</span>}
      </span>
    ) : null;
  if (!tag) {
    return (
      <Tag className={className}>
        {title}
        {aux}
      </Tag>
    );
  }
  return (
    <Tag className={className}>
      <span className={`block ${tagClassName ?? ''}`}>{tag}</span>
      <span className={`block ${restClassName ?? ''}`}>{rest}</span>
      {aux}
    </Tag>
  );
}
