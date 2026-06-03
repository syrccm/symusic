import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, User, ExternalLink, ChevronDown } from 'lucide-react';

// public/data/ministers.json 스키마 (스크래퍼가 주 1회 갱신)
interface Minister {
  role: string;
  subRole?: string; // 장로 세부: '시무장로' | '은퇴장로' | '원로장로'
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

// 목회자 드롭다운(장로 제외, 직제 순)
const PASTOR_ROLES = ['목사', '강도사', '전임전도사', '교육전도사'] as const;
// 장로 드롭다운 (시무→은퇴→원로 순)
const ELDER_SUBROLES = ['시무장로', '은퇴장로', '원로장로'] as const;
// 팀별사역 드롭다운
const TEAMS = ['1', '2', '3', '4', '5'] as const;
const ALL = '전체';

// 검색 정규화: 공백 제거 + 소문자
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

// department에서 "○○교구"(십의자리 1~5) 추출 → 교구번호 / 팀(십의자리)
// 주의: "청년1팀" 등은 '교구' 글자가 없어 매칭되지 않음(=교구 아님)
const guOf = (dept: string): number | null => {
  const m = (dept || '').match(/([1-5]\d)\s*교구/);
  return m ? parseInt(m[1], 10) : null;
};
const teamOf = (dept: string): number | null => {
  const g = guOf(dept);
  return g ? Math.floor(g / 10) : null;
};

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

// 카드 한 개 (이름/직분/사역만, 연락처 없음). 장로는 세부 분류를 배지로.
function Card({ m, onClick }: { m: Minister; onClick: () => void }) {
  const badge = m.subRole || m.role;
  return (
    <button
      type="button"
      onClick={onClick}
      className="overflow-hidden rounded-2xl border border-purple-300/20 bg-black/20 text-left transition-colors hover:bg-black/30"
    >
      <Photo src={m.photoUrl} name={m.name} className="aspect-[3/4] w-full" />
      <div className="px-2.5 py-2">
        <div className="flex items-baseline gap-1">
          <span className="min-w-0 truncate text-[15px] font-bold text-white">{m.name}</span>
          <span className="shrink-0 text-xs text-teal-300">{badge}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-purple-200/80">{m.department}</p>
      </div>
    </button>
  );
}

// 폭에 따라 열 수가 자동으로 변하는 카드 그리드 (반응형 핵심)
function Grid({ items, onSelect }: { items: Minister[]; onSelect: (m: Minister) => void }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
    >
      {items.map((m) => (
        <Card key={`${m.role}-${m.subRole ?? ''}-${m.name}-${m.order}`} m={m} onClick={() => onSelect(m)} />
      ))}
    </div>
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
  const [selected, setSelected] = useState<Minister | null>(null);

  // 드롭다운 3개 (기본값 모두 "전체")
  const [pastorFilter, setPastorFilter] = useState<string>(ALL); // 목회자
  const [elderFilter, setElderFilter] = useState<string>(ALL); // 장로
  const [teamFilter, setTeamFilter] = useState<string>(ALL); // 팀별사역
  const [query, setQuery] = useState('');

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

  // 상호 배타 + 자동 전환 (어떤 드롭다운도 disabled 하지 않음)
  const onPastor = (v: string) => {
    setPastorFilter(v);
    if (v !== ALL) setElderFilter(ALL); // 목회자 선택 → 장로 모드 해제
  };
  const onElder = (v: string) => {
    setElderFilter(v);
    if (v !== ALL) {
      // 장로 모드 → 목회자·팀 리셋(장로엔 팀 미적용)
      setPastorFilter(ALL);
      setTeamFilter(ALL);
    }
  };
  const onTeam = (v: string) => {
    setTeamFilter(v);
    if (v !== ALL) setElderFilter(ALL); // 팀은 목회자 모드와 결합 → 장로 모드 해제
  };

  // 인원수 집계 (드롭다운 라벨 병기용)
  const counts = useMemo(() => {
    const roles: Record<string, number> = {};
    const elders: Record<string, number> = {};
    const teams: Record<string, number> = {};
    let elderTotal = 0;
    let nonElder = 0;
    data?.ministers.forEach((m) => {
      if (m.role === '장로') {
        elderTotal += 1;
        if (m.subRole) elders[m.subRole] = (elders[m.subRole] ?? 0) + 1;
        return;
      }
      nonElder += 1;
      roles[m.role] = (roles[m.role] ?? 0) + 1;
      const t = teamOf(m.department);
      if (t) teams[String(t)] = (teams[String(t)] ?? 0) + 1;
    });
    return { roles, elders, teams, elderTotal, nonElder };
  }, [data]);

  // 정렬 비교자
  const byRoleOrder = (a: Minister, b: Minister) =>
    PASTOR_ROLES.indexOf(a.role as (typeof PASTOR_ROLES)[number]) -
      PASTOR_ROLES.indexOf(b.role as (typeof PASTOR_ROLES)[number]) || a.order - b.order;
  const byElderOrder = (a: Minister, b: Minister) =>
    ELDER_SUBROLES.indexOf(a.subRole as (typeof ELDER_SUBROLES)[number]) -
      ELDER_SUBROLES.indexOf(b.subRole as (typeof ELDER_SUBROLES)[number]) || a.order - b.order;

  // 최종 표시 결과: 평면 리스트 또는 교구별 그룹
  const view = useMemo(() => {
    if (!data) return { mode: 'flat' as const, items: [] as Minister[] };
    const q = norm(query);
    const matchQ = (m: Minister) =>
      !q || norm(m.name).includes(q) || norm(m.department).includes(q);

    const elders = data.ministers.filter((m) => m.role === '장로');
    const pastors = data.ministers.filter((m) => m.role !== '장로');

    // 1) 장로 모드 (장로 드롭다운이 '전체'가 아님)
    if (elderFilter !== ALL) {
      const items = elders
        .filter((m) => m.subRole === elderFilter)
        .filter(matchQ)
        .sort(byElderOrder);
      return { mode: 'flat' as const, items };
    }

    // 2) 목회자 모드 (장로 '전체')
    let pool = pastors;
    if (pastorFilter !== ALL) pool = pool.filter((m) => m.role === pastorFilter);
    pool = pool.filter(matchQ);

    // 2-a) 팀별사역 선택 → 목회자 풀에서 교구 그룹핑
    if (teamFilter !== ALL) {
      const teamNum = parseInt(teamFilter, 10);
      const inTeam = pool.filter((m) => teamOf(m.department) === teamNum);
      const byGu = new Map<number, Minister[]>();
      inTeam.forEach((m) => {
        const g = guOf(m.department)!;
        if (!byGu.has(g)) byGu.set(g, []);
        byGu.get(g)!.push(m);
      });
      const groups = [...byGu.keys()]
        .sort((a, b) => a - b)
        .map((g) => ({ title: `${g}교구`, items: byGu.get(g)!.sort(byRoleOrder) }));
      return { mode: 'grouped' as const, groups };
    }

    // 2-b) 팀 '전체' + 목회자 '전체' + 장로 '전체' → 전체 명단(목회자 + 장로)
    if (pastorFilter === ALL) {
      const items = [
        ...pool.slice().sort(byRoleOrder),
        ...elders.filter(matchQ).sort(byElderOrder),
      ];
      return { mode: 'flat' as const, items };
    }

    // 2-c) 특정 목회자 직분만
    return { mode: 'flat' as const, items: pool.slice().sort(byRoleOrder) };
  }, [data, pastorFilter, elderFilter, teamFilter, query]);

  const totalShown =
    view.mode === 'flat'
      ? view.items.length
      : view.groups.reduce((n, g) => n + g.items.length, 0);

  // 셀렉트 스타일: 활성(전체 아님)이면 teal 강조로 현재 모드를 분명히
  const selBase =
    'min-w-0 max-w-full appearance-none rounded-xl border py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400';
  const selCls = (active: boolean) =>
    `${selBase} ${
      active
        ? 'border-teal-400 bg-teal-500/20 font-semibold text-teal-100'
        : 'border-purple-400/40 bg-slate-900/40 text-white'
    }`;

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'linear-gradient(160deg, #3A0D6E 0%, #4A1290 100%)' }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
        {/* 헤더 + 닫기(X) */}
        <header className="sticky top-0 z-20 bg-[#3A0D6E]/95 px-3 pt-3 pb-2.5 backdrop-blur-sm sm:px-4">
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

          {/* 검색창 (전폭) */}
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

          {/* 드롭다운 3개: 좁으면 자동 줄바꿈(flex-wrap), 가로 오버플로 없음.
              ※ <select>를 <label>로 감싸면 크롬에서 클릭 시 팝업이 즉시 닫히므로
                 <div> + aria-label 로 둔다. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {/* 목회자 */}
            <div className="relative flex min-w-0 items-center">
              <select
                value={pastorFilter}
                onChange={(e) => onPastor(e.target.value)}
                aria-label="목회자 직분 선택"
                className={selCls(pastorFilter !== ALL)}
              >
                <option value={ALL}>목회자: 전체 ({counts.nonElder})</option>
                {PASTOR_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r} ({counts.roles[r] ?? 0})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-purple-300" />
            </div>

            {/* 장로 */}
            <div className="relative flex min-w-0 items-center">
              <select
                value={elderFilter}
                onChange={(e) => onElder(e.target.value)}
                aria-label="장로 분류 선택"
                className={selCls(elderFilter !== ALL)}
              >
                <option value={ALL}>장로: 전체 ({counts.elderTotal})</option>
                {ELDER_SUBROLES.map((s) => (
                  <option key={s} value={s}>
                    {s} ({counts.elders[s] ?? 0})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-purple-300" />
            </div>

            {/* 팀별사역 */}
            <div className="relative flex min-w-0 items-center">
              <select
                value={teamFilter}
                onChange={(e) => onTeam(e.target.value)}
                aria-label="팀별사역 선택"
                className={selCls(teamFilter !== ALL)}
              >
                <option value={ALL}>팀별사역: 전체</option>
                {TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {t}팀 ({counts.teams[t] ?? 0})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-purple-300" />
            </div>
          </div>
        </header>

        {/* 본문 */}
        <main className="flex-1 px-3 py-4 sm:px-4">
          {error ? (
            <div className="mt-16 text-center text-purple-200/80">
              <p>명단을 불러오지 못했습니다.</p>
              <p className="mt-1 text-sm text-purple-300/60">잠시 후 다시 시도해 주세요.</p>
            </div>
          ) : !data ? (
            <div className="mt-16 text-center text-purple-200/70">불러오는 중…</div>
          ) : totalShown === 0 ? (
            <div className="mt-16 text-center text-purple-200/70">검색 결과가 없습니다.</div>
          ) : view.mode === 'flat' ? (
            <Grid items={view.items} onSelect={setSelected} />
          ) : (
            <div className="space-y-6">
              {view.groups.map((g) => (
                <section key={g.title}>
                  <h2 className="mb-2.5 flex items-baseline gap-2 border-b border-teal-400/40 pb-1.5">
                    <span className="text-base font-bold text-teal-300">{g.title}</span>
                    <span className="text-xs text-purple-200/60">{g.items.length}명</span>
                  </h2>
                  <Grid items={g.items} onSelect={setSelected} />
                </section>
              ))}
            </div>
          )}

          {/* 최종 업데이트 + 출처 */}
          {data && (
            <div className="mt-8 space-y-1 px-1 pb-4 text-center text-xs text-white/45">
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
                <span className="text-sm font-semibold text-teal-300">
                  {selected.subRole || selected.role}
                </span>
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
