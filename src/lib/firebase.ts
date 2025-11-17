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
```

4. 아래에 **Commit message** 입력: `Fix: Update Firebase config to real project`
5. **Commit changes** 버튼 클릭

---

### **Step 3: Vercel 배포 확인**

1. Vercel 대시보드 접속: https://vercel.com
2. **symusic 프로젝트** 선택
3. **Deployments** 탭에서 새 배포가 시작되는지 확인
4. **배포 완료 대기** (1-2분)

---

### **Step 4: 완전한 캐시 삭제**

배포 완료 후:

1. **사이트 열기**
2. **개발자 도구 열기** (F12)
3. **Application 탭** 클릭
4. 왼쪽에서 **Storage** 섹션 찾기
5. **Clear site data** 버튼 클릭
6. **페이지 완전 새로고침** (Ctrl+Shift+R)

---

### **Step 5: 확인**

Console에서 다음이 보여야 합니다:
```
🔥 [Firebase] Config 준비 완료: symusic-7f651  ← ✅
