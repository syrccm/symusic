// GET /api/rec/status → { runs: [{ id, status, conclusion, startedAt, runUrl, sessionId, title }] } (최근 5건, 최신순)
import { failUpstream, recGuard, type ApiReq, type ApiRes } from '../_lib/recAuth.js';
import { listRuns } from '../_lib/recGithub.js';

export default async function handler(req: ApiReq, res: ApiRes) {
  const uid = await recGuard(req, res, 'GET');
  if (!uid) return;

  try {
    res.status(200).json({ runs: await listRuns(5) });
  } catch (error) {
    failUpstream(res, 'status', error, '녹음 상태를 불러오지 못했습니다.');
  }
}
