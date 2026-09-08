// 메인 화면 배너 설정 훅 — Firestore config/banner 단일 문서를 실시간 구독한다.
// - 문서 구조: config/banner = { enabled: boolean, text: string, link: string, updatedAt?: string }
// - 문서가 없거나 enabled !== true 이거나 text/link 가 비어 있으면 null 을 반환(배너 숨김).
// - 읽기 규칙: 비로그인 읽기 개방(2026-09-08 프로브로 확인). 쓰기(관리 모달)는 STEP 2.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface BannerConfig {
  enabled: boolean;
  text: string;
  link: string;
}

const BANNER_COLLECTION = 'config';
const BANNER_DOC = 'banner';

/** 문서 원본을 안전하게 BannerConfig 로 정규화. 형식이 어긋나면 null. */
function parseBanner(raw: Record<string, unknown> | undefined): BannerConfig | null {
  if (!raw) return null;
  const enabled = raw.enabled === true;
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const link = typeof raw.link === 'string' ? raw.link.trim() : '';
  if (!enabled || !text || !link) return null;
  return { enabled, text, link };
}

/**
 * 켜져 있는 배너 설정을 돌려준다. 꺼져 있거나 없으면 null.
 * onSnapshot 이라 관리자가 끄면 열려 있는 화면에서도 즉시 사라진다.
 */
export function useBanner(): BannerConfig | null {
  const [banner, setBanner] = useState<BannerConfig | null>(null);

  useEffect(() => {
    if (!db) return;
    const unsubscribe = onSnapshot(
      doc(db, BANNER_COLLECTION, BANNER_DOC),
      (snap) => {
        setBanner(snap.exists() ? parseBanner(snap.data() as Record<string, unknown>) : null);
      },
      (err) => {
        // 권한/네트워크 오류 시 배너만 숨기고 앱 동작에는 영향 주지 않는다.
        console.error('[useBanner] onSnapshot error:', err);
        setBanner(null);
      },
    );
    return () => unsubscribe();
  }, []);

  return banner;
}
