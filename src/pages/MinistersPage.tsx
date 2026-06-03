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

// 목회자 직분(장로 제외, 직제 순)
const PASTOR_ROLES = ['목사', '강도사', '전임전도사', '교육전도사'] as const;
// 장로 세부 (시무→은퇴→원로 순)
const ELDER_SUBROLES = ['시무장로', '은퇴장로', '원로장로'] as const;
const TEAMS = ['1', '2', '3', '4', '5'] as const;
const NONE = ''; // 드롭다운 "선택 안 함"
const ETC = '기타 사역';

// 부서 분류 트리 (중간분류 cat → 소분류 sub + 매칭 키워드).
// 분류는 "교구 우선 → 트리 정의 순서상 첫 매칭" 규칙. 순서가 우선순위이므로
// 국제사역을 교회학교보다 앞에 둔다(예: "영어청소년부"의 '소년부' 부분문자열 오매칭 방지).
const DEPT_TREE: { cat: string; subs: { sub: string; kw: string[] }[] }[] = [
  {
    cat: '목회행정',
    subs: [
      { sub: '목회비서', kw: ['목회비서'] },
      { sub: '목회행정', kw: ['목회행정', '행정'] },
      { sub: '로드맵미니스트리', kw: ['로드맵'] },
    ],
  },
  {
    cat: '국제사역',
    subs: [
      { sub: '세계선교', kw: ['세계선교'] },
      { sub: '일본어예배부', kw: ['일본'] },
      { sub: '영어청소년부', kw: ['영어청소년'] },
      { sub: '영어예배부', kw: ['영어예배부'] },
      { sub: '러시아어예배부', kw: ['러시아'] },
      { sub: '국제어린이주일학교', kw: ['국제어린이'] },
      { sub: '인도네시아어예배부', kw: ['인도네시아'] },
      { sub: '필리핀어예배부', kw: ['필리핀'] },
      { sub: '캄보디아어예배부', kw: ['캄보디아'] },
      { sub: '중국어예배부', kw: ['중국'] },
      { sub: '베트남어예배부', kw: ['베트남'] },
      { sub: '미얀마어예배부', kw: ['미얀마'] },
      { sub: '네팔어예배부', kw: ['네팔'] },
      { sub: '몽골어예배부', kw: ['몽골'] },
      { sub: '우즈벡어예배부', kw: ['우즈'] },
    ],
  },
  {
    cat: '긍휼사역',
    subs: [
      { sub: '농아부', kw: ['농아'] },
      { sub: '사랑부', kw: ['사랑부'] },
      { sub: '상담국', kw: ['상담'] },
      { sub: '이주민', kw: ['이주민', '난민'] },
      { sub: '통일선교', kw: ['통일'] },
    ],
  },
  { cat: '찬양국', subs: [{ sub: '', kw: ['찬양국'] }] },
  { cat: '국내선교', subs: [{ sub: '', kw: ['국내선교'] }] },
  {
    cat: '교회학교',
    subs: [
      { sub: '영아부', kw: ['영아부'] },
      { sub: '유아부', kw: ['유아부'] },
      { sub: '유년부', kw: ['유년부'] },
      { sub: '유치부', kw: ['유치부'] },
      { sub: '초등부', kw: ['초등부'] },
      { sub: '소년부', kw: ['소년부'] },
      { sub: '중등부', kw: ['중등부'] },
      { sub: '고등부', kw: ['고등부'] },
    ],
  },
  {
    cat: '청년국',
    subs: [
      { sub: '청년 1팀', kw: ['청년1팀'] },
      { sub: '청년 2팀', kw: ['청년2팀'] },
      { sub: '청년 3팀', kw: ['청년3팀'] },
      { sub: '청년 4팀', kw: ['청년4팀'] },
    ],
  },
  {
    cat: '협동목사',
    subs: [
      { sub: '협동목사', kw: ['협동목사'] },
      { sub: '서울로교회', kw: ['서울로교회'] },
    ],
  },
  { cat: '목회개발', subs: [{ sub: '', kw: ['목회개발'] }] },
];
const DEPT_CATS = DEPT_TREE.map((c) => c.cat);
const catHasSubs = (cat: string) =>
  (DEPT_TREE.find((c) => c.cat === cat)?.subs ?? []).some((s) => s.sub !== '');

// 검색 정규화: 공백 제거 + 소문자
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

// department에서 "○○교구"(십의자리 1~5) 추출
const guOf = (dept: string): number | null => {
  const m = (dept || '').match(/([1-5]\d)\s*교구/);
  return m ? parseInt(m[1], 10) : null;
};

// 교역자(목회자) 1명 분류: 교구 우선 → 부서 트리 첫 매칭 → 기타 사역.
// ※ 장로는 호출 전에 role로 걸러지므로 절대 여기로 오지 않는다.
type Classified =
  | { kind: 'team'; team: number; gu: number }
  | { kind: 'dept'; cat: string; sub: string }
  | { kind: 'etc' };
function classify(dept: string): Classified {
  const gu = guOf(dept);
  if (gu != null) return { kind: 'team', team: Math.floor(gu / 10), gu };
  for (const { cat, subs } of DEPT_TREE) {
    for (const { sub, kw } of subs) {
      if (kw.some((k) => dept.includes(k))) return { kind: 'dept', cat, sub };
    }
  }
  return { kind: 'etc' };
}

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
        <Card
          key={`${m.role}-${m.subRole ?? ''}-${m.name}-${m.order}`}
          m={m}
          onClick={() => onSelect(m)}
        />
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

  // 드롭다운 3개 — 기본은 모두 "선택 안 함"(NONE). 한 번에 하나만 활성.
  const [pastorSel, setPastorSel] = useState<string>(NONE);
  const [teamSel, setTeamSel] = useState<string>(NONE);
  const [elderSel, setElderSel] = useState<string>(NONE);
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

  // 상호 배타: 한 드롭다운 선택 시 나머지 둘 + 검색어 리셋 (한 번에 하나의 기준만)
  const onPastor = (v: string) => {
    setPastorSel(v);
    setTeamSel(NONE);
    setElderSel(NONE);
    setQuery('');
  };
  const onTeam = (v: string) => {
    setTeamSel(v);
    setPastorSel(NONE);
    setElderSel(NONE);
    setQuery('');
  };
  const onElder = (v: string) => {
    setElderSel(v);
    setPastorSel(NONE);
    setTeamSel(NONE);
    setQuery('');
  };
  // 검색은 독립적: 입력이 있으면 드롭다운 선택을 해제하고 전역 검색
  const onQuery = (v: string) => {
    setQuery(v);
    if (v.trim()) {
      setPastorSel(NONE);
      setTeamSel(NONE);
      setElderSel(NONE);
    }
  };

  // 인원수 집계 (드롭다운 라벨 병기). 장로는 role로 분리.
  const counts = useMemo(() => {
    const roles: Record<string, number> = {};
    const elders: Record<string, number> = {};
    const teams: Record<string, number> = {};
    const cats: Record<string, number> = {};
    let etc = 0;
    data?.ministers.forEach((m) => {
      if (m.role === '장로') {
        if (m.subRole) elders[m.subRole] = (elders[m.subRole] ?? 0) + 1;
        return;
      }
      roles[m.role] = (roles[m.role] ?? 0) + 1;
      const c = classify(m.department);
      if (c.kind === 'team') teams[String(c.team)] = (teams[String(c.team)] ?? 0) + 1;
      else if (c.kind === 'dept') cats[c.cat] = (cats[c.cat] ?? 0) + 1;
      else etc += 1;
    });
    return { roles, elders, teams, cats, etc };
  }, [data]);

  // 정렬 비교자
  const byRoleOrder = (a: Minister, b: Minister) =>
    PASTOR_ROLES.indexOf(a.role as (typeof PASTOR_ROLES)[number]) -
      PASTOR_ROLES.indexOf(b.role as (typeof PASTOR_ROLES)[number]) || a.order - b.order;
  const byElderOrder = (a: Minister, b: Minister) =>
    ELDER_SUBROLES.indexOf(a.subRole as (typeof ELDER_SUBROLES)[number]) -
      ELDER_SUBROLES.indexOf(b.subRole as (typeof ELDER_SUBROLES)[number]) || a.order - b.order;

  const hasSelection = Boolean(pastorSel || teamSel || elderSel);
  const q = norm(query);

  // 표시 결과. mode: 'idle'(안내) | 'flat' | 'grouped'
  const view = useMemo(() => {
    if (!data) return { mode: 'idle' as const };
    const matchQ = (m: Minister) =>
      norm(m.name).includes(q) || norm(m.department).includes(q);

    const elders = data.ministers.filter((m) => m.role === '장로');
    const pastors = data.ministers.filter((m) => m.role !== '장로'); // 목회자 = role 기준

    // 1) 검색 (드롭다운 독립) — 이름/부서로 전체(장로 포함) 검색
    if (q) {
      const items = [
        ...pastors.filter(matchQ).sort(byRoleOrder),
        ...elders.filter(matchQ).sort(byElderOrder),
      ];
      return { mode: 'flat' as const, items };
    }

    // 2) 목회자 직분
    if (pastorSel) {
      return { mode: 'flat' as const, items: pastors.filter((m) => m.role === pastorSel).sort(byRoleOrder) };
    }

    // 3) 장로 분류
    if (elderSel) {
      return { mode: 'flat' as const, items: elders.filter((m) => m.subRole === elderSel).sort(byElderOrder) };
    }

    // 4) 팀별사역 (장로 원천 제외: pastors 대상)
    if (teamSel) {
      if (TEAMS.includes(teamSel as (typeof TEAMS)[number])) {
        const teamNum = parseInt(teamSel, 10);
        const inTeam = pastors.filter((m) => {
          const c = classify(m.department);
          return c.kind === 'team' && c.team === teamNum;
        });
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
      if (teamSel === ETC) {
        return {
          mode: 'flat' as const,
          items: pastors.filter((m) => classify(m.department).kind === 'etc').sort(byRoleOrder),
        };
      }
      // 부서 중간분류
      const catDef = DEPT_TREE.find((c) => c.cat === teamSel);
      const inCat = pastors.filter((m) => {
        const c = classify(m.department);
        return c.kind === 'dept' && c.cat === teamSel;
      });
      if (!catDef || !catHasSubs(teamSel)) {
        return { mode: 'flat' as const, items: inCat.sort(byRoleOrder) };
      }
      const bySub = new Map<string, Minister[]>();
      inCat.forEach((m) => {
        const c = classify(m.department);
        const sub = c.kind === 'dept' ? c.sub || '기타' : '기타';
        if (!bySub.has(sub)) bySub.set(sub, []);
        bySub.get(sub)!.push(m);
      });
      const order = catDef.subs.map((s) => s.sub);
      const groups = order
        .filter((s) => bySub.has(s))
        .map((s) => ({ title: s, items: bySub.get(s)!.sort(byRoleOrder) }));
      return { mode: 'grouped' as const, groups };
    }

    // 5) 아무 것도 선택/검색 안 됨 → 안내
    return { mode: 'idle' as const };
  }, [data, pastorSel, teamSel, elderSel, q]);

  const totalShown =
    view.mode === 'flat'
      ? view.items.length
      : view.mode === 'grouped'
      ? view.groups.reduce((n, g) => n + g.items.length, 0)
      : 0;

  // 셀렉트 스타일: 활성(선택됨)이면 teal 강조로 현재 보고 있는 기준을 분명히
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

          {/* 검색창 (항상 활성, 드롭다운과 독립) */}
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-300" />
            <input
              type="text"
              inputMode="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="이름 또는 부서(교구) 검색"
              aria-label="이름 또는 부서 검색"
              className="h-12 w-full rounded-xl border border-purple-400/40 bg-slate-900/40 pl-10 pr-4 text-base text-white placeholder:text-purple-300/70 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>

          {/* 드롭다운 3개 (좌→우: 목회자 / 팀별사역 / 장로). flex-wrap, 가로 오버플로 없음.
              ※ <select>를 <label>로 감싸면 크롬에서 클릭 시 팝업이 즉시 닫히므로 <div> + aria-label. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {/* 목회자 */}
            <div className="relative flex min-w-0 items-center">
              <select
                value={pastorSel}
                onChange={(e) => onPastor(e.target.value)}
                aria-label="목회자 직분 선택"
                className={selCls(pastorSel !== NONE)}
              >
                <option value={NONE}>목회자 ▾</option>
                {PASTOR_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r} ({counts.roles[r] ?? 0})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-purple-300" />
            </div>

            {/* 팀별사역: 교구(1~5팀) + 부서 9분류 + 기타 사역 (optgroup으로 구분) */}
            <div className="relative flex min-w-0 items-center">
              <select
                value={teamSel}
                onChange={(e) => onTeam(e.target.value)}
                aria-label="팀별사역 선택"
                className={selCls(teamSel !== NONE)}
              >
                <option value={NONE}>팀별사역 ▾</option>
                <optgroup label="교구(팀)">
                  {TEAMS.map((t) => (
                    <option key={t} value={t}>
                      {t}팀 ({counts.teams[t] ?? 0})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="부서">
                  {DEPT_CATS.map((c) => (
                    <option key={c} value={c}>
                      {c} ({counts.cats[c] ?? 0})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="기타">
                  <option value={ETC}>
                    {ETC} ({counts.etc})
                  </option>
                </optgroup>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-purple-300" />
            </div>

            {/* 장로 (맨 우측) */}
            <div className="relative flex min-w-0 items-center">
              <select
                value={elderSel}
                onChange={(e) => onElder(e.target.value)}
                aria-label="장로 분류 선택"
                className={selCls(elderSel !== NONE)}
              >
                <option value={NONE}>장로 ▾</option>
                {ELDER_SUBROLES.map((s) => (
                  <option key={s} value={s}>
                    {s} ({counts.elders[s] ?? 0})
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
          ) : !hasSelection && !q ? (
            <div className="mt-20 flex flex-col items-center gap-3 px-6 text-center text-purple-200/70">
              <Search className="h-10 w-10 text-purple-300/40" />
              <p className="text-base">위에서 항목을 선택하거나 이름으로 검색하세요</p>
            </div>
          ) : totalShown === 0 ? (
            <div className="mt-16 text-center text-purple-200/70">검색 결과가 없습니다.</div>
          ) : view.mode === 'flat' ? (
            <Grid items={view.items} onSelect={setSelected} />
          ) : view.mode === 'grouped' ? (
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
          ) : null}

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
