// 설교 요약 인포그래픽 전체화면 확대 뷰어
// - 뷰포트 메타가 maximum-scale=1.0 이라 브라우저 기본 핀치 줌이 막혀 있어, 포인터 이벤트로 직접 구현
//   · 두 손가락 핀치: 확대/축소(1~4배)  · 한 손가락(확대 상태): 이동  · 두 번 탭/더블클릭: 2.5배 ↔ 원래 크기
//   · 마우스 휠: 커서 기준 확대/축소
// - 닫기: 우상단 X, 배경 탭(드래그가 아닌 순수 탭일 때만), ESC
// - PlayPromptModal 과 같은 오버레이 패턴(fixed inset-0, role=dialog, ESC)
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface SermonImageViewerProps {
  src: string;
  alt: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const TAP_MOVE_PX = 8;

interface Point {
  x: number;
  y: number;
}

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

const IDENTITY: Transform = { scale: 1, tx: 0, ty: 0 };

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function SermonImageViewer({ src, alt, onClose }: SermonImageViewerProps) {
  const [t, setT] = useState<Transform>(IDENTITY);
  const [dragging, setDragging] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());
  // 제스처 시작 시점 스냅샷(배율·이동값, 두 손가락 거리, 중점 또는 단일 포인터 위치)
  const gestureStart = useRef<{ t: Transform; dist: number; mid: Point } | null>(null);
  const moved = useRef(false);
  const lastTap = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;

  // ESC 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // 이동 범위 제한: 확대된 이미지가 화면 밖으로 완전히 나가지 않도록
  const clamp = (next: Transform): Transform => {
    const scale = clampScale(next.scale);
    const img = imgRef.current;
    if (!img || scale === 1) return { scale, tx: 0, ty: 0 };
    const maxTx = Math.max(0, (img.clientWidth * scale - window.innerWidth) / 2);
    const maxTy = Math.max(0, (img.clientHeight * scale - window.innerHeight) / 2);
    return {
      scale,
      tx: Math.min(maxTx, Math.max(-maxTx, next.tx)),
      ty: Math.min(maxTy, Math.max(-maxTy, next.ty)),
    };
  };

  // 화면 좌표 p 를 기준점으로 배율 변경(그 지점이 그대로 머물도록 이동값 보정)
  const zoomAt = (base: Transform, nextScale: number, p: Point): Transform => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const ratio = nextScale / base.scale;
    return clamp({
      scale: nextScale,
      tx: p.x - cx - (p.x - cx - base.tx) * ratio,
      ty: p.y - cy - (p.y - cy - base.ty) * ratio,
    });
  };

  const beginGesture = () => {
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      gestureStart.current = { t: tRef.current, dist: distance(pts[0], pts[1]), mid: midpoint(pts[0], pts[1]) };
    } else if (pts.length === 1) {
      gestureStart.current = { t: tRef.current, dist: 0, mid: pts[0] };
    } else {
      gestureStart.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) moved.current = false;
    setDragging(true);
    beginGesture();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const start = gestureStart.current;
    if (!start) return;
    const pts = [...pointers.current.values()];

    if (pts.length >= 2 && start.dist > 0) {
      // 핀치: 배율 = 시작 배율 × (현재 거리 / 시작 거리). 중점 이동도 함께 반영
      const mid = midpoint(pts[0], pts[1]);
      const nextScale = clampScale(start.t.scale * (distance(pts[0], pts[1]) / start.dist));
      const zoomed = zoomAt(start.t, nextScale, start.mid);
      setT(clamp({ ...zoomed, tx: zoomed.tx + (mid.x - start.mid.x), ty: zoomed.ty + (mid.y - start.mid.y) }));
      moved.current = true;
    } else if (pts.length === 1) {
      const dx = pts[0].x - start.mid.x;
      const dy = pts[0].y - start.mid.y;
      if (Math.hypot(dx, dy) > TAP_MOVE_PX) moved.current = true;
      if (start.t.scale > 1) {
        setT(clamp({ scale: start.t.scale, tx: start.t.tx + dx, ty: start.t.ty + dy }));
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gestureStart.current = null;
      setDragging(false);
      if (!moved.current) {
        // 순수 탭: 짧은 간격의 두 번째 탭이면 확대 ↔ 원복
        const now = Date.now();
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          lastTap.current = 0;
          const p = { x: e.clientX, y: e.clientY };
          setT((prev) => (prev.scale > 1 ? IDENTITY : zoomAt(prev, DOUBLE_TAP_SCALE, p)));
        } else {
          lastTap.current = now;
        }
      }
    } else {
      // 손가락 하나가 떨어지면 남은 손가락 기준으로 제스처 재시작
      beginGesture();
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const p = { x: e.clientX, y: e.clientY };
    setT((prev) => zoomAt(prev, clampScale(prev.scale * factor), p));
  };

  // 배경 탭 닫기 — 드래그·핀치 뒤에 따라오는 click 은 무시
  const onBackdropClick = () => {
    if (moved.current) return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 animate-in fade-in duration-200 select-none"
      onClick={onBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="설교 요약 크게 보기"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="닫기"
        className="absolute right-3 z-10 p-2 rounded-full bg-black/50 text-gray-200 transition-colors hover:text-white hover:bg-black/70"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <X className="h-6 w-6" />
      </button>

      {/* 제스처 영역(화면 전체). 이미지 위 클릭은 stopPropagation 으로 배경 닫기와 구분 */}
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className="max-w-[100vw] max-h-[100dvh] w-auto h-auto object-contain"
          style={{
            transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 120ms ease-out',
            cursor: t.scale > 1 ? 'grab' : 'zoom-in',
          }}
        />
      </div>

      <p
        className="absolute left-0 right-0 text-center text-[11px] text-gray-400 pointer-events-none"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        핀치로 확대 · 두 번 탭하면 {t.scale > 1 ? '원래 크기' : '크게'} · 배경을 탭하면 닫기
      </p>
    </div>
  );
}
