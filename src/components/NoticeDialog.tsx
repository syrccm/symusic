import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Newspaper, ArrowLeft, Plus, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { isNoticeUnread, type Notice } from '@/hooks/useNotices';

interface NoticeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notices: Notice[];
  loading: boolean;
  lastReadAt: number;
  onMarkAllRead: () => void;
  isAdmin: boolean;
}

type View = 'list' | 'detail' | 'form';

const FEEDBACK_EMAIL = 'seo0191@gmail.com';

function formatKSTDate(ts: Timestamp | null): string {
  if (!ts) return '';
  const d = ts.toDate();
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function NoticeDialog({
  open,
  onOpenChange,
  notices,
  loading,
  lastReadAt,
  onMarkAllRead,
  isAdmin,
}: NoticeDialogProps) {
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 다이얼로그가 열릴 때 목록 화면으로 초기화 + 읽음 처리
  useEffect(() => {
    if (open) {
      setView('list');
      setSelectedId(null);
      onMarkAllRead();
    }
  }, [open, onMarkAllRead]);

  const selectedNotice = useMemo(
    () => notices.find((n) => n.id === selectedId) ?? null,
    [notices, selectedId],
  );

  const handleSelectNotice = (id: string) => {
    setSelectedId(id);
    setView('detail');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedId(null);
  };

  const handleOpenForm = () => {
    setFormTitle('');
    setFormContent('');
    setView('form');
  };

  const handleSubmitNotice = async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error('제목과 내용을 모두 입력해주세요.');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'notices'), {
        title: formTitle.trim(),
        content: formContent.trim(),
        createdAt: serverTimestamp(),
      });
      toast.success('공지가 등록되었습니다.');
      setFormTitle('');
      setFormContent('');
      setView('list');
    } catch (error: unknown) {
      console.error('[NoticeForm] 저장 실패:', error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error('공지 저장 중 오류가 발생했습니다: ' + message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendFeedback = (notice: Notice) => {
    const subject = encodeURIComponent(`[SY Music] ${notice.title}에 대한 의견`);
    const body = encodeURIComponent(
      `안녕하세요 개발자님,\n\n[SY Music 공지: ${notice.title}]\n[작성 시간: ${formatKSTDate(
        notice.createdAt,
      )}]\n\n(아래에 의견을 적어주세요)\n\n\n`,
    );
    window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-4 bg-gradient-to-b from-purple-900/95 to-slate-900/95 border-purple-500/30 text-gray-200 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-pink-300" />
            {view === 'form' ? '새 공지 작성' : '공지사항'}
          </DialogTitle>
          <DialogDescription className="text-purple-200/80 text-xs">
            {view === 'form'
              ? '자매님들께 전달할 공지를 작성해주세요'
              : view === 'detail'
              ? '공지 상세'
              : '개발자가 전하는 소식'}
          </DialogDescription>
        </DialogHeader>

        {view === 'list' && (
          <div className="space-y-3">
            {isAdmin && (
              <div className="flex justify-end">
                <Button
                  onClick={handleOpenForm}
                  size="sm"
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  새 공지 작성
                </Button>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-300" />
              </div>
            ) : notices.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                <Newspaper className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                아직 공지가 없습니다
              </div>
            ) : (
              <div className="space-y-2">
                {notices.map((notice) => {
                  const unread = isNoticeUnread(notice, lastReadAt);
                  return (
                    <button
                      key={notice.id}
                      onClick={() => handleSelectNotice(notice.id)}
                      className={`w-full text-left rounded-lg p-3 transition-colors border ${
                        unread
                          ? 'bg-purple-900/50 border-pink-400/50 hover:bg-purple-800/60'
                          : 'bg-slate-800/40 border-slate-700 hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {unread && (
                          <span className="mt-1.5 w-2 h-2 rounded-full bg-pink-400 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-semibold truncate ${
                              unread ? 'text-white' : 'text-gray-200'
                            }`}
                          >
                            {notice.title}
                          </p>
                          <p className="text-xs text-purple-200/70 mt-0.5">
                            {formatKSTDate(notice.createdAt)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === 'detail' && selectedNotice && (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToList}
              className="text-purple-300 hover:text-pink-300 hover:bg-pink-500/10 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              목록으로
            </Button>

            <div className="space-y-2">
              <h2 className="text-xl font-bold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent break-keep">
                {selectedNotice.title}
              </h2>
              <p className="text-xs text-gray-400">
                {formatKSTDate(selectedNotice.createdAt)}
              </p>
            </div>

            <div className="whitespace-pre-line text-sm leading-relaxed text-gray-100 break-keep py-2">
              {selectedNotice.content}
            </div>

            <div className="border-t border-purple-500/30 pt-3 space-y-2">
              <p className="text-xs text-purple-200/80 leading-relaxed">
                💌 이 공지에 의견이나 나누고 싶은 마음이 있으시면
                <br />
                아래 버튼으로 의견 보내주세요.
              </p>
              <button
                onClick={() => handleSendFeedback(selectedNotice)}
                className="w-full h-11 rounded-md inline-flex items-center justify-center gap-2 font-semibold text-sm bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white border border-pink-400/40 transition-colors"
              >
                📧 개발자에게 의견 제출하기
              </button>
            </div>

            <div className="pt-2">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="w-full bg-slate-700/80 border border-purple-400/40 text-gray-100 hover:bg-slate-600/80 hover:text-pink-300 hover:border-pink-400/60 py-2.5 font-medium"
              >
                닫기
              </Button>
            </div>
          </div>
        )}

        {view === 'form' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="notice-title" className="text-white">
                제목 *
              </Label>
              <Input
                id="notice-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="공지 제목을 입력하세요"
                disabled={submitting}
              />
            </div>
            <div>
              <Label htmlFor="notice-content" className="text-white">
                내용 *
              </Label>
              <Textarea
                id="notice-content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="공지 내용을 입력하세요"
                rows={10}
                disabled={submitting}
              />
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={handleSubmitNotice}
                className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                disabled={submitting || !formTitle.trim() || !formContent.trim()}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    저장
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleBackToList}
                className="flex-1"
                disabled={submitting}
              >
                <X className="h-4 w-4 mr-2" />
                취소
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
