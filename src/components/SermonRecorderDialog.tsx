// 설교녹음 모달 (관리자 전용, /0691 음표 메뉴 → "🎙️ 설교녹음")
// - 녹음 자체는 별도 리포(syrccm/symusic-recorder)의 GitHub Actions 가 한다. 이 모달은 api/rec/* 로 시작·정지를 요청하고
//   R2 비공개 버킷의 녹음 목록을 보여 준다. 키(GitHub PAT·R2)는 전부 서버에만 있고 여기서는 Firebase ID 토큰만 보낸다.
// - 모든 호출은 현재 로그인 사용자의 ID 토큰을 Authorization 헤더로 붙인다. 서버가 UID 허용 목록(REC_ADMIN_UIDS)으로
//   다시 거르므로, 로그인만 되어 있고 목록에 없는 계정은 401/403 → "녹음 관리 권한이 없습니다".
// - 상태는 모달이 열려 있는 동안만 10초마다 status 를 폴링한다. 권한 오류가 나면 폴링을 멈춘다(denied).
// - 시작 직후에는 GitHub 에 실행이 잡히기까지 몇 초~수십 초 걸린다 → pending 으로 "시작하는 중"을 보여 주고,
//   같은 세션의 실행이 목록에 보이면(또는 PENDING_MS 가 지나면) pending 을 지운다.
// - 종료는 리포 변수에 세션 id 를 써넣는 방식이라 러너가 읽고(최대 10초) 마감·업로드하는 데 1~2분 걸린다.
//   진행 중이던 실행이 끝나면 목록을 다시 읽는다.
// - 다운로드: download API 가 준 10분짜리 presigned URL 로 이동한다(응답이 attachment 라 화면은 바뀌지 않고 저장된다).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Mic, Square } from 'lucide-react';
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

const POLL_MS = 10_000;
const PENDING_MS = 90_000;
const STOP_WAIT_MS = 180_000; // 종료 요청 후 이 시간이 지나도 안 끝나면 다시 누를 수 있게 한다
const TITLE_MAX = 100;
const DENIED_MESSAGE = '녹음 관리 권한이 없습니다';

class RecApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const isDenied = (error: unknown) => error instanceof RecApiError && (error.status === 401 || error.status === 403);

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
  const [denied, setDenied] = useState(false);
  const [title, setTitle] = useState('');
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [pending, setPending] = useState<{ sessionId: string; at: number } | null>(null); // 시작 요청 후 실행이 잡히기 전
  const [stopRequested, setStopRequested] = useState<{ sessionId: string; at: number } | null>(null); // 종료를 요청한 세션
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const deniedToastShown = useRef(false);
  const wasActive = useRef(false);

  // 권한 오류는 토스트를 한 번만 띄우고(폴링마다 반복하지 않게) 폴링을 멈춘다.
  const handleError = useCallback((error: unknown, fallback: string) => {
    if (isDenied(error)) {
      setDenied(true);
      if (!deniedToastShown.current) {
        deniedToastShown.current = true;
        toast.error(DENIED_MESSAGE);
      }
      return;
    }
    console.error('❌ [Recorder]', error);
    toast.error((error instanceof RecApiError && error.message) || fallback);
  }, []);

  const loadStatus = useCallback(
    async (silent: boolean) => {
      try {
        const data = await recFetch<{ runs: RecRun[] }>('status');
        setRuns(Array.isArray(data.runs) ? data.runs : []);
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

  // 모달을 열 때 상태·목록을 읽는다. 닫았다 다시 열면 권한 오류 상태도 초기화(다른 계정으로 다시 로그인했을 수 있으므로).
  useEffect(() => {
    if (!open || !isAdmin) return;
    setDenied(false);
    deniedToastShown.current = false;
    setStatusLoading(true);
    void loadStatus(false);
    void loadList();
  }, [open, isAdmin, loadStatus, loadList]);

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
  useEffect(() => {
    const active = activeRun !== null;
    if (wasActive.current && !active) {
      setStopRequested(null);
      void loadList();
    }
    wasActive.current = active;
  }, [activeRun, loadList]);

  const handleStart = async () => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (starting || isRecording) return;

    setStarting(true);
    try {
      const data = await recFetch<{ session_id: string }>('start', { title: title.trim() });
      setPending({ sessionId: data.session_id, at: Date.now() });
      setStopRequested(null);
      setTitle('');
      toast.success('녹음을 시작했습니다. 실제 녹음은 1분 안에 시작돼요.');
      window.setTimeout(() => void loadStatus(true), 4000);
    } catch (error) {
      if (error instanceof RecApiError && error.status === 409) {
        toast.error('이미 진행 중인 녹음이 있습니다.');
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
    if (!window.confirm('녹음을 종료할까요?')) return;

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
          <p className="py-6 text-center text-sm text-rose-300">{DENIED_MESSAGE}</p>
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
                    <p className="text-sm text-white">
                      {stopSent
                        ? '종료하는 중…'
                        : activeRun?.status === 'in_progress'
                          ? '녹음 중'
                          : '시작하는 중…'}
                    </p>
                    {elapsed && <span className="ml-auto font-mono text-sm text-gray-200">{elapsed}</span>}
                  </div>
                  <div className="space-y-0.5 text-[11px] text-gray-400">
                    {activeRun?.title && <p className="text-xs text-gray-200">{activeRun.title}</p>}
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
