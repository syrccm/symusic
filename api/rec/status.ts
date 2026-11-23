// GET /api/rec/status → { runs: [{ id, status, conclusion, startedAt, runUrl, sessionId, title }], current }
// - runs: 최근 5건, 최신순.
// - current: 진행 중인 녹음의 단계 { phase: waiting|recording, session_id, title, video_id, started_at } 또는 null.
//   R2 의 state/current.json 은 러너가 강제 종료되면 남을 수 있으므로, 같은 세션의 실행이 진행 중일 때만 믿는다.
//   진행 중인 실행이 없으면 R2 를 읽지 않는다(10초 폴링마다 부르지 않게).
import { failUpstream, recGuard, type ApiReq, type ApiRes } from '../_lib/recAuth.js';
import { listRuns } from '../_lib/recGithub.js';
import { readState, type RecState } from '../_lib/recR2.js';

export default async function handler(req: ApiReq, res: ApiRes) {
  const uid = await recGuard(req, res, 'GET');
  if (!uid) return;

  try {
    const runs = await listRuns(5);
    const active = runs.filter((run) => run.status !== 'completed');
    let current: RecState | null = null;
    if (active.length > 0) {
      try {
        const state = await readState();
        if (state && active.some((run) => run.sessionId === state.session_id)) current = state;
      } catch (error) {
        // 단계 표시는 부가 정보다. 읽지 못해도 실행 목록은 돌려준다.
        console.error('[rec/status] 진행 상태 읽기 실패:', (error as Error)?.message || error);
      }
    }
    res.status(200).json({ runs, current });
  } catch (error) {
    failUpstream(res, 'status', error, '녹음 상태를 불러오지 못했습니다.');
  }
}
