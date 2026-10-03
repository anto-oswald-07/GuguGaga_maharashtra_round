/**
 * RENDER_CLIP job consumer (Phase 7 — Dev D).
 *
 * Flow:
 * 1. Load input — source video path + startMs/endMs (+ optional output path)
 * 2. cutClip() → MP4 under storage/.../renders/{jobId}/output.mp4
 * 3. Return output JSON with outputPath for Anto Asset linking
 *
 * Usage:
 *   pnpm --filter worker render-clip -- --input storage/samples/dummy.mp4 --start-ms 1000 --end-ms 3000
 *   echo '{"inputPath":"...","startMs":1000,"endMs":3000}' | pnpm --filter worker render-clip -- --stdin
 */

import { cutClip, renderClipPath, type CutClipMode } from '../media/cutClip';

export type RenderClipJobInput = {
  jobId?: string;
  workspaceId?: string;
  projectId?: string;
  candidateId?: string;
  /** Source video (originals path or sample). */
  inputPath: string;
  /** Inclusive-ish cut start (ms). */
  startMs: number;
  /** Exclusive-ish cut end (ms); duration = endMs - startMs. */
  endMs: number;
  /** Override output path; default uses renders/{jobId}/output.mp4. */
  outputPath?: string;
  /** `reencode` (default, accurate) or `copy` (fast, may drift). */
  mode?: CutClipMode;
  /** STORAGE_ROOT override for default path helper. */
  storageRoot?: string;
};

export type RenderClipJobOutput = {
  status: 'SUCCEEDED' | 'FAILED';
  jobId?: string;
  candidateId?: string;
  /** Absolute/relative path to rendered MP4 — job output JSON for Asset create. */
  outputPath?: string;
  startMs?: number;
  endMs?: number;
  durationMs?: number;
  mode?: CutClipMode;
  error?: string;
  persistedVia: 'callback' | 'none';
};

export type ProcessRenderClipOptions = {
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

function resolveOutputPath(input: RenderClipJobInput): string {
  if (input.outputPath) return input.outputPath;
  const storageRoot =
    input.storageRoot ?? process.env.STORAGE_ROOT ?? './storage';
  const workspaceId = input.workspaceId ?? 'local';
  const jobId = input.jobId ?? `local-${Date.now()}`;
  return renderClipPath(storageRoot, workspaceId, jobId);
}

/**
 * Process a RENDER_CLIP job: cut media and return `{ outputPath, ... }` JSON.
 */
export async function processRenderClipJob(
  input: RenderClipJobInput,
  opts: ProcessRenderClipOptions = {},
): Promise<RenderClipJobOutput> {
  try {
    if (!input.inputPath?.trim()) {
      throw new Error('inputPath is required');
    }
    const outputPath = resolveOutputPath(input);
    const cut = await cutClip(
      input.inputPath,
      outputPath,
      input.startMs,
      input.endMs,
      { mode: input.mode },
    );

    const payload = {
      jobId: input.jobId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      candidateId: input.candidateId,
      status: 'SUCCEEDED' as const,
      type: 'RENDER_CLIP',
      output: {
        outputPath: cut.outputPath,
        startMs: cut.startMs,
        endMs: cut.endMs,
        durationMs: cut.durationMs,
        mode: cut.mode,
      },
    };

    const callbackUrl =
      opts.callbackUrl ??
      (input.jobId
        ? process.env.WORKER_CALLBACK_URL?.replace(':id', input.jobId)
        : process.env.WORKER_CALLBACK_URL);

    if (callbackUrl) {
      await postCallback(
        callbackUrl,
        opts.callbackToken ?? process.env.WORKER_INTERNAL_TOKEN,
        payload,
      );
      return {
        status: 'SUCCEEDED',
        jobId: input.jobId,
        candidateId: input.candidateId,
        outputPath: cut.outputPath,
        startMs: cut.startMs,
        endMs: cut.endMs,
        durationMs: cut.durationMs,
        mode: cut.mode,
        persistedVia: 'callback',
      };
    }

    return {
      status: 'SUCCEEDED',
      jobId: input.jobId,
      candidateId: input.candidateId,
      outputPath: cut.outputPath,
      startMs: cut.startMs,
      endMs: cut.endMs,
      durationMs: cut.durationMs,
      mode: cut.mode,
      persistedVia: 'none',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failPayload = {
      jobId: input.jobId,
      candidateId: input.candidateId,
      status: 'FAILED' as const,
      type: 'RENDER_CLIP',
      error: message,
    };
    const callbackUrl =
      opts.callbackUrl ??
      (input.jobId
        ? process.env.WORKER_CALLBACK_URL?.replace(':id', input.jobId)
        : process.env.WORKER_CALLBACK_URL);
    if (callbackUrl) {
      try {
        await postCallback(
          callbackUrl,
          opts.callbackToken ?? process.env.WORKER_INTERNAL_TOKEN,
          failPayload,
        );
      } catch {
        /* still return FAILED below */
      }
    }
    return {
      status: 'FAILED',
      jobId: input.jobId,
      candidateId: input.candidateId,
      error: message,
      persistedVia: callbackUrl ? 'callback' : 'none',
    };
  }
}

function parseArgs(argv: string[]): {
  stdin: boolean;
  input?: string;
  output?: string;
  startMs?: number;
  endMs?: number;
  jobId?: string;
  workspaceId?: string;
  mode?: CutClipMode;
} {
  const out: ReturnType<typeof parseArgs> = { stdin: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') continue;
    if (a === '--stdin') out.stdin = true;
    else if (a === '--input') out.input = argv[++i];
    else if (a === '--output') out.output = argv[++i];
    else if (a === '--start-ms') out.startMs = Number(argv[++i]);
    else if (a === '--end-ms') out.endMs = Number(argv[++i]);
    else if (a === '--job-id') out.jobId = argv[++i];
    else if (a === '--workspace-id') out.workspaceId = argv[++i];
    else if (a === '--mode') {
      const m = argv[++i];
      if (m === 'copy' || m === 'reencode') out.mode = m;
    }
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let input: RenderClipJobInput;

  if (args.stdin) {
    const raw = await readStdin();
    input = JSON.parse(raw) as RenderClipJobInput;
  } else {
    if (args.input == null || args.startMs == null || args.endMs == null) {
      console.error(
        'Usage: render-clip -- --input <video> --start-ms <n> --end-ms <n> [--output <mp4>] [--mode reencode|copy]',
      );
      process.exit(1);
    }
    input = {
      jobId: args.jobId ?? `local-${Date.now()}`,
      workspaceId: args.workspaceId ?? 'local',
      inputPath: args.input,
      outputPath: args.output,
      startMs: args.startMs,
      endMs: args.endMs,
      mode: args.mode,
    };
  }

  const result = await processRenderClipJob(input);
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
