/**
 * Worker-side AI helper — thin wrapper around `@creatorai/ai-provider`.
 */
import { createAiProvider, type AiProvider } from '@creatorai/ai-provider';

let cached: AiProvider | null = null;

/** Returns a process-wide provider from `AI_PROVIDER` (default mock). */
export function getWorkerAiProvider(): AiProvider {
  if (!cached) {
    cached = createAiProvider();
  }
  return cached;
}

/** Test helper — clear cached instance after env changes. */
export function resetWorkerAiProvider(): void {
  cached = null;
}
