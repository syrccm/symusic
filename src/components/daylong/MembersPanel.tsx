// daylong 회원 관리 패널(관리자 전용 탭) — 추가 / 이름 인라인 편집 / 월 회비 / 활성 토글 / 순서 ▲▼ / 삭제.
// - 월 회비(monthlyDue): 행의 숫자 입력. 포커스가 빠지거나 Enter 면 값이 바뀐 경우에만 updateMember. 기본값 DEFAULT_MONTHLY_DUE.
// - 추가: order = 현재 최대값 + 1, active true. 같은 이름이 있으면 confirm 후 진행 가능.
// - 순서: 정렬된 목록에서 이웃과 자리를 바꾼 뒤, 위치와 다른 order 를 가진 회원만 갱신(order 가 비어 있던 문서도 함께 정돈).
// - 삭제: 해당 회원의 거래가 1건 이상이면 삭제 대신 비활성 전환 안내, 0건이면 confirm 후 deleteDoc.
// - 핸들러 순서는 PlaylistManagerDialog 패턴. busyId 로 행 단위 진행 표시 + 나머지 버튼 비활성.
import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { Input } from '@/components/ui/input';
import { memberMonthlyDue, type DaylongMember, type DaylongTransaction } from '@/types/daylong';
import { addMember, deleteMember, updateMember } from '@/utils/daylongFirestore';
import { describeFirestoreError } from './format';

interface MembersPanelProps {
  isAdmin: boolean;
  /** 전체 회원(order 순 정렬됨) */
  members: DaylongMember[];
  transactions: DaylongTransaction[];
}

export function MembersPanel({ isAdmin, members, transactions }: MembersPanelProps) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  /** 회원 id → 편집 중인 월 회비 문자열(없으면 저장값 표시) */
  const [dueDrafts, setDueDrafts] = useState<Record<string, string>>({});

  const busy = adding || busyId !== null;

  // 회원별 거래 건수(삭제 가능 여부 판단)
  const txCount = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach((t) => {
      if (t.memberId) map.set(t.memberId, (map.get(t.memberId) ?? 0) + 1);
    });
    return map;
  }, [transactions]);

  const guard = (): boolean => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return false;
    }
    return true;
  };

  // ── 추가 ──
  const handleAdd = async () => {
    if (!guard()) return;
    const name = newName.trim();
    if (!name) {
      toast.error('이름을 입력해주세요.');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (busy) return;
    if (members.some((m) => m.name === name)) {
      if (!window.confirm(`'${name}' 회원이 이미 있습니다. 같은 이름으로 추가할까요?`)) return;
    }

    setAdding(true);
    try {
      const maxOrder = members.reduce((acc, m) => Math.max(acc, m.order), 0);
      await addMember(name, maxOrder + 1);
      setNewName('');
      toast.success(`'${name}' 회원을 추가했습니다.`);
    } catch (error) {
      console.error('❌ [Daylong] 회원 추가 오류:', error);
      toast.error(describeFirestoreError(error, '회원 추가 중 오류가 발생했습니다.'));
    } finally {
      setAdding(false);
    }
  };

  // ── 활성 토글 ──
  const handleToggleActive = async (m: DaylongMember) => {
    if (!guard()) return;
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (busy) return;

    setBusyId(m.id);
    try {
      await updateMember(m.id, { active: !m.active });
      toast.success(`'${m.name}' ${m.active ? '비활성' : '활성'}으로 전환했습니다.`);
    } catch (error) {
      console.error('❌ [Daylong] 회원 활성 토글 오류:', error);
      toast.error(describeFirestoreError(error, '회원 상태 변경 중 오류가 발생했습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  // ── 순서 이동 ──
  const handleMove = async (index: number, dir: -1 | 1) => {
    if (!guard()) return;
    const target = index + dir;
    if (target < 0 || target >= members.length) return;
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (busy) return;

    const reordered = [...members];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    // 위치(1부터)와 다른 order 만 갱신 — 두 회원 외에 order 가 비어 있던 문서도 정돈된다.
    const updates = reordered
      .map((m, i) => ({ m, order: i + 1 }))
      .filter(({ m, order }) => m.order !== order);

    setBusyId(members[index].id);
    try {
      await Promise.all(updates.map(({ m, order }) => updateMember(m.id, { order })));
    } catch (error) {
      console.error('❌ [Daylong] 회원 순서 변경 오류:', error);
      toast.error(describeFirestoreError(error, '순서 변경 중 오류가 발생했습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  // ── 이름 편집 ──
  const startEdit = (m: DaylongMember) => {
    if (busy) return;
    setEditingId(m.id);
    setEditName(m.name);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };
  const handleSaveName = async (m: DaylongMember) => {
    if (!guard()) return;
    const name = editName.trim();
    if (!name) {
      toast.error('이름을 입력해주세요.');
      return;
    }
    if (name === m.name) {
      cancelEdit();
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (busy) return;

    setBusyId(m.id);
    try {
      await updateMember(m.id, { name });
      cancelEdit();
      toast.success('이름을 수정했습니다.');
    } catch (error) {
      console.error('❌ [Daylong] 회원 이름 수정 오류:', error);
      toast.error(describeFirestoreError(error, '이름 수정 중 오류가 발생했습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  // ── 월 회비 ──
  const clearDueDraft = (id: string) =>
    setDueDrafts((d) => {
      if (!(id in d)) return d;
      const next = { ...d };
      delete next[id];
      return next;
    });
  const handleSaveDue = async (m: DaylongMember) => {
    const draft = dueDrafts[m.id];
    if (draft === undefined) return;
    if (draft === '') {
      clearDueDraft(m.id);
      return;
    }
    const value = Number(draft);
    if (value === memberMonthlyDue(m)) {
      clearDueDraft(m.id);
      return;
    }
    if (!guard()) return;
    if (!Number.isInteger(value) || value < 0) {
      toast.error('월 회비는 0 이상의 정수로 입력해주세요.');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (busy) return;

    setBusyId(m.id);
    try {
      await updateMember(m.id, { monthlyDue: value });
      toast.success(`'${m.name}' 월 회비를 ${value.toLocaleString('ko-KR')}원으로 저장했습니다.`);
    } catch (error) {
      console.error('❌ [Daylong] 월 회비 저장 오류:', error);
      toast.error(describeFirestoreError(error, '월 회비 저장 중 오류가 발생했습니다.'));
    } finally {
      clearDueDraft(m.id);
      setBusyId(null);
    }
  };

  // ── 삭제 ──
  const handleDelete = async (m: DaylongMember) => {
    if (!guard()) return;
    const count = txCount.get(m.id) ?? 0;
    if (count > 0) {
      toast.error(`거래 기록 ${count}건이 있어 삭제할 수 없습니다. 비활성으로 전환하세요.`);
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (busy) return;
    if (!window.confirm(`'${m.name}' 회원을 삭제할까요? 되돌릴 수 없습니다.`)) return;

    setBusyId(m.id);
    try {
      await deleteMember(m.id);
      toast.success(`'${m.name}' 회원을 삭제했습니다.`);
    } catch (error) {
      console.error('❌ [Daylong] 회원 삭제 오류:', error);
      toast.error(describeFirestoreError(error, '회원 삭제 중 오류가 발생했습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  const iconBtn =
    'flex h-8 w-8 items-center justify-center rounded-md text-purple-200/80 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className="space-y-3">
      {/* 추가 */}
      <div className="flex items-center gap-2 rounded-xl border border-purple-500/30 bg-slate-800/60 p-2">
        <Input
          placeholder="새 회원 이름"
          value={newName}
          disabled={busy}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleAdd();
          }}
          className="bg-slate-700 border-slate-600 text-white"
        />
        <button
          type="button"
          disabled={busy || !newName.trim()}
          onClick={() => void handleAdd()}
          className="flex h-10 shrink-0 items-center gap-1 rounded-md bg-purple-600 px-3 text-sm font-semibold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          추가
        </button>
      </div>

      {/* 목록 */}
      {members.length === 0 ? (
        <div className="rounded-xl border border-purple-500/30 bg-slate-800/60 px-4 py-10 text-center text-sm text-purple-200/70">
          등록된 회원이 없습니다. 위에서 추가하세요.
        </div>
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-purple-500/30 bg-slate-800/60">
          {members.map((m, index) => {
            const rowBusy = busyId === m.id;
            const editing = editingId === m.id;
            const count = txCount.get(m.id) ?? 0;
            return (
              <li key={m.id} className={`flex items-center gap-2 px-2 py-2 sm:px-3 ${m.active ? '' : 'opacity-60'}`}>
                {/* 활성 토글 */}
                <label className="flex shrink-0 items-center" title={m.active ? '활성' : '비활성'}>
                  <input
                    type="checkbox"
                    checked={m.active}
                    disabled={busy}
                    onChange={() => void handleToggleActive(m)}
                    aria-label={`${m.name} 활성`}
                    className="h-4 w-4 accent-purple-500"
                  />
                </label>

                {/* 이름 (인라인 편집) */}
                {editing ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <Input
                      autoFocus
                      value={editName}
                      disabled={rowBusy}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSaveName(m);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="h-8 bg-slate-700 border-slate-600 text-white"
                    />
                    <button
                      type="button"
                      aria-label="이름 저장"
                      disabled={rowBusy}
                      onClick={() => void handleSaveName(m)}
                      className={`${iconBtn} text-emerald-300`}
                    >
                      {rowBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button type="button" aria-label="취소" disabled={rowBusy} onClick={cancelEdit} className={iconBtn}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startEdit(m)}
                    title="이름 수정"
                    className="group flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <span className="truncate text-sm text-gray-100">{m.name || '(이름 없음)'}</span>
                    <Pencil className="h-3 w-3 shrink-0 text-purple-200/40 group-hover:text-purple-200" />
                    {count > 0 && (
                      <span className="shrink-0 text-[11px] text-purple-200/50 tabular-nums">거래 {count}</span>
                    )}
                  </button>
                )}

                {/* 월 회비 */}
                {!editing && (
                  <span className="relative flex shrink-0 items-center">
                    <Input
                      inputMode="numeric"
                      aria-label={`${m.name} 월 회비`}
                      title="월 회비"
                      value={dueDrafts[m.id] ?? String(memberMonthlyDue(m))}
                      disabled={busy}
                      onChange={(e) =>
                        setDueDrafts((d) => ({
                          ...d,
                          [m.id]: e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''),
                        }))
                      }
                      onBlur={() => void handleSaveDue(m)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      className="h-8 w-[4.75rem] bg-slate-700 border-slate-600 pr-5 text-right text-xs text-white tabular-nums"
                    />
                    <span className="pointer-events-none absolute right-1.5 text-[10px] text-gray-400">원</span>
                  </span>
                )}

                {/* 순서 / 삭제 */}
                {!editing && (
                  <span className="flex shrink-0 items-center">
                    <button
                      type="button"
                      aria-label="위로"
                      disabled={busy || index === 0}
                      onClick={() => void handleMove(index, -1)}
                      className={iconBtn}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="아래로"
                      disabled={busy || index === members.length - 1}
                      onClick={() => void handleMove(index, 1)}
                      className={iconBtn}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="삭제"
                      title={count > 0 ? '거래 기록이 있어 삭제 불가' : '삭제'}
                      disabled={busy}
                      onClick={() => void handleDelete(m)}
                      className={`${iconBtn} ${count > 0 ? 'text-white/25' : 'text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200'}`}
                    >
                      {rowBusy && !editing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
