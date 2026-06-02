import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { bookFullName } from '@/data/bibleBookMap';
import {
  parseRef,
  getSegmentVerses,
  loadKrv,
  type KrvData,
  type VerseSegment,
} from '@/utils/bibleParser';

interface BibleVerseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 클릭한 성경 참조 문자열 (예: "슥 8:16-17", "마 4:4, 7; 사 8:19-20") */
  refString: string | null;
}

export default function BibleVerseModal({ open, onOpenChange, refString }: BibleVerseModalProps) {
  const [data, setData] = useState<KrvData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // 모달이 열릴 때 개역한글 데이터를 지연 로딩(캐시됨)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFailed(false);
    if (data) return;
    setLoading(true);
    loadKrv()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, data]);

  const segments: VerseSegment[] = refString ? parseRef(refString) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm border-purple-400/40 text-gray-100 max-h-[80vh] overflow-y-auto [&>button.absolute]:opacity-100 [&>button.absolute]:text-purple-200 [&>button.absolute]:hover:text-teal-300 [&>button.absolute]:p-3 [&>button.absolute]:right-2 [&>button.absolute]:top-2 [&>button.absolute>svg]:w-5 [&>button.absolute>svg]:h-5"
        style={{ backgroundColor: '#3A0D6E' }}
      >
        <DialogTitle className="text-base font-bold text-white">
          개역한글 성경
        </DialogTitle>
        <DialogDescription className="sr-only">
          {refString ?? '성경 구절'} 본문
        </DialogDescription>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-purple-200">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">성경 본문을 불러오는 중...</span>
          </div>
        )}

        {!loading && (failed || segments.length === 0) && (
          <p className="py-8 text-center text-sm text-purple-200/80">
            구절을 찾을 수 없습니다.
            {refString ? <span className="mt-1 block text-xs text-purple-300/60">({refString})</span> : null}
          </p>
        )}

        {!loading && !failed && segments.length > 0 && data && (
          <div className="space-y-4 pt-1">
            {segments.map((seg, i) => {
              const verses = getSegmentVerses(data, seg);
              const found = verses.some((v) => v.text);
              return (
                <div key={`${seg.label}-${i}`} className="space-y-1.5">
                  <h3 className="text-sm font-bold" style={{ color: '#14b8a6' }}>
                    {bookFullName(seg.book)} {seg.chapter}:
                    {seg.verseStart}
                    {seg.verseEnd > seg.verseStart ? `-${seg.verseEnd}` : ''}
                  </h3>
                  {found ? (
                    <p className="text-base leading-relaxed text-white break-keep">
                      {verses.map((v) =>
                        v.text ? (
                          <span key={v.verse}>
                            <sup className="mr-0.5 text-xs font-semibold text-teal-400">
                              {v.verse}
                            </sup>
                            {v.text}{' '}
                          </span>
                        ) : null
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-purple-200/80">구절을 찾을 수 없습니다.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
