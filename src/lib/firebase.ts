// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

console.log('🔥 [Firebase] firebase.ts 파일 로드 시작');

// ✅ 실제 Firebase 프로덕션 설정
const firebaseConfig = {
  apiKey: "AIzaSyDxl5L0nraNbGDdnXDTiQIHGtiJ-Qn0G9w",
  authDomain: "symusic-7f651.firebaseapp.com",
  projectId: "symusic-7f651",
  storageBucket: "symusic-7f651.firebasestorage.app",
  messagingSenderId: "396203280257",
  appId: "1:396203280257:web:4d83b47410d79677260a80"
};

console.log('🔥 [Firebase] Config 준비 완료:', firebaseConfig.projectId);

// Initialize Firebase
let app;
let db;

try {
  app = initializeApp(firebaseConfig);
  console.log('✅ [Firebase] App 초기화 성공:', app.name);
  
  // Initialize Firestore
  db = getFirestore(app);
  console.log('✅ [Firebase] Firestore 인스턴스 생성 완료');
  
} catch (error) {
  console.error('❌ [Firebase] 초기화 실패:', error);
  
  // 오류 발생 시 null로 설정
  console.warn('⚠️ [Firebase] 로컬 모드로 전환');
  db = null;
  app = null;
}

// db가 null인 경우를 위한 안전장치
if (!db) {
  console.warn('⚠️ [Firebase] Firestore 인스턴스가 null입니다. 로컬 모드로 작동합니다.');
}

export { db };
export default app;
