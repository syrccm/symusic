// GET /api/rec/download?key=recordings/....mp3 → { url } (R2 presigned GET, 만료 10분)
// 리다이렉트하지 않고 URL 만 돌려준다 — 프론트가 그 주소로 다운로드를 연다.
// key 는 recordings/ 아래 정해진 이름 형식의 .mp3 만 허용한다(검증은 presignDownload 의 정규식).
import { failUpstream, recGuard, type ApiReq, type ApiRes } from '../_lib/recAuth.js';
import { presignDownload } from '../_lib/recR2.js';

export default async function handler(req: ApiReq, res: ApiRes) {
  const uid = await recGuard(req, res, 'GET');
  if (!uid) return;

  const key = req.query.key;
  if (typeof key !== 'string') {
    res.status(400).json({ error: 'key 가 필요합니다.' });
    return;
  }

  try {
    const url = await presignDownload(key);
    if (!url) {
      res.status(400).json({ error: 'key 가 올바르지 않습니다.' });
      return;
    }
    console.log(`[rec/download] uid=${uid} key=${key}`);
    res.status(200).json({ url });
  } catch (error) {
    failUpstream(res, 'download', error, '다운로드 주소를 만들지 못했습니다.');
  }
}
