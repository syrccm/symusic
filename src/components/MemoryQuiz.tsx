import { useState } from 'react';
import { X, Check } from 'lucide-react';
import {
  buildQuestions,
  type QuizItem,
  type QuizKind,
  type QuizQuestion,
} from '@/utils/memoryQuiz';

interface MemoryQuizProps {
  /** 현재 탭(tier)에서 미리 추출한 구절+본문 리스트. */
  items: QuizItem[];
  /** 퀴즈 종료 → 목록 복귀. */
  onClose: () => void;
}

const KIND_OPTIONS: { kind: QuizKind; label: string; desc: string }[] = [
  { kind: 'ref-to-text', label: '본문 보고 위치 맞히기', desc: '성경 본문을 읽고 어느 구절(장:절)인지 고릅니다.' },
  { kind: 'text-to-ref', label: '위치 보고 본문 맞히기', desc: '구절(장:절)을 보고 알맞은 본문을 고릅니다.' },
];

const CLOSE_BTN =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-500/30 bg-slate-800/90 text-white shadow-lg transition-colors hover:bg-slate-700';

/**
 * 성경암송 — 전체화면 "전체 퀴즈" 오버레이(MemoryPractice와 동일 패턴).
 * 내부 3단계: ① 종류 선택 → ② 30문항 진행(즉시 정오 + 다음) → ③ 결과.
 * 진도(useMemoryProgress)는 건드리지 않는 자가 테스트.
 */
export default function MemoryQuiz({ items, onClose }: MemoryQuizProps) {
  const [kind, setKind] = useState<QuizKind | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null); // 현재 문제에서 고른 보기(null=미응답)

  const start = (k: QuizKind) => {
    setQuestions(buildQuestions(items, k));
    setKind(k);
    setIdx(0);
    setScore(0);
    setSelected(null);
  };

  const reset = () => {
    setKind(null);
    setQuestions([]);
    setIdx(0);
    setScore(0);
    setSelected(null);
  };

  const answer = (optIdx: number) => {
    if (selected !== null) return; // 이미 응답 → 중복 선택 방지
    setSelected(optIdx);
    if (optIdx === questions[idx].answerIndex) setScore((s) => s + 1);
  };

  const next = () => {
    setSelected(null);
    setIdx((i) => i + 1);
  };

  // ── 단계별 화면 ──────────────────────────────────────────────
  const renderSelect = () => (
    <>
      <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <span className="text-base font-bold text-teal-200">전체 퀴즈</span>
        <button type="button" onClick={onClose} aria-label="닫기" title="닫기" className={CLOSE_BTN}>
          <X className="h-5 w-5" />
        </button>
      </header>
      <main className="flex flex-1 flex-col justify-center gap-4 px-5 pb-12">
        <p className="text-center text-sm text-purple-200/70">퀴즈 종류를 선택하세요 · 총 {items.length}문항</p>
        {KIND_OPTIONS.map((o) => (
          <button
            key={o.kind}
            type="button"
            onClick={() => start(o.kind)}
            className="rounded-2xl border border-purple-300/30 bg-black/20 p-5 text-left transition-colors hover:bg-black/30 active:bg-black/40"
          >
            <div className="text-lg font-bold text-white">{o.label}</div>
            <div className="mt-1 text-sm text-purple-200/70">{o.desc}</div>
          </button>
        ))}
      </main>
    </>
  );

  const renderPlay = () => {
    const q = questions[idx];
    const answered = selected !== null;
    return (
      <>
        <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
          <span className="text-sm font-semibold text-purple-200/80">
            {idx + 1} / {questions.length}
          </span>
          <span className="text-sm font-semibold text-teal-200">점수 {score}</span>
          <button type="button" onClick={onClose} aria-label="닫기" title="닫기" className={CLOSE_BTN}>
            <X className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
          {/* 문제(prompt) */}
          <div className="mb-4 rounded-xl border border-purple-300/20 bg-black/20 p-4">
            {kind === 'ref-to-text' ? (
              <p className="break-keep text-lg leading-relaxed text-white">{q.prompt}</p>
            ) : (
              <p className="text-center text-2xl font-bold tracking-wide text-teal-200">{q.prompt}</p>
            )}
          </div>

          {/* 보기 4개 */}
          <div className="space-y-2">
            {q.options.map((opt, oi) => {
              const isAnswer = oi === q.answerIndex;
              const isPicked = oi === selected;
              let cls = 'border-purple-300/20 bg-black/20 text-purple-100 hover:bg-white/5';
              if (answered) {
                if (isAnswer) cls = 'border-teal-400/70 bg-teal-500/25 text-teal-100';
                else if (isPicked) cls = 'border-red-400/70 bg-red-500/25 text-red-100';
                else cls = 'border-purple-300/10 bg-black/10 text-purple-200/40';
              }
              return (
                <button
                  key={oi}
                  type="button"
                  disabled={answered}
                  onClick={() => answer(oi)}
                  className={`flex w-full items-start gap-2 rounded-xl border px-4 py-3 text-left text-base break-keep transition-colors ${cls}`}
                >
                  <span className="mt-0.5 shrink-0 text-sm font-bold opacity-70">{oi + 1}.</span>
                  <span className="flex-1">{opt}</span>
                  {answered && isAnswer && <Check className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" />}
                </button>
              );
            })}
          </div>
        </main>

        <footer className="px-3 pb-6 pt-2">
          <button
            type="button"
            onClick={next}
            disabled={!answered}
            className="w-full rounded-xl border border-teal-400/50 bg-teal-500/20 py-3 text-base font-bold text-teal-100 transition-colors hover:bg-teal-500/30 disabled:opacity-30"
          >
            {idx === questions.length - 1 ? '결과 보기' : '다음'}
          </button>
        </footer>
      </>
    );
  };

  const renderResult = () => {
    const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;
    return (
      <>
        <header className="flex items-center justify-end px-3 pt-3 pb-2">
          <button type="button" onClick={onClose} aria-label="닫기" title="닫기" className={CLOSE_BTN}>
            <X className="h-5 w-5" />
          </button>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-5 pb-12 text-center">
          <p className="text-sm text-purple-200/70">퀴즈 완료</p>
          <p className="text-3xl font-bold text-white">
            {questions.length}개 중 <span className="text-teal-300">{score}</span>개 정답
          </p>
          <p className="text-lg font-semibold text-purple-200/80">정답률 {pct}%</p>
          <div className="mt-6 flex w-full gap-2">
            <button
              type="button"
              onClick={reset}
              className="flex-1 rounded-xl border border-purple-300/30 bg-black/20 py-3 font-bold text-purple-100 transition-colors hover:bg-black/30"
            >
              다시
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-teal-400/50 bg-teal-500/20 py-3 font-bold text-teal-100 transition-colors hover:bg-teal-500/30"
            >
              닫기
            </button>
          </div>
        </main>
      </>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col text-white"
      style={{ background: 'linear-gradient(160deg, #3A0D6E 0%, #4A1290 100%)' }}
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        {kind === null
          ? renderSelect()
          : idx >= questions.length
          ? renderResult()
          : renderPlay()}
      </div>
    </div>
  );
}
