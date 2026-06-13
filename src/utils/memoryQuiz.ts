// 성경암송 "전체 퀴즈" 순수 로직 — 문제 생성/셔플/오답 샘플링.
// UI·상태·랜덤 부수효과를 분리해 검증 가능하게 둔다(rng 주입 가능).

/**
 * 퀴즈 종류. 명칭이 헷갈리기 쉬우므로 "무엇을 보여주고 무엇을 맞히는지"를 명확히 한다.
 * - 'ref-to-text' : ① 구절→위치.  본문(text)을 보여주고 "어디(참조)"인지 맞힌다. → 보기=참조(id), 정답=그 구절 id.
 * - 'text-to-ref' : ② 위치→구절.  참조(id)를 보여주고 "본문"을 맞힌다.      → 보기=본문(text), 정답=그 구절 text.
 */
export type QuizKind = 'ref-to-text' | 'text-to-ref';

/** MemoryPage가 본문을 미리 추출해 넘기는 형태(범위 구절은 text가 이미 한 덩이로 합쳐져 있음). */
export interface QuizItem {
  id: string;
  ref: string;
  text: string;
}

export interface QuizQuestion {
  /** 화면에 보여줄 문제(ref-to-text=본문 / text-to-ref=참조). */
  prompt: string;
  /** 4지선다 보기(셔플됨). */
  options: string[];
  /** 셔플 후 정답 보기의 인덱스. */
  answerIndex: number;
  /** 이 문제의 출처 구절 id(결과/디버그용). */
  questionRef: string;
}

/** Fisher-Yates 셔플(원본 불변, rng 주입). */
function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * items 각각을 1문제로 만든 30문항 배열을 반환(출제 순서 셔플).
 * 각 문제는 정답 1 + 오답 3 = 보기 4개(셔플). 오답은 다른 구절에서, 표시값 중복은 제거.
 * @param rng 0~1 난수 생성기(기본 Math.random). 동일 rng 주입 시 재현 가능 → 테스트 용이.
 */
export function buildQuestions(
  items: readonly QuizItem[],
  kind: QuizKind,
  rng: () => number = Math.random
): QuizQuestion[] {
  // 보기로 쓸 표시값: 구절→위치면 id(참조), 위치→구절이면 text(본문).
  const optionValue = (x: QuizItem): string => (kind === 'ref-to-text' ? x.id : x.text);

  const ordered = shuffle(items, rng); // 출제 순서 셔플
  return ordered.map((item) => {
    const prompt = kind === 'ref-to-text' ? item.text : item.id;
    const correct = optionValue(item);

    // 오답 후보: 현재 구절 제외 + 정답과 같은 표시값 제외 + 중복 제거.
    const seen = new Set<string>([correct]);
    const pool: string[] = [];
    for (const x of items) {
      if (x.id === item.id) continue;
      const v = optionValue(x);
      if (seen.has(v)) continue;
      seen.add(v);
      pool.push(v);
    }

    const distractors = shuffle(pool, rng).slice(0, 3); // 30개라 보통 3개 확보
    const options = shuffle([correct, ...distractors], rng);
    return {
      prompt,
      options,
      answerIndex: options.indexOf(correct),
      questionRef: item.id,
    };
  });
}
