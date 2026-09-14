// daylong 페이지 — PIN 통과 기록(localStorage)과 PIN 해시.
// - 키 'daylong.unlocked' 에 통과한 pinHash 를 저장. config.pinHash 가 바뀌면 자동으로 다시 잠긴다.
// - 모든 localStorage 접근은 try/catch(프라이빗 모드·차단 환경 대비). 사랑방(sarangbang.*) 키 관례를 따른다.
// - hashPin 은 sermonNoteStore.hashPin 과 같은 방식(SHA-256 16진)이지만, 설교노트 모듈을 끌어오지 않도록 별도로 둔다.

const UNLOCKED_KEY = 'daylong.unlocked';

/** 저장된 통과 해시. 없거나 접근 불가면 null. */
export function readUnlockedHash(): string | null {
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

export function saveUnlockedHash(pinHash: string): void {
  try {
    localStorage.setItem(UNLOCKED_KEY, pinHash);
  } catch {
    // LS 사용 불가 — 이번 세션만 통과 상태 유지
  }
}

export function clearUnlockedHash(): void {
  try {
    localStorage.removeItem(UNLOCKED_KEY);
  } catch {
    // 무시
  }
}

/** 4자리 PIN → SHA-256 16진 문자열. 평문은 어디에도 저장하지 않는다. */
export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
