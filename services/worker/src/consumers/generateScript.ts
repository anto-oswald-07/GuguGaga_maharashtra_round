/**
 * GENERATE_SCRIPT job consumer (Phase 5 — Dev C).
 *
 * Flow:
 * 1. Load job input (CLI / stdin / function arg — DB poll arrives with Phase 5 B)
 * 2. Call AiProvider.generateScript
 * 3. Persist via optional callback URL or return output for Integration / API
 * 4. Mark SUCCEEDED (via callback) or print result for local smoke
 *
 * Usage:
 *   pnpm --filter worker generate-script
 *   pnpm --filter worker generate-script -- --topic "Batch Reels" --audience "creators" --tone "practical" --platform INSTAGRAM_REELS
 *   echo '{"topic":"...","audience":"...","tone":"...","platform":"TIKTOK"}' | pnpm --filter worker generate-script -- --stdin
 *
 * Env:
 *   AI_PROVIDER=mock|openai|gemini
 *   WORKER_CALLBACK_URL  optional POST target, e.g. http://localhost:4000/api/v1/internal/jobs/:id/complete
 *   WORKER_INTERNAL_TOKEN  optional Bearer for callback
 */

import { createAiProvider, type ScriptGenResult } from '@creatorai/ai-provider';
import type { Platform } from '@creatorai/shared';
import { getWorkerAiProvider } from '../ai/provider';

export type GenerateScriptJobInput = {
  jobId?: string;
  workspaceId?: string;
  projectId?: string;
  scriptDocumentId?: string;
  topic: string;
  audience: string;
  tone: string;
  platform: Platform | string;
  refineInstruction?: string;
};

export type GenerateScriptJobOutput = {
  status: 'SUCCEEDED' | 'FAILED';
  jobId?: string;
  script?: ScriptGenResult;
  error?: string;
  /** How result was persisted (if at all). */
  persistedVia: 'callback' | 'none';
};

export type ProcessGenerateScriptOptions = {
  /** Override env provider. */
  providerName?: string;
  /** Optional Integration sink — POST completion payload. */
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

/**
 * Process one GENERATE_SCRIPT job.
 * Safe to call from a future DB poller or from Anto’s mock-complete path.
 */
export async function processGenerateScriptJob(
  input: GenerateScriptJobInput,
  opts: ProcessGenerateScriptOptions = {},
): Promise<GenerateScriptJobOutput> {
  const provider = opts.providerName
    ? createAiProvider({ provider: opts.providerName })
    : getWorkerAiProvider();

  try {
    const script = await provider.generateScript({
      topic: input.topic,
      audience: input.audience,
      tone: input.tone,
      platform: input.platform,
      refineInstruction: input.refineInstruction,
    });

    const payload = {
      jobId: input.jobId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      scriptDocumentId: input.scriptDocumentId,
      status: 'SUCCEEDED' as const,
      type: 'GENERATE_SCRIPT',
      output: {
        script,
        // Integration / Anto: map this into ScriptVersion.content JSON
      },
    };

    const callbackUrl =
      opts.callbackUrl ??
      (input.jobId
        ? process.env.WORKER_CALLBACK_URL?.replace(':id', input.jobId)
        : process.env.WORKER_CALLBACK_URL);
    const callbackToken =
      opts.callbackToken ?? process.env.WORKER_INTERNAL_TOKEN;

    if (callbackUrl) {
      await postCallback(callbackUrl, callbackToken, payload);
      return {
        status: 'SUCCEEDED',
        jobId: input.jobId,
        script,
        persistedVia: 'callback',
      };
    }

    return {
      status: 'SUCCEEDED',
      jobId: input.jobId,
      script,
      persistedVia: 'none',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failPayload = {
      jobId: input.jobId,
      status: 'FAILED' as const,
      type: 'GENERATE_SCRIPT',
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
      error: message,
      persistedVia: callbackUrl ? 'callback' : 'none',
    };
  }
}

function parseArgs(argv: string[]): {
  stdin: boolean;
  topic?: string;
  audience?: string;
  tone?: string;
  platform?: string;
  jobId?: string;
} {
  const out: ReturnType<typeof parseArgs> = { stdin: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') continue;
    if (a === '--stdin') out.stdin = true;
    else if (a === '--topic') out.topic = argv[++i];
    else if (a === '--audience') out.audience = argv[++i];
    else if (a === '--tone') out.tone = argv[++i];
    else if (a === '--platform') out.platform = argv[++i];
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
  let input: GenerateScriptJobInput;

  if (args.stdin) {
    const raw = await readStdin();
    input = JSON.parse(raw) as GenerateScriptJobInput;
  } else {
    input = {
      jobId: args.jobId ?? `local-${Date.now()}`,
      topic: args.topic ?? 'How I batch-create Reels in one afternoon',
      audience: args.audience ?? 'Solo creators',
      tone: args.tone ?? 'Practical, energetic',
      platform: args.platform ?? 'INSTAGRAM_REELS',
    };
  }

  const result = await processGenerateScriptJob(input);
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
