/**
 * Worker clip-scoring helper — wraps AiProvider.scoreClipWindows
 * (heuristic MVP in @creatorai/ai-provider).
 */
import {
  createAiProvider,
  type ClipIdea,
  type ScriptDoc,
  type Transcript,
} from '@creatorai/ai-provider';
import { getWorkerAiProvider } from './provider';

export async function scoreClips(
  transcript: Transcript,
  script: ScriptDoc,
  opts?: { providerName?: string },
): Promise<ClipIdea[]> {
  const provider = opts?.providerName
    ? createAiProvider({ provider: opts.providerName })
    : getWorkerAiProvider();
  return provider.scoreClipWindows(transcript, script);
}
