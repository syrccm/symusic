import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Search } from 'lucide-react';
import { shorterCatechism, type CatechismItem } from '@/data/westminsterShorter';
import { largerCatechism } from '@/data/westminsterLarger';
import { confession, type ConfessionChapter } from '@/data/westminsterConfession';
import BibleVerseModal from '@/components/BibleVerseModal';
import { refHasValidVerse } from '@/utils/bibleParser';

type TabKey = 'intro' | 'confession' | 'shorter' | 'larger';
type DocKey = 'confession' | 'shorter' | 'larger';

// 순서: 소개 → 신앙고백서 → 소요리문답 → 대요리문답
const TABS: { key: TabKey; label: string }[] = [
  { key: 'intro', label: '소개' },
  { key: 'confession', label: '신앙고백서' },
  { key: 'shorter', label: '소요리문답' },
  { key: 'larger', label: '대요리문답' },
];

// 각 문서 탭 상단에 표시할 전체 이름 + 한 줄 설명
const DOC_META: Record<DocKey, { title: string; desc: string }> = {
  confession: {
    title: '웨스트민스터 신앙고백서',
    desc: '성경의 가르침을 33장으로 체계적으로 정리한 신앙의 표준',
  },
  shorter: {
    title: '웨스트민스터 소요리문답',
    desc: '107개의 문답으로 정리된 신앙 교육 교재',
  },
  larger: {
    title: '웨스트민스터 대요리문답',
    desc: '196개의 문답으로 정리된 심화 신앙 교육 교재',
  },
};

// 검색 정규화: 공백 제거 + 소문자
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

function ReferenceList({
  references,
  onRefClick,
}: {
  references: string[];
  onRefClick: (ref: string) => void;
}) {
  // 실제 존재하는 절을 가진 참조만 노출 (잘못된 참조 버튼은 숨김)
  const validRefs = (references ?? []).filter(refHasValidVerse);
  if (validRefs.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-x-2.5 gap-y-1">
      {validRefs.map((ref, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onRefClick(ref)}
          className="cursor-pointer text-xs leading-relaxed text-teal-300 underline underline-offset-2 transition-colors hover:text-teal-200"
        >
          {ref}
        </button>
      ))}
    </div>
  );
}

// 문답(소요리/대요리) 아코디언 항목
function CatechismRow({
  item,
  onRefClick,
}: {
  item: CatechismItem;
  onRefClick: (ref: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-purple-400/20 bg-black/15 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-purple-400/10"
      >
        <span className="mt-0.5 min-w-[2.25rem] shrink-0 text-sm font-bold text-teal-400">
          {item.number}문
        </span>
        <span className="flex-1 text-[15px] font-medium leading-snug text-gray-100">
          {item.question}
        </span>
        <ChevronDown
          className={`mt-0.5 h-5 w-5 shrink-0 text-purple-300 transition-transform duration-300 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-purple-400/15 px-4 py-3.5 pl-[3.75rem]">
            <p className="text-[15px] leading-relaxed text-gray-200">{item.answer}</p>
            <ReferenceList references={item.references} onRefClick={onRefClick} />
          </div>
        </div>
      </div>
    </div>
  );
}

// 신앙고백서 장(chapter) 아코디언 항목
function ChapterRow({
  item,
  onRefClick,
}: {
  item: ConfessionChapter;
  onRefClick: (ref: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-purple-400/20 bg-black/15 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-purple-400/10"
      >
        <span className="mt-0.5 min-w-[2.75rem] shrink-0 text-sm font-bold text-teal-400">
          {item.chapter}장
        </span>
        <span className="flex-1 text-[15px] font-medium leading-snug text-gray-100">
          {item.title}
        </span>
        <ChevronDown
          className={`mt-0.5 h-5 w-5 shrink-0 text-purple-300 transition-transform duration-300 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 border-t border-purple-400/15 px-4 py-3.5">
            {item.sections.map((sec) => (
              <div key={sec.number} className="flex gap-3">
                <span className="mt-0.5 shrink-0 text-sm font-bold text-teal-400">
                  {sec.number}.
                </span>
                <div className="flex-1">
                  <p className="text-[15px] leading-relaxed text-gray-200">{sec.text}</p>
                  <ReferenceList references={sec.references} onRefClick={onRefClick} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 각 탭 콘텐츠 최상단의 문서 타이틀 + 한 줄 설명 (teal 하단 구분선)
function DocHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4 border-b-2 border-teal-400/70 pb-3">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-white/60">{desc}</p>
    </div>
  );
}

// 소개 본문(흰 배경)에서 핵심 단어만 강조 — 섹션당 2~3개
const B = ({ children }: { children: ReactNode }) => (
  <b className="font-bold text-gray-900">{children}</b>
);

// 소개 탭 아코디언 섹션 (참고: 김중락 박사(캠브리지) · 주간기독신문)
const INTRO_SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: '웨스트민스터란 무엇인가?',
    body: (
      <>
        <p>
          <B>웨스트민스터(Westminster)</B>는 영국 런던의 지명으로, 국회의사당과
          웨스트민스터 사원(Westminster Abbey)이 자리한 곳입니다.
        </p>
        <p>
          1643년, 잉글랜드 의회는 교회를 성경에 따라 바르게 개혁하기 위해 학식
          있는 신학자들을 이곳 웨스트민스터 사원에 불러 모아 총회를 열었습니다.
          회의가 열린 장소의 이름을 따라 이 모임을 <B>웨스트민스터 총회</B>라
          부르게 되었습니다.
        </p>
        <p>
          여기서 작성된 신앙고백서와 교리문답이 바로 오늘날 장로교·개혁교회가
          따르는 <B>웨스트민스터 표준문서</B>입니다.
        </p>
      </>
    ),
  },
  {
    title: '역사적 배경',
    body: (
      <>
        <p>
          16세기 유럽의 종교개혁은 잉글랜드에도 밀려왔습니다. <B>헨리 8세</B>는
          1534년 로마 교황과 결별하고 국교회를 세웠지만, 예배와 성례, 주교 제도는
          여전히 로마 가톨릭의 전통을 그대로 두어 개혁이 불완전했습니다. 당시
          잉글랜드 교회는 “눈을 감으면 신교, 귀를 막으면 로마 가톨릭”이라는 평을
          들을 정도였습니다.
        </p>
        <p>
          이에 더 철저한 성경적 개혁을 요구하는 청교도(Puritan) 운동이
          일어났습니다. 한편 스코틀랜드에서는 <B>존 녹스</B>가 제네바에서 칼뱅의
          지도를 받고 돌아와(1560년) 장로회 제도를 세우고 완전한 종교개혁을
          이루었습니다.
        </p>
        <p>
          그러나 찰스 1세는 교회에 제단과 미사 예식, 주교 제도를 다시 들여오며
          가톨릭화를 밀어붙였고, 이는 청교도와 장로교도는 물론 일반 국민의 분노를
          샀습니다. 왕과 의회의 갈등은 마침내 청교도 혁명(내전)으로 이어졌습니다.
        </p>
        <p>
          1638년 스코틀랜드는 국민언약을 맺었고, 1643년에는 잉글랜드 의회파와
          ‘엄숙동맹과 언약’을 체결했습니다. 바로 이 언약을 통해 교회 개혁을 위한{' '}
          <B>웨스트민스터 총회</B>가 소집되었습니다.
        </p>
      </>
    ),
  },
  {
    title: '웨스트민스터 총회',
    body: (
      <>
        <p>
          웨스트민스터 총회는 <B>약 5년간(1643~1649년)</B> 무려 1,163차례의 회의를
          거쳤습니다. 기도와 예배, 금식이 함께한 경건의 훈련 과정이기도 했습니다.
        </p>
        <p>
          이 자리에는 <B>121명의 학식 있는 신학자와 목사, 의원</B>들이 참여했고,
          스코틀랜드 장로교회의 대표들도 함께했습니다.
        </p>
        <p>총회는 네 가지 표준문서를 작성했습니다.</p>
        <ul className="ml-1 list-inside list-disc space-y-1">
          <li>신앙고백서</li>
          <li>대·소요리문답</li>
          <li>예배모범</li>
          <li>장로회 정치</li>
        </ul>
      </>
    ),
  },
  {
    title: '세 문서의 목적과 차이',
    body: (
      <>
        <p>
          <B>신앙고백서</B> — 성경의 가르침을 종합하여 체계적으로 정리한 신앙의
          표준입니다. 무엇을 믿는지를 33개 장으로 진술합니다.
        </p>
        <p>
          <B>소요리문답</B> — 젊은이와 입교자(어린이)를 가르치기 위한 학습용
          교재입니다. 짧고 외우기 쉬운 107개의 문답으로 되어 있습니다.
        </p>
        <p>
          <B>대요리문답</B> — 설교자와 교사를 위한 심화 교재입니다. 196개의
          문답으로 더 깊고 자세하게 다룹니다.
        </p>
      </>
    ),
  },
  {
    title: '역사적 의미와 신앙적 가치',
    body: (
      <>
        <p>
          웨스트민스터 표준문서는 <B>종교개혁 신학의 완성</B>으로 평가받으며,
          기독교 역사상 가장 명확하고 정교한 신앙고백서 중 하나로 꼽힙니다.
        </p>
        <p>
          1660년 왕정복고 이후 잉글랜드는 이 문서를 폐기했지만, 스코틀랜드 교회가
          계속 받아들여 전 세계 장로교·개혁교회로 퍼져 나갔습니다.
        </p>
        <p>
          오늘날 이 문서는 전 세계 장로교·개혁교회의 신앙 표준이며, <B>한국 장로교
          모든 교단의 신조</B>이기도 합니다.
        </p>
      </>
    ),
  },
  {
    title: '우리에게 주는 의미',
    body: (
      <>
        <p>
          웨스트민스터 표준문서는 오늘날 많은 그리스도인이 잊어버린{' '}
          <B>교리적 기초</B>를 다시 세워 줍니다.
        </p>
        <p>
          이 앱에서는 찬양 가사와 신앙고백을 연결하여, 우리가 부르는 노래가 곧
          신앙의 고백이 되도록 돕습니다.
        </p>
        <p>
          바라기는 이 고백이 머릿속 지식에 머무르지 않고, <B>우리의 삶 속에
          녹아드는 실제 고백</B>이 되기를 소망합니다.
        </p>
      </>
    ),
  },
];

// 소개 탭: 표준문서 개관 아코디언 (첫 섹션 기본 펼침)
function IntroTab() {
  const [openSet, setOpenSet] = useState<Set<number>>(() => new Set([0]));
  const toggle = (i: number) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <div>
      <DocHeader
        title="웨스트민스터 표준문서"
        desc="신앙고백서와 교리문답이 언제, 왜, 어떻게 만들어졌는가"
      />
      <div className="space-y-2.5">
        {INTRO_SECTIONS.map((s, i) => {
          const open = openSet.has(i);
          return (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-purple-400/20 bg-black/15"
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-purple-400/10"
              >
                <span className="flex-1 text-[15px] font-bold text-teal-400">
                  {s.title}
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-purple-300 transition-transform duration-300 ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className={`grid transition-all duration-300 ease-in-out ${
                  open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  {/* 본문만 흰 배경 + 검정 글자로 가독성 강화. 카드 rounded-xl
                      overflow-hidden 덕분에 하단 모서리가 자연스럽게 둥글게 연결됨 */}
                  <div className="space-y-4 bg-white px-4 py-4 text-base leading-relaxed text-gray-900">
                    {s.body}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-5 px-1 text-xs leading-relaxed text-white/40">
        참고: 김중락 박사 (캠브리지 대학), 주간기독신문
      </p>
    </div>
  );
}

interface ConfessionPageProps {
  /** 오버레이로 띄울 때 닫기 콜백. 없으면 라우트 모드(뒤로가기). */
  onClose?: () => void;
}

export default function ConfessionPage({ onClose }: ConfessionPageProps = {}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('confession');
  const [query, setQuery] = useState('');
  // 클릭한 성경 구절(개역한글 모달)
  const [verseRef, setVerseRef] = useState<string | null>(null);

  const q = norm(query);

  const filteredShorter = useMemo(() => {
    if (!q) return shorterCatechism;
    return shorterCatechism.filter(
      (it) =>
        String(it.number) === query.trim() ||
        norm(it.question).includes(q) ||
        norm(it.answer).includes(q)
    );
  }, [q, query]);

  const filteredLarger = useMemo(() => {
    if (!q) return largerCatechism;
    return largerCatechism.filter(
      (it) =>
        String(it.number) === query.trim() ||
        norm(it.question).includes(q) ||
        norm(it.answer).includes(q)
    );
  }, [q, query]);

  const filteredConfession = useMemo(() => {
    if (!q) return confession;
    return confession.filter(
      (ch) =>
        String(ch.chapter) === query.trim() ||
        norm(ch.title).includes(q) ||
        ch.sections.some((s) => norm(s.text).includes(q))
    );
  }, [q, query]);

  const resultCount =
    tab === 'shorter'
      ? filteredShorter.length
      : tab === 'larger'
      ? filteredLarger.length
      : filteredConfession.length;

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'linear-gradient(160deg, #3A0D6E 0%, #4A1290 100%)' }}
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        {/* 헤더 + 뒤로가기 */}
        <header className="sticky top-0 z-20 bg-[#3A0D6E]/95 px-3 pt-3 pb-2 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (onClose ? onClose() : navigate('/'))}
              aria-label="뒤로가기"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-bold">신앙고백문답</h1>
          </div>

          {/* 검색창 (소개 탭에서는 숨김) */}
          {tab !== 'intro' && (
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-300" />
              <input
                type="text"
                inputMode="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="문답 번호 또는 키워드 검색"
                aria-label="문답 번호 또는 키워드 검색"
                className="h-12 w-full rounded-xl border border-purple-400/40 bg-slate-900/40 pl-10 pr-4 text-base text-white placeholder:text-purple-300/70 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
              />
            </div>
          )}

          {/* 탭 */}
          <div className="mt-3 flex border-b border-purple-400/30">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`relative flex-1 pb-2.5 pt-1 text-center text-[15px] font-medium transition-colors ${
                    active ? 'text-teal-400' : 'text-purple-200/70 hover:text-purple-100'
                  }`}
                >
                  {t.label}
                  {active && (
                    <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-teal-400" />
                  )}
                </button>
              );
            })}
          </div>
        </header>

        {/* 본문 */}
        <main className="flex-1 px-3 py-4">
          {tab === 'intro' ? (
            <IntroTab />
          ) : (
            <>
              {/* 문서 전체 이름 + 설명 */}
              <DocHeader title={DOC_META[tab].title} desc={DOC_META[tab].desc} />

              <p className="mb-3 px-1 text-xs text-purple-200/70">
                {query
                  ? `검색 결과 ${resultCount}건`
                  : `전체 ${resultCount}${tab === 'confession' ? '장' : '문답'}`}
              </p>

              {resultCount === 0 ? (
                <div className="mt-16 text-center text-purple-200/70">
                  <p>검색 결과가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-2.5 pb-10">
                  {tab === 'shorter' &&
                    filteredShorter.map((it) => (
                      <CatechismRow key={it.number} item={it} onRefClick={setVerseRef} />
                    ))}
                  {tab === 'larger' &&
                    filteredLarger.map((it) => (
                      <CatechismRow key={it.number} item={it} onRefClick={setVerseRef} />
                    ))}
                  {tab === 'confession' &&
                    filteredConfession.map((ch) => (
                      <ChapterRow key={ch.chapter} item={ch} onRefClick={setVerseRef} />
                    ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <BibleVerseModal
        open={verseRef !== null}
        onOpenChange={(o) => !o && setVerseRef(null)}
        refString={verseRef}
      />
    </div>
  );
}
