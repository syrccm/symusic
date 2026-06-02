import { isKnownBook } from '@/data/bibleBookMap';

// krv.json 구조: { [책약어]: { [장]: { [절]: 본문 } } }
export type KrvData = Record<string, Record<string, Record<string, string>>>;

export interface VerseSegment {
  book: string; // 약어 (예: "롬")
  chapter: number;
  verseStart: number;
  verseEnd: number; // 단일 절이면 verseStart 와 동일
  label: string; // 표시용 (예: "롬 3:23", "슥 8:16-17")
}

const RANGE = '[-–—~∼]'; // 하이픈/대시/물결(데이터에 ∼ 사용) 모두 범위로 인식

function makeSegment(book: string, chapter: number, vs: number, ve: number): VerseSegment {
  const verseEnd = Math.max(vs, ve);
  const verseStart = Math.min(vs, ve);
  const label =
    verseEnd > verseStart
      ? `${book} ${chapter}:${verseStart}-${verseEnd}`
      : `${book} ${chapter}:${verseStart}`;
  return { book, chapter, verseStart, verseEnd, label };
}

/**
 * 한국어 성경 참조 문자열을 절 단위 배열로 파싱한다.
 * 책/장 컨텍스트를 이어가며 콤마(,)·세미콜론(;)으로 구분된 토큰을 해석한다.
 *
 *  parseRef("슥 8:16")        → [{ book:"슥", chapter:8, verseStart:16, verseEnd:16 }]
 *  parseRef("슥 8:16-17")     → [{ ..., verseStart:16, verseEnd:17 }]
 *  parseRef("롬 3:23, 6:23")  → 두 개 (롬 3:23 / 롬 6:23)
 *  parseRef("마 4:4, 7, 10")  → 세 개 (장 유지, 절만 변경)
 *  parseRef("창3:6-8; 고후11:3") → 두 책에 걸친 두 개
 *
 * 파싱 불가 토큰은 조용히 건너뛴다(graceful).
 */
export function parseRef(ref: string): VerseSegment[] {
  if (!ref || typeof ref !== 'string') return [];
  const segments: VerseSegment[] = [];
  let curBook: string | null = null;
  let curChapter: number | null = null;

  const tokens = ref
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const tok of tokens) {
    let rest = tok;
    let book: string | null = curBook;

    // 선두 한글(책 약어) 추출 — 알려진 약어일 때만 책을 갱신
    const bm = tok.match(/^([가-힣]+)\s*(.*)$/);
    if (bm) {
      if (isKnownBook(bm[1])) {
        book = bm[1];
        rest = bm[2].trim();
      } else {
        // 알 수 없는 한글 → 파싱 불가 토큰으로 두고 건너뜀
        continue;
      }
    }

    // "장:절" 또는 "장:절-절"
    let m = rest.match(new RegExp(`^(\\d+):(\\d+)(?:\\s*${RANGE}\\s*(\\d+))?$`));
    if (m && book) {
      const chapter = Number(m[1]);
      const vs = Number(m[2]);
      const ve = m[3] ? Number(m[3]) : vs;
      curBook = book;
      curChapter = chapter;
      segments.push(makeSegment(book, chapter, vs, ve));
      continue;
    }

    // "절" 또는 "절-절" (직전 책/장 컨텍스트 사용)
    m = rest.match(new RegExp(`^(\\d+)(?:\\s*${RANGE}\\s*(\\d+))?$`));
    if (m && curBook && curChapter != null) {
      const vs = Number(m[1]);
      const ve = m[2] ? Number(m[2]) : vs;
      segments.push(makeSegment(curBook, curChapter, vs, ve));
      continue;
    }
    // 그 외: 조용히 건너뜀
  }

  return segments;
}

/** 로드된 krv 데이터에서 단일 절 본문을 반환. 없으면 null. */
export function getVerseText(
  data: KrvData,
  book: string,
  chapter: number,
  verse: number
): string | null {
  return data?.[book]?.[String(chapter)]?.[String(verse)] ?? null;
}

/** 한 세그먼트(범위 포함)를 절 목록으로 펼친다. */
export function getSegmentVerses(
  data: KrvData,
  seg: VerseSegment
): { verse: number; text: string | null }[] {
  const out: { verse: number; text: string | null }[] = [];
  for (let v = seg.verseStart; v <= seg.verseEnd; v++) {
    out.push({ verse: v, text: getVerseText(data, seg.book, seg.chapter, v) });
  }
  return out;
}

// 개역한글 데이터는 용량이 크므로(약 4.5MB) 동적 import로 지연 로딩하고 캐싱한다.
let cache: KrvData | null = null;
let pending: Promise<KrvData> | null = null;

export async function loadKrv(): Promise<KrvData> {
  if (cache) return cache;
  if (pending) return pending;
  // ?url 로 받은 정적 에셋 경로를 fetch (브라우저가 캐싱, JS 번들에 포함되지 않음)
  pending = import('@/data/bible/krv.json?url')
    .then((m) => fetch(m.default))
    .then((r) => {
      if (!r.ok) throw new Error(`krv.json load failed: ${r.status}`);
      return r.json();
    })
    .then((json: KrvData) => {
      cache = json;
      pending = null;
      return json;
    })
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}
