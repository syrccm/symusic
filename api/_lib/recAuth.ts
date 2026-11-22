// 설교녹음 API 공용 인증 — Firebase ID 토큰 검증 + UID 허용 목록.
// - 요청 헤더 `Authorization: Bearer <Firebase ID 토큰>` 을 Google 공개키(JWKS)로 검증한다(firebase-admin 없이 jose 사용).
//   검증 항목: RS256 서명, 만료, iss = https://securetoken.google.com/{프로젝트}, aud = {프로젝트}, sub(=uid) 존재, auth_time 이 과거.
// - 검증된 uid 가 환경변수 REC_ADMIN_UIDS(쉼표 구분)에 있을 때만 통과. 목록이 비어 있으면 아무도 통과하지 못한다(닫힌 기본값).
// - 로그인만으로는 부족하다: 이 앱의 Firebase 로그인 사용자 전부가 아니라 허용 목록의 UID 만 녹음을 제어한다.
// - `_lib` 폴더는 밑줄로 시작하므로 Vercel 이 라우트로 만들지 않는다.
import { createRemoteJWKSet, jwtVerify } from 'jose';

/** Vercel Node 함수의 req/res 중 여기서 쓰는 부분만(의존성 @vercel/node 를 추가하지 않기 위한 최소 타입) */
export interface ApiReq {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}
export interface ApiRes {
  status(code: number): ApiRes;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

// src/lib/firebase.ts 의 projectId 와 같아야 한다(공개 값).
const FIREBASE_PROJECT_ID = 'symusic-7f651';

// Firebase ID 토큰 서명 키. jose 가 kid 별로 캐시하고 모르는 kid 가 오면 다시 받는다.
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

function adminUids(): string[] {
  return (process.env.REC_ADMIN_UIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 메서드 확인 + 관리자 인증. 통과하면 uid 를, 아니면 응답(405/401/403)을 보낸 뒤 null 을 돌려준다.
 * 모든 rec API 는 첫 줄에서 이 함수를 부르고 null 이면 바로 return 한다.
 */
export async function recGuard(req: ApiReq, res: ApiRes, method: 'GET' | 'POST'): Promise<string | null> {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== method) {
    res.setHeader('Allow', method);
    res.status(405).json({ error: `${method} 요청만 허용됩니다.` });
    return null;
  }

  const header = req.headers.authorization;
  const raw = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(raw || '');
  if (!match) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return null;
  }

  let uid: string;
  try {
    const { payload } = await jwtVerify(match[1], JWKS, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
      requiredClaims: ['exp', 'iat', 'sub'], // jose 는 exp 가 있을 때만 만료를 검사하므로 필수로 강제
    });
    const now = Math.floor(Date.now() / 1000);
    const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : Infinity;
    if (typeof payload.sub !== 'string' || !payload.sub || authTime > now + 60) {
      throw new Error('sub/auth_time 클레임이 올바르지 않습니다.');
    }
    uid = payload.sub;
  } catch (error) {
    console.warn('[rec] 토큰 검증 실패:', (error as Error)?.message || error);
    // jose 의 검증 오류(code 가 ERR_JW…)만 401. 공개키를 받지 못한 일시 오류(네트워크·시간 초과)는 503 으로 구분해
    // 화면이 "권한 없음"으로 굳지 않게 한다. 어느 쪽이든 요청은 거부된다.
    const code = String((error as { code?: unknown } | null)?.code || '');
    if (code.startsWith('ERR_JW') && code !== 'ERR_JWKS_TIMEOUT') {
      res.status(401).json({ error: '로그인이 만료되었거나 올바르지 않습니다.' });
    } else {
      res.status(503).json({ error: '인증 확인에 일시적으로 실패했습니다. 잠시 후 다시 시도해 주세요.' });
    }
    return null;
  }

  const allowed = adminUids();
  if (allowed.length === 0) {
    console.error('[rec] REC_ADMIN_UIDS 환경변수가 비어 있어 모든 요청을 거부합니다.');
  }
  if (!allowed.includes(uid)) {
    res.status(403).json({ error: '녹음 관리 권한이 없습니다.' });
    return null;
  }
  return uid;
}

/** JSON 본문을 객체로 읽는다(문자열로 온 경우 파싱). 형식이 틀리면 빈 객체. */
export function readBody(req: ApiReq): Record<string, unknown> {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return {};
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** 처리 중 오류를 로그로 남기고 502 로 응답한다. 외부 서비스의 원문 오류는 클라이언트로 보내지 않는다. */
export function failUpstream(res: ApiRes, tag: string, error: unknown, message: string): void {
  console.error(`[rec/${tag}] 오류:`, (error as Error)?.message || error);
  res.status(502).json({ error: message });
}
