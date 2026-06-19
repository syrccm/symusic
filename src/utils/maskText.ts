// 한국어 본문 가림 변환 — 순수 함수, 외부 의존성 0.
// 공백(어절 구분)·구두점은 노출하고, 실제 글자만 가림 기호 '○'로 치환한다.
// (개역한글 본문은 문장부호가 거의 없지만, 섞여 있어도 깨지지 않도록 방어적으로 처리)

const PUNCT = /[.,!?;:·…“”‘’"'「」『』、()~[\]\-–—/]/u;
const MASK = '○';

export type MaskMode = 'firstChar' | 'full';

/**
 * 본문을 가림 모드에 따라 변환한다.
 * @param text 원문
 * @param mode 'firstChar' = 어절 첫 글자만 남기고 가림 / 'full' = 전부 가림
 */
export function maskText(text: string, mode: MaskMode): string {
  return text
    .split(/(\s+)/) // 공백 보존하며 어절 분리
    .map((token) => {
      if (/^\s*$/.test(token)) return token; // 공백은 그대로
      let firstShown = false;
      return Array.from(token)
        .map((ch) => {
          if (PUNCT.test(ch)) return ch; // 구두점은 항상 노출
          if (mode === 'firstChar' && !firstShown) {
            firstShown = true;
            return ch; // 어절 첫 글자 노출
          }
          return MASK; // 나머지 가림
        })
        .join('');
    })
    .join('');
}
