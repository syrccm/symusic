# SY Music 인수인계 / 작업 이력

다음 유지보수자(또는 다음 세션)를 위한 작업 기록. 최신 항목을 위에 추가한다.

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
