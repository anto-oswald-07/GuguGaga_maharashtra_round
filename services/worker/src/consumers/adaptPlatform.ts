/**
 * ADAPT_PLATFORM job consumer (Phase 9 — Dev D).
 *
 * Flow:
 * 1. Load source video + target aspectRatio(s) / pack list
 * 2. adaptAspect() → MP4 under renders path
 * 3. Return output JSON with outputPath(s) for Anto Asset linking
 *
 * Usage:
 *   pnpm --filter worker adapt-platform -- --input storage/samples/dummy.mp4 --aspect R_9_16
 *   pnpm --filter worker adapt-platform -- --input storage/samples/dummy.mp4 --all-aspects
 *   echo '{"inputPath":"...","aspectRatio":"R_1_1"}' | pnpm --filter worker adapt-platform -- --stdin
 */

import {
  adaptAspect,
  adaptAspectAll,
  adaptAspectOutputPath,
  adaptPackOutputPath,
  isAspectRatio,
  type AdaptAspectResult,
  type AdaptFitMode,
  type AspectRatio,
} from '../media/adaptAspect';

export type AdaptPlatformPackSpec = {
  packId?: string;
  platform?: string;
  aspectRatio: AspectRatio;
  /** Override output path for this pack. */
  outputPath?: string;
};

export type AdaptPlatformJobInput = {
  jobId?: string;
  workspaceId?: string;
  projectId?: string;
  /** Source video (preview / clip / original). */
  inputPath: string;
  /** Single-aspect shorthand (when packs omitted). */
  aspectRatio?: AspectRatio;
  /** Multi-pack batch (preferred for ADAPT_PLATFORM). */
  packs?: AdaptPlatformPackSpec[];
  /** Override single output path. */
  outputPath?: string;
  fit?: AdaptFitMode;
  storageRoot?: string;
};

export type AdaptPlatformPackResult = {
  packId?: string;
  platform?: string;
  aspectRatio: AspectRatio;
  outputPath: string;
  width: number;
  height: number;
  fit: AdaptFitMode;
  label: string;
};

export type AdaptPlatformJobOutput = {
  status: 'SUCCEEDED' | 'FAILED';
  jobId?: string;
  packs?: AdaptPlatformPackResult[];
  /** Convenience: first pack output (single-aspect CLI). */
  outputPath?: string;
  error?: string;
  persistedVia: 'callback' | 'none';
};

export type ProcessAdaptPlatformOptions = {
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

function resolveSpecs(input: AdaptPlatformJobInput): AdaptPlatformPackSpec[] {
  if (input.packs && input.packs.length > 0) {
    return input.packs;
  }
  if (input.aspectRatio) {
    return [
      {
        aspectRatio: input.aspectRatio,
        outputPath: input.outputPath,
      },
    ];
  }
  throw new Error(
    'Provide aspectRatio or packs[] with aspectRatio (R_16_9 | R_9_16 | R_1_1)',
  );
}

function defaultOutputPath(
  input: AdaptPlatformJobInput,
  spec: AdaptPlatformPackSpec,
): string {
  if (spec.outputPath) return spec.outputPath;
  if (input.outputPath && (!input.packs || input.packs.length <= 1)) {
    return input.outputPath;
  }
  const storageRoot =
    input.storageRoot ?? process.env.STORAGE_ROOT ?? './storage';
  const workspaceId = input.workspaceId ?? 'local';
  const jobId = input.jobId ?? `local-${Date.now()}`;
  if (spec.platform) {
    return adaptPackOutputPath(storageRoot, workspaceId, jobId, spec.platform);
  }
  return adaptAspectOutputPath(
    storageRoot,
    workspaceId,
    jobId,
    spec.aspectRatio,
  );
}

/**
 * Process ADAPT_PLATFORM: adapt media for each pack aspect → `{ packs: [...] }`.
 */
export async function processAdaptPlatformJob(
  input: AdaptPlatformJobInput,
  opts: ProcessAdaptPlatformOptions = {},
): Promise<AdaptPlatformJobOutput> {
  try {
    if (!input.inputPath?.trim()) {
      throw new Error('inputPath is required');
    }

    const specs = resolveSpecs(input);
    const packResults: AdaptPlatformPackResult[] = [];

    for (const spec of specs) {
      if (!isAspectRatio(spec.aspectRatio)) {
        throw new Error(`Invalid aspectRatio: ${spec.aspectRatio}`);
      }
      const outputPath = defaultOutputPath(input, spec);
      const adapted: AdaptAspectResult = await adaptAspect(
        input.inputPath,
        outputPath,
        { aspectRatio: spec.aspectRatio, fit: input.fit },
      );
      packResults.push({
        packId: spec.packId,
        platform: spec.platform,
        aspectRatio: adapted.aspectRatio,
        outputPath: adapted.outputPath,
        width: adapted.width,
        height: adapted.height,
        fit: adapted.fit,
        label: adapted.label,
      });
    }

    const payload = {
      jobId: input.jobId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      status: 'SUCCEEDED' as const,
      type: 'ADAPT_PLATFORM',
      output: {
        packs: packResults,
        outputPath: packResults[0]?.outputPath,
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
        packs: packResults,
        outputPath: packResults[0]?.outputPath,
        persistedVia: 'callback',
      };
    }

    return {
      status: 'SUCCEEDED',
      jobId: input.jobId,
      packs: packResults,
      outputPath: packResults[0]?.outputPath,
      persistedVia: 'none',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failPayload = {
      jobId: input.jobId,
      status: 'FAILED' as const,
      type: 'ADAPT_PLATFORM',
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
  input?: string;
  output?: string;
  outdir?: string;
  aspect?: AspectRatio;
  allAspects: boolean;
  jobId?: string;
  workspaceId?: string;
  fit?: AdaptFitMode;
} {
  const out: ReturnType<typeof parseArgs> = {
    stdin: false,
    allAspects: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') continue;
    if (a === '--stdin') out.stdin = true;
    else if (a === '--input') out.input = argv[++i];
    else if (a === '--output') out.output = argv[++i];
    else if (a === '--outdir') out.outdir = argv[++i];
    else if (a === '--all-aspects') out.allAspects = true;
    else if (a === '--job-id') out.jobId = argv[++i];
    else if (a === '--workspace-id') out.workspaceId = argv[++i];
    else if (a === '--fit') {
      const f = argv[++i];
      if (f === 'crop' || f === 'pad') out.fit = f;
    } else if (a === '--aspect') {
      const v = argv[++i] ?? '';
      if (!isAspectRatio(v)) {
        throw new Error(`--aspect must be R_16_9 | R_9_16 | R_1_1 (got ${v})`);
      }
      out.aspect = v;
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
  let input: AdaptPlatformJobInput;

  if (args.stdin) {
    const raw = await readStdin();
    input = JSON.parse(raw) as AdaptPlatformJobInput;
  } else if (args.allAspects) {
    if (!args.input) {
      console.error(
        'Usage: adapt-platform -- --input <video> --all-aspects [--outdir <dir>]',
      );
      process.exit(1);
    }
    const outdir = args.outdir ?? 'storage/samples';
    const results = await adaptAspectAll(args.input, outdir, {
      fit: args.fit,
    });
    console.log(
      JSON.stringify(
        {
          status: 'SUCCEEDED',
          packs: results.map((r) => ({
            aspectRatio: r.aspectRatio,
            outputPath: r.outputPath,
            width: r.width,
            height: r.height,
            fit: r.fit,
            label: r.label,
          })),
          persistedVia: 'none',
        },
        null,
        2,
      ),
    );
    return;
  } else {
    if (!args.input || !args.aspect) {
      console.error(
        'Usage: adapt-platform -- --input <video> --aspect R_16_9|R_9_16|R_1_1 [--output <mp4>] [--fit crop|pad]',
      );
      process.exit(1);
    }
    input = {
      jobId: args.jobId ?? `local-${Date.now()}`,
      workspaceId: args.workspaceId ?? 'local',
      inputPath: args.input,
      aspectRatio: args.aspect,
      outputPath: args.output,
      fit: args.fit,
    };
  }

  const result = await processAdaptPlatformJob(input);
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
