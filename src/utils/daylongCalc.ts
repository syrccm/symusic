// daylong 계산 헬퍼 — 잔액·행별 누적 잔액·선택일 기준 잔액·월 납입 셀 집계. 화면(DaylongPage / TransactionList / DuesGrid / SettingsDialog)이 공유한다.
// - 잔액 규칙: 모든 거래의 부호 합. 시작 잔액(openingBalance) 개념 없음 — 통장과 어긋나면 '잔액 조정' 거래로 맞춘다.
//   '잔액 조정' 거래(isBalanceAdjustment)는 잔액에만 반영된다. 입출금 내역에는 행으로 나오지 않고(회원·관리자 모두),
//   수입/지출 합계와 '거래 N건' 에서도 제외. 관리자는 설정 모달 '잔액 조정 내역' 에서만 보고 삭제한다.
// - 정렬(compareTransactions, 오래된 → 최신): date asc → 같은 날짜에서는 '잔액 조정' 거래가 맨 뒤 → createdAt asc.
//   createdAt 이 없는 거래(콘솔 입력)는 `${date}T00:00:00` 으로 취급해 그 날짜의 맨 앞에 둔다.
//   조정 거래를 맨 뒤에 두는 이유: 같은 날짜의 다른 거래가 나중에 입력돼 createdAt 이 더 늦어도 조정 행의 누적 잔액이
//   '선택일까지 계산 잔액 + 차액 = 통장 실제 잔액' 으로 유지되게 하기 위해서다.
// - 누적 잔액: 위 정렬 순서로 누적 → id → 잔액 맵. 필터와 무관하게 전체 기준. 조정 거래는 행이 없으므로 맵에 넣지 않고
//   직전(오래된 쪽) 일반 거래의 잔액에 흡수한다 — 그 행의 잔액이 '그날 마감(통장) 잔액' 이 되어 표기가 끊기지 않는다.
//   조정 거래보다 앞선 일반 거래가 없으면 다음 일반 거래부터 자연히 반영된다.
// - 선택일 기준 잔액(computeBalanceAsOf): date <= 선택일 인 거래의 합(같은 날짜 전부 포함). 잔액 맞추기의 비교 기준.
// - 면제(회비 amount 0)는 누적에 0 을 더하므로 잔액 변동이 없다.
// - 선납 분할(splitPrepayment): 총액을 N 등분, 나머지는 첫 달에 합산. 회원×월 셀 집계는 선납 여부를 구분하지 않는다.
import type { DaylongTransaction } from '@/types/daylong';
import { isBalanceAdjustment, isDuesPayment } from '@/types/daylong';

export function signedAmount(t: DaylongTransaction): number {
  return t.type === 'in' ? t.amount : -t.amount;
}

/** 정렬용 생성 시각. 없으면 그 날짜 0시로 본다. */
export function sortCreatedAt(t: DaylongTransaction): string {
  return t.createdAt || `${t.date}T00:00:00`;
}

/** 오래된 → 최신. date asc → 조정 거래 맨 뒤 → createdAt asc. 내림차순 목록은 이 결과를 뒤집어 쓴다. */
export function compareTransactions(a: DaylongTransaction, b: DaylongTransaction): number {
  return (
    a.date.localeCompare(b.date) ||
    Number(isBalanceAdjustment(a)) - Number(isBalanceAdjustment(b)) ||
    sortCreatedAt(a).localeCompare(sortCreatedAt(b))
  );
}

export interface BalanceSummary {
  balance: number;
  /** 화면에 보이는 거래 수(조정 거래 제외) */
  countedCount: number;
}

/** 잔액 = 모든 거래 합(조정 포함). countedCount 는 조정 거래를 뺀 수. */
export function computeBalance(transactions: DaylongTransaction[]): BalanceSummary {
  let balance = 0;
  let countedCount = 0;
  for (const t of transactions) {
    balance += signedAmount(t);
    if (!isBalanceAdjustment(t)) countedCount += 1;
  }
  return { balance, countedCount };
}

/** 선택일까지의 누적 잔액(date <= asOf, 같은 날짜 전부 포함). */
export function computeBalanceAsOf(transactions: DaylongTransaction[], asOf: string): number {
  let balance = 0;
  for (const t of transactions) if (t.date <= asOf) balance += signedAmount(t);
  return balance;
}

/** 잔액 카드 보조 문구: '거래 N건'. */
export function describeBalanceNote(count: number): string {
  return `거래 ${count}건`;
}

/** 거래 직후 누적 잔액(id → 잔액). 일반 거래만 맵에 있고, 조정 거래 금액은 직전 일반 거래의 잔액에 흡수된다. */
export function computeRunningBalances(transactions: DaylongTransaction[]): Map<string, number> {
  const ordered = [...transactions].sort(compareTransactions);
  const map = new Map<string, number>();
  let acc = 0;
  let lastVisibleId: string | null = null;
  for (const t of ordered) {
    acc += signedAmount(t);
    if (isBalanceAdjustment(t)) {
      if (lastVisibleId !== null) map.set(lastVisibleId, acc);
      continue;
    }
    map.set(t.id, acc);
    lastVisibleId = t.id;
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
