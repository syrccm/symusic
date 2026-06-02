import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { bookFullName } from '@/data/bibleBookMap';
import {
  parseRef,
  getSegmentVerses,
  verseExists,
  loadKrv,
  type KrvData,
  type VerseSegment,
} from '@/utils/bibleParser';

interface BibleVerseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 클릭한 성경 참조 문자열 (예: "시 31:23", "롬 5:12-14") */
  refString: string | null;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

const segLabel = (seg: VerseSegment) =>
  `${bookFullName(seg.book)} ${seg.chapter}:${seg.verseStart}` +
  (seg.verseEnd > seg.verseStart ? `-${seg.verseEnd}` : '');

export default function BibleVerseModal({ open, onOpenChange, refString }: BibleVerseModalProps) {
  const [data, setData] = useState<KrvData | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  // 모달이 열릴 때 개역한글 데이터를 지연 로딩(1회 fetch 후 캐시).
  useEffect(() => {
    if (!open) return;
    if (data) {
      setStatus('ready');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    loadKrv()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setStatus('ready');
        }
      })
      .catch((err) => {
        console.error('[BibleVerseModal] 성경 데이터 로드 실패:', err);
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, data]);

  // 실제 존재하는 절을 가진 세그먼트만 (잘못된 참조는 표시하지 않음)
  const segments: VerseSegment[] = (refString ? parseRef(refString) : []).filter((seg) => {
    for (let v = seg.verseStart; v <= seg.verseEnd; v++) {
      if (verseExists(seg.book, seg.chapter, v)) return true;
    }
    return false;
  });

  const title = segments.map(segLabel).join(' · ') || '성경';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm border-purple-400/40 text-gray-100 max-h-[80vh] overflow-y-auto [&>button.absolute]:opacity-100 [&>button.absolute]:text-purple-200 [&>button.absolute]:hover:text-teal-300 [&>button.absolute]:p-3 [&>button.absolute]:right-2 [&>button.absolute]:top-2 [&>button.absolute>svg]:w-5 [&>button.absolute>svg]:h-5"
        style={{ backgroundColor: '#3A0D6E' }}
      >
        <DialogTitle className="pr-6 text-lg font-bold" style={{ color: '#14b8a6' }}>
          {title}
        </DialogTitle>
        <DialogDescription className="sr-only">{title} 본문 (개역한글)</DialogDescription>

        {status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-8 text-purple-200">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">성경 본문을 불러오는 중...</span>
          </div>
        )}

        {status === 'error' && (
          <div className="py-6 text-center text-sm text-purple-200/80">
            <p>성경 본문을 불러오지 못했습니다.</p>
            <p className="mt-1 text-xs text-purple-300/60">잠시 후 다시 시도해주세요.</p>
          </div>
        )}

        {status === 'ready' && segments.length === 0 && (
          <p className="py-6 text-center text-sm text-purple-200/80">구절을 찾을 수 없습니다.</p>
        )}

        {status === 'ready' && segments.length > 0 && data && (
          <div className="space-y-3">
            {segments.map((seg, i) => {
              const verses = getSegmentVerses(data, seg).filter((v) => v.text);
              const multi = verses.length > 1;
              return (
                <div key={`${seg.label}-${i}`}>
                  {segments.length > 1 && (
                    <h3 className="mb-1 text-sm font-bold" style={{ color: '#14b8a6' }}>
                      {segLabel(seg)}
                    </h3>
                  )}
                  <p className="text-base leading-relaxed text-white break-keep">
                    {verses.map((v) => (
                      <span key={v.verse}>
                        {multi && (
                          <sup className="mr-0.5 text-xs font-semibold text-teal-400">
                            {v.verse}
                          </sup>
                        )}
                        {v.text}
                        {multi ? ' ' : ''}
                      </span>
                    ))}
                  </p>
                </div>
              );
            })}

            {/* 출처 */}
            <p className="pt-2 text-right text-xs text-purple-300/60">개역한글</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
