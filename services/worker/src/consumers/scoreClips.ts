/**
 * SCORE_CLIPS job consumer (Phase 7 — Dev C).
 *
 * Flow:
 * 1. Load transcript + script (CLI fixture / stdin)
 * 2. Call AiProvider.scoreClipWindows (15–60s ranked windows)
 * 3. Return ClipIdea[] with titleSuggestion + score 0–1
 *
 * Usage:
 *   pnpm --filter worker score-clips -- --fixture
 *   echo '{"script":{...},"transcript":{"segments":[...]}}' | pnpm --filter worker score-clips -- --stdin
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  mockTranscribeFromText,
  type ClipIdea,
  type ScriptDoc,
  type Transcript,
} from '@creatorai/ai-provider';
import { scoreClips } from '../ai/scoreClips';

export type ScoreClipsJobInput = {
  jobId?: string;
  workspaceId?: string;
  projectId?: string;
  script: ScriptDoc;
  transcript: Transcript;
};

export type ScoreClipsJobOutput = {
  status: 'SUCCEEDED' | 'FAILED';
  jobId?: string;
  clipIdeas?: ClipIdea[];
  error?: string;
  persistedVia: 'callback' | 'none';
};

export type ProcessScoreClipsOptions = {
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

export async function processScoreClipsJob(
  input: ScoreClipsJobInput,
  opts: ProcessScoreClipsOptions = {},
): Promise<ScoreClipsJobOutput> {
  try {
    const clipIdeas = await scoreClips(input.transcript, input.script, {
      providerName: opts.providerName,
    });

    const payload = {
      jobId: input.jobId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      status: 'SUCCEEDED' as const,
      type: 'SCORE_CLIPS',
      output: { clipIdeas, count: clipIdeas.length },
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
        clipIdeas,
        persistedVia: 'callback',
      };
    }

    return {
      status: 'SUCCEEDED',
      jobId: input.jobId,
      clipIdeas,
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

function loadFixtureInput(jobId?: string): ScoreClipsJobInput {
  const root = path.resolve(
    __dirname,
    '../../../../packages/ai-provider/test/fixtures',
  );
  const script = JSON.parse(
    readFileSync(path.join(root, 'sample_script.json'), 'utf8'),
  ) as ScriptDoc;
  const spoken = readFileSync(path.join(root, 'sample_spoken.txt'), 'utf8');
  const transcript = mockTranscribeFromText(spoken, {
    wordsPerSegment: 6,
    msPerWord: 320,
  });
  return {
    jobId: jobId ?? `local-score-clips-${Date.now()}`,
    script,
    transcript,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let input: ScoreClipsJobInput;

  if (args.stdin) {
    input = JSON.parse(await readStdin()) as ScoreClipsJobInput;
  } else {
    input = loadFixtureInput(args.jobId);
  }

  const result = await processScoreClipsJob(input);
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
