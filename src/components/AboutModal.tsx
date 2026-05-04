import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Music } from 'lucide-react';

interface AboutModalSong {
  date?: string;
  created_at: string;
}

interface AboutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songs: AboutModalSong[];
}

const FEEDBACK_EMAIL = 'seo0191@gmail.com';
const FEEDBACK_SUBJECT = '[SY Music] 의견 보내기';
const FEEDBACK_BODY =
  '안녕하세요, SY Music을 사용하면서 느낀 점이나 의견을 자유롭게 적어주세요.\n\n';

function formatDate(value?: string): string {
  if (!value) return '정보 없음';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '정보 없음';
  return `${parsed.getFullYear()}.${parsed.getMonth() + 1}.${parsed.getDate()}`;
}

function pickLatestDate(songs: AboutModalSong[]): string {
  if (songs.length === 0) return '정보 없음';
  const latest = songs[0];
  return formatDate(latest.date ?? latest.created_at);
}

export function AboutModal({ open, onOpenChange, songs }: AboutModalProps) {
  const handleFeedbackClick = () => {
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
      FEEDBACK_SUBJECT,
    )}&body=${encodeURIComponent(FEEDBACK_BODY)}`;
    window.location.href = url;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm bg-slate-900/95 border-purple-500/30 text-gray-200 max-h-[80vh] overflow-y-auto [&>button.absolute]:opacity-100 [&>button.absolute]:text-gray-200 [&>button.absolute]:hover:text-pink-400 [&>button.absolute]:p-3 [&>button.absolute]:right-2 [&>button.absolute]:top-2 [&>button.absolute>svg]:w-5 [&>button.absolute>svg]:h-5"
        aria-label="개발자 정보"
      >
        <DialogTitle className="sr-only">개발자 정보</DialogTitle>
        <DialogDescription className="sr-only">
          SY Music 개발자 소개와 의견 보내기
        </DialogDescription>

        <div className="flex items-center justify-center gap-3 pt-2">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <Music className="h-8 w-8 text-white" />
          </div>
          <div className="text-left">
            <p className="text-xl font-bold text-white">SY Music</p>
            <p className="text-sm text-purple-300">수영로말씀적용찬양</p>
          </div>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-pink-400 flex items-center gap-2">
            <span aria-hidden>📖</span>
            <span>만들게 된 이야기</span>
          </h3>
          <div className="text-sm leading-relaxed text-gray-200 text-left space-y-3">
            <p>
              주일 설교의 은혜가 한 주간 삶 속에 머물기를 바라며, 말씀과 찬양을 함께 묵상할 수 있는
              공간을 만들었습니다.
            </p>
            <p>설교노트만으로는 닿지 못했던 자리에 이 앱이 작은 다리가 되길 바랍니다.</p>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-pink-400 flex items-center gap-2">
            <span aria-hidden>📊</span>
            <span>현재 상황</span>
          </h3>
          <ul className="text-sm space-y-2 text-gray-200 text-left list-none">
            <li>🎵 등록된 찬양: {songs.length}곡</li>
            <li>📅 최근 업데이트: {pickLatestDate(songs)}</li>
            <li>✨ 최신 기능: 즐겨찾기 (2026.5.4 추가)</li>
          </ul>
        </section>

        <Button
          onClick={handleFeedbackClick}
          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold"
        >
          ✉️ 개발자에게 의견 보내기
        </Button>

        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          className="w-full bg-slate-700/60 border border-purple-400/40 text-gray-100 hover:bg-slate-600/70 hover:text-pink-300 hover:border-pink-400/60 mt-3 py-2.5 font-medium"
        >
          닫기
        </Button>

        <div className="text-center pt-2 border-t border-purple-500/20">
          <p className="text-sm font-bold text-pink-400 mt-3">수영로교회 41교구 성도</p>
          <p className="text-sm text-gray-300 mt-1">삶으로 드리고 싶은 예배자</p>
        </div>

        <p className="text-xs text-center text-gray-400 leading-relaxed mt-4">
          이 앱이 여러분의 신앙 여정에 작은 동행이 되길 바랍니다.
        </p>
      </DialogContent>
    </Dialog>
  );
}
