// 설교녹음 — 녹음 리포(syrccm/symusic-recorder)의 GitHub REST 호출.
// - 환경변수(서버 전용): REC_GH_OWNER, REC_GH_REPO, REC_GH_WORKFLOW, REC_GH_PAT(Actions R/W + Variables R/W).
// - PAT 는 Authorization 헤더로만 쓰고 로그·응답에 넣지 않는다. 오류 메시지에는 상태 코드와 경로만 담는다.

/** 세션 id 형식 — 녹음 워크플로(record.yml)의 검증과 같다. */
export const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function config() {
  const owner = process.env.REC_GH_OWNER;
  const repo = process.env.REC_GH_REPO;
  const workflow = process.env.REC_GH_WORKFLOW;
  const pat = process.env.REC_GH_PAT;
  if (!owner || !repo || !workflow || !pat) {
    throw new Error('REC_GH_OWNER / REC_GH_REPO / REC_GH_WORKFLOW / REC_GH_PAT 환경변수가 설정되지 않았습니다.');
  }
  return { owner, repo, workflow, pat };
}

async function gh(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const { owner, repo, pat } = config();
  return fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'symusic-rec',
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

function fail(what: string, res: Response): never {
  throw new Error(`GitHub ${what} 실패 (HTTP ${res.status})`);
}

export interface RecRun {
  id: number;
  /** queued / in_progress / completed (GitHub 이 주는 그 밖의 대기 상태 포함) */
  status: string;
  /** completed 일 때 success / failure / cancelled 등, 아니면 null */
  conclusion: string | null;
  startedAt: string;
  runUrl: string;
  /** run-name("녹음 {session_id} {title}")에서 읽은 세션 id. 못 읽으면 null */
  sessionId: string | null;
  title: string;
}

/** 녹음 워크플로의 최근 실행 목록(최신순). */
export async function listRuns(perPage: number): Promise<RecRun[]> {
  const { workflow } = config();
  const res = await gh(`/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=${perPage}`);
  if (!res.ok) fail('실행 목록 조회', res);
  const data = (await res.json()) as { workflow_runs?: Array<Record<string, unknown>> };
  return (data.workflow_runs || []).map((run) => {
    const displayTitle = typeof run.display_title === 'string' ? run.display_title : '';
    const m = /^녹음 ([A-Za-z0-9_-]{1,64})(?: (.*))?$/.exec(displayTitle);
    return {
      id: Number(run.id),
      status: String(run.status || ''),
      conclusion: typeof run.conclusion === 'string' ? run.conclusion : null,
      startedAt: String(run.run_started_at || run.created_at || ''),
      runUrl: String(run.html_url || ''),
      sessionId: m ? m[1] : null,
      title: m ? (m[2] || '').trim() : '',
    };
  });
}

/** 녹음 워크플로를 main 에서 실행한다. videoId 가 있으면 그 영상을, 없으면 리포 변수 LIVE_URL 을 녹음한다. */
export async function dispatchRecord(sessionId: string, title: string, videoId?: string): Promise<void> {
  const { workflow } = config();
  const res = await gh(`/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
    method: 'POST',
    body: { ref: 'main', inputs: { session_id: sessionId, title, ...(videoId ? { video_id: videoId } : {}) } },
  });
  if (!res.ok) fail('워크플로 실행', res);
}

/** 리포 변수 STOP_SIGNAL 을 쓴다. 변수가 없으면(404) 새로 만든다. */
export async function setStopSignal(value: string): Promise<void> {
  const patch = await gh('/actions/variables/STOP_SIGNAL', {
    method: 'PATCH',
    body: { name: 'STOP_SIGNAL', value },
  });
  if (patch.ok) return;
  if (patch.status !== 404) fail('STOP_SIGNAL 변경', patch);
  const post = await gh('/actions/variables', {
    method: 'POST',
    body: { name: 'STOP_SIGNAL', value },
  });
  if (!post.ok) fail('STOP_SIGNAL 생성', post);
}
