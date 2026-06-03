import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, User, ExternalLink } from 'lucide-react';

// public/data/ministers.json 스키마 (스크래퍼가 주 1회 갱신)
interface Minister {
  role: string;
  name: string;
  photoUrl: string;
  department: string;
  order: number;
}
interface MinistersData {
  updatedAt: string;
  source: string;
  count: number;
  ministers: Minister[];
}

// 표시 순서 고정 (수영로교회 직제 순)
const ROLES = ['목사', '강도사', '전임전도사', '교육전도사', '장로'] as const;
const TABS = ['전체', ...ROLES] as const;
type Tab = (typeof TABS)[number];

// 검색 정규화: 공백 제거 + 소문자
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

// ISO → "YYYY.MM.DD"
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// 사진 로딩 실패 시 이니셜 플레이스홀더로 대체하는 이미지
function Photo({ src, name, className }: { src: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div
        className={`flex items-center justify-center bg-purple-900/40 ${className ?? ''}`}
        aria-label={name}
      >
        <User className="h-1/3 w-1/3 text-purple-300/50" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className ?? ''}`}
    />
  );
}

interface MinistersPageProps {
  /** 오버레이로 띄울 때 닫기 콜백. 없으면 라우트 모드(뒤로가기). */
  onClose?: () => void;
}

export default function MinistersPage({ onClose }: MinistersPageProps = {}) {
  const navigate = useNavigate();
  const [data, setData] = useState<MinistersData | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>('전체');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Minister | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/data/ministers.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: MinistersData) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const q = norm(query);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.ministers
      .filter((m) => tab === '전체' || m.role === tab)
      .filter((m) => !q || norm(m.name).includes(q) || norm(m.department).includes(q))
      .sort((a, b) => {
        const ra = ROLES.indexOf(a.role as (typeof ROLES)[number]);
        const rb = ROLES.indexOf(b.role as (typeof ROLES)[number]);
        return ra - rb || a.order - b.order;
      });
  }, [data, tab, q]);

  // 직분별 인원 (탭 배지)
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    data?.ministers.forEach((m) => (c[m.role] = (c[m.role] ?? 0) + 1));
    return c;
  }, [data]);

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'linear-gradient(160deg, #3A0D6E 0%, #4A1290 100%)' }}
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        {/* 헤더 + 닫기(X) */}
        <header className="sticky top-0 z-20 bg-[#3A0D6E]/95 px-3 pt-3 pb-2 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold">교회를 섬기는분</h1>
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

          {/* 검색창 */}
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-300" />
            <input
              type="text"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 또는 부서(교구) 검색"
              aria-label="이름 또는 부서 검색"
              className="h-12 w-full rounded-xl border border-purple-400/40 bg-slate-900/40 pl-10 pr-4 text-base text-white placeholder:text-purple-300/70 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>

          {/* 직분 필터 탭 (가로 스크롤) */}
          <div className="mt-2.5 -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => {
              const active = tab === t;
              const n = t === '전체' ? data?.count : counts[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'border-teal-400 bg-teal-400 text-[#3A0D6E]'
                      : 'border-purple-400/40 text-purple-100 hover:bg-white/5'
                  }`}
                >
                  {t}
                  {typeof n === 'number' && (
                    <span className={active ? 'ml-1 opacity-70' : 'ml-1 text-purple-300/70'}>
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </header>

        {/* 본문 */}
        <main className="flex-1 px-3 py-4">
          {error ? (
            <div className="mt-16 text-center text-purple-200/80">
              <p>명단을 불러오지 못했습니다.</p>
              <p className="mt-1 text-sm text-purple-300/60">잠시 후 다시 시도해 주세요.</p>
            </div>
          ) : !data ? (
            <div className="mt-16 text-center text-purple-200/70">불러오는 중…</div>
          ) : filtered.length === 0 ? (
            <div className="mt-16 text-center text-purple-200/70">검색 결과가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filtered.map((m) => (
                <button
                  key={`${m.role}-${m.name}-${m.order}`}
                  type="button"
                  onClick={() => setSelected(m)}
                  className="overflow-hidden rounded-2xl border border-purple-300/20 bg-black/20 text-left transition-colors hover:bg-black/30"
                >
                  <Photo src={m.photoUrl} name={m.name} className="aspect-[3/4] w-full" />
                  <div className="px-2.5 py-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[15px] font-bold text-white break-keep">{m.name}</span>
                      <span className="shrink-0 text-xs text-teal-300">{m.role}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-purple-200/80">{m.department}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 최종 업데이트 + 출처 */}
          {data && (
            <div className="mt-6 space-y-1 px-1 pb-4 text-center text-xs text-white/45">
              <p>최종 업데이트: {fmtDate(data.updatedAt)}</p>
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

      {/* 카드 상세 (큰 사진) */}
      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative w-full max-w-xs overflow-hidden rounded-2xl bg-[#2A0A52] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="닫기"
              className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>
            <Photo src={selected.photoUrl} name={selected.name} className="aspect-[3/4] w-full" />
            <div className="p-4">
              <div className="flex items-baseline gap-2">
                <h2 className="text-xl font-bold text-white break-keep">{selected.name}</h2>
                <span className="text-sm font-semibold text-teal-300">{selected.role}</span>
              </div>
              <p className="mt-1.5 text-base leading-relaxed text-purple-100 break-keep">
                {selected.department}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
