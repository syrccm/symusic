// daylong 월 납입 현황 표 — 행 = active 회원(order 순), 열 = 최근 12개월(오래된 → 최신).
// - 셀 = 회원·월 회비 납입 합계. 없으면 '−' 흐리게. 첫 열(이름) sticky left.
// - 관리자에게만 셀이 버튼이 된다(빈 셀 → 미리 채운 추가 폼, 금액 셀 → 편집/목록 이동은 부모가 결정).
//   비관리자 렌더 결과는 STEP 1 과 동일.
import type { DaylongMember } from '@/types/daylong';
import type { MonthCol } from './format';

interface DuesGridProps {
  members: DaylongMember[];
  months: MonthCol[];
  /** `${memberId}|${YYYY-MM}` → 합계 */
  duesByCell: Map<string, number>;
  isAdmin?: boolean;
  onCellClick?: (member: DaylongMember, monthKey: string, amount: number) => void;
}

export function DuesGrid({ members, months, duesByCell, isAdmin = false, onCellClick }: DuesGridProps) {
  if (members.length === 0) {
    return (
      <div className="rounded-xl border border-purple-500/30 bg-slate-800/60 px-4 py-10 text-center text-sm text-purple-200/70">
        등록된 회원이 없습니다.
      </div>
    );
  }
  // sticky 첫 열은 내용이 비쳐 보이지 않도록 불투명 배경(bg-slate-800)을 준다.
  return (
    <div className="overflow-x-auto rounded-xl border border-purple-500/30 bg-slate-800">
      <table className="min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs text-purple-200/70">
            <th className="sticky left-0 z-10 bg-slate-800 px-3 py-2 text-left font-medium">이름</th>
            {months.map((m) => (
              <th
                key={m.key}
                className={`px-2 py-2 text-right font-medium tabular-nums ${m.isCurrent ? 'text-teal-300' : ''}`}
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
                className="sticky left-0 z-10 max-w-[7rem] truncate bg-slate-800 px-3 py-2 text-left font-medium text-gray-100"
              >
                {member.name || '(이름 없음)'}
              </th>
              {months.map((m) => {
                const amount = duesByCell.get(`${member.id}|${m.key}`) ?? 0;
                const text = amount ? amount.toLocaleString('ko-KR') : '−';
                const colorClass = amount ? 'text-emerald-300' : 'text-white/25';
                const bgClass = m.isCurrent ? 'bg-teal-500/5' : '';
                if (!isAdmin) {
                  return (
                    <td key={m.key} className={`px-2 py-2 text-right tabular-nums ${colorClass} ${bgClass}`}>
                      {text}
                    </td>
                  );
                }
                return (
                  <td key={m.key} className={`p-0 text-right tabular-nums ${bgClass}`}>
                    <button
                      type="button"
                      onClick={() => onCellClick?.(member, m.key, amount)}
                      aria-label={`${member.name} ${m.key} ${amount ? '회비 수정' : '회비 기록 추가'}`}
                      title={amount ? '수정' : '기록 추가'}
                      className={`block w-full px-2 py-2 text-right transition-colors hover:bg-purple-500/20 ${colorClass}`}
                    >
                      {text}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
