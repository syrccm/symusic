import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Highlighter, Eraser, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildSegments,
  fetchHighlights,
  saveHighlights,
  genMarkId,
  type HighlightColor,
  type HighlightKind,
  type HighlightMark,
} from '@/utils/noteHighlights';

// 편집 중 선택(한 문단 안, 글자 단위). 공백 제외 오프셋으로 환산해 저장.
interface PendingSel {
  para: number;
  start: number; // 공백 제외 글자 오프셋(포함)
  end: number; // 공백 제외 글자 오프셋(제외)
  quote: string; // 선택 글자열(공백 제거)
}

const stripWS = (s: string) => s.replace(/\s+/g, '');
const countNW = (s: string) => stripWS(s).length;

// 문단 <p>(data-para) 기준, DOM 선택 경계까지의 "공백 포함" 글자 오프셋.
function offsetWithinPara(paraEl: Element, node: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(paraEl);
  try {
    r.setEnd(node, offset);
  } catch {
    return 0;
  }
  return r.toString().length;
}

// 선택 노드에서 가장 가까운 [data-para] 문단 엘리먼트
function closestPara(node: Node | null): HTMLElement | null {
  const el = node && node.nodeType === 3 ? node.parentElement : (node as HTMLElement | null);
  return el ? el.closest('[data-para]') : null;
}

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
// "2026-06-21" → "6/21" (드롭다운 라벨용 — 앞의 0 제거한 월/일)
const fmtShort = (d: string) => {
  const [, m, day] = d.split('-');
  return `${Number(m)}/${Number(day)}`;
};

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

// ── 나눔 답변(기기 로컬 저장; 날짜별) ──────────────────────────────────────
const ANSWERS_PREFIX = 'sarangbang.answers.';
function loadAnswers(date: string): string[] {
  try {
    const raw = localStorage.getItem(ANSWERS_PREFIX + date);
    if (raw) {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) return a;
    }
  } catch {
    /* 불가 환경 */
  }
  return [];
}
function saveAnswers(date: string, answers: string[]) {
  try {
    localStorage.setItem(ANSWERS_PREFIX + date, JSON.stringify(answers));
  } catch {
    /* 무시 */
  }
}
// (과거) 오래된 답변 키 청소 함수는 제거함 — 나눔지 영구 보존 정책에 맞춰
// 과거 날짜에 적어둔 답변도 그대로 남긴다(드롭다운으로 과거 주차 열람 가능).

// ── 문단 나누기(표시 단계에서만; JSON 원본 불변) ───────────────────────────
interface SarangbangPageProps {
  /** 오버레이로 띄울 때 닫기 콜백. 없으면 라우트 모드(뒤로가기). */
  onClose?: () => void;
  /** 관리자(/0691 로그인)일 때만 형광펜 작성 UI 노출. */
  isAdmin?: boolean;
}

export default function SarangbangPage({ onClose, isAdmin = false }: SarangbangPageProps = {}) {
  const navigate = useNavigate();
  const [indexError, setIndexError] = useState(false);
  const [notes, setNotes] = useState<IndexEntry[]>([]); // 전체 나눔지 목록(드롭다운용, 내림차순)
  const [date, setDate] = useState<string>(''); // 최신 노트 날짜
  const [note, setNote] = useState<NoteData | null>(null);
  const [noteError, setNoteError] = useState(false);
  const [tab, setTab] = useState<Tab>('word');
  const [fontSize, setFontSize] = useState<number>(loadFont);
  const [highlights, setHighlights] = useState<HighlightMark[]>([]); // 형광펜(표시·편집 공용)

  // ── 나눔 답변(기기 로컬) ──────────────────────────────────────────────────
  const [answers, setAnswers] = useState<string[]>([]); // 질문 index 기준 답변
  const [answersDirty, setAnswersDirty] = useState(false); // 미저장 변경(형광 dirty와 분리)

  // ── 형광펜 작성(관리자) ──────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false); // 형광펜 모드
  const [editKind, setEditKind] = useState<HighlightKind>('highlight'); // 적용 종류: 형광/글자색
  const [pendingSel, setPendingSel] = useState<PendingSel | null>(null); // 편집 중 선택(글자 단위)
  const [dirty, setDirty] = useState(false); // 미저장 변경
  const [saving, setSaving] = useState(false);

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
        if (d.notes?.length) {
          setNotes(d.notes); // 드롭다운 목록(전체 보관)
          setDate(d.notes[0].date); // 기본은 최신 자동 로드(현행 유지)
        }
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

  // 형광펜 강조 로드. 날짜 바뀌면 noteHighlights/{date} 읽어옴. (편집 상태도 초기화)
  useEffect(() => {
    setPendingSel(null);
    setDirty(false);
    if (!date) {
      setHighlights([]);
      return;
    }
    let alive = true;
    fetchHighlights(date)
      .then((h) => alive && setHighlights(h))
      .catch(() => alive && setHighlights([]));
    return () => {
      alive = false;
    };
  }, [date]);

  // 나눔 답변 로드. 날짜·질문 수가 정해지면 저장값을 길이에 맞춰 복원(과거 답도 보존).
  useEffect(() => {
    setAnswersDirty(false);
    if (!date || !note) {
      setAnswers([]);
      return;
    }
    const saved = loadAnswers(date);
    const len = note.questions?.length ?? 0;
    setAnswers(Array.from({ length: len }, (_, i) => saved[i] ?? ''));
  }, [date, note]);

  // 한 질문 답변 갱신
  const onAnswerChange = (i: number, v: string) => {
    setAnswers((cur) => {
      const next = cur.slice();
      next[i] = v;
      return next;
    });
    setAnswersDirty(true);
  };

  // 나눔 답변 저장(기기 로컬, 동기)
  const handleSaveAnswers = () => {
    if (!date) return;
    saveAnswers(date, answers);
    setAnswersDirty(false);
    toast.success('나눔 답을 저장했습니다');
  };

  // ── 형광펜 작성 핸들러 ─────────────────────────────────────────────────
  // 선택 해제(상태 + 브라우저 네이티브 선택 모두)
  const clearSelection = () => {
    setPendingSel(null);
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      /* 무시 */
    }
  };

  // 형광펜 모드 토글. 끌 때 선택은 비우고 종류도 형광으로 되돌린다(미저장 변경은 유지).
  const toggleEdit = () => {
    setEditMode((on) => {
      if (on) {
        clearSelection();
        setEditKind('highlight');
      }
      return !on;
    });
  };

  // 편집 모드에서 OS 텍스트 선택 감지 → 한 문단 안 글자범위를 pendingSel 로 저장.
  // (모바일: 색 버튼 탭 시 선택이 풀려도 적용되도록 미리 캡처해 둔다.)
  useEffect(() => {
    if (!editMode || !note) return;
    const onSelectionChange = () => {
      const sel = window.getSelection();
      // 선택 없음/접힘이면 pendingSel 은 "유지"(클리어 안 함 → 버튼 탭으로 풀려도 적용 가능)
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const startPara = closestPara(range.startContainer);
      if (!startPara) return; // 본문 밖 선택은 무시
      const paraIndex = Number(startPara.getAttribute('data-para'));
      const p = note.body[paraIndex] ?? '';
      const startWS = offsetWithinPara(startPara, range.startContainer, range.startOffset);
      // 한 문단 내로 제한: 끝이 다른 문단이면 시작 문단 끝까지
      const endPara = closestPara(range.endContainer);
      const endWS =
        endPara === startPara ? offsetWithinPara(startPara, range.endContainer, range.endOffset) : p.length;
      const start = countNW(p.slice(0, startWS));
      const end = countNW(p.slice(0, endWS));
      if (end <= start) return; // 공백만 선택 등
      setPendingSel({ para: paraIndex, start, end, quote: stripWS(p.slice(startWS, endWS)) });
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [editMode, note]);

  // 색 적용 → 로컬 marks 추가
  const applyColor = (color: HighlightColor, kind: HighlightKind) => {
    if (!pendingSel) return;
    const { para, start, end, quote } = pendingSel;

    // 부분 덮어쓰기: 같은 para의 겹치는 기존 mark를 잘라낸 뒤 새 mark 삽입.
    // 좌표는 공백제외 오프셋. 잘린 mark의 quote는 원문에서 같은 좌표로 다시 잘라 갱신
    // (quote는 resolveRange 검증에 쓰이므로 좌표와 항상 일치해야 함).
    const p = note?.body[para] ?? '';
    const strippedP = stripWS(p);
    const q = (s: number, e: number) => strippedP.slice(s, e); // 공백제외 좌표 → quote 문자열

    setHighlights((cur) => {
      const rebuilt: HighlightMark[] = [];
      for (const m of cur) {
        if (m.para !== para) {
          rebuilt.push(m);
          continue;
        }
        const ms = m.start ?? -1;
        const me = m.end ?? -1;
        // 좌표 없는(quote-only) 기존 mark는 안전하게 그대로 유지
        if (ms < 0 || me < 0) {
          rebuilt.push(m);
          continue;
        }
        // 안 겹침
        if (me <= start || end <= ms) {
          rebuilt.push(m);
          continue;
        }
        // 새 구간이 기존 mark를 완전히 덮음 → 제거
        if (ms >= start && me <= end) {
          continue;
        }
        // 새 구간이 기존 mark 내부에 쏙 들어감 → 좌우 잔여로 분할(같은 기존 색)
        if (ms < start && end < me) {
          rebuilt.push({ ...m, id: genMarkId(), start: ms, end: start, quote: q(ms, start) });
          rebuilt.push({ ...m, id: genMarkId(), start: end, end: me, quote: q(end, me) });
          continue;
        }
        // 왼쪽만 걸침(ms<start<me<=end) → 왼쪽 잔여만
        if (ms < start) {
          rebuilt.push({ ...m, start: ms, end: start, quote: q(ms, start) });
          continue;
        }
        // 오른쪽만 걸침(start<=ms<end<me) → 오른쪽 잔여만
        rebuilt.push({ ...m, start: end, end: me, quote: q(end, me) });
      }
      rebuilt.push({ id: genMarkId(), para, start, end, quote, color, kind });
      return rebuilt;
    });
    clearSelection();
    setDirty(true);
  };

  // 지우기 → 선택 범위와 겹치는 강조 제거(같은 문단)
  const eraseSelection = () => {
    if (!pendingSel) return;
    const { para, start, end } = pendingSel;
    setHighlights((cur) => {
      const next = cur.filter((m) => {
        if (m.para !== para) return true;
        const ms = m.start ?? -1;
        const me = m.end ?? -1;
        const overlaps = ms < end && start < me; // 범위 교집합
        return !overlaps;
      });
      if (next.length !== cur.length) setDirty(true);
      return next;
    });
    clearSelection();
  };

  // 저장 → Firestore 덮어쓰기
  const handleSave = async () => {
    if (!date || saving) return;
    setSaving(true);
    try {
      await saveHighlights(date, highlights);
      setDirty(false);
      toast.success('형광펜을 저장했습니다.');
    } catch (e) {
      toast.error('저장 실패: ' + (e instanceof Error ? e.message : '알 수 없는 오류'));
    } finally {
      setSaving(false);
    }
  };

  const showEditTools = isAdmin && editMode && tab === 'word';
  const reading = "'Noto Sans KR', sans-serif";

  return (
    <div
      className="relative flex h-screen w-full max-w-full flex-col overflow-hidden text-white"
      style={{ background: '#0d0f14', fontFamily: reading }}
    >
      {/* 닫기(X) — 항상 우상단에 고정 */}
      <button
        type="button"
        onClick={() => (onClose ? onClose() : navigate('/'))}
        aria-label="닫기"
        title="닫기"
        className="fixed right-3 top-3 z-30 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-teal-400/30 bg-slate-800/90 text-white shadow-lg transition-colors hover:bg-slate-700"
      >
        <X className="h-5 w-5" />
      </button>

      {/* 헤더: 3탭 토글 — 스크롤 컨테이너 "밖" 상단에 고정.
          iOS에서 본문을 끝까지 내린 뒤 더 당기는 rubber-band 바운스 때
          컨테이너 내부 sticky 헤더가 잠깐 사라지는 현상을 원천 차단(본문 스크롤과 분리). */}
      <header className="z-20 shrink-0" style={{ background: '#0d0f14' }}>
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

            {/* 날짜(주차) 선택 — 기본 최신, 과거 나눔지도 열람. 전 탭 공통 노출. */}
            {notes.length > 0 && (
              <div className="mt-2 pr-14">
                <select
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="나눔지 날짜 선택"
                  className="w-full rounded-lg border border-white/15 px-3 py-2 text-white transition-colors hover:border-white/25 focus:border-teal-400/50 focus:outline-none"
                  style={{
                    background: 'rgba(255,255,255,.06)',
                    fontSize: 16, // iOS 줌 방지
                    minHeight: 40, // 모바일 탭 타깃
                  }}
                >
                  {notes.map((n) => (
                    <option key={n.date} value={n.date} style={{ background: '#0d0f14', color: '#fff' }}>
                      {fmtShort(n.date)} · {n.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 관리자 전용: 형광펜 모드 토글 (말씀 탭에서만) */}
            {isAdmin && tab === 'word' && (
              <div className="mt-2 flex items-center gap-2 pr-14">
                <button
                  type="button"
                  onClick={toggleEdit}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors"
                  style={{
                    borderColor: editMode ? 'rgba(45,212,191,.6)' : 'rgba(255,255,255,.18)',
                    background: editMode ? 'linear-gradient(135deg,#2dd4bf,#0e8a7c)' : 'rgba(255,255,255,.05)',
                    color: editMode ? '#04221e' : 'rgba(255,255,255,.8)',
                  }}
                >
                  <Highlighter className="h-4 w-4" />
                  {editMode ? '형광펜 끄기' : '형광펜'}
                </button>
                {editMode && (
                  <span className="text-xs text-white/45">
                    {pendingSel ? '색을 고르세요' : '본문을 드래그·길게눌러 선택하세요'}
                    {dirty && <span className="ml-1 text-amber-300">· 저장 안 됨</span>}
                  </span>
                )}
              </div>
            )}
          </div>
        </header>

      {/* 전용 스크롤 컨테이너 — 본문만 스크롤. overscroll-contain으로 바운스/스크롤 체이닝 억제.
          scrollRef는 그대로 이 컨테이너 → 탭별 스크롤 위치 기억·날짜 초기화 로직 변경 없음. */}
      <div
        ref={scrollRef}
        className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
      >
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
            <WordTab note={note} fontSize={fontSize} highlights={highlights} />
          ) : tab === 'share' ? (
            <ListTab
              items={note.questions}
              empty="나눔질문이 없습니다."
              accent="#2dd4bf"
              fontSize={fontSize}
              answers={answers}
              onAnswerChange={onAnswerChange}
            />
          ) : (
            <ListTab items={note.prayers} empty="기도제목이 없습니다." accent="#e8c24a" fontSize={fontSize} />
          )}
          </main>
        </div>
      </div>

      {/* 형광펜 하단 고정 바(관리자·말씀 탭·편집 모드). OS 선택 팝업과 안 겹치게 하단.
          ★fixed: iOS에서 100vh(h-screen)가 보이는 화면보다 커서 absolute bottom-0이
          화면 밖으로 밀리는 문제를 피하려고 뷰포트 기준 고정으로 둔다. */}
      {showEditTools && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10"
          style={{ background: 'rgba(13,15,20,.96)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto w-full max-w-3xl px-3 py-2.5 sm:px-4">
            {/* 1행: 형광 / 글자색 모드 토글 */}
            <div className="mb-2 flex items-center gap-1">
              {(
                [
                  ['highlight', '형광'],
                  ['text', '글자색'],
                ] as [HighlightKind, string][]
              ).map(([k, label]) => {
                const active = editKind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setEditKind(k)}
                    className="rounded-full border px-3 py-1 text-sm font-semibold transition-colors"
                    style={{
                      borderColor: active ? 'rgba(45,212,191,.6)' : 'rgba(255,255,255,.18)',
                      background: active ? 'linear-gradient(135deg,#2dd4bf,#0e8a7c)' : 'rgba(255,255,255,.05)',
                      color: active ? '#04221e' : 'rgba(255,255,255,.8)',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* 2행: 색 원 3개 + 지우개 + 저장 */}
            <div className="flex items-center gap-2">
            {/* 색 팔레트 */}
            {(['yellow', 'green', 'pink'] as HighlightColor[]).map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.preventDefault()} // PC: 버튼 클릭이 본문 선택을 풀지 않게(pendingSel 보존)
                onClick={() => applyColor(c, editKind)}
                disabled={!pendingSel}
                aria-label={`${c} ${editKind === 'text' ? '글자색' : '형광'}`}
                className="h-9 w-9 shrink-0 rounded-full border border-white/40 transition-transform active:scale-90 disabled:opacity-35"
                style={{ background: HL_SWATCH[c] }}
              />
            ))}
            {/* 지우기 */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()} // PC: 클릭 시 본문 선택 풀림 방지(pendingSel 보존)
              onClick={eraseSelection}
              disabled={!pendingSel}
              aria-label="지우기"
              title="선택 범위의 형광 지우기"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white/80 transition-colors hover:bg-white/10 disabled:opacity-35"
            >
              <Eraser className="h-4 w-4" />
            </button>

            <div className="ml-auto flex items-center gap-2">
              {pendingSel && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-lg px-2.5 py-2 text-sm text-white/60 transition-colors hover:text-white/90"
                >
                  선택 해제
                </button>
              )}
              {/* 저장 */}
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold transition-colors disabled:opacity-40"
                style={{ background: dirty ? 'linear-gradient(135deg,#2dd4bf,#0e8a7c)' : 'rgba(255,255,255,.08)', color: dirty ? '#04221e' : 'rgba(255,255,255,.6)' }}
              >
                <Check className="h-4 w-4" />
                {saving ? '저장 중…' : dirty ? '저장' : '저장됨'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* 나눔 탭 전용 — 답변 통합 저장 바(전체 사용자). 형광 바(말씀 탭)와 탭이 달라 동시 노출 없음. */}
      {tab === 'share' && note && (note.questions?.length ?? 0) > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10"
          style={{ background: 'rgba(13,15,20,.96)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-2.5 sm:px-4">
            <span className="text-xs text-white/45">
              내 답은 이 기기에만 저장됩니다
              {answersDirty && <span className="ml-1 text-amber-300">· 저장 안 됨</span>}
            </span>
            <button
              type="button"
              onClick={handleSaveAnswers}
              disabled={!answersDirty}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold transition-colors disabled:opacity-40"
              style={{
                background: answersDirty ? 'linear-gradient(135deg,#2dd4bf,#0e8a7c)' : 'rgba(255,255,255,.08)',
                color: answersDirty ? '#04221e' : 'rgba(255,255,255,.6)',
              }}
            >
              <Check className="h-4 w-4" />
              {answersDirty ? '저장' : '저장됨'}
            </button>
          </div>
        </div>
      )}
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

// 형광펜 색 — 어두운 배경(#0d0f14)에서 흰 글자가 잘 보이는 반투명 톤.
// (값은 dev에서 보며 미세 조정 가능)
const HL_COLORS: Record<HighlightColor, string> = {
  yellow: 'rgba(250, 204, 21, 0.40)',
  green: 'rgba(74, 222, 128, 0.38)',
  pink: 'rgba(244, 130, 190, 0.42)',
};

// 색 바 버튼 표시용 불투명 색(검은 바 위에서 또렷이 보이게). 형광 실제 색(HL_COLORS)과 별개.
const HL_SWATCH: Record<HighlightColor, string> = {
  yellow: '#facc15',
  green: '#4ade80',
  pink: '#f472b6',
};

const hlStyle = (color: HighlightColor): CSSProperties => ({
  background: HL_COLORS[color],
  color: '#ffffff',
  borderRadius: 3,
  // padding 제거(인접 인라인 span 선택 경계가 iOS에서 깨지는 문제 회피).
  // 같은 여백 느낌은 배경색을 바깥으로 2px 번지게 하는 box-shadow로 대체.
  boxShadow: `0 0 0 2px ${HL_COLORS[color]}`,
  // 줄바꿈 시에도 각 줄에 배경이 칠해지도록(끊김 방지)
  boxDecorationBreak: 'clone',
  WebkitBoxDecorationBreak: 'clone',
});

// 글자색 — 배경 없이 글자만(불투명 HL_SWATCH 재사용). padding/배경 없어 iOS 선택 안전.
const textStyle = (color: HighlightColor): CSSProperties => ({
  color: HL_SWATCH[color],
  fontWeight: 600,
});

// 문단 원문 + 그 문단의 강조들 → 형광/글자색 span 섞인 노드 배열.
// 강조가 없으면 원문 문자열 그대로 반환.
function renderHighlighted(p: string, marks: HighlightMark[]) {
  if (!marks.length) return p;
  const segs = buildSegments(p, marks);
  // 비강조 조각은 span 래핑 없이 순수 문자열로 반환(인접 인라인 요소 최소화 → iOS 선택 안정).
  // 강조 조각만 style 있는 span. 문자열·엘리먼트 혼합 배열은 React가 그대로 렌더.
  return segs.map((s, i) => {
    if (!s.color) return s.text;
    if (s.kind === 'text') {
      return (
        <span key={i} style={textStyle(s.color)}>
          {s.text}
        </span>
      );
    }
    return (
      <span key={i} style={hlStyle(s.color)}>
        {s.text}
      </span>
    );
  });
}

// 말씀 탭: 제목·설교자·성경표기 + 성경본문 + 설교 본문 문단(설교자 문단마다 순서 번호)
// 본문은 항상 renderHighlighted(연속 구간)로 렌더 + data-para 부여.
// 편집 모드의 글자 선택은 부모(SarangbangPage)의 selectionchange 리스너가 처리.
function WordTab({
  note,
  fontSize,
  highlights,
}: {
  note: NoteData;
  fontSize: number;
  highlights: HighlightMark[];
}) {
  // 강조를 문단(para)별로 묶어 빠르게 조회
  const byPara = useMemo(() => {
    const m: Record<number, HighlightMark[]> = {};
    for (const h of highlights) (m[h.para] ||= []).push(h);
    return m;
  }, [highlights]);

  return (
    <article className="pb-32">
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
              data-para={i}
              className="flex-1 text-left leading-[1.7] text-white/[.92] break-keep"
              style={{ fontSize }}
            >
              {renderHighlighted(p, byPara[i] ?? [])}
            </p>
          </li>
        ))}
      </ol>
    </article>
  );
}

// 나눔/기도 탭: 번호 매긴 목록 (사용자 글자 크기 적용)
// answers/onAnswerChange가 주어지면(나눔 탭) 각 항목 밑에 답변 textarea를 렌더한다.
function ListTab({
  items,
  empty,
  accent,
  fontSize,
  answers,
  onAnswerChange,
}: {
  items: string[];
  empty: string;
  accent: string;
  fontSize: number;
  answers?: string[];
  onAnswerChange?: (i: number, v: string) => void;
}) {
  if (!items?.length) return <div className="mt-16 text-center text-white/50">{empty}</div>;
  const editable = !!onAnswerChange;
  return (
    <ol
      className={`space-y-4 ${editable ? '' : 'pb-32'}`}
      // 나눔 탭: 저장 바(fixed) + iOS safe-area가 마지막 입력칸을 가리지 않게 넉넉히
      style={editable ? { paddingBottom: 'calc(160px + env(safe-area-inset-bottom))' } : undefined}
    >
      {items.map((t, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
            style={{ background: `${accent}22`, color: accent }}
          >
            {i + 1}
          </span>
          <div className="flex flex-1 flex-col gap-2">
            <p className="text-left leading-[1.8] text-white/[.92] break-keep" style={{ fontSize }}>
              {t}
            </p>
            {editable && (
              <textarea
                value={answers?.[i] ?? ''}
                ref={(el) => {
                  // 마운트·복원 시 내용 높이에 맞춤(여러 줄 답도 처음부터 펼쳐 보이게)
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = `${el.scrollHeight}px`;
                  }
                }}
                onChange={(e) => {
                  onAnswerChange?.(i, e.target.value);
                  // 자동 높이: 내용에 맞춰 늘어나게
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                rows={1}
                placeholder="나눔 전에 내 답을 적어두기 (이 기기에만 저장됩니다)"
                className="w-full resize-none rounded-lg border border-teal-400/20 px-3 py-2 leading-[1.6] placeholder:text-white/30 focus:border-teal-400/50 focus:outline-none"
                style={{
                  fontSize: Math.max(16, fontSize), // iOS 줌 방지: 16px 이상
                  background: 'rgba(45,212,191,0.08)', // 옅은 teal — 질문과 구분
                  borderLeft: '3px solid #2dd4bf', // "내 답" 직관 표시
                  color: '#5eead4', // teal-300: 다크 배경에서 또렷
                }}
              />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
