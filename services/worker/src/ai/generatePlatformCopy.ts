/**
 * Worker platform-copy helper — wraps AiProvider.generateSupporting
 * (platform-tuned titles/captions/hashtags in @creatorai/ai-provider).
 */
import type { Platform } from '@creatorai/shared';
import {
  createAiProvider,
  type SupportingContent,
} from '@creatorai/ai-provider';
import { getWorkerAiProvider } from './provider';

export async function generatePlatformCopy(
  script: string,
  platforms: Platform[],
  opts?: { providerName?: string },
): Promise<SupportingContent> {
  const provider = opts?.providerName
    ? createAiProvider({ provider: opts.providerName })
    : getWorkerAiProvider();
  return provider.generateSupporting(script, platforms);
}
