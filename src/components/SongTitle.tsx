// 곡 제목 공통 렌더 — '(' 로 시작하는 제목은 괄호 태그를 윗줄, 나머지 제목을 아랫줄로 2줄 표시.
// 태그가 없으면 기존과 동일하게 title 한 줄을 그대로 그린다.
import { parseTitle } from '@/utils/songTitle';

interface SongTitleProps {
  title: string;
  className?: string;
  /** 태그(윗줄) 전용 클래스 */
  tagClassName?: string;
  /** 제목(아랫줄) 전용 클래스 — 예: line-clamp-1 */
  restClassName?: string;
  as?: 'span' | 'h3';
}

export function SongTitle({
  title,
  className,
  tagClassName,
  restClassName,
  as: Tag = 'span',
}: SongTitleProps) {
  const { tag, rest } = parseTitle(title);
  if (!tag) return <Tag className={className}>{title}</Tag>;
  return (
    <Tag className={className}>
      <span className={`block ${tagClassName ?? ''}`}>{tag}</span>
      <span className={`block ${restClassName ?? ''}`}>{rest}</span>
    </Tag>
  );
}
