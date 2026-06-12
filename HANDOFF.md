# SY Music 인수인계 / 작업 이력

다음 유지보수자(또는 다음 세션)를 위한 작업 기록. 최신 항목을 위에 추가한다.

---

## 2026-06-12

### [완료]

1. **하단 탭바 밀림 버그 수정 (iPhone Safari)**
   - 증상: 가사 스크롤 시 하단 탭바가 따라 올라오고 그 아래 흰 빈 공간이 생김. iOS Safari의 접히는 툴바로 정적 `100vh`(`h-screen`)가 시각 뷰포트와 어긋난 것.
   - 조치: 레이아웃 높이를 `h-screen` → 동적 뷰포트(`dvh`)로. `100vh` 폴백 후 `dvh`로 덮어쓰는 방식(`min-h-screen-dvh`/`h-screen-dvh` 유틸). safe-area(홈바 여백)는 별도 단계로 분리.
   - 커밋: `7fb5005`.

2. **성경암송 1차 (라이브 공개)**
   - **데이터**: 웨스트민스터 신앙고백서(WCF) 증거구절 30구절. `src/data/memoryVerses.ts`.
     WCF 33장 증거구절 중 **단일 절**을 13개 교리 주제로 분류, **인용 빈도** 참고해 선정(`parseRef`+`krv.json`으로 30/30 본문 검증).
     본문은 미저장 — 화면에서 `krv.json` 추출(저작권·중복 방지). **`tier` 누적 구조(1⊂2⊂3)** 로 2·3차 확장 대비.
   - **UI**: 메뉴 오버레이 방식(**하단 탭 4개 구조 유지**). 주제별 목록 + 본문 + 진도(localStorage, `useMemoryProgress` — `useFavorites` 패턴 복제, 3상태 안외움/외우는중/외움).
     전체화면 가림 연습(`MemoryPractice`): 4모드(전체/첫글자/완전가림/확인), 어절 단위 가림 변환(`maskText`, 순수 함수).
     진입 안내(헤더 문구 + 카드 "암송하기" 표시). 메뉴 위치: **말씀:ON 바로 아래**.
   - 커밋: `a2b93d4`(데이터) · `f207455`(UI 1단계) · `8800600`(가림연습 2단계) · `d752949`(메뉴 순서).

3. **햄버거 드롭다운이 하단 탭바에 가리는 버그 수정**
   - 증상: 햄버거 메뉴를 펼치면 하단 항목(관리 섹션)이 하단 탭바에 가려 안 보임.
   - 원인(stacking context 함정): 드롭다운에 z-50을 줬어도, 그것이 든 헤더가 sticky+z-30이라 독립 stacking context를 만들어 천장 역할. 루트에서 헤더 전체가 z-30 덩어리로 취급돼, 루트 레벨 탭바(fixed z-40)가 드롭다운을 덮음. (자식 z를 아무리 올려도 부모 천장에 갇힘)
   - 조치: ① 헤더 z-30 → z-50 (천장을 탭바 위로). ② 드롭다운에 max-h-[70vh]+overflow-y-auto+pb-2 (긴 메뉴 화면 넘침 → 내부 스크롤). 헤더는 최상단·탭바는 최하단이라 시각 충돌 없음.
   - 교훈: sticky/fixed + z-index는 독립 stacking context를 만든다. 자식 요소가 안 떠오르면 자식 z가 아니라 "부모(컨테이너)의 z 천장"을 의심할 것.
   - 커밋: `b9efdd8`.

### [대기 / 다음]

- **성경암송 2차(소요리문답 50) · 3차(대요리문답 70)**
  - 같은 `memoryVerses.ts` 배열에 `tier: 2`/`3`으로 추가하면 `filter(v => v.tier <= N)`로 30→50→70 누적 노출(UI 변경 불필요).
  - 후보 추출 백업: `C:/Users/user/Desktop/symusic-backup/wcf-memory-candidates.md` (WCF 전체 단일 절 후보 1,558개).
  - 소요리/대요리는 **별도 데이터**(`src/data/westminsterShorter.ts`, `src/data/westminsterLarger.ts`)에서 **같은 방식**(단일 절 추출 → 주제 분류 → 빈도 참고 선정 → 본문 검증)으로 추출 필요.

- **매일성경**: 성서유니온에 **정식 이용 문의 메일 발송(2026-06-12)**, 회신 대기 중. **허락 전 게시 안 함.** (저작권 배경은 아래 2026-06-07 [접어둠] 참고)

---

## 2026-06-07

### [완료]

1. **카테고리 드롭다운 안 열림 버그 수정**
   - 증상: 곡 관리 Dialog 안 "카테고리 선택" 드롭다운이 클릭해도 안 열림(PC·폰 공통). JS 에러는 없음.
   - 원인: 커밋 `77ba658`(2026-06-03)이 Dialog 오버레이를 `z-50 → z-[110]`으로 올렸는데, `SelectContent`는 `z-50`으로 남아 **드롭다운이 오버레이 뒤에 깔림**(순수 z-index 스태킹 문제). 번들 최적화와는 무관(최적화 커밋은 6-05로 회귀보다 나중).
   - 조치: `src/components/ui/select.tsx`의 `SelectContent` `z-50 → z-[120]`(오버레이 z-110 위로). 한 줄 변경.
   - 참고: 앱 전체 z-index 스케일 — Dialog 110 > 전체화면 오버레이 100 > BibleOn/Ministers 모달 70/60 > (구)Select 50. 드롭다운류는 항상 최상단이어야 하므로 120.

2. **스크래퍼 갱신 스케줄 변경** (`.github/workflows/update-bibleon.yml`)
   - 월요일 단일(`0 3 * * 1`) → **금/일 18시 KST 2회**(`0 9 * * 5`, `0 9 * * 0`; UTC 09:00 = KST 18:00).
   - ⚠️ **중요 제약**: 매핑이 **영상 기준(video-driven)** — `scrape-sermon-notes.mjs`가 `bibleon.items`(영상)를 순회하며 제목으로 나눔지를 역조회하고, PDF 미러링도 영상이 매칭될 때만 수행. 또 `scrape-bibleon.mjs`는 매핑 필드(`noteSeq`/`notePdfUrl`) 없이 `bibleon.json`을 재생성하므로 **돌 때마다 매핑을 지움**.
   - → 두 스케줄 모두 **`bibleon → sermon-notes` 풀 시퀀스(한 잡)** 로 실행해야 매핑이 항상 복원됨. **요일별로 한쪽만 단독 실행하면 매핑 구멍**(영상 잡이 지운 매핑을 복원할 잡이 없거나, 나눔지만 돌면 영상 없는 주차의 PDF가 미러링·링크 안 됨).
   - ministers 스케줄은 현행 유지(월요일 18시 KST, `0 9 * * 1`). bibleon/나눔지와 의존성 없음.

3. **`deploy.yml`(GitHub Pages 배포 워크플로) 삭제**
   - 실서비스는 **Vercel 단독**(Git 연동 자동배포). 검증: `symusic.win`/`www`는 `Server: Vercel`·`X-Vercel-Cache: HIT`로 응답, DNS는 Vercel Anycast(`216.198.79.1`)를 가리킴.
   - GitHub Pages는 Vercel 전환 후 **트래픽 0의 중복 잔재**였음 — push마다 동일 산출물을 헛빌드하고, 기본 URL(`syrccm.github.io/symusic/`)은 `symusic.win`(→Vercel)으로 301 리다이렉트해 사용자가 Pages 콘텐츠에 도달할 경로가 없었음.
   - 삭제로 중복 빌드·Actions 분 제거 + deprecated 액션 5종(configure-pages/upload-pages-artifact/deploy-pages + 전이 upload-artifact) 동시 해소. Vercel 배포에는 영향 없음.

4. **스크래퍼 워크플로 액션 v5 업그레이드** (`update-bibleon.yml`, `update-ministers.yml`)
   - `actions/checkout` `@v4→@v5`, `actions/setup-node` `@v4→@v5` (Node 24 런타임 — 2026-06-16 Node 20 강제전환 deprecation 대응).
   - `node-version: '20'`은 **그대로 유지**. 이 값은 "액션 런타임"이 아니라 "우리 스크립트가 쓸 Node"라 deprecation과 무관.
   - 검증: 둘 다 `workflow_dispatch` 수동 실행 성공, **Node 20 deprecation 경고 0건**, v5 checkout에서 **후속 `git push` 정상**(checkout v5도 `persist-credentials` 기본값 유지).
   - 사전 확인: `package.json`에 `packageManager` 필드 없음 → setup-node v5 자동캐시 변수 무관.

### [접어둠 — 진행 불가]

- **매일성경 연동**: 본문·해설·오디오(MP3) 모두 **성서유니온 저작물**. MP3가 공개 URL로 접근 가능해도 **무단 재배포 금지가 명시**되어 있어 스크랩/미러링 불가. → 보류.

### [선택 / 대기]

- GitHub 저장소 **Settings → Pages**에 커스텀 도메인(`symusic.win`) 등록이 잔존(무해 — DNS는 Vercel). 완전히 정리하려면 Settings에서 Pages 사이트 비활성화/도메인 제거. (웹 UI 작업)

---
