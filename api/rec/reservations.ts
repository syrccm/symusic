// GET  /api/rec/reservations → { items }
// POST /api/rec/reservations { action: "add", item } | { action: "remove", id } → { items }
// R2 의 reservations.json(녹음 리포 README 형식)을 읽고 고친다. 발사기도 같은 파일에 실행 기록을 쓰므로:
// - 저장할 때마다 최신본을 다시 읽어 그 위에 변경을 적용하고, If-Match(ETag) 조건부 PUT 으로 쓴다.
//   그 사이 파일이 바뀌었으면(412) 한 번 다시 시도하고, 또 실패하면 409.
// - 기존 항목은 손대지 않고 그대로 돌려 쓴다(발사기 소유 필드 dispatched_at 등을 지우면 같은 예약이 다시 실행된다).
// - 추가하는 항목은 받은 객체를 그대로 쓰지 않고 검증한 값으로 새로 만든다. id 는 서버가 만든다.
import { randomInt } from 'node:crypto';
import { failUpstream, readBody, recGuard, type ApiReq, type ApiRes } from '../_lib/recAuth.js';
import { readReservations, writeReservations } from '../_lib/recR2.js';

type Item = Record<string, unknown>;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/; // 시간대가 붙은 ISO 8601
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TZ = 'Asia/Seoul';
const TITLE_MAX = 100;
const MAX_ITEMS = 50;
// 녹음 워크플로(record.yml)의 제한: 대기는 180분까지, 대기 + 녹음은 330분까지. 넘으면 러너가 말없이 줄이므로 여기서 거부한다.
const WAIT_MAX = 180;
const TOTAL_MAX = 330;
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

const isItem = (value: unknown): value is Item => !!value && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');

/** 화면에 필요한 필드만 골라 돌려준다. id·kind 를 알 수 없는 항목은 뺀다(파일에는 그대로 남는다). */
function view(items: unknown[]) {
  return items
    .filter(isItem)
    .filter((it) => typeof it.id === 'string' && ID_RE.test(it.id) && (it.kind === 'video' || it.kind === 'weekly'))
    .map((it) => ({
      id: it.id,
      kind: it.kind,
      title: str(it.title, 200),
      video_id: typeof it.video_id === 'string' && VIDEO_ID_RE.test(it.video_id) ? it.video_id : null,
      scheduled_at: str(it.scheduled_at, 40) || null,
      weekday: typeof it.weekday === 'number' ? it.weekday : null,
      time: str(it.time, 5) || null,
      dispatched_at: str(it.dispatched_at, 40) || null,
    }));
}

/** 정수이고 범위 안이면 그 값, 값이 없으면 기본값, 그 밖에는 null(오류) */
function minutes(value: unknown, fallback: number, min: number, max: number): number | null {
  if (value === undefined || value === null) return fallback;
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/** `v-YYYYMMDD-xxxx` / `w-YYYYMMDD-xxxx` (KST 날짜 + 무작위 4자). 목록 안에서 겹치지 않을 때까지 다시 뽑는다. */
function newId(prefix: 'v' | 'w', existing: Item[]): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
  const date = `${kst.slice(0, 4)}${kst.slice(5, 7)}${kst.slice(8, 10)}`;
  for (;;) {
    let suffix = '';
    for (let i = 0; i < 4; i += 1) suffix += ID_CHARS[randomInt(ID_CHARS.length)];
    const id = `${prefix}-${date}-${suffix}`;
    if (!existing.some((it) => it.id === id)) return id;
  }
}

type Built = { ok: true; item: Item } | { ok: false; status: number; error: string };
const bad = (error: string, status = 400): Built => ({ ok: false, status, error });

/** 받은 항목을 검증해 저장할 항목을 새로 만든다. */
function buildItem(raw: Item, existing: Item[]): Built {
  if (existing.length >= MAX_ITEMS) return bad(`예약은 ${MAX_ITEMS}건까지 만들 수 있습니다.`);

  if (raw.title !== undefined && typeof raw.title !== 'string') return bad('제목 형식이 올바르지 않습니다.');
  // 제목은 공개 리포의 실행 이름·로그에 보인다. 제어 문자·줄 구분자·방향 제어 문자(글자 순서를 뒤집어 보이게 함)는 지운다.
  const title = (typeof raw.title === 'string' ? raw.title : '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .trim();
  if (title.length > TITLE_MAX) return bad(`제목은 ${TITLE_MAX}자까지 쓸 수 있습니다.`);

  const max = minutes(raw.max_minutes, 150, 10, TOTAL_MAX);
  if (max === null) return bad('최대 녹음 시간은 10~330분 사이의 정수여야 합니다.');

  if (raw.kind === 'video') {
    const { video_id: videoId, scheduled_at: scheduledAt } = raw;
    if (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId)) return bad('영상 id 형식이 올바르지 않습니다.');
    if (typeof scheduledAt !== 'string' || !ISO_RE.test(scheduledAt) || !Number.isFinite(Date.parse(scheduledAt))) {
      return bad('예정 시각 형식이 올바르지 않습니다.');
    }
    const lead = minutes(raw.lead_minutes, 30, 5, 120);
    if (lead === null) return bad('미리 실행 시간은 5~120분 사이의 정수여야 합니다.');
    const wait = minutes(raw.wait_minutes, lead + 90, 0, WAIT_MAX);
    if (wait === null) return bad(`대기 시간은 0~${WAIT_MAX}분 사이의 정수여야 합니다.`);
    // 대기는 실행 시점(예정 − lead)부터 센다. lead 보다 짧으면 예정 시각 전에 대기가 끝나 버린다.
    if (wait < lead) return bad('대기 시간은 미리 실행 시간보다 짧을 수 없습니다.');
    if (wait + max > TOTAL_MAX) return bad(`대기 시간과 최대 녹음 시간의 합은 ${TOTAL_MAX}분까지입니다.`);
    if (existing.some((it) => it.kind === 'video' && it.video_id === videoId)) {
      return bad('이미 예약된 영상입니다.', 409);
    }
    // 반복 예약이 이미 띄운 영상을 또 예약하면, 그 녹음이 끝난 뒤 발사기가 같은 영상을 한 번 더 띄운다
    // (발사기의 video 판정은 weekly 의 실행 기록을 보지 않는다).
    if (existing.some((it) => it.kind === 'weekly' && it.last_video_id === videoId)) {
      return bad('반복 예약이 이미 녹음한 영상입니다.', 409);
    }
    return {
      ok: true,
      item: {
        id: newId('v', existing),
        kind: 'video',
        video_id: videoId,
        title,
        scheduled_at: scheduledAt,
        lead_minutes: lead,
        wait_minutes: wait,
        max_minutes: max,
        dispatched_at: null,
      },
    };
  }

  if (raw.kind === 'weekly') {
    const { weekday, time } = raw;
    if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return bad('요일이 올바르지 않습니다.');
    }
    if (typeof time !== 'string' || !TIME_RE.test(time)) return bad('시각 형식이 올바르지 않습니다.');
    if (raw.tz !== undefined && raw.tz !== TZ) return bad('시간대는 Asia/Seoul 만 쓸 수 있습니다.');
    const lead = minutes(raw.lead_minutes, 10, 5, 120);
    if (lead === null) return bad('미리 실행 시간은 5~120분 사이의 정수여야 합니다.');
    const wait = minutes(raw.wait_minutes, 60, 0, WAIT_MAX);
    if (wait === null) return bad(`대기 시간은 0~${WAIT_MAX}분 사이의 정수여야 합니다.`);
    // weekly 의 대기는 대상 시각부터 세므로 러너가 기다리는 시간은 최대 lead + wait 이다.
    if (lead + wait > WAIT_MAX) return bad(`미리 실행 시간과 대기 시간의 합은 ${WAIT_MAX}분까지입니다.`);
    if (lead + wait + max > TOTAL_MAX) {
      return bad(`미리 실행·대기·최대 녹음 시간의 합은 ${TOTAL_MAX}분까지입니다.`);
    }
    if (existing.some((it) => it.kind === 'weekly' && it.weekday === weekday && it.time === time)) {
      return bad('같은 요일·시각의 반복 예약이 이미 있습니다.', 409);
    }
    return {
      ok: true,
      item: {
        id: newId('w', existing),
        kind: 'weekly',
        weekday,
        time,
        tz: TZ,
        title,
        lead_minutes: lead,
        wait_minutes: wait,
        max_minutes: max,
        last_dispatched_date: null,
      },
    };
  }

  return bad('예약 종류가 올바르지 않습니다.');
}

export default async function handler(req: ApiReq, res: ApiRes) {
  const uid = await recGuard(req, res, req.method === 'POST' ? 'POST' : 'GET');
  if (!uid) return;

  if (req.method !== 'POST') {
    try {
      res.status(200).json({ items: view((await readReservations()).items) });
    } catch (error) {
      failUpstream(res, 'reservations', error, '예약 목록을 불러오지 못했습니다.');
    }
    return;
  }

  const body = readBody(req);
  const { action, item, id } = body;
  const validAdd = action === 'add' && isItem(item);
  const validRemove = action === 'remove' && typeof id === 'string' && ID_RE.test(id);
  if (!validAdd && !validRemove) {
    res.status(400).json({ error: '요청 형식이 올바르지 않습니다.' });
    return;
  }

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const file = await readReservations();
      let next: unknown[];
      let changedId = String(id); // 감사 로그용: remove 는 받은 id, add 는 서버가 만든 id
      if (action === 'add') {
        const built = buildItem(item as Item, file.items.filter(isItem));
        if (!built.ok) {
          res.status(built.status).json({ error: built.error });
          return;
        }
        next = [...file.items, built.item];
        changedId = String(built.item.id);
      } else {
        next = file.items.filter((it) => !(isItem(it) && it.id === id));
        // 이미 없으면(발사기가 지난 예약을 정리했을 수 있다) 오류가 아니다. 쓰지 않고 현재 목록을 돌려준다.
        if (next.length === file.items.length) {
          res.status(200).json({ items: view(file.items) });
          return;
        }
      }
      if (await writeReservations(file.doc, next, file.etag)) {
        // 감사 로그(오류가 아니다 — 이 API 의 로그는 console.error 로만 남긴다). 제목은 넣지 않는다.
        console.error(`[rec/reservations] ${action} id=${changedId} uid=${uid}`);
        res.status(200).json({ items: view(next) });
        return;
      }
    }
    res.status(409).json({ error: '예약 목록이 방금 바뀌었습니다. 잠시 후 다시 시도해 주세요.' });
  } catch (error) {
    failUpstream(res, 'reservations', error, '예약을 저장하지 못했습니다.');
  }
}
