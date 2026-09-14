// Firebase Auth 로그인 여부 훅 — 라우트로 직접 마운트되는 페이지(/daylong 등)가 관리자 여부를 알기 위한 것.
// - MusicPlayer 의 onAuthStateChanged 동기화 로직(1245-1269행)을 추출. MusicPlayer 자체는 그대로 둔다.
// - 이 앱의 "관리자" = Firebase 이메일·비밀번호로 로그인한 사용자(별도 권한 목록 없음).
//   실제 쓰기 차단은 Firestore 규칙(request.auth != null)이 담당한다.
// - loading: 첫 onAuthStateChanged 콜백 전까지 true. auth 초기화가 안 된 환경이면 즉시 false.
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export interface AdminAuthState {
  isAdmin: boolean;
  loading: boolean;
}

export function useAdminAuth(): AdminAuthState {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setIsAdmin(!!user);
        setLoading(false);
      },
      (err) => {
        console.error('[useAdminAuth] onAuthStateChanged error:', err);
        setIsAdmin(false);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  return { isAdmin, loading };
}
