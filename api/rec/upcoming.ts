// GET /api/rec/upcoming → { updated_at, items: [{ video_id, title, scheduled_at, status }] }
// 발사기가 R2 에 써 둔 채널의 예정·진행 중 라이브 목록. 파일이 없으면 items: [].
import { failUpstream, recGuard, type ApiReq, type ApiRes } from '../_lib/recAuth.js';
import { readUpcoming } from '../_lib/recR2.js';

export default async function handler(req: ApiReq, res: ApiRes) {
  const uid = await recGuard(req, res, 'GET');
  if (!uid) return;

  try {
    res.status(200).json(await readUpcoming());
  } catch (error) {
    failUpstream(res, 'upcoming', error, '예정된 라이브 목록을 불러오지 못했습니다.');
  }
}
