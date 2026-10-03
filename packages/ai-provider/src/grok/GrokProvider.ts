import type { Platform } from '@creatorai/shared';
import { fuzzyAlignScriptToTranscript } from '../align/fuzzyAlign';
import { httpErrorFromResponse } from '../httpErrors';
import { MockAiProvider } from '../mock/MockAiProvider';
import { clampSupportingItem } from '../platform/generatePlatformCopy';
import { mockTranscribeFromText } from '../stt/mockTranscribe';
import {
  HOOK_OVERLAY_END_MS,
  HOOK_OVERLAY_START_MS,
  assertValidTimelineShape,
  proposeTimelineFromContext,
} from '../timeline/proposeTimeline';
import {
  AiProviderError,
  type AiProvider,
  type Alignment,
  type ClipIdea,
  type EditTimeline,
  type ScriptDoc,
  type ScriptGenInput,
  type ScriptGenResult,
  type SupportingContent,
  type SupportingContentItem,
  type TimelineAcceptedClip,
  type TimelineAssetSummary,
  type TimelineAudioClip,
  type TimelineContext,
  type TimelineVideoClip,
  type Transcript,
  type TranscriptSegment,
  type TranscribeInput,
} from '../types';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** Cheapest widely available Grok chat model on the xAI API (override via XAI_MODEL). */
const DEFAULT_MODEL = 'grok-4.3';
const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions';

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new AiProviderError('Grok response did not contain a JSON object', 'parse_error');
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new AiProviderError('Failed to parse Grok JSON', 'parse_error');
  }
}

function summarizeAssets(assets: TimelineAssetSummary[] | undefined) {
  if (!assets || assets.length === 0) return [];
  return assets.slice(0, 40).map((a) => ({
    id: a.id,
    type: a.type,
    name: a.name,
    description: a.description ?? null,
    tags: a.tags ?? [],
    durationMs: a.durationMs ?? null,
  }));
}

type GrokVisualClip = {
  assetId: string;
  mediaKind?: 'video' | 'image';
  srcStartMs?: number;
  srcEndMs?: number;
  holdMs?: number;
  label?: string;
};

type GrokAudioClip = {
  assetId: string;
  srcStartMs?: number;
  srcEndMs?: number;
  timelineStartMs?: number;
  label?: string;
};

type GrokTimelinePlan = {
  visualClips?: GrokVisualClip[];
  audioClips?: GrokAudioClip[];
  rationale?: string;
  changes?: string[];
};

function buildFromGrokPlan(
  ctx: TimelineContext,
  plan: GrokTimelinePlan,
): EditTimeline | null {
  const assets = ctx.assets ?? [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  const fallbackAssetId = ctx.sourceAssetId?.trim();
  const visuals = Array.isArray(plan.visualClips) ? plan.visualClips : [];
  if (visuals.length === 0) return null;

  let cursor = 0;
  const videoClips: TimelineVideoClip[] = [];
  for (let i = 0; i < visuals.length; i += 1) {
    const v = visuals[i]!;
    const asset = byId.get(v.assetId);
    // Skip audio-only asset ids on the visual track
    if (asset?.type === 'AUDIO') continue;

    const mediaKind: 'video' | 'image' =
      v.mediaKind === 'image' || asset?.type === 'IMAGE'
        ? 'image'
        : 'video';

    const assetId = v.assetId || fallbackAssetId;
    if (!assetId) continue;

    let srcStartMs = Math.max(0, Math.floor(v.srcStartMs ?? 0));
    let srcEndMs =
      typeof v.srcEndMs === 'number' && v.srcEndMs > srcStartMs
        ? Math.floor(v.srcEndMs)
        : undefined;

    if (mediaKind === 'image') {
      const hold = Math.max(
        500,
        Math.floor(v.holdMs ?? (srcEndMs != null ? srcEndMs - srcStartMs : 3000)),
      );
      srcStartMs = 0;
      srcEndMs = hold;
    } else if (srcEndMs == null) {
      const dur = asset?.durationMs ?? 5000;
      srcEndMs = Math.min(dur, srcStartMs + Math.max(1000, Math.floor(dur)));
      if (srcEndMs <= srcStartMs) srcEndMs = srcStartMs + 3000;
    }

    const clip: TimelineVideoClip = {
      id: `c${i + 1}`,
      assetId,
      srcStartMs,
      srcEndMs,
      timelineStartMs: cursor,
      label: v.label ?? asset?.name,
      mediaKind,
    };
    cursor += srcEndMs - srcStartMs;
    videoClips.push(clip);
  }

  if (videoClips.length === 0) return null;

  const durationMs = Math.max(
    cursor,
    videoClips[videoClips.length - 1]!.timelineStartMs +
      (videoClips[videoClips.length - 1]!.srcEndMs -
        videoClips[videoClips.length - 1]!.srcStartMs),
  );

  const audioClips: TimelineAudioClip[] = [];
  const plannedAudio = Array.isArray(plan.audioClips) ? plan.audioClips : [];
  for (let i = 0; i < plannedAudio.length; i += 1) {
    const a = plannedAudio[i]!;
    const asset = byId.get(a.assetId);
    if (asset && asset.type !== 'AUDIO') continue;
    if (!a.assetId) continue;
    const srcStartMs = Math.max(0, Math.floor(a.srcStartMs ?? 0));
    const defaultDur = asset?.durationMs ?? 5000;
    const srcEndMs = Math.max(
      srcStartMs + 250,
      Math.floor(a.srcEndMs ?? Math.min(defaultDur, srcStartMs + defaultDur)),
    );
    audioClips.push({
      id: `a${i + 1}`,
      assetId: a.assetId,
      srcStartMs,
      srcEndMs,
      timelineStartMs: Math.max(0, Math.floor(a.timelineStartMs ?? 0)),
      label: a.label ?? asset?.name,
    });
  }

  const hook =
    (ctx.script.hook ?? '').trim().split(/(?<=[.!?])\s+/)[0] ||
    ctx.script.title ||
    'Hook';
  const hookText =
    hook.length > 90 ? `${hook.slice(0, 87).trimEnd()}…` : hook;

  const changes = Array.isArray(plan.changes)
    ? plan.changes.map(String).filter(Boolean).slice(0, 8)
    : [];
  const rationale =
    typeof plan.rationale === 'string' ? plan.rationale.trim() : '';

  const timeline: EditTimeline = {
    schemaVersion: '1.0',
    fps: 30,
    durationMs,
    tracks: [
      { id: 'v1', type: 'video', clips: videoClips },
      ...(audioClips.length > 0
        ? [{ id: 'a1', type: 'audio' as const, clips: audioClips }]
        : [{ id: 'a1', type: 'audio' as const, clips: [] }]),
      {
        id: 't1',
        type: 'text',
        items: [
          {
            id: 'tx-hook',
            text: hookText.slice(0, 120),
            startMs: HOOK_OVERLAY_START_MS,
            endMs: HOOK_OVERLAY_END_MS,
            style: { position: 'bottom', fontSize: 48 },
          },
        ],
      },
      { id: 'cap1', type: 'captions', items: [] },
    ],
    transitions: [],
    meta: {
      generatedBy: 'ai',
      prompt: 'grok asset-aware proposeTimeline',
      notes: [rationale, ...changes.map((c) => `• ${c}`)]
        .filter(Boolean)
        .join('\n')
        .slice(0, 2000),
    },
  };

  assertValidTimelineShape(timeline);
  return timeline;
}

/**
 * xAI Grok via OpenAI-compatible Chat Completions.
 * Uses prepaid / signup credits on console.x.ai (`XAI_API_KEY`).
 */
export class GrokProvider implements AiProvider {
  readonly name = 'grok' as const;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly mockFallback = new MockAiProvider();

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.apiKey =
      opts?.apiKey ??
      process.env.XAI_API_KEY ??
      process.env.GROK_API_KEY ??
      '';
    this.model =
      opts?.model ??
      process.env.XAI_MODEL ??
      process.env.GROK_MODEL ??
      DEFAULT_MODEL;
    if (!this.apiKey) {
      throw new AiProviderError(
        'XAI_API_KEY is required when AI_PROVIDER=grok (get one at https://console.x.ai)',
        'missing_api_key',
      );
    }
  }

  private async chat(
    messages: ChatMessage[],
    opts?: { json?: boolean },
  ): Promise<string> {
    const wantJson = opts?.json !== false;
    const body: Record<string, unknown> = {
      model: this.model,
      temperature: 0.7,
      messages,
    };
    if (wantJson) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(XAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    // Some models reject response_format — retry once without it.
    if (!res.ok && wantJson && (res.status === 400 || res.status === 422)) {
      return this.chat(messages, { json: false });
    }

    if (!res.ok) {
      const errBody = await res.text();
      throw httpErrorFromResponse('Grok', res.status, errBody);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AiProviderError('Grok returned empty content', 'parse_error');
    }
    return content;
  }

  async generateScript(input: ScriptGenInput): Promise<ScriptGenResult> {
    const assets = summarizeAssets(input.assets);
    const content = await this.chat([
      {
        role: 'system',
        content: [
          'You are a short-form video scriptwriter.',
          'Reply with JSON only: { "title", "hook", "body", "cta" }.',
          'Hook grabs attention in 1–2 lines; body is spoken beats; CTA is a clear next step.',
          'When assets are provided, write lines that can actually be covered by those videos/images/audio',
          '(mention stills vs b-roll vs VO where helpful, without inventing media you do not have).',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          topic: input.topic,
          audience: input.audience,
          tone: input.tone,
          platform: input.platform,
          refineInstruction: input.refineInstruction ?? null,
          assets,
        }),
      },
    ]);
    const parsed = extractJsonObject(content) as {
      title?: string;
      hook?: string;
      body?: string;
      cta?: string;
    };
    const title = parsed.title?.trim() || input.topic;
    const hook = parsed.hook?.trim() || '';
    const body = parsed.body?.trim() || '';
    const cta = parsed.cta?.trim() || '';
    if (!hook || !body || !cta) {
      throw new AiProviderError('Grok script missing hook/body/cta', 'parse_error');
    }
    return {
      title,
      hook,
      body,
      cta,
      fullText: `## Hook\n\n${hook}\n\n## Body\n\n${body}\n\n## CTA\n\n${cta}`,
      provider: this.name,
      model: this.model,
    };
  }

  async generateHooks(script: string, n: number): Promise<string[]> {
    const count = Math.max(1, Math.min(n || 3, 10));
    const content = await this.chat([
      {
        role: 'system',
        content: `Return JSON { "hooks": string[] } with exactly ${count} short-form video hooks.`,
      },
      { role: 'user', content: script.slice(0, 6000) },
    ]);
    const parsed = extractJsonObject(content) as { hooks?: unknown };
    if (!Array.isArray(parsed.hooks)) {
      throw new AiProviderError('Grok hooks response invalid', 'parse_error');
    }
    return parsed.hooks.map(String).slice(0, count);
  }

  async generateSupporting(
    script: string,
    platforms: Platform[],
  ): Promise<SupportingContent> {
    const content = await this.chat([
      {
        role: 'system',
        content:
          'Return JSON { "byPlatform": { "<PLATFORM>": { "titles": string[], "captions": string[], "hashtags": string[] } } }. Soft limits: Reels/TikTok title≤40 caption≤150–300; Shorts/YT title≤70; LinkedIn caption≤600. Distinct copy per platform.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          platforms,
          script: script.slice(0, 6000),
        }),
      },
    ]);
    const parsed = extractJsonObject(content) as {
      byPlatform?: SupportingContent['byPlatform'];
    };
    const raw = parsed.byPlatform ?? {};
    const byPlatform: SupportingContent['byPlatform'] = {};
    for (const [key, item] of Object.entries(raw)) {
      if (!item) continue;
      byPlatform[key] = clampSupportingItem(
        key,
        item as SupportingContentItem,
      );
    }
    return {
      byPlatform,
      provider: this.name,
      model: this.model,
    };
  }

  async transcribe(input: TranscribeInput): Promise<Transcript> {
    if (input.hintText?.trim()) {
      return mockTranscribeFromText(input.hintText, {
        durationMs: input.durationMs,
      });
    }
    // xAI chat API has no Whisper equivalent here — keep STT on mock/OpenAI.
    return this.mockFallback.transcribe(input);
  }

  async alignScriptToTranscript(
    script: ScriptDoc,
    segments: TranscriptSegment[],
  ): Promise<Alignment[]> {
    return fuzzyAlignScriptToTranscript(script, segments);
  }

  async scoreClipWindows(
    transcript: Transcript,
    script: ScriptDoc,
  ): Promise<ClipIdea[]> {
    return this.mockFallback.scoreClipWindows(transcript, script);
  }

  /**
   * Analyse project assets (video / image / audio) + script and propose an
   * accurate timeline: image hold durations, clip order, and parallel audio.
   */
  async proposeTimeline(ctx: TimelineContext): Promise<EditTimeline> {
    const assets = summarizeAssets(ctx.assets);
    const accepted: TimelineAcceptedClip[] = ctx.acceptedClips ?? [];

    // No asset catalog → deterministic builder (same as other providers).
    if (assets.length === 0 && accepted.length === 0) {
      return proposeTimelineFromContext(ctx);
    }

    try {
      const content = await this.chat([
        {
          role: 'system',
          content: [
            'You are a short-form video editor AI.',
            'Analyse the project assets and script, then propose concrete timeline changes.',
            'Reply JSON only with shape:',
            '{',
            '  "visualClips": [{ "assetId", "mediaKind": "video"|"image", "srcStartMs", "srcEndMs", "holdMs", "label" }],',
            '  "audioClips": [{ "assetId", "srcStartMs", "srcEndMs", "timelineStartMs", "label" }],',
            '  "rationale": string,',
            '  "changes": string[]',
            '}',
            'Rules:',
            '- Use only asset ids from the provided assets list (or accepted clip assetIds).',
            '- IMAGE assets: mediaKind=image; set holdMs (typically 2000–5000) — src range is the hold window.',
            '- VIDEO assets: mediaKind=video; trim with srcStartMs/srcEndMs within durationMs when known.',
            '- AUDIO assets go only in audioClips; align timelineStartMs to script beats.',
            '- Order visualClips as a contiguous sequence (hook → body → CTA).',
            '- Prefer mixing stills + video when both exist; always use available audio beds.',
            '- Keep total runtime roughly 15–60s when possible.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            script: {
              title: ctx.script.title,
              hook: ctx.script.hook,
              body: ctx.script.body,
              cta: ctx.script.cta,
            },
            assets,
            acceptedClips: accepted.slice(0, 12).map((c) => ({
              assetId: c.assetId,
              startMs: c.startMs,
              endMs: c.endMs,
              label: c.label ?? c.titleSuggestion,
            })),
            sourceAssetId: ctx.sourceAssetId ?? null,
            alignments: (ctx.alignments ?? []).slice(0, 12),
          }),
        },
      ]);

      const plan = extractJsonObject(content) as GrokTimelinePlan;
      const built = buildFromGrokPlan(ctx, plan);
      if (built) return built;
    } catch {
      // Fall through to deterministic builder
    }

    return proposeTimelineFromContext(ctx);
  }
}
