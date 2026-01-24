# SY Music TWA (Play 스토어 앱) 설정 가이드

## 📁 추가할 파일 목록

GitHub 저장소(syrccm/symusic)에 다음 파일들을 추가하세요:

```
symusic/
├── manifest.json          ← 새로 추가
├── sw.js                  ← 새로 추가
├── icon-192.png           ← 새로 추가
├── icon-512.png           ← 새로 추가
├── .well-known/
│   └── assetlinks.json    ← 새로 추가 (TWA 인증용)
├── index.html             ← 수정 필요
├── 404.html
├── favicon.svg
├── robots.txt
├── assets/
└── data/
```

---

## 🔧 Step 1: GitHub에 파일 업로드

1. GitHub 저장소로 이동: https://github.com/syrccm/symusic
2. "Add file" → "Upload files" 클릭
3. 제공된 파일들 업로드:
   - `manifest.json`
   - `sw.js`
   - `icon-192.png`
   - `icon-512.png`

4. `.well-known` 폴더 생성:
   - "Add file" → "Create new file" 클릭
   - 파일명에 `.well-known/assetlinks.json` 입력
   - 내용 붙여넣기 (나중에 SHA256 지문 업데이트 필요)

---

## 🔧 Step 2: index.html 수정

`index.html` 파일의 `<head>` 섹션 안에 다음 코드 추가:

```html
<!-- PWA Manifest -->
<link rel="manifest" href="/manifest.json">

<!-- iOS 지원 -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="SY Music">
<link rel="apple-touch-icon" href="/icon-192.png">

<!-- 테마 색상 -->
<meta name="theme-color" content="#8b5cf6">
```

`</body>` 바로 앞에 다음 코드 추가:

```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('SW 등록 성공:', reg.scope))
        .catch((err) => console.log('SW 등록 실패:', err));
    });
  }
</script>
```

---

## 🔧 Step 3: PWA 테스트

변경사항을 커밋한 후:

1. https://www.symusic.win 접속
2. Chrome 개발자 도구 (F12) → Application 탭
3. "Manifest" 섹션에서 정보 확인
4. "Service Workers" 섹션에서 등록 확인

---

## 🔧 Step 4: PWA Builder로 TWA 생성

1. https://www.pwabuilder.com 접속
2. URL 입력: `https://www.symusic.win`
3. "Start" 클릭
4. PWA 점수 확인 (모든 항목 통과 필요)
5. "Package for stores" → "Android" 선택
6. 옵션 설정:
   - Package ID: `win.symusic.twa`
   - App name: `SY Music`
   - Version: `1.0.0`
7. "Generate" 클릭하여 ZIP 다운로드

---

## 🔧 Step 5: 서명 키 생성 및 assetlinks.json 업데이트

PWA Builder에서 다운받은 ZIP에 서명 키(keystore)가 포함되어 있습니다.

SHA256 지문 확인 방법:
```bash
keytool -list -v -keystore signing.keystore -alias my-key-alias
```

확인된 SHA256 지문을 `.well-known/assetlinks.json`의 
`sha256_cert_fingerprints` 배열에 입력하세요.

예시:
```json
"sha256_cert_fingerprints": [
  "AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90"
]
```

---

## 🔧 Step 6: Play 스토어 등록

1. https://play.google.com/console 접속 (개발자 계정 필요, $25)
2. "앱 만들기" 클릭
3. 앱 정보 입력:
   - 앱 이름: SY Music - 수영로말씀적용찬양
   - 기본 언어: 한국어
   - 앱 유형: 앱
   - 무료/유료: 무료
4. APK/AAB 파일 업로드
5. 스토어 등록 정보 작성 (스크린샷, 설명 등)
6. 콘텐츠 등급 설문 완료
7. 검토 제출

---

## ⏱️ 예상 소요 시간

| 단계 | 시간 |
|------|------|
| PWA 파일 설정 | 30분 |
| PWA Builder | 10분 |
| Play Console 등록 | 1-2시간 |
| Google 검토 | 1-7일 |

---

## ❓ 도움이 필요하시면

각 단계에서 막히는 부분이 있으면 알려주세요!
