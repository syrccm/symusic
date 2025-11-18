// FORCE REBUILD v3 - 2024.11.17.2
console.log('🔥 [Firebase] firebase.ts 파일 로드 시작 - VERSION 3');

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDx15L0nraNbGDdnXDTiQIHGtiJ-Qn0G9w",
  authDomain: "symusic-7f651.firebaseapp.com",
  projectId: "symusic-7f651",
  storageBucket: "symusic-7f651.firebasestorage.app",
  messagingSenderId: "396203280257",
  appId: "1:396203280257:web:4d83b47410d79677260a80"
};

console.log('🔥 [Firebase] Config 준비 완료 (v3):', firebaseConfig.projectId);

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    console.log('✅ [Firebase] App 초기화 성공 (v3)');
  } else {
    app = getApps()[0];
    console.log('✅ [Firebase] 기존 App 사용 (v3)');
  }

  db = getFirestore(app);
  console.log('✅ [Firebase] Firestore 인스턴스 생성 완료 (v3)');

  auth = getAuth(app);
  console.log('✅ [Firebase] Auth 인스턴스 생성 완료 (v3)');
  console.log('✅ [Firebase] Auth 설정 확인:', {
    apiKey: firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 10)}...` : '없음',
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    appName: app.name
  });
} catch (error) {
  console.error('❌ [Firebase] 초기화 실패:', error);
  throw error;
}

export { app, db, auth };
