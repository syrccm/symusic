// 메인 화면 배너 — 미니탭(전체/즐겨찾기/검색) 아래, 곡 목록 카드 위에 표시되는 링크 한 줄.
// - 한 줄 배치: [CLICK 배지] {text} — text 는 config/banner.text 그대로 표시(꺾쇠·접미어 가공 없음)
//   · 배지: 분홍(#ED93B1) 알약, 안에 커서 아이콘 + "CLICK"(12px, 어두운 분홍 #4B1528 글자)
//     분홍↔청록(#3FCDB8) 깜빡임은 index.css 의 .animate-badge-blink(동작 줄이기 설정 시 정지)
//   · 텍스트: 분홍빛 흰색(#f0dced) 14px, 배경 없음·왼쪽 정렬, 길면 한 줄 말줄임(truncate)
// - 전체가 하나의 버튼(클릭 영역), hover 시 은은한 흰 배경
// - 왼쪽 여백 pl-[9px] = 곡 목록 카드 border 1px + CardHeader px-2 와 왼쪽 라인 일치
// - 이동 로직(항상 새 탭 window.open)은 부모(MusicPlayer)가 onClick 으로 처리
import { MousePointer } from 'lucide-react';

interface PlaylistBannerProps {
  text: string;
  onClick: () => void;
}

export function PlaylistBanner({ text, onClick }: PlaylistBannerProps) {
  // 화면에는 text 그대로, 접근성 라벨에만 새 창 안내를 덧붙인다.
  const ariaLabel = `${text} (새 창에서 열기)`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="group w-full min-w-0 rounded-lg pl-[9px] pr-3 py-1 flex flex-row flex-nowrap items-center gap-2
        bg-transparent hover:bg-white/5 active:bg-white/10 transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/60"
    >
      {/* CLICK 배지 */}
      <span
        aria-hidden="true"
        className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#ED93B1] text-[#4B1528] animate-badge-blink
          px-2.5 py-1 text-xs font-bold leading-none tracking-wide"
      >
        <MousePointer className="h-3 w-3" strokeWidth={2.5} />
        CLICK
      </span>
      {/* 문구 — 한 줄, 넘치면 말줄임 */}
      <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[#f0dced] group-hover:text-white transition-colors">
        {text}
      </span>
    </button>
  );
}
