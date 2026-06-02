import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Search } from 'lucide-react';
import { shorterCatechism, type CatechismItem } from '@/data/westminsterShorter';
import { largerCatechism } from '@/data/westminsterLarger';
import { confession, type ConfessionChapter } from '@/data/westminsterConfession';
import BibleVerseModal from '@/components/BibleVerseModal';
import { refHasValidVerse } from '@/utils/bibleParser';

type TabKey = 'shorter' | 'larger' | 'confession';

// 신앙고백서가 상위 문서이므로 가장 먼저 표시
const TABS: { key: TabKey; label: string }[] = [
  { key: 'confession', label: '신앙고백서' },
  { key: 'shorter', label: '소요리문답' },
  { key: 'larger', label: '대요리문답' },
];

// 검색 정규화: 공백 제거 + 소문자
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

function ReferenceList({
  references,
  onRefClick,
}: {
  references: string[];
  onRefClick: (ref: string) => void;
}) {
  // 실제 존재하는 절을 가진 참조만 노출 (잘못된 참조 버튼은 숨김)
  const validRefs = (references ?? []).filter(refHasValidVerse);
  if (validRefs.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-x-2.5 gap-y-1">
      {validRefs.map((ref, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onRefClick(ref)}
          className="cursor-pointer text-xs leading-relaxed text-teal-300 underline underline-offset-2 transition-colors hover:text-teal-200"
        >
          {ref}
        </button>
      ))}
    </div>
  );
}

// 문답(소요리/대요리) 아코디언 항목
function CatechismRow({
  item,
  onRefClick,
}: {
  item: CatechismItem;
  onRefClick: (ref: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-purple-400/20 bg-black/15 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-purple-400/10"
      >
        <span className="mt-0.5 min-w-[2.25rem] shrink-0 text-sm font-bold text-teal-400">
          {item.number}문
        </span>
        <span className="flex-1 text-[15px] font-medium leading-snug text-gray-100">
          {item.question}
        </span>
        <ChevronDown
          className={`mt-0.5 h-5 w-5 shrink-0 text-purple-300 transition-transform duration-300 ${
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
          <div className="border-t border-purple-400/15 px-4 py-3.5 pl-[3.75rem]">
            <p className="text-[15px] leading-relaxed text-gray-200">{item.answer}</p>
            <ReferenceList references={item.references} onRefClick={onRefClick} />
          </div>
        </div>
      </div>
    </div>
  );
}

// 신앙고백서 장(chapter) 아코디언 항목
function ChapterRow({
  item,
  onRefClick,
}: {
  item: ConfessionChapter;
  onRefClick: (ref: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-purple-400/20 bg-black/15 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-purple-400/10"
      >
        <span className="mt-0.5 min-w-[2.75rem] shrink-0 text-sm font-bold text-teal-400">
          {item.chapter}장
        </span>
        <span className="flex-1 text-[15px] font-medium leading-snug text-gray-100">
          {item.title}
        </span>
        <ChevronDown
          className={`mt-0.5 h-5 w-5 shrink-0 text-purple-300 transition-transform duration-300 ${
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
          <div className="space-y-4 border-t border-purple-400/15 px-4 py-3.5">
            {item.sections.map((sec) => (
              <div key={sec.number} className="flex gap-3">
                <span className="mt-0.5 shrink-0 text-sm font-bold text-teal-400">
                  {sec.number}.
                </span>
                <div className="flex-1">
                  <p className="text-[15px] leading-relaxed text-gray-200">{sec.text}</p>
                  <ReferenceList references={sec.references} onRefClick={onRefClick} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConfessionPageProps {
  /** 오버레이로 띄울 때 닫기 콜백. 없으면 라우트 모드(뒤로가기). */
  onClose?: () => void;
}

export default function ConfessionPage({ onClose }: ConfessionPageProps = {}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('confession');
  const [query, setQuery] = useState('');
  // 클릭한 성경 구절(개역한글 모달)
  const [verseRef, setVerseRef] = useState<string | null>(null);

  const q = norm(query);

  const filteredShorter = useMemo(() => {
    if (!q) return shorterCatechism;
    return shorterCatechism.filter(
      (it) =>
        String(it.number) === query.trim() ||
        norm(it.question).includes(q) ||
        norm(it.answer).includes(q)
    );
  }, [q, query]);

  const filteredLarger = useMemo(() => {
    if (!q) return largerCatechism;
    return largerCatechism.filter(
      (it) =>
        String(it.number) === query.trim() ||
        norm(it.question).includes(q) ||
        norm(it.answer).includes(q)
    );
  }, [q, query]);

  const filteredConfession = useMemo(() => {
    if (!q) return confession;
    return confession.filter(
      (ch) =>
        String(ch.chapter) === query.trim() ||
        norm(ch.title).includes(q) ||
        ch.sections.some((s) => norm(s.text).includes(q))
    );
  }, [q, query]);

  const resultCount =
    tab === 'shorter'
      ? filteredShorter.length
      : tab === 'larger'
      ? filteredLarger.length
      : filteredConfession.length;

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'linear-gradient(160deg, #3A0D6E 0%, #4A1290 100%)' }}
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        {/* 헤더 + 뒤로가기 */}
        <header className="sticky top-0 z-20 bg-[#3A0D6E]/95 px-3 pt-3 pb-2 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (onClose ? onClose() : navigate('/'))}
              aria-label="뒤로가기"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-bold">신앙고백문답</h1>
          </div>

          {/* 검색창 */}
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-300" />
            <input
              type="text"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="문답 번호 또는 키워드 검색"
              aria-label="문답 번호 또는 키워드 검색"
              className="h-12 w-full rounded-xl border border-purple-400/40 bg-slate-900/40 pl-10 pr-4 text-base text-white placeholder:text-purple-300/70 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>

          {/* 탭 */}
          <div className="mt-3 flex border-b border-purple-400/30">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`relative flex-1 pb-2.5 pt-1 text-center text-[15px] font-medium transition-colors ${
                    active ? 'text-teal-400' : 'text-purple-200/70 hover:text-purple-100'
                  }`}
                >
                  {t.label}
                  {active && (
                    <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-teal-400" />
                  )}
                </button>
              );
            })}
          </div>
        </header>

        {/* 본문 */}
        <main className="flex-1 px-3 py-4">
          <p className="mb-3 px-1 text-xs text-purple-200/70">
            {query ? `검색 결과 ${resultCount}건` : `전체 ${resultCount}${tab === 'confession' ? '장' : '문답'}`}
          </p>

          {resultCount === 0 ? (
            <div className="mt-16 text-center text-purple-200/70">
              <p>검색 결과가 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-2.5 pb-10">
              {tab === 'shorter' &&
                filteredShorter.map((it) => (
                  <CatechismRow key={it.number} item={it} onRefClick={setVerseRef} />
                ))}
              {tab === 'larger' &&
                filteredLarger.map((it) => (
                  <CatechismRow key={it.number} item={it} onRefClick={setVerseRef} />
                ))}
              {tab === 'confession' &&
                filteredConfession.map((ch) => (
                  <ChapterRow key={ch.chapter} item={ch} onRefClick={setVerseRef} />
                ))}
            </div>
          )}
        </main>
      </div>

      <BibleVerseModal
        open={verseRef !== null}
        onOpenChange={(o) => !o && setVerseRef(null)}
        refString={verseRef}
      />
    </div>
  );
}
