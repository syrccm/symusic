// daylong 설정 모달(관리자) — 제목·기초 잔액(+기준일) 편집, PIN 변경.
// - 기본 정보: updateConfig({ title, openingBalance, openingBalanceDate }) → config/daylong.
//   · 기준일(openingBalanceDate) = "이 날 시작 시점의 잔액이 기초 잔액". 잔액 계산은 기준일 당일부터(date >= 기준일) 거래만 누적.
//   · 기준일을 비우면 필드를 제거(updateConfig 가 deleteField 처리) → 전체 거래 누적.
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
import { updateConfig } from '@/utils/daylongFirestore';
import { hashPin, saveUnlockedHash } from '@/utils/daylongStorage';
import { describeFirestoreError, formatWon } from './format';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  config: DaylongConfig;
}

/** 부호 있는 정수 문자열만 허용('-' 는 맨 앞 한 번). */
function sanitizeSignedInt(v: string): string {
  const neg = v.trim().startsWith('-');
  const digits = v.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return (neg ? '-' : '') + digits;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function SettingsDialog({ open, onOpenChange, isAdmin, config }: SettingsDialogProps) {
  const [title, setTitle] = useState('');
  const [openingStr, setOpeningStr] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(config.title ?? '');
    setOpeningStr(config.openingBalance !== undefined ? String(config.openingBalance) : '');
    setOpeningDate(config.openingBalanceDate ?? '');
    setPin1('');
    setPin2('');
  }, [open, config.title, config.openingBalance, config.openingBalanceDate]);

  const opening = openingStr === '' || openingStr === '-' ? 0 : Number(openingStr);
  const busy = savingInfo || savingPin;

  const handleSaveInfo = async () => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (!Number.isInteger(opening)) {
      toast.error('기초 잔액은 정수로 입력해주세요.');
      return;
    }
    if (openingDate && !DATE_RE.test(openingDate)) {
      toast.error('기준일 형식이 올바르지 않습니다.');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (savingInfo) return;

    setSavingInfo(true);
    try {
      await updateConfig({ title: title.trim(), openingBalance: opening, openingBalanceDate: openingDate });
      toast.success('설정을 저장했습니다.');
    } catch (error) {
      console.error('❌ [Daylong] 설정 저장 오류:', error);
      toast.error(describeFirestoreError(error, '설정 저장 중 오류가 발생했습니다.'));
    } finally {
      setSavingInfo(false);
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
            제목·기초 잔액과 회원용 비밀번호를 관리합니다.
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="daylong-opening" className="text-white text-xs">기초 잔액</Label>
                <Input
                  id="daylong-opening"
                  inputMode="numeric"
                  placeholder="0"
                  value={openingStr}
                  disabled={busy}
                  onChange={(e) => setOpeningStr(sanitizeSignedInt(e.target.value))}
                  className="bg-slate-700 border-slate-600 text-white tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="daylong-opening-date" className="text-white text-xs">기준일 시작 잔액(당일 거래부터 반영)</Label>
                <Input
                  id="daylong-opening-date"
                  type="date"
                  value={openingDate}
                  disabled={busy}
                  onChange={(e) => setOpeningDate(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            </div>
            <p className="min-h-[1rem] text-right text-xs text-purple-200/70 tabular-nums">
              {Number.isInteger(opening)
                ? openingDate
                  ? `${openingDate} 시작 잔액 ${formatWon(opening)}`
                  : formatWon(opening)
                : ''}
            </p>
            <p className="-mt-2 text-[11px] text-gray-400">
              기준일을 지정하면 그 전날까지의 거래는 잔액에 넣지 않고, 기준일 당일 거래부터 기초 잔액에 누적합니다. 비우면 전체 거래를 누적합니다.
            </p>
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
