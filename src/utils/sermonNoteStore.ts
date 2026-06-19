// 설교노트 Firestore 저장소. 기기 단위 익명 경로 sermonNotes/{deviceId} 를 사용한다.
//  - 노트:  sermonNotes/{deviceId}/notes/{noteId}
//  - 설정:  sermonNotes/{deviceId} 문서 본체에 { defaultLock, pinHash }
// 텍스트만 저장(첨부/이미지 없음). 방어적 파싱은 useNotices 패턴을 따른다.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getDeviceId } from '@/utils/deviceId';
import type { SermonNote, SermonNoteSettings, Worship } from '@/types/sermonNote';

const ROOT = 'sermonNotes';

const WORSHIPS: Worship[] = ['주일', '금철', 'QT', '기타'];
function asWorship(v: unknown): Worship {
  return WORSHIPS.includes(v as Worship) ? (v as Worship) : '기타';
}

function settingsDocRef() {
  return doc(db, ROOT, getDeviceId());
}
function notesColRefFor(deviceId: string) {
  return collection(db, ROOT, deviceId, 'notes');
}
function notesColRef() {
  return notesColRefFor(getDeviceId());
}

// ── 노트 ────────────────────────────────────────────────────────

/** 임의 기기ID의 노트 목록 (createdAt 내림차순). 방어적 파싱. (백업 코드 복원용) */
export async function listNotesByDeviceId(deviceId: string): Promise<SermonNote[]> {
  const q = query(notesColRefFor(deviceId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const raw = d.data();
    return {
      id: d.id,
      worship: asWorship(raw.worship),
      date: typeof raw.date === 'string' ? raw.date : '',
      passage: typeof raw.passage === 'string' ? raw.passage : undefined,
      content: typeof raw.content === 'string' ? raw.content : '',
      locked: raw.locked === true,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
    } satisfies SermonNote;
  });
}

/** 현재 기기의 노트 전체 목록 (createdAt 내림차순). */
export async function listNotes(): Promise<SermonNote[]> {
  return listNotesByDeviceId(getDeviceId());
}

/** 노트 신규 저장/수정. updatedAt 은 저장 시점으로 갱신한다. */
export async function saveNote(note: SermonNote): Promise<void> {
  const payload: SermonNote = { ...note, updatedAt: Date.now() };
  // passage 가 비어있으면 필드 자체를 빼서 undefined 직렬화 오류를 막는다.
  const data: Record<string, unknown> = {
    worship: payload.worship,
    date: payload.date,
    content: payload.content,
    locked: payload.locked,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
  if (payload.passage) data.passage = payload.passage;
  await setDoc(doc(notesColRef(), note.id), data);
}

/** 노트 삭제. */
export async function deleteNote(id: string): Promise<void> {
  await deleteDoc(doc(notesColRef(), id));
}

// ── 설정 ────────────────────────────────────────────────────────

/** 설정 조회. 문서 없으면 기본값 { defaultLock:false, pinHash:null }. */
export async function getSettings(): Promise<SermonNoteSettings> {
  const snap = await getDoc(settingsDocRef());
  if (!snap.exists()) return { defaultLock: false, pinHash: null };
  const raw = snap.data();
  return {
    defaultLock: raw.defaultLock === true,
    pinHash: typeof raw.pinHash === 'string' ? raw.pinHash : null,
  };
}

/** 설정 저장. (노트 하위 컬렉션은 건드리지 않도록 merge) */
export async function saveSettings(s: SermonNoteSettings): Promise<void> {
  await setDoc(
    settingsDocRef(),
    { defaultLock: s.defaultLock, pinHash: s.pinHash },
    { merge: true }
  );
}

// ── PIN ─────────────────────────────────────────────────────────

/** 4자리 PIN을 SHA-256 16진 문자열로 해시. 평문은 저장하지 않는다. */
export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
