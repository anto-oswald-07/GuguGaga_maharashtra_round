import type { Platform } from '@creatorai/shared';
import { fuzzyAlignScriptToTranscript } from '../align/fuzzyAlign';
import { httpErrorFromResponse } from '../httpErrors';
import { MockAiProvider } from '../mock/MockAiProvider';
import { clampSupportingItem } from '../platform/generatePlatformCopy';
import { whisperTranscribe } from '../stt/whisperTranscribe';
import { mockTranscribeFromText } from '../stt/mockTranscribe';
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
  type TimelineContext,
  type Transcript,
  type TranscriptSegment,
  type TranscribeInput,
} from '../types';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const DEFAULT_MODEL = 'gpt-4o-mini';

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new AiProviderError('OpenAI response did not contain a JSON object', 'parse_error');
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new AiProviderError('Failed to parse OpenAI JSON', 'parse_error');
  }
}

/**
 * OpenAI Chat Completions via fetch (no SDK — keeps workspace light).
 * Requires `OPENAI_API_KEY`.
 */
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly mockFallback = new MockAiProvider();

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.model = opts?.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    if (!this.apiKey) {
      throw new AiProviderError(
        'OPENAI_API_KEY is required when AI_PROVIDER=openai',
        'missing_api_key',
      );
    }
  }

  private async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw httpErrorFromResponse('OpenAI', res.status, body);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AiProviderError('OpenAI returned empty content', 'parse_error');
    }
    return content;
  }

  async generateScript(input: ScriptGenInput): Promise<ScriptGenResult> {
    const content = await this.chat([
      {
        role: 'system',
        content:
          'You are a short-form video scriptwriter. Reply with JSON only: { "title", "hook", "body", "cta" }.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          topic: input.topic,
          audience: input.audience,
          tone: input.tone,
          platform: input.platform,
          refineInstruction: input.refineInstruction ?? null,
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
      throw new AiProviderError('OpenAI script missing hook/body/cta', 'parse_error');
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
      throw new AiProviderError('OpenAI hooks response invalid', 'parse_error');
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
    if (input.filePath || input.audio) {
      return whisperTranscribe({
        apiKey: this.apiKey,
        language: input.language,
        filePath: input.filePath,
        audio: input.audio,
      });
    }
    if (input.hintText?.trim()) {
      // No audio — deterministic mock segments from hint (useful in CI)
      return mockTranscribeFromText(input.hintText, {
        durationMs: input.durationMs,
      });
    }
    throw new AiProviderError(
      'OpenAI transcribe needs filePath, audio, or hintText',
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
