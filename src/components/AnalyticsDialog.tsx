import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { BarChart3, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Song } from '@/hooks/useSongs';
import {
  type AnalyticsStats,
  getCurrentDateKeys,
} from '@/utils/analyticsTracker';

interface AnalyticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songs: Song[];
}

interface StatCardProps {
  label: string;
  value: number;
  unit: string;
}

function StatCard({ label, value, unit }: StatCardProps) {
  return (
    <div className="rounded-lg border border-purple-500/30 bg-slate-800/60 p-3 text-center">
      <p className="text-xs text-purple-300 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">
        {value.toLocaleString('ko-KR')}
        <span className="text-sm font-normal text-gray-400 ml-0.5">{unit}</span>
      </p>
    </div>
  );
}

export function AnalyticsDialog({ open, onOpenChange, songs }: AnalyticsDialogProps) {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !db) return;
    setLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      doc(db, 'analytics', 'stats'),
      (snapshot) => {
        setStats((snapshot.data() as AnalyticsStats) ?? {});
        setLoading(false);
      },
      (err) => {
        console.error('[Analytics] subscribe failed:', err);
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [open]);

  const { date: today, month } = getCurrentDateKeys();
  const totalVisits = stats?.total_visits ?? 0;
  const totalUnique = stats?.total_unique_visitors ?? 0;
  const monthVisits = stats?.monthly?.[month]?.visits ?? 0;
  const todayVisits = stats?.daily?.[today]?.visits ?? 0;
  const totalShares = stats?.total_shares ?? 0;
  const totalInstalls = stats?.total_installs ?? 0;
  const totalSongPlays = stats?.total_song_plays ?? 0;
  const conversionRate =
    totalShares > 0 ? Math.round((totalInstalls / totalShares) * 1000) / 10 : null;

  const songMap = new Map(songs.map((s) => [s.id, s]));
  const topSongs = Object.entries(stats?.songs ?? {})
    .map(([id, data]) => ({
      id,
      title: songMap.get(id)?.title ?? '(삭제된 곡)',
      plays: data?.plays ?? 0,
    }))
    .filter((s) => s.plays > 0)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-4 bg-gradient-to-b from-purple-900/95 to-slate-900/95 border-purple-500/30 text-gray-200 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-300" />
            SY Music 사용 통계
          </DialogTitle>
          <DialogDescription className="text-purple-200/80 text-xs">
            실시간 자가 통계 (KST 기준)
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-purple-300" />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg border border-red-500/40 bg-red-900/30 p-3 text-sm text-red-200">
            통계 로드 실패: {error}
            <p className="text-xs mt-1 text-red-300/80">
              Firebase Console에서 analytics/stats 문서 읽기 권한을 확인해주세요.
            </p>
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="전체 접속" value={totalVisits} unit="회" />
              <StatCard label="이번 달" value={monthVisits} unit="회" />
              <StatCard label="오늘" value={todayVisits} unit="회" />
              <StatCard label="고유 방문자" value={totalUnique} unit="명" />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-pink-300 mb-2 flex items-center gap-1">
                🎵 인기 곡 TOP 5
                <span className="text-xs text-gray-400 font-normal ml-auto">
                  전체 재생 {totalSongPlays.toLocaleString('ko-KR')}회
                </span>
              </h3>
              {topSongs.length > 0 ? (
                <ol className="text-sm text-gray-200 space-y-1.5 rounded-lg bg-slate-800/40 p-3">
                  {topSongs.map((song, idx) => (
                    <li key={song.id} className="flex items-center gap-2">
                      <span className="text-purple-300 font-bold w-5 flex-shrink-0">
                        {idx + 1}.
                      </span>
                      <span className="flex-1 truncate">{song.title}</span>
                      <span className="text-xs text-pink-300 flex-shrink-0">
                        {song.plays.toLocaleString('ko-KR')}회
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-gray-400 rounded-lg bg-slate-800/40 p-3">
                  아직 재생된 곡이 없습니다.
                </p>
              )}
            </div>

            <div className="space-y-1.5 text-sm text-gray-200 rounded-lg bg-slate-800/40 p-3">
              <p className="flex items-center justify-between">
                <span>📤 공유 클릭</span>
                <span className="text-pink-300 font-semibold">
                  {totalShares.toLocaleString('ko-KR')}회
                </span>
              </p>
              <p className="flex items-center justify-between">
                <span>📲 앱 설치 클릭</span>
                <span className="text-pink-300 font-semibold">
                  {totalInstalls.toLocaleString('ko-KR')}회
                </span>
              </p>
              {conversionRate !== null && (
                <p className="flex items-center justify-between border-t border-slate-700 pt-1.5 mt-1.5">
                  <span className="text-purple-300">→ 설치 전환율</span>
                  <span className="text-yellow-200 font-semibold">{conversionRate}%</span>
                </p>
              )}
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          className="w-full bg-slate-700/60 border border-purple-400/40 text-gray-100 hover:bg-slate-600/70 hover:text-pink-300 hover:border-pink-400/60 mt-2 py-2.5 font-medium"
        >
          닫기
        </Button>
      </DialogContent>
    </Dialog>
  );
}
