console.log('🔥 [Firebase] firebase.ts 파일 로드 시작');

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase configuration - 실제 프로젝트 설정
const firebaseConfig = {
  apiKey: "AIzaSyDx15L9nIaNbG0dnXDTiQIHGtiJ-Qn0G9w",
  authDomain: "symusic-7f651.firebaseapp.com",
  projectId: "symusic-7f651",
  storageBucket: "symusic-7f651.firebasestorage.app",
  messagingSenderId: "396203280257",
  appId: "1:396203280257:web:4d83b47410d7967726a80"
};

console.log('🔥 [Firebase] Config 준비 완료:', firebaseConfig.projectId);

// Initialize Firebase
let app: FirebaseApp;
let db: Firestore;

try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    console.log('✅ [Firebase] App 초기화 성공');
  } else {
    app = getApps()[0];
    console.log('✅ [Firebase] 기존 App 사용');
  }

  db = getFirestore(app);
  console.log('✅ [Firebase] Firestore 인스턴스 생성 완료');
} catch (error) {
  console.error('❌ [Firebase] 초기화 실패:', error);
  throw error;
}

export { app, db };
```

---

### **Step 3: Commit**

**아래로 스크롤:**
- Commit message: `Fix: Update Firebase config to symusic-7f651`
- **Commit changes** 클릭

---

## ⏱️ **배포 대기 (2-3분)**

**Commit 후:**
1. ✅ GitHub Actions 자동 시작
2. ✅ Vercel 자동 배포
3. ✅ 2-3분 후 완료

---

## 🧪 **배포 완료 후 테스트**

**완전히 새로운 시크릿 창에서:**
1. https://www.symusic.win 접속
2. F12 → Console
3. **확인:**
```
   🔥 [Firebase] Config 준비 완료: symusic-7f651  ✅
