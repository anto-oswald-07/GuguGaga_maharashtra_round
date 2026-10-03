import type { Platform } from '@creatorai/shared';
import { fuzzyAlignScriptToTranscript } from '../align/fuzzyAlign';
import { MockAiProvider } from '../mock/MockAiProvider';
import { clampSupportingItem } from '../platform/generatePlatformCopy';
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

const DEFAULT_MODEL = 'gemini-2.0-flash';

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new AiProviderError('Gemini response did not contain a JSON object', 'parse_error');
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new AiProviderError('Failed to parse Gemini JSON', 'parse_error');
  }
}

/**
 * Google Gemini generateContent via fetch.
 * Requires `GEMINI_API_KEY`.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly mockFallback = new MockAiProvider();

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.GEMINI_API_KEY ?? '';
    this.model = opts?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
    if (!this.apiKey) {
      throw new AiProviderError(
        'GEMINI_API_KEY is required when AI_PROVIDER=gemini',
        'missing_api_key',
      );
    }
  }

  private async generate(prompt: string): Promise<string> {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new AiProviderError(
        `Gemini HTTP ${res.status}: ${body.slice(0, 300)}`,
        'http_error',
      );
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();
    if (!text) {
      throw new AiProviderError('Gemini returned empty content', 'parse_error');
    }
    return text;
  }

  async generateScript(input: ScriptGenInput): Promise<ScriptGenResult> {
    const prompt = `You are a short-form video scriptwriter. Reply with JSON only:
{ "title": string, "hook": string, "body": string, "cta": string }

Input:
${JSON.stringify(input)}`;
    const content = await this.generate(prompt);
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
      throw new AiProviderError('Gemini script missing hook/body/cta', 'parse_error');
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
    const content = await this.generate(
      `Return JSON { "hooks": string[] } with exactly ${count} hooks for this script:\n${script.slice(0, 6000)}`,
    );
    const parsed = extractJsonObject(content) as { hooks?: unknown };
    if (!Array.isArray(parsed.hooks)) {
      throw new AiProviderError('Gemini hooks response invalid', 'parse_error');
    }
    return parsed.hooks.map(String).slice(0, count);
  }

  async generateSupporting(
    script: string,
    platforms: Platform[],
  ): Promise<SupportingContent> {
    const content = await this.generate(
      `Return JSON { "byPlatform": { "<PLATFORM>": { "titles": string[], "captions": string[], "hashtags": string[] } } }
Respect soft limits (Reels/TikTok title≤40; Shorts/YT title≤70; LinkedIn caption≤600). Distinct copy per platform.
platforms=${JSON.stringify(platforms)}
script=${script.slice(0, 6000)}`,
    );
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

  /**
   * Gemini has no Whisper-equivalent in this MVP — use hintText mock segments,
   * or fall back to MockAiProvider when only a file path is given.
   */
  async transcribe(input: TranscribeInput): Promise<Transcript> {
    if (input.hintText?.trim()) {
      return mockTranscribeFromText(input.hintText);
    }
    if (input.filePath || input.audio) {
      return this.mockFallback.transcribe(input);
    }
    throw new AiProviderError(
      'Gemini transcribe needs hintText (or filePath for mock fallback)',
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
