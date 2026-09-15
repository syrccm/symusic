// daylong 화면 공통 표시 유틸 — 원화·날짜·월 포맷, 월 열 계산, 날짜 이동, 거래 설명, Firestore 오류 문구.
// DaylongPage 와 daylong/ 하위 컴포넌트가 함께 쓴다.
import { DUES_CATEGORY, isDuesPayment, type DaylongTransaction } from '@/types/daylong';

export function formatWon(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 'YYYY-MM-DD' → 'YY.MM.DD'. 형식이 다르면 원문 그대로. */
export function formatDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : date || '-';
}

/** 'YYYY-MM-DD' → 'YYYY.MM.DD'. 형식이 다르면 원문 그대로. */
export function formatDateFull(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : date || '-';
}

/** 'YYYY-MM-DD' → 'MM.DD'. 형식이 다르면 빈 문자열. */
export function formatDayShort(date: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[1]}.${m[2]}` : '';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 오늘(로컬) 'YYYY-MM-DD' */
export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** 이번 달(로컬) 'YYYY-MM' */
export function thisMonth(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

/** 'YYYY-MM' → '2026년 9월' */
export function formatMonth(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  return m ? `${m[1]}년 ${Number(m[2])}월` : month;
}

/** 'YYYY-MM' 에 delta 개월 더하기. 형식이 다르면 이번 달 기준. */
export function shiftMonth(month: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const base = m ? new Date(Number(m[1]), Number(m[2]) - 1 + delta, 1) : new Date();
  return `${base.getFullYear()}-${pad2(base.getMonth() + 1)}`;
}

/** 'YYYY-MM-DD' 에 delta 개월 더하기(말일 초과는 그 달 말일로). 형식이 다르면 오늘 기준. */
export function shiftDateMonths(date: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const y = m ? Number(m[1]) : new Date().getFullYear();
  const mo = m ? Number(m[2]) - 1 : new Date().getMonth();
  const d = m ? Number(m[3]) : new Date().getDate();
  const first = new Date(y, mo + delta, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${first.getFullYear()}-${pad2(first.getMonth() + 1)}-${pad2(day)}`;
}

export interface MonthCol {
  key: string; // 'YYYY-MM'
  label: string; // 올해는 'M월', 다른 해는 'YY.MM'
  /** 표의 기준(중앙) 월 */
  isSelected: boolean;
  /** 실제 이번 달 */
  isCurrent: boolean;
}

/** 선택 월을 중앙에 두고 앞 before 개월·뒤 after 개월, 오래된 → 최신 순. */
export function monthsAround(selected: string, before = 2, after = 2, now = new Date()): MonthCol[] {
  const current = thisMonth(now);
  const cols: MonthCol[] = [];
  for (let i = -before; i <= after; i++) {
    const key = shiftMonth(selected, i);
    const yy = Number(key.slice(0, 4));
    const mm = Number(key.slice(5, 7));
    cols.push({
      key,
      label: yy === now.getFullYear() ? `${mm}월` : `${String(yy).slice(2)}.${pad2(mm)}`,
      isSelected: i === 0,
      isCurrent: key === current,
    });
  }
  return cols;
}

/** 거래 한 줄 설명: 회비는 `${회원명} (정기회비)`(메모가 있으면 ' · 메모'), 그 외는 `${memo} (${category})`. */
export function describeTransaction(t: DaylongTransaction, memberName: Map<string, string>): string {
  if (isDuesPayment(t)) {
    const name = memberName.get(t.memberId!) ?? '(알 수 없음)';
    const base = `${name} (${DUES_CATEGORY})`;
    return t.memo ? `${base} · ${t.memo}` : base;
  }
  const memo = t.memo || (t.type === 'in' ? '입금' : '출금');
  return t.category ? `${memo} (${t.category})` : memo;
}

/**
 * Firestore 오류 → 사용자 안내 문구.
 * MusicPlayer 의 permission-denied / unavailable 매핑과 같은 톤. 읽기·쓰기 양쪽에서 사용.
 */
export function describeFirestoreError(err: unknown, fallback = '오류가 발생했습니다.'): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === 'permission-denied') return 'Firebase 권한이 없습니다. 관리자 로그인 상태와 접근 규칙을 확인하세요.';
  if (e?.code === 'unavailable') return 'Firebase 서버에 연결할 수 없습니다. 네트워크를 확인하세요.';
  return e?.message ? `${fallback} ${e.message}` : fallback;
}

/** 읽기 전용 화면용(STEP 1 문구 유지): 권한 오류는 "접근 권한 설정" 안내. */
export function describeReadError(err: { code?: string; message?: string }): string {
  if (err.code === 'permission-denied') return '접근 권한 설정이 필요합니다. 관리자에게 문의하세요.';
  if (err.code === 'unavailable') return 'Firebase 서버에 연결할 수 없습니다. 네트워크를 확인하세요.';
  return `불러오는 중 오류가 발생했습니다. ${err.message ?? ''}`.trim();
}
