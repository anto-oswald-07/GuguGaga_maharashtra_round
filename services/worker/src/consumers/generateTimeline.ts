/**
 * GENERATE_TIMELINE job consumer (Phase 8 — Dev C).
 *
 * Flow:
 * 1. Load TimelineContext (CLI fixture / stdin)
 * 2. Call AiProvider.proposeTimeline (clips + hook overlay 0–3s)
 * 3. Return EditTimeline JSON (schemaVersion 1.0)
 *
 * Usage:
 *   pnpm --filter worker generate-timeline -- --fixture
 *   echo '{"script":{...},"acceptedClips":[...]}' | pnpm --filter worker generate-timeline -- --stdin
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  type EditTimeline,
  type TimelineContext,
} from '@creatorai/ai-provider';
import { proposeTimeline } from '../ai/proposeTimeline';

export type GenerateTimelineJobInput = {
  jobId?: string;
  workspaceId?: string;
  projectId?: string;
} & TimelineContext;

export type GenerateTimelineJobOutput = {
  status: 'SUCCEEDED' | 'FAILED';
  jobId?: string;
  timeline?: EditTimeline;
  error?: string;
  persistedVia: 'callback' | 'none';
};

export type ProcessGenerateTimelineOptions = {
  providerName?: string;
  callbackUrl?: string;
  callbackToken?: string;
};

async function postCallback(
  url: string,
  token: string | undefined,
  body: unknown,
): Promise<void> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Callback failed ${res.status}: ${text.slice(0, 200)}`);
  }
}

export async function processGenerateTimelineJob(
  input: GenerateTimelineJobInput,
  opts: ProcessGenerateTimelineOptions = {},
): Promise<GenerateTimelineJobOutput> {
  try {
    const { jobId, workspaceId, projectId, ...ctx } = input;
    const timeline = await proposeTimeline(ctx, {
      providerName: opts.providerName,
    });

    const payload = {
      jobId,
      workspaceId,
      projectId,
      status: 'SUCCEEDED' as const,
      type: 'GENERATE_TIMELINE',
      output: { timeline },
    };

    const callbackUrl =
      opts.callbackUrl ??
      (jobId
        ? process.env.WORKER_CALLBACK_URL?.replace(':id', jobId)
        : process.env.WORKER_CALLBACK_URL);

    if (callbackUrl) {
      await postCallback(
        callbackUrl,
        opts.callbackToken ?? process.env.WORKER_INTERNAL_TOKEN,
        payload,
      );
      return {
        status: 'SUCCEEDED',
        jobId,
        timeline,
        persistedVia: 'callback',
      };
    }

    return {
      status: 'SUCCEEDED',
      jobId,
      timeline,
      persistedVia: 'none',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'FAILED',
      jobId: input.jobId,
      error: message,
      persistedVia: 'none',
    };
  }
}

function parseArgs(argv: string[]): {
  stdin: boolean;
  fixture: boolean;
  jobId?: string;
} {
  const out: ReturnType<typeof parseArgs> = { stdin: false, fixture: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') continue;
    if (a === '--stdin') out.stdin = true;
    else if (a === '--fixture') out.fixture = true;
    else if (a === '--job-id') out.jobId = argv[++i];
  }
  return out;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function loadFixtureInput(jobId?: string): GenerateTimelineJobInput {
  const root = path.resolve(
    __dirname,
    '../../../../packages/ai-provider/test/fixtures',
  );
  const ctx = JSON.parse(
    readFileSync(path.join(root, 'sample_timeline_context.json'), 'utf8'),
  ) as TimelineContext;
  return {
    jobId: jobId ?? `local-generate-timeline-${Date.now()}`,
    ...ctx,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let input: GenerateTimelineJobInput;

  if (args.stdin) {
    input = JSON.parse(await readStdin()) as GenerateTimelineJobInput;
  } else {
    input = loadFixtureInput(args.jobId);
  }

  const result = await processGenerateTimelineJob(input);
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'FAILED') process.exit(1);
}

const isDirectRun =
  typeof require !== 'undefined' && require.main === module;

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
