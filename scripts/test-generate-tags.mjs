// 서버리스 함수 /api/generate-tags 직접 POST 테스트
//
// ─────────────────────────────────────────────────────────────
// [브라우저에서 테스트]  배포된 사이트(또는 `vercel dev`) 접속 후
// 개발자도구(F12) → Console 탭에 아래를 붙여넣고 Enter:
//
//   fetch('/api/generate-tags', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       title: '주 은혜임을',
//       lyrics: '나의 모든 것 주께 드리네\n십자가 그 사랑 은혜로다\n주 다시 오실 그날까지 찬양하리'
//     })
//   }).then(r => r.json().then(b => console.log('HTTP', r.status, b)));
//
//   • 정상      → HTTP 200 { tags: ["은혜","십자가","헌신", ...] }
//   • 키 미설정 → HTTP 500 { error: "ANTHROPIC_API_KEY 환경변수가 ..." }
//   • 라우팅 오류 → HTTP 200 이지만 본문이 HTML(index.html)  ← 이 경우만 vercel.json 문제
//   • 함수 없음  → HTTP 404
// ─────────────────────────────────────────────────────────────
// [터미널에서 테스트]  (Node 18+, 전역 fetch 사용)
//
//   node scripts/test-generate-tags.mjs                      # 기본: http://localhost:3000 (vercel dev)
//   node scripts/test-generate-tags.mjs https://<배포도메인>  # 배포 환경
// ─────────────────────────────────────────────────────────────

const base = process.argv[2] || process.env.TEST_BASE_URL || 'http://localhost:3000';
const url = base.replace(/\/+$/, '') + '/api/generate-tags';

const payload = {
  title: '주 은혜임을',
  lyrics: [
    '나의 모든 것 주께 드리네',
    '십자가 그 사랑 은혜로다',
    '주 다시 오실 그날까지 찬양하리',
  ].join('\n'),
};

console.log(`POST ${url}`);

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text; // JSON이 아니면 원문 (HTML이면 라우팅 문제 신호)
  }

  console.log('HTTP', res.status);
  console.log(body);

  if (res.ok && body && Array.isArray(body.tags)) {
    console.log('✅ 성공 — 태그:', body.tags);
    process.exit(0);
  }

  if (typeof body === 'string' && body.includes('<!doctype html')) {
    console.log('❌ 라우팅 문제 — 함수 대신 index.html이 반환됨 (vercel.json rewrites 확인)');
  } else {
    console.log('❌ 실패 — 위 응답 확인 (키 미설정 시 500, 함수 없음 시 404)');
  }
  process.exit(1);
} catch (err) {
  console.error('❌ 요청 자체 실패:', err.message);
  console.error('   vercel dev 미실행이거나 도메인이 잘못되었을 수 있습니다.');
  process.exit(1);
}
