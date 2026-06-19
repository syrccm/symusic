import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, Home, X, Loader2 } from 'lucide-react';
import { getBooks, getChapterCount, getChapter, type BibleBookMeta } from '@/utils/bibleData';
import { loadKrv } from '@/utils/bibleParser';

// ── 공통 디자인 토큰 (순수 다크모드) ─────────────────────────────
const FONT =
  "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
const BG = '#000000';
const FG = '#ffffff';
const CELL_BG = '#141414';
const CELL_BORDER = 'rgba(255,255,255,.08)';
const OT_COLOR = '#2dd4bf'; // 구약
const NT_COLOR = '#e8c24a'; // 신약
const REF_BLUE = '#5fa8ff'; // 검색결과 참조
const HL_BG = '#ffe600'; // 검색어 하이라이트 배경
const GRID = 'grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5';

type Mode = 'books' | 'chapters' | 'reader' | 'search';
type Scope = 'all' | 'ot' | 'nt' | string; // string = 책 약어
const SEARCH_LIMIT = 500;

interface SearchHit {
  abbr: string;
  chapter: number;
  verse: number;
  text: string;
}

// 검색어를 노란 배경으로 하이라이트 (입력어만)
function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = text.indexOf(q, i);
    if (idx === -1) {
      out.push(text.slice(i));
      break;
    }
    if (idx > i) out.push(text.slice(i, idx));
    out.push(
      <mark
        key={key++}
        style={{ backgroundColor: HL_BG, color: '#000000' }}
        className="rounded-[2px] px-0.5"
      >
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    i = idx + q.length;
  }
  return out;
}

// 상단 헤더 공통 아이콘 버튼
function IconBtn({
  onClick,
  label,
  children,
  disabled,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

interface BibleReaderProps {
  /** 책 선택 화면에서 X로 닫으면 호출 (메뉴/이전 화면 복귀) */
  onClose: () => void;
}

export default function BibleReader({ onClose }: BibleReaderProps) {
  const books = useMemo<BibleBookMeta[]>(() => getBooks(), []);
  const byAbbr = useMemo(() => {
    const m = new Map<string, BibleBookMeta>();
    books.forEach((b) => m.set(b.abbr, b));
    return m;
  }, [books]);
  const indexOfAbbr = useCallback(
    (abbr: string) => books.findIndex((b) => b.abbr === abbr),
    [books]
  );

  const [mode, setMode] = useState<Mode>('books');
  const [book, setBook] = useState<string | null>(null);
  const [chapter, setChapter] = useState<number>(1);

  // 검색에서 reader로 이동 시 스크롤할 절 (없으면 최상단)
  const [pendingVerse, setPendingVerse] = useState<number | null>(null);

  // ── 본문(reader) 상태 ────────────────────────────────────────
  const [verses, setVerses] = useState<{ verse: number; text: string }[]>([]);
  const [readerLoading, setReaderLoading] = useState(false);
  const readerScrollRef = useRef<HTMLDivElement>(null);

  const openChapters = (abbr: string) => {
    setBook(abbr);
    setMode('chapters');
  };
  const openReader = (abbr: string, ch: number, verse: number | null = null) => {
    setBook(abbr);
    setChapter(ch);
    setPendingVerse(verse);
    setMode('reader');
  };

  // reader: 장이 바뀌면 본문 로드 + 스크롤 처리
  useEffect(() => {
    if (mode !== 'reader' || !book) return;
    let cancelled = false;
    setReaderLoading(true);
    setVerses([]);
    getChapter(book, chapter)
      .then((vs) => {
        if (cancelled) return;
        setVerses(vs);
      })
      .catch((err) => {
        console.error('[BibleReader] 본문 로드 실패:', err);
        if (!cancelled) setVerses([]);
      })
      .finally(() => {
        if (!cancelled) setReaderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, book, chapter]);

  // 본문 로드 후 스크롤: pendingVerse 있으면 해당 절, 없으면 최상단
  useEffect(() => {
    if (mode !== 'reader' || readerLoading) return;
    const container = readerScrollRef.current;
    if (!container) return;
    if (pendingVerse != null) {
      const el = container.querySelector<HTMLElement>(`[data-verse="${pendingVerse}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        setPendingVerse(null);
        return;
      }
      setPendingVerse(null);
    }
    container.scrollTop = 0;
  }, [mode, readerLoading, verses, pendingVerse]);

  // ── 장 경계 이동 (이전/다음 장, 책 경계는 books 순서 사용) ──────
  const prevChapter = () => {
    if (!book) return;
    if (chapter > 1) {
      openReader(book, chapter - 1);
      return;
    }
    const idx = indexOfAbbr(book);
    if (idx > 0) {
      const prev = books[idx - 1];
      openReader(prev.abbr, prev.chapterCount);
    }
  };
  const nextChapter = () => {
    if (!book) return;
    const count = getChapterCount(book);
    if (chapter < count) {
      openReader(book, chapter + 1);
      return;
    }
    const idx = indexOfAbbr(book);
    if (idx >= 0 && idx < books.length - 1) {
      const next = books[idx + 1];
      openReader(next.abbr, 1);
    }
  };
  const hasPrev = !!book && !(indexOfAbbr(book) === 0 && chapter === 1);
  const hasNext =
    !!book && !(indexOfAbbr(book) === books.length - 1 && chapter === getChapterCount(book));

  // ── 검색 상태 ────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [searched, setSearched] = useState(false); // 한 번이라도 검색했는지

  const scopeLabel =
    scope === 'all'
      ? '전체'
      : scope === 'ot'
      ? '구약'
      : scope === 'nt'
      ? '신약'
      : byAbbr.get(scope)?.name ?? scope;

  // 범위에 포함되는 책 약어 집합
  const scopeAbbrs = useCallback((): string[] => {
    if (scope === 'all') return books.map((b) => b.abbr);
    if (scope === 'ot') return books.filter((b) => b.testament === 'ot').map((b) => b.abbr);
    if (scope === 'nt') return books.filter((b) => b.testament === 'nt').map((b) => b.abbr);
    return [scope];
  }, [scope, books]);

  // 디바운스 검색 (200ms). loadKrv 캐시 재사용.
  useEffect(() => {
    if (mode !== 'search') return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      setTruncated(false);
      setSearched(false);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await loadKrv();
        if (cancelled) return;
        const abbrs = scopeAbbrs();
        const found: SearchHit[] = [];
        let cut = false;
        outer: for (const abbr of abbrs) {
          const bookData = data[abbr];
          if (!bookData) continue;
          for (const ch of Object.keys(bookData)) {
            const chData = bookData[ch];
            for (const v of Object.keys(chData)) {
              const text = chData[v];
              if (text.includes(q)) {
                if (found.length >= SEARCH_LIMIT) {
                  cut = true;
                  break outer;
                }
                found.push({ abbr, chapter: Number(ch), verse: Number(v), text });
              }
            }
          }
        }
        if (cancelled) return;
        setHits(found);
        setTruncated(cut);
        setSearched(true);
      } catch (err) {
        console.error('[BibleReader] 검색 실패:', err);
        if (!cancelled) {
          setHits([]);
          setTruncated(false);
          setSearched(true);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, query, scopeAbbrs]);

  const goSearch = () => {
    setScopeOpen(false);
    setMode('search');
  };

  // ── 렌더 ─────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col"
      style={{ background: BG, color: FG, fontFamily: FONT }}
    >
      {/* ===== 1) 책 선택 ===== */}
      {mode === 'books' && (
        <>
          <header className="flex items-center gap-2 px-3 pt-3 pb-2">
            <IconBtn onClick={onClose} label="닫기">
              <X className="h-6 w-6" />
            </IconBtn>
            <h1 className="flex-1 text-center text-lg font-bold">성경책 선택</h1>
            <IconBtn onClick={goSearch} label="성경검색">
              <Search className="h-5 w-5" />
            </IconBtn>
          </header>
          <div className="flex-1 overflow-y-auto px-3 pb-8">
            <div className="mx-auto w-full max-w-[680px]">
              {/* 범례 */}
              <div className="mb-3 flex items-center justify-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: OT_COLOR }} />
                  <span style={{ color: OT_COLOR }}>구약</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: NT_COLOR }} />
                  <span style={{ color: NT_COLOR }}>신약</span>
                </span>
              </div>
              <div className={GRID}>
                {books.map((b, i) => {
                  const firstNt = b.testament === 'nt' && books[i - 1]?.testament === 'ot';
                  return (
                    <Fragment key={b.abbr}>
                      {firstNt && (
                        <div className="col-span-full mb-1 mt-2 flex items-center gap-2 text-xs text-white/40">
                          <span className="h-px flex-1 bg-white/15" />
                          <span>신약</span>
                          <span className="h-px flex-1 bg-white/15" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => openChapters(b.abbr)}
                        title={b.name}
                        className="flex aspect-square w-full items-center justify-center rounded-lg border text-sm font-semibold transition-colors hover:brightness-125"
                        style={{
                          background: CELL_BG,
                          borderColor: CELL_BORDER,
                          color: b.testament === 'ot' ? OT_COLOR : NT_COLOR,
                        }}
                      >
                        {b.abbr}
                      </button>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== 2) 장 선택 ===== */}
      {mode === 'chapters' && book && (
        <>
          <header className="flex items-center gap-2 px-3 pt-3 pb-2">
            <IconBtn onClick={() => setMode('books')} label="책 목록으로">
              <ChevronLeft className="h-6 w-6" />
            </IconBtn>
            <h1 className="flex-1 text-center text-lg font-bold">{byAbbr.get(book)?.name}</h1>
            <IconBtn onClick={goSearch} label="성경검색">
              <Search className="h-5 w-5" />
            </IconBtn>
          </header>
          <div className="flex-1 overflow-y-auto px-3 pb-8">
            <div className="mx-auto w-full max-w-[680px]">
              <div className={GRID}>
                {Array.from({ length: getChapterCount(book) }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => openReader(book, n)}
                    className="flex aspect-square w-full items-center justify-center rounded-lg border text-sm font-semibold text-white transition-colors hover:brightness-125"
                    style={{ background: CELL_BG, borderColor: CELL_BORDER }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== 3) 본문 ===== */}
      {mode === 'reader' && book && (
        <>
          <header className="flex items-center gap-1 px-2 pt-3 pb-2">
            <IconBtn onClick={() => setMode('books')} label="책 목록으로">
              <Home className="h-5 w-5" />
            </IconBtn>
            <IconBtn onClick={prevChapter} label="이전 장" disabled={!hasPrev}>
              <ChevronLeft className="h-6 w-6" />
            </IconBtn>
            <button
              type="button"
              onClick={() => setMode('chapters')}
              className="flex-1 truncate text-center text-base font-bold text-white"
            >
              {byAbbr.get(book)?.name} {chapter} 장 <span className="text-white/40">»</span>
            </button>
            <IconBtn onClick={nextChapter} label="다음 장" disabled={!hasNext}>
              <ChevronRight className="h-6 w-6" />
            </IconBtn>
            <IconBtn onClick={goSearch} label="성경검색">
              <Search className="h-5 w-5" />
            </IconBtn>
          </header>
          <div ref={readerScrollRef} className="flex-1 overflow-y-auto px-4 pb-16">
            <div className="mx-auto w-full max-w-[680px] pt-2">
              {readerLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-white/60">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">본문을 불러오는 중...</span>
                </div>
              ) : verses.length === 0 ? (
                <p className="py-16 text-center text-sm text-white/50">본문을 찾을 수 없습니다.</p>
              ) : (
                verses.map((v) => (
                  <div
                    key={v.verse}
                    data-verse={v.verse}
                    className="flex items-start break-keep"
                    style={{ marginBottom: 30, fontSize: 23, lineHeight: 1.8, color: FG }}
                  >
                    {/* 절 번호: 고정폭 칸 + 위첨자 느낌(상단 정렬·작게·옅은 회색) → 행잉 인덴트 */}
                    <span
                      className="shrink-0 select-none text-white/40"
                      style={{ width: 28, fontSize: 13, lineHeight: 1, paddingTop: 5 }}
                    >
                      {v.verse}
                    </span>
                    <span className="flex-1">{v.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ===== 4) 검색 ===== */}
      {mode === 'search' && (
        <>
          <header className="px-3 pt-3 pb-2">
            <div className="mx-auto w-full max-w-[680px]">
              <h1 className="mb-2 text-center text-lg font-bold">성경검색</h1>
              {/* 입력창 */}
              <div
                className="flex items-center gap-2 rounded-xl border px-3 py-2"
                style={{ background: CELL_BG, borderColor: CELL_BORDER }}
              >
                <Search className="h-5 w-5 shrink-0 text-white/50" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="단어로 검색하세요."
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-white/40 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="지우기"
                    className="shrink-0 text-white/50 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
              {/* 버튼: 검색범위 / 닫기 */}
              <div className="relative mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScopeOpen((o) => !o)}
                  className="rounded-lg border px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                  style={{ background: CELL_BG, borderColor: CELL_BORDER }}
                >
                  검색범위: {scopeLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setMode(book ? 'reader' : 'books')}
                  className="rounded-lg border px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                  style={{ background: CELL_BG, borderColor: CELL_BORDER }}
                >
                  닫기
                </button>

                {/* 범위 선택 패널 */}
                {scopeOpen && (
                  <div
                    className="absolute left-0 top-full z-10 mt-1 max-h-[60vh] w-full overflow-y-auto rounded-xl border p-3 shadow-2xl"
                    style={{ background: '#0a0a0a', borderColor: CELL_BORDER }}
                  >
                    <div className="mb-2 flex gap-1.5">
                      {(
                        [
                          ['all', '전체'],
                          ['ot', '구약'],
                          ['nt', '신약'],
                        ] as [Scope, string][]
                      ).map(([key, lbl]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setScope(key);
                            setScopeOpen(false);
                          }}
                          className={`flex-1 rounded-lg border py-1.5 text-sm font-semibold transition-colors ${
                            scope === key ? 'text-black' : 'text-white hover:bg-white/10'
                          }`}
                          style={{
                            background: scope === key ? '#ffffff' : CELL_BG,
                            borderColor: CELL_BORDER,
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <p className="mb-1 text-xs text-white/40">책별</p>
                    <div className={GRID}>
                      {books.map((b) => (
                        <button
                          key={b.abbr}
                          type="button"
                          onClick={() => {
                            setScope(b.abbr);
                            setScopeOpen(false);
                          }}
                          title={b.name}
                          className="flex aspect-square w-full items-center justify-center rounded-lg border text-xs font-semibold transition-colors hover:brightness-125"
                          style={{
                            background: scope === b.abbr ? '#ffffff' : CELL_BG,
                            borderColor: CELL_BORDER,
                            color:
                              scope === b.abbr
                                ? '#000000'
                                : b.testament === 'ot'
                                ? OT_COLOR
                                : NT_COLOR,
                          }}
                        >
                          {b.abbr}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* 결과 */}
          <div className="flex-1 overflow-y-auto px-3 pb-16">
            <div className="mx-auto w-full max-w-[680px]">
              {searching && (
                <div className="flex items-center justify-center gap-2 py-10 text-white/60">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">검색 중...</span>
                </div>
              )}
              {!searching && searched && (
                <>
                  <p className="py-3 text-sm text-white/70">총 검색결과 : {hits.length} 개</p>
                  {truncated && (
                    <p className="mb-2 text-xs text-amber-400/80">
                      검색결과는 {SEARCH_LIMIT}개까지만 표시됩니다
                    </p>
                  )}
                  <div className="space-y-3">
                    {hits.map((h, i) => (
                      <button
                        key={`${h.abbr}-${h.chapter}-${h.verse}-${i}`}
                        type="button"
                        onClick={() => openReader(h.abbr, h.chapter, h.verse)}
                        className="block w-full rounded-lg border px-3 py-2 text-left transition-colors hover:bg-white/5"
                        style={{ background: CELL_BG, borderColor: CELL_BORDER }}
                      >
                        <span className="text-sm font-semibold" style={{ color: REF_BLUE }}>
                          {byAbbr.get(h.abbr)?.name} {h.chapter}:{h.verse}
                        </span>
                        <p
                          className="mt-1 break-keep text-white"
                          style={{ fontSize: 20, lineHeight: 1.7 }}
                        >
                          {highlight(h.text, query.trim())}
                        </p>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
