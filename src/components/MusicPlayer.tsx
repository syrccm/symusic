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
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Music,
  Settings,
  Trash2,
  Edit,
  CheckCircle,
  Loader2,
  Link,
  WifiOff,
  List,
  Save,
  X,
  Scroll,
  Repeat,
  Shuffle,
  LogOut
} from 'lucide-react';

// Types
interface Song {
  id: string;
  title: string;
  category: string;
  date?: string;
  description?: string;
  audioUrl?: string;
  sermon?: string;
  musicVideo?: string;
  lyrics?: string;
  youtubeUrl?: string;
  duration?: string;
  created_at: string;
}

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
  // State
  const [songs, setSongs] = useState<Song[]>([]);
  const [_categories, setCategories] = useState<Category[]>([]);
  const [currentCategory, setCurrentCategory] = useState('전체');
  const [currentSongIndex, setCurrentSongIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAddingSong, setIsAddingSong] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Playback modes
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  
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

  // Initialize data
  const initializeData = async () => {
    console.log('🎵 [MusicPlayer] 초기화 시작');
    
    try {
      setLoading(true);
      
      if (!db) {
        console.warn('⚠️ [MusicPlayer] Firestore가 없음 - 오프라인 모드로 전환');
        setIsOfflineMode(true);
        
        const savedSongs = localStorage.getItem('symusic-songs');
        const savedCategories = localStorage.getItem('symusic-categories');
        
        if (savedSongs) {
          const parsedSongs = JSON.parse(savedSongs);
          setSongs(parsedSongs);
        }
        
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
        
        toast.info('🔌 오프라인 모드로 실행 중입니다');
        return;
      }

      console.log('📡 [MusicPlayer] Firestore 리스너 설정 중...');
      setIsOfflineMode(false);

      const categoriesQuery = query(
        collection(db, 'categories'), 
        orderBy('created_at', 'desc')
      );
      
      const unsubscribeCategories = onSnapshot(
        categoriesQuery,
        async (snapshot) => {
          const categoriesData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
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

      const songsQuery = query(
        collection(db, 'songs'), 
        orderBy('created_at', 'desc')
      );
      
      const unsubscribeSongs = onSnapshot(
        songsQuery,
        async (snapshot) => {
          const songsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Song));
          
          setSongs(songsData);
          localStorage.setItem('symusic-songs', JSON.stringify(songsData));
        },
        (error) => {
          console.error('❌ [Songs] 스냅샷 오류:', error);
          toast.error('곡 목록 로드 중 오류가 발생했습니다: ' + error.message);
        }
      );

      toast.success('🎵 음악 플레이어가 준비되었습니다! (Firebase 연결됨)');

      return () => {
        unsubscribeCategories();
        unsubscribeSongs();
      };
      
    } catch (error) {
      console.error('❌ [MusicPlayer] 치명적 오류:', error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error('데이터 초기화 중 오류가 발생했습니다: ' + message);
      
      setIsOfflineMode(true);
      const defaultCats = DEFAULT_CATEGORIES.map((cat, index) => ({
        id: `local-${index}`,
        name: cat.name,
        created_at: new Date().toISOString()
      }));
      setCategories(defaultCats);
    } finally {
      setLoading(false);
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
        };
        
        const updatedSongs = [newSongWithId, ...songs];
        setSongs(updatedSongs);
        localStorage.setItem('symusic-songs', JSON.stringify(updatedSongs));
        
        toast.success(`새 곡이 추가되었습니다: ${newSong.title} (오프라인)`);
      } else {
        if (!db) {
          throw new Error('Firebase 연결이 끊어졌습니다.');
        }
        
        console.log('📡 [AddSong] Firebase에 저장 시작...');
        const docRef = await addDoc(collection(db, 'songs'), songData);
        console.log('✅ [AddSong] Firebase 저장 성공! 문서 ID:', docRef.id);
        
        toast.success(`새 곡이 추가되었습니다: ${newSong.title}`);
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
        const updatedSongs = songs.map(song => 
          song.id === editingSong.id ? { ...song, ...updatedData } : song
        );
        setSongs(updatedSongs);
        localStorage.setItem('symusic-songs', JSON.stringify(updatedSongs));
        
        toast.success(`곡이 수정되었습니다: ${editSongData.title} (오프라인)`);
      } else {
        await updateDoc(doc(db, 'songs', editingSong.id), updatedData);
        toast.success(`곡이 수정되었습니다: ${editSongData.title}`);
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
        const updatedSongs = songs.filter(song => song.id !== songId);
        setSongs(updatedSongs);
        localStorage.setItem('symusic-songs', JSON.stringify(updatedSongs));
        
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
      }).catch(error => {
        console.error('Playback failed:', error);
        toast.error(`오디오 재생에 실패했습니다: ${song.title}`);
      });
    } else {
      toast.error('오디오 파일이 없습니다.');
    }
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
      cleanup = await initializeData();
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

  // Update shuffled indices when songs or category changes
  useEffect(() => {
    if (isShuffleEnabled) {
      setShuffledIndices(generateShuffledIndices());
    }
  }, [songs, currentCategory, isShuffleEnabled]);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="flex flex-col min-h-screen max-w-md mx-auto">
        
        <div className="flex-shrink-0 p-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                <Music className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold">SY Music</h1>
                <p className="text-xs text-purple-300">수영로말씀적용찬양</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              {isAdminRoute && (
                <div className="flex items-center space-x-1 text-xs">
                  {isOfflineMode ? (
                    <>
                      <WifiOff className="h-3 w-3 text-orange-400" />
                      <span className="text-orange-400 hidden sm:inline">오프라인</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-3 w-3 text-green-400" />
                      <span className="text-green-400 hidden sm:inline">연결됨</span>
                    </>
                  )}
                </div>
              )}
              
              {isAdminRoute && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-purple-400 hover:text-purple-300 p-2"
                    onClick={handleAdminManagementAccess}
                    title="관리자 메뉴"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 p-2"
                      onClick={handleAdminLogout}
                      title="로그아웃"
                    >
                      <LogOut className="h-4 w-4" />
                      <span className="hidden sm:inline ml-1 text-xs">로그아웃</span>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="mt-3">
            <Select value={currentCategory} onValueChange={setCurrentCategory}>
              <SelectTrigger className="w-full bg-slate-800/50 border-purple-400 text-white h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="전체" className="text-white hover:bg-purple-600/20">
                  🎵 전체
                </SelectItem>
                <SelectItem value="금철" className="text-white hover:bg-purple-600/20">
                  🌙 금철
                </SelectItem>
                <SelectItem value="주일" className="text-white hover:bg-purple-600/20">
                  ⛪ 주일
                </SelectItem>
                <SelectItem value="QT" className="text-white hover:bg-purple-600/20">
                  📖 QT
                </SelectItem>
                <SelectItem value="기타" className="text-white hover:bg-purple-600/20">
                  🎼 기타
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-shrink-0 px-4 pb-2">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="p-2 pb-1">
              <CardTitle className="text-xs text-white flex items-center space-x-1">
                <List className="h-3 w-3" />
                <span>곡 목록</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0">
              <div className="max-h-32 overflow-y-auto">
                {filteredSongs.length === 0 ? (
                  <div className="text-center py-3">
                    <Music className="h-6 w-6 text-gray-600 mx-auto mb-1" />
                    <p className="text-gray-400 text-xs">
                      {currentCategory === '전체' 
                        ? '기본 곡을 설치하는 중입니다...' 
                        : `${currentCategory} 카테고리에 곡이 없습니다`
                      }
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {filteredSongs.map((song, index) => {
                      const isCurrentSong = songs.indexOf(song) === currentSongIndex;
                      return (
                        <div
                          key={song.id}
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
                              <span className="text-white truncate text-xs">{song.title}</span>
                              {isCurrentSong && (
                                <div className="flex items-center space-x-0.5">
                                  <div className="w-0.5 h-0.5 bg-purple-400 rounded-full animate-pulse"></div>
                                  <div className="w-0.5 h-0.5 bg-purple-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                                  <div className="w-0.5 h-0.5 bg-purple-400 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col">
          
          <div className="flex-shrink-0 px-4 pb-2">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-3">
                {currentSong ? (
                  <div className="space-y-3">
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
                        className={`p-2 relative ${
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
                        className="text-white hover:text-purple-300 p-2"
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
                        className="text-white hover:text-purple-300 p-2"
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                      
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={toggleShuffle}
                        className={`p-2 ${
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
                  <div className="text-center py-4 space-y-2">
                    <Music className="h-8 w-8 text-gray-600 mx-auto" />
                    <div>
                      <p className="text-gray-400 text-sm">재생목록</p>
                      <p className="text-xs text-gray-500">곡을 선택해주세요</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex-1 min-h-0 px-4 pb-4">
            <Card className="bg-slate-800/50 border-slate-700 h-full flex flex-col">
              <CardHeader className="p-3 pb-2 flex-shrink-0">
                <CardTitle className="text-sm text-white flex items-center space-x-2">
                  <Scroll className="h-4 w-4" />
                  <span>가사</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 flex-1 min-h-0 overflow-hidden">
                <div className="h-full overflow-y-auto bg-slate-700/30 rounded-lg p-3">
                  {currentSong && currentSong.lyrics ? (
                    <div className="space-y-3">
                      <div className="text-center border-b border-slate-600 pb-2">
                        <h3 className="text-sm font-semibold text-white">{currentSong.title}</h3>
                        <p className="text-purple-300 text-xs">{currentSong.category}</p>
                        {currentSong.description && (
                          <p className="text-gray-400 text-xs mt-1">{currentSong.description}</p>
                        )}
                      </div>
                      <div className="whitespace-pre-line text-white leading-relaxed text-center text-sm">
                        {currentSong.lyrics}
                      </div>
                      {currentSong.youtubeUrl && (
                        <div className="text-center pt-3 border-t border-slate-600">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(currentSong.youtubeUrl, '_blank')}
                            className="text-red-400 border-red-400 hover:bg-red-400/10 text-xs"
                          >
                            <Link className="h-3 w-3 mr-1" />
                            말씀 영상 보기
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-8 text-center space-y-2">
                      <Scroll className="h-8 w-8 text-gray-600 mx-auto" />
                      <div>
                        <p className="text-gray-400 text-sm">
                          {currentSong ? '이 곡에는 가사가 없습니다' : '곡을 선택하면 가사가 표시됩니다'}
                        </p>
                        {currentSong && (
                          <p className="text-xs text-gray-500 mt-1">
                            관리자가 가사를 추가할 수 있습니다
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
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
                    <h3 className="text-lg font-semibold text-white mb-4">기존 곡 목록</h3>
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
    </div>
  );
}
