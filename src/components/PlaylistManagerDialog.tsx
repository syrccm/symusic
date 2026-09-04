// 플레이리스트 관리 모달 (관리자 전용, /0691 음표 메뉴 → "🎵 플레이리스트 공유")
// - STEP 2a: 제목만 입력해 빈 플레이리스트를 Firestore playlists 에 생성
// - STEP 2b: 만든 플레이리스트를 편집 상태로 두고 곡 제목 검색 → 추가 → songIds 저장(updateDoc)
// - STEP 2f: 목록 각 항목에 열기(새 탭) 버튼 + /p/코드 텍스트를 링크로
// - STEP 2d: 단축 주소 코드(shortCode) — 입력하면 검증·중복검사, 비우면 랜덤 4자(중복 시 재생성)
// - STEP 2ce: 모달 열 때 전체 목록(getDocs, 최신순) 표시 → [편집](getDoc 으로 title·songIds 불러와 순서↑↓·제거×·추가·제목 수정
//             → updateDoc({title, songIds, updatedAt}, shortCode 불변) / [삭제](deleteDoc, 확인창)
// - 데이터 구조: playlists/{autoId} = { title, songIds: string[](곡 문서 id, 담은 순서), shortCode, createdAt: ISO, updatedAt?: ISO, showSermon?: boolean }
// - showSermon: true 면 공유 페이지에서 곡별 설교 인포그래픽 탭 표시(기본 false/없음, 관리 UI 체크박스로 토글)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { ListMusic, Loader2, Plus, Check, ArrowUp, ArrowDown, X, Pencil, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
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
import { SongTitle } from '@/components/SongTitle';
import type { Song } from '@/hooks/useSongs';
import {
  buildPlaylistPath,
  findPlaylistIdByShortCode,
  generateRandomShortCode,
  normalizeShortCode,
} from '@/utils/playlistShortCode';

interface PlaylistManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  /** MusicPlayer 의 useSongs 결과를 그대로 전달(중복 구독 방지) */
  songs: Song[];
}

// Firestore playlists 문서(목록 표시용)
interface PlaylistDoc {
  id: string;
  title: string;
  songIds: string[];
  shortCode?: string;
  createdAt?: string;
  showSermon?: boolean;
}

// 현재 편집 중인 플레이리스트. title·songIds 는 로컬 편집본, 저장 버튼으로 Firestore 반영.
interface EditingPlaylist {
  id: string;
  title: string;
  songIds: string[];
  showSermon: boolean;
}

// 곡 제목은 Firestore 에 NFD(자모 분리)로 저장된 경우가 있어 검색 시 양쪽 모두 NFC 로 맞춘다.
const norm = (s: string) => s.normalize('NFC').toLowerCase();

function parsePlaylistDoc(id: string, raw: Record<string, unknown>): PlaylistDoc {
  return {
    id,
    title: typeof raw.title === 'string' ? raw.title : '',
    songIds: Array.isArray(raw.songIds)
      ? raw.songIds.filter((x): x is string => typeof x === 'string')
      : [],
    shortCode: typeof raw.shortCode === 'string' && raw.shortCode ? raw.shortCode : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    showSermon: raw.showSermon === true,
  };
}

export function PlaylistManagerDialog({ open, onOpenChange, isAdmin, songs }: PlaylistManagerDialogProps) {
  // 새로 만들기 폼
  const [title, setTitle] = useState('');
  const [shortCodeInput, setShortCodeInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 전체 목록
  const [playlists, setPlaylists] = useState<PlaylistDoc[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);

  // 편집 상태
  const [editing, setEditing] = useState<EditingPlaylist | null>(null);
  const [songQuery, setSongQuery] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  // 마지막 저장 시점의 스냅샷(변경 여부 판단용)
  const [saved, setSaved] = useState<{ title: string; songIds: string[]; showSermon: boolean }>({
    title: '',
    songIds: [],
    showSermon: false,
  });

  const songMap = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);

  const filteredSongs = useMemo(() => {
    const q = norm(songQuery.trim());
    if (!q) return songs;
    return songs.filter((s) => norm(s.title).includes(q));
  }, [songs, songQuery]);

  const isDirty =
    editing !== null &&
    (editing.title !== saved.title ||
      editing.showSermon !== saved.showSermon ||
      editing.songIds.length !== saved.songIds.length ||
      editing.songIds.some((id, i) => id !== saved.songIds[i]));

  // ── 목록 불러오기 (모달 열 때 + 새로고침 버튼) ─────────────────────────
  const loadPlaylists = useCallback(async () => {
    if (!db) return;
    setIsLoadingList(true);
    try {
      const snap = await getDocs(collection(db, 'playlists'));
      const list = snap.docs
        .map((d) => parsePlaylistDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      setPlaylists(list);
    } catch (error) {
      console.error('❌ [Playlist] 목록 조회 오류:', error);
      toast.error('플레이리스트 목록을 불러오지 못했어요.');
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadPlaylists();
  }, [open, loadPlaylists]);

  // ── 편집 상태 진입/조작 ───────────────────────────────────────────────
  const confirmDiscard = () =>
    !isDirty || window.confirm('저장하지 않은 변경이 있습니다. 버리고 이동할까요?');

  const enterEditing = (p: { id: string; title: string; songIds: string[]; showSermon?: boolean }) => {
    const showSermon = p.showSermon === true;
    setEditing({ id: p.id, title: p.title, songIds: [...p.songIds], showSermon });
    setSaved({ title: p.title, songIds: [...p.songIds], showSermon });
    setSongQuery('');
  };

  // [편집] — 목록 캐시가 아니라 Firestore 에서 최신 title·songIds 를 다시 읽어 시작(덮어쓰기 방지)
  const handleStartEdit = async (p: PlaylistDoc) => {
    if (editing?.id === p.id) return;
    if (!confirmDiscard()) return;
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    setLoadingEditId(p.id);
    try {
      const snap = await getDoc(doc(db, 'playlists', p.id));
      if (!snap.exists()) {
        toast.error('플레이리스트를 찾을 수 없어요. 목록을 새로고침합니다.');
        void loadPlaylists();
        return;
      }
      const fresh = parsePlaylistDoc(snap.id, snap.data() as Record<string, unknown>);
      setPlaylists((prev) => prev.map((x) => (x.id === fresh.id ? fresh : x)));
      enterEditing(fresh);
    } catch (error) {
      console.error('❌ [Playlist] 문서 조회 오류:', error);
      toast.error('플레이리스트를 불러오지 못했어요.');
    } finally {
      setLoadingEditId(null);
    }
  };

  const addSong = (songId: string) => {
    if (!editing) return;
    if (editing.songIds.includes(songId)) return;
    setEditing({ ...editing, songIds: [...editing.songIds, songId] });
  };

  const removeSong = (index: number) => {
    if (!editing) return;
    setEditing({ ...editing, songIds: editing.songIds.filter((_, i) => i !== index) });
  };

  const moveSong = (index: number, dir: -1 | 1) => {
    if (!editing) return;
    const target = index + dir;
    if (target < 0 || target >= editing.songIds.length) return;
    const next = [...editing.songIds];
    [next[index], next[target]] = [next[target], next[index]];
    setEditing({ ...editing, songIds: next });
  };

  // ── 저장 (shortCode 는 건드리지 않음) ────────────────────────────────
  const handleSaveEdit = async () => {
    if (!editing) return;
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    const trimmedTitle = editing.title.trim();
    if (!trimmedTitle) {
      toast.error('플레이리스트 제목을 입력해주세요.');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (isSavingEdit) return;

    setIsSavingEdit(true);
    try {
      const songIds = [...editing.songIds];
      const showSermon = editing.showSermon;
      await updateDoc(doc(db, 'playlists', editing.id), {
        title: trimmedTitle,
        songIds,
        showSermon,
        updatedAt: new Date().toISOString(),
      });
      console.log('✅ [Playlist] 저장 성공:', editing.id, songIds.length, '곡');
      setEditing({ ...editing, title: trimmedTitle });
      setSaved({ title: trimmedTitle, songIds, showSermon });
      setPlaylists((prev) =>
        prev.map((x) => (x.id === editing.id ? { ...x, title: trimmedTitle, songIds, showSermon } : x)),
      );
      toast.success(`저장되었습니다: ${trimmedTitle} (${songIds.length}곡)`);
    } catch (error) {
      console.error('❌ [Playlist] 저장 오류:', error);
      toast.error('플레이리스트 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ── 삭제 ─────────────────────────────────────────────────────────────
  const handleDelete = async (p: PlaylistDoc) => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (deletingId) return;
    const label = p.title || '(제목 없음)';
    if (
      !window.confirm(
        `"${label}" 플레이리스트를 삭제할까요?\n삭제하면 공유 링크(${buildPlaylistPath(p)})가 무효화됩니다.`,
      )
    ) {
      return;
    }
    setDeletingId(p.id);
    try {
      await deleteDoc(doc(db, 'playlists', p.id));
      console.log('🗑️ [Playlist] 삭제 성공:', p.id);
      setPlaylists((prev) => prev.filter((x) => x.id !== p.id));
      if (editing?.id === p.id) {
        setEditing(null);
        setSaved({ title: '', songIds: [], showSermon: false });
      }
      toast.success(`삭제되었습니다: ${label}`);
    } catch (error) {
      console.error('❌ [Playlist] 삭제 오류:', error);
      toast.error('플레이리스트 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  // ── 새로 만들기 ───────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error('플레이리스트 제목을 입력해주세요.');
      return;
    }
    // 단축 주소 코드: 입력값 검증(영소문자·숫자, 소문자화)
    const { code: customCode, error: codeError } = normalizeShortCode(shortCodeInput);
    if (codeError) {
      toast.error(codeError);
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (isSaving) return;
    if (!confirmDiscard()) return;

    setIsSaving(true);
    try {
      // 중복 검사: 관리자 입력 코드는 이미 있으면 거부, 랜덤 코드는 재생성(최대 5회)
      let shortCode = customCode;
      if (shortCode) {
        const existingId = await findPlaylistIdByShortCode(db, shortCode);
        if (existingId) {
          toast.error(`"${shortCode}" 코드는 이미 사용 중이에요. 다른 코드를 입력해주세요.`);
          return;
        }
      } else {
        let found = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = generateRandomShortCode();
          if (!(await findPlaylistIdByShortCode(db, candidate))) {
            shortCode = candidate;
            found = true;
            break;
          }
        }
        if (!found) {
          toast.error('짧은 주소 코드 자동 생성에 실패했어요. 잠시 후 다시 시도해주세요.');
          return;
        }
      }

      const createdAt = new Date().toISOString();
      const docRef = await addDoc(collection(db, 'playlists'), {
        title: trimmed,
        songIds: [],
        shortCode,
        createdAt,
      });
      console.log('✅ [Playlist] 생성 성공, 문서 ID:', docRef.id, '코드:', shortCode);
      const createdDoc: PlaylistDoc = { id: docRef.id, title: trimmed, songIds: [], shortCode, createdAt };
      setPlaylists((prev) => [createdDoc, ...prev]);
      setTitle('');
      setShortCodeInput('');
      enterEditing(createdDoc);
      toast.success(`플레이리스트가 생성되었습니다: ${trimmed} (/p/${shortCode})`);
    } catch (error) {
      console.error('❌ [Playlist] 생성 오류:', error);
      toast.error('플레이리스트 생성 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ListMusic className="w-5 h-5 text-purple-300" />
            플레이리스트 관리
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            제목을 입력해 만든 뒤, 곡을 검색해 담고 저장하세요. 목록에서 편집·삭제할 수 있어요.
          </DialogDescription>
        </DialogHeader>

        {/* 새로 만들기 */}
        <div className="space-y-2">
          <Label htmlFor="new-playlist-title" className="text-white">새 플레이리스트 제목 *</Label>
          <div className="flex gap-2">
            <Input
              id="new-playlist-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="예: 영권회복특새 2026"
              disabled={isSaving}
              className="bg-slate-700 border-slate-600 text-white flex-1"
            />
            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={isSaving || !title.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : '만들기'}
            </Button>
          </div>

          {/* 단축 주소 코드(선택) — 영소문자·숫자만, 비우면 랜덤 4자 */}
          <Label htmlFor="new-playlist-code" className="text-white text-xs">짧은 주소 코드 (선택)</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono shrink-0">symusic.win/p/</span>
            <Input
              id="new-playlist-code"
              value={shortCodeInput}
              onChange={(e) => setShortCodeInput(e.target.value.toLowerCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="비우면 자동 생성 (예: revival)"
              disabled={isSaving}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="bg-slate-700 border-slate-600 text-white flex-1 font-mono"
            />
          </div>
          {shortCodeInput && normalizeShortCode(shortCodeInput).error && (
            <p className="text-[11px] text-amber-300">{normalizeShortCode(shortCodeInput).error}</p>
          )}
        </div>

        {/* 전체 목록 */}
        <div className="space-y-2 pt-2 border-t border-slate-700">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              플레이리스트 목록{playlists.length > 0 && ` (${playlists.length}개)`}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadPlaylists()}
              disabled={isLoadingList}
              aria-label="목록 새로고침"
              className="h-7 px-2 text-gray-400 hover:text-white hover:bg-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          {isLoadingList && playlists.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-purple-300" />
            </div>
          ) : playlists.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-2">아직 플레이리스트가 없어요.</p>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {playlists.map((p) => {
                const isCurrent = editing?.id === p.id;
                return (
                  <li
                    key={p.id}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm border ${
                      isCurrent
                        ? 'bg-purple-600/40 border-purple-400/60'
                        : 'bg-slate-700/60 border-transparent'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium truncate">{p.title || '(제목 없음)'}</div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {p.songIds.length}곡
                        {' · '}
                        <a
                          href={buildPlaylistPath(p)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono underline-offset-2 hover:underline hover:text-purple-200"
                          title="새 탭에서 열기"
                        >
                          {buildPlaylistPath(p)}
                        </a>
                      </div>
                    </div>
                    {/* STEP 2f: 열기(바로가기) — 공유 페이지를 새 탭에서 연다. 관리 모달은 유지 */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(buildPlaylistPath(p), '_blank', 'noopener,noreferrer')}
                      aria-label="열기"
                      title="새 탭에서 열기"
                      className="h-8 px-2 text-purple-300 hover:text-purple-200 hover:bg-purple-500/10 shrink-0"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleStartEdit(p)}
                      disabled={loadingEditId === p.id || deletingId === p.id}
                      aria-label="편집"
                      className="h-8 px-2 text-blue-300 hover:text-blue-200 hover:bg-blue-500/10 shrink-0"
                    >
                      {loadingEditId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDelete(p)}
                      disabled={deletingId !== null}
                      aria-label="삭제"
                      className="h-8 px-2 text-red-300 hover:text-red-200 hover:bg-red-500/10 shrink-0"
                    >
                      {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 편집 (편집 중인 플레이리스트가 있을 때만) */}
        {editing && (
          <div className="space-y-3 pt-2 border-t border-slate-700">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-white font-medium">편집 중</p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!confirmDiscard()) return;
                    setEditing(null);
                    setSaved({ title: '', songIds: [], showSermon: false });
                  }}
                  className="text-gray-400 hover:text-white hover:bg-slate-700"
                >
                  닫기
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSaveEdit()}
                  disabled={isSavingEdit || !isDirty}
                  className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                >
                  {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
                </Button>
              </div>
            </div>

            {/* 제목 수정 */}
            <div className="space-y-1">
              <Label htmlFor="edit-playlist-title" className="text-white text-xs">제목</Label>
              <Input
                id="edit-playlist-title"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                disabled={isSavingEdit}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>

            {/* 설교 요약 표시 옵션 (showSermon) */}
            <div className="rounded-lg bg-slate-900/50 px-3 py-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.showSermon}
                  onChange={(e) => setEditing({ ...editing, showSermon: e.target.checked })}
                  disabled={isSavingEdit}
                  className="mt-0.5 flex-shrink-0 w-4 h-4 accent-purple-600 cursor-pointer"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-white">설교 요약 표시</span>
                  <span className="block text-[11px] text-gray-400">
                    켜면 이 플레이리스트 공유 페이지에서 각 곡의 설교 인포그래픽이 보입니다
                  </span>
                </span>
              </label>
            </div>

            {/* 담긴 곡 목록 — ↑ ↓ × */}
            <div className="rounded-lg bg-slate-900/50 px-3 py-2">
              <p className="text-xs text-gray-400 mb-1">
                담긴 곡 {editing.songIds.length}개{isDirty && <span className="text-amber-300"> · 저장 안 됨</span>}
              </p>
              {editing.songIds.length === 0 ? (
                <p className="text-xs text-gray-500">아래에서 곡을 검색해 추가하세요.</p>
              ) : (
                <ol className="space-y-1 max-h-40 overflow-y-auto">
                  {editing.songIds.map((id, i) => (
                    <li key={id} className="flex items-center gap-1.5 text-sm text-gray-100">
                      <span className="text-[11px] text-gray-500 w-5 shrink-0">{i + 1}.</span>
                      <SongTitle
                        title={songMap.get(id)?.title ?? '(삭제된 곡)'}
                        className="flex-1 min-w-0"
                        tagClassName="text-[11px] text-purple-300"
                        restClassName="truncate"
                      />
                      <button
                        type="button"
                        onClick={() => moveSong(i, -1)}
                        disabled={i === 0}
                        aria-label="위로"
                        className="p-1 rounded text-gray-400 hover:text-white hover:bg-slate-700 disabled:opacity-25 shrink-0"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSong(i, 1)}
                        disabled={i === editing.songIds.length - 1}
                        aria-label="아래로"
                        className="p-1 rounded text-gray-400 hover:text-white hover:bg-slate-700 disabled:opacity-25 shrink-0"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSong(i)}
                        aria-label="제거"
                        className="p-1 rounded text-red-300 hover:text-red-200 hover:bg-red-500/10 shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* 곡 검색·추가 */}
            <Input
              value={songQuery}
              onChange={(e) => setSongQuery(e.target.value)}
              placeholder="곡 제목 검색"
              className="bg-slate-700 border-slate-600 text-white"
            />
            {filteredSongs.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-2">검색 결과가 없습니다.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1">
                {filteredSongs.map((song) => {
                  const added = editing.songIds.includes(song.id);
                  return (
                    <div
                      key={song.id}
                      className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${
                        added ? 'bg-purple-900/30' : 'bg-slate-700/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <SongTitle
                          title={song.title}
                          className={`text-sm ${added ? 'text-purple-200' : 'text-white'}`}
                          tagClassName="text-[11px] text-purple-300"
                          restClassName="truncate"
                        />
                        <p className="text-[11px] text-gray-400">{song.category}</p>
                      </div>
                      {added ? (
                        <span className="flex items-center gap-1 text-xs text-purple-300 shrink-0">
                          <Check className="w-3.5 h-3.5" /> 담김
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => addSong(song.id)}
                          className="text-green-300 hover:text-green-200 hover:bg-green-500/10 px-2 shrink-0"
                        >
                          <Plus className="w-4 h-4" /> 추가
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
