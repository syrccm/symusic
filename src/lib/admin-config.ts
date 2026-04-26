// 관리자 GitHub 토큰 관리
// 관리자 인증은 Firebase Auth(signInWithEmailAndPassword)만 사용합니다.

interface AdminConfig {
  githubToken?: string;
  enableGitHubSync: boolean;
}

export const ADMIN_CONFIG: AdminConfig = {
  githubToken: process.env.REACT_APP_GITHUB_TOKEN || '',
  enableGitHubSync: true
};

// GitHub 토큰 설정 함수
export const setGitHubToken = (token: string) => {
  ADMIN_CONFIG.githubToken = token;
  // 로컬 스토리지에 암호화하여 저장 (선택사항)
  try {
    localStorage.setItem('symusic-github-token', btoa(token));
  } catch (error) {
    console.error('토큰 저장 실패:', error);
  }
};

// GitHub 토큰 가져오기
export const getGitHubToken = (): string => {
  // 환경변수 우선
  if (ADMIN_CONFIG.githubToken) {
    return ADMIN_CONFIG.githubToken;
  }
  
  // 로컬 스토리지에서 가져오기
  try {
    const saved = localStorage.getItem('symusic-github-token');
    return saved ? atob(saved) : '';
  } catch (error) {
    console.error('토큰 읽기 실패:', error);
    return '';
  }
};

// GitHub 토큰 유효성 검사
export const validateGitHubToken = async (token: string): Promise<boolean> => {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SY-Music-Player'
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('토큰 검증 실패:', error);
    return false;
  }
};

// 저장소 접근 권한 확인
export const checkRepoAccess = async (token: string): Promise<boolean> => {
  try {
    const response = await fetch('https://api.github.com/repos/syrccm/symusic', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SY-Music-Player'
      }
    });
    
    if (response.ok) {
      const repo = await response.json();
      return repo.permissions?.push === true; // 쓰기 권한 확인
    }
    
    return false;
  } catch (error) {
    console.error('저장소 접근 확인 실패:', error);
    return false;
  }
};

export default ADMIN_CONFIG;