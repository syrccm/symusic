// 배너 관리 모달 (관리자 전용, /0691 음표 메뉴 → "📣 배너 관리")
// - 대상: Firestore config/banner 단일 문서 = { enabled: boolean, text: string, link: string, updatedAt: ISO }
//   useBanner 는 켜진 배너만 돌려주므로 여기서는 쓰지 않고, 모달을 열 때 getDoc 으로 원본(꺼진 상태 포함)을 읽는다.
// - 링크는 기존 플레이리스트 선택만(buildPlaylistPath → /p/코드, 구 데이터는 /playlist/id). 직접 입력은 없다.
//   저장된 link 가 목록에 없는 값(콘솔 입력)이면 '(현재 값)' 항목으로 보여 줘 저장 시 값이 사라지지 않게 한다.
// - 저장 = setDoc 전체 교체(merge 없음) → 문서 키를 위 4개로 고정. 켜짐이면 문구·링크 필수, 문구는 TEXT_MAX 자
//   (꺼짐 저장은 길이 검사 없음 — 콘솔에 긴 문구가 있어도 끄기는 되게).
//   불러오기(load)에 성공했을 때만 저장 가능(loaded) — 실패 시 기본값 폼으로 저장하면 전체 교체라 기존 설정이 지워지므로.
//   text 는 PlaylistBanner 에서 순수 문자열(JSX 텍스트 노드)로만 렌더한다 — HTML 렌더로 바꾸지 말 것.
// - 삭제 버튼 없음: 끄기 = enabled false 저장.
// - 핸들러 순서(PlaylistManagerDialog 패턴): !isAdmin → 입력 검증 → !db → 재진입 방지 → try/await/toast → catch → finally.
// - 쓰기 규칙(콘솔 수동 반영): config/banner read 개방, write 로그인 사용자. 규칙 반영 전에는 permission-denied 안내.
import { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { Loader2, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildPlaylistPath } from '@/utils/playlistShortCode';

interface BannerManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}

/** 링크 선택 항목(플레이리스트 제목 + 공유 경로) */
interface LinkOption {
  path: string;
  title: string;
}

const TEXT_MAX = 100;

export function BannerManagerDialog({ open, onOpenChange, isAdmin }: BannerManagerDialogProps) {
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [options, setOptions] = useState<LinkOption[]>([]);
  const [loading, setLoading] = useState(true); // 첫 렌더부터 스피너(load 전 '불러오지 못함' 문구 깜빡임 방지)
  const [loaded, setLoaded] = useState(false); // load 성공 여부. false 면 저장 불가
  const [saving, setSaving] = useState(false);

  // 모달을 열 때 배너 원본과 플레이리스트 목록을 함께 읽는다.
  const load = useCallback(async () => {
    if (!db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoaded(false);
    try {
      const [bannerSnap, playlistSnap] = await Promise.all([
        getDoc(doc(db, 'config', 'banner')),
        getDocs(collection(db, 'playlists')),
      ]);
      const raw = bannerSnap.exists() ? (bannerSnap.data() as Record<string, unknown>) : {};
      setEnabled(raw.enabled === true);
      setText(typeof raw.text === 'string' ? raw.text : '');
      setLink(typeof raw.link === 'string' ? raw.link.trim() : '');

      const list = playlistSnap.docs
        .map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            path: buildPlaylistPath({
              id: d.id,
              shortCode: typeof data.shortCode === 'string' && data.shortCode ? data.shortCode : undefined,
            }),
            title: typeof data.title === 'string' && data.title ? data.title : '(제목 없음)',
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ path, title }) => ({ path, title }));
      setOptions(list);
      setLoaded(true);
    } catch (error) {
      console.error('❌ [Banner] 불러오기 오류:', error);
      toast.error('배너 설정을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // 저장된 link 가 목록에 없으면(콘솔 입력 값) 선택지로 덧붙여 Select 가 현재 값을 보여 주게 한다.
  const linkOptions: LinkOption[] =
    link && !options.some((o) => o.path === link) ? [...options, { path: link, title: '(현재 값)' }] : options;

  const handleSave = async () => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (!loaded) {
      toast.error('배너 설정을 불러오지 못해 저장할 수 없습니다. 모달을 닫았다가 다시 열어 주세요.');
      return;
    }
    const trimmedText = text.trim();
    if (enabled && !trimmedText) {
      toast.error('배너 문구를 입력해주세요.');
      return;
    }
    if (enabled && trimmedText.length > TEXT_MAX) {
      toast.error(`배너 문구는 ${TEXT_MAX}자 이내로 입력해주세요.`);
      return;
    }
    if (enabled && !link) {
      toast.error('연결할 플레이리스트를 선택해주세요.');
      return;
    }
    if (!db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'banner'), {
        enabled,
        text: trimmedText,
        link,
        updatedAt: new Date().toISOString(),
      });
      setText(trimmedText);
      toast.success(enabled ? '배너를 켰습니다. 메인 화면에 바로 표시됩니다.' : '배너를 껐습니다.');
      onOpenChange(false);
    } catch (error) {
      console.error('❌ [Banner] 저장 오류:', error);
      const code = (error as { code?: string } | null)?.code;
      toast.error(
        code === 'permission-denied'
          ? 'Firebase 권한이 없습니다. 관리자 로그인 상태와 config/banner 쓰기 규칙을 확인하세요.'
          : '배너 저장 중 오류가 발생했습니다.',
      );
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || saving || !loaded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-purple-300" />
            배너 관리
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            메인 화면 곡 목록 위에 보이는 한 줄 배너입니다. 켜면 모든 방문자에게 바로 표시돼요.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-purple-300" />
          </div>
        ) : (
          <div className="space-y-4">
            {!loaded && (
              <p className="text-xs text-rose-300">
                배너 설정을 불러오지 못했습니다. 모달을 닫았다가 다시 열어 주세요.
              </p>
            )}
            {/* 켜기/끄기 */}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={busy}
                className="mt-0.5 flex-shrink-0 w-4 h-4 accent-purple-600 cursor-pointer"
              />
              <span className="min-w-0">
                <span className="block text-sm text-white">배너 표시</span>
                <span className="block text-[11px] text-gray-400">끄면 문구와 링크는 남겨 둔 채 화면에서만 숨깁니다</span>
              </span>
            </label>

            {/* 문구 */}
            <div className="space-y-1.5">
              <Label htmlFor="banner-text" className="text-white text-xs">
                문구 {enabled ? '*' : ''}
              </Label>
              <Input
                id="banner-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="예: 영권회복특새 찬양 듣기"
                maxLength={TEXT_MAX}
                disabled={busy}
                className="bg-slate-700 border-slate-600 text-white"
              />
              <p className="text-[11px] text-gray-500">
                {text.trim().length}/{TEXT_MAX}자 · 화면에서는 한 줄로 보이고 길면 말줄임됩니다
              </p>
            </div>

            {/* 링크(플레이리스트 선택) */}
            <div className="space-y-1.5">
              <Label className="text-white text-xs">연결할 플레이리스트 {enabled ? '*' : ''}</Label>
              <Select value={link} onValueChange={setLink} disabled={busy}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="플레이리스트 선택" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  {linkOptions.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-400">플레이리스트가 없습니다. 먼저 만들어 주세요.</div>
                  ) : (
                    linkOptions.map((o) => (
                      <SelectItem key={o.path} value={o.path} className="text-white">
                        {o.title}
                        <span className="ml-1.5 font-mono text-[11px] text-gray-400">{o.path}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={busy}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
