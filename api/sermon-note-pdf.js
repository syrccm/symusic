// Vercel 서버리스 함수 — "말씀나눔지" PDF 프록시.
// 교회 서버(sooyoungro.org/hompi)의 PDF는 CORS 헤더가 없어 PDF.js fetch나
// 일부 브라우저(iOS Safari)의 교차출처 iframe 렌더링이 불안정하다. 이 함수가
// 같은 출처(application/pdf)로 다시 흘려주면 네이티브 PDF 뷰어가 원본 화질+핀치줌으로
// 안정적으로 표시한다.
//
// 요청:  GET /api/sermon-note-pdf?url=<퍼센트인코딩된 PDF 절대 URL>
// 보안:  오픈 프록시 방지 — https://www.sooyoungro.org/hompi/ 로 시작하고 .pdf 로
//        끝나는 URL만 허용한다.
const ALLOWED_PREFIX = 'https://www.sooyoungro.org/hompi/';
const REFERER = 'https://www.sooyoungro.org/main/new-layout/syrintro/elibrary.jsp?tab=tab1';
const UA = 'Mozilla/5.0 (compatible; SYMusicBot/1.0; +https://github.com/syrccm/symusic)';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'GET 요청만 허용됩니다.' });
    return;
  }

  const raw = req.query?.url;
  const url = Array.isArray(raw) ? raw[0] : raw;
  if (!url || typeof url !== 'string' || !url.startsWith(ALLOWED_PREFIX) || !/\.pdf$/i.test(url)) {
    res.status(400).json({ error: '허용되지 않은 PDF 경로입니다.' });
    return;
  }

  try {
    const upstream = await fetch(url, { headers: { 'User-Agent': UA, Referer: REFERER } });
    if (!upstream.ok) {
      res.status(502).json({ error: `원본 응답 오류: ${upstream.status}` });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Content-Disposition', 'inline'); // 다운로드가 아니라 뷰어로 표시
    // 주 1회 갱신 데이터라 하루 캐시 + CDN 캐시
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).json({ error: 'PDF 가져오기 실패: ' + (e?.message || String(e)) });
  }
}
