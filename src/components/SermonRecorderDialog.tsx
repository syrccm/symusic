// 설교녹음 모달 (관리자 전용, /0691 음표 메뉴 → "🎙️ 설교녹음")
// - 녹음 자체는 별도 리포(syrccm/symusic-recorder)의 GitHub Actions 가 한다. 이 모달은 api/rec/* 로 시작·정지를 요청하고
//   R2 비공개 버킷의 녹음 목록을 보여 준다. 키(GitHub PAT·R2)는 전부 서버에만 있고 여기서는 Firebase ID 토큰만 보낸다.
// - 모든 호출은 현재 로그인 사용자의 ID 토큰을 Authorization 헤더로 붙인다. 서버가 UID 허용 목록(REC_ADMIN_UIDS)으로
//   다시 거른다. 401 → "로그인이 만료되었습니다…"(토큰 문제), 403 → "녹음 관리 권한이 없습니다 (…허용 목록에 없습니다)"
//   (로그인만 되어 있고 목록에 없는 계정). 문구는 DENIED_MESSAGES.
// - 상태는 모달이 열려 있는 동안만 10초마다 status 를 폴링한다. 권한 오류가 나면 폴링을 멈춘다(denied).
// - 시작 직후에는 GitHub 에 실행이 잡히기까지 몇 초~수십 초 걸린다 → pending 으로 "시작하는 중"을 보여 주고,
//   같은 세션의 실행이 목록에 보이면(또는 PENDING_MS 가 지나면) pending 을 지운다.
// - 종료는 리포 변수에 세션 id 를 써넣는 방식이라 러너가 읽고(최대 10초) 마감·업로드하는 데 1~2분 걸린다.
//   진행 중이던 실행이 끝나면 목록을 다시 읽는다.
// - 다운로드: download API 가 준 10분짜리 presigned URL 로 이동한다(응답이 attachment 라 화면은 바뀌지 않고 저장된다).
// - 예약: 녹음 리포의 발사기(dispatcher)가 R2 의 reservations.json 을 10분마다 읽어 때가 된 녹음을 띄운다.
//   이 모달은 발사기가 써 둔 예정 라이브 목록(upcoming)을 보여 주고 예약을 추가·삭제한다(형식·검증은 api/rec/reservations.ts).
//   upcoming·reservations 는 모달을 열 때와 예약을 바꾼 뒤에만 읽는다(10초 폴링은 status 만).
//   status 의 current(대기/녹음 단계)는 서버가 진행 중인 실행의 세션과 같을 때만 돌려준다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Loader2, Mic, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '@/lib/firebase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SermonRecorderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}

interface RecRun {
  id: number;
  status: string;
  conclusion: string | null;
  startedAt: string;
  runUrl: string;
  sessionId: string | null;
  title: string;
}

interface RecItem {
  key: string;
  title: string;
  startedAt: string;
  durationSec: number;
  bytes: number;
  sessionId: string;
}

/** 진행 중인 녹음의 단계(state/current.json) */
interface RecCurrent {
  phase: 'waiting' | 'recording';
  session_id: string;
  title: string;
  video_id: string | null;
}

interface UpcomingItem {
  video_id: string;
  title: string;
  scheduled_at: string | null;
  status: 'upcoming' | 'live';
}

interface Reservation {
  id: string;
  kind: 'video' | 'weekly';
  title: string;
  video_id: string | null;
  scheduled_at: string | null;
  weekday: number | null;
  time: string | null;
  dispatched_at: string | null;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const UPCOMING_STALE_MS = 2 * 60 * 60 * 1000; // 발사기는 10분마다 목록을 갱신한다. 2시간 넘게 그대로면 발사기를 확인해야 한다
const UPCOMING_TITLE_MAX = 40;
// 예약 값 — video: 예정 30분 전부터 실행, weekly: 10분 전부터 실행하고 예정 시각 뒤 90분까지 라이브 시작을 기다린다.
const VIDEO_LEAD_MINUTES = 30;
const WEEKLY_LEAD_MINUTES = 10;
const WEEKLY_WAIT_MINUTES = 90;
const DEFAULT_MAX_MINUTES = 150;
const WEEKLY_MAX_LIMIT = 330 - WEEKLY_LEAD_MINUTES - WEEKLY_WAIT_MINUTES; // 러너 제한: 대기 + 녹음 330분
const POLL_MS = 10_000;
const PENDING_MS = 90_000;
const STOP_WAIT_MS = 180_000; // 종료 요청 후 이 시간이 지나도 안 끝나면 다시 누를 수 있게 한다
const TITLE_MAX = 100;
// 권한 오류 문구 — 401(로그인 문제)과 403(허용 목록에 없음)을 구분해 원인을 알 수 있게 한다.
const DENIED_MESSAGES: Record<number, string> = {
  401: '로그인이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요.',
  403: '녹음 관리 권한이 없습니다 (이 계정이 허용 목록에 없습니다)',
};

class RecApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 권한 오류(401/403)면 그 상태에 맞는 문구, 아니면 null */
const deniedMessage = (error: unknown): string | null =>
  error instanceof RecApiError ? (DENIED_MESSAGES[error.status] ?? null) : null;
const isDenied = (error: unknown) => deniedMessage(error) !== null;

/** api/rec/* 호출. 현재 로그인 사용자의 ID 토큰을 붙이고, 실패하면 RecApiError 를 던진다. */
async function recFetch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new RecApiError(401, '');
  const token = await user.getIdToken();
  const res = await fetch(`/api/rec/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || data === null) {
    throw new RecApiError(res.ok ? 500 : res.status, data?.error || '');
  }
  return data;
}

/** 초 → "1:02:03" / "2:03" */
function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '-';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}MB` : `${Math.ceil(bytes / 1024)}KB`;
}

/** 사이드카의 startedAt("2026-11-22T10:55:03+09:00", KST)을 글자 그대로 잘라 날짜·시간으로 쓴다(기기 시간대와 무관). */
function splitStartedAt(startedAt: string): { date: string; time: string } {
  return { date: startedAt.slice(0, 10) || '-', time: startedAt.slice(11, 16) || '-' };
}

export function SermonRecorderDialog({ open, onOpenChange, isAdmin }: SermonRecorderDialogProps) {
  const [runs, setRuns] = useState<RecRun[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [items, setItems] = useState<RecItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null); // 권한 오류 문구(없으면 null)
  const [title, setTitle] = useState('');
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [pending, setPending] = useState<{ sessionId: string; at: number } | null>(null); // 시작 요청 후 실행이 잡히기 전
  const [stopRequested, setStopRequested] = useState<{ sessionId: string; at: number } | null>(null); // 종료를 요청한 세션
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState<RecCurrent | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [upcomingStale, setUpcomingStale] = useState(false);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // 저장 중인 예약 동작(add:{video_id} / del:{id} / weekly)
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [weeklyDay, setWeeklyDay] = useState(0);
  const [weeklyTime, setWeeklyTime] = useState('11:00');
  const [weeklyTitle, setWeeklyTitle] = useState('');
  const [weeklyMax, setWeeklyMax] = useState(String(DEFAULT_MAX_MINUTES));
  const deniedToastShown = useRef(false);
  const wasActive = useRef(false);
  const reservationsSeq = useRef(0); // 예약 목록 응답 순번 — 늦게 도착한 옛 조회가 최신 목록을 덮어쓰지 않게 한다

  // 권한 오류는 토스트를 한 번만 띄우고(폴링마다 반복하지 않게) 폴링을 멈춘다.
  const handleError = useCallback((error: unknown, fallback: string) => {
    const message = deniedMessage(error);
    if (message) {
      setDenied(message);
      if (!deniedToastShown.current) {
        deniedToastShown.current = true;
        toast.error(message);
      }
      return;
    }
    console.error('❌ [Recorder]', error);
    toast.error((error instanceof RecApiError && error.message) || fallback);
  }, []);

  const loadStatus = useCallback(
    async (silent: boolean) => {
      try {
        const data = await recFetch<{ runs: RecRun[]; current?: RecCurrent | null }>('status');
        setRuns(Array.isArray(data.runs) ? data.runs : []);
        setCurrent(data.current ?? null);
      } catch (error) {
        // 폴링 중 일시 오류는 조용히 넘긴다(다음 주기에 다시 시도). 권한 오류만 항상 처리.
        if (!silent || isDenied(error)) handleError(error, '녹음 상태를 불러오지 못했어요.');
      } finally {
        setStatusLoading(false);
      }
    },
    [handleError],
  );

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await recFetch<{ items: RecItem[] }>('list');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      handleError(error, '녹음 목록을 불러오지 못했어요.');
    } finally {
      setListLoading(false);
    }
  }, [handleError]);

  const loadUpcoming = useCallback(async () => {
    setUpcomingLoading(true);
    try {
      const data = await recFetch<{ updated_at: string | null; items: UpcomingItem[] }>('upcoming');
      // 시각순. 예정 시각을 모르는 항목은 맨 뒤.
      const at = (item: UpcomingItem) => (item.scheduled_at ? Date.parse(item.scheduled_at) : NaN);
      const order = (item: UpcomingItem) => (Number.isFinite(at(item)) ? at(item) : Infinity);
      setUpcoming((Array.isArray(data.items) ? [...data.items] : []).sort((a, b) => order(a) - order(b)));
      const updatedMs = data.updated_at ? Date.parse(data.updated_at) : NaN;
      setUpcomingStale(Number.isFinite(updatedMs) && Date.now() - updatedMs > UPCOMING_STALE_MS);
    } catch (error) {
      handleError(error, '예정된 라이브 목록을 불러오지 못했어요.');
    } finally {
      setUpcomingLoading(false);
    }
  }, [handleError]);

  const loadReservations = useCallback(
    async (silent: boolean) => {
      if (!silent) setReservationsLoading(true);
      const seq = (reservationsSeq.current += 1);
      try {
        const data = await recFetch<{ items: Reservation[] }>('reservations');
        // 그 사이 더 새로운 조회·저장이 있었으면 이 응답은 버린다.
        if (seq === reservationsSeq.current) setReservations(Array.isArray(data.items) ? data.items : []);
      } catch (error) {
        if (!silent || isDenied(error)) handleError(error, '예약 목록을 불러오지 못했어요.');
      } finally {
        setReservationsLoading(false);
      }
    },
    [handleError],
  );

  // 모달을 열 때 상태·목록을 읽는다. 닫았다 다시 열면 권한 오류 상태도 초기화(다른 계정으로 다시 로그인했을 수 있으므로).
  useEffect(() => {
    if (!open || !isAdmin) return;
    setDenied(null);
    deniedToastShown.current = false;
    setStatusLoading(true);
    void loadStatus(false);
    void loadList();
    void loadUpcoming();
    void loadReservations(false);
  }, [open, isAdmin, loadStatus, loadList, loadUpcoming, loadReservations]);

  // 10초 폴링 — 모달이 열려 있고 권한 오류가 없을 때만.
  useEffect(() => {
    if (!open || !isAdmin || denied) return;
    const timer = window.setInterval(() => void loadStatus(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, isAdmin, denied, loadStatus]);

  // 실행이 2건(녹음 중 + 대기)일 수 있으므로 실제로 녹음 중인 실행을 먼저 잡는다 — 종료 신호가 대기 실행으로 가지 않게.
  const activeRun =
    runs.find((run) => run.status === 'in_progress') ?? runs.find((run) => run.status !== 'completed') ?? null;
  const pendingAlive = pending !== null && now - pending.at < PENDING_MS;
  const isRecording = activeRun !== null || pendingAlive;
  const sessionId = activeRun?.sessionId ?? (pendingAlive ? pending.sessionId : null);
  // 예약 녹음은 라이브가 시작되기 전에 실행돼 기다린다. 그 단계는 서버가 준 current 로 구분한다(대기 중이 아니면 null).
  const waitingTitle =
    current !== null && current.session_id === sessionId && current.phase === 'waiting' ? current.title : null;

  // 경과 시간 표시용 1초 시계 — 녹음 중일 때만 돈다.
  useEffect(() => {
    if (!open || !isRecording) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, isRecording]);

  // 시작 요청한 세션의 실행이 목록에 보이면 pending 을 지운다.
  useEffect(() => {
    if (pending && runs.some((run) => run.sessionId === pending.sessionId)) setPending(null);
  }, [pending, runs]);

  // 진행 중이던 실행이 끝나면 종료 요청 표시를 지우고 목록을 다시 읽는다.
  // 실행이 시작되거나 끝나면 예약 목록도 다시 읽는다(발사기가 띄운 예약이 "발사됨"으로 바뀐다).
  useEffect(() => {
    const active = activeRun !== null;
    if (wasActive.current !== active) void loadReservations(true);
    if (wasActive.current && !active) {
      setStopRequested(null);
      void loadList();
    }
    wasActive.current = active;
  }, [activeRun, loadList, loadReservations]);

  // live 를 주면 예정된 라이브 목록의 그 영상을 바로 녹음한다("지금 녹음"). 없으면 제목 입력란의 값으로 채널 라이브를 녹음한다.
  const handleStart = async (live?: UpcomingItem) => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (starting || isRecording) return;

    setStarting(true);
    try {
      const data = await recFetch<{ session_id: string }>(
        'start',
        live ? { title: live.title.slice(0, TITLE_MAX), video_id: live.video_id } : { title: title.trim() },
      );
      setPending({ sessionId: data.session_id, at: Date.now() });
      setStopRequested(null);
      setTitle('');
      toast.success('녹음을 시작했습니다. 실제 녹음은 1분 안에 시작돼요.');
      window.setTimeout(() => void loadStatus(true), 4000);
    } catch (error) {
      if (error instanceof RecApiError && error.status === 409) {
        // 예약(발사기)이 띄운 녹음이면 서버가 "예약 녹음이 진행 중입니다." 를 보낸다.
        toast.error(error.message || '이미 진행 중인 녹음이 있습니다.');
        void loadStatus(true);
      } else {
        handleError(error, '녹음을 시작하지 못했어요.');
      }
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (!sessionId) {
      toast.error('세션 정보를 아직 읽지 못했어요. 잠시 후 다시 눌러 주세요.');
      return;
    }
    if (stopping) return;
    // 대기 단계에서 멈추면 발사기는 그 예약을 이미 처리한 것으로 보고 다시 띄우지 않는다.
    const message = waitingTitle !== null ? '대기를 취소할까요? 이번 예약은 녹음되지 않습니다.' : '녹음을 종료할까요?';
    if (!window.confirm(message)) return;

    setStopping(true);
    try {
      await recFetch<{ ok: boolean }>('stop', { session_id: sessionId });
      setStopRequested({ sessionId, at: Date.now() });
      toast.success('종료를 요청했습니다. 마감·업로드까지 1~2분 걸려요.');
    } catch (error) {
      handleError(error, '녹음 종료 요청을 보내지 못했어요.');
    } finally {
      setStopping(false);
    }
  };

  /** 예약 추가·삭제. 서버가 저장한 뒤의 목록을 돌려준다. 성공하면 true. */
  const mutateReservations = async (key: string, body: Record<string, unknown>, done: string, fallback: string) => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return false;
    }
    if (busy) return false;
    setBusy(key);
    try {
      const data = await recFetch<{ items: Reservation[] }>('reservations', body);
      reservationsSeq.current += 1; // 저장 전에 출발한 조회의 응답은 버린다
      setReservations(Array.isArray(data.items) ? data.items : []);
      toast.success(done);
      // 발사기가 같은 순간에 파일을 쓰면 한쪽 변경이 사라질 수 있다 → 잠시 뒤 실제 저장된 목록을 다시 읽어 보여 준다.
      window.setTimeout(() => void loadReservations(true), 5000);
      return true;
    } catch (error) {
      handleError(error, fallback);
      void loadReservations(true); // 중복·동시 수정으로 거부됐을 수 있다 → 화면을 실제 목록에 맞춘다
      return false;
    } finally {
      setBusy(null);
    }
  };

  const handleReserve = (item: UpcomingItem) => {
    if (!item.scheduled_at) return;
    void mutateReservations(
      `add:${item.video_id}`,
      {
        action: 'add',
        item: {
          kind: 'video',
          video_id: item.video_id,
          title: item.title.slice(0, TITLE_MAX),
          scheduled_at: item.scheduled_at,
          lead_minutes: VIDEO_LEAD_MINUTES,
          max_minutes: DEFAULT_MAX_MINUTES,
        },
      },
      '예약했습니다.',
      '예약하지 못했어요.',
    );
  };

  const handleRemove = (reservation: Reservation) => {
    if (busy) return;
    const message = reservation.dispatched_at
      ? '이미 실행된 예약입니다. 같은 예배의 반복 예약이 있으면 한 번 더 녹음될 수 있어요. 삭제할까요?'
      : '이 예약을 삭제할까요?';
    if (!window.confirm(message)) return;
    void mutateReservations(
      `del:${reservation.id}`,
      { action: 'remove', id: reservation.id },
      '예약을 삭제했습니다.',
      '예약을 삭제하지 못했어요.',
    );
  };

  const handleAddWeekly = async () => {
    const max = Number(weeklyMax);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(weeklyTime)) {
      toast.error('시각을 입력해 주세요.');
      return;
    }
    if (!Number.isInteger(max) || max < 10 || max > WEEKLY_MAX_LIMIT) {
      toast.error(`최대 녹음 시간은 10~${WEEKLY_MAX_LIMIT}분 사이로 입력해 주세요.`);
      return;
    }
    const ok = await mutateReservations(
      'weekly',
      {
        action: 'add',
        item: {
          kind: 'weekly',
          weekday: weeklyDay,
          time: weeklyTime,
          title: weeklyTitle.trim(),
          lead_minutes: WEEKLY_LEAD_MINUTES,
          wait_minutes: WEEKLY_WAIT_MINUTES,
          max_minutes: max,
        },
      },
      '반복 예약을 추가했습니다.',
      '반복 예약을 추가하지 못했어요.',
    );
    if (ok) {
      setWeeklyTitle('');
      setWeeklyOpen(false);
    }
  };

  const handleDownload = async (key: string) => {
    if (downloadingKey) return;
    setDownloadingKey(key);
    try {
      const data = await recFetch<{ url: string }>(`download?key=${encodeURIComponent(key)}`);
      // 응답이 Content-Disposition: attachment 라 현재 화면을 떠나지 않고 저장된다.
      // (await 뒤의 window.open 은 iOS Safari 에서 팝업 차단되므로 같은 탭 이동을 쓴다)
      window.location.assign(data.url);
    } catch (error) {
      handleError(error, '다운로드 주소를 만들지 못했어요.');
    } finally {
      setDownloadingKey(null);
    }
  };

  const startedMs = activeRun ? Date.parse(activeRun.startedAt) : NaN;
  const elapsed = Number.isFinite(startedMs) ? formatDuration((now - startedMs) / 1000) : null;
  const stopForThis = stopRequested !== null && stopRequested.sessionId === sessionId;
  const stopSent = stopForThis && now - stopRequested.at < STOP_WAIT_MS;
  const stopStale = stopForThis && !stopSent; // 종료를 요청했는데 러너가 반응하지 않음
  const lastRun = runs[0] ?? null;
  const reservedVideoIds = new Set(reservations.filter((r) => r.kind === 'video').map((r) => r.video_id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Mic className="w-5 h-5 text-purple-300" />
            설교녹음
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            유튜브 라이브를 서버에서 mp3 로 녹음합니다. 이 창을 닫아도 녹음은 계속돼요.
          </DialogDescription>
        </DialogHeader>

        {denied ? (
          <p className="py-6 text-center text-sm text-rose-300">{denied}</p>
        ) : (
          <div className="space-y-5">
            {/* 현재 상태 */}
            <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
              {statusLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-300" />
                </div>
              ) : isRecording ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-red-500 animate-pulse" />
                    <p className="min-w-0 text-sm text-white">
                      {stopSent
                        ? '종료하는 중…'
                        : activeRun?.status === 'in_progress'
                          ? waitingTitle !== null
                            ? `라이브 시작을 기다리는 중${waitingTitle ? ` · ${waitingTitle}` : ''}`
                            : '녹음 중'
                          : '시작하는 중…'}
                    </p>
                    {elapsed && <span className="ml-auto flex-shrink-0 font-mono text-sm text-gray-200">{elapsed}</span>}
                  </div>
                  <div className="space-y-0.5 text-[11px] text-gray-400">
                    {activeRun?.title && !waitingTitle && <p className="text-xs text-gray-200">{activeRun.title}</p>}
                    <p>
                      세션 <span className="font-mono">{sessionId ?? '확인 중'}</span>
                    </p>
                    {stopStale && (
                      <p className="text-rose-300">종료가 아직 반영되지 않았습니다. 다시 눌러 주세요.</p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => void handleStop()}
                      disabled={stopping || stopSent || !sessionId}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {stopping ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Square className="w-3.5 h-3.5 mr-1.5" />
                          녹음 종료
                        </>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="rec-title" className="text-white text-xs">
                      제목 (선택)
                    </Label>
                    <Input
                      id="rec-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="예: 주일 2부 예배"
                      maxLength={TITLE_MAX}
                      disabled={starting}
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 text-[11px] text-gray-500">
                      {lastRun?.conclusion && lastRun.conclusion !== 'success'
                        ? `직전 녹음이 정상 종료되지 않았습니다 (${lastRun.conclusion})`
                        : '진행 중인 녹음이 없습니다'}
                    </p>
                    <Button
                      type="button"
                      onClick={() => void handleStart()}
                      disabled={starting}
                      className="flex-shrink-0 bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {starting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5 mr-1.5" />
                          녹음 시작
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* 예정된 라이브 */}
            <div className="space-y-2">
              <p className="text-sm text-white">예정된 라이브</p>
              {upcomingStale && (
                <p className="text-[11px] text-amber-300">목록이 오래됐습니다(발사기 확인 필요)</p>
              )}
              {upcomingLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-300" />
                </div>
              ) : upcoming.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">예정된 라이브가 없습니다.</p>
              ) : (
                <ul className="space-y-1.5">
                  {upcoming.map((item) => {
                    const live = item.status === 'live';
                    const { date, time } = splitStartedAt(item.scheduled_at ?? '');
                    const reserved = reservedVideoIds.has(item.video_id);
                    // 지금 녹음(대기 포함) 중인 영상은 예약하지 않는다 — 녹음이 끝난 뒤 한 번 더 실행된다.
                    const recordingThis = current !== null && current.video_id === item.video_id;
                    return (
                      <li
                        key={item.video_id}
                        className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-white">
                            {item.title.slice(0, UPCOMING_TITLE_MAX) || '(제목 없음)'}
                          </p>
                          <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
                            <span
                              className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                                live ? 'bg-red-500/20 text-red-300' : 'bg-slate-700 text-gray-300'
                              }`}
                            >
                              {live ? '진행 중' : '예정'}
                            </span>
                            {item.scheduled_at ? `${date} ${time}` : '시각 미정'}
                          </p>
                        </div>
                        {live ? (
                          <Button
                            type="button"
                            onClick={() => void handleStart(item)}
                            disabled={starting || isRecording}
                            className="flex-shrink-0 bg-purple-600 hover:bg-purple-700 text-white h-8 px-2.5 text-xs"
                          >
                            지금 녹음
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            onClick={() => handleReserve(item)}
                            disabled={reserved || recordingThis || busy !== null || !item.scheduled_at}
                            className="flex-shrink-0 bg-slate-700 hover:bg-slate-600 text-white h-8 px-2.5 text-xs"
                          >
                            {busy === `add:${item.video_id}` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : reserved ? (
                              '예약됨'
                            ) : recordingThis ? (
                              '녹음 중'
                            ) : (
                              '예약'
                            )}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* 예약 목록 */}
            <div className="space-y-2">
              <p className="text-sm text-white">예약 목록</p>
              {reservationsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-300" />
                </div>
              ) : reservations.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">예약이 없습니다.</p>
              ) : (
                <ul className="space-y-1.5">
                  {reservations.map((reservation) => {
                    const { date, time } = splitStartedAt(reservation.scheduled_at ?? '');
                    const weekly = reservation.kind === 'weekly';
                    return (
                      <li
                        key={reservation.id}
                        className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-white">
                            {weekly
                              ? `매주 ${WEEKDAYS[reservation.weekday ?? -1] ?? '?'} ${reservation.time ?? '-'} · ${reservation.title || '(제목 없음)'}`
                              : reservation.title || '(제목 없음)'}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {weekly
                              ? '반복 예약'
                              : `예정 ${date} ${time} · ${reservation.dispatched_at ? '발사됨' : '대기 중'}`}
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={() => handleRemove(reservation)}
                          disabled={busy !== null}
                          aria-label="예약 삭제"
                          className="flex-shrink-0 bg-slate-700 hover:bg-slate-600 text-white h-8 px-2.5 text-xs"
                        >
                          {busy === `del:${reservation.id}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="w-3.5 h-3.5 mr-1" />
                              삭제
                            </>
                          )}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* 반복 예약 추가 (접이식) */}
            <div className="rounded-lg border border-slate-700 bg-slate-900/40">
              <button
                type="button"
                onClick={() => setWeeklyOpen((value) => !value)}
                aria-expanded={weeklyOpen}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-white"
              >
                반복 예약 추가
                <ChevronDown className={`w-4 h-4 transition-transform ${weeklyOpen ? 'rotate-180' : ''}`} />
              </button>
              {weeklyOpen && (
                <div className="space-y-3 border-t border-slate-700 p-3">
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((label, day) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setWeeklyDay(day)}
                        aria-pressed={weeklyDay === day}
                        className={`h-8 rounded text-xs ${
                          weeklyDay === day ? 'bg-purple-600 text-white' : 'bg-slate-700 text-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="rec-weekly-time" className="text-white text-xs">
                        시각
                      </Label>
                      <Input
                        id="rec-weekly-time"
                        type="time"
                        value={weeklyTime}
                        onChange={(e) => setWeeklyTime(e.target.value)}
                        disabled={busy !== null}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rec-weekly-max" className="text-white text-xs">
                        최대 녹음 (분)
                      </Label>
                      <Input
                        id="rec-weekly-max"
                        type="number"
                        inputMode="numeric"
                        min={10}
                        max={WEEKLY_MAX_LIMIT}
                        value={weeklyMax}
                        onChange={(e) => setWeeklyMax(e.target.value)}
                        disabled={busy !== null}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rec-weekly-title" className="text-white text-xs">
                      제목 (선택)
                    </Label>
                    <Input
                      id="rec-weekly-title"
                      value={weeklyTitle}
                      onChange={(e) => setWeeklyTitle(e.target.value)}
                      placeholder="예: 주일 2부 예배"
                      maxLength={TITLE_MAX}
                      disabled={busy !== null}
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => void handleAddWeekly()}
                      disabled={busy !== null}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {busy === 'weekly' ? <Loader2 className="w-4 h-4 animate-spin" /> : '반복 예약 추가'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* 녹음 목록 */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-white">녹음 목록</p>
                <p className="text-[11px] text-gray-500">파일은 7일 뒤 자동 삭제됩니다</p>
              </div>
              {listLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-300" />
                </div>
              ) : items.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-400">아직 녹음된 파일이 없습니다.</p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((item) => {
                    const { date, time } = splitStartedAt(item.startedAt);
                    return (
                      <li
                        key={item.key}
                        className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-white">{item.title || '(제목 없음)'}</p>
                          <p className="text-[11px] text-gray-400">
                            {date} {time} · {formatDuration(item.durationSec)} · {formatBytes(item.bytes)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={() => void handleDownload(item.key)}
                          disabled={downloadingKey !== null}
                          className="flex-shrink-0 bg-slate-700 hover:bg-slate-600 text-white h-8 px-2.5 text-xs"
                        >
                          {downloadingKey === item.key ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5 mr-1" />
                              다운로드
                            </>
                          )}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
