import { useMemo, useState } from 'react';
import { BookOpen, Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { shorterCatechism } from '@/data/westminsterShorter';
import { requestCatechismMatch } from '@/lib/catechismMatch';

interface CatechismMatcherProps {
  title: string;
  lyrics: string;
  value: number[];
  onChange: (next: number[]) => void;
}

/**
 * 곡 등록/수정 폼에서 사용하는 소요리문답 자동 매핑 UI.
 * "자동 매핑" 버튼 → Anthropic API 추천(1~3문답) → 체크박스로 표시 →
 * 관리자가 확인/수정하면 value(number[])가 갱신된다.
 */
export default function CatechismMatcher({
  title,
  lyrics,
  value,
  onChange,
}: CatechismMatcherProps) {
  const [isMatching, setIsMatching] = useState(false);
  // API 추천 이유(번호 -> 사유). 화면에 함께 표시한다.
  const [reasons, setReasons] = useState<Record<number, string>>({});

  const questionOf = (n: number) =>
    shorterCatechism.find((c) => c.number === n)?.question ?? '';

  // 화면에 보일 후보: 현재 선택된 것 + 추천받은 것의 합집합(오름차순)
  const visible = useMemo(() => {
    const set = new Set<number>([...value, ...Object.keys(reasons).map(Number)]);
    return Array.from(set).sort((a, b) => a - b);
  }, [value, reasons]);

  const toggle = (n: number) => {
    onChange(
      value.includes(n) ? value.filter((v) => v !== n) : [...value, n].sort((a, b) => a - b)
    );
  };

  const handleMatch = async () => {
    if (!lyrics || !lyrics.trim()) {
      toast.error('가사를 먼저 입력해주세요.');
      return;
    }
    setIsMatching(true);
    try {
      const matches = await requestCatechismMatch(lyrics, title);
      if (matches.length === 0) {
        toast.info('추천할 문답을 찾지 못했습니다.');
        return;
      }
      const reasonMap: Record<number, string> = {};
      matches.forEach((m) => {
        reasonMap[m.number] = m.reason;
      });
      setReasons(reasonMap);
      // 추천 결과를 기본 선택 상태로 합친다(관리자가 해제/추가 가능)
      const merged = Array.from(new Set([...value, ...matches.map((m) => m.number)])).sort(
        (a, b) => a - b
      );
      onChange(merged);
      toast.success(`${matches.length}개 문답을 추천했습니다. 확인 후 저장하세요.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error('자동 매핑 실패: ' + message);
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <div className="rounded-lg border border-purple-500/30 bg-slate-800/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-purple-200">
          <BookOpen className="h-4 w-4 text-teal-400" />
          소요리문답 매핑
          {value.length > 0 && (
            <span className="text-xs text-teal-400">({value.length}개 선택)</span>
          )}
        </span>
        <button
          type="button"
          onClick={handleMatch}
          disabled={isMatching}
          className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-500 disabled:opacity-60"
        >
          {isMatching ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              분석 중...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              소요리문답 자동 매핑
            </>
          )}
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-gray-400">
          제목·가사 입력 후 자동 매핑을 누르면 추천 문답이 표시됩니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((n) => {
            const checked = value.includes(n);
            return (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => toggle(n)}
                  className="flex w-full items-start gap-2.5 rounded-md p-2 text-left transition-colors hover:bg-purple-500/10"
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? 'border-teal-500 bg-teal-500'
                        : 'border-gray-500 bg-transparent'
                    }`}
                  >
                    {checked && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className="flex-1">
                    <span className="text-sm text-gray-100">
                      <span className="font-bold text-teal-400">제{n}문</span>{' '}
                      {questionOf(n)}
                    </span>
                    {reasons[n] && (
                      <span className="mt-0.5 block text-xs text-purple-300/80">
                        ↳ {reasons[n]}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
