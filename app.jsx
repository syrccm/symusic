import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, query } from 'firebase/firestore';

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyDx15L0nraNbGDdnXDTiQIHGtiJ-Qn0G9w",
  authDomain: "symusic-7f651.firebaseapp.com",
  projectId: "symusic-7f651",
  storageBucket: "symusic-7f651.firebasestorage.app",
  messagingSenderId: "396203280257",
  appId: "1:396203280257:web:4d83b47410d796772260a80"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function App() {
  const [tracks, setTracks] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [newTrack, setNewTrack] = useState({ title: '', category: '', url: '' });
  const audioRef = useRef(null);
  
  const categories = ['전체', '*설성2랭2*', '*홀로십자병법*', '*함,싸*2?2랭*'];
  const ADMIN_PASSWORD = 'dudgns911!@0';

  // ✅ Firebase songs 컬렉션 실시간 동기화
  useEffect(() => {
    console.log('🔥 Firebase songs 컬렉션 리스너 시작...');
    const songsRef = collection(db, 'songs');
    
    const unsubscribe = onSnapshot(songsRef, 
      (snapshot) => {
        const songsData = [];
        snapshot.forEach(doc => {
          songsData.push({
            id: doc.id,
            ...doc.data()
          });
        });
        console.log('✅ Firebase songs 수신:', songsData.length, '곡');
        setTracks(songsData);
      },
      (error) => {
        console.error('❌ Firebase 에러:', error);
      }
    );

    return () => {
      console.log('🔌 Firebase 리스너 종료');
      unsubscribe();
    };
  }, []);

  // 자동 재생 (곡이 변경될 때)
  useEffect(() => {
    if (isPlaying && currentTrack) {
      playCurrentTrack();
    }
  }, [currentIndex]);

  // 필터링된 트랙
  const filteredTracks = selectedCategory === '전체' 
    ? tracks 
    : tracks.filter(track => track.category === selectedCategory);

  const currentTrack = filteredTracks[currentIndex];

  // 재생 함수
  const playCurrentTrack = () => {
    if (!currentTrack || !audioRef.current) return;
    
    const audioUrl = currentTrack.audioUrl || currentTrack.url;
    if (audioUrl) {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(err => console.error('재생 실패:', err));
    }
  };

  // 재생/일시정지
  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (!currentTrack) {
        alert('재생할 곡이 없습니다');
        return;
      }
      playCurrentTrack();
      setIsPlaying(true);
    }
  };

  // 이전/다음 곡
  const playPrevious = () => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : filteredTracks.length - 1));
  };

  const playNext = () => {
    setCurrentIndex(prev => (prev < filteredTracks.length - 1 ? prev + 1 : 0));
  };

  // 곡 종료 시 다음 곡 재생
  const handleEnded = () => {
    playNext();
  };

  // 관리자 로그인
  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setPassword('');
      alert('관리자 로그인 성공!');
    } else {
      alert('비밀번호가 틀렸습니다');
      setPassword('');
    }
  };

  // ✅ 곡 추가 (songs 컬렉션에 개별 문서로 추가)
  const handleAddTrack = async () => {
    if (!newTrack.title || !newTrack.category) {
      alert('제목과 카테고리를 입력하세요');
      return;
    }

    try {
      await addDoc(collection(db, 'songs'), {
        title: newTrack.title,
        category: newTrack.category,
        audioUrl: newTrack.url || '',
        lyrics: '',
        created_at: serverTimestamp()
      });
      
      console.log('✅ 곡 추가 성공:', newTrack.title);
      alert('곡이 추가되었습니다!');
      setNewTrack({ title: '', category: '', url: '' });
    } catch (error) {
      console.error('❌ 곡 추가 실패:', error);
      alert('곡 추가 실패: ' + error.message);
    }
  };

  // ✅ 곡 삭제 (songs 컬렉션에서 문서 삭제)
  const handleDeleteTrack = async (trackId) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, 'songs', trackId));
      console.log('✅ 곡 삭제 성공:', trackId);
    } catch (error) {
      console.error('❌ 곡 삭제 실패:', error);
      alert('곡 삭제 실패: ' + error.message);
    }
  };

  // ✅ 곡 수정 (songs 컬렉션 문서 업데이트)
  const handleEditTrack = async (track) => {
    const newTitle = prompt('곡 제목:', track.title);
    if (!newTitle) return;
    
    const newCategory = prompt('카테고리:', track.category);
    if (!newCategory) return;
    
    const newUrl = prompt('URL:', track.audioUrl || track.url || '');

    try {
      await updateDoc(doc(db, 'songs', track.id), {
        title: newTitle,
        category: newCategory,
        audioUrl: newUrl
      });
      
      console.log('✅ 곡 수정 성공:', track.id);
      alert('곡이 수정되었습니다!');
    } catch (error) {
      console.error('❌ 곡 수정 실패:', error);
      alert('곡 수정 실패: ' + error.message);
    }
  };

  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{ textAlign: 'center', color: '#6B46C1' }}>
        🎵 SY Music - 수영로말씀찬양
      </h1>

      {/* Firebase 상태 */}
      <div style={{
        background: '#E9D8FD',
        padding: '10px',
        borderRadius: '5px',
        textAlign: 'center',
        marginBottom: '20px',
        fontSize: '14px'
      }}>
        ✅ 실시간 동기화 중 ({tracks.length}곡)
      </div>

      {/* 카테고리 선택 */}
      <div style={{ marginBottom: '20px' }}>
        <select 
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setCurrentIndex(0);
          }}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            borderRadius: '5px',
            border: '2px solid #6B46C1'
          }}
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* 현재 재생 중인 곡 */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '30px',
        borderRadius: '10px',
        marginBottom: '20px',
        textAlign: 'center'
      }}>
        <h2 style={{ margin: '0 0 10px 0' }}>
          {currentTrack ? currentTrack.title : '재생목록이 비어있습니다'}
        </h2>
        <p style={{ margin: '0 0 20px 0', opacity: 0.8 }}>
          {currentTrack ? `[${currentTrack.category}]` : ''}
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button 
            onClick={playPrevious}
            disabled={filteredTracks.length === 0}
            style={{
              padding: '12px 20px',
              fontSize: '18px',
              borderRadius: '5px',
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            ⏮️ 이전
          </button>
          <button 
            onClick={togglePlay}
            disabled={filteredTracks.length === 0}
            style={{
              padding: '12px 30px',
              fontSize: '18px',
              borderRadius: '5px',
              border: 'none',
              background: 'white',
              color: '#6B46C1',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {isPlaying ? '⏸️ 일시정지' : '▶️ 재생'}
          </button>
          <button 
            onClick={playNext}
            disabled={filteredTracks.length === 0}
            style={{
              padding: '12px 20px',
              fontSize: '18px',
              borderRadius: '5px',
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            ⏭️ 다음
          </button>
        </div>
      </div>

      {/* 관리자 로그인 */}
      {!isAdmin ? (
        <div style={{ 
          background: '#F7FAFC', 
          padding: '15px', 
          borderRadius: '5px',
          marginBottom: '20px'
        }}>
          <input
            type="password"
            placeholder="관리자 비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            style={{
              padding: '10px',
              marginRight: '10px',
              borderRadius: '5px',
              border: '1px solid #CBD5E0'
            }}
          />
          <button 
            onClick={handleLogin}
            style={{
              padding: '10px 20px',
              background: '#6B46C1',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            🔑 로그인
          </button>
        </div>
      ) : (
        <div style={{ 
          background: '#C6F6D5', 
          padding: '15px', 
          borderRadius: '5px',
          marginBottom: '20px'
        }}>
          <h3>➕ 곡 추가</h3>
          <input
            type="text"
            placeholder="곡 제목"
            value={newTrack.title}
            onChange={(e) => setNewTrack({...newTrack, title: e.target.value})}
            style={{
              padding: '10px',
              marginRight: '10px',
              marginBottom: '10px',
              borderRadius: '5px',
              border: '1px solid #CBD5E0',
              width: '200px'
            }}
          />
          <select
            value={newTrack.category}
            onChange={(e) => setNewTrack({...newTrack, category: e.target.value})}
            style={{
              padding: '10px',
              marginRight: '10px',
              marginBottom: '10px',
              borderRadius: '5px',
              border: '1px solid #CBD5E0'
            }}
          >
            <option value="">카테고리 선택</option>
            {categories.slice(1).map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="오디오 URL"
            value={newTrack.url}
            onChange={(e) => setNewTrack({...newTrack, url: e.target.value})}
            style={{
              padding: '10px',
              marginRight: '10px',
              marginBottom: '10px',
              borderRadius: '5px',
              border: '1px solid #CBD5E0',
              width: '300px'
            }}
          />
          <button 
            onClick={handleAddTrack}
            style={{
              padding: '10px 20px',
              background: '#38A169',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            추가
          </button>
          <button 
            onClick={() => setIsAdmin(false)}
            style={{
              padding: '10px 20px',
              background: '#E53E3E',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              marginLeft: '10px'
            }}
          >
            🚪 로그아웃
          </button>
        </div>
      )}

      {/* 재생목록 */}
      <h2>📋 재생목록 ({filteredTracks.length}곡)</h2>
      {filteredTracks.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#999' }}>재생목록이 비어있습니다</p>
      ) : (
        <div>
          {filteredTracks.map((track, index) => (
            <div
              key={track.id}
              onClick={() => setCurrentIndex(index)}
              style={{
                padding: '15px',
                background: currentIndex === index ? '#E9D8FD' : 'white',
                border: '1px solid #E2E8F0',
                borderRadius: '5px',
                marginBottom: '10px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontWeight: currentIndex === index ? 'bold' : 'normal' }}>
                  {currentIndex === index && '▶️ '}
                  {track.title}
                </div>
                <div style={{ fontSize: '12px', color: '#718096' }}>
                  [{track.category}]
                </div>
              </div>
              
              {isAdmin && (
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditTrack(track);
                    }}
                    style={{
                      padding: '5px 10px',
                      background: '#4299E1',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTrack(track.id);
                    }}
                    style={{
                      padding: '5px 10px',
                      background: '#E53E3E',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 오디오 플레이어 */}
      <audio 
        ref={audioRef} 
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </div>
  );
}

export default App;
