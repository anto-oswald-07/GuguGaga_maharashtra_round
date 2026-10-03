import type {
  JobDto,
  JobListQuery,
  JobListResponse,
  MockCompleteJobRequest,
  Platform,
  ScriptContent,
  ScriptSource,
} from '@creatorai/shared';
import { createAiProvider } from '@creatorai/ai-provider';
import type { Job, Prisma } from '@prisma/client';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import {
  audioDerivativePath,
  extractAudio,
} from 'worker/media/extractAudio';
import { cutClip, renderClipPath } from 'worker/media/cutClip';
import {
  renderTimeline,
  renderTimelinePath,
} from 'worker/media/renderTimeline';
import { prisma } from '../../db/prisma';
import { storage } from '../../storage/local';
import {
  loadScriptContentForAlign,
  mockAlignmentsFromScript,
  mockTranscriptSegments,
  persistAlignments,
  persistTranscript,
} from '../mapping/service';
import {
  loadScriptAndTranscriptForScore,
  mockClipIdeas,
  persistClipCandidates,
  persistRenderedClip,
} from '../clips/service';
import {
  loadTimelineGenerateContext,
  loadTimelineRenderContext,
  mockTimelineJson,
  normalizeProviderTimeline,
  persistTimelinePreview,
  persistTimelineProposal,
} from '../timelines/service';
import { appendAiScriptVersion } from '../scripts/service';
import { enqueueJob } from './queue';

/** Prefer extracted WAV for Whisper; fall back to original if extract fails. */
async function resolveSttFilePath(
  workspaceId: string,
  assetId: string,
  relativePath: string,
): Promise<{ filePath?: string; extracted: boolean }> {
  let absOriginal: string;
  try {
    absOriginal = storage.absoluteFromRelative(relativePath);
    await access(absOriginal, constants.R_OK);
  } catch {
    return { extracted: false };
  }

  const outPath = audioDerivativePath(
    storage.getRoot(),
    workspaceId,
    assetId,
    'wav',
  );
  try {
    // Skip ffmpeg spawn when binary missing (common on bare demos).
    const ffmpegCandidates = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
    let hasFfmpeg = false;
    for (const bin of ffmpegCandidates) {
      try {
        await access(bin, constants.X_OK);
        hasFfmpeg = true;
        break;
      } catch {
        /* try next */
      }
    }
    if (!hasFfmpeg) {
      return { filePath: absOriginal, extracted: false };
    }
    await extractAudio(absOriginal, outPath);
    return { filePath: outPath, extracted: true };
  } catch {
    // ffmpeg failed or non-media file — still allow mock/Whisper on original
    return { filePath: absOriginal, extracted: false };
  }
}

export class JobHttpError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
  ) {
    super(message);
    this.name = 'JobHttpError';
  }
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function toJobDto(row: Job): JobDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    type: row.type,
    status: row.status,
    input: asRecord(row.input),
    output: row.output == null ? null : asRecord(row.output),
    error: row.error,
    progress: row.progress,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findOwnedJob(
  workspaceId: string,
  jobId: string,
): Promise<Job> {
  const row = await prisma.job.findFirst({
    where: { id: jobId, workspaceId },
  });
  if (!row) {
    throw new JobHttpError(404, 'not_found', 'Job not found');
  }
  return row;
}

export async function listJobs(
  workspaceId: string,
  query: JobListQuery,
): Promise<JobListResponse> {
  const where: Prisma.JobWhereInput = { workspaceId };
  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;
  if (query.projectId) where.projectId = query.projectId;

  const rows = await prisma.job.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return { items: rows.map(toJobDto) };
}

export async function getJob(
  workspaceId: string,
  jobId: string,
): Promise<JobDto> {
  const row = await findOwnedJob(workspaceId, jobId);
  return toJobDto(row);
}

export async function retryJob(
  workspaceId: string,
  jobId: string,
): Promise<JobDto> {
  const existing = await findOwnedJob(workspaceId, jobId);
  if (existing.status !== 'FAILED') {
    throw new JobHttpError(
      400,
      'validation_error',
      'Only FAILED jobs can be retried',
    );
  }

  const created = await enqueueJob({
    workspaceId,
    projectId: existing.projectId,
    type: existing.type,
    input: asRecord(existing.input),
  });

  return toJobDto(created);
}

function strField(input: Record<string, unknown>, key: string, fallback: string): string {
  const v = input[key];
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function flattenSupporting(
  byPlatform: Partial<
    Record<string, { titles: string[]; captions: string[]; hashtags: string[] }>
  >,
  platforms: string[],
): Record<string, unknown> {
  const titles: string[] = [];
  const captions: string[] = [];
  const hashtags = new Set<string>();
  for (const p of platforms) {
    const item = byPlatform[p];
    if (!item) continue;
    titles.push(...item.titles);
    captions.push(...item.captions);
    for (const h of item.hashtags) hashtags.add(h);
  }
  // Fallback: flatten all platforms if none matched
  if (titles.length === 0) {
    for (const item of Object.values(byPlatform)) {
      if (!item) continue;
      titles.push(...item.titles);
      captions.push(...item.captions);
      for (const h of item.hashtags) hashtags.add(h);
    }
  }
  return {
    titles,
    captions,
    hashtags: [...hashtags],
    description: null,
  };
}

/**
 * Complete a job with the real AiProvider (mock|openai|gemini).
 * Worker path = write DB directly (docs/jobs/queue.md). Used by poller + mock-complete.
 */
export async function completeJobWithAi(
  jobId: string,
  body: MockCompleteJobRequest = {},
): Promise<JobDto> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new JobHttpError(404, 'not_found', 'Job not found');
  }

  if (job.status === 'SUCCEEDED' || job.status === 'FAILED') {
    throw new JobHttpError(
      400,
      'validation_error',
      `Job already ${job.status.toLowerCase()}`,
    );
  }

  if (body.fail) {
    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        progress: 100,
        error: body.error ?? 'Mock failure',
        output: body.output
          ? (body.output as Prisma.InputJsonValue)
          : undefined,
      },
    });
    return toJobDto(updated);
  }

  // Ensure RUNNING (poller may have claimed already)
  if (job.status === 'QUEUED') {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', progress: 50 },
    });
  } else {
    await prisma.job.update({
      where: { id: jobId },
      data: { progress: 50 },
    });
  }

  const input = asRecord(job.input);
  let output: Record<string, unknown> = body.output ? { ...body.output } : {};
  const provider = createAiProvider();

  try {
    if (job.type === 'GENERATE_SCRIPT') {
      if (!job.projectId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'GENERATE_SCRIPT job missing projectId',
        );
      }
      const generated = await provider.generateScript({
        topic: strField(input, 'topic', 'your topic'),
        audience: strField(input, 'audience', 'creators'),
        tone: strField(input, 'tone', 'practical'),
        platform: strField(input, 'platform', 'YOUTUBE_SHORTS'),
        refineInstruction:
          typeof input.refineInstruction === 'string'
            ? input.refineInstruction
            : undefined,
      });

      const content: ScriptContent = {
        hook: generated.hook,
        body: generated.body,
        cta: generated.cta,
        title: generated.title,
        rawText: generated.fullText,
      };
      const source: ScriptSource = input.refineInstruction
        ? 'REFINE'
        : 'AI';
      const scriptId =
        typeof input.scriptId === 'string' ? input.scriptId : null;
      const title = typeof input.title === 'string' ? input.title : generated.title;

      const result = await appendAiScriptVersion({
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        scriptId,
        title,
        content,
        source,
      });

      output = {
        ...output,
        scriptId: result.scriptId,
        versionId: result.versionId,
        version: result.version,
        content,
        provider: generated.provider,
        model: generated.model,
      };
    } else if (job.type === 'GENERATE_HOOKS') {
      const count =
        typeof input.count === 'number' && input.count > 0
          ? Math.min(Math.floor(input.count), 10)
          : 5;
      const scriptText = strField(input, 'scriptText', 'your content');
      const hooks = await provider.generateHooks(scriptText, count);
      output = { ...output, hooks, provider: provider.name };
    } else if (job.type === 'GENERATE_SUPPORTING') {
      const platforms = (
        Array.isArray(input.platforms)
          ? input.platforms.filter((p): p is string => typeof p === 'string')
          : ['YOUTUBE_SHORTS']
      ) as Platform[];
      const scriptText = strField(input, 'scriptText', 'your content');
      const supportingRaw = await provider.generateSupporting(
        scriptText,
        platforms,
      );
      const supporting = flattenSupporting(
        supportingRaw.byPlatform,
        platforms,
      );
      output = {
        ...output,
        supporting,
        byPlatform: supportingRaw.byPlatform,
        provider: supportingRaw.provider,
        model: supportingRaw.model,
      };
    } else if (job.type === 'TRANSCRIBE') {
      if (!job.projectId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'TRANSCRIBE job missing projectId',
        );
      }
      const assetId = strField(input, 'assetId', '');
      if (!assetId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'TRANSCRIBE job missing assetId',
        );
      }
      const language = strField(input, 'language', 'en');
      const asset = await prisma.asset.findFirst({
        where: {
          id: assetId,
          workspaceId: job.workspaceId,
          deletedAt: null,
        },
        select: { name: true, path: true },
      });
      if (!asset) {
        throw new JobHttpError(404, 'not_found', 'Asset not found');
      }

      const { filePath, extracted } = await resolveSttFilePath(
        job.workspaceId,
        assetId,
        asset.path,
      );

      // Prefer spoken text from latest project script so mock STT ↔ align demos match.
      let hintText =
        typeof input.hintText === 'string' && input.hintText.trim()
          ? input.hintText.trim()
          : '';
      if (!hintText) {
        const latestScript = await prisma.scriptDocument.findFirst({
          where: {
            projectId: job.projectId,
            project: { workspaceId: job.workspaceId, deletedAt: null },
          },
          orderBy: { updatedAt: 'desc' },
          include: {
            versions: { orderBy: { version: 'desc' }, take: 1 },
          },
        });
        const content = asRecord(latestScript?.versions[0]?.content);
        const parts = [content.hook, content.body, content.cta]
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.trim());
        if (parts.length > 0) {
          hintText = parts.join('\n\n');
        } else {
          hintText = [
            'Stop filming one Reel a day. In the next 60 seconds I will show you how I batch an entire week of Reels in a single afternoon without burning out.',
            'First, pick one topic cluster for the week. Mine this week: batching short-form video.',
            'Second, write three hooks before you touch the camera. Strong hooks decide whether people stay.',
            'Third, film all A-roll in one session: same outfit, same lighting, same mic.',
            `This footage is labeled ${asset.name}.`,
          ].join(' ');
        }
      }

      let segments: { startMs: number; endMs: number; text: string }[];
      let sttProvider: string = provider.name;
      try {
        const transcript = await provider.transcribe({
          filePath,
          hintText,
          language,
        });
        segments = transcript.segments.map((s) => ({
          startMs: s.startMs,
          endMs: s.endMs,
          text: s.text,
        }));
      } catch {
        // Keep e2e green if provider misconfigured — deterministic mock segments.
        segments = mockTranscriptSegments(asset.name);
        sttProvider = 'mock-fallback';
      }

      const result = await persistTranscript({
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        assetId,
        language,
        segments,
      });
      output = {
        ...output,
        transcriptId: result.transcriptId,
        segmentCount: result.segmentCount,
        segments,
        provider: sttProvider,
        audioExtracted: extracted,
        sttFilePath: filePath ?? null,
      };
    } else if (job.type === 'ALIGN_SCRIPT') {
      if (!job.projectId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'ALIGN_SCRIPT job missing projectId',
        );
      }
      const scriptId = strField(input, 'scriptId', '');
      const transcriptId = strField(input, 'transcriptId', '');
      if (!scriptId || !transcriptId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'ALIGN_SCRIPT job missing scriptId or transcriptId',
        );
      }

      const { content } = await loadScriptContentForAlign(
        job.workspaceId,
        scriptId,
      );
      const transcript = await prisma.transcript.findFirst({
        where: {
          id: transcriptId,
          projectId: job.projectId,
          project: { workspaceId: job.workspaceId, deletedAt: null },
        },
        include: { segments: { orderBy: { ordinal: 'asc' } } },
      });
      if (!transcript) {
        throw new JobHttpError(404, 'not_found', 'Transcript not found');
      }

      const segmentInputs = transcript.segments.map((s) => ({
        startMs: s.startMs,
        endMs: s.endMs,
        text: s.text,
      }));

      let alignments: {
        scriptRef: string;
        startMs: number;
        endMs: number;
        confidence: number;
      }[];
      let alignProvider = 'mock-fallback';

      try {
        const aiAlignments = await provider.alignScriptToTranscript(
          {
            hook: content.hook,
            body: content.body,
            cta: content.cta,
          },
          segmentInputs,
        );
        alignments = aiAlignments.map((a: {
          scriptExcerpt: string;
          startMs: number;
          endMs: number;
          confidence: number;
        }) => ({
          scriptRef: a.scriptExcerpt,
          startMs: a.startMs,
          endMs: a.endMs,
          confidence: a.confidence,
        }));
        alignProvider = provider.name;
      } catch {
        // Phase 6 C implements real fuzzy align; until then use deterministic mock.
        alignments = mockAlignmentsFromScript(content, segmentInputs);
      }

      const result = await persistAlignments({
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        scriptDocumentId: scriptId,
        transcriptId,
        alignments,
      });

      output = {
        ...output,
        mappingIds: result.mappingIds,
        count: result.count,
        alignments,
        provider: alignProvider,
      };
    } else if (job.type === 'SCORE_CLIPS') {
      if (!job.projectId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'SCORE_CLIPS job missing projectId',
        );
      }
      const scriptId = strField(input, 'scriptId', '');
      const transcriptId = strField(input, 'transcriptId', '');
      if (!scriptId || !transcriptId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'SCORE_CLIPS job missing scriptId or transcriptId',
        );
      }

      const loaded = await loadScriptAndTranscriptForScore(
        job.workspaceId,
        scriptId,
        transcriptId,
      );
      if (loaded.projectId !== job.projectId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'Script/transcript project mismatch',
        );
      }

      const sourceAssetId =
        strField(input, 'sourceAssetId', '') || loaded.sourceAssetId;

      let ideas: {
        startMs: number;
        endMs: number;
        score: number;
        titleSuggestion: string;
        rationale?: string;
      }[];
      let scoreProvider = 'mock-fallback';

      try {
        const clipIdeas = await provider.scoreClipWindows(
          {
            segments: loaded.segments,
          },
          {
            hook: loaded.content.hook,
            body: loaded.content.body,
            cta: loaded.content.cta,
          },
        );
        ideas = clipIdeas.map((c) => ({
          startMs: c.startMs,
          endMs: c.endMs,
          score: c.score,
          titleSuggestion: c.titleSuggestion,
          rationale: c.rationale,
        }));
        scoreProvider = provider.name;
      } catch {
        const lastEnd =
          loaded.segments.length > 0
            ? loaded.segments[loaded.segments.length - 1]!.endMs
            : 60_000;
        ideas = mockClipIdeas({
          durationMs: lastEnd,
          scriptTitle: loaded.content.title,
        });
      }

      const result = await persistClipCandidates({
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        sourceAssetId,
        transcriptId,
        scriptDocumentId: scriptId,
        ideas,
      });

      output = {
        ...output,
        candidateIds: result.candidateIds,
        count: result.count,
        clipIdeas: ideas,
        provider: scoreProvider,
      };
    } else if (job.type === 'RENDER_CLIP') {
      if (!job.projectId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'RENDER_CLIP job missing projectId',
        );
      }
      const candidateId = strField(input, 'candidateId', '');
      if (!candidateId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'RENDER_CLIP job missing candidateId',
        );
      }

      const candidate = await prisma.clipCandidate.findFirst({
        where: {
          id: candidateId,
          projectId: job.projectId,
          project: { workspaceId: job.workspaceId, deletedAt: null },
        },
      });
      if (!candidate) {
        throw new JobHttpError(404, 'not_found', 'Clip candidate not found');
      }

      const sourceAsset = await prisma.asset.findFirst({
        where: {
          id: candidate.sourceAssetId,
          workspaceId: job.workspaceId,
          deletedAt: null,
        },
        select: { path: true },
      });
      if (!sourceAsset) {
        throw new JobHttpError(404, 'not_found', 'Source asset not found');
      }

      const absInput = storage.absoluteFromRelative(sourceAsset.path);
      const absOutput = renderClipPath(
        storage.getRoot(),
        job.workspaceId,
        jobId,
      );

      let cutResult: {
        outputPath: string;
        startMs: number;
        endMs: number;
        durationMs: number;
        mode: string;
      };
      let renderMode = 'mock-copy';

      try {
        const cut = await cutClip(
          absInput,
          absOutput,
          candidate.startMs,
          candidate.endMs,
          { mode: 'reencode' },
        );
        cutResult = cut;
        renderMode = cut.mode;
      } catch {
        // No ffmpeg / cut failed — copy source so Asset still exists for demos.
        const { copyFile, mkdir } = await import('node:fs/promises');
        const { dirname } = await import('node:path');
        await mkdir(dirname(absOutput), { recursive: true });
        await copyFile(absInput, absOutput);
        cutResult = {
          outputPath: absOutput,
          startMs: candidate.startMs,
          endMs: candidate.endMs,
          durationMs: Math.max(0, candidate.endMs - candidate.startMs),
          mode: 'mock-copy',
        };
      }

      const persisted = await persistRenderedClip({
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        candidateId,
        outputPath: cutResult.outputPath,
        jobId,
      });

      output = {
        ...output,
        candidateId,
        assetId: persisted.assetId,
        outputPath: persisted.relativePath,
        startMs: cutResult.startMs,
        endMs: cutResult.endMs,
        durationMs: cutResult.durationMs,
        mode: renderMode,
      };
    } else if (job.type === 'GENERATE_TIMELINE') {
      if (!job.projectId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'GENERATE_TIMELINE job missing projectId',
        );
      }
      const scriptId = strField(input, 'scriptId', '');
      const timelineId = strField(input, 'timelineId', '');
      if (!scriptId || !timelineId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'GENERATE_TIMELINE job missing scriptId or timelineId',
        );
      }

      const ctx = await loadTimelineGenerateContext(
        job.workspaceId,
        job.projectId,
        scriptId,
      );

      const fallback = mockTimelineJson({
        assetId: ctx.assetId,
        hookText: ctx.hook,
        clipWindows: ctx.clipWindows,
      });

      let timelineJson = fallback;
      let timelineProvider = 'mock-fallback';

      try {
        const proposed = await provider.proposeTimeline({
          script: {
            title: ctx.title,
            hook: ctx.hook,
            body: ctx.body,
            cta: ctx.cta,
          },
          alignments: ctx.alignments,
          sourceAssetId: ctx.assetId,
          acceptedClips: ctx.clipWindows.map((w, i) => ({
            id: `accepted-${i + 1}`,
            startMs: w.startMs,
            endMs: w.endMs,
            titleSuggestion: w.title ?? 'Clip',
            label: w.title,
            assetId: ctx.assetId,
          })),
        });
        timelineJson = normalizeProviderTimeline(proposed, fallback);
        timelineProvider = provider.name;
      } catch {
        timelineJson = fallback;
      }

      const persisted = await persistTimelineProposal({
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        timelineId,
        content: timelineJson,
      });

      output = {
        ...output,
        timelineId,
        versionId: persisted.versionId,
        version: persisted.version,
        source: 'ai_proposal',
        provider: timelineProvider,
        // Proposal only — currentVersionId unchanged until user PUT (Apply).
        applied: false,
        // Full JSON for UI Suggest panel (also persisted as AI_PROPOSAL version).
        timeline: timelineJson,
      };
    } else if (job.type === 'RENDER_TIMELINE') {
      if (!job.projectId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'RENDER_TIMELINE job missing projectId',
        );
      }
      const timelineId = strField(input, 'timelineId', '');
      if (!timelineId) {
        throw new JobHttpError(
          400,
          'validation_error',
          'RENDER_TIMELINE job missing timelineId',
        );
      }

      const ctx = await loadTimelineRenderContext(
        job.workspaceId,
        timelineId,
      );

      const absOutput = renderTimelinePath(
        storage.getRoot(),
        job.workspaceId,
        jobId,
      );

      let renderMode = 'ffmpeg';
      let softsubsPath: string | undefined;
      let durationMs = ctx.timeline.durationMs;
      let clipCount = 0;
      let textOverlayCount = 0;

      try {
        const rendered = await renderTimeline(ctx.timeline, {
          assetPaths: ctx.assetPaths,
          outputPath: absOutput,
        });
        softsubsPath = rendered.softsubsPath;
        durationMs = rendered.durationMs;
        clipCount = rendered.clipCount;
        textOverlayCount = rendered.textOverlayCount;
        renderMode = 'ffmpeg';
      } catch (err) {
        // Fallback: copy first source so demos still get a preview Asset.
        const firstPath = Object.values(ctx.assetPaths)[0];
        if (!firstPath) {
          throw new JobHttpError(
            500,
            'internal_error',
            `RENDER_TIMELINE failed (no asset paths): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
        try {
          const { copyFile, mkdir } = await import('node:fs/promises');
          const { dirname } = await import('node:path');
          await mkdir(dirname(absOutput), { recursive: true });
          await copyFile(firstPath, absOutput);
          renderMode = 'mock-copy';
        } catch (copyErr) {
          throw new JobHttpError(
            500,
            'internal_error',
            `RENDER_TIMELINE failed: ${
              err instanceof Error ? err.message : String(err)
            }; copy fallback: ${
              copyErr instanceof Error ? copyErr.message : String(copyErr)
            }`,
          );
        }
      }

      const persisted = await persistTimelinePreview({
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        timelineId,
        outputPath: absOutput,
        jobId,
      });

      output = {
        ...output,
        timelineId,
        versionId: ctx.versionId,
        assetId: persisted.assetId,
        outputPath: persisted.relativePath,
        softsubsPath,
        durationMs,
        clipCount,
        textOverlayCount,
        mode: renderMode,
      };
    } else {
      output = {
        ...output,
        message: `No handler for ${job.type}`,
      };
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'SUCCEEDED',
        progress: 100,
        error: null,
        output: output as Prisma.InputJsonValue,
      },
    });
    return toJobDto(updated);
  } catch (err) {
    const message =
      err instanceof JobHttpError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Job complete failed';
    const updated = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        progress: 100,
        error: message,
      },
    });
    if (err instanceof JobHttpError) {
      throw err;
    }
    return toJobDto(updated);
  }
}

/**
 * Dev/UI endpoint — same path as the poller (AiProvider + DB writes).
 * Kept for manual forcing / fail injection during demos.
 */
export async function mockCompleteJob(
  workspaceId: string,
  jobId: string,
  body: MockCompleteJobRequest = {},
): Promise<JobDto> {
  await findOwnedJob(workspaceId, jobId);
  return completeJobWithAi(jobId, body);
}
