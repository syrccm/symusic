import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Play, ExternalLink, Film } from 'lucide-react';

// public/data/bibleon.json 스키마 (스크래퍼가 주 1회 갱신)
interface BibleOnItem {
  date: string; // "YYYY.MM.DD"
  seq: number;
  youtubeId: string;
  title: string;
}
interface BibleOnData {
  updatedAt: string;
  source: string;
  count: number;
  items: BibleOnItem[];
}

// 유튜브 썸네일 (실패 시 mqdefault로 폴백)
function Thumb({ id, title }: { id: string; title: string }) {
  const [idx, setIdx] = useState(0);
  const srcs = [
    `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
  ];
  if (idx >= srcs.length) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-purple-900/40">
        <Film className="h-8 w-8 text-purple-300/50" />
      </div>
    );
  }
  return (
    <img
      src={srcs[idx]}
      alt={title}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
      className="aspect-video w-full object-cover"
    />
  );
}

interface BibleOnPageProps {
  /** 오버레이로 띄울 때 닫기 콜백. 없으면 라우트 모드(뒤로가기). */
  onClose?: () => void;
}

export default function BibleOnPage({ onClose }: BibleOnPageProps = {}) {
  const navigate = useNavigate();
  const [data, setData] = useState<BibleOnData | null>(null);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState<BibleOnItem | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/data/bibleon.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: BibleOnData) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const fmtUpdate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  };

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'linear-gradient(160deg, #3A0D6E 0%, #4A1290 100%)' }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
        {/* 헤더 + 닫기(X) */}
        <header className="sticky top-0 z-20 bg-[#3A0D6E]/95 px-3 pt-3 pb-2.5 backdrop-blur-sm sm:px-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold">말씀:ON</h1>
              <p className="text-xs text-purple-200/70">주일 설교말씀 3분 요약</p>
            </div>
            <button
              type="button"
              onClick={() => (onClose ? onClose() : navigate('/'))}
              aria-label="닫기"
              title="닫기"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-500/30 bg-slate-800/90 text-white shadow-lg transition-colors hover:bg-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* 본문 */}
        <main className="flex-1 px-3 py-4 sm:px-4">
          {error ? (
            <div className="mt-16 text-center text-purple-200/80">
              <p>목록을 불러오지 못했습니다.</p>
              <p className="mt-1 text-sm text-purple-300/60">잠시 후 다시 시도해 주세요.</p>
            </div>
          ) : !data ? (
            <div className="mt-16 text-center text-purple-200/70">불러오는 중…</div>
          ) : data.items.length === 0 ? (
            <div className="mt-16 text-center text-purple-200/70">표시할 영상이 없습니다.</div>
          ) : (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
            >
              {data.items.map((it) => (
                <button
                  key={it.seq}
                  type="button"
                  onClick={() => setPlaying(it)}
                  className="group overflow-hidden rounded-2xl border border-purple-300/20 bg-black/20 text-left transition-colors hover:bg-black/30"
                >
                  <div className="relative">
                    <Thumb id={it.youtubeId} title={it.title} />
                    {/* 재생 오버레이 */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/35">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60">
                        <Play className="h-6 w-6 translate-x-0.5 text-white" fill="white" />
                      </span>
                    </div>
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-xs font-medium text-teal-300">{it.date}</p>
                    <p className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-white break-keep">
                      {it.title}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 최종 업데이트 + 출처 */}
          {data && (
            <div className="mt-8 space-y-1 px-1 pb-4 text-center text-xs text-white/45">
              <p>최종 업데이트: {fmtUpdate(data.updatedAt)}</p>
              <a
                href={data.source}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-white/55 underline underline-offset-2 hover:text-white/80"
              >
                출처: 수영로교회 공식 페이지
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </main>
      </div>

      {/* 유튜브 임베드 재생 모달 */}
      {playing && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPlaying(null)}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-[#1a0636] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPlaying(null)}
              aria-label="닫기"
              className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="aspect-video w-full bg-black">
              <iframe
                key={playing.youtubeId}
                src={`https://www.youtube.com/embed/${playing.youtubeId}?autoplay=1&rel=0`}
                title={playing.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
            <div className="px-4 py-3">
              <p className="text-xs font-medium text-teal-300">{playing.date}</p>
              <p className="mt-0.5 text-base font-semibold leading-snug text-white break-keep">
                {playing.title}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
