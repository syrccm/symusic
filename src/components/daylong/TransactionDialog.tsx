// daylong 거래 폼 모달 — 모임가계부 '회비 납부' + '쓰기' 방식. 추가·편집 공용.
// - 구분 세그먼트 [회비 납부] [수입] [지출].
// - 회비 납부: [납부][면제] 토글, 회원 select, 납입월(type=month), 납부일자(type=date), 금액(기본값 = 회원 monthlyDue).
//   면제 = 금액 입력 비활성 + 0 으로 저장(납부일자는 면제 처리한 날짜로 기록). 편집 시 기존 면제 거래는 [면제] 선택 상태로 열린다.
//   category 는 저장 헬퍼가 '정기회비' 로 고정.
// - 수입/지출: 날짜, 분류 select(config.categories + 맨 아래 '+ 항목 추가' → 인라인 입력 → addCategory(arrayUnion) 후 선택),
//   금액(0 초과), 내용(memo).
// - '저장 후 계속 쓰기'(추가 모드만): 저장 후 모달을 닫지 않고 날짜·구분(·회원·납입월) 유지, 금액·내용만 초기화.
// - 핸들러 순서(PlaylistManagerDialog 패턴): !isAdmin → 입력 검증 → !db → 재진입 방지 → try/await/toast → catch → finally.
// - prefill: 월 납입 현황 빈 셀에서 열 때 [회비 납부] + 회원 + 월을 미리 채운다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  isDuesExempt,
  memberMonthlyDue,
  resolveCategories,
  type DaylongConfig,
  type DaylongMember,
  type DaylongTransaction,
} from '@/types/daylong';
import {
  addCategory,
  addTransaction,
  kindOf,
  updateTransaction,
  type TransactionInput,
  type TxKind,
} from '@/utils/daylongFirestore';
import { describeFirestoreError, formatWon, thisMonth, todayISO } from './format';

export interface TransactionPrefill {
  kind?: TxKind;
  memberId?: string;
  dueMonth?: string;
}

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  /** 전체 회원(order 순). 선택지는 active 회원 + 현재 선택된 회원. */
  members: DaylongMember[];
  config: DaylongConfig | null;
  /** 편집 대상. null/undefined 면 추가 모드. */
  editing?: DaylongTransaction | null;
  /** 추가 모드 초기값. */
  prefill?: TransactionPrefill | null;
}

const KIND_LABEL: Record<TxKind, string> = { dues: '회비 납부', in: '수입', out: '지출' };
const KINDS: TxKind[] = ['dues', 'in', 'out'];
const ADD_CATEGORY_VALUE = '__add_category__';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const inputClass = 'bg-slate-700 border-slate-600 text-white';

export function TransactionDialog({
  open,
  onOpenChange,
  isAdmin,
  members,
  config,
  editing,
  prefill,
}: TransactionDialogProps) {
  const [kind, setKind] = useState<TxKind>('dues');
  const [date, setDate] = useState(todayISO());
  const [amountStr, setAmountStr] = useState('');
  const [exempt, setExempt] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [dueMonth, setDueMonth] = useState(thisMonth());
  const [memo, setMemo] = useState('');
  const [category, setCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [saving, setSaving] = useState(false);

  // 초기화 시점의 회원 목록만 참조(구독 갱신으로 입력 중인 폼이 초기화되지 않게 deps 에서 제외)
  const membersRef = useRef(members);
  membersRef.current = members;
  const defaultDueStr = (id: string): string => {
    const m = membersRef.current.find((x) => x.id === id);
    return id ? String(memberMonthlyDue(m)) : '';
  };

  // 열릴 때마다 편집 대상 또는 prefill 로 폼 초기화
  useEffect(() => {
    if (!open) return;
    setAddingCategory(false);
    setNewCategory('');
    if (editing) {
      const k = kindOf(editing);
      setKind(k);
      setDate(editing.date || todayISO());
      setExempt(isDuesExempt(editing));
      setAmountStr(editing.amount > 0 ? String(editing.amount) : '');
      setMemberId(editing.memberId ?? '');
      setDueMonth(editing.dueMonth ?? thisMonth());
      setMemo(editing.memo);
      setCategory(k === 'dues' ? '' : (editing.category ?? ''));
    } else {
      const k = prefill?.kind ?? 'dues';
      const mid = prefill?.memberId ?? '';
      setKind(k);
      setDate(todayISO());
      setExempt(false);
      setAmountStr(k === 'dues' ? defaultDueStr(mid) : '');
      setMemberId(mid);
      setDueMonth(prefill?.dueMonth ?? thisMonth());
      setMemo('');
      setCategory('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, prefill]);

  const amount = amountStr ? Number(amountStr) : 0;
  const busy = saving || savingCategory;

  const memberOptions = useMemo(
    () => members.filter((m) => m.active || m.id === memberId),
    [members, memberId],
  );

  const categories = useMemo(() => resolveCategories(config), [config]);
  const categoryList = kind === 'out' ? categories.out : categories.in;
  // 편집 중인 거래의 분류가 목록에 없으면(삭제된 분류 등) 선택지에 포함
  const categoryOptions = category && !categoryList.includes(category) ? [...categoryList, category] : categoryList;

  // ── 입력 보조 ──
  const changeKind = (k: TxKind) => {
    if (k === kind) return;
    setKind(k);
    setCategory('');
    setAddingCategory(false);
    setNewCategory('');
    if (k !== 'dues') setExempt(false);
    if (k === 'dues' && !amountStr && !exempt) setAmountStr(defaultDueStr(memberId));
  };
  const changeMember = (id: string) => {
    setMemberId(id);
    if (!exempt) setAmountStr(defaultDueStr(id));
  };
  const changeExempt = (v: boolean) => {
    setExempt(v);
    if (!v && !amountStr) setAmountStr(defaultDueStr(memberId));
  };
  const onCategoryChange = (v: string) => {
    if (v === ADD_CATEGORY_VALUE) {
      setAddingCategory(true);
      return;
    }
    setCategory(v);
  };

  // ── 분류 추가 ──
  const handleAddCategory = async () => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (kind === 'dues') return;
    const name = newCategory.trim();
    if (!name) {
      toast.error('분류 이름을 입력해주세요.');
      return;
    }
    if (categoryList.includes(name)) {
      setCategory(name);
      setAddingCategory(false);
      setNewCategory('');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (busy) return;

    setSavingCategory(true);
    try {
      await addCategory(kind, name, categoryList);
      setCategory(name);
      setAddingCategory(false);
      setNewCategory('');
      toast.success(`'${name}' 분류를 추가했습니다.`);
    } catch (error) {
      console.error('❌ [Daylong] 분류 추가 오류:', error);
      toast.error(describeFirestoreError(error, '분류 추가 중 오류가 발생했습니다.'));
    } finally {
      setSavingCategory(false);
    }
  };

  // ── 저장 ──
  const handleSave = async (continueAfter: boolean) => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (!DATE_RE.test(date)) {
      toast.error(kind === 'dues' ? '납부일자를 선택해주세요.' : '날짜를 선택해주세요.');
      return;
    }
    let finalAmount = amount;
    if (kind === 'dues') {
      if (!memberId) {
        toast.error('회원을 선택해주세요.');
        return;
      }
      if (!MONTH_RE.test(dueMonth)) {
        toast.error('납입월을 선택해주세요.');
        return;
      }
      if (exempt) {
        finalAmount = 0;
      } else if (amountStr === '' || !Number.isInteger(amount) || amount < 0) {
        toast.error("금액을 입력해주세요. 면제로 표기하려면 [면제]를 선택하세요.");
        return;
      }
    } else {
      if (!category) {
        toast.error('분류를 선택해주세요.');
        return;
      }
      if (!Number.isInteger(amount) || amount <= 0) {
        toast.error('금액은 0보다 큰 숫자로 입력해주세요.');
        return;
      }
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (busy) return;

    const input: TransactionInput = {
      kind,
      date,
      amount: finalAmount,
      memo: memo.trim(),
      ...(kind === 'dues' ? { memberId, dueMonth } : { category }),
    };

    setSaving(true);
    try {
      if (editing) {
        await updateTransaction(editing.id, input);
        toast.success('기록을 수정했습니다.');
        onOpenChange(false);
      } else {
        await addTransaction(input);
        if (continueAfter) {
          // 날짜·구분(·회원·납입월·분류) 유지, 금액·내용만 초기화
          setExempt(false);
          setAmountStr(kind === 'dues' ? defaultDueStr(memberId) : '');
          setMemo('');
          toast.success('기록을 추가했습니다. 이어서 입력하세요.');
        } else {
          toast.success('기록을 추가했습니다.');
          onOpenChange(false);
        }
      }
    } catch (error) {
      console.error('❌ [Daylong] 거래 저장 오류:', error);
      toast.error(describeFirestoreError(error, '기록 저장 중 오류가 발생했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  const canSave = !busy && (kind === 'dues' ? exempt || amountStr !== '' : amount > 0 && !!category);

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="bg-slate-800 border-slate-700 mx-4 max-h-[90vh] overflow-y-auto text-white">
        <DialogHeader>
          <DialogTitle className="text-white">{editing ? '기록 수정' : '기록 추가'}</DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            회비 납부는 회원과 납입월을 함께 기록하며 월 납입 현황에 반영됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 구분 */}
          <div className="space-y-1.5">
            <Label className="text-white text-xs">구분</Label>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-600 bg-slate-700/60 p-1">
              {KINDS.map((k) => {
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={busy}
                    onClick={() => changeKind(k)}
                    className={`rounded-md py-2 text-sm font-medium transition-colors ${
                      active
                        ? k === 'out'
                          ? 'bg-rose-500/80 text-white'
                          : k === 'in'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-purple-600 text-white'
                        : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    {KIND_LABEL[k]}
                  </button>
                );
              })}
            </div>
          </div>

          {kind === 'dues' ? (
            <>
              {/* 납부 / 면제 */}
              <div className="space-y-1.5">
                <Label className="text-white text-xs">처리</Label>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-600 bg-slate-700/60 p-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => changeExempt(false)}
                    className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                      !exempt ? 'bg-emerald-600 text-white' : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    납부
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => changeExempt(true)}
                    className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                      exempt ? 'bg-teal-600 text-white' : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    면제
                  </button>
                </div>
              </div>

              {/* 회원 + 납입월 */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-white text-xs">회원</Label>
                  <Select value={memberId} onValueChange={changeMember} disabled={busy}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="회원 선택" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      {memberOptions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-400">활성 회원이 없습니다</div>
                      ) : (
                        memberOptions.map((m) => (
                          <SelectItem key={m.id} value={m.id} className="text-white">
                            {m.name || '(이름 없음)'}
                            {!m.active ? ' (비활성)' : ''}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="daylong-tx-month" className="text-white text-xs">납입월</Label>
                  <Input
                    id="daylong-tx-month"
                    type="month"
                    value={dueMonth}
                    disabled={busy}
                    onChange={(e) => setDueMonth(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* 납부일자 + 금액 */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="daylong-tx-date" className="text-white text-xs">납부일자</Label>
                  <Input
                    id="daylong-tx-date"
                    type="date"
                    value={date}
                    disabled={busy}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="daylong-tx-amount" className="text-white text-xs">금액</Label>
                  <Input
                    id="daylong-tx-amount"
                    inputMode="numeric"
                    placeholder={exempt ? '면제 (0원)' : '숫자만 입력'}
                    value={exempt ? '' : amountStr}
                    disabled={busy || exempt}
                    onChange={(e) => setAmountStr(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
                    className={`${inputClass} tabular-nums disabled:opacity-50`}
                  />
                  <p className="min-h-[1rem] text-right text-xs text-purple-200/70 tabular-nums">
                    {exempt ? '면제 처리' : amount > 0 ? formatWon(amount) : ''}
                  </p>
                </div>
              </div>
              <p className="-mt-2 text-[11px] text-gray-400">
                '면제'로 표기하려면 [면제]를 선택하세요. 금액 0원으로 저장되며 납부일자는 면제 처리한 날짜로 기록됩니다.
              </p>
            </>
          ) : (
            <>
              {/* 날짜 */}
              <div className="space-y-1.5">
                <Label htmlFor="daylong-tx-date" className="text-white text-xs">날짜</Label>
                <Input
                  id="daylong-tx-date"
                  type="date"
                  value={date}
                  disabled={busy}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>

              {/* 분류 */}
              <div className="space-y-1.5">
                <Label className="text-white text-xs">분류</Label>
                {addingCategory ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      autoFocus
                      placeholder="새 분류 이름"
                      value={newCategory}
                      disabled={busy}
                      onChange={(e) => setNewCategory(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleAddCategory();
                        }
                        if (e.key === 'Escape') {
                          setAddingCategory(false);
                          setNewCategory('');
                        }
                      }}
                      className={inputClass}
                    />
                    <button
                      type="button"
                      disabled={busy || !newCategory.trim()}
                      onClick={() => void handleAddCategory()}
                      className="flex h-10 shrink-0 items-center justify-center rounded-md bg-purple-600 px-3 text-sm font-semibold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : '추가'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setAddingCategory(false);
                        setNewCategory('');
                      }}
                      className="h-10 shrink-0 rounded-md px-3 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <Select value={category} onValueChange={onCategoryChange} disabled={busy}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="분류 선택" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      {categoryOptions.map((c) => (
                        <SelectItem key={c} value={c} className="text-white">
                          {c}
                        </SelectItem>
                      ))}
                      <SelectItem value={ADD_CATEGORY_VALUE} className="text-teal-200">
                        <span className="flex items-center gap-1">
                          <Plus className="h-3.5 w-3.5" /> 항목 추가
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* 금액 */}
              <div className="space-y-1.5">
                <Label htmlFor="daylong-tx-amount" className="text-white text-xs">금액</Label>
                <Input
                  id="daylong-tx-amount"
                  inputMode="numeric"
                  placeholder="숫자만 입력"
                  value={amountStr}
                  disabled={busy}
                  onChange={(e) => setAmountStr(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
                  className={`${inputClass} tabular-nums`}
                />
                <p className="min-h-[1rem] text-right text-xs text-purple-200/70 tabular-nums">
                  {amount > 0 ? formatWon(amount) : ''}
                </p>
              </div>
            </>
          )}

          {/* 내용 / 메모 */}
          <div className="space-y-1.5">
            <Label htmlFor="daylong-tx-memo" className="text-white text-xs">
              {kind === 'dues' ? '메모' : '내용'} <span className="text-gray-400">(선택)</span>
            </Label>
            <Input
              id="daylong-tx-memo"
              placeholder={kind === 'dues' ? '예: 현금 납부' : kind === 'in' ? '예: 이월금, 후원' : '예: 식사비, 다과'}
              value={memo}
              disabled={busy}
              onChange={(e) => setMemo(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="rounded-md px-4 py-2 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50"
            >
              취소
            </button>
            {!editing && (
              <button
                type="button"
                disabled={!canSave}
                onClick={() => void handleSave(true)}
                className="rounded-md border border-purple-400/40 bg-purple-500/20 px-3 py-2 text-sm font-semibold text-purple-100 hover:bg-purple-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                저장 후 계속 쓰기
              </button>
            )}
            <button
              type="button"
              disabled={!canSave}
              onClick={() => void handleSave(false)}
              className="flex min-w-[5rem] items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? '수정 저장' : '추가'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
