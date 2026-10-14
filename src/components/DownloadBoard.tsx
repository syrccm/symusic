// 하단 '다운로드' 탭 본문 — NoticePanel 의 list/detail 구조에서 form 을 뺀 게시판.
// - 데이터는 MusicPlayer 의 useDownloads() 결과를 props 로 받는다(관리 모달과 구독 공유).
// - 목록: active !== false 만, 최신순(훅이 정렬). 상단 검색(제목·설명 includes, NFC 정규화).
// - 상세: 제목·설명(줄바꿈 유지) + [다운로드] = <a target="_blank" rel="noopener noreferrer"> 로 MEGA 링크를 새 탭에 연다.
//   url 이 isHttpsUrl 을 통과하지 못하면(콘솔 입력 등) 버튼 비활성 + 안내.
//   ※ iOS 홈 화면(standalone) 에서는 외부 origin 링크가 Safari 로 나간다. 실기기 확인 항목.
import { useMemo, useState } from 'react';
import type { FirestoreError } from 'firebase/firestore';
import { ArrowLeft, Download, FolderDown, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DownloadItem } from '@/hooks/useDownloads';
import { isHttpsUrl } from '@/utils/isHttpsUrl';

interface DownloadBoardProps {
  downloads: DownloadItem[];
  loading: boolean;
  error: FirestoreError | null;
}

type View = 'list' | 'detail';

// 곡 제목과 같은 이유로(Firestore 에 NFD 저장 가능) 검색 시 양쪽 모두 NFC 로 맞춘다.
const norm = (s: string) => s.normalize('NFC').toLowerCase();

/** createdAt millis → 'YY.MM.DD'(KST). 0 이면 빈 문자열. */
function formatShortDate(ms: number): string {
  if (!ms) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(ms))
    .replace(/\s/g, '')
    .replace(/\.$/, '');
}

function describeReadError(err: FirestoreError): string {
  if (err.code === 'permission-denied') return '접근 권한 설정이 필요합니다. 관리자에게 문의하세요.';
  if (err.code === 'unavailable') return 'Firebase 서버에 연결할 수 없습니다. 네트워크를 확인하세요.';
  return `불러오는 중 오류가 발생했습니다. ${err.message ?? ''}`.trim();
}

export function DownloadBoard({ downloads, loading, error }: DownloadBoardProps) {
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');

  const activeItems = useMemo(() => downloads.filter((d) => d.active !== false), [downloads]);

  const filtered = useMemo(() => {
    const q = norm(queryText.trim());
    if (!q) return activeItems;
    return activeItems.filter((d) => norm(d.title).includes(q) || norm(d.note).includes(q));
  }, [activeItems, queryText]);

  // 상세로 들어간 뒤 관리자가 비활성/삭제하면 목록으로 돌아가도록 active 목록에서 찾는다.
  const selected = useMemo(() => activeItems.find((d) => d.id === selectedId) ?? null, [activeItems, selectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setView('detail');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedId(null);
  };

  const linkOk = selected ? isHttpsUrl(selected.url) : false;

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 mb-1">
        <FolderDown className="w-5 h-5 text-pink-300 flex-shrink-0" />
        <h2 className="text-white text-xl font-normal">다운로드</h2>
      </div>
      <p className="text-purple-200/80 text-sm font-light mb-4">
        {view === 'detail' ? '자료 상세' : '악보·MR 등 자료를 내려받으세요'}
      </p>

      {view === 'list' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-300 pointer-events-none" />
            <Input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="제목·설명 검색"
              className="bg-slate-800/50 border-purple-400/30 text-white pl-9 h-11 font-light text-base"
              aria-label="자료 검색"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-purple-300" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-base text-rose-300 font-light break-keep">{describeReadError(error)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-base text-gray-400 font-light">
              <FolderDown className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              {activeItems.length === 0 ? '등록된 자료가 없습니다' : '검색 결과가 없습니다'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(item.id);
                    }
                  }}
                  className="w-full text-left rounded-lg p-3 transition-colors border cursor-pointer bg-slate-800/40 border-slate-700 hover:bg-slate-700/50"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-light text-white line-clamp-2 break-keep">{item.title || '(제목 없음)'}</p>
                      {item.note && <p className="text-sm text-gray-300 mt-0.5 font-light truncate">{item.note}</p>}
                      <p className="text-sm text-purple-200/70 mt-0.5 font-light">{formatShortDate(item.createdAt)}</p>
                    </div>
                    <Download className="w-4 h-4 text-purple-300 flex-shrink-0 mt-1" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'detail' && selected && (
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToList}
            className="text-purple-300 hover:text-pink-300 hover:bg-pink-500/10 -ml-2 font-light text-base"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            목록으로
          </Button>

          <div className="space-y-2">
            <h2 className="text-xl font-normal bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent break-keep">
              {selected.title || '(제목 없음)'}
            </h2>
            <p className="text-sm text-gray-400 font-light">{formatShortDate(selected.createdAt)}</p>
          </div>

          {selected.note && (
            <div className="whitespace-pre-line text-base leading-relaxed text-gray-100 break-keep py-2 font-light">
              {selected.note}
            </div>
          )}

          <div className="border-t border-purple-500/30 pt-3 space-y-2">
            {linkOk ? (
              <a
                href={selected.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 rounded-md inline-flex items-center justify-center gap-2 font-medium text-base bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white transition-colors"
              >
                <Download className="w-5 h-5" />
                다운로드
              </a>
            ) : (
              <>
                <button
                  type="button"
                  disabled
                  className="w-full h-12 rounded-md inline-flex items-center justify-center gap-2 font-medium text-base bg-slate-700 text-gray-400 cursor-not-allowed"
                >
                  <Download className="w-5 h-5" />
                  다운로드
                </button>
                <p className="text-sm text-rose-300 font-light text-center">링크가 올바르지 않습니다</p>
              </>
            )}
            <p className="text-xs text-purple-200/70 font-light text-center">MEGA 클라우드 저장소가 새 창으로 열립니다</p>
          </div>
        </div>
      )}

      {view === 'detail' && !selected && (
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToList}
            className="text-purple-300 hover:text-pink-300 hover:bg-pink-500/10 -ml-2 font-light text-base"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            목록으로
          </Button>
          <p className="text-base text-gray-400 font-light text-center py-8">이 자료는 더 이상 제공되지 않습니다</p>
        </div>
      )}
    </div>
  );
}
