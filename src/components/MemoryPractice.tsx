import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { maskText } from '@/utils/maskText';
import type { MemoryVerse } from '@/data/memoryVerses';
import type { MemoryStatus } from '@/hooks/useMemoryProgress';

// 가림 4모드: 전체 보기 → 첫 글자 → 완전 가림 → 확인(원문 공개)
type PracticeMode = 'show' | 'first' | 'mask' | 'check';

const MODE_TABS: { key: PracticeMode; label: string }[] = [
  { key: 'show', label: '전체' },
  { key: 'first', label: '첫 글자' },
  { key: 'mask', label: '완전 가림' },
  { key: 'check', label: '확인' },
];

const STATUS_TABS: { key: MemoryStatus; label: string; active: string }[] = [
  { key: 'none', label: '안외움', active: 'border-slate-400/50 bg-slate-600/50 text-white' },
  { key: 'learning', label: '외우는중', active: 'border-amber-400/60 bg-amber-500/25 text-amber-200' },
  { key: 'memorized', label: '외움', active: 'border-teal-400/60 bg-teal-500/25 text-teal-200' },
];

interface MemoryPracticeProps {
  verse: MemoryVerse;
  /** 이미 로드된 개역한글 본문 (없으면 null) */
  text: string | null;
  status: MemoryStatus;
  onSetStatus: (s: MemoryStatus) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  /** 목록으로 복귀 */
  onClose: () => void;
}

/**
 * 성경암송 — 전체화면 가림 연습. 한 구절에 집중해 4모드로 단계적 가림 연습한다.
 * 본문은 prop으로 받은 text를 재사용(재fetch 없음). 모드 상태는 내부에서만 관리하며,
 * 구절이 바뀌면 상위(MemoryPage)가 key로 리마운트시켜 '전체'로 초기화한다.
 */
export default function MemoryPractice({
  verse,
  text,
  status,
  onSetStatus,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onClose,
}: MemoryPracticeProps) {
  const [mode, setMode] = useState<PracticeMode>('show');

  const display =
    text == null
      ? null
      : mode === 'first'
      ? maskText(text, 'firstChar')
      : mode === 'mask'
      ? maskText(text, 'full')
      : text; // 'show' | 'check' — 원문 그대로

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col text-white"
      style={{ background: 'linear-gradient(160deg, #3A0D6E 0%, #4A1290 100%)' }}
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        {/* 상단: 목록 복귀 + 구절 + (폭 보정) */}
        <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="목록으로"
            title="목록으로"
            className="flex h-10 items-center gap-1 rounded-full border border-purple-500/30 bg-slate-800/90 px-3 text-sm text-white shadow-lg transition-colors hover:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" /> 목록
          </button>
          <span className="text-base font-bold text-teal-300">{verse.id}</span>
          <span className="w-[64px]" aria-hidden="true" />
        </header>

        {/* 본문 (가림 적용) — 위에서부터 시작, 넘치면 세로 스크롤 (절 수 무관·동일 폰트) */}
        <main className="flex-1 overflow-y-auto px-5 py-8">
          <p className="whitespace-pre-wrap break-keep text-center text-2xl leading-relaxed tracking-wide text-white">
            {display ?? (
              <span className="text-base text-purple-300/60">본문을 찾을 수 없습니다.</span>
            )}
          </p>
        </main>

        {/* 하단 컨트롤 */}
        <div className="space-y-3 px-3 pb-6 pt-2">
          {/* 4모드 토글 */}
          <div className="grid grid-cols-4 gap-1.5">
            {MODE_TABS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                aria-pressed={mode === m.key}
                className={`rounded-lg border py-2 text-sm font-semibold transition-colors ${
                  mode === m.key
                    ? 'border-teal-400/60 bg-teal-500/20 text-teal-200'
                    : 'border-purple-300/20 bg-black/20 text-purple-200/70 hover:bg-white/5'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* 진도 3버튼 + 이전/다음 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="이전 구절"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-purple-300/20 bg-black/20 text-white transition-colors hover:bg-white/5 disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="grid flex-1 grid-cols-3 gap-1.5">
              {STATUS_TABS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onSetStatus(s.key)}
                  aria-pressed={status === s.key}
                  className={`rounded-lg border py-2 text-xs font-semibold transition-colors ${
                    status === s.key
                      ? s.active
                      : 'border-purple-300/20 bg-black/20 text-purple-200/60 hover:bg-white/5'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="다음 구절"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-purple-300/20 bg-black/20 text-white transition-colors hover:bg-white/5 disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* 출처 */}
          <p className="text-center text-[11px] text-purple-300/50">{verse.source} · 개역한글</p>
        </div>
      </div>
    </div>
  );
}
