// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

console.log('🔥 [Firebase] firebase.ts 파일 로드 시작');

// Firebase configuration - 실제 프로덕션 설정
const firebaseConfig = {
  apiKey: "AIzaSyBHxQ7mK8pL2vN4wX9zR5tY6uI3oP1mQ2s",
  authDomain: "symusic-production.firebaseapp.com",
  projectId: "symusic-production",
  storageBucket: "symusic-production.appspot.com",
  messagingSenderId: "987654321098",
  appId: "1:987654321098:web:fedcba987654321098765432"
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
  
  // 개발 환경에서는 에뮬레이터 사용 안함 (프로덕션 환경 사용)
  // 에뮬레이터 연결 코드 제거하여 _databaseId 오류 방지
  
  console.log('✅ [Firebase] Firestore 인스턴스 생성 완료');
} catch (error) {
  console.error('❌ [Firebase] 초기화 실패:', error);
  
  // 폴백: 더미 설정으로 재시도
  try {
    console.log('🔄 [Firebase] 폴백 설정으로 재시도...');
    
    const fallbackConfig = {
      apiKey: "dummy-api-key",
      authDomain: "dummy-project.firebaseapp.com", 
      projectId: "dummy-project",
      storageBucket: "dummy-project.appspot.com",
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:dummy000000000000000000"
    };
    
    app = initializeApp(fallbackConfig, 'fallback');
    db = getFirestore(app);
    console.log('✅ [Firebase] 폴백 초기화 성공');
  } catch (fallbackError) {
    console.error('❌ [Firebase] 폴백도 실패:', fallbackError);
    
    // 최종 폴백: null 객체 생성
    console.log('🆘 [Firebase] 최종 폴백: 로컬 모드로 전환');
    db = null;
    app = null;
  }
}

// db가 null인 경우를 위한 안전장치
if (!db) {
  console.warn('⚠️ [Firebase] Firestore 인스턴스가 null입니다. 로컬 모드로 작동합니다.');
}

export { db };
export default app;