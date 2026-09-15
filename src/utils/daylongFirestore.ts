// daylong Firestore 쓰기 헬퍼 — 컬렉션 참조·타임스탬프·필드 정리를 한 곳에 모은다.
// - 호출 측(컴포넌트)이 PlaylistManagerDialog 패턴대로 !isAdmin → 입력 검증 → !db → 재진입 방지 → try/catch 를 담당하고,
//   여기서는 실제 addDoc / updateDoc / deleteDoc 만 수행한다.
// - 타임스탬프는 ISO 문자열(createdAt / updatedAt). serverTimestamp 는 쓰지 않는다.
// - 거래 구분(kind): 'dues' 회비 납입(in + memberId + dueMonth, category '정기회비', amount 0 = 면제)
//   / 'in' 수입 / 'out' 지출 (category = config.categories 목록 중 하나, amount > 0).
//   편집에서 회비 → 수입·지출로 바꾸면 memberId·dueMonth 를 deleteField() 로 제거한다. category 가 비면 필드 제거.
// - 선납(여러 달 한 번에): addTransactions(inputs) 가 writeBatch 로 N건을 한 번에 커밋한다(부분 성공 없음).
//   입력 배열은 호출 측(TransactionDialog → buildPrepaymentInputs)이 만든다.
// - 잔액 맞추기(addBalanceAdjustment): 차액을 category '잔액 조정' 의 in/out 거래 1건으로 addTransaction.
// - 분류 추가: config/daylong.categories.{in|out} 에 arrayUnion. 기본값을 쓰던 상태(필드 없음/빈 배열)라면
//   기본 목록을 함께 넣어 기존 선택지가 사라지지 않게 한다(seed).
import { addDoc, arrayUnion, collection, deleteDoc, deleteField, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { DaylongConfig, DaylongTransaction } from '@/types/daylong';
import { ADJUST_CATEGORY, DUES_CATEGORY, isDuesPayment } from '@/types/daylong';

export const TX_COLLECTION = 'daylongTransactions';
export const MEMBER_COLLECTION = 'daylongMembers';

export type TxKind = 'dues' | 'in' | 'out';

export interface TransactionInput {
  kind: TxKind;
  date: string; // 'YYYY-MM-DD'
  amount: number; // dues 는 0 이상(0 = 면제), in/out 은 0 초과 정수
  memo: string;
  category?: string; // kind in/out 일 때 분류. dues 는 자동으로 DUES_CATEGORY
  memberId?: string; // kind === 'dues' 일 때만
  dueMonth?: string; // kind === 'dues' 일 때만 'YYYY-MM'
}

export function kindOf(t: DaylongTransaction): TxKind {
  if (isDuesPayment(t)) return 'dues';
  return t.type === 'out' ? 'out' : 'in';
}

function nowISO(): string {
  return new Date().toISOString();
}

// ── 거래 ─────────────────────────────────────────────────────

function toCreateData(input: TransactionInput, createdAt: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    date: input.date,
    type: input.kind === 'out' ? 'out' : 'in',
    amount: input.amount,
    memo: input.memo,
    createdAt,
  };
  if (input.kind === 'dues') {
    data.memberId = input.memberId;
    data.dueMonth = input.dueMonth;
    data.category = DUES_CATEGORY;
  } else if (input.category) {
    data.category = input.category;
  }
  return data;
}

export async function addTransaction(input: TransactionInput): Promise<string> {
  const ref = await addDoc(collection(db, TX_COLLECTION), toCreateData(input, nowISO()));
  return ref.id;
}

/**
 * 여러 거래를 writeBatch 로 한 번에 추가(선납). createdAt 은 배열 순서대로 1ms 씩 증가시켜
 * 같은 날짜 안에서 누적 잔액 정렬(date asc, createdAt asc)이 입력 순서를 따르게 한다.
 */
export async function addTransactions(inputs: TransactionInput[]): Promise<string[]> {
  if (inputs.length === 0) return [];
  const batch = writeBatch(db);
  const base = Date.now();
  const ids: string[] = [];
  inputs.forEach((input, i) => {
    const ref = doc(collection(db, TX_COLLECTION));
    batch.set(ref, toCreateData(input, new Date(base + i).toISOString()));
    ids.push(ref.id);
  });
  await batch.commit();
  return ids;
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<void> {
  const data: Record<string, unknown> = {
    date: input.date,
    type: input.kind === 'out' ? 'out' : 'in',
    amount: input.amount,
    memo: input.memo,
    updatedAt: nowISO(),
  };
  if (input.kind === 'dues') {
    data.memberId = input.memberId;
    data.dueMonth = input.dueMonth;
    data.category = DUES_CATEGORY;
  } else {
    data.memberId = deleteField();
    data.dueMonth = deleteField();
    data.category = input.category ? input.category : deleteField();
  }
  await updateDoc(doc(db, TX_COLLECTION, id), data);
}

export async function deleteTransaction(id: string): Promise<void> {
  await deleteDoc(doc(db, TX_COLLECTION, id));
}

// ── 회원 ─────────────────────────────────────────────────────

export async function addMember(name: string, order: number): Promise<string> {
  const ref = await addDoc(collection(db, MEMBER_COLLECTION), {
    name,
    order,
    active: true,
    createdAt: nowISO(),
  });
  return ref.id;
}

export async function updateMember(
  id: string,
  patch: Partial<{ name: string; order: number; active: boolean; monthlyDue: number }>,
): Promise<void> {
  await updateDoc(doc(db, MEMBER_COLLECTION, id), { ...patch, updatedAt: nowISO() });
}

export async function deleteMember(id: string): Promise<void> {
  await deleteDoc(doc(db, MEMBER_COLLECTION, id));
}

// ── 설정 ─────────────────────────────────────────────────────

/** config/daylong 부분 갱신. */
export async function updateConfig(patch: Partial<DaylongConfig>): Promise<void> {
  await updateDoc(doc(db, 'config', 'daylong'), { ...patch, updatedAt: nowISO() });
}

/**
 * 잔액 맞추기: 통장 실제 잔액 − 현재 계산 잔액 = 차액을 '잔액 조정' 거래 1건으로 기록.
 * 차액 0 이면 아무것도 쓰지 않고 0 을 돌려준다. 반환값 = 차액(부호 포함).
 */
export async function addBalanceAdjustment(actual: number, computed: number, date: string): Promise<number> {
  const diff = actual - computed;
  if (diff === 0) return 0;
  await addTransaction({
    kind: diff > 0 ? 'in' : 'out',
    date,
    amount: Math.abs(diff),
    memo: `잔액 맞추기 (통장 ${actual.toLocaleString('ko-KR')}원)`,
    category: ADJUST_CATEGORY,
  });
  return diff;
}

/**
 * 수입·지출 분류 추가. seed = 현재 화면에 보이는 목록(기본값 포함) — 함께 arrayUnion 해 기본 선택지를 보존한다.
 * 중첩 필드 경로('categories.in')로 갱신하므로 categories 맵이 없어도 만들어진다.
 */
export async function addCategory(kind: 'in' | 'out', name: string, seed: string[]): Promise<void> {
  await updateDoc(doc(db, 'config', 'daylong'), {
    [`categories.${kind}`]: arrayUnion(...seed, name),
    updatedAt: nowISO(),
  });
}
