/// <reference types="vite/client" />

// 개역한글 데이터(약 4.5MB)는 정적 에셋 URL로 받아 fetch 한다.
// (JSON을 직접 import 하면 tsc 가 거대한 리터럴 타입을 추론하므로 ?url 사용)
declare module '*.json?url' {
  const url: string;
  export default url;
}
