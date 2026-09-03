// 플레이리스트 공유 페이지 — /playlist/:playlistId
// SimpleSongPlayer(1곡 공유)를 복제해 여러 곡 연속 재생으로 확장한 버전.
// - Firestore playlists/{id} = { title, songIds[], createdAt } 를 읽기 전용으로 로드
// - songIds 순서대로 useSongs 의 전체 곡에서 매핑(삭제된 곡 id 는 건너뜀)
// - index 상태 기반 연속 재생: 곡이 끝나면 다음 곡, 마지막 곡이면 정지
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { findPlaylistIdByShortCode } from '@/utils/playlistShortCode';
import {
  ArrowRight,
  Home,
  ListMusic,
  Loader2,
  Music,
  Pause,
  Play,
  Share2,
  SkipBack,
  SkipForward,
  Smartphone,
  Youtube,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { db } from '@/lib/firebase';
import { useSongs, type Song } from '@/hooks/useSongs';
import { useShare } from '@/hooks/useShare';
import { SongTitle } from '@/components/SongTitle';
import { PlayPromptModal } from '@/components/PlayPromptModal';
import { InstallGuideModal } from '@/components/InstallGuideModal';
import { detectInstallMethod, type InstallMethod } from '@/utils/deviceDetect';
import { trackInstall, trackSongPlay } from '@/utils/analyticsTracker';

const EMPTY_GRACE_MS = 3000;

const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=win.symusic.www.twa&pcampaignid=web_share';

interface Playlist {
  id: string;
  title: string;
  songIds: string[];
  createdAt?: string;
  shortCode?: string;
}

function formatTime(time: number) {
  if (isNaN(time)) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// 곡 설명("제목|본문|설교자|구분|날짜") 파싱 — MusicPlayer.parseSermon 과 동일
const parseSermon = (description?: string) =>
  description
    ?.split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0) ?? [];

export default function PlaylistPlayer() {
  // /playlist/:playlistId (문서 id, 구 주소) 또는 /p/:code (shortCode, 단축 주소) 둘 다 지원
  const { playlistId: routePlaylistId, code: routeCode } = useParams<{ playlistId?: string; code?: string }>();
  const { sharePlaylist } = useShare();
  const navigate = useNavigate();
  const { songs } = useSongs({ silent: true });

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);
  const [index, setIndex] = useState(0);
  const [song, setSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [promptingPlay, setPromptingPlay] = useState(false);
  const [installGuide, setInstallGuide] = useState<InstallMethod | null>(null);

  // iOS는 PWA 설치 절차가 번거로워 설치 안내 대신 홈으로 보낸다 (SimpleSongPlayer 와 동일)
  const [isIOS] = useState(() => detectInstallMethod().startsWith('ios-'));

  // 1) 플레이리스트 문서 로드 (읽기 전용)
  //    - /p/:code  → shortCode 로 query 해서 문서 id 를 찾은 뒤 getDoc
  //    - /playlist/:playlistId → 기존대로 getDoc
  useEffect(() => {
    const firestore = db;
    if ((!routePlaylistId && !routeCode) || !firestore) {
      setNotFound(true);
      return;
    }
    let cancelled = false;
    const resolveId: Promise<string | null> = routeCode
      ? findPlaylistIdByShortCode(firestore, routeCode.toLowerCase())
      : Promise.resolve(routePlaylistId ?? null);

    resolveId
      .then((id) => {
        if (cancelled || !id) return null;
        return getDoc(doc(firestore, 'playlists', id));
      })
      .then((snap) => {
        if (cancelled) return;
        if (!snap || !snap.exists()) {
          setNotFound(true);
          return;
        }
        const raw = snap.data() as Record<string, unknown>;
        const songIds = Array.isArray(raw.songIds)
          ? raw.songIds.filter((x): x is string => typeof x === 'string')
          : [];
        setPlaylist({
          id: snap.id,
          title: typeof raw.title === 'string' ? raw.title : '',
          songIds,
          createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
          shortCode: typeof raw.shortCode === 'string' && raw.shortCode ? raw.shortCode : undefined,
        });
        setNotFound(false);
      })
      .catch((err) => {
        console.error('[PlaylistPlayer] load failed:', err);
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [routePlaylistId, routeCode]);

  // 2) songIds 순서대로 재생목록 구성 (삭제된 곡 id 는 건너뜀)
  const list = useMemo<Song[]>(() => {
    if (!playlist || songs.length === 0) return [];
    return playlist.songIds
      .map((id) => songs.find((s) => s.id === id))
      .filter((s): s is Song => Boolean(s));
  }, [playlist, songs]);

  // 곡이 전혀 매칭되지 않으면(전부 삭제됨 등) grace 후 빈 상태 표시
  useEffect(() => {
    if (!playlist || songs.length === 0) return;
    if (list.length > 0) {
      setIsEmpty(false);
      return;
    }
    const timer = window.setTimeout(() => setIsEmpty(true), EMPTY_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [playlist, songs, list]);

  // 3) index → 현재 곡. 같은 id 면 재설정하지 않음
  //    (onSnapshot 재호출로 songs 참조가 바뀌어도 audio.src 를 다시 세팅해 처음부터 재생되지 않도록)
  useEffect(() => {
    const target = list[index];
    if (!target) return;
    if (song && song.id === target.id) return;
    setSong(target);
  }, [list, index, song]);

  // handleEnded 가 최신 index/목록 길이를 리스너 재등록 없이 참조하기 위한 ref
  const indexRef = useRef(index);
  const listLengthRef = useRef(list.length);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    listLengthRef.current = list.length;
  }, [list.length]);

  // 4) song 결정되면: audio.src 설정 + 리스너 등록 + 자동 재생 시도 (SimpleSongPlayer 와 동일 구조)
  //    차이: loop 없음, ended 시 다음 곡으로 진행, 마지막 곡이면 첫 곡으로 순환(전체 반복, STEP 2g)
  useEffect(() => {
    if (!song?.audioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;

    audio.src = song.audioUrl;
    setCurrentTime(0);
    setDuration(0);

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDuration = () => {
      if (!isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => {
      const next = indexRef.current + 1;
      if (next < listLengthRef.current) {
        // 다음 곡으로 진행 (기존 로직)
        setIsPlaying(false);
        setIndex(next);
        return;
      }
      // STEP 2g: 마지막 곡 → 첫 곡으로 순환(전체 반복)
      if (indexRef.current === 0) {
        // 곡이 1개뿐: index 가 바뀌지 않아 effect 가 재실행되지 않으므로 직접 처음부터 다시 재생
        audio.currentTime = 0;
        audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        return;
      }
      setIsPlaying(false);
      setIndex(0);
    };
    const handleError = () => {
      setIsPlaying(false);
      toast.error('오디오 로드 중 오류가 발생했습니다.');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleDuration);
    audio.addEventListener('durationchange', handleDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          setIsPlaying(true);
          trackSongPlay(song.id).catch((err) =>
            console.error('[Analytics] trackSongPlay failed:', err),
          );
        })
        .catch(() => setPromptingPlay(true));
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleDuration);
      audio.removeEventListener('durationchange', handleDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [song]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {
        toast.error('재생에 실패했습니다.');
      });
    }
  };

  const goPrev = () => {
    if (index > 0) setIndex(index - 1);
  };
  const goNext = () => {
    if (index + 1 < list.length) setIndex(index + 1);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const newTime = pct * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleConfirmPlay = () => {
    const audio = audioRef.current;
    if (!audio) {
      setPromptingPlay(false);
      return;
    }
    audio.play().then(() => {
      setIsPlaying(true);
      setPromptingPlay(false);
      if (song) {
        trackSongPlay(song.id).catch((err) =>
          console.error('[Analytics] trackSongPlay failed:', err),
        );
      }
    }).catch(() => {
      toast.error('재생에 실패했습니다. 다시 시도해주세요.');
    });
  };

  const handleInstallClick = async () => {
    const method = detectInstallMethod();
    try {
      await trackInstall();
    } catch (err) {
      console.error('[Analytics] trackInstall failed:', err);
    }
    if (method === 'android') {
      window.open(PLAY_STORE_URL, '_blank', 'noopener,noreferrer');
      return;
    }
    setInstallGuide(method);
  };

  // 없음 화면 (플레이리스트 문서 없음 / 곡이 전부 사라짐)
  if (notFound || isEmpty) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4">
        <Card className="max-w-sm w-full bg-slate-800/50 border-slate-700">
          <CardContent className="p-6 text-center space-y-4">
            <ListMusic className="h-12 w-12 text-gray-500 mx-auto" />
            <div>
              <p className="text-white text-base font-medium">
                {notFound ? '플레이리스트를 찾을 수 없어요' : '재생할 찬양이 없어요'}
              </p>
              <p className="text-gray-400 text-xs mt-1">
                공유 링크가 더 이상 유효하지 않을 수 있어요
              </p>
            </div>
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              className="text-purple-300 border-purple-400 hover:bg-purple-400/10"
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              SY Music 둘러보기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 로딩 (문서·곡 목록·현재 곡 중 하나라도 아직이면)
  if (!playlist || !song) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-purple-400 mx-auto" />
          <p className="text-purple-200 text-sm">플레이리스트를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="flex flex-col min-h-screen max-w-md mx-auto px-4 py-6">

        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Music className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">SY Music</h1>
            <p className="text-sm text-purple-300">수영로말씀적용찬양</p>
          </div>
        </div>

        <Card className="flex-1 bg-slate-800/50 border-slate-700 flex flex-col">
          <CardContent className="p-6 flex flex-col flex-1 space-y-5">

            {/* 플레이리스트 제목 */}
            <div className="text-center space-y-1 pb-4 border-b border-slate-700">
              <p className="text-base font-semibold text-purple-200">🎁 찬양 선물이 도착했어요</p>
              <h2 className="text-2xl font-bold text-white break-keep">
                {playlist.title || '플레이리스트'}
              </h2>
              <p className="text-xs text-gray-400">{list.length}곡 · 순서대로 이어서 재생돼요</p>
              {/* 공유 버튼 — 누구나(관리자 조건 없음). 모바일: 네이티브 공유 시트 / 데스크톱: 링크 복사 + 토스트 */}
              {playlist.id && (
                <button
                  type="button"
                  onClick={() =>
                    sharePlaylist({
                      id: playlist.id,
                      title: playlist.title || '플레이리스트',
                      shortCode: playlist.shortCode,
                    })
                  }
                  aria-label={`${playlist.title || '플레이리스트'} 공유하기`}
                  className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-teal-400/60 bg-teal-500/15 px-4 py-2 text-sm font-semibold text-teal-200 break-keep transition-colors hover:bg-teal-500/30 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                >
                  <Share2 className="h-4 w-4 flex-shrink-0" />
                  {/* 제목 자동: "{제목} 공유하기", 제목 없으면 "플레이리스트 공유하기" */}
                  {playlist.title ? `${playlist.title} 공유하기` : '플레이리스트 공유하기'}
                </button>
              )}
            </div>

            {/* 곡 목록 — 곡마다 독립 카드(메인 곡 목록 행 팔레트 재사용), 현재곡은 강조 배경 + 왼쪽 강조바 + ▶ 배지.
                클릭하면 그 곡부터 재생. 아래 설교정보와는 구분선으로 분리 */}
            <div className="pb-4 border-b border-slate-700">
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {list.map((s, i) => {
                  const isCurrent = i === index;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3 transition-colors ${
                        isCurrent
                          ? 'bg-gradient-to-r from-purple-500/25 to-pink-500/25 border-purple-400/60 border-l-4 border-l-pink-400 shadow-lg shadow-purple-900/30'
                          : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-700/50 hover:border-slate-600 active:bg-slate-700/70'
                      }`}
                    >
                      {/* 번호 원형 배지 — 현재곡은 ▶ */}
                      <span
                        className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-mono ${
                          isCurrent
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                            : 'bg-slate-700/70 text-gray-300'
                        }`}
                      >
                        {isCurrent ? '▶' : i + 1}
                      </span>
                      <SongTitle
                        title={s.title}
                        className={`text-sm break-keep ${isCurrent ? 'text-white font-semibold' : 'text-gray-200'}`}
                        tagClassName="text-xs text-purple-300/80 leading-tight"
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 설교 정보 (설교제목/본문/설교자/구분·날짜) — MusicPlayer 와 동일 블록, 현재 곡 기준 */}
            {(() => {
              const parts = parseSermon(song.description);
              if (parts.length === 0) return null;
              return (
                <div className="text-left border-b border-slate-600 pb-2 text-base space-y-1 break-keep">
                  {parts[0] && (
                    <p>
                      <span className="text-gray-500">· </span>
                      <span className="text-gray-400">설교제목: </span>
                      <span className="text-gray-200">{parts[0]}</span>
                    </p>
                  )}
                  {parts[1] && (
                    <p>
                      <span className="text-gray-500">· </span>
                      <span className="text-gray-400">설교본문: </span>
                      <span className="text-gray-200">{parts[1]}</span>
                    </p>
                  )}
                  {parts[2] && (
                    <p>
                      <span className="text-gray-500">· </span>
                      <span className="text-gray-400">설교자: </span>
                      <span className="text-gray-200">{parts[2]}</span>
                    </p>
                  )}
                  {(parts[3] || parts[4]) && (
                    <p>
                      {parts[3] && (
                        <>
                          <span className="text-gray-500">· </span>
                          <span className="text-gray-400">구분: </span>
                          <span className="text-gray-200">{parts[3]}</span>
                        </>
                      )}
                      {parts[3] && parts[4] && (
                        <span className="mx-1 text-gray-500">|</span>
                      )}
                      {parts[4] && (
                        <>
                          <span className="text-gray-500">· </span>
                          <span className="text-gray-400">날짜: </span>
                          <span className="text-gray-200">{parts[4]}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* 현재 곡 제목 */}
            <SongTitle
              as="h3"
              title={song.title}
              className="text-xl font-bold text-white text-center break-keep"
              tagClassName="text-sm font-semibold text-purple-300 tracking-wide mb-0.5"
            />

            {/* 진행 바 + 재생 컨트롤 — 가사 위로 배치(스크롤 없이 조작)
                스타일은 MusicPlayer "2. 플레이어" 카드와 동일(진행바 h-1.5, 시간 text-base,
                이전/다음 ghost p-2 h-4 아이콘, 재생 w-12 h-12 보라 원형, space-x-3). 버튼은 3개만. */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="px-2 py-2 sm:px-2 sm:py-2">
                <div className="space-y-3 py-0.5">
                  <div className="space-y-1.5">
                    <div
                      className="w-full h-1.5 bg-slate-600 rounded-full cursor-pointer"
                      onClick={handleSeek}
                    >
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-100"
                        style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                      />
                    </div>
                    <div className="flex justify-between text-base text-gray-400">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* 이전 / 재생·일시정지 / 다음 */}
                  <div className="flex items-center justify-center space-x-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={goPrev}
                      aria-label="이전 곡"
                      className="text-white hover:text-purple-300 hover:bg-purple-500/20 p-2 disabled:opacity-30"
                      disabled={index === 0}
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>

                    <Button
                      onClick={togglePlay}
                      size="sm"
                      aria-label={isPlaying ? '일시정지' : '재생'}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 w-12 h-12 rounded-full"
                      disabled={!song.audioUrl}
                    >
                      {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={goNext}
                      aria-label="다음 곡"
                      className="text-white hover:text-purple-300 hover:bg-purple-500/20 p-2 disabled:opacity-30"
                      disabled={index + 1 >= list.length}
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 가사 */}
            <div className="min-h-[120px] bg-slate-700/30 rounded-lg p-4">
              {song.lyrics ? (
                <div className="whitespace-pre-line text-white leading-relaxed text-center text-base break-keep">
                  {song.lyrics}
                </div>
              ) : (
                <p className="text-gray-400 text-xs text-center pt-6">
                  가사가 준비되지 않았어요
                </p>
              )}
            </div>

            {song.youtubeUrl && (
              <button
                onClick={() => window.open(song.youtubeUrl, '_blank')}
                className="w-full rounded-xl border font-semibold py-3 px-4 inline-flex items-center justify-center gap-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 bg-purple-800 text-white border-purple-400/60 hover:text-pink-300 hover:border-pink-400/70"
              >
                <Youtube className="h-5 w-5 text-red-500" />
                설교 YouTube 바로가기
              </button>
            )}
          </CardContent>
        </Card>

        {isIOS ? (
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="SY Music 홈페이지로 이동"
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 py-4 text-[16px] font-medium text-white transition-colors hover:bg-teal-600 active:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            <Home className="h-5 w-5" />
            SY Music 홈으로 이동
          </button>
        ) : (
          <button
            type="button"
            onClick={handleInstallClick}
            aria-label="스마트폰에 수영로말씀적용찬양 앱 설치하기"
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 py-4 text-[16px] font-medium text-white transition-colors hover:bg-teal-600 active:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            <Smartphone className="h-5 w-5" />
            스마트폰에 설치하기
          </button>
        )}

        {/* loop 없음 — 곡 종료 시 handleEnded 가 다음 곡으로 진행, 마지막 곡이면 첫 곡으로 순환 */}
        <audio ref={audioRef} crossOrigin="anonymous" preload="metadata" />
      </div>

      {promptingPlay && (
        <PlayPromptModal
          songTitle={song.title}
          onPlay={handleConfirmPlay}
          onCancel={() => setPromptingPlay(false)}
        />
      )}

      {installGuide && (
        <InstallGuideModal method={installGuide} onClose={() => setInstallGuide(null)} />
      )}
    </div>
  );
}
