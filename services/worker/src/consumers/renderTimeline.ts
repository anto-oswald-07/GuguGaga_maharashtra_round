/**
 * RENDER_TIMELINE job consumer (Phase 8 — Dev D).
 *
 * Flow:
 * 1. Load EditTimeline JSON + assetPaths map
 * 2. renderTimeline() → MP4 under storage/.../renders/{jobId}/output.mp4
 * 3. Return output JSON with outputPath (+ optional softsubsPath)
 *
 * Usage:
 *   pnpm --filter worker render-timeline -- --timeline path/to/tl.json --asset dummy-asset=storage/samples/dummy.mp4
 *   echo '{"timeline":{...},"assetPaths":{...}}' | pnpm --filter worker render-timeline -- --stdin
 */

import { readFileSync } from 'node:fs';
import {
  renderTimeline,
  renderTimelinePath,
} from '../media/renderTimeline';

export type RenderTimelineJobInput = {
  jobId?: string;
  workspaceId?: string;
  projectId?: string;
  timelineId?: string;
  /** EditTimeline JSON (schemaVersion 1.0). */
  timeline: unknown;
  /** assetId → filesystem path. */
  assetPaths: Record<string, string>;
  /** Override output path; default uses renders/{jobId}/output.mp4. */
  outputPath?: string;
  /** Burn captions with drawtext in addition to softsubs. */
  burnCaptions?: boolean;
  storageRoot?: string;
};

export type RenderTimelineJobOutput = {
  status: 'SUCCEEDED' | 'FAILED';
  jobId?: string;
  timelineId?: string;
  outputPath?: string;
  softsubsPath?: string;
  durationMs?: number;
  clipCount?: number;
  textOverlayCount?: number;
  captionCount?: number;
  error?: string;
  persistedVia: 'callback' | 'none';
};

export type ProcessRenderTimelineOptions = {
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

function resolveOutputPath(input: RenderTimelineJobInput): string {
  if (input.outputPath) return input.outputPath;
  const storageRoot =
    input.storageRoot ?? process.env.STORAGE_ROOT ?? './storage';
  const workspaceId = input.workspaceId ?? 'local';
  const jobId = input.jobId ?? `local-${Date.now()}`;
  return renderTimelinePath(storageRoot, workspaceId, jobId);
}

/**
 * Process a RENDER_TIMELINE job: validate + ffmpeg render → `{ outputPath }`.
 */
export async function processRenderTimelineJob(
  input: RenderTimelineJobInput,
  opts: ProcessRenderTimelineOptions = {},
): Promise<RenderTimelineJobOutput> {
  try {
    if (input.timeline == null) {
      throw new Error('timeline is required');
    }
    if (!input.assetPaths || Object.keys(input.assetPaths).length < 1) {
      throw new Error('assetPaths map is required');
    }

    const outputPath = resolveOutputPath(input);
    const rendered = await renderTimeline(input.timeline, {
      assetPaths: input.assetPaths,
      outputPath,
      burnCaptions: input.burnCaptions,
    });

    const payload = {
      jobId: input.jobId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      timelineId: input.timelineId,
      status: 'SUCCEEDED' as const,
      type: 'RENDER_TIMELINE',
      output: {
        outputPath: rendered.outputPath,
        softsubsPath: rendered.softsubsPath,
        durationMs: rendered.durationMs,
        clipCount: rendered.clipCount,
        textOverlayCount: rendered.textOverlayCount,
        captionCount: rendered.captionCount,
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
        timelineId: input.timelineId,
        outputPath: rendered.outputPath,
        softsubsPath: rendered.softsubsPath,
        durationMs: rendered.durationMs,
        clipCount: rendered.clipCount,
        textOverlayCount: rendered.textOverlayCount,
        captionCount: rendered.captionCount,
        persistedVia: 'callback',
      };
    }

    return {
      status: 'SUCCEEDED',
      jobId: input.jobId,
      timelineId: input.timelineId,
      outputPath: rendered.outputPath,
      softsubsPath: rendered.softsubsPath,
      durationMs: rendered.durationMs,
      clipCount: rendered.clipCount,
      textOverlayCount: rendered.textOverlayCount,
      captionCount: rendered.captionCount,
      persistedVia: 'none',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failPayload = {
      jobId: input.jobId,
      timelineId: input.timelineId,
      status: 'FAILED' as const,
      type: 'RENDER_TIMELINE',
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
      timelineId: input.timelineId,
      error: message,
      persistedVia: callbackUrl ? 'callback' : 'none',
    };
  }
}

function parseArgs(argv: string[]): {
  stdin: boolean;
  timelinePath?: string;
  output?: string;
  jobId?: string;
  workspaceId?: string;
  burnCaptions: boolean;
  assets: Record<string, string>;
} {
  const out: ReturnType<typeof parseArgs> = {
    stdin: false,
    burnCaptions: false,
    assets: {},
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') continue;
    if (a === '--stdin') out.stdin = true;
    else if (a === '--timeline') out.timelinePath = argv[++i];
    else if (a === '--output') out.output = argv[++i];
    else if (a === '--job-id') out.jobId = argv[++i];
    else if (a === '--workspace-id') out.workspaceId = argv[++i];
    else if (a === '--burn-captions') out.burnCaptions = true;
    else if (a === '--asset') {
      const pair = argv[++i] ?? '';
      const eq = pair.indexOf('=');
      if (eq <= 0) {
        throw new Error(`--asset expects id=path (got ${pair})`);
      }
      out.assets[pair.slice(0, eq)] = pair.slice(eq + 1);
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
  let input: RenderTimelineJobInput;

  if (args.stdin) {
    const raw = await readStdin();
    input = JSON.parse(raw) as RenderTimelineJobInput;
  } else {
    if (!args.timelinePath) {
      console.error(
        'Usage: render-timeline -- --timeline <json> --asset id=path [--output <mp4>] [--burn-captions]',
      );
      process.exit(1);
    }
    const timeline = JSON.parse(
      readFileSync(args.timelinePath, 'utf8'),
    ) as unknown;
    if (Object.keys(args.assets).length < 1) {
      console.error('At least one --asset id=path is required');
      process.exit(1);
    }
    input = {
      jobId: args.jobId ?? `local-${Date.now()}`,
      workspaceId: args.workspaceId ?? 'local',
      timeline,
      assetPaths: args.assets,
      outputPath: args.output,
      burnCaptions: args.burnCaptions,
    };
  }

  const result = await processRenderTimelineJob(input);
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
