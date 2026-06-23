import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
// 런타임은 legacy 빌드(구형 iOS/안드 호환↑). 타입은 legacy/build/pdf.d.mts 가 동봉되어 함께 잡힘.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// worker: 자체 호스팅한 4.10.38 legacy worker 그대로 사용(버전·빌드 일치, 추가 번들 없음).
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs';

// 기기 픽셀비(아이폰=3까지 허용). 줌 레벨과 곱해 백킹 해상도를 결정한다.
const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 3);
const MAX_SCALE = 5; // 최대 줌 배율
const MIN_SCALE = 1;
// canvas 면적 상한 — iOS Safari 의 캔버스 한도(~16.7M px) 아래로 잡아 "빈 캔버스" 방지 + 메모리 보호.
const MAX_CANVAS_AREA = 12_000_000;
const DOUBLE_TAP_MS = 300; // 더블탭 인식 간격
const TAP_MOVE_TOL = 10; // 이 픽셀 이상 움직이면 탭이 아니라 스크롤로 간주

type Status = 'loading' | 'ready' | 'error';

// 현재 줌 배율을 재렌더용 정수 레벨(1~MAX_SCALE)로 양자화.
function quantizeZoom(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(1, Math.round(scale)));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const touchDist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

/**
 * 모바일 우선 말씀나눔지 PDF 뷰어 (선명도 우선 구조).
 * - pdfjs-dist 로 각 페이지를 canvas 에 세로로 나열 렌더.
 * - 확대는 CSS transform 이 아니라 "canvas 의 CSS 표시 폭을 직접 키우는" 방식(width×zoom).
 *   → 백킹 해상도가 화면에 그대로 반영되어 확대해도 흐리지 않다.
 * - 팬/페이지넘김은 컨테이너 overflow:auto 의 네이티브 스크롤(관성 포함).
 * - 두 손가락 핀치(직접 구현)로 줌, 더블탭으로 줌 토글.
 * - 줌 레벨이 오르면 canvas 백킹을 더 고해상도로 재렌더, 내리면 작게 그려 메모리 회수.
 * 모달 외곽(헤더·닫기·배경)은 호출부(BibleOnPage)가 담당하고, 여기는 PDF 영역만 채운다.
 */
export default function NotePdfViewer({ url }: { url: string }) {
  const wrapRef = useRef<HTMLDivElement>(null); // 스크롤 컨테이너
  const contentRef = useRef<HTMLDivElement>(null); // 폭을 직접 키우는 내부 컨텐츠
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [width, setWidth] = useState(0); // 컨테이너 폭(기본 1배 기준)
  const [renderLevel, setRenderLevel] = useState(1); // canvas 백킹 해상도 레벨(디바운스 갱신)

  const widthRef = useRef(0); // 리스너 재바인딩 없이 최신 width 참조
  const zoomRef = useRef(1); // 현재 연속 줌 배율(라이브)
  const levelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 줌 적용: contentRef 폭을 width×zoom 으로 직접 설정 + 초점(focal) 기준 스크롤 보정.
  const applyZoom = useCallback((nextZoom: number, focal?: { x: number; y: number }) => {
    const el = wrapRef.current;
    const content = contentRef.current;
    const w = widthRef.current;
    if (!el || !content || w <= 0) return;
    const old = zoomRef.current;
    const next = clamp(nextZoom, MIN_SCALE, MAX_SCALE);
    const f = next / old;
    const fx = focal ? focal.x : el.clientWidth / 2;
    const fy = focal ? focal.y : el.clientHeight / 2;
    const sl = el.scrollLeft;
    const st = el.scrollTop;
    zoomRef.current = next;
    content.style.width = `${Math.round(w * next)}px`;
    // 초점 아래의 컨텐츠 좌표가 그대로 머물도록 스크롤 보정(브라우저가 범위 자동 클램프).
    el.scrollLeft = (sl + fx) * f - fx;
    el.scrollTop = (st + fy) * f - fy;
  }, []);

  // 멈춘 뒤(~150ms) 줌 레벨을 재계산해 백킹 재렌더 트리거.
  const scheduleLevel = useCallback(() => {
    if (levelTimer.current) clearTimeout(levelTimer.current);
    levelTimer.current = setTimeout(() => {
      const next = quantizeZoom(zoomRef.current);
      setRenderLevel((prev) => (prev === next ? prev : next));
    }, 150);
  }, []);

  // 컨테이너 폭 측정(페이지 너비 맞춤 기준). 회전/리사이즈에도 반영.
  useLayoutEffect(() => {
    const measure = () => {
      if (wrapRef.current) {
        const w = wrapRef.current.clientWidth;
        widthRef.current = w;
        setWidth(w);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // width 변하면 현재 줌 비율 유지하며 컨텐츠 폭 재적용.
  useLayoutEffect(() => {
    if (contentRef.current && width > 0) {
      contentRef.current.style.width = `${Math.round(width * zoomRef.current)}px`;
    }
  }, [width, status]);

  // PDF 문서 로드(동일출처 /data/notes/*.pdf).
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setDoc(null);
    setRenderLevel(1);
    zoomRef.current = 1;
    const task = pdfjsLib.getDocument({ url });
    task.promise.then(
      (pdf) => {
        if (cancelled) {
          pdf.destroy();
          return;
        }
        setDoc(pdf);
        setStatus('ready');
      },
      (err) => {
        console.error('[NotePdfViewer] getDocument 실패:', err);
        if (!cancelled) setStatus('error');
      },
    );
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [url]);

  // 문서 교체/언마운트 시 이전 문서 메모리 정리.
  useEffect(() => () => void doc?.destroy(), [doc]);
  useEffect(() => () => clearTimeout(levelTimer.current), []);

  // 핀치/더블탭 제스처 — touchmove preventDefault 위해 비-passive 네이티브 리스너로 직접 바인딩.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || status !== 'ready') return;

    let pinching = false;
    let prevDist = 0;
    let tapStartX = 0;
    let tapStartY = 0;
    let moved = false;
    let lastTap = 0;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinching = true;
        prevDist = touchDist(e.touches[0], e.touches[1]);
      } else if (e.touches.length === 1) {
        tapStartX = e.touches[0].clientX;
        tapStartY = e.touches[0].clientY;
        moved = false;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (pinching && e.touches.length === 2) {
        e.preventDefault(); // 네이티브 핀치/스크롤 가로채기(비-passive 필수)
        const cur = touchDist(e.touches[0], e.touches[1]);
        if (prevDist > 0) {
          const rect = el.getBoundingClientRect();
          const focal = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
          };
          applyZoom(zoomRef.current * (cur / prevDist), focal);
        }
        prevDist = cur;
      } else if (e.touches.length === 1) {
        // 한 손가락 이동은 네이티브 스크롤(팬)에 맡김 — 탭 여부만 판정.
        if (
          Math.abs(e.touches[0].clientX - tapStartX) > TAP_MOVE_TOL ||
          Math.abs(e.touches[0].clientY - tapStartY) > TAP_MOVE_TOL
        ) {
          moved = true;
        }
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (pinching && e.touches.length < 2) {
        pinching = false;
        prevDist = 0;
        scheduleLevel();
        return;
      }
      // 더블탭 줌 토글(이동 없는 탭에 한해).
      if (e.touches.length === 0 && !moved) {
        const now = Date.now();
        if (now - lastTap < DOUBLE_TAP_MS) {
          const rect = el.getBoundingClientRect();
          const ct = e.changedTouches[0];
          const focal = { x: ct.clientX - rect.left, y: ct.clientY - rect.top };
          applyZoom(zoomRef.current > 1.2 ? MIN_SCALE : 2.5, focal);
          scheduleLevel();
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }
    };

    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onEnd, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [status, applyZoom, scheduleLevel]);

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-auto bg-neutral-800"
      style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-300">
          말씀나눔지를 불러오는 중…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-neutral-300">
          말씀나눔지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      )}
      {status === 'ready' && doc && width > 0 && (
        <div ref={contentRef} className="mx-auto flex flex-col items-center gap-2 py-2">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i + 1} doc={doc} pageNumber={i + 1} width={width} renderLevel={renderLevel} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 한 페이지를 (컨테이너폭 × DPR × renderLevel) 백킹 해상도로 canvas 에 렌더.
 * CSS 표시 폭은 부모 contentRef 폭에 맞춰 w-full(= width×zoom)로 늘어나며,
 * 백킹 ≥ 표시 픽셀이므로 확대해도 선명하다. 면적 상한(iOS)으로 클램프.
 */
function PdfPage({
  doc,
  pageNumber,
  width,
  renderLevel,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  renderLevel: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;
    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      let scale = (width * DPR * renderLevel) / base.width;
      const area = base.width * scale * (base.height * scale);
      if (area > MAX_CANVAS_AREA) scale *= Math.sqrt(MAX_CANVAS_AREA / area);

      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      renderTask = page.render({ canvasContext: ctx, viewport });
      try {
        await renderTask.promise;
      } catch {
        /* 줌 변경/페이지 교체로 cancel 된 경우 무시 */
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, pageNumber, width, renderLevel]);

  // CSS 표시폭은 부모(contentRef = width×zoom)를 채움 → 백킹 해상도가 그대로 반영되어 선명.
  return <canvas ref={canvasRef} className="block h-auto w-full bg-white shadow-md" />;
}
