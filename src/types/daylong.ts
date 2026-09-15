// daylong 모임 회비 관리 — Firestore 문서 타입과 방어적 파서.
// - config/daylong (단일 문서): { pinHash, title?, openingBalance?, openingBalanceDate?, categories? }
//   · openingBalanceDate('YYYY-MM-DD') = "이 날 시작 시점의 잔액이 openingBalance". 잔액 계산은 date >= 기준일 인 거래만 누적(당일 포함).
//   · categories = { in: string[], out: string[] } 수입·지출 분류 목록. 비어 있으면 DEFAULT_CATEGORIES 사용.
// - daylongMembers/{id}: { name, order, active, monthlyDue? }  · monthlyDue = 회원별 월 회비(기본 DEFAULT_MONTHLY_DUE)
// - daylongTransactions/{id}: { date, type, amount, memo, category?, memberId?, dueMonth?, createdAt }
//   · 회비 납입 = type 'in' + memberId + dueMonth 가 모두 있는 거래. category 는 '정기회비' 고정.
//   · 회비 납입은 amount 0 허용 = '면제'. 기타 수입·지출은 0 초과.
// 파서는 필드 누락·타입 불일치 시 기본값으로 채운다(콘솔 수동 입력 대비). amount 는 Number() 후 isFinite 검사.

export interface DaylongCategories {
  in: string[];
  out: string[];
}

export interface DaylongConfig {
  /** 4자리 PIN 의 SHA-256 16진 해시. 평문 PIN 은 저장하지 않는다. */
  pinHash: string;
  title?: string;
  openingBalance?: number;
  /** 'YYYY-MM-DD' — 이 날 마감 기준 잔액이 openingBalance. 없으면 전체 거래 누적. */
  openingBalanceDate?: string;
  categories?: DaylongCategories;
}

export interface DaylongMember {
  id: string;
  name: string;
  order: number;
  active: boolean;
  /** 회원별 월 회비. 없으면 DEFAULT_MONTHLY_DUE. */
  monthlyDue?: number;
}

export type DaylongTxType = 'in' | 'out';

export interface DaylongTransaction {
  id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  type: DaylongTxType;
  amount: number;
  memo: string;
  /** 수입·지출 분류. 회비 납입은 DUES_CATEGORY. */
  category?: string;
  memberId?: string;
  /** 'YYYY-MM' — 회비 납입 대상 월 */
  dueMonth?: string;
  /** ISO 문자열 */
  createdAt: string;
}

export const DUES_CATEGORY = '정기회비';
export const DEFAULT_MONTHLY_DUE = 30000;
export const DEFAULT_CATEGORIES: DaylongCategories = {
  in: ['예금이자', '이월회비', '입회비', '찬조금', '기타'],
  out: ['정기모임', '경조사비', '공동물품구매', '기부금', '기타'],
};

type Raw = Record<string, unknown> | undefined;

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** config/daylong 원본 → DaylongConfig. 문서가 없으면 null. */
export function parseConfig(raw: Raw): DaylongConfig | null {
  if (!raw) return null;
  const pinHash = str(raw.pinHash).trim();
  const title = str(raw.title).trim();
  const openingBalance = raw.openingBalance === undefined ? undefined : num(raw.openingBalance, 0);
  const openingBalanceDate = str(raw.openingBalanceDate).trim();
  const rawCats =
    raw.categories && typeof raw.categories === 'object' ? (raw.categories as Record<string, unknown>) : null;
  const categories = rawCats ? { in: strList(rawCats.in), out: strList(rawCats.out) } : undefined;
  return {
    pinHash,
    ...(title ? { title } : {}),
    ...(openingBalance !== undefined ? { openingBalance } : {}),
    ...(DATE_RE.test(openingBalanceDate) ? { openingBalanceDate } : {}),
    ...(categories ? { categories } : {}),
  };
}

/** 수입·지출 분류 목록. config 에 없거나 비어 있는 쪽은 기본값. */
export function resolveCategories(config: DaylongConfig | null | undefined): DaylongCategories {
  return {
    in: config?.categories?.in?.length ? config.categories.in : DEFAULT_CATEGORIES.in,
    out: config?.categories?.out?.length ? config.categories.out : DEFAULT_CATEGORIES.out,
  };
}

/** daylongMembers 문서 → DaylongMember. active 는 명시적으로 false 일 때만 비활성. */
export function parseMember(id: string, raw: Raw): DaylongMember {
  const monthlyDue = raw?.monthlyDue === undefined ? undefined : num(raw.monthlyDue, DEFAULT_MONTHLY_DUE);
  return {
    id,
    name: str(raw?.name).trim(),
    order: num(raw?.order, 0),
    active: raw?.active !== false,
    ...(monthlyDue !== undefined ? { monthlyDue } : {}),
  };
}

/** 회원의 월 회비(미설정이면 기본값). */
export function memberMonthlyDue(m: Pick<DaylongMember, 'monthlyDue'> | null | undefined): number {
  return m?.monthlyDue ?? DEFAULT_MONTHLY_DUE;
}

/** daylongTransactions 문서 → DaylongTransaction. type 이 'out' 이 아니면 'in' 으로 본다. */
export function parseTransaction(id: string, raw: Raw): DaylongTransaction {
  const memberId = str(raw?.memberId).trim();
  const dueMonth = str(raw?.dueMonth).trim();
  const category = str(raw?.category).trim();
  return {
    id,
    date: str(raw?.date).trim(),
    type: raw?.type === 'out' ? 'out' : 'in',
    amount: num(raw?.amount, 0),
    memo: str(raw?.memo).trim(),
    ...(category ? { category } : {}),
    ...(memberId ? { memberId } : {}),
    ...(dueMonth ? { dueMonth } : {}),
    createdAt: str(raw?.createdAt).trim(),
  };
}

/** 회비 납입 거래인지(입금 + 회원 + 대상 월). 금액 0(면제)도 포함. */
export function isDuesPayment(t: DaylongTransaction): boolean {
  return t.type === 'in' && !!t.memberId && !!t.dueMonth;
}

/** 회비 면제 거래(회비 납입 + 금액 0). */
export function isDuesExempt(t: DaylongTransaction): boolean {
  return isDuesPayment(t) && t.amount === 0;
}
