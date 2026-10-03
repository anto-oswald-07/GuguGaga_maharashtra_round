/**
 * DB-polling job processor (Phase 5 Integration).
 *
 * Claims QUEUED jobs and completes them via AiProvider → ScriptVersion / output.
 * Runs in-process with the API so e2e works without a separate worker binary.
 * The worker package remains the CLI/smoke entry for generate-script.
 */
import { completeJobWithAi } from './service';
import { prisma } from '../../db/prisma';

const POLL_MS = Number(process.env.JOB_POLL_MS ?? 750);
let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

async function claimNextJobId(): Promise<string | null> {
  const next = await prisma.job.findFirst({
    where: { status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!next) return null;

  const claimed = await prisma.job.updateMany({
    where: { id: next.id, status: 'QUEUED' },
    data: { status: 'RUNNING', progress: 5 },
  });
  if (claimed.count === 0) return null;
  return next.id;
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    for (let i = 0; i < 5; i += 1) {
      const jobId = await claimNextJobId();
      if (!jobId) break;
      try {
        await completeJobWithAi(jobId);
      } catch (err) {
        console.error('[jobs/processor] complete failed', jobId, err);
      }
    }
  } finally {
    ticking = false;
  }
}

/** Start background poller (no-op if JOB_POLLER=0). */
export function startJobPoller(): void {
  if (process.env.JOB_POLLER === '0') {
    console.log('[jobs/processor] disabled (JOB_POLLER=0)');
    return;
  }
  if (timer) return;
  void tick();
  timer = setInterval(() => {
    void tick();
  }, POLL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`[jobs/processor] polling every ${POLL_MS}ms`);
}

export function stopJobPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
