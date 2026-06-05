import { useEffect, lazy, Suspense } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NotFound from './pages/NotFound';
import { trackVisit } from './utils/analyticsTracker';

// 라우트 페이지는 lazy 로딩으로 분할 — 초기 번들에서 카테키즘 데이터·서브페이지가 빠진다.
const Index = lazy(() => import('./pages/Index'));
const ConfessionPage = lazy(() => import('./pages/ConfessionPage'));
const MinistersPage = lazy(() => import('./pages/MinistersPage'));
const BibleOnPage = lazy(() => import('./pages/BibleOnPage'));
const SimpleSongPlayer = lazy(() => import('./components/SimpleSongPlayer'));

const queryClient = new QueryClient();

// lazy 청크 로드 중 표시할 폴백 (앱 톤 유지)
const RouteFallback = () => (
  <div
    className="flex min-h-screen items-center justify-center text-purple-200/70"
    style={{ background: 'linear-gradient(160deg, #3A0D6E 0%, #4A1290 100%)' }}
  >
    불러오는 중…
  </div>
);

const App = () => {
  useEffect(() => {
    trackVisit().catch((err) => console.error('[Analytics] trackVisit failed:', err));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/song/:songId" element={<SimpleSongPlayer />} />
              <Route path="/confession" element={<ConfessionPage />} />
              <Route path="/ministers" element={<MinistersPage />} />
              <Route path="/bibleon" element={<BibleOnPage />} />
              <Route path="/0691" element={<Index isAdminRoute />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
