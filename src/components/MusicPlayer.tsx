import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '@/lib/firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  updateDoc
} from 'firebase/firestore';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useFavorites } from '@/hooks/useFavorites';
import { useShare } from '@/hooks/useShare';
import { useSongs, type Song } from '@/hooks/useSongs';
import { useNotices } from '@/hooks/useNotices';
import { AboutModal } from '@/components/AboutModal';
import { AnalyticsDialog } from '@/components/AnalyticsDialog';
import { NoticePanel } from '@/components/NoticePanel';
import { trackSongPlay, trackShare } from '@/utils/analyticsTracker';
import { generateAndSaveTags } from '@/lib/autoTags';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Music,
  Trash2,
  Edit,
  Loader2,
  Youtube,
  WifiOff,
  List,
  Save,
  X,
  Scroll,
  Repeat,
  Shuffle,
  Star,
  ArrowLeft,
  Share2,
  SunMedium,
  Menu,
  Search,
  Bell
} from 'lucide-react';

// Types
interface Category {
  id: string;
  name: string;
  created_at: string;
}

// Repeat modes
type RepeatMode = 'all' | 'one' | 'off';

// Default categories only (no default songs)
const DEFAULT_CATEGORIES = [
  { name: '금철' },
  { name: '주일' },
  { name: 'QT' },
  { name: '기타' }
];

// 곡 목록 검색 탭 정의
const SEARCH_TABS = [
  { key: 'category', label: '예배' },
  { key: 'tags', label: '태그' },
  { key: 'mood', label: '상황' },
  { key: 'lyrics', label: '가사' },
] as const;

type SearchTabKey = (typeof SEARCH_TABS)[number]['key'];

// 하단 탭바 정의
type MainTabKey = 'songs' | 'search' | 'favorites' | 'notices';

// 감정/상황 → 관련 태그 키워드 매핑 (태그에 부분 포함되면 매칭)
const MOOD_PRESETS: { label: string; keywords: string[] }[] = [
  { label: '위로가 필요해요', keywords: ['위로', '치유', '소망', '평안', '회복', '쉼'] },
  { label: '감사한 마음이에요', keywords: ['감사', '은혜', '찬양', '축복', '기쁨'] },
  { label: '예배드리고 싶어요', keywords: ['예배', '경배', '찬양', '영광', '거룩'] },
  { label: '새힘이 필요해요', keywords: ['소망', '용기', '힘', '승리', '믿음', '새힘'] },
  { label: '기도하고 싶어요', keywords: ['기도', '간구', '중보', '간절', '부르짖음'] },
  { label: '회개하고 싶어요', keywords: ['회개', '용서', '죄', '십자가', '정결', '돌이킴'] },
];


// R2 Storage Configuration
const R2_CONFIG = {
  accountId: 'f61bf2487b0c96cbd444478cb70eb9f0',
  s3ApiUrl: 'https://f61bf2487b0c96cbd444478cb70eb9f0.r2.cloudflarestorage.com',
  publicUrl: 'https://pub-0e706e4324b149e9a79e2be1ad1de135.r2.dev'
};

interface MusicPlayerProps {
  isAdminRoute?: boolean;
}

export default function MusicPlayer({ isAdminRoute = false }: MusicPlayerProps) {
  // Songs (Firestore + LS 캐시) — 훅으로 추출
  const { songs, loading, isOfflineMode, setSongsLocal } = useSongs();

  // State
  const [_categories, setCategories] = useState<Category[]>([]);
  const [currentCategory, setCurrentCategory] = useState('전체');
  const [searchTab, setSearchTab] = useState<SearchTabKey>('category');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [lyricsQuery, setLyricsQuery] = useState('');
  const [currentSongIndex, setCurrentSongIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAddingSong, setIsAddingSong] = useState(false);
  const [isBatchTagging, setIsBatchTagging] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Playback modes
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);

  // Favorites
  const { favorites, isFavorite, toggleFavorite, isFavoritesMode, setIsFavoritesMode } = useFavorites();

  // Share
  const { shareSong } = useShare();
  const [isSharePressed, setIsSharePressed] = useState(false);

  // About modal
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // 하단 탭바
  const [activeTab, setActiveTab] = useState<MainTabKey>('songs');

  // Notice (공지 탭)
  const {
    notices,
    loading: noticesLoading,
    unreadCount: noticeUnreadCount,
    lastReadAt: noticeLastReadAt,
    markAllRead: markAllNoticesRead,
  } = useNotices();

  // Analytics dialog (관리자 모드 전용)
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);

  // 햄버거 메뉴 + 카포·조옮김 / 기타조율기 모달
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isGitaOpen, setIsGitaOpen] = useState(false);
  const [isTunerOpen, setIsTunerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // 카포·조옮김 / 기타조율기 iframe에서 보내는 close 메시지 수신
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data === 'close-gita') {
        setIsGitaOpen(false);
      } else if (e.data === 'close-tuner') {
        setIsTunerOpen(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [rememberAdmin, setRememberAdmin] = useState(false);
  const [isAdminAuthenticating, setIsAdminAuthenticating] = useState(false);

  // Admin management dialog
  const [showAdminManagementDialog, setShowAdminManagementDialog] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState('add');

  // Song form state
  const [newSong, setNewSong] = useState({
    title: '',
    category: '',
    description: '',
    youtubeUrl: '',
    lyrics: ''
  });

  // Edit song state
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [editSongData, setEditSongData] = useState({
    title: '',
    category: '',
    description: '',
    youtubeUrl: '',
    lyrics: ''
  });

  // Audio ref
  const audioRef = useRef<HTMLAudioElement>(null);

  // 현재 재생 곡 행 ref - 곡 변경 시 자동 스크롤 추적용
  const currentSongRowRef = useRef<HTMLDivElement>(null);

  // Helper function to format time
  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Helper function to generate R2 URL from song title
  const generateR2UrlFromTitle = (title: string) => {
    const filename = title.endsWith('.mp3') ? title : `${title}.mp3`;
    const encodedFilename = encodeURIComponent(filename);
    return `${R2_CONFIG.publicUrl}/${encodedFilename}`;
  };

  // Auto-generate R2 URL when title changes
  const handleTitleChange = (title: string) => {
    setNewSong(prev => ({
      ...prev,
      title: title
    }));
  };

  // Shuffle array helper
  const shuffleArray = (array: number[]) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Generate shuffled indices when shuffle is enabled
  const generateShuffledIndices = () => {
    const filteredSongs = getFilteredSongs();
    const indices = Array.from({ length: filteredSongs.length }, (_, i) => i);
    return shuffleArray(indices);
  };

  // Toggle repeat mode
  const toggleRepeatMode = () => {
    const modes: RepeatMode[] = ['all', 'one', 'off'];
    const currentIndex = modes.indexOf(repeatMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setRepeatMode(nextMode);

    const modeNames = {
      'all': '전체 반복',
      'one': '한 곡 반복',
      'off': '반복 끄기'
    };

    toast.success(`${modeNames[nextMode]} 모드로 변경되었습니다`);
  };

  // Toggle shuffle mode
  const toggleShuffle = () => {
    const newShuffleState = !isShuffleEnabled;
    setIsShuffleEnabled(newShuffleState);

    if (newShuffleState) {
      setShuffledIndices(generateShuffledIndices());
      toast.success('셔플 재생이 활성화되었습니다');
    } else {
      setShuffledIndices([]);
      toast.success('셔플 재생이 비활성화되었습니다');
    }
  };

  // Initialize categories (songs는 useSongs 훅이 처리)
  const initializeCategories = async (): Promise<(() => void) | undefined> => {
    try {
      if (!db) {
        const savedCategories = localStorage.getItem('symusic-categories');
        if (savedCategories) {
          setCategories(JSON.parse(savedCategories));
        } else {
          const defaultCats = DEFAULT_CATEGORIES.map((cat, index) => ({
            id: `local-${index}`,
            name: cat.name,
            created_at: new Date().toISOString()
          }));
          setCategories(defaultCats);
          localStorage.setItem('symusic-categories', JSON.stringify(defaultCats));
        }
        return undefined;
      }

      const categoriesQuery = query(
        collection(db, 'categories'),
        orderBy('created_at', 'desc')
      );

      const unsubscribe = onSnapshot(
        categoriesQuery,
        async (snapshot) => {
          const categoriesData = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data()
          } as Category));

          if (categoriesData.length === 0) {
            for (const category of DEFAULT_CATEGORIES) {
              try {
                await addDoc(collection(db, 'categories'), {
                  name: category.name,
                  created_at: new Date().toISOString()
                });
              } catch (error) {
                console.error('❌ [Categories] 카테고리 추가 실패:', error);
              }
            }
          } else {
            setCategories(categoriesData);
          }
        },
        (error) => {
          console.error('❌ [Categories] 스냅샷 오류:', error);
          toast.error('카테고리 로드 중 오류가 발생했습니다: ' + error.message);
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('❌ [Categories] 초기화 오류:', error);
      const defaultCats = DEFAULT_CATEGORIES.map((cat, index) => ({
        id: `local-${index}`,
        name: cat.name,
        created_at: new Date().toISOString()
      }));
      setCategories(defaultCats);
      return undefined;
    }
  };

  // 곡 저장 직후 호출: 가사로 태그를 자동 생성하고 Firestore에 저장.
  // 로딩/완료/실패 토스트를 표시하며, 실패해도 곡 저장은 그대로 유지된다.
  const runAutoTagging = async (
    songId: string,
    lyrics?: string,
    title?: string
  ): Promise<void> => {
    console.log('🏷️ [AutoTag] 시작:', {
      songId,
      hasLyrics: !!(lyrics && lyrics.trim()),
      title,
    });

    if (!lyrics || !lyrics.trim()) {
      console.log('🏷️ [AutoTag] 가사 없음 — 건너뜀:', songId);
      return;
    }
    if (isOfflineMode || !db || songId.startsWith('local-')) {
      console.log('🏷️ [AutoTag] 오프라인/로컬 모드 — 건너뜀:', {
        songId,
        isOfflineMode,
        hasDb: !!db,
      });
      return;
    }

    const toastId = toast.loading('🏷️ 태그 자동 생성 중...');
    try {
      const tags = await generateAndSaveTags(songId, lyrics, title);
      console.log('🏷️ [AutoTag] 생성 성공:', { songId, tags });
      toast.success(`✅ 태그 생성 완료 (${tags.length}개)`, { id: toastId });
    } catch (error) {
      console.error('❌ [AutoTag] 태그 생성 실패:', { songId, error });
      toast.error('⚠️ 태그 생성 실패 (나중에 수동 설정 가능)', { id: toastId });
    } finally {
      console.log('🏷️ [AutoTag] 종료:', songId);
    }
  };

  // 기존 곡 일괄 태그 생성: tags 필드가 없고 가사가 있는 곡만 순차 처리.
  // API 과부하 방지를 위해 곡 사이 500ms 대기.
  const handleBatchGenerateTags = async () => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }
    if (isOfflineMode || !db) {
      toast.error('Firebase 연결이 필요합니다.');
      return;
    }
    if (isBatchTagging) return;

    const targets = songs.filter(
      (s) =>
        !s.id.startsWith('local-') &&
        // tags 필드가 없거나(미생성) 빈 배열(이전 생성 실패)인 곡 모두 재처리
        (s.tags === undefined || s.tags.length === 0) &&
        !!s.lyrics &&
        s.lyrics.trim().length > 0
    );

    if (targets.length === 0) {
      toast.info('태그를 생성할 곡이 없습니다. (이미 모두 처리됨)');
      return;
    }

    setIsBatchTagging(true);
    const toastId = toast.loading(`태그 일괄 생성 준비 중... (대상 ${targets.length}곡)`);
    let success = 0;
    let fail = 0;

    try {
      for (let i = 0; i < targets.length; i++) {
        const song = targets[i];
        toast.loading(
          `${i + 1}/${targets.length} 곡 처리 중... (${song.title})`,
          { id: toastId }
        );
        try {
          await generateAndSaveTags(song.id, song.lyrics as string, song.title);
          success++;
        } catch (error) {
          console.error('❌ [BatchTag] 실패:', song.title, error);
          fail++;
        }
        if (i < targets.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      toast.success(
        `✅ 태그 일괄 생성 완료 — 성공 ${success}곡, 실패 ${fail}곡`,
        { id: toastId }
      );
    } finally {
      setIsBatchTagging(false);
    }
  };

  // Add song handler
  const handleAddSong = async () => {
    if (!newSong.title || !newSong.category) {
      toast.error('곡 제목과 카테고리는 필수입니다.');
      return;
    }

    if (isAddingSong) {
      toast.error('이미 곡을 추가하는 중입니다. 잠시 기다려주세요.');
      return;
    }

    setIsAddingSong(true);
    console.log('🎵 [AddSong] 곡 추가 시작:', newSong.title);

    try {
      const finalAudioUrl = generateR2UrlFromTitle(newSong.title);

      const songData: any = {
        title: newSong.title.trim(),
        category: newSong.category,
        audioUrl: finalAudioUrl,
        created_at: new Date().toISOString()
      };

      if (newSong.description && newSong.description.trim()) {
        songData.description = newSong.description.trim();
      }

      if (newSong.youtubeUrl && newSong.youtubeUrl.trim()) {
        songData.youtubeUrl = newSong.youtubeUrl.trim();
      }

      if (newSong.lyrics && newSong.lyrics.trim()) {
        songData.lyrics = newSong.lyrics.trim();
      }

      console.log('🎵 [AddSong] songData 준비 완료:', songData);

      if (isOfflineMode || !db) {
        console.log('🔌 [AddSong] 오프라인 모드로 저장');
        const newSongWithId = {
          ...songData,
          id: `local-${Date.now()}`
        } as Song;

        setSongsLocal((prev) => [newSongWithId, ...prev]);

        toast.success(`새 곡이 추가되었습니다: ${newSong.title} (오프라인)`);
      } else {
        if (!db) {
          throw new Error('Firebase 연결이 끊어졌습니다.');
        }

        console.log('📡 [AddSong] Firebase에 저장 시작...');
        const docRef = await addDoc(collection(db, 'songs'), songData);
        console.log('✅ [AddSong] Firebase 저장 성공! 문서 ID:', docRef.id);

        toast.success(`새 곡이 추가되었습니다: ${newSong.title}`);

        // 곡 저장 직후 태그 자동 생성 (가사가 있을 때만)
        await runAutoTagging(docRef.id, songData.lyrics, songData.title);
      }

      setNewSong({
        title: '',
        category: '',
        description: '',
        youtubeUrl: '',
        lyrics: ''
      });
      console.log('✅ [AddSong] 폼 초기화 완료');

    } catch (error: any) {
      console.error('❌ [AddSong] 저장 오류:', error);

      let errorMessage = '곡 추가 중 오류가 발생했습니다.';

      if (error?.code === 'permission-denied') {
        errorMessage = 'Firebase 권한이 없습니다. 관리자에게 문의하세요.';
      } else if (error?.code === 'unavailable') {
        errorMessage = 'Firebase 서버에 연결할 수 없습니다. 네트워크를 확인하세요.';
      } else if (error?.message) {
        errorMessage += ' ' + error.message;
      }

      toast.error(errorMessage);

    } finally {
      setIsAddingSong(false);
      console.log('🎵 [AddSong] 프로세스 종료');
    }
  };

  // Update song handler
  const handleUpdateSong = async () => {
    if (!editingSong || !editSongData.title || !editSongData.category) {
      toast.error('곡 제목과 카테고리는 필수입니다.');
      return;
    }

    try {
      const finalAudioUrl = generateR2UrlFromTitle(editSongData.title);

      const updatedData: any = {
        title: editSongData.title.trim(),
        category: editSongData.category,
        audioUrl: finalAudioUrl,
        updated_at: new Date().toISOString()
      };

      if (editSongData.description && editSongData.description.trim()) {
        updatedData.description = editSongData.description.trim();
      }

      if (editSongData.youtubeUrl && editSongData.youtubeUrl.trim()) {
        updatedData.youtubeUrl = editSongData.youtubeUrl.trim();
      }

      if (editSongData.lyrics && editSongData.lyrics.trim()) {
        updatedData.lyrics = editSongData.lyrics.trim();
      }

      if (isOfflineMode || !db) {
        setSongsLocal((prev) =>
          prev.map((s) => (s.id === editingSong.id ? { ...s, ...updatedData } : s))
        );

        toast.success(`곡이 수정되었습니다: ${editSongData.title} (오프라인)`);
      } else {
        await updateDoc(doc(db, 'songs', editingSong.id), updatedData);
        toast.success(`곡이 수정되었습니다: ${editSongData.title}`);

        // 수정 시 가사가 있으면 태그 재생성
        console.log('🏷️ [UpdateSong] runAutoTagging 호출 직전:', {
          songId: editingSong.id,
          hasLyrics: !!updatedData.lyrics,
          title: updatedData.title,
        });
        await runAutoTagging(editingSong.id, updatedData.lyrics, updatedData.title);
        console.log('🏷️ [UpdateSong] runAutoTagging 호출 완료:', editingSong.id);
      }

      setEditingSong(null);
      setEditSongData({ title: '', category: '', description: '', youtubeUrl: '', lyrics: '' });

    } catch (error: any) {
      console.error('❌ [UpdateSong] 수정 오류:', error);
      toast.error('곡 수정 중 오류가 발생했습니다: ' + error.message);
    }
  };

  // Delete song handler
  const handleDeleteSong = async (songId: string) => {
    if (!isAdmin) {
      toast.error('관리자 권한이 필요합니다.');
      return;
    }

    const songToDelete = songs.find(song => song.id === songId);

    try {
      if (songToDelete && songs.indexOf(songToDelete) === currentSongIndex) {
        if (audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
        setCurrentSongIndex(-1);
      }

      if (isOfflineMode || !db) {
        setSongsLocal((prev) => prev.filter((s) => s.id !== songId));

        toast.success(`"${songToDelete?.title}" 곡이 삭제되었습니다. (오프라인)`);
      } else {
        await deleteDoc(doc(db, 'songs', songId));
        toast.success(`"${songToDelete?.title}" 곡이 삭제되었습니다.`);
      }

    } catch (error: any) {
      console.error('❌ [DeleteSong] 삭제 오류:', error);
      toast.error('곡 삭제 중 오류가 발생했습니다: ' + error.message);
    }
  };

  // Admin login handler
  const handleAdminLogin = async () => {
    if (isAdminAuthenticating) return;

    if (!adminEmail || !adminPassword) {
      toast.error('이메일과 비밀번호를 모두 입력하세요.');
      return;
    }

    setIsAdminAuthenticating(true);

    console.log('🔐 [Admin] 로그인 시도 시작');
    console.log('🔐 [Admin] 입력된 이메일:', adminEmail);
    console.log('🔐 [Admin] Auth 객체 존재 여부:', !!auth);
    console.log('🔐 [Admin] Auth 객체 상세:', auth ? {
      app: auth.app?.name,
      currentUser: auth.currentUser?.email || 'null',
      config: {
        apiKey: auth.app?.options?.apiKey ? '설정됨' : '없음',
        authDomain: auth.app?.options?.authDomain || '없음',
        projectId: auth.app?.options?.projectId || '없음'
      }
    } : 'Auth 객체가 null입니다');

    try {
      if (!auth) {
        throw new Error('Firebase Auth가 초기화되지 않았습니다. Firebase 설정을 확인하세요.');
      }

      console.log('🔐 [Admin] signInWithEmailAndPassword 호출 시작...');
      const userCredential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      console.log('✅ [Admin] Firebase 인증 성공!');
      console.log('✅ [Admin] 사용자 정보:', {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        emailVerified: userCredential.user.emailVerified
      });

      console.log('🔐 [Admin] 관리자 상태 설정 중...');
      setIsAdmin(true);
      setShowAdminDialog(false);
      setAdminPassword('');

      if (rememberAdmin) {
        localStorage.setItem('symusic-admin-email', adminEmail);
        console.log('🔐 [Admin] 이메일을 로컬 스토리지에 저장함');
      }

      toast.success('관리자로 로그인되었습니다.');

      requestAnimationFrame(() => {
        console.log('🔐 [Admin] 관리 창 열기 실행');
        setShowAdminManagementDialog(true);
      });

    } catch (error: any) {
      console.error('❌ [Admin] Firebase 인증 실패 - 상세 오류 정보:');
      console.error('❌ [Admin] 오류 타입:', error?.constructor?.name || typeof error);
      console.error('❌ [Admin] 오류 코드:', error?.code || '코드 없음');
      console.error('❌ [Admin] 오류 메시지:', error?.message || '메시지 없음');
      console.error('❌ [Admin] 전체 오류 객체:', error);

      if (error?.code) {
        console.error('❌ [Admin] Firebase 오류 코드 분석:');
        switch (error.code) {
          case 'auth/api-key-not-valid':
            console.error('❌ [Admin] API 키가 유효하지 않습니다.');
            console.error('❌ [Admin] Firebase Console에서 API 키를 확인하세요.');
            console.error('❌ [Admin] 현재 사용 중인 API 키:', auth?.app?.options?.apiKey ? '설정됨' : '없음');
            break;
          case 'auth/invalid-email':
            console.error('❌ [Admin] 이메일 형식이 올바르지 않습니다.');
            break;
          case 'auth/user-disabled':
            console.error('❌ [Admin] 해당 사용자 계정이 비활성화되었습니다.');
            break;
          case 'auth/user-not-found':
            console.error('❌ [Admin] 해당 이메일로 등록된 사용자가 없습니다.');
            break;
          case 'auth/wrong-password':
            console.error('❌ [Admin] 비밀번호가 올바르지 않습니다.');
            break;
          case 'auth/network-request-failed':
            console.error('❌ [Admin] 네트워크 요청 실패. 인터넷 연결을 확인하세요.');
            break;
          default:
            console.error('❌ [Admin] 알 수 없는 Firebase 인증 오류:', error.code);
        }
      }

      const message = error?.message || 'Firebase 관리자 인증에 실패했습니다.';
      toast.error(message);
    } finally {
      setIsAdminAuthenticating(false);
      console.log('🔐 [Admin] 로그인 프로세스 종료');
    }
  };

  // Admin management access handler
  const handleAdminManagementAccess = () => {
    console.log('🔐 [Admin] 관리 접근 시도, isAdmin:', isAdmin);

    if (!isAdmin) {
      console.log('🔐 [Admin] 비밀번호 입력 창 표시');
      setShowAdminDialog(true);
    } else {
      console.log('🔐 [Admin] 바로 관리 창 열기');
      setShowAdminManagementDialog(true);
    }
  };

  // Admin logout handler
  const handleAdminLogout = async () => {
    try {
      await signOut(auth);
      setShowAdminManagementDialog(false);
      setShowAdminDialog(false);
      setAdminPassword('');
      // onAuthStateChanged 콜백이 setIsAdmin(false) 처리
      toast.success('로그아웃되었습니다.');
    } catch (error: any) {
      console.error('❌ [Admin] 로그아웃 오류:', error);
      toast.error('로그아웃 중 오류가 발생했습니다.');
    }
  };

  // Start editing song
  const startEditingSong = (song: Song) => {
    setEditingSong(song);
    setEditSongData({
      title: song.title,
      category: song.category,
      description: song.description || '',
      youtubeUrl: song.youtubeUrl || '',
      lyrics: song.lyrics || ''
    });
    setActiveAdminTab('manage');
  };

  // Get filtered songs
  const getFilteredSongs = () => {
    if (isFavoritesMode) {
      return songs.filter(song => favorites.includes(song.id));
    }

    if (searchTab === 'tags') {
      if (selectedTags.length === 0) return songs;
      // 선택한 태그 중 하나라도 포함하면 노출 (OR)
      return songs.filter(
        (s) => Array.isArray(s.tags) && s.tags.some((t) => selectedTags.includes(t))
      );
    }

    if (searchTab === 'mood') {
      if (!selectedMood) return songs;
      const preset = MOOD_PRESETS.find((m) => m.label === selectedMood);
      if (!preset) return songs;
      return songs.filter(
        (s) =>
          Array.isArray(s.tags) &&
          s.tags.some((t) =>
            preset.keywords.some((k) => t.includes(k) || k.includes(t))
          )
      );
    }

    if (searchTab === 'lyrics') {
      const q = lyricsQuery.trim().toLowerCase();
      if (!q) return songs;
      return songs.filter((s) => (s.lyrics || '').toLowerCase().includes(q));
    }

    // 예배별 (기본)
    return currentCategory === '전체'
      ? songs
      : songs.filter(song => song.category === currentCategory);
  };

  // Get next song index based on playback mode
  const getNextSongIndex = (currentIndex: number) => {
    const filteredSongs = getFilteredSongs();

    if (isShuffleEnabled && shuffledIndices.length > 0) {
      const currentShuffleIndex = shuffledIndices.indexOf(currentIndex);
      if (currentShuffleIndex < shuffledIndices.length - 1) {
        return shuffledIndices[currentShuffleIndex + 1];
      } else {
        if (repeatMode === 'all') {
          return shuffledIndices[0];
        }
        return -1;
      }
    } else {
      if (currentIndex < filteredSongs.length - 1) {
        return currentIndex + 1;
      } else {
        if (repeatMode === 'all') {
          return 0;
        }
        return -1;
      }
    }
  };

  // Play song
  const playSong = (index: number) => {
    const filteredSongs = getFilteredSongs();
    if (index < 0 || index >= filteredSongs.length) return;

    const song = filteredSongs[index];
    setCurrentSongIndex(songs.indexOf(song));

    if (song.audioUrl && audioRef.current) {
      audioRef.current.src = song.audioUrl;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        toast.success(`재생 중: ${song.title}`);
        trackSongPlay(song.id).catch((err) =>
          console.error('[Analytics] trackSongPlay failed:', err),
        );
      }).catch(error => {
        console.error('Playback failed:', error);
        toast.error(`오디오 재생에 실패했습니다: ${song.title}`);
      });
    } else {
      toast.error('오디오 파일이 없습니다.');
    }
  };

  const handleShareClick = (song: { id: string; title: string }) => {
    trackShare(song.id).catch((err) =>
      console.error('[Analytics] trackShare failed:', err),
    );
    shareSong(song);
  };

  // Enter favorites mode and play the first favorite
  const playFavorites = () => {
    if (favorites.length === 0) {
      toast('즐겨찾기한 곡이 없어요. 곡 옆 ⭐ 버튼으로 추가해보세요!');
      return;
    }

    const favoriteSongs = songs.filter(song => favorites.includes(song.id));
    if (favoriteSongs.length === 0) {
      toast('즐겨찾기한 곡을 찾을 수 없어요.');
      return;
    }

    setIsFavoritesMode(true);
    toast(`즐겨찾기 ${favoriteSongs.length}곡 재생을 시작합니다 ✨`);

    const firstSong = favoriteSongs[0];
    setCurrentSongIndex(songs.indexOf(firstSong));

    if (firstSong.audioUrl && audioRef.current) {
      audioRef.current.src = firstSong.audioUrl;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        trackSongPlay(firstSong.id).catch((err) =>
          console.error('[Analytics] trackSongPlay failed:', err),
        );
      }).catch(error => {
        console.error('Playback failed:', error);
        toast.error(`오디오 재생에 실패했습니다: ${firstSong.title}`);
      });
    } else {
      toast.error('오디오 파일이 없습니다.');
    }
  };

  // Exit favorites mode and return to normal browsing
  const exitFavoritesMode = () => {
    setIsFavoritesMode(false);
  };

  // 검색 탭: 결과 선택 → 재생 후 찬양 탭으로 이동
  const handlePickFromSearch = (index: number) => {
    playSong(index);
    setActiveTab('songs');
  };

  // 즐겨찾기 탭: 개별 곡 선택 → 즐겨찾기 모드로 재생 후 찬양 탭으로 이동
  const playFavoriteSong = (song: Song) => {
    setIsFavoritesMode(true);
    setCurrentSongIndex(songs.indexOf(song));

    if (song.audioUrl && audioRef.current) {
      audioRef.current.src = song.audioUrl;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        trackSongPlay(song.id).catch((err) =>
          console.error('[Analytics] trackSongPlay failed:', err),
        );
      }).catch(error => {
        console.error('Playback failed:', error);
        toast.error(`오디오 재생에 실패했습니다: ${song.title}`);
      });
    } else {
      toast.error('오디오 파일이 없습니다.');
    }

    setActiveTab('songs');
  };

  // 즐겨찾기 탭: 전체 즐겨찾기 재생 시작 → 찬양 탭으로 이동
  const handlePlayAllFavorites = () => {
    if (favorites.length === 0) {
      toast('즐겨찾기한 곡이 없어요. 곡 옆 ⭐ 버튼으로 추가해보세요!');
      return;
    }
    playFavorites();
    setActiveTab('songs');
  };

  // Toggle play/pause
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(error => {
        console.error('Playback failed:', error);
        toast.error('오디오 재생에 실패했습니다.');
      });
    }
  };

  // Skip to next/previous song
  const skipToNext = () => {
    const filteredSongs = getFilteredSongs();
    const currentIndex = filteredSongs.findIndex(song => songs.indexOf(song) === currentSongIndex);
    const nextIndex = getNextSongIndex(currentIndex);

    if (nextIndex >= 0) {
      playSong(nextIndex);
    }
  };

  const skipToPrevious = () => {
    const filteredSongs = getFilteredSongs();
    const currentIndex = filteredSongs.findIndex(song => songs.indexOf(song) === currentSongIndex);

    if (isShuffleEnabled && shuffledIndices.length > 0) {
      const currentShuffleIndex = shuffledIndices.indexOf(currentIndex);
      if (currentShuffleIndex > 0) {
        playSong(shuffledIndices[currentShuffleIndex - 1]);
      }
    } else {
      if (currentIndex > 0) {
        playSong(currentIndex - 1);
      }
    }
  };

  // Seek to position
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Initialize on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('symusic-admin-email');
    if (savedEmail) {
      setAdminEmail(savedEmail);
      setRememberAdmin(true);
    }

    let cleanup: (() => void) | undefined;

    const init = async () => {
      cleanup = await initializeCategories();
    };

    init();

    return () => {
      if (cleanup && typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, []);

  // /0691 라우트일 때만 Firebase Auth 세션을 관리자 모드로 동기화.
  // 일반 라우트에서는 관리자 상태가 절대 켜지지 않도록 보장.
  useEffect(() => {
    if (!isAdminRoute) {
      setIsAdmin(false);
      setShowAdminDialog(false);
      setShowAdminManagementDialog(false);
      return;
    }
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log('🔐 [Admin] Firebase 세션 활성화:', user.email);
        setIsAdmin(true);
        setShowAdminDialog(false);
      } else {
        console.log('🔐 [Admin] Firebase 세션 해제');
        setIsAdmin(false);
        setShowAdminDialog(true); // /0691 진입 시 로그인 모달 자동 오픈
      }
    });

    return () => unsubscribe();
  }, [isAdminRoute]);

  // Update shuffled indices when songs, category, or favorites mode changes
  useEffect(() => {
    if (isShuffleEnabled) {
      setShuffledIndices(generateShuffledIndices());
    }
  }, [songs, currentCategory, isShuffleEnabled, isFavoritesMode, favorites, searchTab, selectedTags, selectedMood, lyricsQuery]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);

      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().then(() => {
          setIsPlaying(true);
        });
      } else {
        const filteredSongs = getFilteredSongs();
        const currentIndex = filteredSongs.findIndex(song => songs.indexOf(song) === currentSongIndex);
        const nextIndex = getNextSongIndex(currentIndex);

        if (nextIndex >= 0) {
          playSong(nextIndex);
        }
      }
    };

    const handleError = () => {
      setIsPlaying(false);
      toast.error('오디오 로드 중 오류가 발생했습니다.');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [currentSongIndex, songs, repeatMode, isShuffleEnabled, shuffledIndices]);

  // Debug: 관리자 상태 변경 감지
  useEffect(() => {
    console.log('🔐 [Admin] 상태 변경됨:', {
      isAdmin,
      showAdminDialog,
      showAdminManagementDialog
    });
  }, [isAdmin, showAdminDialog, showAdminManagementDialog]);

  // 현재 재생 곡이 바뀔 때 곡 목록에서 해당 행이 보이도록 자동 스크롤
  // block: 'nearest' → 이미 화면 안에 보이면 스크롤하지 않음 (사용자 의도 존중)
  useEffect(() => {
    if (currentSongIndex < 0) return;
    currentSongRowRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [currentSongIndex]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-purple-400 mx-auto" />
          <p className="text-white text-lg">음악 플레이어 로딩 중...</p>
          <p className="text-purple-300 text-sm">기본 곡 설치 및 Firebase 연결 중...</p>
        </div>
      </div>
    );
  }

  const filteredSongs = getFilteredSongs();
  const currentSong = currentSongIndex >= 0 ? songs[currentSongIndex] : null;
  const favoriteSongs = songs.filter((song) => favorites.includes(song.id));
  // songs 전체에서 사용된 태그 수집 (태그 탭 버튼 목록)
  const allTags = Array.from(
    new Set(songs.flatMap((s) => (Array.isArray(s.tags) ? s.tags : [])))
  ).sort((a, b) => a.localeCompare(b, 'ko'));

  // 곡 설명("제목|본문|설교자|구분|날짜") 파싱
  const parseSermon = (description?: string) =>
    description
      ?.split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0) ?? [];

  // 곡 목록 한 줄 렌더러 (찬양/검색/즐겨찾기 공통)
  const renderSongList = (
    list: Song[],
    onPick: (index: number) => void,
    emptyText: string,
  ) => {
    if (list.length === 0) {
      return (
        <div className="text-center py-12">
          <Music className="h-8 w-8 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">{emptyText}</p>
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        {list.map((song, index) => {
          const isCurrentSong = songs.indexOf(song) === currentSongIndex;
          return (
            <div
              key={song.id}
              ref={isCurrentSong ? currentSongRowRef : null}
              onClick={() => onPick(index)}
              className={`px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                isCurrentSong
                  ? 'bg-gradient-to-r from-purple-500/25 to-pink-500/25 border border-purple-500/40'
                  : 'bg-slate-800/40 border border-slate-700/60 hover:bg-slate-700/50 active:bg-slate-700/70'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-mono w-5 flex-shrink-0 text-xs text-center">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-white truncate text-sm">{song.title}</span>
                    {index < 2 && (
                      <SunMedium className="w-4 h-4 text-pink-400 flex-shrink-0 animate-pulse" />
                    )}
                    {isCurrentSong && isPlaying && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <span className="w-0.5 h-2 bg-purple-400 rounded-full animate-pulse" />
                        <span className="w-0.5 h-3 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                        <span className="w-0.5 h-1.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                      </div>
                    )}
                  </div>
                  {(() => {
                    const meta = parseSermon(song.description);
                    const sub = meta[2] || song.category;
                    return sub ? (
                      <p className="text-[11px] text-purple-300/70 truncate">{sub}</p>
                    ) : null;
                  })()}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShareClick({ id: song.id, title: song.title });
                  }}
                  className="flex-shrink-0 p-1.5 rounded hover:bg-slate-600/40 transition-colors"
                  aria-label={`${song.title} 공유하기`}
                  title="공유하기"
                >
                  <Share2 className="h-4 w-4 text-gray-500 hover:text-purple-300" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(song.id);
                  }}
                  className="flex-shrink-0 p-1.5 rounded hover:bg-slate-600/40 transition-colors"
                  aria-label={isFavorite(song.id) ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
                  title={isFavorite(song.id) ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
                >
                  <Star
                    className={`h-4 w-4 ${
                      isFavorite(song.id)
                        ? 'fill-pink-400 text-pink-400'
                        : 'text-gray-500 hover:fill-pink-400 hover:text-pink-400'
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const TABS: { key: MainTabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'songs', label: '찬양', icon: <Music className="h-5 w-5" /> },
    { key: 'search', label: '검색', icon: <Search className="h-5 w-5" /> },
    { key: 'favorites', label: '즐겨찾기', icon: <Star className="h-5 w-5" /> },
    { key: 'notices', label: '공지', icon: <Bell className="h-5 w-5" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="relative flex flex-col min-h-screen max-w-md mx-auto">

        {/* ===== 헤더 ===== */}
        <header className="sticky top-0 z-30 bg-slate-900/85 backdrop-blur border-b border-purple-500/20">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <Music className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold leading-tight">SY Music</h1>
                <p className="text-[11px] text-purple-300 truncate">수영로말씀적용찬양</p>
              </div>
            </div>

            <div ref={menuRef} className="relative flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMenuOpen((v) => !v)}
                aria-label="메뉴 열기"
                title="메뉴"
                className="text-white hover:text-white hover:bg-transparent"
                style={{ padding: '8px', lineHeight: 0, height: 'auto' }}
              >
                <Menu style={{ width: '26px', height: '26px' }} strokeWidth={1.5} color="white" />
              </Button>

              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-slate-800 border border-purple-500/30 rounded-lg shadow-lg overflow-hidden z-50">
                  <button
                    type="button"
                    onClick={() => {
                      setIsGitaOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-100 hover:bg-purple-500/20 transition-colors"
                  >
                    🎸 카포·조옮김
                  </button>
                  <div className="h-px bg-purple-500/30" />
                  <button
                    type="button"
                    onClick={() => {
                      setIsTunerOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-100 hover:bg-purple-500/20 transition-colors"
                  >
                    🎵 기타조율기
                  </button>
                  <div className="h-px bg-purple-500/30" />
                  <button
                    type="button"
                    onClick={() => {
                      toast('🎹 메트로놈은 준비 중입니다.');
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-400 hover:bg-purple-500/20 transition-colors"
                  >
                    🎹 메트로놈 <span className="text-[10px] text-gray-500">(준비 중)</span>
                  </button>
                  <div className="h-px bg-purple-500/30" />
                  <button
                    type="button"
                    onClick={() => {
                      setIsAboutOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-100 hover:bg-purple-500/20 transition-colors"
                  >
                    ℹ️ 개발자 정보
                  </button>

                  {isAdminRoute && isAdmin && (
                    <>
                      <div className="h-px bg-purple-500/30" />
                      <button
                        type="button"
                        onClick={() => {
                          handleAdminManagementAccess();
                          setIsMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm text-gray-100 hover:bg-purple-500/20 transition-colors"
                      >
                        ⚙️ 곡 관리
                      </button>
                      <div className="h-px bg-purple-500/30" />
                      <button
                        type="button"
                        onClick={() => {
                          setIsAnalyticsOpen(true);
                          setIsMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm text-gray-100 hover:bg-purple-500/20 transition-colors"
                      >
                        📊 통계
                      </button>
                      <div className="h-px bg-purple-500/30" />
                      <button
                        type="button"
                        onClick={() => {
                          handleAdminLogout();
                          setIsMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm text-red-300 hover:bg-red-500/10 transition-colors"
                      >
                        🚪 로그아웃
                      </button>
                    </>
                  )}

                  {isAdminRoute && !isAdmin && (
                    <>
                      <div className="h-px bg-purple-500/30" />
                      <button
                        type="button"
                        onClick={() => {
                          handleAdminManagementAccess();
                          setIsMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm text-gray-100 hover:bg-purple-500/20 transition-colors"
                      >
                        🔐 관리자 로그인
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {isOfflineMode && (
            <div className="flex items-center gap-1 px-4 pb-2 -mt-1 text-xs text-orange-400">
              <WifiOff className="h-3 w-3" />
              <span>오프라인 모드</span>
            </div>
          )}
        </header>

        {/* ===== 본문 (탭별 화면) ===== */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: 72 }}
        >
          {/* --- 🎵 찬양 탭 (기존 3단 레이아웃 복원) --- */}
          {activeTab === 'songs' && (
            <div className="px-3 py-2 space-y-1.5">
              {isFavoritesMode && (
                <div className="flex items-center justify-between bg-purple-900/40 border border-purple-400/40 rounded-lg px-3 py-2">
                  <span className="text-xs text-purple-100 flex items-center">
                    <Star className="h-3.5 w-3.5 mr-1 fill-pink-400 text-pink-400" />
                    즐겨찾기 재생 중 ({favorites.length}곡)
                  </span>
                  <button
                    type="button"
                    onClick={exitFavoritesMode}
                    className="text-xs text-purple-200 hover:text-white flex items-center"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                    전체 목록
                  </button>
                </div>
              )}

              {/* 1. 곡 목록 박스 — 고정 높이(5곡), 내부 스크롤 */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="p-2 pb-0">
                  <CardTitle className="text-xs text-white flex items-center space-x-1">
                    <List className="h-3 w-3" />
                    <span>곡 목록 ({filteredSongs.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0">
                  <div className="max-h-32 overflow-y-auto">
                    {filteredSongs.length === 0 ? (
                      <div className="text-center py-3">
                        <Music className="h-6 w-6 text-gray-600 mx-auto mb-1" />
                        <p className="text-gray-400 text-xs">
                          {isFavoritesMode
                            ? '즐겨찾기한 곡이 없어요'
                            : '검색 결과가 없습니다'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {filteredSongs.map((song, index) => {
                          const isCurrentSong =
                            songs.indexOf(song) === currentSongIndex;
                          return (
                            <div
                              key={song.id}
                              ref={isCurrentSong ? currentSongRowRef : null}
                              onClick={() => playSong(index)}
                              className={`px-2 py-1 rounded cursor-pointer transition-all text-xs ${
                                isCurrentSong
                                  ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30'
                                  : 'bg-slate-700/30 hover:bg-slate-700/50 active:bg-slate-700/70'
                              }`}
                            >
                              <div className="flex items-center space-x-2">
                                <span className="text-gray-400 font-mono w-4 flex-shrink-0 text-xs">
                                  {index + 1}
                                </span>
                                <div className="flex-1 min-w-0 flex items-center space-x-1">
                                  <span className="text-white truncate text-xs">
                                    {song.title}
                                  </span>
                                  {index < 2 && (
                                    <SunMedium className="w-4 h-4 text-pink-400 flex-shrink-0 ml-1 animate-pulse" />
                                  )}
                                  {isCurrentSong && (
                                    <div className="flex items-center space-x-0.5">
                                      <div className="w-0.5 h-0.5 bg-purple-400 rounded-full animate-pulse"></div>
                                      <div className="w-0.5 h-0.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                                      <div className="w-0.5 h-0.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleShareClick({ id: song.id, title: song.title });
                                  }}
                                  className="flex-shrink-0 p-1 -m-1 rounded hover:bg-slate-600/40 transition-colors"
                                  aria-label={`${song.title} 공유하기`}
                                  title="공유하기"
                                >
                                  <Share2 className="h-3.5 w-3.5 text-gray-500 hover:text-purple-300" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(song.id);
                                  }}
                                  className="flex-shrink-0 p-1 -m-1 rounded hover:bg-slate-600/40 transition-colors"
                                  aria-label={isFavorite(song.id) ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
                                  title={isFavorite(song.id) ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
                                >
                                  <Star
                                    className={`h-3.5 w-3.5 ${
                                      isFavorite(song.id)
                                        ? 'fill-pink-400 text-pink-400'
                                        : 'text-gray-500 hover:fill-pink-400 hover:text-pink-400'
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 2. 플레이어 — 진행바 + 컨트롤 */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-2">
                  {currentSong ? (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div
                          className="w-full h-1.5 bg-slate-600 rounded-full cursor-pointer"
                          onClick={handleSeek}
                        >
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-100"
                            style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-center space-x-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={toggleRepeatMode}
                          className={`p-2 relative hover:bg-purple-500/20 ${
                            repeatMode === 'off'
                              ? 'text-gray-500 hover:text-gray-400'
                              : 'text-purple-400 hover:text-purple-300'
                          }`}
                        >
                          {repeatMode === 'one' ? (
                            <div className="relative">
                              <Repeat className="h-4 w-4" />
                              <span className="absolute -top-1 -right-1 text-xs font-bold bg-purple-500 text-white rounded-full w-3 h-3 flex items-center justify-center leading-none">
                                1
                              </span>
                            </div>
                          ) : (
                            <Repeat className="h-4 w-4" />
                          )}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={skipToPrevious}
                          className="text-white hover:text-purple-300 hover:bg-purple-500/20 p-2"
                        >
                          <SkipBack className="h-4 w-4" />
                        </Button>

                        <Button
                          onClick={togglePlay}
                          size="sm"
                          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 w-12 h-12 rounded-full"
                          disabled={!currentSong.audioUrl}
                        >
                          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={skipToNext}
                          className="text-white hover:text-purple-300 hover:bg-purple-500/20 p-2"
                        >
                          <SkipForward className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={toggleShuffle}
                          className={`p-2 hover:bg-purple-500/20 ${
                            isShuffleEnabled
                              ? 'text-purple-400 hover:text-purple-300'
                              : 'text-gray-500 hover:text-gray-400'
                          }`}
                        >
                          <Shuffle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-3 space-y-2">
                      <Music className="h-8 w-8 text-gray-600 mx-auto" />
                      <div>
                        <p className="text-gray-400 text-sm">재생목록</p>
                        <p className="text-xs text-gray-500">곡을 선택해주세요</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 3. 가사 영역 — 페이지 스크롤(내부 스크롤 없음) */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="p-2 pb-1">
                  <CardTitle className="text-sm text-white flex items-center space-x-2">
                    <Scroll className="h-4 w-4" />
                    <span>가사</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0">
                  <div className="bg-slate-700/30 rounded-lg p-2">
                    {currentSong && currentSong.lyrics ? (
                      <div className="space-y-2">
                        <div className="text-left border-b border-slate-600 pb-2 text-xs space-y-1 break-keep">
                          {(() => {
                            const parts = parseSermon(currentSong.description);
                            return (
                              <>
                                {parts[0] && (
                                  <p>
                                    <span className="text-gray-500">· </span>
                                    <span className="text-gray-400">설교제목: </span>
                                    <span className="text-gray-200">{parts[0]}</span>
                                  </p>
                                )}
                                {(parts[1] || parts[2]) && (
                                  <p>
                                    {parts[1] && (
                                      <>
                                        <span className="text-gray-500">· </span>
                                        <span className="text-gray-400">설교본문: </span>
                                        <span className="text-gray-200">{parts[1]}</span>
                                      </>
                                    )}
                                    {parts[1] && parts[2] && (
                                      <span className="mx-1 text-gray-500">|</span>
                                    )}
                                    {parts[2] && (
                                      <>
                                        <span className="text-gray-500">· </span>
                                        <span className="text-gray-400">설교자: </span>
                                        <span className="text-gray-200">{parts[2]}</span>
                                      </>
                                    )}
                                  </p>
                                )}
                                {(parts[3] || parts[4]) && (
                                  <p>
                                    {parts[3] && (
                                      <>
                                        <span className="text-gray-500">· </span>
                                        <span className="text-gray-400">구분: </span>
                                        <span className="text-gray-200">{parts[3]}</span>
                                      </>
                                    )}
                                    {parts[3] && parts[4] && (
                                      <span className="mx-1 text-gray-500">|</span>
                                    )}
                                    {parts[4] && (
                                      <>
                                        <span className="text-gray-500">· </span>
                                        <span className="text-gray-400">날짜: </span>
                                        <span className="text-gray-200">{parts[4]}</span>
                                      </>
                                    )}
                                  </p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        {currentSong.title && (
                          <h3 className="text-2xl font-bold text-white text-center break-keep">
                            {currentSong.title}
                          </h3>
                        )}
                        <div className="whitespace-pre-line text-white leading-relaxed text-center text-sm break-keep">
                          {currentSong.lyrics}
                        </div>
                        <div className="text-center pt-3 border-t border-slate-600 flex items-center justify-center gap-2 flex-wrap">
                          {currentSong.youtubeUrl && (
                            <Button
                              size="sm"
                              onClick={() => window.open(currentSong.youtubeUrl, '_blank')}
                              className="bg-purple-900/50 hover:bg-purple-800/60 text-white hover:text-pink-400 border border-purple-500/30 text-xs transition-colors duration-200"
                            >
                              <Youtube className="h-3 w-3 mr-1 text-red-500" />
                              설교YouTube
                            </Button>
                          )}
                          <button
                            onClick={() => handleShareClick({ id: currentSong.id, title: currentSong.title })}
                            onPointerDown={() => setIsSharePressed(true)}
                            onPointerUp={() => setIsSharePressed(false)}
                            onPointerLeave={() => setIsSharePressed(false)}
                            onPointerCancel={() => setIsSharePressed(false)}
                            className={`h-9 px-3 rounded-md font-semibold text-xs inline-flex items-center justify-center gap-1 border border-purple-500/30 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                              isSharePressed
                                ? 'bg-purple-950 text-pink-400 scale-[0.98]'
                                : 'bg-purple-900/50 hover:bg-purple-800/60 text-white hover:text-pink-400'
                            }`}
                          >
                            <Share2 className="h-3 w-3" />
                            이 찬양 공유 하기
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="py-8 text-center space-y-2">
                        <Scroll className="h-8 w-8 text-gray-600 mx-auto" />
                        <div>
                          <p className="text-gray-400 text-sm">
                            {currentSong ? '이 곡에는 가사가 없습니다' : '곡을 선택하면 가사가 표시됩니다'}
                          </p>
                          {currentSong && (
                            <>
                              <p className="text-xs text-gray-500 mt-1">
                                관리자가 가사를 추가할 수 있습니다
                              </p>
                              <div className="pt-3">
                                <button
                                  onClick={() => handleShareClick({ id: currentSong.id, title: currentSong.title })}
                                  onPointerDown={() => setIsSharePressed(true)}
                                  onPointerUp={() => setIsSharePressed(false)}
                                  onPointerLeave={() => setIsSharePressed(false)}
                                  onPointerCancel={() => setIsSharePressed(false)}
                                  className={`h-9 px-3 rounded-md border font-semibold text-xs inline-flex items-center justify-center gap-1 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                                    isSharePressed
                                      ? 'bg-purple-950 text-pink-300 border-pink-400/70 scale-[0.98]'
                                      : 'bg-purple-800 text-white border-purple-400/60 hover:text-pink-300 hover:border-pink-400/70'
                                  }`}
                                >
                                  <Share2 className="h-3 w-3" />
                                  곡 공유하기
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* --- 🔍 검색 탭 --- */}
          {activeTab === 'search' && (
            <div className="px-4 py-4 space-y-3">
              <div className="grid grid-cols-4 gap-1">
                {SEARCH_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSearchTab(t.key)}
                    className={`h-10 rounded-md text-sm font-medium transition-colors ${
                      searchTab === t.key
                        ? 'bg-purple-600 text-white shadow-sm shadow-purple-900/40'
                        : 'bg-slate-800/50 text-gray-300 border border-purple-400/30 hover:bg-purple-900/40'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div>
                {searchTab === 'category' && (
                  <Select value={currentCategory} onValueChange={setCurrentCategory}>
                    <SelectTrigger className="w-full bg-slate-800/50 border-purple-400 text-white h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="전체" className="text-white hover:bg-purple-600/20">🎵 전체</SelectItem>
                      <SelectItem value="금철" className="text-white hover:bg-purple-600/20">🌙 금철</SelectItem>
                      <SelectItem value="주일" className="text-white hover:bg-purple-600/20">⛪ 주일</SelectItem>
                      <SelectItem value="QT" className="text-white hover:bg-purple-600/20">📖 QT</SelectItem>
                      <SelectItem value="기타" className="text-white hover:bg-purple-600/20">🎼 기타</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {searchTab === 'tags' && (
                  allTags.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2 px-1">아직 생성된 태그가 없습니다.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {allTags.map((tag) => {
                        const active = selectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              setSelectedTags((prev) =>
                                prev.includes(tag)
                                  ? prev.filter((x) => x !== tag)
                                  : [...prev, tag]
                              )
                            }
                            className={`px-2.5 py-1.5 rounded-full text-xs transition-colors ${
                              active
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-700/40 text-gray-300 hover:bg-purple-900/40'
                            }`}
                          >
                            #{tag}
                          </button>
                        );
                      })}
                    </div>
                  )
                )}

                {searchTab === 'mood' && (
                  <div className="grid grid-cols-2 gap-2">
                    {MOOD_PRESETS.map((m) => {
                      const active = selectedMood === m.label;
                      return (
                        <button
                          key={m.label}
                          type="button"
                          onClick={() => setSelectedMood(active ? null : m.label)}
                          className={`px-2 py-3 rounded-md text-xs transition-colors ${
                            active
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-700/40 text-gray-300 hover:bg-purple-900/40'
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {searchTab === 'lyrics' && (
                  <Input
                    value={lyricsQuery}
                    onChange={(e) => setLyricsQuery(e.target.value)}
                    placeholder="가사 키워드를 입력하세요"
                    className="w-full bg-slate-800/50 border-purple-400/40 text-white h-12 text-sm"
                  />
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-purple-200 pt-1">
                <Search className="h-4 w-4" />
                <span>검색 결과 ({filteredSongs.length})</span>
              </div>

              {renderSongList(filteredSongs, handlePickFromSearch, '검색 결과가 없습니다')}
            </div>
          )}

          {/* --- ⭐ 즐겨찾기 탭 --- */}
          {activeTab === 'favorites' && (
            <div className="px-4 py-4 space-y-3">
              <Button
                onClick={handlePlayAllFavorites}
                className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white justify-center"
              >
                <Play className="h-4 w-4 mr-2" />
                즐겨찾기 재생 시작 ({favoriteSongs.length})
              </Button>

              <div className="flex items-center gap-2 text-sm text-purple-200 pt-1">
                <Star className="h-4 w-4 fill-pink-400 text-pink-400" />
                <span>즐겨찾기 목록 ({favoriteSongs.length})</span>
              </div>

              {renderSongList(
                favoriteSongs,
                (index) => playFavoriteSong(favoriteSongs[index]),
                '즐겨찾기한 곡이 없어요. 곡 옆 ⭐ 버튼으로 추가해보세요!',
              )}
            </div>
          )}

          {/* --- 📰 공지 탭 --- */}
          {activeTab === 'notices' && (
            <NoticePanel
              notices={notices}
              loading={noticesLoading}
              lastReadAt={noticeLastReadAt}
              onMarkAllRead={markAllNoticesRead}
              isAdmin={isAdminRoute && isAdmin}
            />
          )}
        </main>

        {/* ===== 미니 플레이어 + 하단 탭바 ===== */}
        <div className="fixed bottom-0 inset-x-0 z-40">
          <div className="max-w-md mx-auto">
            <nav className="grid grid-cols-4 bg-slate-900/95 backdrop-blur border-t border-purple-500/20">
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors ${
                      active ? 'text-purple-400' : 'text-gray-400 hover:text-gray-200'
                    }`}
                    aria-label={tab.label}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="relative">
                      {tab.icon}
                      {tab.key === 'notices' && noticeUnreadCount > 0 && (
                        <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center border border-slate-900">
                          {noticeUnreadCount > 9 ? '9+' : noticeUnreadCount}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {isAdminRoute && (
        <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
          <DialogContent className="bg-slate-800 border-slate-700 mx-4">
            <DialogHeader>
              <DialogTitle className="text-white">관리자 인증</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="admin-email" className="text-white">관리자 이메일</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="이메일을 입력하세요"
                  disabled={isAdminAuthenticating}
                />
              </div>
              <div>
                <Label htmlFor="admin-password" className="text-white">비밀번호</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="비밀번호를 입력하세요"
                  disabled={isAdminAuthenticating}
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="remember-admin"
                  checked={rememberAdmin}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRememberAdmin(checked);
                    if (!checked) {
                      localStorage.removeItem('symusic-admin-email');
                    }
                  }}
                  className="rounded"
                  disabled={isAdminAuthenticating}
                />
                <Label htmlFor="remember-admin" className="text-sm text-gray-300">
                  이 기기에 이메일 저장
                </Label>
              </div>
              <div className="flex space-x-2">
                <Button
                  onClick={handleAdminLogin}
                  className="flex-1"
                  disabled={isAdminAuthenticating}
                >
                  {isAdminAuthenticating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      확인 중...
                    </>
                  ) : (
                    '확인'
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAdminDialog(false)}
                  className="flex-1"
                  disabled={isAdminAuthenticating}
                >
                  취소
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        )}

        {isAdminRoute && (
        <Dialog open={showAdminManagementDialog} onOpenChange={setShowAdminManagementDialog}>
          <DialogContent className="bg-slate-800 border-slate-700 mx-4 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white">곡 관리</DialogTitle>
            </DialogHeader>

            <Tabs value={activeAdminTab} onValueChange={setActiveAdminTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-slate-700">
                <TabsTrigger value="add" className="text-white data-[state=active]:bg-purple-600">새 곡 추가</TabsTrigger>
                <TabsTrigger value="manage" className="text-white data-[state=active]:bg-purple-600">기존 곡 관리</TabsTrigger>
              </TabsList>

              <TabsContent value="add" className="space-y-4">
                <div>
                  <Label htmlFor="new-song-category" className="text-white">카테고리 *</Label>
                  <Select value={newSong.category} onValueChange={(value) => setNewSong({...newSong, category: value})}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                      <SelectValue placeholder="카테고리 선택" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      <SelectItem value="금철" className="text-white">금철</SelectItem>
                      <SelectItem value="주일" className="text-white">주일</SelectItem>
                      <SelectItem value="QT" className="text-white">QT</SelectItem>
                      <SelectItem value="기타" className="text-white">기타</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="new-song-title" className="text-white">곡 제목 *</Label>
                  <Input
                    id="new-song-title"
                    value={newSong.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    placeholder="예: 그 손이 일하시네"
                  />
                </div>

                <div>
                  <Label htmlFor="new-song-description" className="text-white">곡 설명</Label>
                  <Input
                    id="new-song-description"
                    value={newSong.description}
                    onChange={(e) => setNewSong({...newSong, description: e.target.value})}
                    className="bg-slate-700 border-slate-600 text-white"
                    placeholder="예: 역대하24:17-27"
                  />
                </div>

                <div>
                  <Label htmlFor="new-song-youtube" className="text-white">말씀 유튜브 링크</Label>
                  <Input
                    id="new-song-youtube"
                    value={newSong.youtubeUrl}
                    onChange={(e) => setNewSong({...newSong, youtubeUrl: e.target.value})}
                    className="bg-slate-700 border-slate-600 text-white"
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </div>

                <div>
                  <Label htmlFor="new-song-lyrics" className="text-white">가사</Label>
                  <Textarea
                    id="new-song-lyrics"
                    value={newSong.lyrics}
                    onChange={(e) => setNewSong({...newSong, lyrics: e.target.value})}
                    className="bg-slate-700 border-slate-600 text-white"
                    placeholder="가사를 입력하세요"
                    rows={6}
                  />
                </div>

                <div className="flex space-x-2">
                  <Button
                    onClick={handleAddSong}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500"
                    disabled={isAddingSong || !newSong.title || !newSong.category}
                  >
                    {isAddingSong ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        저장 중...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        저장
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewSong({ title: '', category: '', description: '', youtubeUrl: '', lyrics: '' });
                    }}
                    className="flex-1"
                    disabled={isAddingSong}
                  >
                    <X className="h-4 w-4 mr-2" />
                    초기화
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="manage" className="space-y-4">
                {editingSong ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">곡 수정</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingSong(null);
                          setEditSongData({ title: '', category: '', description: '', youtubeUrl: '', lyrics: '' });
                        }}
                        className="text-gray-400 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div>
                      <Label htmlFor="edit-song-category" className="text-white">카테고리 *</Label>
                      <Select value={editSongData.category} onValueChange={(value) => setEditSongData({...editSongData, category: value})}>
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-700 border-slate-600">
                          <SelectItem value="금철" className="text-white">금철</SelectItem>
                          <SelectItem value="주일" className="text-white">주일</SelectItem>
                          <SelectItem value="QT" className="text-white">QT</SelectItem>
                          <SelectItem value="기타" className="text-white">기타</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="edit-song-title" className="text-white">곡 제목 *</Label>
                      <Input
                        id="edit-song-title"
                        value={editSongData.title}
                        onChange={(e) => setEditSongData({...editSongData, title: e.target.value})}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>

                    <div>
                      <Label htmlFor="edit-song-description" className="text-white">곡 설명</Label>
                      <Input
                        id="edit-song-description"
                        value={editSongData.description}
                        onChange={(e) => setEditSongData({...editSongData, description: e.target.value})}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>

                    <div>
                      <Label htmlFor="edit-song-youtube" className="text-white">말씀 유튜브 링크</Label>
                      <Input
                        id="edit-song-youtube"
                        value={editSongData.youtubeUrl}
                        onChange={(e) => setEditSongData({...editSongData, youtubeUrl: e.target.value})}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>

                    <div>
                      <Label htmlFor="edit-song-lyrics" className="text-white">가사</Label>
                      <Textarea
                        id="edit-song-lyrics"
                        value={editSongData.lyrics}
                        onChange={(e) => setEditSongData({...editSongData, lyrics: e.target.value})}
                        className="bg-slate-700 border-slate-600 text-white"
                        rows={6}
                      />
                    </div>

                    <div className="flex space-x-2">
                      <Button
                        onClick={handleUpdateSong}
                        className="flex-1 bg-gradient-to-r from-green-500 to-green-600"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        수정 완료
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingSong(null);
                          setEditSongData({ title: '', category: '', description: '', youtubeUrl: '', lyrics: '' });
                        }}
                        className="flex-1"
                      >
                        취소
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-slate-600 bg-slate-700/40 p-3 space-y-2">
                      <Button
                        onClick={handleBatchGenerateTags}
                        disabled={isBatchTagging}
                        className="w-full bg-gradient-to-r from-amber-500 to-orange-500"
                      >
                        {isBatchTagging ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            태그 생성 중...
                          </>
                        ) : (
                          '🏷️ 전체 곡 태그 일괄 생성'
                        )}
                      </Button>
                      <p className="text-xs text-gray-400">
                        tags가 없고 가사가 있는 곡만 순차 처리합니다 (곡 사이 0.5초 대기).
                      </p>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-4 pt-2">기존 곡 목록</h3>
                    {songs.length === 0 ? (
                      <p className="text-gray-400 text-center py-4">곡이 없습니다.</p>
                    ) : (
                      <div className="max-h-96 overflow-y-auto space-y-2">
                        {songs.map((song) => {
                          return (
                            <div
                              key={song.id}
                              className="p-3 bg-slate-700/50 rounded-lg flex items-center justify-between"
                            >
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-white truncate">
                                  {song.title}
                                </h4>
                                <p className="text-xs text-gray-400">{song.category}</p>
                              </div>

                              <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => startEditingSong(song)}
                                  className="text-blue-400 hover:text-blue-300 p-1"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm(`정말로 "${song.title}" 곡을 삭제하시겠습니까?`)) {
                                      handleDeleteSong(song.id);
                                    }
                                  }}
                                  className="text-red-400 hover:text-red-300 p-1"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
        )}

        <audio
          ref={audioRef}
          crossOrigin="anonymous"
          preload="metadata"
        />
      </div>

      <AboutModal open={isAboutOpen} onOpenChange={setIsAboutOpen} songs={songs} />

      {isAdminRoute && (
        <AnalyticsDialog
          open={isAnalyticsOpen}
          onOpenChange={setIsAnalyticsOpen}
          songs={songs}
        />
      )}

      {isGitaOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900">
          <button
            type="button"
            onClick={() => setIsGitaOpen(false)}
            aria-label="카포·조옮김 닫기"
            title="닫기"
            className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-slate-800/90 hover:bg-slate-700 text-white flex items-center justify-center shadow-lg border border-purple-500/30"
          >
            <X className="w-5 h-5" />
          </button>
          <iframe
            src="/gita.html"
            title="카포·조옮김"
            className="w-full h-full border-0"
          />
        </div>
      )}

      {isTunerOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900">
          <button
            type="button"
            onClick={() => setIsTunerOpen(false)}
            aria-label="기타조율기 닫기"
            title="닫기"
            className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-slate-800/90 hover:bg-slate-700 text-white flex items-center justify-center shadow-lg border border-purple-500/30"
          >
            <X className="w-5 h-5" />
          </button>
          <iframe
            src="/tuner.html"
            title="기타조율기"
            allow="microphone"
            className="w-full h-full border-0"
          />
        </div>
      )}
    </div>
  );
}
