// POST /api/rec/start { title? } → { session_id }
// 진행 중인 녹음이 있으면 409. STOP_SIGNAL 을 초기화한 뒤 녹음 워크플로를 실행한다.
// (상대 경로 import 의 .js 확장자는 Vercel ESM 런타임에서 필요하다 — 지우지 말 것)
import { randomInt } from 'node:crypto';
import { failUpstream, readBody, recGuard, type ApiReq, type ApiRes } from '../_lib/recAuth.js';
import { dispatchRecord, listRuns, setStopSignal } from '../_lib/recGithub.js';

const TITLE_MAX = 100;
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** `YYYYMMDD-HHmm-xxxx` (KST 기준, 끝 4자는 무작위) */
function newSessionId(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(); // UTC 필드를 KST 로 읽기 위해 9시간 더함
  const stamp = `${kst.slice(0, 4)}${kst.slice(5, 7)}${kst.slice(8, 10)}-${kst.slice(11, 13)}${kst.slice(14, 16)}`;
  let suffix = '';
  for (let i = 0; i < 4; i += 1) suffix += ID_CHARS[randomInt(ID_CHARS.length)];
  return `${stamp}-${suffix}`;
}

export default async function handler(req: ApiReq, res: ApiRes) {
  const uid = await recGuard(req, res, 'POST');
  if (!uid) return;

  const rawTitle = readBody(req).title;
  // 제어 문자 제거 후 길이 제한. 제목은 워크플로 입력(환경변수)과 R2 메타데이터로만 쓰인다.
  // eslint-disable-next-line no-control-regex
  const title = (typeof rawTitle === 'string' ? rawTitle : '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, TITLE_MAX);

  try {
    const runs = await listRuns(10);
    if (runs.some((run) => run.status !== 'completed')) {
      res.status(409).json({ error: '이미 진행 중인 녹음이 있습니다.' });
      return;
    }

    const sessionId = newSessionId();
    // GitHub 변수는 빈 값을 받지 않으므로 '-' 로 초기화한다(세션 id 와 같아질 수 없는 값).
    // 실행보다 먼저 쓴다: 변수 쓰기 권한이 없으면 나중에 정지도 못 하므로 시작 자체를 막는다.
    await setStopSignal('-');
    await dispatchRecord(sessionId, title);

    console.log(`[rec/start] uid=${uid} session=${sessionId}`);
    res.status(200).json({ session_id: sessionId });
  } catch (error) {
    failUpstream(res, 'start', error, '녹음을 시작하지 못했습니다.');
  }
}
