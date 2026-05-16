import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Newspaper,
  ArrowLeft,
  Plus,
  Loader2,
  Save,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { isNoticeUnread, type Notice } from '@/hooks/useNotices';

interface NoticePanelProps {
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

/**
 * 공지 탭 본문. NoticeDialog의 내용을 다이얼로그 없이
 * 전체화면 탭으로 렌더링하는 패널 버전.
 */
export function NoticePanel({
  notices,
  loading,
  lastReadAt,
  onMarkAllRead,
  isAdmin,
}: NoticePanelProps) {
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 공지 탭에 진입할 때 한 번 읽음 처리
  useEffect(() => {
    onMarkAllRead();
  }, [onMarkAllRead]);

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
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
  };

  const handleOpenForm = () => {
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
    setView('form');
  };

  const handleEditNotice = (notice: Notice) => {
    setEditingId(notice.id);
    setFormTitle(notice.title);
    setFormContent(notice.content);
    setView('form');
  };

  const handleDeleteNotice = async (notice: Notice) => {
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    const ok = window.confirm(`"${notice.title}"\n\n정말 삭제하시겠습니까?`);
    if (!ok) return;
    setDeletingId(notice.id);
    try {
      await deleteDoc(doc(db, 'notices', notice.id));
      toast.success('공지가 삭제되었습니다.');
      if (selectedId === notice.id) {
        setSelectedId(null);
        setView('list');
      }
    } catch (error: unknown) {
      console.error('[Notice] 삭제 실패:', error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error('공지 삭제 중 오류가 발생했습니다: ' + message);
    } finally {
      setDeletingId(null);
    }
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
      if (editingId) {
        await updateDoc(doc(db, 'notices', editingId), {
          title: formTitle.trim(),
          content: formContent.trim(),
          updatedAt: serverTimestamp(),
        });
        toast.success('공지가 수정되었습니다.');
      } else {
        await addDoc(collection(db, 'notices'), {
          title: formTitle.trim(),
          content: formContent.trim(),
          createdAt: serverTimestamp(),
        });
        toast.success('공지가 등록되었습니다.');
      }
      setFormTitle('');
      setFormContent('');
      setEditingId(null);
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
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 mb-1">
        <Newspaper className="w-5 h-5 text-pink-300 flex-shrink-0" />
        <h2 className="text-white text-lg font-normal">
          {view === 'form'
            ? editingId
              ? '공지 수정'
              : '새 공지 작성'
            : '안내드립니다.'}
        </h2>
      </div>
      <p className="text-purple-200/80 text-xs font-light mb-4">
        {view === 'form'
          ? editingId
            ? '공지 내용을 수정해주세요'
            : '자매님들께 전달할 공지를 작성해주세요'
          : view === 'detail'
            ? '공지 상세'
            : '개발자가 전하는 소식'}
      </p>

      {view === 'list' && (
        <div className="space-y-3">
          {isAdmin && (
            <div className="flex justify-end">
              <Button
                onClick={handleOpenForm}
                size="sm"
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-light"
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
            <div className="text-center py-12 text-sm text-gray-400 font-light">
              <Newspaper className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              아직 공지가 없습니다
            </div>
          ) : (
            <div className="space-y-2">
              {notices.map((notice) => {
                const unread = isNoticeUnread(notice, lastReadAt);
                return (
                  <div
                    key={notice.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectNotice(notice.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectNotice(notice.id);
                      }
                    }}
                    className={`w-full text-left rounded-lg p-3 transition-colors border cursor-pointer ${
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
                          className={`text-sm font-light truncate ${
                            unread ? 'text-white' : 'text-gray-200'
                          }`}
                        >
                          {notice.title}
                        </p>
                        <p className="text-xs text-purple-200/70 mt-0.5 font-light">
                          {formatKSTDate(notice.createdAt)}
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 flex-shrink-0 -mt-0.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditNotice(notice);
                            }}
                            className="p-1.5 rounded-md text-purple-300 hover:text-pink-300 hover:bg-pink-500/10 transition-colors"
                            aria-label="공지 수정"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteNotice(notice);
                            }}
                            disabled={deletingId === notice.id}
                            className="p-1.5 rounded-md text-purple-300 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            aria-label="공지 삭제"
                          >
                            {deletingId === notice.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view === 'detail' && selectedNotice && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToList}
              className="text-purple-300 hover:text-pink-300 hover:bg-pink-500/10 -ml-2 font-light"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              목록으로
            </Button>

            {isAdmin && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditNotice(selectedNotice)}
                  className="text-purple-300 hover:text-pink-300 hover:bg-pink-500/10 font-light"
                >
                  <Pencil className="w-4 h-4 mr-1" />
                  수정
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteNotice(selectedNotice)}
                  disabled={deletingId === selectedNotice.id}
                  className="text-purple-300 hover:text-red-300 hover:bg-red-500/10 font-light disabled:opacity-50"
                >
                  {deletingId === selectedNotice.id ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-1" />
                  )}
                  삭제
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-normal bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent break-keep">
              {selectedNotice.title}
            </h2>
            <p className="text-xs text-gray-400 font-light">
              {formatKSTDate(selectedNotice.createdAt)}
            </p>
          </div>

          <div className="whitespace-pre-line text-sm leading-relaxed text-gray-100 break-keep py-2 font-light">
            {selectedNotice.content}
          </div>

          <div className="border-t border-purple-500/30 pt-3 space-y-2">
            <p className="text-xs text-purple-200/80 leading-relaxed font-light">
              💌 이 공지에 의견이나 나누고 싶은 마음이 있으시면
              <br />
              아래 버튼으로 의견 보내주세요.
            </p>
            <button
              onClick={() => handleSendFeedback(selectedNotice)}
              className="w-full h-11 rounded-md inline-flex items-center justify-center gap-2 font-light text-sm bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white border border-pink-400/40 transition-colors"
            >
              📧 개발자에게 의견 제출하기
            </button>
          </div>
        </div>
      )}

      {view === 'form' && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="notice-title" className="text-white font-normal">
              제목 *
            </Label>
            <Input
              id="notice-title"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white font-light"
              placeholder="공지 제목을 입력하세요"
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="notice-content" className="text-white font-normal">
              내용 *
            </Label>
            <Textarea
              id="notice-content"
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white font-light"
              placeholder="공지 내용을 입력하세요"
              rows={10}
              disabled={submitting}
            />
          </div>
          <div className="flex space-x-2">
            <Button
              onClick={handleSubmitNotice}
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 font-light"
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
                  {editingId ? '수정 완료' : '저장'}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleBackToList}
              className="flex-1 font-light"
              disabled={submitting}
            >
              <X className="h-4 w-4 mr-2" />
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
