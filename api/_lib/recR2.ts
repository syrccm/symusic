// 설교녹음 — Cloudflare R2(S3 호환) 비공개 버킷 접근. SigV4 서명은 aws4fetch 로 한다.
// - 환경변수(서버 전용): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
// - 이 모듈이 다루는 키는 recordings/ 아래의 정해진 이름 형식(아래 정규식)과 예약 기능의 고정 키 3개(파일 아래쪽)뿐이다.
//   다른 키는 목록에도 넣지 않고 서명도 하지 않는다.
import { AwsClient } from 'aws4fetch';

// 녹음 워크플로가 만드는 키: recordings/{YYYY-MM-DD}_{HHMM}_{session_id}.mp3 | .json
const KEY_BODY = String.raw`recordings/(\d{4}-\d{2}-\d{2})_(\d{4})_[A-Za-z0-9_-]{1,64}`;
export const MP3_KEY_RE = new RegExp(`^${KEY_BODY}\\.mp3$`);
const JSON_KEY_RE = new RegExp(`^${KEY_BODY}\\.json$`);

const PRESIGN_SECONDS = 600; // 다운로드 URL 만료 10분
const LIST_LIMIT = 60; // 수명 주기 7일이라 넉넉한 상한

function config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET 환경변수가 설정되지 않았습니다.');
  }
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto', retries: 2 });
  const base = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
  return { client, base };
}

export interface RecItem {
  key: string;
  title: string;
  startedAt: string;
  durationSec: number;
  bytes: number;
  sessionId: string;
}

/** recordings/ 의 사이드카(.json)를 읽어 녹음 목록을 최신순으로 돌려준다. */
export async function listRecordings(): Promise<RecItem[]> {
  const { client, base } = config();
  const res = await client.fetch(`${base}?list-type=2&prefix=${encodeURIComponent('recordings/')}&max-keys=1000`);
  if (!res.ok) throw new Error(`R2 목록 조회 실패 (HTTP ${res.status})`);
  const xml = await res.text();

  const jsonKeys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)]
    .map((m) => m[1])
    .filter((key) => JSON_KEY_RE.test(key))
    .sort()
    .reverse() // 키가 날짜_시각으로 시작하므로 역순 = 최신순
    .slice(0, LIST_LIMIT);

  const items = await Promise.all(
    jsonKeys.map(async (jsonKey): Promise<RecItem | null> => {
      try {
        const r = await client.fetch(`${base}/${jsonKey}`);
        if (!r.ok) return null;
        const raw = (await r.json()) as Record<string, unknown>;
        return {
          // 다운로드 키는 사이드카 내용이 아니라 사이드카 자신의 키에서 만든다(내용은 믿지 않는다).
          key: jsonKey.replace(/\.json$/, '.mp3'),
          title: typeof raw.title === 'string' ? raw.title.slice(0, 200) : '',
          startedAt: typeof raw.started_at === 'string' ? raw.started_at.slice(0, 40) : '',
          durationSec: Number.isFinite(Number(raw.duration_sec)) ? Number(raw.duration_sec) : 0,
          bytes: Number.isFinite(Number(raw.bytes)) ? Number(raw.bytes) : 0,
          sessionId: typeof raw.session_id === 'string' ? raw.session_id.slice(0, 64) : '',
        };
      } catch {
        return null; // 깨진 사이드카 하나 때문에 목록 전체가 실패하지 않게
      }
    }),
  );
  return items.filter((item): item is RecItem => item !== null);
}

/**
 * mp3 키의 다운로드용 presigned GET URL(10분). 키 형식이 맞지 않으면 null.
 * 파일 이름은 `설교_YYYY-MM-DD_HHmm.mp3` 로 내려받게 한다.
 */
export async function presignDownload(key: string): Promise<string | null> {
  const m = MP3_KEY_RE.exec(key);
  if (!m) return null;
  const { client, base } = config();
  const name = `${m[1]}_${m[2]}.mp3`;
  const url = new URL(`${base}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(PRESIGN_SECONDS));
  url.searchParams.set(
    'response-content-disposition',
    // 공백 없이 쓴다 — 쿼리의 공백은 '+' 로 실려 서버 쪽 서명 재계산과 어긋날 수 있다.
    `attachment;filename="sermon_${name}";filename*=UTF-8''${encodeURIComponent('설교_')}${name}`,
  );
  const signed = await client.sign(url.toString(), { method: 'GET', aws: { signQuery: true } });
  return signed.url;
}

// ── 예약 기능의 JSON 파일 3개 ─────────────────────────────────────
// 키는 아래 상수뿐이다. 요청에서 온 값으로 키를 만들지 않는다(형식은 녹음 리포 README "R2 에 있는 파일").
const RESERVATIONS_KEY = 'reservations.json'; // 앱이 쓰고 발사기가 읽는다(발사기도 실행 기록을 쓴다)
const UPCOMING_KEY = 'upcoming.json'; // 발사기가 쓰고 앱이 읽는다
const STATE_KEY = 'state/current.json'; // 녹음 러너가 쓰고 앱이 읽는다
type FixedKey = typeof RESERVATIONS_KEY | typeof UPCOMING_KEY | typeof STATE_KEY;

const YT_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const str = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');

/** 고정 키의 JSON 객체를 읽는다. 객체가 없으면(404) null, 그 밖의 오류·형식 오류는 던진다. */
async function getJson(key: FixedKey): Promise<{ data: Record<string, unknown>; etag: string | null } | null> {
  const { client, base } = config();
  const res = await client.fetch(`${base}/${key}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 읽기 실패 (${key}, HTTP ${res.status})`);
  const data: unknown = await res.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`R2 파일 형식 오류 (${key})`);
  return { data: data as Record<string, unknown>, etag: res.headers.get('etag') };
}

export interface ReservationsFile {
  /** 파일 전체(items 밖의 키를 보존해 다시 쓰기 위함) */
  doc: Record<string, unknown>;
  items: unknown[];
  /** 조건부 쓰기용. 파일이 없으면 null */
  etag: string | null;
}

/** reservations.json 을 읽는다. 없으면 빈 목록. items 배열이 없는 파일은 덮어쓰지 않도록 오류로 던진다. */
export async function readReservations(): Promise<ReservationsFile> {
  const got = await getJson(RESERVATIONS_KEY);
  if (!got) return { doc: {}, items: [], etag: null };
  if (!Array.isArray(got.data.items)) throw new Error('reservations.json 형식 오류 (items 배열 없음)');
  return { doc: got.data, items: got.data.items, etag: got.etag };
}

/**
 * reservations.json 을 쓴다. etag 가 있으면 If-Match 조건부 PUT — 읽은 뒤 발사기가 파일을 바꿨으면 412 가 되고 false 를 돌려준다.
 * (aws4fetch 는 If-Match 를 서명에 포함해 그대로 보낸다)
 */
export async function writeReservations(doc: Record<string, unknown>, items: unknown[], etag: string | null): Promise<boolean> {
  const { client, base } = config();
  const res = await client.fetch(`${base}/${RESERVATIONS_KEY}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(etag ? { 'If-Match': etag } : {}),
    },
    body: `${JSON.stringify({ ...doc, items }, null, 2)}\n`,
  });
  if (res.status === 412) return false;
  if (!res.ok) throw new Error(`R2 쓰기 실패 (${RESERVATIONS_KEY}, HTTP ${res.status})`);
  return true;
}

export interface UpcomingItem {
  video_id: string;
  title: string;
  /** KST ISO 8601. 예정 시각을 얻지 못한 영상은 null */
  scheduled_at: string | null;
  status: 'upcoming' | 'live';
}

/** upcoming.json 을 읽어 필요한 필드만 돌려준다. 없으면 빈 목록. */
export async function readUpcoming(): Promise<{ updated_at: string | null; items: UpcomingItem[] }> {
  const got = await getJson(UPCOMING_KEY);
  if (!got) return { updated_at: null, items: [] };
  const rawItems = Array.isArray(got.data.items) ? (got.data.items as unknown[]) : [];
  const items: UpcomingItem[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as Record<string, unknown>;
    if (typeof it.video_id !== 'string' || !YT_VIDEO_ID_RE.test(it.video_id)) continue;
    items.push({
      video_id: it.video_id,
      title: str(it.title, 200),
      scheduled_at: str(it.scheduled_at, 40) || null,
      status: it.status === 'live' ? 'live' : 'upcoming',
    });
  }
  return { updated_at: str(got.data.updated_at, 40) || null, items };
}

export interface RecState {
  phase: 'waiting' | 'recording';
  session_id: string;
  title: string;
  video_id: string | null;
  started_at: string;
}

/** state/current.json 을 읽는다. 없거나 phase 를 알 수 없으면 null. */
export async function readState(): Promise<RecState | null> {
  const got = await getJson(STATE_KEY);
  if (!got) return null;
  const { phase } = got.data;
  if (phase !== 'waiting' && phase !== 'recording') return null;
  return {
    phase,
    session_id: str(got.data.session_id, 64),
    title: str(got.data.title, 200),
    video_id: typeof got.data.video_id === 'string' && YT_VIDEO_ID_RE.test(got.data.video_id) ? got.data.video_id : null,
    started_at: str(got.data.started_at, 40),
  };
}
