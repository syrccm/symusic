// GET /api/rec/list → { items: [{ key, title, startedAt, durationSec, bytes, sessionId }] } (최신순)
import { failUpstream, recGuard, type ApiReq, type ApiRes } from '../_lib/recAuth.js';
import { listRecordings } from '../_lib/recR2.js';

export default async function handler(req: ApiReq, res: ApiRes) {
  const uid = await recGuard(req, res, 'GET');
  if (!uid) return;

  try {
    res.status(200).json({ items: await listRecordings() });
  } catch (error) {
    failUpstream(res, 'list', error, '녹음 목록을 불러오지 못했습니다.');
  }
}
