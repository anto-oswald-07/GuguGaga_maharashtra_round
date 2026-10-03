import { isFallbackWorthy } from '../httpErrors';
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
  type TimelineContext,
  type Transcript,
  type TranscriptSegment,
  type TranscribeInput,
} from '../types';
import type { Platform } from '@creatorai/shared';

/**
 * Tries providers in order. On rate limit / quota / transient HTTP errors,
 * moves to the next backend. Last error is rethrown if every provider fails.
 */
export class FallbackAiProvider implements AiProvider {
  readonly name: AiProviderName;
  private readonly providers: AiProvider[];

  constructor(providers: AiProvider[], name: AiProviderName = 'auto') {
    if (providers.length === 0) {
      throw new AiProviderError(
        'FallbackAiProvider requires at least one provider',
        'invalid_config',
      );
    }
    this.providers = providers;
    this.name = name;
  }

  /** Providers currently in the chain (primary first). */
  get chain(): readonly AiProvider[] {
    return this.providers;
  }

  private async withFallback<T>(
    op: string,
    run: (p: AiProvider) => Promise<T>,
  ): Promise<T> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        return await run(provider);
      } catch (err) {
        if (!isFallbackWorthy(err)) {
          throw err;
        }
        const msg =
          err instanceof Error ? err.message : String(err);
        errors.push(`${provider.name}: ${msg}`);
        // continue
      }
    }
    throw new AiProviderError(
      `All AI providers failed for ${op}: ${errors.join(' | ')}`.slice(
        0,
        1500,
      ),
      'http_error',
    );
  }

  generateScript(input: ScriptGenInput): Promise<ScriptGenResult> {
    return this.withFallback('generateScript', (p) =>
      p.generateScript(input),
    );
  }

  generateHooks(script: string, n: number): Promise<string[]> {
    return this.withFallback('generateHooks', (p) =>
      p.generateHooks(script, n),
    );
  }

  generateSupporting(
    script: string,
    platforms: Platform[],
  ): Promise<SupportingContent> {
    return this.withFallback('generateSupporting', (p) =>
      p.generateSupporting(script, platforms),
    );
  }

  transcribe(input: TranscribeInput): Promise<Transcript> {
    return this.withFallback('transcribe', (p) => p.transcribe(input));
  }

  alignScriptToTranscript(
    script: ScriptDoc,
    segments: TranscriptSegment[],
  ): Promise<Alignment[]> {
    return this.withFallback('alignScriptToTranscript', (p) =>
      p.alignScriptToTranscript(script, segments),
    );
  }

  scoreClipWindows(
    transcript: Transcript,
    script: ScriptDoc,
  ): Promise<ClipIdea[]> {
    return this.withFallback('scoreClipWindows', (p) =>
      p.scoreClipWindows(transcript, script),
    );
  }

  proposeTimeline(ctx: TimelineContext): Promise<EditTimeline> {
    return this.withFallback('proposeTimeline', (p) =>
      p.proposeTimeline(ctx),
    );
  }
}
