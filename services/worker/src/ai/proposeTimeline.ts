/**
 * Worker timeline-proposal helper — wraps AiProvider.proposeTimeline
 * (deterministic builder in @creatorai/ai-provider).
 */
import {
  createAiProvider,
  type EditTimeline,
  type TimelineContext,
} from '@creatorai/ai-provider';
import { getWorkerAiProvider } from './provider';

export async function proposeTimeline(
  ctx: TimelineContext,
  opts?: { providerName?: string },
): Promise<EditTimeline> {
  const provider = opts?.providerName
    ? createAiProvider({ provider: opts.providerName })
    : getWorkerAiProvider();
  return provider.proposeTimeline(ctx);
}
