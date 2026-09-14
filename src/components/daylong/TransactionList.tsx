// daylong 입출금 내역 목록 — 날짜 내림차순. 관리자에게만 행 오른쪽에 편집·삭제 아이콘.
// 비관리자 렌더 결과는 STEP 1 과 동일하다(관리자 요소는 모두 isAdmin 조건 안).
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { isDuesPayment, type DaylongTransaction } from '@/types/daylong';
import { formatDate, formatWon } from './format';

interface TransactionListProps {
  transactions: DaylongTransaction[];
  memberName: Map<string, string>;
  isAdmin?: boolean;
  onEdit?: (t: DaylongTransaction) => void;
  onDelete?: (t: DaylongTransaction) => void;
  /** 삭제 진행 중인 거래 id(해당 행 스피너, 나머지 버튼 비활성) */
  deletingId?: string | null;
}

export function TransactionList({
  transactions,
  memberName,
  isAdmin = false,
  onEdit,
  onDelete,
  deletingId = null,
}: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-purple-500/30 bg-slate-800/60 px-4 py-10 text-center text-sm text-purple-200/70">
        아직 입출금 내역이 없습니다.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-purple-500/30 bg-slate-800/60">
      {transactions.map((t) => {
        const dues = isDuesPayment(t);
        const primary = dues
          ? `회비 · ${memberName.get(t.memberId!) ?? '(알 수 없음)'} · ${t.dueMonth}`
          : t.memo || (t.type === 'in' ? '입금' : '출금');
        const secondary = dues && t.memo ? t.memo : '';
        const isIn = t.type === 'in';
        const deleting = deletingId === t.id;
        return (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <span className="w-[4.5rem] shrink-0 text-xs tabular-nums text-purple-200/70">{formatDate(t.date)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-gray-100">{primary}</span>
              {secondary && <span className="block truncate text-xs text-purple-200/60">{secondary}</span>}
            </span>
            <span
              className={`shrink-0 text-sm font-semibold tabular-nums ${isIn ? 'text-emerald-300' : 'text-rose-300'}`}
            >
              {isIn ? '+' : '−'}
              {formatWon(t.amount)}
            </span>
            {isAdmin && (
              <span className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  aria-label="수정"
                  title="수정"
                  disabled={deletingId !== null}
                  onClick={() => onEdit?.(t)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-purple-200/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="삭제"
                  title="삭제"
                  disabled={deletingId !== null}
                  onClick={() => onDelete?.(t)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-40"
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
