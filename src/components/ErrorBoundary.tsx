import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * 앱 최상위 에러 경계. 렌더 중 예외가 나면 백스크린 대신 안내 화면을 보여준다.
 * 에러 자체는 콘솔에만 남기고, 사용자에겐 깔끔한 안내 + 새로고침 버튼만 노출.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 렌더 중 예외:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center px-6 text-center text-white"
        style={{ background: 'linear-gradient(160deg, #3A0D6E 0%, #4A1290 100%)' }}
      >
        <p className="text-lg font-bold">일시적 문제가 발생했어요</p>
        <p className="mt-2 text-sm text-purple-200/80">
          잠시 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-xl border border-teal-400/40 bg-teal-500/15 px-5 py-2.5 text-sm font-semibold text-teal-100 transition-colors hover:bg-teal-500/25"
        >
          새로고침
        </button>
      </div>
    );
  }
}
