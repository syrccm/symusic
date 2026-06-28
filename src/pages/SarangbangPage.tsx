import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

// public/data/notes-text/[YYYYMMDD].json 스키마 (build-note-json.mjs 생성)
interface NoteData {
  date: string; // "2026-06-14"
  title: string;
  scripture: string; // "마태복음 5:43-48"
  preacher: string;
  scriptureText: string; // 위첨자 절번호 포함
  body: string[]; // 설교 본문 문단
  questions: string[]; // 나눔질문
  prayers: string[]; // 기도제목
}
interface IndexEntry {
  date: string;
  title: string;
  scripture: string;
}
interface IndexData {
  updatedAt: string;
  count: number;
  notes: IndexEntry[];
}

type Tab = 'word' | 'share' | 'pray';

const TABS: [Tab, string][] = [
  ['word', '말씀'],
  ['share', '나눔'],
  ['pray', '기도'],
];

// "2026-06-14" → "2026.06.14"
const fmtDate = (d: string) => d.replace(/-/g, '.');
// "2026-06-14" → "20260614" (파일명)
const fileKey = (d: string) => d.replace(/-/g, '');

// ── 글자 크기(읽는 텍스트만) ──────────────────────────────────────────────
const FONT_STEPS = [14, 16, 18, 20, 22];
const FONT_KEY = 'sarangbang.fontSize';
const DEFAULT_FONT = 16;
function loadFont(): number {
  try {
    const v = Number(localStorage.getItem(FONT_KEY));
    if (FONT_STEPS.includes(v)) return v;
  } catch {
    /* localStorage 불가 환경 */
  }
  return DEFAULT_FONT;
}

// ── 문단 나누기(표시 단계에서만; JSON 원본 불변) ───────────────────────────
interface SarangbangPageProps {
  /** 오버레이로 띄울 때 닫기 콜백. 없으면 라우트 모드(뒤로가기). */
  onClose?: () => void;
}

export default function SarangbangPage({ onClose }: SarangbangPageProps = {}) {
  const navigate = useNavigate();
  const [indexError, setIndexError] = useState(false);
  const [date, setDate] = useState<string>(''); // 최신 노트 날짜
  const [note, setNote] = useState<NoteData | null>(null);
  const [noteError, setNoteError] = useState(false);
  const [tab, setTab] = useState<Tab>('word');
  const [fontSize, setFontSize] = useState<number>(loadFont);

  // ── 탭별 스크롤 위치 기억(세션 메모리) ───────────────────────────────────
  // 같은 노트 안에서 탭만 오갈 때 각 탭의 마지막 위치 복원. 날짜 바뀌면 0으로.
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPos = useRef<Record<Tab, number>>({ word: 0, share: 0, pray: 0 });

  // 탭 전환: 떠나는 탭의 현재 위치 저장 후 전환
  const selectTab = (next: Tab) => {
    if (next === tab) return;
    if (scrollRef.current) scrollPos.current[tab] = scrollRef.current.scrollTop;
    setTab(next);
  };

  // 탭이 바뀌면 저장된 위치로 복원(레이아웃 단계 — 깜빡임 없음)
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollPos.current[tab] ?? 0;
  }, [tab]);

  // 날짜(노트)가 바뀌면 위치 초기화 + 맨 위로
  useEffect(() => {
    scrollPos.current = { word: 0, share: 0, pray: 0 };
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [date]);

  // 고른 글자 크기 기억
  useEffect(() => {
    try {
      localStorage.setItem(FONT_KEY, String(fontSize));
    } catch {
      /* 무시 */
    }
  }, [fontSize]);
  const stepFont = (dir: 1 | -1) => {
    setFontSize((cur) => {
      const idx = FONT_STEPS.indexOf(cur);
      const next = Math.min(FONT_STEPS.length - 1, Math.max(0, (idx < 0 ? 1 : idx) + dir));
      return FONT_STEPS[next];
    });
  };

  // 목록 로드 → 가장 최신 나눔지 1개만 자동 선택(과거 선택 UI 없음)
  useEffect(() => {
    let alive = true;
    fetch('/data/notes-text/index.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: IndexData) => {
        if (!alive) return;
        // index.json은 날짜 내림차순 → 첫 항목이 가장 최신 나눔지
        if (d.notes?.length) setDate(d.notes[0].date);
      })
      .catch(() => alive && setIndexError(true));
    return () => {
      alive = false;
    };
  }, []);

  // 선택 날짜 변경 시 해당 노트 로드
  useEffect(() => {
    if (!date) return;
    let alive = true;
    setNote(null);
    setNoteError(false);
    fetch(`/data/notes-text/${fileKey(date)}.json`, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: NoteData) => alive && setNote(d))
      .catch(() => alive && setNoteError(true));
    return () => {
      alive = false;
    };
  }, [date]);

  const reading = "'Noto Sans KR', sans-serif";

  return (
    <div
      className="relative h-screen w-full max-w-full overflow-hidden text-white"
      style={{ background: '#0d0f14', fontFamily: reading }}
    >
      {/* 닫기(X) — 본문과 함께 스크롤되는 탭바와 달리 항상 우상단에 고정 */}
      <button
        type="button"
        onClick={() => (onClose ? onClose() : navigate('/'))}
        aria-label="닫기"
        title="닫기"
        className="fixed right-3 top-3 z-30 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-teal-400/30 bg-slate-800/90 text-white shadow-lg transition-colors hover:bg-slate-700"
      >
        <X className="h-5 w-5" />
      </button>

      {/* 전용 스크롤 컨테이너 — 본문만 스크롤되고, 헤더는 컨테이너 직계 자식으로 상단 고정 */}
      <div ref={scrollRef} className="h-full w-full overflow-y-auto overflow-x-hidden">
        {/* 헤더: 3탭 토글 — 스크롤 컨테이너 직계 sticky(가운데 정렬은 내부 max-w-3xl로) */}
        <header
          className="sticky top-0 z-20 backdrop-blur-sm"
          style={{ background: '#0d0f14' }}
        >
          <div className="mx-auto w-full max-w-3xl px-3 pt-3 pb-2.5 sm:px-4">
            {/* 우측 pr-14: 고정된 X 버튼 자리 확보. 탭 토글 + 글자 크기(A−/A+)를 한 줄에. */}
            <div className="flex items-center gap-2 pr-14">
              <div
                className="flex min-w-0 flex-1 rounded-full border border-white/12 p-1"
                style={{ background: 'rgba(255,255,255,.05)' }}
              >
                {TABS.map(([key, label]) => {
                  const active = tab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => selectTab(key)}
                      className="min-w-0 flex-1 rounded-full py-2 text-center transition-colors"
                      style={{
                        background: active ? 'linear-gradient(135deg,#2dd4bf,#0e8a7c)' : 'transparent',
                        color: active ? '#04221e' : 'rgba(255,255,255,.7)',
                        fontWeight: active ? 700 : 500,
                        fontSize: 16,
                        boxShadow: active ? '0 4px 14px rgba(45,212,191,.35)' : 'none',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {/* 글자 크기 조절 — 읽는 텍스트만 적용 */}
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => stepFont(-1)}
                  disabled={fontSize <= FONT_STEPS[0]}
                  aria-label="글자 작게"
                  title="글자 작게"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition-colors hover:bg-white/10 disabled:opacity-35"
                >
                  <span className="text-xs font-bold">A−</span>
                </button>
                <button
                  type="button"
                  onClick={() => stepFont(1)}
                  disabled={fontSize >= FONT_STEPS[FONT_STEPS.length - 1]}
                  aria-label="글자 크게"
                  title="글자 크게"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition-colors hover:bg-white/10 disabled:opacity-35"
                >
                  <span className="text-base font-bold">A+</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* 본문 영역 — 헤더와 동일한 가운데 정렬(max-w-3xl) */}
        <div className="mx-auto w-full max-w-3xl">
        <main className="flex-1 px-4 py-4 sm:px-6">
          {indexError ? (
            <div className="mt-16 text-center text-white/60">
              <p>목록을 불러오지 못했습니다.</p>
              <p className="mt-1 text-sm text-white/40">잠시 후 다시 시도해 주세요.</p>
            </div>
          ) : noteError ? (
            <div className="mt-16 text-center text-white/60">말씀나눔지를 불러오지 못했습니다.</div>
          ) : !note ? (
            <div className="mt-16 text-center text-white/50">불러오는 중…</div>
          ) : tab === 'word' ? (
            <WordTab note={note} fontSize={fontSize} />
          ) : tab === 'share' ? (
            <ListTab items={note.questions} empty="나눔질문이 없습니다." accent="#2dd4bf" fontSize={fontSize} />
          ) : (
            <ListTab items={note.prayers} empty="기도제목이 없습니다." accent="#e8c24a" fontSize={fontSize} />
          )}
          </main>
        </div>
      </div>
    </div>
  );
}

// 성경본문의 위첨자 절번호(⁴³ 등)를 흐린 teal + 약간의 여백으로 본문과 분리해 렌더.
const SUP_RE = /([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/;
function renderScripture(text: string) {
  return text.split(SUP_RE).map((part, i) =>
    SUP_RE.test(part) ? (
      <span key={i} style={{ color: 'rgba(45,212,191,.7)', fontWeight: 600, marginRight: '0.18em' }}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// 말씀 탭: 제목·설교자·성경표기 + 성경본문 + 설교 본문 문단(설교자 문단마다 순서 번호)
function WordTab({ note, fontSize }: { note: NoteData; fontSize: number }) {
  return (
    <article className="pb-10">
      {/* 날짜(어느 주인지) → 제목·설교자·성경표기. 본문과 함께 스크롤 */}
      <p className="text-xs font-medium text-teal-300">{fmtDate(note.date)}</p>
      <h1 className="mt-1 text-2xl font-bold leading-tight text-white break-keep sm:text-[26px]">
        {note.title}
      </h1>
      <p className="mt-1.5 text-sm text-white/55">
        <span className="font-medium text-teal-300">{note.scripture}</span>
        {note.preacher ? <span className="mx-1.5 text-white/25">·</span> : null}
        {note.preacher}
      </p>

      {/* 성경본문 — 왼쪽 정렬, 절번호 위첨자는 색·여백으로 분리 */}
      {note.scriptureText && (
        <blockquote
          className="mt-4 rounded-r-lg border-l-[3px] border-teal-400/60 bg-white/[.04] px-4 py-3 text-left leading-[1.8] text-white/80 break-keep"
          style={{ fontSize: fontSize - 1 }}
        >
          {renderScripture(note.scriptureText)}
        </blockquote>
      )}

      {/* 설교 본문 — 설교자 문단(body 항목)마다 순서 번호. 돌아가며 읽기 단위. */}
      <ol className="mt-6 space-y-7">
        {note.body.map((p, i) => (
          <li key={i} className="flex gap-3">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
              style={{ background: 'rgba(45,212,191,.16)', color: '#2dd4bf' }}
            >
              {i + 1}
            </span>
            <p
              className="flex-1 text-left leading-[1.7] text-white/[.92] break-keep"
              style={{ fontSize }}
            >
              {p}
            </p>
          </li>
        ))}
      </ol>
    </article>
  );
}

// 나눔/기도 탭: 번호 매긴 목록 (사용자 글자 크기 적용)
function ListTab({
  items,
  empty,
  accent,
  fontSize,
}: {
  items: string[];
  empty: string;
  accent: string;
  fontSize: number;
}) {
  if (!items?.length) return <div className="mt-16 text-center text-white/50">{empty}</div>;
  return (
    <ol className="space-y-4 pb-10">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
            style={{ background: `${accent}22`, color: accent }}
          >
            {i + 1}
          </span>
          <p className="flex-1 text-left leading-[1.8] text-white/[.92] break-keep" style={{ fontSize }}>
            {t}
          </p>
        </li>
      ))}
    </ol>
  );
}
