import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2, Music, Pause, Play, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSongs, type Song } from '@/hooks/useSongs';
import { useShare } from '@/hooks/useShare';
import { PlayPromptModal } from '@/components/PlayPromptModal';

const NOT_FOUND_GRACE_MS = 3000;

const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=win.symusic.www.twa&pcampaignid=web_share';

function formatTime(time: number) {
  if (isNaN(time)) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function SimpleSongPlayer() {
  const { songId } = useParams<{ songId: string }>();
  const navigate = useNavigate();
  const { songs, loading } = useSongs({ silent: true });
  const { shareSong } = useShare();

  const audioRef = useRef<HTMLAudioElement>(null);
  const [song, setSong] = useState<Song | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [promptingPlay, setPromptingPlay] = useState(false);

  // 곡 검색 — songs 도착 후 매칭, grace 윈도우 후에도 없으면 notFound
  // 한 번 매칭되면 onSnapshot 재호출(캐시→서버)로 songs가 새 참조로 바뀌어도
  // song을 재설정하지 않음 (재설정하면 audio.src가 다시 세팅되어 재생이 처음부터 시작됨)
  useEffect(() => {
    if (!songId) {
      setNotFound(true);
      return;
    }
    if (songs.length === 0) return;
    if (song && song.id === songId) return;

    const target = songs.find((s) => s.id === songId);
    if (target) {
      setSong(target);
      setNotFound(false);
      return;
    }

    const timer = window.setTimeout(() => setNotFound(true), NOT_FOUND_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [songId, songs, song]);

  // song 결정되면: audio.src 설정 + 이벤트 listener 등록 + 자동 재생 시도
  // (이전 빈 deps useEffect는 loading 화면 첫 렌더 시점에 audioRef가 null이라
  //  listener 등록이 영구 실패했음 — 정상 화면이 렌더된 시점에 등록되도록 통합)
  useEffect(() => {
    if (!song?.audioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;

    audio.src = song.audioUrl;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDuration = () => {
      if (!isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => setIsPlaying(false);
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
        .then(() => setIsPlaying(true))
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
    }).catch(() => {
      toast.error('재생에 실패했습니다. 다시 시도해주세요.');
    });
  };

  const handleShare = () => {
    if (!song) return;
    shareSong({ id: song.id, title: song.title });
  };

  // 로딩
  if (loading || (!song && !notFound)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-purple-400 mx-auto" />
          <p className="text-purple-200 text-sm">찬양을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 곡 없음
  if (notFound || !song) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4">
        <Card className="max-w-sm w-full bg-slate-800/50 border-slate-700">
          <CardContent className="p-6 text-center space-y-4">
            <Music className="h-12 w-12 text-gray-500 mx-auto" />
            <div>
              <p className="text-white text-base font-medium">찬양을 찾을 수 없어요</p>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="flex flex-col min-h-screen max-w-md mx-auto px-4 py-6">

        <div className="flex items-center space-x-2 mb-6">
          <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Music className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold">SY Music</h1>
            <p className="text-[10px] text-purple-300">수영로말씀적용찬양</p>
          </div>
        </div>

        <Card className="flex-1 bg-slate-800/50 border-slate-700 flex flex-col">
          <CardContent className="p-6 flex flex-col flex-1 space-y-5">

            <div className="text-center space-y-2 pb-4 border-b border-slate-700">
              <p className="text-xs text-purple-300">🎁 찬양 선물이 도착했어요</p>
              <div className="text-sm text-left space-y-1">
                {song.description
                  ?.split('|')
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0)
                  .map((part, idx) => {
                    const labels = ['제목', '본문', '설교자', '구분', '날짜'];
                    const label = labels[idx];
                    return (
                      <p key={idx}>
                        {label && <span className="text-gray-400">{label}: </span>}
                        <span className="text-gray-200">{part}</span>
                      </p>
                    );
                  }) ?? null}
              </div>
            </div>

            <div className="min-h-[140px] bg-slate-700/30 rounded-lg p-4">
              {song.lyrics ? (
                <div className="whitespace-pre-line text-white leading-relaxed text-center text-sm">
                  {song.lyrics}
                </div>
              ) : (
                <p className="text-gray-400 text-xs text-center pt-6">
                  가사가 준비되지 않았어요
                </p>
              )}
            </div>

            <div className="space-y-1">
              <div
                className="w-full h-1.5 bg-slate-600 rounded-full cursor-pointer"
                onClick={handleSeek}
              >
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-100"
                  style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <Button
                onClick={togglePlay}
                aria-label={isPlaying ? '일시정지' : '재생'}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 w-16 h-16 rounded-full"
                disabled={!song.audioUrl}
              >
                {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 ml-0.5" />}
              </Button>
            </div>

            <Button
              onClick={handleShare}
              variant="outline"
              className="w-full bg-slate-700/30 border-purple-400/40 text-purple-200 hover:bg-purple-400/10 hover:text-white"
            >
              <Share2 className="h-4 w-4 mr-2" />
              이 찬양 다른 분과 나누기
            </Button>
          </CardContent>
        </Card>

        <div className="mt-4 rounded-2xl border-2 border-purple-300/40 bg-gradient-to-br from-purple-600/80 to-pink-600/70 p-6 text-center shadow-xl shadow-purple-500/40">
          <p className="text-base text-white leading-relaxed mb-4">
            💜 말씀의 은혜,<br />
            찬양으로 일주일 내내<br />
            <br />
            '<span className="font-bold text-yellow-200">수영로말씀적용찬양</span>' 앱에서<br />
            다운받고 누리세요
          </p>
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block hover:opacity-90 transition-opacity"
            aria-label="Google Play에서 수영로말씀적용찬양 앱 받기"
          >
            <img
              src="/google-play-badge-ko.png"
              alt="Google Play에서 받기"
              className="h-16 mx-auto"
            />
          </a>
        </div>

        <audio ref={audioRef} loop crossOrigin="anonymous" preload="metadata" />
      </div>

      {promptingPlay && (
        <PlayPromptModal
          songTitle={song.title}
          onPlay={handleConfirmPlay}
          onCancel={() => setPromptingPlay(false)}
        />
      )}
    </div>
  );
}
