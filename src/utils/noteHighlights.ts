// 사랑방 '말씀' 탭 형광펜 — 표시(읽기) 전용 로직. (STEP 1)
// ──────────────────────────────────────────────────────────────────────────
// 저장 좌표는 "공백을 제외한 글자 오프셋" 기준이다. 본문 보정(fix-note-spacing)이
// 공백만 바꿀 수 있고 글자(음절)는 절대 바꾸지 않으므로, 이 좌표계는 재보정에도
// 불변에 가깝다. 표시 단계에서 원문(공백 포함) 인덱스로 환산해 칠한다.
//
// ★3중 안전망(틀린 위치에 칠하느니 안 칠한다):
//   ① 좌표 start~end 구간의 글자열이 quote와 일치하면 그대로 채택.
//   ② 어긋나면 quote 로 재탐색 → 정확히 1곳일 때만 채택.
//   ③ 0곳이거나 2곳 이상(모호)이면 null → 칠하지 않음.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type HighlightColor = 'yellow' | 'green' | 'pink';
const COLORS: HighlightColor[] = ['yellow', 'green', 'pink'];

export interface HighlightMark {
  id?: string; // 로컬 식별용(편집 시 키·삭제). Firestore 저장 시엔 제외.
  para: number; // body 문단 인덱스
  start?: number; // 공백 제외 글자 오프셋(포함). 없으면 quote 재탐색에 의존.
  end?: number; // 공백 제외 글자 오프셋(제외)
  quote: string; // 강조 텍스트(검증·폴백용). 공백이 있어도 됨(비교 시 제거).
  color: HighlightColor;
}

/** 로컬 마크 식별자. randomUUID 미지원 환경 폴백 포함. */
export function genMarkId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* 폴백 */
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const stripWS = (s: string) => s.replace(/\s+/g, '');

// 문단 원문에서 "k번째 비공백 글자 → 원문 문자열 인덱스" 매핑
function nwIndexMap(p: string): number[] {
  const idx: number[] = [];
  for (let i = 0; i < p.length; i++) {
    if (!/\s/.test(p[i])) idx.push(i);
  }
  return idx;
}

/**
 * 한 강조를 문단 원문(공백 포함) 기준 [start, end) 범위로 환산. 실패 시 null(안 칠함).
 */
export function resolveRange(p: string, mark: HighlightMark): { start: number; end: number } | null {
  const nw = nwIndexMap(p);
  const stripped = nw.map((i) => p[i]).join(''); // === stripWS(p)
  const q = stripWS(mark.quote || '');
  if (!q) return null;

  // ① 좌표 유효 + 구간 글자열이 quote와 일치 → 그대로 채택
  const { start, end } = mark;
  if (
    typeof start === 'number' &&
    typeof end === 'number' &&
    start >= 0 &&
    end <= nw.length &&
    start < end &&
    stripped.slice(start, end) === q
  ) {
    return { start: nw[start], end: nw[end - 1] + 1 };
  }

  // ② 어긋나면 quote 재탐색 — 정확히 1곳일 때만(모호하면 포기)
  const first = stripped.indexOf(q);
  if (first < 0) return null;
  if (stripped.indexOf(q, first + 1) >= 0) return null; // 2곳 이상 → 모호 → 안 칠함
  return { start: nw[first], end: nw[first + q.length - 1] + 1 };
}

export interface Segment {
  text: string;
  color?: HighlightColor;
}

/**
 * 문단 원문을 강조 세그먼트로 분해. 겹치는 강조는 정렬 후 건너뛴다.
 * 강조가 없거나 모두 실패하면 [{text: p}] 하나를 반환.
 */
export function buildSegments(p: string, marks: HighlightMark[]): Segment[] {
  const ranges = marks
    .map((m) => {
      const r = resolveRange(p, m);
      return r ? { start: r.start, end: r.end, color: m.color } : null;
    })
    .filter((r): r is { start: number; end: number; color: HighlightColor } => r !== null)
    .sort((a, b) => a.start - b.start);

  const segs: Segment[] = [];
  let cur = 0;
  for (const r of ranges) {
    if (r.start < cur) continue; // 앞 강조와 겹침 → 건너뜀
    if (r.start > cur) segs.push({ text: p.slice(cur, r.start) });
    segs.push({ text: p.slice(r.start, r.end), color: r.color });
    cur = r.end;
  }
  if (cur < p.length) segs.push({ text: p.slice(cur) });
  return segs.length ? segs : [{ text: p }];
}

/** noteHighlights/{date} 문서의 marks 배열을 방어적으로 파싱해 읽는다. */
export async function fetchHighlights(date: string): Promise<HighlightMark[]> {
  try {
    const snap = await getDoc(doc(db, 'noteHighlights', date));
    if (!snap.exists()) return [];
    const raw = snap.data();
    const arr = Array.isArray(raw?.marks) ? raw.marks : [];
    return arr
      .map((m: unknown): HighlightMark | null => {
        if (typeof m !== 'object' || m === null) return null;
        const o = m as Record<string, unknown>;
        if (typeof o.para !== 'number' || typeof o.quote !== 'string') return null;
        const color = COLORS.includes(o.color as HighlightColor)
          ? (o.color as HighlightColor)
          : 'yellow';
        const out: HighlightMark = { id: genMarkId(), para: o.para, quote: o.quote, color };
        if (typeof o.start === 'number') out.start = o.start;
        if (typeof o.end === 'number') out.end = o.end;
        return out;
      })
      .filter((m: HighlightMark | null): m is HighlightMark => m !== null);
  } catch {
    return []; // 읽기 실패 시 형광 없이 표시(본문은 정상)
  }
}

/** marks 전체를 noteHighlights/{date} 에 저장(문서 덮어쓰기). id 는 저장하지 않는다. */
export async function saveHighlights(date: string, marks: HighlightMark[]): Promise<void> {
  const clean = marks.map((m) => {
    const o: Record<string, unknown> = { para: m.para, quote: m.quote, color: m.color };
    if (typeof m.start === 'number') o.start = m.start;
    if (typeof m.end === 'number') o.end = m.end;
    return o;
  });
  await setDoc(doc(db, 'noteHighlights', date), { marks: clean, updatedAt: Date.now() });
}
