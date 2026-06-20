import { Fragment, useMemo, useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { getBooks, getChapterCount, type BibleBookMeta } from '@/utils/bibleData';
import { verseCounts } from '@/data/bibleVerseCounts';

// ── 디자인 토큰 (BibleReader와 동일 — 순수 다크) ─────────────────
const FONT = "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
const BG = '#000000';
const FG = '#ffffff';
const CELL_BG = '#141414';
const CELL_BORDER = 'rgba(255,255,255,.08)';
const OT_COLOR = '#2dd4bf'; // 구약
const NT_COLOR = '#e8c24a'; // 신약
const TEAL = '#2dd4bf'; // 선택 강조
const CHAPTER_COLOR = '#ffffff'; // 장 선택 셀 글자 (흰색 톤)
const VERSE_COLOR = '#e8c24a'; // 절 선택(미선택) 셀 글자 — 장과 구분되는 다른 톤
const VERSE_BORDER = 'rgba(232,194,74,.35)'; // 절 셀 테두리
const GRID = 'grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5';

type Step = 'books' | 'chapters' | 'verses';

interface BiblePassagePickerProps {
  onClose: () => void;
  onSelect: (passage: string) => void;
}

/**
 * 정렬된 절 배열을 "1-3,7" 형태의 구간 문자열로 변환.
 * 연속 구간은 a-b, 단일은 a, 여러 묶음은 콤마로 잇는다.
 */
function formatVerses(verses: number[]): string {
  const sorted = [...verses].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = cur;
    prev = cur;
  }
  return parts.join(',');
}

export default function BiblePassagePicker({ onClose, onSelect }: BiblePassagePickerProps) {
  const books = useMemo<BibleBookMeta[]>(() => getBooks(), []);

  const [step, setStep] = useState<Step>('books');
  const [book, setBook] = useState<BibleBookMeta | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const maxVerse =
    book && chapter ? verseCounts[book.abbr]?.[String(chapter)] ?? 0 : 0;

  // 현재 선택 미리보기 ("고전 3:1-5")
  const preview =
    book && chapter
      ? `${book.abbr} ${chapter}${
          selected.size > 0 ? `:${formatVerses([...selected])}` : ''
        }`
      : '';

  const openChapters = (b: BibleBookMeta) => {
    setBook(b);
    setChapter(null);
    setSelected(new Set());
    setStep('chapters');
  };

  const openVerses = (ch: number) => {
    setChapter(ch);
    setSelected(new Set());
    setStep('verses');
  };

  const toggleVerse = (v: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const back = () => {
    if (step === 'verses') {
      setStep('chapters');
      return;
    }
    if (step === 'chapters') {
      setStep('books');
      return;
    }
    onClose();
  };

  const confirm = () => {
    if (!book || !chapter || selected.size === 0) return;
    onSelect(`${book.abbr} ${chapter}:${formatVerses([...selected])}`);
    onClose();
  };

  const headerTitle =
    step === 'books'
      ? '성경책 선택'
      : step === 'chapters'
      ? `${book?.name} · 장 선택`
      : `${book?.name} ${chapter}장 · 절 선택`;

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col"
      style={{ background: BG, color: FG, fontFamily: FONT }}
    >
      {/* 헤더: 뒤로 · 제목 · 닫기 */}
      <header className="flex items-center gap-2 px-2 pt-3 pb-2">
        <button
          type="button"
          onClick={back}
          aria-label="뒤로"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="flex-1 truncate text-center text-base font-bold">{headerTitle}</h1>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-6 w-6" />
        </button>
      </header>

      {/* 선택 미리보기 (장/절 단계에서 표시) */}
      {step !== 'books' && (
        <div className="px-3 pb-2">
          <div
            className="mx-auto w-full max-w-[680px] rounded-xl px-3.5 py-2.5 text-center text-[15px]"
            style={{ background: CELL_BG, border: `1px solid ${CELL_BORDER}` }}
          >
            {preview ? (
              <span style={{ color: TEAL, fontWeight: 700 }}>{preview}</span>
            ) : (
              <span className="text-white/40">절을 선택하세요</span>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-8" style={{ touchAction: 'pan-y' }}>
        <div className="mx-auto w-full max-w-[680px]">
          {/* 1) 책 선택 */}
          {step === 'books' && (
            <>
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
                        onClick={() => openChapters(b)}
                        title={b.name}
                        className="flex aspect-square w-full items-center justify-center rounded-lg border font-semibold leading-none transition-colors hover:brightness-125"
                        style={{
                          background: CELL_BG,
                          borderColor: CELL_BORDER,
                          color: b.testament === 'ot' ? OT_COLOR : NT_COLOR,
                          fontSize: 'clamp(16px, 5.5vw, 24px)',
                        }}
                      >
                        {b.abbr}
                      </button>
                    </Fragment>
                  );
                })}
              </div>
            </>
          )}

          {/* 2) 장 선택 */}
          {step === 'chapters' && book && (
            <div className={GRID}>
              {Array.from({ length: getChapterCount(book.abbr) }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => openVerses(n)}
                  className="flex aspect-square w-full items-center justify-center rounded-lg border font-semibold leading-none transition-colors hover:brightness-125"
                  style={{
                    background: CELL_BG,
                    borderColor: CELL_BORDER,
                    color: CHAPTER_COLOR,
                    fontSize: 'clamp(13px, 4.4vw, 19px)',
                  }}
                >
                  {n}장
                </button>
              ))}
            </div>
          )}

          {/* 3) 절 다중 선택 */}
          {step === 'verses' && book && chapter && (
            <div className={GRID}>
              {Array.from({ length: maxVerse }, (_, i) => i + 1).map((n) => {
                const on = selected.has(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggleVerse(n)}
                    className="flex aspect-square w-full items-center justify-center rounded-lg border font-semibold leading-none transition-colors hover:brightness-125"
                    style={{
                      background: on ? TEAL : CELL_BG,
                      borderColor: on ? TEAL : VERSE_BORDER,
                      color: on ? '#04221e' : VERSE_COLOR,
                      fontSize: 'clamp(13px, 4.4vw, 19px)',
                    }}
                  >
                    {n}절
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 하단 선택 완료 (절 단계에서만) */}
      {step === 'verses' && (
        <div
          className="px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2"
          style={{ borderTop: `1px solid ${CELL_BORDER}`, background: BG }}
        >
          <button
            type="button"
            onClick={confirm}
            disabled={selected.size === 0}
            className="mx-auto block w-full max-w-[680px] rounded-xl py-3.5 text-base font-bold disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#2dd4bf,#0e8a7c)', color: '#04221e' }}
          >
            선택 완료{selected.size > 0 ? ` (${preview})` : ''}
          </button>
        </div>
      )}
    </div>
  );
}
