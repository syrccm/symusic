// 공유 페이지 "스마트폰에 설치하기" 버튼이 어떤 설치 안내를 보여줄지 결정하기 위한
// 기기/브라우저 감지 유틸. PWA 설치 흐름은 OS·브라우저마다 완전히 다르므로
// userAgent로 케이스를 분기한다.

export type InstallMethod =
  | 'kakao-android' // 카카오톡 인앱 브라우저(Android) → 외부 브라우저로 열기
  | 'kakao-ios' // 카카오톡 인앱 브라우저(iOS) → Safari로 열기
  | 'android' // Google Play 스토어로 바로 이동
  | 'ios-safari' // 공유 → 홈 화면에 추가
  | 'ios-chrome' // ⋮ 메뉴 → 홈 화면에 추가
  | 'ios-other' // FxiOS/OPiOS 등 → Safari로 열기 안내
  | 'pc-chrome' // 주소창 설치 아이콘
  | 'pc-edge' // 주소창 앱 설치 아이콘
  | 'pc-safari' // 공유 → Dock에 추가 (macOS)
  | 'pc-other'; // Firefox 등 → Chrome/Edge 권장

// [임시/디버그] ?ua=<method> 쿼리파라미터 오버라이드에 쓰는 유효 값 목록.
// Record<InstallMethod, true> 라서 위 유니온에 케이스를 추가/삭제하면
// 여기도 함께 고치지 않는 한 컴파일 에러가 난다(목록 동기화 보장).
// 카톡 인앱 검증이 끝나면 이 상수와 아래 오버라이드 블록을 함께 제거할 것.
const FORCEABLE_METHODS: Record<InstallMethod, true> = {
  'kakao-android': true,
  'kakao-ios': true,
  android: true,
  'ios-safari': true,
  'ios-chrome': true,
  'ios-other': true,
  'pc-chrome': true,
  'pc-edge': true,
  'pc-safari': true,
  'pc-other': true,
};

/**
 * userAgent를 분석해 어떤 설치 안내가 적합한지 반환한다.
 *
 * 감지 순서가 중요하다:
 * - Edge·Opera UA에는 "Chrome" 토큰이 들어 있으므로 Chrome보다 먼저 가려낸다.
 * - iPadOS 13+ Safari는 데스크톱 모드에서 "Macintosh"로 위장하므로
 *   maxTouchPoints로 실제 iPad 여부를 판별한다.
 */
export function detectInstallMethod(): InstallMethod {
  if (typeof navigator === 'undefined') return 'pc-other';

  // [임시/디버그] ?ua=<method> 로 설치 안내 케이스를 강제한다.
  // 카톡 인앱처럼 실기기에서만 재현되는 케이스를 일반 브라우저에서 확인하기 위한 용도.
  // 예: ?ua=kakao-ios , ?ua=kakao-android . 검증이 끝나면 제거할 것.
  if (typeof location !== 'undefined') {
    const forced = new URLSearchParams(location.search).get('ua');
    if (forced && Object.prototype.hasOwnProperty.call(FORCEABLE_METHODS, forced)) {
      return forced as InstallMethod;
    }
  }

  const ua = navigator.userAgent || '';

  // 0) 카카오톡 인앱 브라우저 — 최우선 판별.
  // 인앱 WebView는 PWA 설치를 지원하지 않으므로 OS별로 외부 브라우저 열기를 안내한다.
  if (/KAKAOTALK/i.test(ua)) {
    if (/Android/i.test(ua)) return 'kakao-android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'kakao-ios';
  }

  // 1) Android — 스토어로 바로 이동
  if (/Android/i.test(ua)) return 'android';

  // 2) iOS / iPadOS
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    // iPadOS 13+ 가 데스크톱 Safari로 위장하는 경우
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);

  if (isIOS) {
    if (/CriOS/i.test(ua)) return 'ios-chrome';
    // FxiOS(Firefox), OPiOS(Opera), EdgiOS(Edge) 등 비(非)Safari WebKit 래퍼는
    // 홈 화면 추가가 제한적이라 Safari 사용을 안내한다.
    if (/FxiOS|OPiOS|EdgiOS|EdgA|GSA|mercury|Brave/i.test(ua)) return 'ios-other';
    if (/Safari/i.test(ua)) return 'ios-safari';
    return 'ios-other';
  }

  // 3) 데스크톱 — Edge → Opera/Firefox(기타) → Chrome → Safari 순으로 판별
  if (/Edg\//i.test(ua)) return 'pc-edge';
  if (/OPR\//i.test(ua) || /\bOpera\b/i.test(ua)) return 'pc-other';
  if (/Firefox\//i.test(ua)) return 'pc-other';
  if (/Chrome\//i.test(ua)) return 'pc-chrome';
  if (/Safari/i.test(ua)) return 'pc-safari'; // macOS Safari (Chrome은 위에서 걸러짐)

  return 'pc-other';
}
