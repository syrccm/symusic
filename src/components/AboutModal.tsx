import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
        className="max-w-md bg-slate-900/95 border-purple-500/30 text-gray-200 max-h-[90vh] overflow-y-auto"
        aria-label="개발자 정보"
      >
        <DialogTitle className="sr-only">개발자 정보</DialogTitle>
        <DialogDescription className="sr-only">
          SY Music 개발자 소개와 의견 보내기
        </DialogDescription>

        <div className="flex flex-col items-center text-center space-y-2 pt-2">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
            <span className="text-white text-2xl font-bold tracking-wide">SY</span>
          </div>
          <p className="text-base font-bold">
            <span className="text-pink-400">수영로교회 41교구 성도</span>
          </p>
          <p className="text-sm text-gray-300">예배팀원</p>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-pink-400 flex items-center gap-2">
            <span aria-hidden>📖</span>
            <span>만들게 된 이야기</span>
          </h3>
          <p className="text-sm leading-relaxed whitespace-pre-line text-gray-200">
            {`주일 설교의 은혜가 한 주간 삶 속에 머물기를 바라며,
말씀과 찬양을 함께 묵상할 수 있는 공간을 만들었습니다.

설교노트만으로는 닿지 못했던 자리에
이 앱이 작은 다리가 되길 바랍니다.`}
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-pink-400 flex items-center gap-2">
            <span aria-hidden>📊</span>
            <span>현재 상황</span>
          </h3>
          <ul className="text-sm space-y-1.5 text-gray-200">
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

        <p className="text-xs text-center text-gray-400 leading-relaxed">
          {`이 앱이 여러분의 신앙 여정에
작은 동행이 되길 바랍니다.`}
        </p>
      </DialogContent>
    </Dialog>
  );
}
