// 플레이리스트 단축 주소 코드(shortCode) 유틸
// - 공유 주소: https://www.symusic.win/p/{shortCode}  (구 주소 /playlist/{문서id} 는 하위호환 유지)
// - 코드 규칙: 영소문자·숫자만, 2~32자. 관리자가 입력하면 소문자화해서 검증, 비우면 랜덤 4자.
// - 중복 검사: playlists 컬렉션을 where('shortCode','==',code) 로 조회
import { collection, getDocs, limit, query, where, type Firestore } from 'firebase/firestore';

export const SHORT_CODE_MIN = 2;
export const SHORT_CODE_MAX = 32;
export const RANDOM_CODE_LENGTH = 4;

const SHORT_CODE_RE = /^[a-z0-9]+$/;
const RANDOM_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 관리자 입력값을 정규화(공백 제거·소문자화)하고 규칙 위반이면 안내 문구를 돌려준다. */
export function normalizeShortCode(input: string): { code: string; error?: string } {
  const code = input.trim().toLowerCase();
  if (!code) return { code: '' };
  if (!SHORT_CODE_RE.test(code)) {
    return { code, error: '짧은 주소 코드는 영문 소문자와 숫자만 쓸 수 있어요. (한글·공백·특수문자 불가)' };
  }
  if (code.length < SHORT_CODE_MIN || code.length > SHORT_CODE_MAX) {
    return { code, error: `짧은 주소 코드는 ${SHORT_CODE_MIN}~${SHORT_CODE_MAX}자여야 해요.` };
  }
  return { code };
}

/** 영소문자+숫자 랜덤 코드(기본 4자). crypto 가 있으면 사용, 없으면 Math.random 폴백. */
export function generateRandomShortCode(length = RANDOM_CODE_LENGTH): string {
  const out: string[] = [];
  const n = RANDOM_ALPHABET.length;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(length);
    crypto.getRandomValues(buf);
    for (let i = 0; i < length; i++) out.push(RANDOM_ALPHABET[buf[i] % n]);
  } else {
    for (let i = 0; i < length; i++) out.push(RANDOM_ALPHABET[Math.floor(Math.random() * n)]);
  }
  return out.join('');
}

/** shortCode 로 플레이리스트 문서 id 를 찾는다. 없으면 null. */
export async function findPlaylistIdByShortCode(db: Firestore, code: string): Promise<string | null> {
  const snap = await getDocs(
    query(collection(db, 'playlists'), where('shortCode', '==', code), limit(1)),
  );
  return snap.empty ? null : snap.docs[0].id;
}

/** 공유용 경로: shortCode 가 있으면 /p/{code}, 없으면(구 데이터) /playlist/{id} */
export function buildPlaylistPath(playlist: { id: string; shortCode?: string | null }): string {
  return playlist.shortCode
    ? `/p/${encodeURIComponent(playlist.shortCode)}`
    : `/playlist/${encodeURIComponent(playlist.id)}`;
}
