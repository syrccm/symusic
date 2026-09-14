// daylong 모임 회비 관리 페이지 — 회원용 읽기 화면(STEP 1). 관리자 편집(CRUD)은 다음 단계.
// - 진입: 음표 메뉴 '모임 → daylong'(오버레이) 또는 /daylong 직접 접속(라우트). SarangbangPage 처럼 양쪽 지원.
//   닫기 = onClose ? onClose() : navigate('/').
// - PIN 게이트: config/daylong.pinHash(SHA-256) 와 입력 해시를 비교. 통과하면 localStorage 'daylong.unlocked' 에
//   해시를 저장해 다음 방문부터 바로 진입. 관리자가 PIN 을 바꾸면(해시 변경) 자동으로 다시 잠긴다.
//   ※ 읽기 규칙이 개방된 소프트 게이트다. 민감 정보는 두지 않는다.
// - 통과 후: 잔액 카드 + 탭 2개(입출금 내역 / 월 납입 현황).
//   · 잔액 = (openingBalance ?? 0) + Σ입금 − Σ출금
//   · 월 납입 현황 = 회비 납입 거래(type in + memberId + dueMonth)를 회원×월로 합산. 최근 12개월(이번 달 포함).
// - 데이터 구독(회원·거래)은 PIN 통과 후에만 시작(enabled 플래그).
// - 레이아웃: MinistersPage 헤더 패턴(보라 그라데이션, sticky 헤더, 제목 + 오른쪽 X). 모바일 우선.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, Lock, Wallet } from 'lucide-react';
import type { FirestoreError } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDaylongConfig } from '@/hooks/useDaylongConfig';
import { useDaylongMembers } from '@/hooks/useDaylongMembers';
import { useDaylongTransactions } from '@/hooks/useDaylongTransactions';
import { isDuesPayment, type DaylongMember, type DaylongTransaction } from '@/types/daylong';
import { hashPin, readUnlockedHash, saveUnlockedHash } from '@/utils/daylongStorage';

interface DaylongPageProps {
  onClose?: () => void;
}

const MONTH_COUNT = 12;

// ── 표시 유틸 ────────────────────────────────────────────────

function formatWon(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 'YYYY-MM-DD' → 'YY.MM.DD'. 형식이 다르면 원문 그대로. */
function formatDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : date || '-';
}

interface MonthCol {
  key: string; // 'YYYY-MM'
  label: string; // 올해는 'M월', 다른 해는 'YY.MM'
  isCurrent: boolean;
}

/** 이번 달을 포함한 최근 N개월, 오래된 → 최신 순. */
function recentMonths(count: number, now = new Date()): MonthCol[] {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const cols: MonthCol[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - i, 1);
    const yy = d.getFullYear();
    const mm = d.getMonth() + 1;
    const mm2 = String(mm).padStart(2, '0');
    cols.push({
      key: `${yy}-${mm2}`,
      label: yy === y ? `${mm}월` : `${String(yy).slice(2)}.${mm2}`,
      isCurrent: i === 0,
    });
  }
  return cols;
}

/** Firestore 오류 → 사용자 안내 문구 (MusicPlayer 의 permission-denied/unavailable 매핑과 동일 톤). */
function describeError(err: FirestoreError): string {
  if (err.code === 'permission-denied') return '접근 권한 설정이 필요합니다. 관리자에게 문의하세요.';
  if (err.code === 'unavailable') return 'Firebase 서버에 연결할 수 없습니다. 네트워크를 확인하세요.';
  return `불러오는 중 오류가 발생했습니다. ${err.message}`;
}

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

// ── 페이지 ──────────────────────────────────────────────────

export default function DaylongPage({ onClose }: DaylongPageProps = {}) {
  const navigate = useNavigate();
  const { config, loading: configLoading, error: configError } = useDaylongConfig();

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

  // ── 본문 분기 ──
  let body: React.ReactNode;
  if (configLoading) {
    body = <Spinner />;
  } else if (configError) {
    body = <Notice>{describeError(configError)}</Notice>;
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
    body = <Notice>{describeError(dataError)}</Notice>;
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
        <Tabs defaultValue="transactions" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-lg border border-purple-500/30 bg-slate-800/60 p-1">
            <TabsTrigger
              value="transactions"
              className="rounded-md py-2 text-sm text-gray-300 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-none"
            >
              입출금 내역
            </TabsTrigger>
            <TabsTrigger
              value="dues"
              className="rounded-md py-2 text-sm text-gray-300 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-none"
            >
              월 납입 현황
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="mt-3">
            <TransactionList transactions={transactions} memberName={memberName} />
          </TabsContent>

          <TabsContent value="dues" className="mt-3">
            <DuesGrid members={activeMembers} months={months} duesByCell={duesByCell} />
          </TabsContent>
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
        {/* 헤더 + 닫기(X) — MinistersPage 패턴 */}
        <header className="sticky top-0 z-20 bg-[#3A0D6E]/95 px-3 pt-3 pb-2.5 backdrop-blur-sm sm:px-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-lg font-bold">{title}</h1>
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
        </header>

        {body}
      </div>
    </div>
  );
}

// ── 입출금 내역 ─────────────────────────────────────────────

function TransactionList({
  transactions,
  memberName,
}: {
  transactions: DaylongTransaction[];
  memberName: Map<string, string>;
}) {
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
          </li>
        );
      })}
    </ul>
  );
}

// ── 월 납입 현황 ─────────────────────────────────────────────

function DuesGrid({
  members,
  months,
  duesByCell,
}: {
  members: DaylongMember[];
  months: MonthCol[];
  duesByCell: Map<string, number>;
}) {
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
                const amount = duesByCell.get(`${member.id}|${m.key}`);
                return (
                  <td
                    key={m.key}
                    className={`px-2 py-2 text-right tabular-nums ${
                      amount ? 'text-emerald-300' : 'text-white/25'
                    } ${m.isCurrent ? 'bg-teal-500/5' : ''}`}
                  >
                    {amount ? amount.toLocaleString('ko-KR') : '−'}
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
