// daylong 입출금 내역 — 모임가계부 '수입/지출' 방식.
// - 상단 기간 필터: 시작일·종료일(type=date) + '전체' 토글. 기본 = 오늘 기준 최근 3개월. 필터는 화면 표시에만 적용.
// - 요약 카드: 가운데 '잔액'(전체 기준, 기준일 규칙 적용) + 아래 작은 글씨(기준일 잔액 + 이후 거래 건수),
//   가로 막대(지출 rose / 수입 emerald 비율) + 좌 '지출 합계' 우 '수입 합계'(필터 기간 기준).
// - 행: 왼쪽 날짜 'YYYY.MM.DD' + 아래 `${memo} (${category})`(회비는 `${회원명} (정기회비)`),
//       오른쪽 금액(출금 −rose / 입금 +emerald, 면제는 teal '면제') + 아래 '잔액 N원' = 그 거래 직후 누적 잔액.
//       기준일 이전(date < 기준일) 거래는 잔액 자리에 '기준일 이전' 흐리게. 당일 거래부터 누적 잔액 표시.
// - 관리자에게만 행 오른쪽에 편집·삭제 아이콘. 비관리자 렌더에 편집 요소 없음.
import { useMemo, useState } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { isDuesExempt, type DaylongConfig, type DaylongTransaction } from '@/types/daylong';
import { computeBalance, computeRunningBalances } from '@/utils/daylongCalc';
import { describeTransaction, formatDateFull, formatWon, shiftDateMonths, todayISO } from './format';

interface TransactionListProps {
  /** 전체 거래(date desc). 잔액·누적 잔액은 이 전체를 기준으로 계산한다. */
  transactions: DaylongTransaction[];
  memberName: Map<string, string>;
  config: DaylongConfig | null;
  isAdmin?: boolean;
  onEdit?: (t: DaylongTransaction) => void;
  onDelete?: (t: DaylongTransaction) => void;
  /** 삭제 진행 중인 거래 id(해당 행 스피너, 나머지 버튼 비활성) */
  deletingId?: string | null;
}

export function TransactionList({
  transactions,
  memberName,
  config,
  isAdmin = false,
  onEdit,
  onDelete,
  deletingId = null,
}: TransactionListProps) {
  const today = todayISO();
  const [from, setFrom] = useState(() => shiftDateMonths(today, -3));
  const [to, setTo] = useState(today);
  const [all, setAll] = useState(false);

  const { balance, countedCount } = useMemo(() => computeBalance(transactions, config), [transactions, config]);
  const running = useMemo(() => computeRunningBalances(transactions, config), [transactions, config]);

  const visible = useMemo(() => {
    if (all) return transactions;
    return transactions.filter((t) => (!from || t.date >= from) && (!to || t.date <= to));
  }, [transactions, all, from, to]);

  const totals = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    for (const t of visible) {
      if (t.type === 'in') inSum += t.amount;
      else outSum += t.amount;
    }
    return { inSum, outSum };
  }, [visible]);

  const gross = totals.inSum + totals.outSum;
  const outPct = gross > 0 ? Math.round((totals.outSum / gross) * 100) : 0;
  const inPct = gross > 0 ? 100 - outPct : 0;

  const openingNote = config?.openingBalanceDate
    ? `기준일 ${formatDateFull(config.openingBalanceDate)} 잔액 ${formatWon(config.openingBalance ?? 0)} + 이후 거래 ${countedCount}건`
    : `기초 잔액 ${formatWon(config?.openingBalance ?? 0)} + 거래 ${countedCount}건`;

  const dateInputClass = 'h-9 bg-slate-700 border-slate-600 text-white text-xs disabled:opacity-40';

  return (
    <div className="space-y-2">
      {/* 기간 필터 */}
      <div className="flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-slate-800/60 p-2">
        <Input
          type="date"
          aria-label="시작일"
          value={from}
          disabled={all}
          onChange={(e) => setFrom(e.target.value)}
          className={dateInputClass}
        />
        <span className="shrink-0 text-xs text-purple-200/60">~</span>
        <Input
          type="date"
          aria-label="종료일"
          value={to}
          disabled={all}
          onChange={(e) => setTo(e.target.value)}
          className={dateInputClass}
        />
        <button
          type="button"
          aria-pressed={all}
          onClick={() => setAll((v) => !v)}
          className={`h-9 shrink-0 rounded-md border px-2.5 text-xs font-semibold transition-colors ${
            all
              ? 'border-teal-400/40 bg-teal-500/20 text-teal-100'
              : 'border-slate-600 bg-slate-700/60 text-gray-300 hover:bg-white/5'
          }`}
        >
          전체
        </button>
      </div>

      {/* 요약 카드 */}
      <section className="rounded-xl border border-purple-500/30 bg-slate-800/60 px-4 py-3">
        <div className="text-center text-xs font-medium tracking-wide text-purple-200/70">잔액</div>
        <div className={`text-center text-2xl font-bold tabular-nums ${balance < 0 ? 'text-rose-300' : 'text-white'}`}>
          {formatWon(balance)}
        </div>
        <div className="text-center text-[11px] text-purple-200/50">{openingNote}</div>
        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-white/10">
          {outPct > 0 && <div className="h-full bg-rose-400" style={{ width: `${outPct}%` }} />}
          {inPct > 0 && <div className="h-full bg-emerald-400" style={{ width: `${inPct}%` }} />}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs tabular-nums">
          <span className="text-rose-300">
            <span className="text-purple-200/60">지출 합계 </span>
            {formatWon(totals.outSum)}
          </span>
          <span className="text-emerald-300">
            <span className="text-purple-200/60">수입 합계 </span>
            {formatWon(totals.inSum)}
          </span>
        </div>
      </section>

      {/* 목록 */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-purple-500/30 bg-slate-800/60 px-4 py-10 text-center text-sm text-purple-200/70">
          {transactions.length === 0 ? '아직 입출금 내역이 없습니다.' : '선택한 기간에 내역이 없습니다.'}
        </div>
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-purple-500/30 bg-slate-800/60">
          {visible.map((t) => {
            const isIn = t.type === 'in';
            const exempt = isDuesExempt(t);
            const deleting = deletingId === t.id;
            const after = running.get(t.id);
            return (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs tabular-nums text-purple-200/70">{formatDateFull(t.date)}</span>
                  <span className="block truncate text-sm text-gray-100">{describeTransaction(t, memberName)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  {exempt ? (
                    <span className="text-sm font-semibold text-teal-300">면제</span>
                  ) : (
                    <span className={`text-sm font-semibold tabular-nums ${isIn ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {isIn ? '+' : '−'}
                      {formatWon(t.amount)}
                    </span>
                  )}
                  {after === undefined ? (
                    <span className="text-[10px] text-white/30">기준일 이전</span>
                  ) : (
                    <span className="text-[10px] tabular-nums text-gray-400">잔액 {formatWon(after)}</span>
                  )}
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
      )}
    </div>
  );
}
