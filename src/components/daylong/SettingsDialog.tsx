// daylong 설정 모달(관리자) — 제목 편집, 잔액 맞추기, PIN 변경.
// - 기본 정보: updateConfig({ title }) → config/daylong. 기초 잔액·기준일 입력은 제거(openingBalance 는 읽기만, UI 편집 없음).
// - 잔액 맞추기: '통장 실제 잔액' + 날짜(기본 오늘) 입력, 옆에 현재 계산 잔액(props.computedBalance) 표시.
//   저장 = addBalanceAdjustment(실제, 계산, 날짜) → 차액 0 이면 '이미 일치합니다' toast, 아니면 '잔액 조정' 거래 1건 생성
//   (type = 차액>0 ? in : out, amount = |차액|, memo '잔액 맞추기 (통장 X원)').
// - PIN 변경: 새 PIN 4자리 + 확인 4자리 일치 시 hashPin → updateConfig({ pinHash }).
//   갱신 직후 saveUnlockedHash(새 해시) 로 이 기기의 통과 기록을 갱신해 관리자 기기가 잠기지 않게 한다.
//   다른 기기는 config.pinHash 변경을 구독으로 감지해 자동 재잠금(DaylongPage 현행 동작).
// - 핸들러 순서는 PlaylistManagerDialog 패턴.
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DaylongConfig } from '@/types/daylong';
import { addBalanceAdjustment, updateConfig } from '@/utils/daylongFirestore';
import { hashPin, saveUnlockedHash } from '@/utils/daylongStorage';
import { describeFirestoreError, formatWon, todayISO } from './format';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  config: DaylongConfig;
  /** 현재 계산 잔액(시작 잔액 + 모든 거래). 잔액 맞추기의 비교 기준. */
  computedBalance: number;
}

/** 부호 있는 정수 문자열만 허용('-' 는 맨 앞 한 번). */
function sanitizeSignedInt(v: string): string {
  const neg = v.trim().startsWith('-');
  const digits = v.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return (neg ? '-' : '') + digits;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function SettingsDialog({ open, onOpenChange, isAdmin, config, computedBalance }: SettingsDialogProps) {
  const [title, setTitle] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  const [actualStr, setActualStr] = useState('');
  const [adjustDate, setAdjustDate] = useState(todayISO());
  const [savingAdjust, setSavingAdjust] = useState(false);

  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(config.title ?? '');
    setActualStr('');
    setAdjustDate(todayISO());
    setPin1('');
    setPin2('');
  }, [open, config.title]);

  const actual = actualStr === '' || actualStr === '-' ? NaN : Number(actualStr);
  const diff = Number.isInteger(actual) ? actual - computedBalance : NaN;
  const busy = savingInfo || savingAdjust || savingPin;

  const handleSaveInfo = async () => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (busy) return;

    setSavingInfo(true);
    try {
      await updateConfig({ title: title.trim() });
      toast.success('설정을 저장했습니다.');
    } catch (error) {
      console.error('❌ [Daylong] 설정 저장 오류:', error);
      toast.error(describeFirestoreError(error, '설정 저장 중 오류가 발생했습니다.'));
    } finally {
      setSavingInfo(false);
    }
  };

  const handleAdjust = async () => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (!Number.isInteger(actual)) {
      toast.error('통장 실제 잔액을 정수로 입력해주세요.');
      return;
    }
    if (!DATE_RE.test(adjustDate)) {
      toast.error('날짜를 선택해주세요.');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (busy) return;

    setSavingAdjust(true);
    try {
      const applied = await addBalanceAdjustment(actual, computedBalance, adjustDate);
      if (applied === 0) {
        toast.info('이미 일치합니다.');
      } else {
        toast.success(`${applied > 0 ? '+' : '−'}${formatWon(Math.abs(applied))} 잔액 조정 기록을 추가했습니다.`);
        setActualStr('');
      }
    } catch (error) {
      console.error('❌ [Daylong] 잔액 맞추기 오류:', error);
      toast.error(describeFirestoreError(error, '잔액 맞추기 중 오류가 발생했습니다.'));
    } finally {
      setSavingAdjust(false);
    }
  };

  const handleChangePin = async () => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (!/^\d{4}$/.test(pin1)) {
      toast.error('새 비밀번호는 숫자 4자리여야 합니다.');
      return;
    }
    if (pin1 !== pin2) {
      toast.error('비밀번호 확인이 일치하지 않습니다.');
      setPin2('');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (savingPin) return;

    setSavingPin(true);
    try {
      const pinHash = await hashPin(pin1);
      await updateConfig({ pinHash });
      // 이 기기는 새 해시로 통과 기록을 갱신해 재잠금을 피한다.
      saveUnlockedHash(pinHash);
      setPin1('');
      setPin2('');
      toast.success('비밀번호를 변경했습니다. 다른 기기는 새 비밀번호를 다시 입력해야 합니다.');
    } catch (error) {
      console.error('❌ [Daylong] PIN 변경 오류:', error);
      toast.error(describeFirestoreError(error, '비밀번호 변경 중 오류가 발생했습니다.'));
    } finally {
      setSavingPin(false);
    }
  };

  const pinInputClass =
    'bg-slate-700 border-slate-600 text-white text-center tracking-[0.5em] placeholder:tracking-normal';

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="bg-slate-800 border-slate-700 mx-4 max-h-[90vh] overflow-y-auto text-white">
        <DialogHeader>
          <DialogTitle className="text-white">설정</DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            제목·잔액 맞추기와 회원용 비밀번호를 관리합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* 기본 정보 */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-purple-200/80">기본 정보</h3>
            <div className="space-y-1.5">
              <Label htmlFor="daylong-title" className="text-white text-xs">제목</Label>
              <Input
                id="daylong-title"
                placeholder="daylong"
                value={title}
                disabled={busy}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSaveInfo()}
                className="flex min-w-[6rem] items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingInfo ? <Loader2 className="h-4 w-4 animate-spin" /> : '저장'}
              </button>
            </div>
          </section>

          <div className="h-px bg-white/10" />

          {/* 잔액 맞추기 */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-purple-200/80">잔액 맞추기</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="daylong-actual" className="text-white text-xs">통장 실제 잔액</Label>
                <Input
                  id="daylong-actual"
                  inputMode="numeric"
                  placeholder="숫자만 입력"
                  value={actualStr}
                  disabled={busy}
                  onChange={(e) => setActualStr(sanitizeSignedInt(e.target.value))}
                  className="bg-slate-700 border-slate-600 text-white tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="daylong-adjust-date" className="text-white text-xs">날짜</Label>
                <Input
                  id="daylong-adjust-date"
                  type="date"
                  value={adjustDate}
                  disabled={busy}
                  onChange={(e) => setAdjustDate(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="text-purple-200/70">
                현재 계산 잔액 <span className="text-white">{formatWon(computedBalance)}</span>
              </span>
              <span className={diff > 0 ? 'text-emerald-300' : diff < 0 ? 'text-rose-300' : 'text-gray-400'}>
                {Number.isNaN(diff)
                  ? ''
                  : diff === 0
                    ? '일치'
                    : `차액 ${diff > 0 ? '+' : '−'}${formatWon(Math.abs(diff))}`}
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              통장 잔액과 다르면 잔액 맞추기로 조정하세요. 차액이 '잔액 조정' 기록으로 남습니다.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy || !Number.isInteger(actual)}
                onClick={() => void handleAdjust()}
                className="flex min-w-[6rem] items-center justify-center rounded-md border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingAdjust ? <Loader2 className="h-4 w-4 animate-spin" /> : '잔액 맞추기'}
              </button>
            </div>
          </section>

          <div className="h-px bg-white/10" />

          {/* PIN 변경 */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-purple-200/80">회원용 비밀번호 변경</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="daylong-pin1" className="text-white text-xs">새 비밀번호</Label>
                <Input
                  id="daylong-pin1"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  placeholder="4자리"
                  value={pin1}
                  disabled={busy}
                  onChange={(e) => setPin1(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className={pinInputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="daylong-pin2" className="text-white text-xs">확인</Label>
                <Input
                  id="daylong-pin2"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  placeholder="4자리"
                  value={pin2}
                  disabled={busy}
                  onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleChangePin();
                  }}
                  className={pinInputClass}
                />
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              변경하면 다른 기기는 다시 잠기고 새 비밀번호를 입력해야 합니다. 이 기기는 그대로 유지됩니다.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy || pin1.length !== 4 || pin2.length !== 4}
                onClick={() => void handleChangePin()}
                className="flex min-w-[6rem] items-center justify-center rounded-md border border-teal-400/40 bg-teal-500/20 px-4 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingPin ? <Loader2 className="h-4 w-4 animate-spin" /> : '비밀번호 변경'}
              </button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
