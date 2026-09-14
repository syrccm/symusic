// daylong 모임 회비 관리 페이지 — 회원용 읽기 화면(STEP 1) + 관리자 편집(STEP 2).
// - 진입: 음표 메뉴 '모임 → daylong'(오버레이) 또는 /daylong 직접 접속(라우트). SarangbangPage 처럼 양쪽 지원.
//   닫기 = onClose ? onClose() : navigate('/').
// - PIN 게이트: config/daylong.pinHash(SHA-256) 와 입력 해시를 비교. 통과하면 localStorage 'daylong.unlocked' 에
//   해시를 저장해 다음 방문부터 바로 진입. 관리자가 PIN 을 바꾸면(해시 변경) 자동으로 다시 잠긴다.
//   ※ 읽기 규칙이 개방된 소프트 게이트다. 민감 정보는 두지 않는다. 관리자도 PIN 을 동일하게 거친다.
// - 관리자 = useAdminAuth().isAdmin(Firebase 로그인 사용자, 규칙의 request.auth != null 과 같은 기준).
//   관리자 전용 요소는 모두 isAdmin 조건 안에 있어 비관리자 렌더 결과는 STEP 1 과 같다.
//   · 헤더: '관리' 배지 + 설정(톱니) → SettingsDialog(제목·기초 잔액·PIN 변경)
//   · 입출금 내역: '+ 기록 추가', 행 편집·삭제 → TransactionDialog / deleteTransaction(window.confirm)
//   · 월 납입 현황: 빈 셀 → 미리 채운 추가 폼, 금액 셀 → 1건이면 편집, 여러 건이면 내역 탭으로 이동
//   · 세 번째 탭 '회원' → MembersPanel
// - 통과 후: 잔액 카드 + 탭(입출금 내역 / 월 납입 현황 / [관리자] 회원).
//   · 잔액 = (openingBalance ?? 0) + Σ입금 − Σ출금
//   · 월 납입 현황 = 회비 납입 거래(type in + memberId + dueMonth)를 회원×월로 합산. 최근 12개월(이번 달 포함).
// - 데이터 구독(회원·거래)은 PIN 통과 후에만 시작(enabled 플래그).
// - 레이아웃: MinistersPage 헤더 패턴(보라 그라데이션, sticky 헤더, 제목 + 오른쪽 X). 모바일 우선.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, Lock, Wallet, Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useDaylongConfig } from '@/hooks/useDaylongConfig';
import { useDaylongMembers } from '@/hooks/useDaylongMembers';
import { useDaylongTransactions } from '@/hooks/useDaylongTransactions';
import { isDuesPayment, type DaylongMember, type DaylongTransaction } from '@/types/daylong';
import { hashPin, readUnlockedHash, saveUnlockedHash } from '@/utils/daylongStorage';
import { deleteTransaction } from '@/utils/daylongFirestore';
import { TransactionList } from '@/components/daylong/TransactionList';
import { DuesGrid } from '@/components/daylong/DuesGrid';
import { MembersPanel } from '@/components/daylong/MembersPanel';
import { TransactionDialog, type TransactionPrefill } from '@/components/daylong/TransactionDialog';
import { SettingsDialog } from '@/components/daylong/SettingsDialog';
import {
  describeFirestoreError,
  describeReadError,
  formatDate,
  formatMonth,
  formatWon,
  recentMonths,
} from '@/components/daylong/format';

interface DaylongPageProps {
  onClose?: () => void;
}

type DaylongTab = 'transactions' | 'dues' | 'members';

const MONTH_COUNT = 12;

// ── 공통 조각 ────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-purple-200/70">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-3 mt-6 rounded-xl border border-purple-500/30 bg-slate-800/60 px-4 py-6 text-center text-sm text-purple-100/80 sm:mx-4">
      {children}
    </div>
  );
}

const tabTriggerClass =
  'rounded-md py-2 text-sm text-gray-300 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-none';

// ── 페이지 ──────────────────────────────────────────────────

export default function DaylongPage({ onClose }: DaylongPageProps = {}) {
  const navigate = useNavigate();
  const { config, loading: configLoading, error: configError } = useDaylongConfig();
  const { isAdmin } = useAdminAuth();

  // PIN 게이트 상태
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [checking, setChecking] = useState(false);

  // config 가 도착·변경될 때마다 저장된 통과 해시와 비교(해시가 바뀌면 다시 잠김)
  useEffect(() => {
    const hash = config?.pinHash ?? '';
    setUnlocked(!!hash && readUnlockedHash() === hash);
  }, [config?.pinHash]);

  const submitPin = async () => {
    if (checking || pin.length !== 4 || !config?.pinHash) return;
    setChecking(true);
    try {
      const h = await hashPin(pin);
      if (h === config.pinHash) {
        saveUnlockedHash(h);
        setPinError('');
        setPin('');
        setUnlocked(true);
      } else {
        setPinError('비밀번호가 맞지 않습니다');
        setPin('');
      }
    } catch (err) {
      console.error('[DaylongPage] PIN 확인 오류:', err);
      setPinError('확인 중 오류가 발생했습니다. 다시 시도해 주세요.');
      setPin('');
    } finally {
      setChecking(false);
    }
  };

  // 데이터 구독은 통과 후에만
  const { members, loading: membersLoading, error: membersError } = useDaylongMembers(unlocked);
  const { transactions, loading: txLoading, error: txError } = useDaylongTransactions(unlocked);

  const title = config?.title?.trim() || 'daylong';

  // 탭(제어형) — 월 납입 현황 셀에서 내역 탭으로 전환하기 위해. 관리자 해제 시 '회원' 탭에 머물지 않게 한다.
  const [tab, setTab] = useState<DaylongTab>('transactions');
  useEffect(() => {
    if (!isAdmin && tab === 'members') setTab('transactions');
  }, [isAdmin, tab]);

  // 관리자 모달 상태
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<DaylongTransaction | null>(null);
  const [txPrefill, setTxPrefill] = useState<TransactionPrefill | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 잔액
  const balance = useMemo(() => {
    const opening = config?.openingBalance ?? 0;
    return transactions.reduce((acc, t) => acc + (t.type === 'in' ? t.amount : -t.amount), opening);
  }, [config?.openingBalance, transactions]);

  // 회원 id → 이름
  const memberName = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.id, m.name));
    return map;
  }, [members]);

  // 월 납입 현황: `${memberId}|${dueMonth}` → 합계
  const months = useMemo(() => recentMonths(MONTH_COUNT), []);
  const duesByCell = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach((t) => {
      if (!isDuesPayment(t)) return;
      const key = `${t.memberId}|${t.dueMonth}`;
      map.set(key, (map.get(key) ?? 0) + t.amount);
    });
    return map;
  }, [transactions]);
  const activeMembers = useMemo(() => members.filter((m) => m.active), [members]);

  const dataError = membersError ?? txError;
  const dataLoading = membersLoading || txLoading;

  // ── 관리자 핸들러 ──
  const openAddTx = (prefill: TransactionPrefill | null = null) => {
    setEditingTx(null);
    setTxPrefill(prefill);
    setTxDialogOpen(true);
  };
  const openEditTx = (t: DaylongTransaction) => {
    setEditingTx(t);
    setTxPrefill(null);
    setTxDialogOpen(true);
  };

  const handleDeleteTx = async (t: DaylongTransaction) => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (deletingId !== null) return;
    const label = isDuesPayment(t)
      ? `회비 · ${memberName.get(t.memberId!) ?? '(알 수 없음)'} · ${t.dueMonth}`
      : t.memo || (t.type === 'in' ? '입금' : '출금');
    if (
      !window.confirm(
        `이 기록을 삭제할까요?\n\n${formatDate(t.date)} · ${label}\n${t.type === 'in' ? '+' : '−'}${formatWon(t.amount)}\n\n되돌릴 수 없습니다.`,
      )
    )
      return;

    setDeletingId(t.id);
    try {
      await deleteTransaction(t.id);
      toast.success('기록을 삭제했습니다.');
    } catch (error) {
      console.error('❌ [Daylong] 거래 삭제 오류:', error);
      toast.error(describeFirestoreError(error, '기록 삭제 중 오류가 발생했습니다.'));
    } finally {
      setDeletingId(null);
    }
  };

  // 월 납입 현황 셀 탭(관리자): 빈 셀 → 미리 채운 추가, 1건 → 편집, 여러 건 → 내역 탭으로
  const handleDuesCell = (member: DaylongMember, monthKey: string, amount: number) => {
    if (!isAdmin) return;
    if (!amount) {
      openAddTx({ kind: 'dues', memberId: member.id, dueMonth: monthKey });
      return;
    }
    const matches = transactions.filter(
      (t) => isDuesPayment(t) && t.memberId === member.id && t.dueMonth === monthKey,
    );
    if (matches.length === 1) {
      openEditTx(matches[0]);
      return;
    }
    setTab('transactions');
    toast.info(`${member.name} ${formatMonth(monthKey)} 회비 기록이 ${matches.length}건입니다. 입출금 내역에서 선택해 수정하세요.`);
  };

  // ── 본문 분기 ──
  let body: React.ReactNode;
  if (configLoading) {
    body = <Spinner />;
  } else if (configError) {
    body = <Notice>{describeReadError(configError)}</Notice>;
  } else if (!config || !config.pinHash) {
    body = <Notice>아직 준비 중입니다.</Notice>;
  } else if (!unlocked) {
    body = (
      <div className="flex flex-1 items-start justify-center px-4 pt-10">
        <div className="w-full max-w-xs rounded-2xl border border-purple-500/30 bg-slate-800/80 p-5 shadow-lg">
          <h2 className="flex items-center justify-center gap-1.5 text-base font-bold">
            <Lock className="h-4 w-4 text-teal-300" /> 비밀번호
          </h2>
          <p className="mt-1 text-center text-xs text-purple-200/70">모임 회원에게 안내된 4자리 숫자를 입력하세요</p>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            disabled={checking}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
              if (pinError) setPinError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitPin();
            }}
            placeholder="PIN 4자리"
            aria-label="비밀번호 4자리"
            className="mt-3 w-full rounded-xl border border-purple-500/30 bg-slate-900/70 px-3.5 py-3 text-center text-lg tracking-[0.5em] text-white outline-none placeholder:tracking-normal placeholder:text-white/35 focus:border-teal-400/60"
          />
          <p className="mt-2 min-h-[1.25rem] text-center text-xs text-rose-300" role="alert">
            {pinError}
          </p>
          <button
            type="button"
            onClick={() => void submitPin()}
            disabled={checking || pin.length !== 4}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : '확인'}
          </button>
        </div>
      </div>
    );
  } else if (dataError) {
    body = <Notice>{describeReadError(dataError)}</Notice>;
  } else if (dataLoading) {
    body = <Spinner />;
  } else {
    body = (
      <div className="flex flex-1 flex-col gap-3 px-3 pb-8 pt-3 sm:px-4">
        {/* 잔액 카드 */}
        <section className="rounded-xl border border-purple-500/30 bg-slate-800/60 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-purple-200/70">
            <Wallet className="h-3.5 w-3.5" /> 현재 잔액
          </div>
          <div
            className={`mt-1 text-2xl font-bold tabular-nums ${balance < 0 ? 'text-rose-300' : 'text-white'}`}
          >
            {formatWon(balance)}
          </div>
          <div className="mt-0.5 text-[11px] text-purple-200/50">
            기초 잔액 {formatWon(config.openingBalance ?? 0)} · 거래 {transactions.length}건
          </div>
        </section>

        {/* 탭 */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as DaylongTab)} className="w-full">
          <TabsList
            className={`grid h-auto w-full rounded-lg border border-purple-500/30 bg-slate-800/60 p-1 ${
              isAdmin ? 'grid-cols-3' : 'grid-cols-2'
            }`}
          >
            <TabsTrigger value="transactions" className={tabTriggerClass}>
              입출금 내역
            </TabsTrigger>
            <TabsTrigger value="dues" className={tabTriggerClass}>
              월 납입 현황
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="members" className={tabTriggerClass}>
                회원
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="transactions" className="mt-3 space-y-2">
            {isAdmin && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => openAddTx()}
                  className="flex items-center gap-1 rounded-md bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-500"
                >
                  <Plus className="h-4 w-4" /> 기록 추가
                </button>
              </div>
            )}
            <TransactionList
              transactions={transactions}
              memberName={memberName}
              isAdmin={isAdmin}
              onEdit={openEditTx}
              onDelete={(t) => void handleDeleteTx(t)}
              deletingId={deletingId}
            />
          </TabsContent>

          <TabsContent value="dues" className="mt-3 space-y-2">
            {isAdmin && (
              <p className="text-right text-[11px] text-purple-200/60">
                셀을 누르면 회비 기록을 추가·수정할 수 있습니다
              </p>
            )}
            <DuesGrid
              members={activeMembers}
              months={months}
              duesByCell={duesByCell}
              isAdmin={isAdmin}
              onCellClick={handleDuesCell}
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="members" className="mt-3">
              <MembersPanel isAdmin={isAdmin} members={members} transactions={transactions} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'linear-gradient(160deg, #3A0D6E 0%, #4A1290 100%)' }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col">
        {/* 헤더 + 닫기(X) — MinistersPage 패턴. 관리자면 '관리' 배지 + 설정(톱니) */}
        <header className="sticky top-0 z-20 bg-[#3A0D6E]/95 px-3 pt-3 pb-2.5 backdrop-blur-sm sm:px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="min-w-0 truncate text-lg font-bold">{title}</h1>
              {isAdmin && (
                <span className="shrink-0 rounded-full border border-teal-400/40 bg-teal-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-teal-200">
                  관리
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isAdmin && unlocked && config?.pinHash && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="설정"
                  title="설정"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-500/30 bg-slate-800/90 text-white shadow-lg transition-colors hover:bg-slate-700"
                >
                  <Settings className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => (onClose ? onClose() : navigate('/'))}
                aria-label="닫기"
                title="닫기"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-500/30 bg-slate-800/90 text-white shadow-lg transition-colors hover:bg-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {body}
      </div>

      {/* 관리자 모달 — isAdmin 일 때만 마운트 */}
      {isAdmin && (
        <TransactionDialog
          open={txDialogOpen}
          onOpenChange={(v) => {
            setTxDialogOpen(v);
            if (!v) {
              setEditingTx(null);
              setTxPrefill(null);
            }
          }}
          isAdmin={isAdmin}
          members={members}
          editing={editingTx}
          prefill={txPrefill}
        />
      )}
      {isAdmin && config && (
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} isAdmin={isAdmin} config={config} />
      )}
    </div>
  );
}
