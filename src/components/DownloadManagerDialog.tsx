// 다운로드 관리 모달 (관리자 전용, /0691 음표 메뉴 → "📥 다운로드 관리")
// - 대상: Firestore downloads/{id} = { title, folder, files: string[], note?, active, createdAt, updatedAt }. 목록은
//   MusicPlayer 의 useDownloads() 결과(전체, 비활성 포함)를 props 로 받는다 — 게시판과 구독 공유, 별도 로드 없음.
// - 파일은 여기서 올리지 않는다. 관리자가 R2 download 버킷의 {folder}/ 에 직접 올린 뒤 파일 이름을 한 줄에 하나씩
//   붙여넣는다(이름 그대로 저장). 폴더명은 비워 두면 제목과 같게 저장하고, 폴더명·파일명에 '/' 는 쓸 수 없다.
// - 상단 폼 하나를 추가/편집에 함께 쓴다. [편집](Pencil) 을 누르면 그 항목 값으로 폼을 채우고 editingId 를 둔다.
//   저장 = editingId 있으면 updateDownload, 없으면 addDownload.
// - 활성 체크박스는 즉시 updateDoc(active). 삭제는 window.confirm 후 deleteDownload(deletingId 스피너).
// - 핸들러 순서(PlaylistManagerDialog 패턴): !isAdmin → 입력 검증 → !db → 재진입 방지 → try/await/toast → catch → finally.
// - 쓰기 규칙(콘솔 수동 반영): downloads read 개방, write 로그인 사용자. 규칙 반영 전에는 permission-denied 안내.
import { useState } from 'react';
import { FolderDown, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { addDownload, deleteDownload, updateDownload, type DownloadItem } from '@/hooks/useDownloads';

interface DownloadManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  /** MusicPlayer 의 useDownloads 결과(전체) */
  downloads: DownloadItem[];
}

function describeWriteError(error: unknown, fallback: string): string {
  const code = (error as { code?: string } | null)?.code;
  return code === 'permission-denied'
    ? 'Firebase 권한이 없습니다. 관리자 로그인 상태와 downloads 쓰기 규칙을 확인하세요.'
    : fallback;
}

export function DownloadManagerDialog({ open, onOpenChange, isAdmin, downloads }: DownloadManagerDialogProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState('');
  const [filesText, setFilesText] = useState(''); // 한 줄에 파일 이름 하나
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setFolder('');
    setFilesText('');
    setNote('');
  };

  // 모달을 닫으면 편집 중이던 폼을 비운다(다시 열 때 이전 편집 상태가 남지 않게).
  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleStartEdit = (item: DownloadItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setFolder(item.folder);
    setFilesText(item.files.join('\n'));
    setNote(item.note);
  };

  const handleSave = async () => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedFolder = folder.trim() || trimmedTitle; // 폴더명 기본값 = 제목
    const files = Array.from(
      new Set(
        filesText
          .split('\n')
          .map((f) => f.trim())
          .filter((f) => f !== ''),
      ),
    ); // 같은 줄 중복 붙여넣기 방지
    if (!trimmedTitle) {
      toast.error('제목을 입력해주세요.');
      return;
    }
    if (trimmedFolder.includes('/')) {
      toast.error("폴더명에 '/' 는 쓸 수 없습니다.");
      return;
    }
    if (files.length === 0) {
      toast.error('파일 이름을 한 줄에 하나씩 입력해주세요.');
      return;
    }
    if (files.some((f) => f.includes('/'))) {
      toast.error("파일 이름에 '/' 는 쓸 수 없습니다. 폴더 없이 파일 이름만 적어 주세요.");
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    try {
      const input = { title: trimmedTitle, folder: trimmedFolder, files, note: note.trim() };
      if (editingId) {
        await updateDownload(editingId, input);
        toast.success(`수정되었습니다: ${trimmedTitle}`);
      } else {
        await addDownload(input);
        toast.success(`추가되었습니다: ${trimmedTitle}`);
      }
      resetForm();
    } catch (error) {
      console.error('❌ [Download] 저장 오류:', error);
      toast.error(describeWriteError(error, '자료 저장 중 오류가 발생했습니다.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (item: DownloadItem, active: boolean) => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (togglingId) return;

    setTogglingId(item.id);
    try {
      await updateDownload(item.id, { active });
      toast.success(active ? `표시합니다: ${item.title}` : `숨겼습니다: ${item.title}`);
    } catch (error) {
      console.error('❌ [Download] 활성 토글 오류:', error);
      toast.error(describeWriteError(error, '활성 상태 변경 중 오류가 발생했습니다.'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (item: DownloadItem) => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (deletingId) return;
    const label = item.title || '(제목 없음)';
    if (!window.confirm(`"${label}" 자료를 삭제할까요?\n게시판에서 바로 사라집니다.`)) return;

    setDeletingId(item.id);
    try {
      await deleteDownload(item.id);
      if (editingId === item.id) resetForm();
      toast.success(`삭제되었습니다: ${label}`);
    } catch (error) {
      console.error('❌ [Download] 삭제 오류:', error);
      toast.error(describeWriteError(error, '자료 삭제 중 오류가 발생했습니다.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FolderDown className="w-5 h-5 text-purple-300" />
            다운로드 관리
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            하단 '다운로드' 탭에 보이는 자료 목록입니다. 파일은 R2 download 버킷에 먼저 올리고 여기에는 이름만 적습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* 추가/편집 폼 */}
          <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-white">{editingId ? '자료 편집' : '새 자료 추가'}</p>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  편집 취소
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="download-title" className="text-white text-xs">
                제목 *
              </Label>
              <Input
                id="download-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 2026 가을 찬양 악보"
                disabled={isSaving}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="download-folder" className="text-white text-xs">
                폴더명 *
              </Label>
              <Input
                id="download-folder"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder={title.trim() || '비워 두면 제목과 같게 저장'}
                disabled={isSaving}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="download-files" className="text-white text-xs">
                파일 목록 *
              </Label>
              <Textarea
                id="download-files"
                value={filesText}
                onChange={(e) => setFilesText(e.target.value)}
                placeholder={'예:\n2026 가을 찬양 악보_1_E 키.pdf\n2026 가을 찬양 악보_MR.mp3'}
                rows={5}
                disabled={isSaving}
                spellCheck={false}
                className="bg-slate-700 border-slate-600 text-white font-mono text-xs"
              />
              <p className="text-[11px] text-gray-400 break-keep">
                R2 download 버킷의 {folder.trim() || title.trim() || '{폴더명}'}/ 에 올린 파일 이름을 그대로 한 줄씩
                붙여넣으세요
              </p>
              <p className="text-[11px] text-gray-400 break-keep">
                원음은 제목과 같은 이름(예: 제목.mp3)으로 올리면 맨 위에 표시됩니다
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="download-note" className="text-white text-xs">
                설명
              </Label>
              <Textarea
                id="download-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="예: E·F·G·A·Bb 키 악보 + MR 2종"
                rows={3}
                disabled={isSaving}
                className="bg-slate-700 border-slate-600 text-white text-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? '저장' : '추가'}
              </Button>
            </div>
          </div>

          {/* 목록(전체, 비활성 포함) */}
          <div className="space-y-2">
            <p className="text-xs text-gray-400">전체 {downloads.length}개</p>
            {downloads.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">등록된 자료가 없습니다.</p>
            ) : (
              downloads.map((item) => {
                const busy = deletingId === item.id || togglingId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 ${
                      editingId === item.id ? 'border-purple-400/60 bg-purple-900/30' : 'border-slate-700 bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm text-white truncate">{item.title || '(제목 없음)'}</p>
                          {!item.active && (
                            <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] bg-slate-600 text-gray-200">
                              비활성
                            </span>
                          )}
                        </div>
                        {item.note && <p className="text-xs text-gray-400 truncate mt-0.5">{item.note}</p>}
                        <p className="text-[11px] font-mono text-gray-500 truncate mt-0.5">
                          {item.folder || '(폴더 없음)'}/ · 파일 {item.files.length}개
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <label className="inline-flex items-center p-1.5 cursor-pointer" title="게시판 표시">
                          <input
                            type="checkbox"
                            checked={item.active}
                            onChange={(e) => void handleToggleActive(item, e.target.checked)}
                            disabled={busy}
                            className="w-4 h-4 accent-purple-600 cursor-pointer"
                            aria-label="게시판 표시"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          disabled={busy || isSaving}
                          className="p-1.5 rounded-md text-purple-300 hover:text-pink-300 hover:bg-pink-500/10 transition-colors disabled:opacity-50"
                          aria-label="편집"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item)}
                          disabled={busy}
                          className="p-1.5 rounded-md text-purple-300 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          aria-label="삭제"
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
