import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { memoryVerses, MEMORY_TOPICS } from '@/data/memoryVerses';
import { parseRef, getVerseText, loadKrv, type KrvData } from '@/utils/bibleParser';
import { useMemoryProgress, type MemoryStatus } from '@/hooks/useMemoryProgress';

interface MemoryPageProps {
  onClose?: () => void;
}

type LoadStatus = 'loading' | 'ready' | 'error';

// 진도 상태별 뱃지 표시 정보
const STATUS_BADGE: Record<MemoryStatus, { label: string; className: string }> = {
  none: { label: '안외움', className: 'border-slate-500/40 bg-slate-700/40 text-gray-300' },
  learning: { label: '외우는중', className: 'border-amber-400/40 bg-amber-500/15 text-amber-300' },
  memorized: { label: '외움', className: 'border-teal-400/40 bg-teal-500/15 text-teal-300' },
};

// memoryVerse.ref → 개역한글 단일 절 본문 (없으면 null)
function verseTextOf(data: KrvData, ref: string): string | null {
  const seg = parseRef(ref)[0];
  if (!seg) return null;
  return getVerseText(data, seg.book, seg.chapter, seg.verseStart);
}

/**
 * 성경암송 — 구절 목록 화면(메뉴 오버레이). 1차(tier 1) 30구절을 교리 주제별로 보여준다.
 * 본문은 krv.json에서 지연 로딩(개역한글). 진도 뱃지를 탭하면 상태가 순환한다.
 * (단계적 가림 연습은 다음 단계에서 별도 추가 — 이 화면은 목록+본문+진도까지만.)
 */
export default function MemoryPage({ onClose }: MemoryPageProps = {}) {
  const [data, setData] = useState<KrvData | null>(null);
  const [load, setLoad] = useState<LoadStatus>('loading');
  const { status, cycleStatus, memorized } = useMemoryProgress();

  // 1차: tier 1 (30구절)만
  const verses = memoryVerses.filter((v) => v.tier <= 1);

  // 개역한글 데이터 지연 로딩(1회 fetch 후 캐시) — BibleVerseModal과 동일 패턴
  useEffect(() => {
    let cancelled = false;
    setLoad('loading');
    loadKrv()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoad('ready');
        }
      })
      .catch((err) => {
        console.error('[MemoryPage] 성경 데이터 로드 실패:', err);
        if (!cancelled) setLoad('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'linear-gradient(160deg, #3A0D6E 0%, #4A1290 100%)' }}
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        {/* 헤더 + 닫기 */}
        <header className="sticky top-0 z-20 bg-[#3A0D6E]/95 px-3 pt-3 pb-2 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-lg font-bold">성경암송</h1>
              <p className="text-xs text-purple-200/70">
                1차 · 신앙고백서 30구절 · 외움 {memorized}/{verses.length}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onClose?.()}
              aria-label="닫기"
              title="닫기"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-500/30 bg-slate-800/90 text-white shadow-lg transition-colors hover:bg-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-3 pb-10 pt-2">
          {load === 'loading' && (
            <div className="flex items-center justify-center gap-2 py-16 text-purple-200">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">성경 본문을 불러오는 중...</span>
            </div>
          )}

          {load === 'error' && (
            <div className="py-16 text-center text-sm text-purple-200/80">
              <p>성경 본문을 불러오지 못했습니다.</p>
              <p className="mt-1 text-xs text-purple-300/60">잠시 후 다시 시도해주세요.</p>
            </div>
          )}

          {load === 'ready' && data && (
            <div className="space-y-6">
              {MEMORY_TOPICS.map((topic) => {
                const items = verses.filter((v) => v.topic === topic);
                if (items.length === 0) return null;
                return (
                  <section key={topic}>
                    <h2 className="mb-2 text-sm font-bold" style={{ color: '#14b8a6' }}>
                      {topic}
                    </h2>
                    <div className="space-y-2">
                      {items.map((v) => {
                        const badge = STATUS_BADGE[status(v.id)];
                        const text = verseTextOf(data, v.ref);
                        return (
                          <div
                            key={v.id}
                            className="rounded-xl border border-purple-300/20 bg-black/20 p-3.5"
                          >
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-teal-300">{v.id}</span>
                              <button
                                type="button"
                                onClick={() => cycleStatus(v.id)}
                                aria-label={`${v.id} 진도: ${badge.label} (탭하여 변경)`}
                                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${badge.className}`}
                              >
                                {badge.label}
                              </button>
                            </div>
                            <p className="text-base leading-relaxed text-white break-keep">
                              {text ?? (
                                <span className="text-purple-300/60">본문을 찾을 수 없습니다.</span>
                              )}
                            </p>
                            <p className="mt-2 text-right text-[11px] text-purple-300/50">
                              {v.source} · 개역한글
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
