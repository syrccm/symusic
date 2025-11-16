// GitHub API를 통한 실시간 데이터 동기화
interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  token?: string; // 관리자용 토큰 (쓰기 권한)
}

interface SongData {
  id: number;
  title: string;
  category: string;
  createdDate: string;
  description: string;
  artist: string;
  lyrics: string;
  sermonUrl: string;
  musicVideoUrl: string;
  fileName: string;
  audioUrl: string;
  duration: string;
}

class GitHubSyncManager {
  private config: GitHubConfig;
  private lastSyncTime: number = 0;
  private syncInterval: number = 10000; // 10초마다 동기화 체크
  private isAdmin: boolean = false;

  constructor(config: GitHubConfig) {
    this.config = config;
  }

  // 관리자 토큰 설정
  setAdminToken(token: string) {
    this.config.token = token;
    this.isAdmin = true;
  }

  // GitHub에서 songs.json 파일 읽기
  async fetchSongsFromGitHub(): Promise<SongData[]> {
    try {
      const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/public/data/songs.json?ref=${this.config.branch}`;
      
      console.log('🔄 GitHub에서 곡 데이터 가져오는 중...', url);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SY-Music-Player'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log('📁 songs.json 파일이 없습니다. 빈 배열 반환');
          return [];
        }
        throw new Error(`GitHub API 오류: ${response.status}`);
      }

      const data = await response.json();
      const content = atob(data.content); // Base64 디코딩
      const songs = JSON.parse(content);
      
      console.log(`✅ GitHub에서 ${songs.length}개 곡 로드 완료`);
      this.lastSyncTime = Date.now();
      
      return songs;
    } catch (error) {
      console.error('❌ GitHub 데이터 로드 실패:', error);
      return [];
    }
  }

  // GitHub에 songs.json 파일 저장 (관리자만 가능)
  async saveSongsToGitHub(songs: SongData[]): Promise<boolean> {
    if (!this.isAdmin || !this.config.token) {
      console.error('❌ 관리자 권한이 필요합니다');
      return false;
    }

    try {
      const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/public/data/songs.json`;
      
      // 기존 파일 정보 가져오기 (SHA 필요)
      let sha: string | undefined;
      try {
        const existingResponse = await fetch(url, {
          headers: {
            'Authorization': `token ${this.config.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'SY-Music-Player'
          }
        });
        
        if (existingResponse.ok) {
          const existingData = await existingResponse.json();
          sha = existingData.sha;
        }
      } catch (error) {
        console.log('📝 새 파일 생성 중...');
      }

      // 파일 내용 준비
      const content = btoa(JSON.stringify(songs, null, 2)); // Base64 인코딩
      
      const payload = {
        message: `Update songs data - ${new Date().toISOString()}`,
        content: content,
        branch: this.config.branch,
        ...(sha && { sha })
      };

      console.log('💾 GitHub에 곡 데이터 저장 중...', songs.length, '개 곡');

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.config.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'SY-Music-Player'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`GitHub 저장 실패: ${response.status} - ${errorData.message}`);
      }

      console.log('✅ GitHub에 곡 데이터 저장 완료');
      this.lastSyncTime = Date.now();
      return true;
    } catch (error) {
      console.error('❌ GitHub 저장 실패:', error);
      return false;
    }
  }

  // 실시간 동기화 시작
  startRealtimeSync(onSongsUpdate: (songs: SongData[]) => void) {
    console.log('🔄 실시간 동기화 시작 (10초 간격)');
    
    const syncLoop = async () => {
      try {
        const songs = await this.fetchSongsFromGitHub();
        onSongsUpdate(songs);
      } catch (error) {
        console.error('동기화 오류:', error);
      }
      
      setTimeout(syncLoop, this.syncInterval);
    };

    // 즉시 한 번 실행 후 주기적 실행
    syncLoop();
  }

  // 로컬 스토리지와 GitHub 동기화
  async syncWithLocalStorage(): Promise<SongData[]> {
    try {
      // GitHub에서 최신 데이터 가져오기
      const githubSongs = await this.fetchSongsFromGitHub();
      
      // 로컬 스토리지 데이터 확인
      const localSongs = this.getLocalSongs();
      
      // GitHub 데이터가 있으면 우선 사용
      if (githubSongs.length > 0) {
        this.saveToLocalStorage(githubSongs);
        console.log('📥 GitHub → 로컬 스토리지 동기화 완료');
        return githubSongs;
      }
      
      // GitHub에 데이터가 없고 로컬에 있으면 GitHub에 업로드
      if (localSongs.length > 0 && this.isAdmin) {
        await this.saveSongsToGitHub(localSongs);
        console.log('📤 로컬 스토리지 → GitHub 동기화 완료');
      }
      
      return localSongs;
    } catch (error) {
      console.error('동기화 오류:', error);
      return this.getLocalSongs();
    }
  }

  // 로컬 스토리지에서 곡 데이터 읽기
  private getLocalSongs(): SongData[] {
    try {
      const saved = localStorage.getItem('symusic-songs');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('로컬 스토리지 읽기 오류:', error);
      return [];
    }
  }

  // 로컬 스토리지에 곡 데이터 저장
  private saveToLocalStorage(songs: SongData[]) {
    try {
      localStorage.setItem('symusic-songs', JSON.stringify(songs));
    } catch (error) {
      console.error('로컬 스토리지 저장 오류:', error);
    }
  }
}

// GitHub 설정
const githubConfig: GitHubConfig = {
  owner: 'syrccm',
  repo: 'symusic', 
  branch: 'main'
};

// 전역 동기화 매니저 인스턴스
export const githubSync = new GitHubSyncManager(githubConfig);

// 관리자 토큰 설정 함수 (환경변수 또는 설정에서)
export const setAdminToken = (token: string) => {
  githubSync.setAdminToken(token);
};

// 타입 내보내기
export type { SongData, GitHubConfig };