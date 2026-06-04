import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { shorterCatechism } from '@/data/westminsterShorter';
import BibleVerseModal from '@/components/BibleVerseModal';
import { refHasValidVerse } from '@/utils/bibleParser';

interface CatechismRefsProps {
  refs?: number[];
  className?: string;
}

/**
 * 찬양 가사 하단에 매핑된 웨스트민스터 소요리문답을 표시하는 카드.
 * 보라 배경(#3A0D6E) + teal(#14b8a6) 강조, 모바일 최적화.
 * 모든 문답 카드는 기본 닫힘 — 탭할 때만 펼쳐지며, 여러 개를 동시에 열 수 있다.
 */
export default function CatechismRefs({ refs, className = '' }: CatechismRefsProps) {
  // 유효한 번호만, 중복 제거, 오름차순. shorterCatechism에서 본문 조회.
  const items = Array.from(new Set((refs ?? []).filter((n) => Number.isInteger(n))))
    .map((n) => shorterCatechism.find((c) => c.number === n))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .sort((a, b) => a.number - b.number);

  // 모든 문답 기본 닫힘 — 사용자가 탭할 때만 펼쳐진다.
  const [openSet, setOpenSet] = useState<Set<number>>(() => new Set());

  // 곡이 바뀌면 열림 상태를 초기화한다.
  // 이 컴포넌트는 곡 전환 시 언마운트되지 않고 refs prop만 갱신되며 재사용되므로,
  // 표시 문답 집합(정렬·중복제거된 번호)을 추적해 "바뀔 때만" openSet을 비운다.
  // (렌더 중 setState — React 공식 "prop 변경 시 상태 리셋" 패턴: 깜빡임 없이 즉시 반영.
  //  같은 곡에서는 refsKey가 동일하므로 토글/다중 열기 동작은 그대로 유지된다.)
  const refsKey = items.map((i) => i.number).join(',');
  const [prevRefsKey, setPrevRefsKey] = useState(refsKey);
  if (refsKey !== prevRefsKey) {
    setPrevRefsKey(refsKey);
    setOpenSet(new Set());
  }

  // 클릭한 성경 구절(개역한글 모달)
  const [verseRef, setVerseRef] = useState<string | null>(null);

  if (items.length === 0) return null;

  const toggle = (n: number) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });

  return (
    <>
    <div
      className={`rounded-2xl p-4 text-left ${className}`}
      style={{ backgroundColor: '#3A0D6E' }}
    >
      {/* 헤더: 구분선 없이 제목만 (여백으로 자연스럽게 연결) */}
      <div className="mb-4 flex items-center gap-1.5">
        <span aria-hidden="true" className="text-xl">📖</span>
        <span className="text-base font-bold text-white">웨스트민스터 소요리문답 매칭</span>
      </div>

      <div className="space-y-2.5">
        {items.map((item) => {
          const open = openSet.has(item.number);
          return (
            <div
              key={item.number}
              className="overflow-hidden rounded-xl border border-purple-300/20 bg-black/20"
            >
              <button
                type="button"
                onClick={() => toggle(item.number)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-white/5"
              >
                <span
                  className="shrink-0 text-sm font-bold"
                  style={{ color: '#14b8a6' }}
                >
                  소요리문답 제{item.number}문
                </span>
                <ChevronDown
                  className={`ml-auto h-4 w-4 shrink-0 text-purple-300 transition-transform duration-300 ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className={`grid transition-all duration-300 ease-in-out ${
                  open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-3.5 pb-3.5">
                    <p className="mb-1.5 text-base leading-relaxed text-purple-200/80">
                      {item.question}
                    </p>
                    <p className="text-base leading-relaxed text-white break-keep">
                      “{item.answer}”
                    </p>
                    {(() => {
                      // 실제 존재하는 절을 가진 참조만 노출 (잘못된 참조 버튼은 숨김)
                      const validRefs = item.references.filter(refHasValidVerse);
                      if (validRefs.length === 0) return null;
                      return (
                        <div className="mt-2.5">
                          <p
                            className="my-3 flex items-center gap-1.5 text-base font-semibold"
                            style={{ color: '#D4AF37' }}
                          >
                            <span aria-hidden="true">📖</span>
                            아래 성경 구절을 클릭하면 본문이 열립니다
                          </p>
                          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                            {validRefs.map((ref, i) => (
                              <button
                                key={`${item.number}-${i}`}
                                type="button"
                                onClick={() => setVerseRef(ref)}
                                className="cursor-pointer rounded px-2 py-1 text-base text-teal-300 underline underline-offset-2 transition-colors hover:bg-white/10 hover:text-teal-200"
                              >
                                {ref}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    <BibleVerseModal
      open={verseRef !== null}
      onOpenChange={(o) => !o && setVerseRef(null)}
      refString={verseRef}
    />
    </>
  );
}
