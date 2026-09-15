// daylong 계산 헬퍼 — 잔액·행별 누적 잔액·월 납입 셀 집계. 화면(DaylongPage / TransactionList / DuesGrid)이 공유한다.
// - 잔액 규칙: openingBalance(선택, 기본 0) + 모든 거래 합. 기준일 개념 없음 — 모든 거래가 항상 누적 대상.
//   '잔액 조정' 거래(isBalanceAdjustment)도 잔액에는 포함된다(수입/지출 합계에서만 제외 — TransactionList).
// - 누적 잔액: 거래를 date asc, createdAt asc 로 정렬해 순서대로 누적 → id → 잔액 맵. 필터와 무관하게 전체 기준. 모든 행에 존재.
// - 면제(회비 amount 0)는 누적에 0 을 더하므로 잔액 변동이 없다.
// - 선납 분할(splitPrepayment): 총액을 N 등분, 나머지는 첫 달에 합산. 회원×월 셀 집계는 선납 여부를 구분하지 않는다.
import type { DaylongConfig, DaylongTransaction } from '@/types/daylong';
import { isDuesPayment } from '@/types/daylong';

export function signedAmount(t: DaylongTransaction): number {
  return t.type === 'in' ? t.amount : -t.amount;
}

export interface BalanceSummary {
  balance: number;
  /** 잔액에 포함된 거래 수(= 전체 거래 수) */
  countedCount: number;
}

export function computeBalance(
  transactions: DaylongTransaction[],
  config: DaylongConfig | null | undefined,
): BalanceSummary {
  let balance = config?.openingBalance ?? 0;
  for (const t of transactions) balance += signedAmount(t);
  return { balance, countedCount: transactions.length };
}

/** 잔액 카드 보조 문구: '거래 N건' 또는 시작 잔액이 0 이 아니면 '시작 잔액 X원 + 거래 N건'. */
export function describeBalanceNote(config: DaylongConfig | null | undefined, count: number, won: (n: number) => string): string {
  const opening = config?.openingBalance ?? 0;
  return opening !== 0 ? `시작 잔액 ${won(opening)} + 거래 ${count}건` : `거래 ${count}건`;
}

/** 거래 직후 누적 잔액(id → 잔액). 모든 거래가 맵에 있다. */
export function computeRunningBalances(
  transactions: DaylongTransaction[],
  config: DaylongConfig | null | undefined,
): Map<string, number> {
  const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
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
