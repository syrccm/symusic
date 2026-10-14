// 하단 '다운로드' 탭 본문 — NoticePanel 의 list/detail 구조에서 form 을 뺀 게시판.
// - 데이터는 MusicPlayer 의 useDownloads() 결과를 props 로 받는다(관리 모달과 구독 공유).
// - 목록: active !== false 만, 최신순(훅이 정렬). 상단 검색(제목·설명 includes, NFC 정규화).
// - 파일 주소 = VITE_DOWNLOAD_BASE_URL(끝 '/' 정규화) + enc(folder) + '/' + enc(filename). 세그먼트별 encodeURIComponent.
//   기본 URL 이 비어 있으면(환경변수 미설정) 상단에 안내만 보여 주고 파일 링크는 만들지 않는다.
// - 목록 행: 제목 + 요약("악보 5 · MR 2") + 등록일. 확장자 .pdf → 악보, .mp3/.m4a/.wav → 반주(MR), 그 외 → 기타.
// - 상세: 제목·설명(줄바꿈 유지) 아래 악보/반주/기타 섹션(빈 섹션 숨김). 각 행 = 라벨 + [보기|듣기](새 탭) + [저장](download).
//   라벨 = 파일명에서 확장자 제거 → 앞이 `${folder}_` 또는 `${title}_` 이면 그 접두사 제거.
//   ※ download 속성은 교차 출처 파일에서 브라우저가 무시할 수 있다(R2 응답 헤더에 따라 다름). iOS 는 열린 파일에서
//     공유 → 파일에 저장 안내. iOS 홈 화면(standalone) 에서는 외부 origin 링크가 Safari 로 나간다. 실기기 확인 항목.
import { useMemo, useState } from 'react';
import type { FirestoreError } from 'firebase/firestore';
import { ArrowLeft, Download, ExternalLink, FolderDown, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DownloadItem } from '@/hooks/useDownloads';

// 빌드 시 고정되는 값. 끝에 '/' 가 없으면 붙인다. 비어 있으면 '' (게시판 안내).
const DOWNLOAD_BASE_URL: string = (() => {
  const raw = String(import.meta.env.VITE_DOWNLOAD_BASE_URL ?? '').trim();
  if (!raw) return '';
  return raw.endsWith('/') ? raw : `${raw}/`;
})();

function fileUrl(folder: string, filename: string): string {
  return `${DOWNLOAD_BASE_URL}${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`;
}

type FileKind = 'score' | 'mr' | 'other';

const SECTIONS: { kind: FileKind; label: string; summary: string; open: string }[] = [
  { kind: 'score', label: '악보', summary: '악보', open: '보기' },
  { kind: 'mr', label: '반주', summary: 'MR', open: '듣기' },
  { kind: 'other', label: '기타', summary: '기타', open: '보기' },
];

function fileKind(filename: string): FileKind {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'pdf') return 'score';
  if (ext === 'mp3' || ext === 'm4a' || ext === 'wav') return 'mr';
  return 'other';
}

/** 파일명 → 표시 라벨. 확장자 제거 후 `${folder}_` / `${title}_` 접두사를 떼어낸다(표시 전용, NFC 로 맞춰 비교). */
function fileLabel(filename: string, folder: string, title: string): string {
  const dot = filename.lastIndexOf('.');
  const base = (dot > 0 ? filename.slice(0, dot) : filename).normalize('NFC');
  for (const prefix of [folder.normalize('NFC'), title.normalize('NFC')]) {
    if (prefix && base.startsWith(`${prefix}_`)) return base.slice(prefix.length + 1) || base;
  }
  return base;
}

/** "악보 5 · MR 2" 형태 요약. 0개인 종류는 생략. */
function summarizeFiles(files: string[]): string {
  const counts: Record<FileKind, number> = { score: 0, mr: 0, other: 0 };
  for (const f of files) counts[fileKind(f)] += 1;
  return SECTIONS.filter((s) => counts[s.kind] > 0)
    .map((s) => `${s.summary} ${counts[s.kind]}`)
    .join(' · ');
}

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

  const sections = useMemo(() => {
    if (!selected) return [];
    return SECTIONS.map((s) => ({
      ...s,
      files: selected.files.filter((f) => fileKind(f) === s.kind),
    })).filter((s) => s.files.length > 0);
  }, [selected]);

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 mb-1">
        <FolderDown className="w-5 h-5 text-pink-300 flex-shrink-0" />
        <h2 className="text-white text-xl font-normal">다운로드</h2>
      </div>
      <p className="text-purple-200/80 text-sm font-light mb-4">
        {view === 'detail' ? '자료 상세' : '악보·MR 등 자료를 내려받으세요'}
      </p>

      {!DOWNLOAD_BASE_URL && (
        <p className="mb-4 rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 font-light break-keep">
          다운로드 저장소가 설정되지 않았습니다
        </p>
      )}

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
                      <p className="text-sm text-purple-200/70 mt-0.5 font-light">
                        {[summarizeFiles(item.files), formatShortDate(item.createdAt)].filter(Boolean).join(' · ')}
                      </p>
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

          {DOWNLOAD_BASE_URL && (
            <div className="border-t border-purple-500/30 pt-3 space-y-4">
              {sections.length === 0 ? (
                <p className="text-sm text-gray-400 font-light text-center py-4">등록된 파일이 없습니다</p>
              ) : (
                sections.map((section) => (
                  <div key={section.kind} className="space-y-1.5">
                    <p className="text-sm text-purple-200/80 font-normal">{section.label}</p>
                    {section.files.map((filename, i) => {
                      const href = fileUrl(selected.folder, filename);
                      return (
                        <div
                          key={`${i}-${filename}`}
                          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2"
                        >
                          <p className="flex-1 min-w-0 text-base font-light text-white break-keep">
                            {fileLabel(filename, selected.folder, selected.title)}
                          </p>
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-md text-sm text-purple-200 border border-purple-400/40 hover:bg-purple-500/20 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            {section.open}
                          </a>
                          <a
                            href={href}
                            download={filename}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-md text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            저장
                          </a>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              <p className="text-xs text-purple-200/70 font-light text-center break-keep">
                iPhone 은 열린 파일에서 공유 → 파일에 저장
              </p>
            </div>
          )}
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
