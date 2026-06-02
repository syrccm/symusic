import { shorterCatechism } from '@/data/westminsterShorter';

export interface CatechismMatch {
  number: number;
  reason: string;
}

/**
 * 서버리스 함수(/api/match-catechism)에 제목+가사를 보내
 * 의미적으로 가장 가까운 소요리문답 1~3개를 추천받는다.
 * 문답 목록(번호+질문)은 단일 출처(westminsterShorter.ts)에서 보내므로
 * 서버 함수에 문답 데이터를 중복 보관하지 않는다.
 */
export async function requestCatechismMatch(
  lyrics: string,
  title?: string
): Promise<CatechismMatch[]> {
  const catechism = shorterCatechism.map((c) => ({
    number: c.number,
    question: c.question,
  }));

  const res = await fetch('/api/match-catechism', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lyrics, title, catechism }),
  });

  if (!res.ok) {
    let message = `문답 매핑 요청 실패 (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // 응답 본문 파싱 실패 — 기본 메시지 사용
    }
    throw new Error(message);
  }

  const data = await res.json();
  if (!Array.isArray(data?.matches)) {
    throw new Error('서버 응답 형식이 올바르지 않습니다.');
  }

  const valid = new Set(shorterCatechism.map((c) => c.number));
  return (data.matches as CatechismMatch[])
    .filter((m) => valid.has(Number(m.number)))
    .map((m) => ({ number: Number(m.number), reason: String(m.reason ?? '') }));
}
