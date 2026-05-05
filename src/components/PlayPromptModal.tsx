import { useEffect } from 'react';
import { PlayCircle, X } from 'lucide-react';

interface PlayPromptModalProps {
  songTitle: string;
  onPlay: () => void;
  onCancel: () => void;
}

export function PlayPromptModal({ songTitle, onPlay, onCancel }: PlayPromptModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-300 px-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="재생 시작 확인"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-purple-500/30 bg-gradient-to-br from-slate-800 to-purple-900/80 p-8 text-center shadow-2xl animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="닫기"
          className="absolute top-3 right-3 p-1 text-gray-400 transition-colors hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="mb-2 text-xs text-purple-200">🎁 찬양 선물이 도착했어요</p>
        <h3 className="mb-6 break-words text-lg font-semibold text-white">
          "{songTitle}"
        </h3>

        <button
          type="button"
          onClick={onPlay}
          aria-label={`${songTitle} 재생`}
          className="group relative mx-auto block focus:outline-none"
        >
          <span className="absolute inset-0 rounded-full bg-pink-400/30 animate-ping" aria-hidden="true" />
          <PlayCircle
            className="relative mx-auto h-24 w-24 text-pink-400 drop-shadow-[0_0_18px_rgba(236,72,153,0.6)] transition-transform duration-300 group-hover:scale-110 group-active:scale-95"
            strokeWidth={1.5}
          />
        </button>

        <p className="mt-4 text-sm font-medium text-white">탭하여 재생 ▶</p>
        <p className="mt-2 text-xs text-gray-400">
          자동재생이 차단되어 한 번만 눌러주세요
        </p>
      </div>
    </div>
  );
}
