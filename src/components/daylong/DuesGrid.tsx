// daylong 월 납입 현황 — 모임가계부 '회비현황' 방식.
// - 상단 [◀ YYYY년 M월 ▶] 월 이동(모든 사용자) + '오늘'(이번 달이 아닐 때만). 선택 월이 표의 정중앙.
// - 열 = 선택 월 −2 ~ +2 (5개월). 선택 월 열은 헤더 text-teal-300 + 셀 bg-teal-500/10 강조.
//   5열이 모바일에 가로 스크롤 없이 들어가도록 table-fixed w-full, 이름 열 w-16 truncate, 셀 text-xs.
// - 셀: 납입(amount>0) = 금액(천단위) + 아래 회색 'MM.DD'(같은 월 여러 건이면 합계 + 최근 날짜)
//       면제(회비 거래는 있으나 금액 0 만) = teal '면제'  /  없음 = 빨간 원 ✕(XCircle text-rose-400). 미래 월도 동일.
// - 관리자에게만 셀이 버튼이 된다(없음 → 미리 채운 납부 폼, 있음 → 편집/목록 이동은 부모가 결정). 비관리자 렌더에 버튼 없음.
import { ChevronLeft, ChevronRight, XCircle } from 'lucide-react';
import type { DaylongMember } from '@/types/daylong';
import { duesCellKey, type DuesCell } from '@/utils/daylongCalc';
import { formatDayShort, formatMonth, monthsAround, shiftMonth, thisMonth } from './format';

interface DuesGridProps {
  members: DaylongMember[];
  /** 'YYYY-MM' — 표의 중앙 월 */
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
  /** duesCellKey(memberId, 'YYYY-MM') → 집계 */
  cells: Map<string, DuesCell>;
  isAdmin?: boolean;
  onCellClick?: (member: DaylongMember, monthKey: string, cell: DuesCell | undefined) => void;
}

const navBtn =
  'flex h-8 w-8 items-center justify-center rounded-md text-purple-200/80 hover:bg-white/10 hover:text-white';

function CellContent({ cell }: { cell: DuesCell | undefined }) {
  if (!cell) {
    return (
      <span className="flex items-center justify-center" aria-label="미납">
        <XCircle className="h-4 w-4 text-rose-400" />
      </span>
    );
  }
  if (cell.exempt) {
    return <span className="font-medium text-teal-300">면제</span>;
  }
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className="font-medium tabular-nums text-emerald-300">{cell.amount.toLocaleString('ko-KR')}</span>
      <span className="text-[10px] tabular-nums text-gray-400">{formatDayShort(cell.latestDate)}</span>
    </span>
  );
}

export function DuesGrid({
  members,
  selectedMonth,
  onSelectMonth,
  cells,
  isAdmin = false,
  onCellClick,
}: DuesGridProps) {
  const months = monthsAround(selectedMonth, 2, 2);
  const current = thisMonth();

  const nav = (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-purple-500/30 bg-slate-800/60 px-2 py-1.5">
      <button type="button" aria-label="이전 달" onClick={() => onSelectMonth(shiftMonth(selectedMonth, -1))} className={navBtn}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-sm font-semibold text-white">{formatMonth(selectedMonth)}</span>
        {selectedMonth !== current && (
          <button
            type="button"
            onClick={() => onSelectMonth(current)}
            className="rounded-full border border-teal-400/40 bg-teal-500/20 px-2 py-0.5 text-[11px] font-semibold text-teal-200 hover:bg-teal-500/30"
          >
            오늘
          </button>
        )}
      </div>
      <button type="button" aria-label="다음 달" onClick={() => onSelectMonth(shiftMonth(selectedMonth, 1))} className={navBtn}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );

  if (members.length === 0) {
    return (
      <div className="space-y-2">
        {nav}
        <div className="rounded-xl border border-purple-500/30 bg-slate-800/60 px-4 py-10 text-center text-sm text-purple-200/70">
          등록된 회원이 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {nav}
      <div className="overflow-hidden rounded-xl border border-purple-500/30 bg-slate-800">
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-16" />
            {months.map((m) => (
              <col key={m.key} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-white/10 text-[11px] text-purple-200/70">
              <th className="px-1.5 py-2 text-left font-medium">구분</th>
              {months.map((m) => (
                <th
                  key={m.key}
                  className={`px-1.5 py-2 text-center font-medium tabular-nums ${
                    m.isSelected ? 'bg-teal-500/10 text-teal-300' : ''
                  }`}
                >
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-white/5 last:border-b-0">
                <th
                  scope="row"
                  className="truncate px-1.5 py-2 text-left font-medium text-gray-100"
                  title={member.name}
                >
                  {member.name || '(이름 없음)'}
                </th>
                {months.map((m) => {
                  const cell = cells.get(duesCellKey(member.id, m.key));
                  const bgClass = m.isSelected ? 'bg-teal-500/10' : '';
                  if (!isAdmin) {
                    return (
                      <td key={m.key} className={`px-1.5 py-2 text-center ${bgClass}`}>
                        <CellContent cell={cell} />
                      </td>
                    );
                  }
                  const label = !cell ? '회비 납부 기록' : cell.exempt ? '면제 기록 수정' : '회비 기록 수정';
                  return (
                    <td key={m.key} className={`p-0 text-center ${bgClass}`}>
                      <button
                        type="button"
                        onClick={() => onCellClick?.(member, m.key, cell)}
                        aria-label={`${member.name} ${m.key} ${label}`}
                        title={cell ? '수정' : '납부 기록'}
                        className="flex min-h-[2.5rem] w-full items-center justify-center px-1.5 py-1.5 transition-colors hover:bg-purple-500/20"
                      >
                        <CellContent cell={cell} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
