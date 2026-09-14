// daylong 거래 폼 모달 — 추가·편집 공용.
// - 구분 세그먼트 [회비 납입] [기타 입금] [출금]. 회비 납입일 때만 회원 select + 납입월(type=month) 노출.
// - 금액은 숫자만(inputMode=numeric), 0 초과 필수. 입력칸 아래에 천단위 미리보기.
// - 저장: 추가 → addTransaction, 편집 → updateTransaction(회비 → 기타로 바꾸면 memberId·dueMonth 제거).
// - 핸들러 순서(PlaylistManagerDialog 패턴): !isAdmin → 입력 검증 → !db → 재진입 방지 → try/await/toast → catch → finally.
// - prefill: 월 납입 현황 빈 셀에서 열 때 [회비 납입] + 회원 + 월을 미리 채운다.
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DaylongMember, DaylongTransaction } from '@/types/daylong';
import {
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
  /** 편집 대상. null/undefined 면 추가 모드. */
  editing?: DaylongTransaction | null;
  /** 추가 모드 초기값. */
  prefill?: TransactionPrefill | null;
}

const KIND_LABEL: Record<TxKind, string> = { dues: '회비 납입', in: '기타 입금', out: '출금' };
const KINDS: TxKind[] = ['dues', 'in', 'out'];

export function TransactionDialog({ open, onOpenChange, isAdmin, members, editing, prefill }: TransactionDialogProps) {
  const [kind, setKind] = useState<TxKind>('dues');
  const [date, setDate] = useState(todayISO());
  const [amountStr, setAmountStr] = useState('');
  const [memberId, setMemberId] = useState('');
  const [dueMonth, setDueMonth] = useState(thisMonth());
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  // 열릴 때마다 편집 대상 또는 prefill 로 폼 초기화
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setKind(kindOf(editing));
      setDate(editing.date || todayISO());
      setAmountStr(editing.amount > 0 ? String(editing.amount) : '');
      setMemberId(editing.memberId ?? '');
      setDueMonth(editing.dueMonth ?? thisMonth());
      setMemo(editing.memo);
    } else {
      setKind(prefill?.kind ?? 'dues');
      setDate(todayISO());
      setAmountStr('');
      setMemberId(prefill?.memberId ?? '');
      setDueMonth(prefill?.dueMonth ?? thisMonth());
      setMemo('');
    }
  }, [open, editing, prefill]);

  const amount = amountStr ? Number(amountStr) : 0;

  const memberOptions = useMemo(
    () => members.filter((m) => m.active || m.id === memberId),
    [members, memberId],
  );

  const handleSave = async () => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error('날짜를 선택해주세요.');
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      toast.error('금액은 0보다 큰 숫자로 입력해주세요.');
      return;
    }
    if (kind === 'dues') {
      if (!memberId) {
        toast.error('회원을 선택해주세요.');
        return;
      }
      if (!/^\d{4}-\d{2}$/.test(dueMonth)) {
        toast.error('납입월을 선택해주세요.');
        return;
      }
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (saving) return;

    const input: TransactionInput = {
      kind,
      date,
      amount,
      memo: memo.trim(),
      ...(kind === 'dues' ? { memberId, dueMonth } : {}),
    };

    setSaving(true);
    try {
      if (editing) {
        await updateTransaction(editing.id, input);
        toast.success('기록을 수정했습니다.');
      } else {
        await addTransaction(input);
        toast.success('기록을 추가했습니다.');
      }
      onOpenChange(false);
    } catch (error) {
      console.error('❌ [Daylong] 거래 저장 오류:', error);
      toast.error(describeFirestoreError(error, '기록 저장 중 오류가 발생했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="bg-slate-800 border-slate-700 mx-4 max-h-[90vh] overflow-y-auto text-white">
        <DialogHeader>
          <DialogTitle className="text-white">{editing ? '기록 수정' : '기록 추가'}</DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            회비 납입은 회원과 납입월을 함께 기록합니다. 월 납입 현황에 반영됩니다.
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
                    disabled={saving}
                    onClick={() => setKind(k)}
                    className={`rounded-md py-2 text-sm font-medium transition-colors ${
                      active
                        ? k === 'out'
                          ? 'bg-rose-500/80 text-white'
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

          {/* 날짜 */}
          <div className="space-y-1.5">
            <Label htmlFor="daylong-tx-date" className="text-white text-xs">날짜</Label>
            <Input
              id="daylong-tx-date"
              type="date"
              value={date}
              disabled={saving}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>

          {/* 금액 */}
          <div className="space-y-1.5">
            <Label htmlFor="daylong-tx-amount" className="text-white text-xs">금액</Label>
            <Input
              id="daylong-tx-amount"
              inputMode="numeric"
              placeholder="숫자만 입력"
              value={amountStr}
              disabled={saving}
              onChange={(e) => setAmountStr(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
              className="bg-slate-700 border-slate-600 text-white tabular-nums"
            />
            <p className="min-h-[1rem] text-right text-xs text-purple-200/70 tabular-nums">
              {amount > 0 ? formatWon(amount) : ''}
            </p>
          </div>

          {/* 회비 납입: 회원 + 납입월 */}
          {kind === 'dues' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-white text-xs">회원</Label>
                <Select value={memberId} onValueChange={setMemberId} disabled={saving}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
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
                  disabled={saving}
                  onChange={(e) => setDueMonth(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            </div>
          )}

          {/* 메모 */}
          <div className="space-y-1.5">
            <Label htmlFor="daylong-tx-memo" className="text-white text-xs">
              메모 <span className="text-gray-400">(선택)</span>
            </Label>
            <Input
              id="daylong-tx-memo"
              placeholder={kind === 'dues' ? '예: 현금 납부' : kind === 'in' ? '예: 이월금, 후원' : '예: 식사비, 다과'}
              value={memo}
              disabled={saving}
              onChange={(e) => setMemo(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => onOpenChange(false)}
              className="rounded-md px-4 py-2 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={saving || amount <= 0}
              onClick={() => void handleSave()}
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
