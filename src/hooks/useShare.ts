import { useCallback } from 'react';
import { toast } from 'sonner';

interface ShareSongInput {
  id: string;
  title: string;
}

const SHARE_BASE_URL = 'https://www.symusic.win';

function buildShareUrl(songId: string) {
  return `${SHARE_BASE_URL}/song/${encodeURIComponent(songId)}`;
}

function buildShareText(title: string) {
  return `🎁 찬양 선물이 도착했어요!\n\n"${title}"\n함께 들어보세요 🎵`;
}

function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 권한/포커스 등 실패 시 레거시 경로로 폴백
    }
  }

  if (typeof document === 'undefined') return false;

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

export function useShare() {
  const shareSong = useCallback(async (song: ShareSongInput) => {
    const shareUrl = buildShareUrl(song.id);
    const shareText = buildShareText(song.title);
    const fullMessage = `${shareText}\n\n${shareUrl}`;

    // 모바일 + Web Share API: 네이티브 공유 시트가 메시지 본문을 잘 처리.
    // text 필드에 URL까지 포함시켜 일부 환경에서 본문 보존 가능성을 높임.
    if (isMobileUserAgent() && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: song.title,
          text: fullMessage,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // 사용자가 공유 시트를 닫음 — 정상 종료
          return;
        }
        // 그 외 실패는 클립보드 fallback으로 진행
      }
    }

    // 데스크톱 또는 모바일 share 실패 → 클립보드로 전체 메시지 복사
    const copied = await copyToClipboard(fullMessage);
    if (copied) {
      toast.success('📋 메시지가 복사되었습니다.\n카톡 등에 붙여넣어 공유하세요!');
    } else {
      toast.error('공유에 실패했습니다. 브라우저 설정을 확인해주세요.');
    }
  }, []);

  return { shareSong };
}
