/** https 절대 주소인지 검사. 다운로드 링크 저장(관리 모달)과 열기(게시판)에서 공용. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
