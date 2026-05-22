import { useEffect, type ReactNode } from 'react';
import { Info, Smartphone, X } from 'lucide-react';
import type { InstallMethod } from '@/utils/deviceDetect';

interface InstallGuideModalProps {
  method: InstallMethod;
  onClose: () => void;
}

type Accent = 'teal' | 'purple';

interface GuideContent {
  title: string;
  accent: Accent;
  steps?: ReactNode[];
  notice?: ReactNode;
}

// 단계 안내문 안의 특수문자/이모지(⊕ ⬆ ⋮ ⋯)를 강조하는 인라인 span.
// 색상은 해당 안내의 accent(teal/보라)를 따른다.
function Sym({ accent, children }: { accent: Accent; children: ReactNode }) {
  return (
    <span className={`font-bold ${accent === 'teal' ? 'text-teal-300' : 'text-[#a78bfa]'}`}>
      {children}
    </span>
  );
}

const strong = 'font-semibold text-white';

function getGuide(method: InstallMethod): GuideContent {
  switch (method) {
    case 'ios-safari':
      return {
        title: '홈 화면에 추가하기',
        accent: 'teal',
        steps: [
          <>
            하단의 공유 버튼 <Sym accent="teal">⬆</Sym> 을 탭하세요
          </>,
          <>
            <span className={strong}>'홈 화면에 추가'</span> 를 선택하세요
          </>,
          <>
            오른쪽 위 <span className={strong}>'추가'</span> 를 탭하면 완료돼요
          </>,
        ],
      };

    case 'ios-chrome':
      return {
        title: '홈 화면에 추가하기',
        accent: 'purple',
        steps: [
          <>
            오른쪽 위 점 세 개 <Sym accent="purple">⋮</Sym> 메뉴를 탭하세요
          </>,
          <>
            <span className={strong}>'홈 화면에 추가'</span> 를 선택하세요
          </>,
          <>
            <span className={strong}>'추가'</span> 를 탭하면 완료돼요
          </>,
        ],
      };

    case 'ios-other':
      return {
        title: 'Safari로 열어주세요',
        accent: 'teal',
        notice: (
          <>
            이 브라우저에서는 홈 화면 추가가 지원되지 않아요.
            <br />
            주소를 복사한 뒤 <span className={strong}>Safari</span> 로 열어 설치해주세요.
          </>
        ),
      };

    case 'pc-chrome':
      return {
        title: '앱 설치하기',
        accent: 'teal',
        steps: [
          <>
            주소창 우측 설치 아이콘<Sym accent="teal">(⊕)</Sym>이 보이면 클릭, 없으면{' '}
            메뉴<Sym accent="teal">(⋮)</Sym> → <span className={strong}>'저장 및 공유'</span>{' '}
            → <span className={strong}>'페이지를 앱으로 설치'</span>
          </>,
          <>
            <span className={strong}>'설치'</span> 버튼을 클릭하세요
          </>,
          <>설치가 완료돼요</>,
        ],
      };

    case 'pc-edge':
      return {
        title: '앱 설치하기',
        accent: 'teal',
        steps: [
          <>
            주소창 우측 끝을 확인하세요. 설치 아이콘<Sym accent="teal">(⊕)</Sym>이 보이면 클릭,{' '}
            없으면 브라우저 메뉴<Sym accent="teal">(⋯)</Sym> → <span className={strong}>'앱'</span>{' '}
            → <span className={strong}>'이 사이트를 앱으로 설치'</span>
          </>,
          <>
            <span className={strong}>'설치'</span> 버튼을 클릭하세요
          </>,
          <>설치가 완료돼요</>,
        ],
      };

    case 'pc-safari':
      return {
        title: 'Dock에 추가하기',
        accent: 'teal',
        steps: [
          <>
            상단 도구막대의 공유 버튼 <Sym accent="teal">⬆</Sym> 을 클릭하세요
          </>,
          <>
            <span className={strong}>'Dock에 추가'</span> 를 선택하세요
          </>,
          <>
            <span className={strong}>'추가'</span> 를 클릭하면 완료돼요
          </>,
        ],
      };

    case 'pc-other':
    default:
      return {
        title: 'Chrome 또는 Edge를 권장해요',
        accent: 'teal',
        notice: (
          <>
            이 브라우저는 앱 설치를 지원하지 않아요.
            <br />
            <span className={strong}>Chrome</span> 또는 <span className={strong}>Edge</span> 로 이
            페이지를 열어 설치해주세요.
          </>
        ),
      };
  }
}

export function InstallGuideModal({ method, onClose }: InstallGuideModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const { title, accent, steps, notice } = getGuide(method);

  // 단계 번호: teal 계열(기본) / 보라 계열(iOS Chrome) — 요구사항 명세
  const stepCircleBg = accent === 'teal' ? 'bg-teal-500' : 'bg-[#7C3AED]';
  const headerIconColor = accent === 'teal' ? 'text-teal-300' : 'text-[#a78bfa]';
  const confirmBg =
    accent === 'teal'
      ? 'bg-teal-500 hover:bg-teal-600 active:bg-teal-700 focus-visible:ring-teal-300'
      : 'bg-[#7C3AED] hover:bg-[#6D28D9] active:bg-[#5B21B6] focus-visible:ring-[#a78bfa]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="앱 설치 안내"
    >
      <div
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-purple-500/30 bg-gradient-to-br from-slate-800 to-purple-900/80 p-6 text-center shadow-2xl animate-in zoom-in-95 duration-300 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-2 top-2 p-2 text-gray-400 transition-colors hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 flex items-center justify-center gap-2">
          <Smartphone className={`h-6 w-6 ${headerIconColor}`} />
          <h3 className="text-lg font-bold text-white break-keep">{title}</h3>
        </div>

        {steps && (
          <ol className="space-y-3 text-left">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${stepCircleBg}`}
                >
                  {i + 1}
                </span>
                <span className="pt-0.5 text-sm leading-relaxed text-gray-200 break-keep">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        )}

        {notice && (
          <div className="flex items-start gap-3 rounded-xl bg-slate-700/50 p-4 text-left">
            <Info className={`mt-0.5 h-5 w-5 flex-shrink-0 ${headerIconColor}`} />
            <p className="text-sm leading-relaxed text-gray-200 break-keep">{notice}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className={`mt-6 w-full rounded-xl py-3 text-base font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 ${confirmBg}`}
        >
          확인했어요
        </button>
      </div>
    </div>
  );
}
