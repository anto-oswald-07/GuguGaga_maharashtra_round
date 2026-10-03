import type { Platform } from '@creatorai/shared';
import { fuzzyAlignScriptToTranscript } from '../align/fuzzyAlign';
import { httpErrorFromResponse } from '../httpErrors';
import { MockAiProvider } from '../mock/MockAiProvider';
import { clampSupportingItem } from '../platform/generatePlatformCopy';
import { mockTranscribeFromText } from '../stt/mockTranscribe';
import {
  AiProviderError,
  type AiProvider,
  type AiProviderName,
  type Alignment,
  type ClipIdea,
  type EditTimeline,
  type ScriptDoc,
  type ScriptGenInput,
  type ScriptGenResult,
  type SupportingContent,
  type SupportingContentItem,
  type TimelineAssetSummary,
  type TimelineContext,
  type Transcript,
  type TranscriptSegment,
  type TranscribeInput,
} from '../types';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenAiCompatibleConfig = {
  name: AiProviderName;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  missingKeyMessage: string;
  /** Extra request headers (OpenRouter referer, etc.). */
  headers?: Record<string, string>;
  /** Retry once without response_format when the host rejects it. */
  retryWithoutJsonFormat?: boolean;
};

function extractJsonObject(text: string, label: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new AiProviderError(
      `${label} response did not contain a JSON object`,
      'parse_error',
    );
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new AiProviderError(`Failed to parse ${label} JSON`, 'parse_error');
  }
}

/** Coerce model JSON fields that sometimes arrive as arrays/objects. */
function asTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => asTrimmedString(v))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (value && typeof value === 'object') {
    const maybeText = (value as { text?: unknown }).text;
    if (typeof maybeText === 'string') return maybeText.trim();
  }
  return '';
}

function messageContentToString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as { text?: unknown; content?: unknown };
          if (typeof p.text === 'string') return p.text;
          if (typeof p.content === 'string') return p.content;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
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

/**
 * Shared Chat Completions client for OpenAI-compatible hosts
 * (Groq, OpenRouter, Mistral, etc.).
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name: AiProviderName;
  private readonly label: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly extraHeaders: Record<string, string>;
  private readonly retryWithoutJsonFormat: boolean;
  private readonly mockFallback = new MockAiProvider();

  constructor(cfg: OpenAiCompatibleConfig) {
    this.name = cfg.name;
    this.label = cfg.label;
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.apiKey = cfg.apiKey;
    this.model = cfg.model;
    this.extraHeaders = cfg.headers ?? {};
    this.retryWithoutJsonFormat = cfg.retryWithoutJsonFormat !== false;
    if (!this.apiKey) {
      throw new AiProviderError(cfg.missingKeyMessage, 'missing_api_key');
    }
  }

  protected async chat(
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

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
        ...this.extraHeaders,
      },
      body: JSON.stringify(body),
    });

    if (
      !res.ok &&
      wantJson &&
      this.retryWithoutJsonFormat &&
      (res.status === 400 || res.status === 422)
    ) {
      return this.chat(messages, { json: false });
    }

    if (!res.ok) {
      const errBody = await res.text();
      throw httpErrorFromResponse(this.label, res.status, errBody);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = messageContentToString(data.choices?.[0]?.message?.content);
    if (!content.trim()) {
      throw new AiProviderError(
        `${this.label} returned empty content`,
        'parse_error',
      );
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
          'When assets are provided, write lines coverable by those videos/images/audio.',
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
    const parsed = extractJsonObject(content, this.label) as {
      title?: unknown;
      hook?: unknown;
      body?: unknown;
      cta?: unknown;
    };
    const title = asTrimmedString(parsed.title) || input.topic;
    const hook = asTrimmedString(parsed.hook);
    const body = asTrimmedString(parsed.body);
    const cta = asTrimmedString(parsed.cta);
    if (!hook || !body || !cta) {
      throw new AiProviderError(
        `${this.label} script missing hook/body/cta`,
        'parse_error',
      );
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
    const parsed = extractJsonObject(content, this.label) as {
      hooks?: unknown;
    };
    if (!Array.isArray(parsed.hooks)) {
      throw new AiProviderError(
        `${this.label} hooks response invalid`,
        'parse_error',
      );
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
          'Return JSON { "byPlatform": { "<PLATFORM>": { "titles": string[], "captions": string[], "hashtags": string[] } } }. Respect soft limits: Reels/TikTok title≤40 caption≤150–300; Shorts/YT title≤70; LinkedIn caption≤600. Distinct copy per platform.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          platforms,
          script: script.slice(0, 6000),
        }),
      },
    ]);
    const parsed = extractJsonObject(content, this.label) as {
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
    throw new AiProviderError(
      `${this.label} transcribe needs hintText (no native STT wired)`,
      'invalid_config',
    );
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

  async proposeTimeline(ctx: TimelineContext): Promise<EditTimeline> {
    return this.mockFallback.proposeTimeline(ctx);
  }
}
