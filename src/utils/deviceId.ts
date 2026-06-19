// 로그인 없는 익명 기기 식별자. 설교노트 등 기기 단위 개인 데이터의 Firestore 경로 키로 쓴다.
// crypto.randomUUID() 기반이라 추측이 어렵고, 한 번 생성하면 localStorage에 영구 보관한다.

const STORAGE_KEY = 'symusic_device_id';

function generateId(): string {
  // 표준 randomUUID가 있으면 사용, 없으면 getRandomValues로 동등한 무작위 문자열 생성
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `device_${crypto.randomUUID()}`;
    }
  } catch {
    // 무시하고 폴백으로
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `device_${hex}`;
}

/** 기기 ID 반환. 없으면 생성 후 localStorage에 저장. */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = generateId();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage 사용 불가 환경 — 영속화는 못 하지만 세션 동작은 가능하도록 즉석 생성
    return generateId();
  }
}
