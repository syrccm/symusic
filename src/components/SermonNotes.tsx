import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Pencil, BookCopy, Settings, Share2, Trash2, Copy, Lock } from 'lucide-react';
import { toast } from 'sonner';
import {
  listNotes,
  listNotesByDeviceId,
  saveNote,
  deleteNote,
  getSettings,
  saveSettings,
  hashPin,
} from '@/utils/sermonNoteStore';
import { getDeviceId } from '@/utils/deviceId';
import BiblePassagePicker from '@/components/BiblePassagePicker';
import type { SermonNote, SermonNoteSettings, Worship } from '@/types/sermonNote';

// ── 색 토큰 (목업 v2 — 순수 검정 다크) ─────────────────────────
const CARD = '#141414';
const LINE = 'rgba(255,255,255,.1)';
const TEAL = '#2dd4bf';
const GOLD = '#e8c24a';
const MUTED = '#9a9a9a';
const TEAL_GRAD = 'linear-gradient(135deg,#2dd4bf,#0e8a7c)';

const WORSHIPS: Worship[] = ['주일', '금철', 'QT', '기타'];
// 예배 태그 색: 주일·금철 teal / QT·기타 gold
const isGold = (w: Worship) => w === 'QT' || w === '기타';

type View = 'hub' | 'write' | 'list' | 'detail' | 'manage';

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* 폴백 */
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

// 노트 1건의 공유/이메일용 텍스트 형식
function noteText(n: SermonNote): string {
  return `[${n.worship}] ${n.date}${n.passage ? ` · ${n.passage}` : ''}\n\n${n.content}\n\n— Symusic 설교노트`;
}

// 파일 다운로드 (브라우저 표준 Blob)
function downloadFile(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 공유(navigator.share) 우선, 없으면 클립보드 복사
async function shareOrCopy(title: string, text: string) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text });
    } catch {
      /* 사용자가 취소 — 무시 */
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('복사되었습니다.');
  } catch {
    toast('복사에 실패했습니다.');
  }
}

// 백업/복원 시 외부 JSON 노트를 SermonNote로 정규화 (방어적)
function sanitizeNote(raw: unknown): SermonNote {
  const r = (raw ?? {}) as Record<string, unknown>;
  const worship = (['주일', '금철', 'QT', '기타'] as const).includes(r.worship as Worship)
    ? (r.worship as Worship)
    : '기타';
  const now = Date.now();
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    worship,
    date: typeof r.date === 'string' ? r.date : '',
    passage: typeof r.passage === 'string' && r.passage ? r.passage : undefined,
    content: typeof r.content === 'string' ? r.content : '',
    locked: r.locked === true,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

function todayDownloadStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function SermonNotes() {
  const [view, setView] = useState<View>('hub');

  // 작성/수정 폼 (editingId 있으면 수정, 없으면 신규)
  // 신규 작성 시 예배구분은 '미선택'('')에서 시작 → 사용자가 반드시 고르도록
  const [wWorship, setWWorship] = useState<Worship | ''>('');
  const [wDate, setWDate] = useState<string>(todayStr());
  const [wPassage, setWPassage] = useState('');
  const [wContent, setWContent] = useState('');
  const [passagePickerOpen, setPassagePickerOpen] = useState(false); // 본문 성경말씀 선택 오버레이
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCreatedAt, setEditingCreatedAt] = useState<number | null>(null);

  // 상세 보기 대상 노트
  const [detailNote, setDetailNote] = useState<SermonNote | null>(null);

  // 목록
  const [notes, setNotes] = useState<SermonNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'전체' | Worship>('전체');
  const [filterDate, setFilterDate] = useState('');

  // 공유·백업 시트 / 관리
  const [sheetNote, setSheetNote] = useState<SermonNote | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const passageRef = useRef<HTMLInputElement>(null); // 본문 input (피커 닫힌 뒤 포커스 복귀 루프 방지)
  const deviceId = getDeviceId();

  // 피커 닫기: 닫은 뒤 input 포커스가 복귀하며 다시 열리는 루프를 차단
  const closePassagePicker = () => {
    setPassagePickerOpen(false);
    setTimeout(() => passageRef.current?.blur(), 0);
  };

  // 잠금(화면 가림막)
  const [settings, setSettings] = useState<SermonNoteSettings>({ defaultLock: false, pinHash: null });
  const [wLocked, setWLocked] = useState(false); // 작성 중 노트 잠금 여부
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set()); // 세션 동안 열어둔 노트
  const [pinModalNote, setPinModalNote] = useState<SermonNote | null>(null); // PIN 입력 대상
  const [pinSetupOpen, setPinSetupOpen] = useState(false); // 관리: PIN 설정/변경
  const [pinInput, setPinInput] = useState('');

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((err) => console.error('[SermonNotes] 설정 로드 실패:', err));
  }, []);

  const loadNotes = () => {
    setLoading(true);
    listNotes()
      .then(setNotes)
      .catch((err) => {
        console.error('[SermonNotes] 목록 로드 실패:', err);
        toast('노트를 불러오지 못했습니다.');
      })
      .finally(() => setLoading(false));
  };

  const go = (v: View) => {
    setView(v);
    if (v === 'list') loadNotes();
  };

  const resetWrite = () => {
    setWWorship('');
    setWDate(todayStr());
    setWPassage('');
    setWContent('');
  };

  // 신규 작성 진입: 폼 초기화 + 잠금 초기값 = 현재 defaultLock
  const openWrite = () => {
    resetWrite();
    setEditingId(null);
    setEditingCreatedAt(null);
    setWLocked(settings.defaultLock);
    go('write');
  };

  // 수정 진입: 기존 노트 값을 폼에 채움 (id·createdAt 유지)
  const openEdit = (note: SermonNote) => {
    setEditingId(note.id);
    setEditingCreatedAt(note.createdAt);
    setWWorship(note.worship);
    setWDate(note.date);
    setWPassage(note.passage ?? '');
    setWContent(note.content);
    setWLocked(note.locked);
    setView('write');
  };

  // 상세 보기 진입
  const openDetail = (note: SermonNote) => {
    setDetailNote(note);
    setView('detail');
  };

  // 화면별 뒤로
  const goBack = () => {
    if (view === 'detail') {
      setDetailNote(null);
      go('list');
      return;
    }
    if (view === 'write' && editingId) {
      // 수정 취소 → 상세로 복귀
      setEditingId(null);
      setEditingCreatedAt(null);
      if (detailNote) {
        setView('detail');
        return;
      }
    }
    go('hub');
  };

  const handleSave = async () => {
    if (!wWorship) {
      toast('예배구분을 선택하세요.');
      return;
    }
    const content = wContent.trim();
    if (!content) {
      toast('내용을 입력하세요.');
      return;
    }
    if (wLocked && !settings.pinHash) {
      toast('먼저 관리에서 PIN을 설정하세요.');
      return;
    }
    setSaving(true);
    const now = Date.now();
    const note: SermonNote = {
      id: editingId ?? newId(),
      worship: wWorship,
      date: wDate,
      passage: wPassage.trim() || undefined,
      content,
      locked: wLocked,
      createdAt: editingId ? editingCreatedAt ?? now : now, // 수정 시 createdAt 유지
      updatedAt: now,
    };
    try {
      await saveNote(note);
      setNotes((prev) =>
        editingId ? prev.map((n) => (n.id === note.id ? note : n)) : prev
      );
      const wasEditing = editingId;
      resetWrite();
      setEditingId(null);
      setEditingCreatedAt(null);
      toast(wasEditing ? '수정되었습니다.' : '저장되었습니다.');
      if (wasEditing) {
        // 수정 → 갱신된 노트 상세로 복귀 (잠금 노트도 방금 편집했으니 열어둔 상태 유지)
        setUnlockedIds((prev) => new Set(prev).add(note.id));
        openDetail(note);
      } else {
        go('list');
      }
    } catch (err) {
      console.error('[SermonNotes] 저장 실패:', err);
      toast('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (note: SermonNote, afterDelete?: () => void) => {
    if (!window.confirm('이 노트를 삭제할까요? 되돌릴 수 없습니다.')) return;
    try {
      await deleteNote(note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      toast('삭제되었습니다.');
      afterDelete?.();
    } catch (err) {
      console.error('[SermonNotes] 삭제 실패:', err);
      toast('삭제에 실패했습니다.');
    }
  };

  // ── 개별 노트 공유·백업 시트 ──────────────────────────────────
  const handleShare = (note: SermonNote) => setSheetNote(note);

  const sheetShareText = async () => {
    if (!sheetNote) return;
    await shareOrCopy('설교노트', noteText(sheetNote));
    setSheetNote(null);
  };
  const sheetEmail = () => {
    if (!sheetNote) return;
    const subject = `설교노트 ${sheetNote.date} (${sheetNote.worship})`;
    location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      noteText(sheetNote)
    )}`;
    setSheetNote(null);
  };
  const sheetJsonOne = () => {
    if (!sheetNote) return;
    downloadFile(
      `설교노트-${sheetNote.date}-${sheetNote.worship}.json`,
      JSON.stringify({ version: 1, note: sheetNote }, null, 2),
      'application/json'
    );
    setSheetNote(null);
  };

  // ── 관리 ──────────────────────────────────────────────────────
  const backupAllJSON = async () => {
    setBusy(true);
    try {
      const all = await listNotes();
      downloadFile(
        `symusic-설교노트-${todayDownloadStr()}.json`,
        JSON.stringify(
          {
            app: 'Symusic 설교노트',
            version: 1,
            exportedAt: new Date().toISOString(),
            deviceId,
            notes: all,
          },
          null,
          2
        ),
        'application/json'
      );
    } catch (err) {
      console.error('[SermonNotes] 전체 백업 실패:', err);
      toast('백업에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const shareAllText = async () => {
    setBusy(true);
    try {
      const all = await listNotes();
      if (all.length === 0) {
        toast('내보낼 노트가 없습니다.');
        return;
      }
      await shareOrCopy('설교노트 모음', all.map(noteText).join('\n\n──────────\n\n'));
    } catch (err) {
      console.error('[SermonNotes] 전체 공유 실패:', err);
      toast('공유에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const restoreAll = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    let parsed: SermonNote[];
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data?.notes)) throw new Error('형식 오류');
      parsed = (data.notes as unknown[]).map(sanitizeNote);
    } catch (err) {
      console.error('[SermonNotes] 복원 파싱 실패:', err);
      toast('백업 파일 형식이 올바르지 않습니다.');
      return;
    }
    const merge = window.confirm(
      `백업 ${parsed.length}개를 불러옵니다.\n[확인] 기존과 합치기 / [취소] 덮어쓰기`
    );
    if (!merge && !window.confirm('기존 노트를 모두 지우고 덮어쓸까요? 되돌릴 수 없습니다.')) {
      return;
    }
    setBusy(true);
    try {
      if (!merge) {
        const existing = await listNotes();
        await Promise.all(existing.map((n) => deleteNote(n.id)));
      }
      await Promise.all(parsed.map((n) => saveNote(n)));
      toast('복원되었습니다.');
      go('list');
    } catch (err) {
      console.error('[SermonNotes] 복원 실패:', err);
      toast('복원에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const restoreByCode = async () => {
    const code = window.prompt('백업 코드(기기 ID)를 입력하세요.')?.trim();
    if (!code) return;
    if (code === deviceId) {
      toast('현재 기기의 코드입니다.');
      return;
    }
    setBusy(true);
    try {
      const incoming = await listNotesByDeviceId(code);
      if (incoming.length === 0) {
        toast('해당 코드의 노트를 찾지 못했습니다.');
        return;
      }
      await Promise.all(incoming.map((n) => saveNote({ ...n, id: newId() })));
      toast(`${incoming.length}개를 불러왔습니다.`);
      go('list');
    } catch (err) {
      console.error('[SermonNotes] 코드 복원 실패:', err);
      toast('복원에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const copyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(deviceId);
      toast('백업 코드를 복사했습니다.');
    } catch {
      toast('복사에 실패했습니다.');
    }
  };

  // ── 잠금 ──────────────────────────────────────────────────────
  // 관리: PIN 설정/변경 저장
  const submitPinSetup = async () => {
    if (!/^\d{4}$/.test(pinInput)) {
      toast('4자리 숫자를 입력하세요.');
      return;
    }
    try {
      const pinHash = await hashPin(pinInput);
      const next = { ...settings, pinHash };
      await saveSettings(next);
      setSettings(next);
      setPinSetupOpen(false);
      setPinInput('');
      toast('PIN이 저장되었습니다.');
    } catch (err) {
      console.error('[SermonNotes] PIN 저장 실패:', err);
      toast('PIN 저장에 실패했습니다.');
    }
  };

  // 관리: 기본 잠금 토글
  const toggleDefaultLock = async () => {
    if (!settings.defaultLock && !settings.pinHash) {
      toast('먼저 PIN을 설정하세요.');
      setPinSetupOpen(true);
      return;
    }
    const next = { ...settings, defaultLock: !settings.defaultLock };
    try {
      await saveSettings(next);
      setSettings(next);
    } catch (err) {
      console.error('[SermonNotes] 기본 잠금 저장 실패:', err);
      toast('저장에 실패했습니다.');
    }
  };

  // 목록: 잠긴 노트 탭 → PIN 입력 모달
  const submitPinUnlock = async () => {
    if (!pinModalNote) return;
    try {
      const h = await hashPin(pinInput);
      if (h === settings.pinHash) {
        const target = pinModalNote;
        setUnlockedIds((prev) => new Set(prev).add(target.id));
        setPinModalNote(null);
        setPinInput('');
        openDetail(target); // 잠금 해제 후 상세 화면으로
      } else {
        toast('PIN이 일치하지 않습니다.');
      }
    } catch (err) {
      console.error('[SermonNotes] PIN 확인 실패:', err);
      toast('확인에 실패했습니다.');
    }
  };

  // PIN 재설정: 잠금만 해제(노트 삭제 없음) — 모든 노트 locked=false + 설정 초기화
  const resetPin = async () => {
    if (!window.confirm('잠금만 해제되고 노트는 삭제되지 않습니다. 계속할까요?')) return;
    try {
      const all = await listNotes();
      await Promise.all(
        all.filter((n) => n.locked).map((n) => saveNote({ ...n, locked: false }))
      );
      const next: SermonNoteSettings = { defaultLock: false, pinHash: null };
      await saveSettings(next);
      setSettings(next);
      setNotes((prev) => prev.map((n) => ({ ...n, locked: false })));
      setPinModalNote(null);
      setPinInput('');
      toast('잠금이 모두 해제되었습니다.');
    } catch (err) {
      console.error('[SermonNotes] PIN 재설정 실패:', err);
      toast('잠금 해제에 실패했습니다.');
    }
  };

  const shown = notes
    .filter((n) => filter === '전체' || n.worship === filter)
    .filter((n) => !filterDate || n.date === filterDate);

  return (
    <div className="flex min-h-full w-full max-w-full flex-1 flex-col overflow-x-hidden bg-black text-white">
      {/* 서브 헤더: 뒤로 버튼 (허브·작성 제외) — 작성 화면은 날짜 줄에 합침 */}
      {view !== 'hub' && view !== 'write' && (
        <div className="flex items-center px-3 pt-2">
          <BackBtn onClick={goBack} />
        </div>
      )}

      <div className="mx-auto w-full min-w-0 max-w-[680px] flex-1 overflow-x-hidden px-4 pb-4 pt-1">
        {/* ===== 허브 ===== */}
        {view === 'hub' && (
          <div className="mt-1 flex flex-col gap-3">
            <HubCard
              icon={<Pencil className="h-5 w-5" />}
              iconBg="rgba(45,212,191,.15)"
              iconColor={TEAL}
              title="새 노트 작성"
              desc="오늘 들은 말씀을 기록"
              onClick={openWrite}
            />
            <HubCard
              icon={<BookCopy className="h-5 w-5" />}
              iconBg="rgba(95,168,255,.15)"
              iconColor="#5fa8ff"
              title="목록 보기"
              desc="날짜·예배별로 지난 노트 확인"
              onClick={() => go('list')}
            />
            <HubCard
              icon={<Settings className="h-5 w-5" />}
              iconBg="rgba(232,194,74,.15)"
              iconColor={GOLD}
              title="관리"
              desc="전체 백업 · 복원 · 백업 코드"
              onClick={() => go('manage')}
            />
          </div>
        )}

        {/* ===== 새 노트 작성 ===== */}
        {view === 'write' && (
          <div>
            {/* [‹ 뒤로] + 날짜(탭해서 변경) + 예배구분(필수 드롭다운) — 한 줄 */}
            <div className="mb-3 flex items-stretch gap-2">
              <BackBtn onClick={goBack} />
              <input
                type="date"
                value={wDate}
                onChange={(e) => setWDate(e.target.value)}
                aria-label="날짜 (탭해서 변경)"
                className="block min-w-0 flex-[3] rounded-xl px-3 py-3 text-[15px] text-white outline-none"
                style={{ background: CARD, border: `1px solid ${LINE}`, boxSizing: 'border-box' }}
              />
              <select
                value={wWorship}
                onChange={(e) => setWWorship(e.target.value as Worship)}
                aria-label="예배구분 (필수)"
                className="block min-w-0 flex-[2] rounded-xl px-3 py-3 text-[15px] outline-none"
                style={{
                  background: CARD,
                  border: `1px solid ${wWorship ? LINE : TEAL}`,
                  color: wWorship ? '#fff' : MUTED,
                  boxSizing: 'border-box',
                }}
              >
                <option value="" disabled style={{ background: CARD, color: MUTED }}>
                  예배구분 *
                </option>
                {WORSHIPS.map((w) => (
                  <option key={w} value={w} style={{ background: CARD, color: '#fff' }}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            {/* 본문: 탭하면 성경말씀 선택 오버레이, 직접 수정도 허용 */}
            <input
              ref={passageRef}
              type="text"
              value={wPassage}
              onChange={(e) => setWPassage(e.target.value)}
              onFocus={() => setPassagePickerOpen(true)}
              onClick={() => setPassagePickerOpen(true)}
              placeholder="본문 (선택, 탭하여 성경에서 고르기 · 예: 고전 3:1-5)"
              className="mb-2.5 block w-full min-w-0 max-w-full rounded-xl px-3.5 py-3 text-[15px] text-white outline-none placeholder:text-white/35"
              style={{ background: CARD, border: `1px solid ${LINE}`, boxSizing: 'border-box' }}
            />
            <textarea
              value={wContent}
              onChange={(e) => setWContent(e.target.value)}
              placeholder="설교를 들으며 받은 은혜와 적용할 점을 자유롭게 기록하세요…"
              className="block w-full min-w-0 max-w-full resize-none rounded-xl p-4 text-white outline-none placeholder:text-white/35"
              style={{
                background: CARD,
                border: `1px solid ${LINE}`,
                fontSize: 16,
                lineHeight: 1.75,
                minHeight: 360,
                boxSizing: 'border-box',
                touchAction: 'pan-y',
                overscrollBehavior: 'contain',
              }}
            />
            {/* 잠금 토글 */}
            <button
              type="button"
              onClick={() => setWLocked((v) => !v)}
              className="mt-2.5 flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-[15px]"
              style={{ background: CARD, border: `1px solid ${wLocked ? TEAL : LINE}` }}
            >
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4" style={{ color: wLocked ? TEAL : MUTED }} />
                노트 잠금
              </span>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{
                  background: wLocked ? TEAL : 'transparent',
                  color: wLocked ? '#04221e' : MUTED,
                  border: wLocked ? 'none' : `1px solid ${LINE}`,
                }}
              >
                {wLocked ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-3 w-full rounded-xl py-3.5 text-base font-bold disabled:opacity-60"
              style={{ background: TEAL_GRAD, color: '#04221e' }}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        )}

        {/* ===== 목록 보기 ===== */}
        {view === 'list' && (
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              {(['전체', ...WORSHIPS] as const).map((f) => (
                <Chip key={f} small active={filter === f} onClick={() => setFilter(f)}>
                  {f}
                </Chip>
              ))}
            </div>
            <div className="mb-2 flex items-center gap-2">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="rounded-full px-3 py-1.5 text-[13px] text-white outline-none"
                style={{ background: CARD, border: `1px solid ${LINE}` }}
              />
              <Chip small active={false} onClick={() => setFilterDate('')}>
                날짜 초기화
              </Chip>
            </div>

            {loading ? (
              <p className="py-12 text-center text-sm" style={{ color: MUTED }}>
                불러오는 중…
              </p>
            ) : shown.length === 0 ? (
              <p
                className="px-3 py-12 text-center text-sm leading-relaxed"
                style={{ color: MUTED }}
              >
                기록이 없습니다.
                <br />
                필터를 바꾸거나 새 노트를 작성하세요.
              </p>
            ) : (
              shown.map((n) => (
                <div
                  key={n.id}
                  className="mb-2.5 rounded-xl p-3.5"
                  style={{ background: CARD, border: `1px solid ${LINE}` }}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="rounded px-2 py-0.5 text-[11px] font-bold"
                      style={{ background: isGold(n.worship) ? GOLD : TEAL, color: '#04221e' }}
                    >
                      {n.worship}
                    </span>
                    <span className="flex-1 text-xs" style={{ color: MUTED }}>
                      {n.date}
                      {n.passage ? ` · ${n.passage}` : ''}
                    </span>
                  </div>
                  {n.locked && !unlockedIds.has(n.id) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPinInput('');
                        setPinModalNote(n);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg py-3 text-[15px] text-[#cfcfcf] hover:bg-white/5"
                    >
                      <Lock className="h-4 w-4" style={{ color: MUTED }} />
                      잠긴 노트 · 탭하여 PIN 입력
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openDetail(n)}
                      className="block w-full text-left"
                    >
                      <p className="line-clamp-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[#e6e6e6]">
                        {n.content}
                      </p>
                      <span className="mt-1 block text-xs" style={{ color: MUTED }}>
                        탭하여 전체 보기
                      </span>
                    </button>
                  )}
                  <div
                    className="mt-3 flex gap-2 pt-2.5"
                    style={{ borderTop: `1px solid ${LINE}` }}
                  >
                    <button
                      type="button"
                      onClick={() => handleShare(n)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] text-[#cfcfcf] hover:bg-white/5 hover:text-white"
                      style={{ border: `1px solid ${LINE}` }}
                    >
                      <Share2 className="h-4 w-4" /> 공유·백업
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(n)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] hover:bg-white/5"
                      style={{ border: `1px solid ${LINE}`, color: '#ef6b6b' }}
                    >
                      <Trash2 className="h-4 w-4" /> 삭제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== 노트 상세/읽기 ===== */}
        {view === 'detail' && detailNote && (
          <div>
            {/* 제목 영역: 예배 태그 · 날짜 · 본문 */}
            <div className="mb-3 flex items-center gap-2">
              <span
                className="rounded px-2 py-0.5 text-[11px] font-bold"
                style={{
                  background: isGold(detailNote.worship) ? GOLD : TEAL,
                  color: '#04221e',
                }}
              >
                {detailNote.worship}
              </span>
              <span className="flex-1 text-xs" style={{ color: MUTED }}>
                {detailNote.date}
                {detailNote.passage ? ` · ${detailNote.passage}` : ''}
              </span>
            </div>

            {/* 전체 내용 (잘림 없이) */}
            <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-[#e6e6e6]">
              {detailNote.content}
            </p>

            {/* 동작: 수정 / 공유·백업 / 삭제 */}
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => openEdit(detailNote)}
                className="w-full rounded-xl py-3 text-[15px] font-bold"
                style={{ background: TEAL_GRAD, color: '#04221e' }}
              >
                수정
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleShare(detailNote)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] text-[#cfcfcf] hover:bg-white/5 hover:text-white"
                  style={{ background: CARD, border: `1px solid ${LINE}` }}
                >
                  <Share2 className="h-4 w-4" /> 공유·백업
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(detailNote, () => go('list'))}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] hover:bg-white/5"
                  style={{ background: CARD, border: `1px solid ${LINE}`, color: '#ef6b6b' }}
                >
                  <Trash2 className="h-4 w-4" /> 삭제
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== 관리 ===== */}
        {view === 'manage' && (
          <div>
            <div className="flex flex-col gap-2.5">
              <ManageBtn
                icon="📥"
                title="전체 백업 (파일로 저장)"
                desc="모든 노트를 JSON 파일로 내려받아 안전 보관"
                disabled={busy}
                onClick={backupAllJSON}
              />
              <ManageBtn
                icon="📤"
                title="전체 복원 (파일에서 불러오기)"
                desc="백업 파일 선택 → 합치기 / 덮어쓰기"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              />
              <ManageBtn
                icon="🔑"
                title="백업 코드로 복원"
                desc="다른 기기의 백업 코드로 노트 가져오기"
                disabled={busy}
                onClick={restoreByCode}
              />
              <ManageBtn
                icon="📤"
                title="전체 텍스트로 공유"
                desc="모든 노트를 텍스트로 한 번에 내보내기"
                disabled={busy}
                onClick={shareAllText}
              />
            </div>

            {/* 잠금 설정 */}
            <div className="mt-2.5 flex flex-col gap-2.5">
              <ManageBtn
                icon="🔒"
                title={`PIN ${settings.pinHash ? '변경' : '설정'}`}
                desc="4자리 숫자로 잠긴 노트를 가립니다"
                onClick={() => {
                  setPinInput('');
                  setPinSetupOpen(true);
                }}
              />
              <button
                type="button"
                onClick={toggleDefaultLock}
                className="flex w-full items-center justify-between rounded-xl p-4 text-left text-[15px] text-[#e6e6e6] transition-colors hover:bg-[#1c1c1c]"
                style={{ background: CARD, border: `1px solid ${LINE}` }}
              >
                <span>
                  기본 잠금
                  <small className="mt-0.5 block text-xs" style={{ color: MUTED }}>
                    켜면 새 노트가 기본으로 잠깁니다
                  </small>
                </span>
                <span
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-bold"
                  style={{
                    background: settings.defaultLock ? TEAL : 'transparent',
                    color: settings.defaultLock ? '#04221e' : MUTED,
                    border: settings.defaultLock ? 'none' : `1px solid ${LINE}`,
                  }}
                >
                  {settings.defaultLock ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            {/* 백업 코드 박스 (gold 톤) */}
            <div
              className="mt-3 rounded-xl p-3.5 text-[12.5px] leading-relaxed"
              style={{
                background: 'rgba(232,194,74,.08)',
                border: '1px solid rgba(232,194,74,.3)',
                color: GOLD,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0">🔑 내 백업 코드</span>
                <code className="min-w-0 flex-1 truncate rounded bg-black px-2 py-1 text-white">
                  {deviceId}
                </code>
                <button
                  type="button"
                  onClick={copyDeviceId}
                  aria-label="백업 코드 복사"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"
                  style={{ border: `1px solid rgba(232,194,74,.3)` }}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2">
                분실 시 복구 불가. 중요한 노트는 이메일/파일로 백업해두세요.
              </p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={restoreAll}
            />
          </div>
        )}
      </div>

      {/* 개별 노트 공유·백업 액션 시트 (하단에서 올라옴) */}
      {sheetNote && (
        <div
          className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/60"
          onClick={() => setSheetNote(null)}
        >
          <div
            className="rounded-t-2xl px-4 pb-5 pt-2.5"
            style={{ background: '#1b1b1b', borderTop: `1px solid ${LINE}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="py-2.5 text-center text-[13px] font-medium" style={{ color: MUTED }}>
              {sheetNote.date} {sheetNote.worship}
            </h3>
            <SheetBtn onClick={sheetShareText}>📤 텍스트로 공유 / 복사</SheetBtn>
            <SheetBtn onClick={sheetEmail}>✉️ 이메일로 보내기</SheetBtn>
            <SheetBtn onClick={sheetJsonOne}>📥 이 노트 백업 (JSON 파일)</SheetBtn>
            <button
              type="button"
              onClick={() => setSheetNote(null)}
              className="w-full py-3 text-center text-sm"
              style={{ color: '#888' }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* PIN 설정/변경 모달 (관리) */}
      {pinSetupOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-6"
          onClick={() => {
            setPinSetupOpen(false);
            setPinInput('');
          }}
        >
          <div
            className="w-full max-w-xs rounded-2xl p-5"
            style={{ background: '#1b1b1b', border: `1px solid ${LINE}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-center text-base font-bold">
              PIN {settings.pinHash ? '변경' : '설정'}
            </h3>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4자리 숫자"
              className="w-full rounded-xl px-3.5 py-3 text-center text-lg tracking-[0.5em] text-white outline-none placeholder:tracking-normal placeholder:text-white/35"
              style={{ background: CARD, border: `1px solid ${LINE}` }}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPinSetupOpen(false);
                  setPinInput('');
                }}
                className="flex-1 rounded-xl py-3 text-sm text-white"
                style={{ background: CARD, border: `1px solid ${LINE}` }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitPinSetup}
                className="flex-1 rounded-xl py-3 text-sm font-bold"
                style={{ background: TEAL_GRAD, color: '#04221e' }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN 입력 모달 (잠긴 노트 열기) */}
      {pinModalNote && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-6"
          onClick={() => {
            setPinModalNote(null);
            setPinInput('');
          }}
        >
          <div
            className="w-full max-w-xs rounded-2xl p-5"
            style={{ background: '#1b1b1b', border: `1px solid ${LINE}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="flex items-center justify-center gap-1.5 text-base font-bold">
              <Lock className="h-4 w-4" style={{ color: TEAL }} /> 잠긴 노트
            </h3>
            <p className="mt-1 text-center text-xs" style={{ color: MUTED }}>
              {pinModalNote.date} {pinModalNote.worship}
            </p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitPinUnlock();
              }}
              placeholder="PIN 4자리"
              className="mt-3 w-full rounded-xl px-3.5 py-3 text-center text-lg tracking-[0.5em] text-white outline-none placeholder:tracking-normal placeholder:text-white/35"
              style={{ background: CARD, border: `1px solid ${LINE}` }}
            />
            <button
              type="button"
              onClick={submitPinUnlock}
              className="mt-3 w-full rounded-xl py-3 text-sm font-bold"
              style={{ background: TEAL_GRAD, color: '#04221e' }}
            >
              확인
            </button>
            <button
              type="button"
              onClick={resetPin}
              className="mt-2 w-full py-2 text-center text-xs"
              style={{ color: GOLD }}
            >
              PIN 재설정 (전체 잠금 해제)
            </button>
            <button
              type="button"
              onClick={() => {
                setPinModalNote(null);
                setPinInput('');
              }}
              className="w-full py-1.5 text-center text-xs"
              style={{ color: '#888' }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 본문 성경말씀 선택 오버레이 */}
      {passagePickerOpen && (
        <BiblePassagePicker
          onClose={closePassagePicker}
          onSelect={(passage) => setWPassage(passage)}
        />
      )}
    </div>
  );
}

// ── 하위 표현 컴포넌트 ──────────────────────────────────────────

// 뒤로 버튼: 카드색 배경 + 테두리 + 또렷한 흰색 아이콘 (버튼임이 분명하게)
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="뒤로"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 active:bg-white/15"
      style={{ background: CARD, border: `1px solid ${LINE}` }}
    >
      <ChevronLeft className="h-7 w-7" />
    </button>
  );
}

function HubCard({
  icon,
  iconBg,
  iconColor,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3.5 rounded-2xl p-5 text-left transition-colors hover:bg-[#1c1c1c]"
      style={{ background: CARD, border: `1px solid ${LINE}` }}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </span>
      <span>
        <b className="text-[17px] font-bold">{title}</b>
        <small className="mt-0.5 block text-xs" style={{ color: MUTED }}>
          {desc}
        </small>
      </span>
    </button>
  );
}

function ManageBtn({
  icon,
  title,
  desc,
  disabled,
  onClick,
}: {
  icon: string;
  title: string;
  desc: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-xl p-4 text-left text-[15px] text-[#e6e6e6] transition-colors hover:bg-[#1c1c1c] disabled:opacity-50"
      style={{ background: CARD, border: `1px solid ${LINE}` }}
    >
      <span className="shrink-0 text-xl" aria-hidden>
        {icon}
      </span>
      <span>
        {title}
        <small className="mt-0.5 block text-xs" style={{ color: MUTED }}>
          {desc}
        </small>
      </span>
    </button>
  );
}

function SheetBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-2 w-full rounded-xl py-3.5 text-center text-[15px] text-white"
      style={{ background: CARD, border: `1px solid ${LINE}` }}
    >
      {children}
    </button>
  );
}

function Chip({
  active,
  small,
  onClick,
  children,
}: {
  active: boolean;
  small?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full font-medium transition-colors ${
        small ? 'px-3 py-1.5 text-[13px]' : 'px-4 py-2 text-sm'
      } ${active ? 'font-bold' : 'text-[#ddd] hover:bg-white/5'}`}
      style={{
        background: active ? TEAL : CARD,
        border: `1px solid ${active ? TEAL : LINE}`,
        color: active ? '#04221e' : undefined,
      }}
    >
      {children}
    </button>
  );
}
