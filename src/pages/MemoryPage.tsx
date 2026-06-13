import { useEffect, useState } from 'react';
import { X, Loader2, ChevronRight } from 'lucide-react';
import { memoryVerses, MEMORY_TOPICS } from '@/data/memoryVerses';
import { parseRef, getSegmentVerses, loadKrv, type KrvData } from '@/utils/bibleParser';
import { useMemoryProgress, type MemoryStatus } from '@/hooks/useMemoryProgress';
import MemoryPractice from '@/components/MemoryPractice';

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

// memoryVerse.ref → 개역한글 본문. 범위(여러 절)면 절 본문을 공백으로 이어붙인다. (없으면 null)
// 절 번호는 표시하지 않음 — 가림연습 maskText가 번호까지 가리는 어색함을 피한다.
function verseTextOf(data: KrvData, ref: string): string | null {
  const segs = parseRef(ref);
  if (!segs.length) return null;
  const parts = segs
    .flatMap((seg) => getSegmentVerses(data, seg).map((x) => x.text))
    .filter((t): t is string => Boolean(t));
  return parts.length ? parts.join(' ') : null;
}

/**
 * 성경암송 — 구절 목록 화면(메뉴 오버레이). 1차(tier 1) 30구절을 교리 주제별로 보여준다.
 * 본문은 krv.json에서 지연 로딩(개역한글). 진도 뱃지를 탭하면 상태가 순환한다.
 * (단계적 가림 연습은 다음 단계에서 별도 추가 — 이 화면은 목록+본문+진도까지만.)
 */
export default function MemoryPage({ onClose }: MemoryPageProps = {}) {
  const [data, setData] = useState<KrvData | null>(null);
  const [load, setLoad] = useState<LoadStatus>('loading');
  const { status, setStatus, cycleStatus, memorized } = useMemoryProgress();

  // 1차: tier 1 (30구절)만
  const verses = memoryVerses.filter((v) => v.tier <= 1);

  // 전체화면 가림 연습으로 연 구절(평면 배열 인덱스). null이면 목록 화면.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selected = selectedIndex != null ? verses[selectedIndex] : null;

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
              <h1 className="text-xl font-bold leading-tight">
                신앙고백 암송{' '}
                <span className="text-sm font-medium text-purple-200/80 whitespace-nowrap">
                  - 웨스트민스터 신앙고백서
                </span>
              </h1>
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

          {/* 단계 영역 — 향후 소요리·대요리 추가 시 이 줄을 탭 스트립으로 교체.
              지금은 1단계만 있으므로 빈 탭 없이 현재 단계만 표시. */}
          <div className="mt-2 flex items-center">
            {/* 2차(소요리·대요리) 추가 시 이 자리에 단계 탭 스트립을 넣는다. */}
            <span className="text-xs text-purple-200/70">
              외움 {memorized}/{verses.length}
            </span>
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
                            onClick={() => setSelectedIndex(verses.findIndex((x) => x.id === v.id))}
                            className="cursor-pointer rounded-xl border border-purple-300/20 bg-black/20 p-3.5 transition-colors hover:bg-black/30 active:bg-black/40"
                          >
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-teal-300">{v.id}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cycleStatus(v.id);
                                }}
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
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-teal-400/30 bg-teal-500/15 px-2.5 py-1 text-xs font-semibold text-teal-300">
                                암송하기
                                <ChevronRight className="h-4 w-4" />
                              </span>
                              <span className="text-[11px] text-purple-300/50">
                                {v.source} · 개역한글
                              </span>
                            </div>
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

      {/* 전체화면 가림 연습 — key로 구절마다 리마운트(모드 초기화) */}
      {selected && data && (
        <MemoryPractice
          key={selected.id}
          verse={selected}
          text={verseTextOf(data, selected.ref)}
          status={status(selected.id)}
          onSetStatus={(s) => setStatus(selected.id, s)}
          onPrev={() => setSelectedIndex((i) => (i != null && i > 0 ? i - 1 : i))}
          onNext={() =>
            setSelectedIndex((i) => (i != null && i < verses.length - 1 ? i + 1 : i))
          }
          hasPrev={selectedIndex != null && selectedIndex > 0}
          hasNext={selectedIndex != null && selectedIndex < verses.length - 1}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </div>
  );
}
