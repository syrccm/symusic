// daylong 계산 헬퍼 — 잔액·행별 누적 잔액·월 납입 셀 집계. 화면(DaylongPage / TransactionList / DuesGrid)이 공유한다.
// - 잔액 규칙: config.openingBalanceDate 가 있으면 date >= 기준일 인 거래만 openingBalance 에 누적(기준일 당일 포함, 이전은 제외).
//   openingBalance = 기준일 시작 시점 잔액.
//   없으면 전체 거래 누적. 'YYYY-MM-DD' 문자열 비교로 충분하다.
// - 누적 잔액: 거래를 date asc, createdAt asc 로 정렬해 순서대로 누적 → id → 잔액 맵. 필터와 무관하게 전체 기준.
// - 면제(회비 amount 0)는 누적에 0 을 더하므로 잔액 변동이 없다.
// - 선납 분할(splitPrepayment): 총액을 N 등분, 나머지는 첫 달에 합산. 회원×월 셀 집계는 선납 여부를 구분하지 않는다.
import type { DaylongConfig, DaylongTransaction } from '@/types/daylong';
import { isDuesPayment } from '@/types/daylong';

export function signedAmount(t: DaylongTransaction): number {
  return t.type === 'in' ? t.amount : -t.amount;
}

/** 잔액에 포함되는 거래인지(기준일 당일 포함 이후). */
export function countsTowardBalance(t: DaylongTransaction, openingBalanceDate?: string): boolean {
  return !openingBalanceDate || t.date >= openingBalanceDate;
}

export interface BalanceSummary {
  balance: number;
  /** 잔액에 포함된 거래 수 */
  countedCount: number;
}

export function computeBalance(
  transactions: DaylongTransaction[],
  config: DaylongConfig | null | undefined,
): BalanceSummary {
  const cutoff = config?.openingBalanceDate;
  let balance = config?.openingBalance ?? 0;
  let countedCount = 0;
  for (const t of transactions) {
    if (!countsTowardBalance(t, cutoff)) continue;
    balance += signedAmount(t);
    countedCount += 1;
  }
  return { balance, countedCount };
}

/** 거래 직후 누적 잔액(id → 잔액). 기준일 이전(date < 기준일) 거래는 맵에 없다. */
export function computeRunningBalances(
  transactions: DaylongTransaction[],
  config: DaylongConfig | null | undefined,
): Map<string, number> {
  const cutoff = config?.openingBalanceDate;
  const ordered = transactions
    .filter((t) => countsTowardBalance(t, cutoff))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const map = new Map<string, number>();
  let acc = config?.openingBalance ?? 0;
  for (const t of ordered) {
    acc += signedAmount(t);
    map.set(t.id, acc);
  }
  return map;
}

// ── 선납 분할 ────────────────────────────────────────────────

/** 총액을 months 등분(정수). 나머지는 첫 달에 합산. months < 1 이면 [total]. */
export function splitPrepayment(total: number, months: number): number[] {
  const n = Math.max(1, Math.floor(months));
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + rest : base));
}

// ── 월 납입 현황 셀 ──────────────────────────────────────────

export interface DuesCell {
  /** 납입 합계(amount>0 만) */
  amount: number;
  /** 해당 회원·월 회비 거래 수(면제 포함) */
  count: number;
  /** 가장 최근 납부일 'YYYY-MM-DD' (납입 있을 때) */
  latestDate: string;
  /** 납입 없이 면제 거래만 있는 경우 */
  exempt: boolean;
}

export function duesCellKey(memberId: string, month: string): string {
  return `${memberId}|${month}`;
}

/** 회비 납입 거래를 회원×월로 집계. 금액>0 이 하나라도 있으면 납입(합계 + 최근 날짜), 0 만 있으면 면제. */
export function buildDuesCells(transactions: DaylongTransaction[]): Map<string, DuesCell> {
  const map = new Map<string, DuesCell>();
  for (const t of transactions) {
    if (!isDuesPayment(t)) continue;
    const key = duesCellKey(t.memberId!, t.dueMonth!);
    const cell = map.get(key) ?? { amount: 0, count: 0, latestDate: '', exempt: false };
    cell.count += 1;
    if (t.amount > 0) {
      cell.amount += t.amount;
      if (t.date > cell.latestDate) cell.latestDate = t.date;
    }
    map.set(key, cell);
  }
  for (const cell of map.values()) cell.exempt = cell.amount === 0 && cell.count > 0;
  return map;
}
