// 설교녹음 — Cloudflare R2(S3 호환) 비공개 버킷 접근. SigV4 서명은 aws4fetch 로 한다.
// - 환경변수(서버 전용): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
// - 이 모듈이 다루는 키는 recordings/ 아래의 정해진 이름 형식뿐이다(아래 정규식). 다른 키는 목록에도 넣지 않고 서명도 하지 않는다.
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
