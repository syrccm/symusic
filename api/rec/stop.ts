// POST /api/rec/stop { session_id } → { ok: true }
// 리포 변수 STOP_SIGNAL 에 세션 id 를 써넣는다. 녹음 러너가 10초마다 읽어 자기 세션이면 녹음을 마감한다.
import { failUpstream, readBody, recGuard, type ApiReq, type ApiRes } from '../_lib/recAuth.js';
import { SESSION_ID_RE, setStopSignal } from '../_lib/recGithub.js';

export default async function handler(req: ApiReq, res: ApiRes) {
  const uid = await recGuard(req, res, 'POST');
  if (!uid) return;

  const sessionId = readBody(req).session_id;
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
    res.status(400).json({ error: 'session_id 가 올바르지 않습니다.' });
    return;
  }

  try {
    await setStopSignal(sessionId);
    console.log(`[rec/stop] uid=${uid} session=${sessionId}`);
    res.status(200).json({ ok: true });
  } catch (error) {
    failUpstream(res, 'stop', error, '녹음 종료 요청을 보내지 못했습니다.');
  }
}
