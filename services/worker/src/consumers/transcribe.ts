/**
 * TRANSCRIBE job consumer (Phase 6 — Dev C).
 *
 * Flow:
 * 1. Load input (CLI / stdin) — audio path and/or hintText for mock
 * 2. Call AiProvider.transcribe
 * 3. Return TranscriptSegment[] (Integration / Anto persists)
 *
 * Usage:
 *   pnpm --filter worker transcribe -- --hint-text "Hello world batch reels"
 *   pnpm --filter worker transcribe -- --file /path/to/audio.wav
 *   echo '{"hintText":"..."}' | pnpm --filter worker transcribe -- --stdin
 */

import {
  createAiProvider,
  type Transcript,
  type TranscribeInput,
} from '@creatorai/ai-provider';
import { getWorkerAiProvider } from '../ai/provider';
import { transcribeAudio } from '../ai/transcribe';

export type TranscribeJobInput = TranscribeInput & {
  jobId?: string;
  workspaceId?: string;
  projectId?: string;
  assetId?: string;
};

export type TranscribeJobOutput = {
  status: 'SUCCEEDED' | 'FAILED';
  jobId?: string;
  transcript?: Transcript;
  error?: string;
  persistedVia: 'callback' | 'none';
};

export type ProcessTranscribeOptions = {
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

export async function processTranscribeJob(
  input: TranscribeJobInput,
  opts: ProcessTranscribeOptions = {},
): Promise<TranscribeJobOutput> {
  try {
    const transcript = await transcribeAudio(
      {
        filePath: input.filePath,
        audio: input.audio,
        hintText: input.hintText,
        language: input.language,
        durationMs: input.durationMs,
      },
      { providerName: opts.providerName },
    );

    const payload = {
      jobId: input.jobId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      assetId: input.assetId,
      status: 'SUCCEEDED' as const,
      type: 'TRANSCRIBE',
      output: { transcript },
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
        transcript,
        persistedVia: 'callback',
      };
    }

    return {
      status: 'SUCCEEDED',
      jobId: input.jobId,
      transcript,
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
  file?: string;
  hintText?: string;
  language?: string;
  jobId?: string;
} {
  const out: ReturnType<typeof parseArgs> = { stdin: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') continue;
    if (a === '--stdin') out.stdin = true;
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--hint-text') out.hintText = argv[++i];
    else if (a === '--language') out.language = argv[++i];
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let input: TranscribeJobInput;

  if (args.stdin) {
    input = JSON.parse(await readStdin()) as TranscribeJobInput;
  } else {
    input = {
      jobId: args.jobId ?? `local-tx-${Date.now()}`,
      filePath: args.file,
      hintText:
        args.hintText ??
        'Stop filming one Reel a day. Pick one topic cluster. Write three hooks. Film all A-roll in one session.',
      language: args.language,
    };
  }

  // Ensure provider factory is reachable (side-effect free check)
  void createAiProvider;
  void getWorkerAiProvider;

  const result = await processTranscribeJob(input);
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
