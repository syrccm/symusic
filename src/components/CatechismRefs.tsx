import { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
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
 * 문답이 여러 개면 접기/펼치기(첫 문답은 기본 펼침).
 */
export default function CatechismRefs({ refs, className = '' }: CatechismRefsProps) {
  // 유효한 번호만, 중복 제거, 오름차순. shorterCatechism에서 본문 조회.
  const items = Array.from(new Set((refs ?? []).filter((n) => Number.isInteger(n))))
    .map((n) => shorterCatechism.find((c) => c.number === n))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .sort((a, b) => a.number - b.number);

  // 첫 문답만 기본 펼침
  const [openSet, setOpenSet] = useState<Set<number>>(
    () => new Set(items.length ? [items[0].number] : [])
  );

  // 클릭한 성경 구절(개역한글 모달)
  const [verseRef, setVerseRef] = useState<string | null>(null);

  if (items.length === 0) return null;

  const toggle = (n: number) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });

  const single = items.length === 1;

  return (
    <>
    <div
      className={`rounded-2xl p-4 text-left ${className}`}
      style={{ backgroundColor: '#3A0D6E' }}
    >
      <div className="flex items-center gap-1.5 pb-3">
        <BookOpen className="h-4 w-4" style={{ color: '#14b8a6' }} />
        <span className="text-xs font-medium tracking-wide text-purple-200">
          웨스트민스터 신앙고백
        </span>
      </div>

      <div className="space-y-2.5">
        {items.map((item) => {
          const open = single || openSet.has(item.number);
          return (
            <div
              key={item.number}
              className="overflow-hidden rounded-xl border border-purple-300/20 bg-black/20"
            >
              <button
                type="button"
                onClick={() => !single && toggle(item.number)}
                aria-expanded={open}
                className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left ${
                  single ? 'cursor-default' : 'transition-colors hover:bg-white/5'
                }`}
              >
                <span
                  className="shrink-0 text-sm font-bold"
                  style={{ color: '#14b8a6' }}
                >
                  소요리문답 제{item.number}문
                </span>
                {!single && (
                  <ChevronDown
                    className={`ml-auto h-4 w-4 shrink-0 text-purple-300 transition-transform duration-300 ${
                      open ? 'rotate-180' : ''
                    }`}
                  />
                )}
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
                            성경 구절을 클릭하면 본문이 열립니다
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
