// daylong 모임 회비 관리 — Firestore 문서 타입과 방어적 파서.
// - config/daylong (단일 문서): { pinHash, title?, openingBalance? }
// - daylongMembers/{id}: { name, order, active }
// - daylongTransactions/{id}: { date, type, amount, memo, memberId?, dueMonth?, createdAt }
//   · 회비 납입 = type 'in' + memberId + dueMonth 가 모두 있는 거래. 별도 납입 체크 데이터는 없다.
// 파서는 필드 누락·타입 불일치 시 기본값으로 채운다(콘솔 수동 입력 대비). amount 는 Number() 후 isFinite 검사.

export interface DaylongConfig {
  /** 4자리 PIN 의 SHA-256 16진 해시. 평문 PIN 은 저장하지 않는다. */
  pinHash: string;
  title?: string;
  openingBalance?: number;
}

export interface DaylongMember {
  id: string;
  name: string;
  order: number;
  active: boolean;
}

export type DaylongTxType = 'in' | 'out';

export interface DaylongTransaction {
  id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  type: DaylongTxType;
  amount: number;
  memo: string;
  memberId?: string;
  /** 'YYYY-MM' — 회비 납입 대상 월 */
  dueMonth?: string;
  /** ISO 문자열 */
  createdAt: string;
}

type Raw = Record<string, unknown> | undefined;

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** config/daylong 원본 → DaylongConfig. 문서가 없으면 null. */
export function parseConfig(raw: Raw): DaylongConfig | null {
  if (!raw) return null;
  const pinHash = str(raw.pinHash).trim();
  const title = str(raw.title).trim();
  const openingBalance = raw.openingBalance === undefined ? undefined : num(raw.openingBalance, 0);
  return {
    pinHash,
    ...(title ? { title } : {}),
    ...(openingBalance !== undefined ? { openingBalance } : {}),
  };
}

/** daylongMembers 문서 → DaylongMember. active 는 명시적으로 false 일 때만 비활성. */
export function parseMember(id: string, raw: Raw): DaylongMember {
  return {
    id,
    name: str(raw?.name).trim(),
    order: num(raw?.order, 0),
    active: raw?.active !== false,
  };
}

/** daylongTransactions 문서 → DaylongTransaction. type 이 'out' 이 아니면 'in' 으로 본다. */
export function parseTransaction(id: string, raw: Raw): DaylongTransaction {
  const memberId = str(raw?.memberId).trim();
  const dueMonth = str(raw?.dueMonth).trim();
  return {
    id,
    date: str(raw?.date).trim(),
    type: raw?.type === 'out' ? 'out' : 'in',
    amount: num(raw?.amount, 0),
    memo: str(raw?.memo).trim(),
    ...(memberId ? { memberId } : {}),
    ...(dueMonth ? { dueMonth } : {}),
    createdAt: str(raw?.createdAt).trim(),
  };
}

/** 회비 납입 거래인지(입금 + 회원 + 대상 월). */
export function isDuesPayment(t: DaylongTransaction): boolean {
  return t.type === 'in' && !!t.memberId && !!t.dueMonth;
}
