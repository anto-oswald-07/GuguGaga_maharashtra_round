/**
 * GENERATE_SUPPORTING / platform pack copy consumer (Phase 9 — Dev C).
 *
 * Flow:
 * 1. Load script + platforms (CLI fixture / stdin)
 * 2. Call AiProvider.generateSupporting (length-clamped, distinct per platform)
 * 3. Return SupportingContent { byPlatform }
 *
 * Usage:
 *   pnpm --filter worker generate-platform-copy -- --fixture
 *   echo '{"script":"...","platforms":["TIKTOK","INSTAGRAM_REELS"]}' \
 *     | pnpm --filter worker generate-platform-copy -- --stdin
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Platform } from '@creatorai/shared';
import type { SupportingContent } from '@creatorai/ai-provider';
import { generatePlatformCopy } from '../ai/generatePlatformCopy';

export type GeneratePlatformCopyJobInput = {
  jobId?: string;
  workspaceId?: string;
  projectId?: string;
  script: string;
  platforms: Platform[];
};

export type GeneratePlatformCopyJobOutput = {
  status: 'SUCCEEDED' | 'FAILED';
  jobId?: string;
  supporting?: SupportingContent;
  error?: string;
  persistedVia: 'callback' | 'none';
};

export type ProcessGeneratePlatformCopyOptions = {
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

export async function processGeneratePlatformCopyJob(
  input: GeneratePlatformCopyJobInput,
  opts: ProcessGeneratePlatformCopyOptions = {},
): Promise<GeneratePlatformCopyJobOutput> {
  try {
    const supporting = await generatePlatformCopy(
      input.script,
      input.platforms,
      { providerName: opts.providerName },
    );

    const payload = {
      jobId: input.jobId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      status: 'SUCCEEDED' as const,
      type: 'GENERATE_SUPPORTING',
      output: { supporting },
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
        supporting,
        persistedVia: 'callback',
      };
    }

    return {
      status: 'SUCCEEDED',
      jobId: input.jobId,
      supporting,
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

function loadFixtureInput(jobId?: string): GeneratePlatformCopyJobInput {
  const root = path.resolve(
    __dirname,
    '../../../../packages/ai-provider/test/fixtures',
  );
  const fixture = JSON.parse(
    readFileSync(path.join(root, 'sample_platform_copy.json'), 'utf8'),
  ) as { script: string; platforms: Platform[] };
  return {
    jobId: jobId ?? `local-generate-platform-copy-${Date.now()}`,
    script: fixture.script,
    platforms: fixture.platforms,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let input: GeneratePlatformCopyJobInput;

  if (args.stdin) {
    input = JSON.parse(await readStdin()) as GeneratePlatformCopyJobInput;
  } else {
    // --fixture is the default for local smoke when no stdin
    input = loadFixtureInput(args.jobId);
  }

  const result = await processGeneratePlatformCopyJob(input);
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
