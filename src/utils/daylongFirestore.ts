// daylong Firestore 쓰기 헬퍼 — 컬렉션 참조·타임스탬프·필드 정리를 한 곳에 모은다.
// - 호출 측(컴포넌트)이 PlaylistManagerDialog 패턴대로 !isAdmin → 입력 검증 → !db → 재진입 방지 → try/catch 를 담당하고,
//   여기서는 실제 addDoc / updateDoc / deleteDoc 만 수행한다.
// - 타임스탬프는 ISO 문자열(createdAt / updatedAt). serverTimestamp 는 쓰지 않는다.
// - 거래 구분(kind): 'dues' 회비 납입(in + memberId + dueMonth) / 'in' 기타 입금 / 'out' 출금.
//   편집에서 회비 → 기타로 바꾸면 memberId·dueMonth 를 deleteField() 로 제거한다.
import { addDoc, collection, deleteDoc, deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { DaylongConfig, DaylongTransaction } from '@/types/daylong';
import { isDuesPayment } from '@/types/daylong';

export const TX_COLLECTION = 'daylongTransactions';
export const MEMBER_COLLECTION = 'daylongMembers';

export type TxKind = 'dues' | 'in' | 'out';

export interface TransactionInput {
  kind: TxKind;
  date: string; // 'YYYY-MM-DD'
  amount: number; // 0 초과 정수
  memo: string;
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

export async function addTransaction(input: TransactionInput): Promise<string> {
  const data: Record<string, unknown> = {
    date: input.date,
    type: input.kind === 'out' ? 'out' : 'in',
    amount: input.amount,
    memo: input.memo,
    createdAt: nowISO(),
  };
  if (input.kind === 'dues') {
    data.memberId = input.memberId;
    data.dueMonth = input.dueMonth;
  }
  const ref = await addDoc(collection(db, TX_COLLECTION), data);
  return ref.id;
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
  } else {
    data.memberId = deleteField();
    data.dueMonth = deleteField();
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
  patch: Partial<{ name: string; order: number; active: boolean }>,
): Promise<void> {
  await updateDoc(doc(db, MEMBER_COLLECTION, id), { ...patch, updatedAt: nowISO() });
}

export async function deleteMember(id: string): Promise<void> {
  await deleteDoc(doc(db, MEMBER_COLLECTION, id));
}

// ── 설정 ─────────────────────────────────────────────────────

export async function updateConfig(patch: Partial<DaylongConfig>): Promise<void> {
  await updateDoc(doc(db, 'config', 'daylong'), { ...patch, updatedAt: nowISO() });
}
