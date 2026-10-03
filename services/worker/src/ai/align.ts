/**
 * Worker alignment helper — wraps AiProvider.alignScriptToTranscript
 * (fuzzy match MVP in @creatorai/ai-provider).
 */
import {
  createAiProvider,
  type Alignment,
  type ScriptDoc,
  type TranscriptSegment,
} from '@creatorai/ai-provider';
import { getWorkerAiProvider } from './provider';

export async function alignScript(
  script: ScriptDoc,
  segments: TranscriptSegment[],
  opts?: { providerName?: string },
): Promise<Alignment[]> {
  const provider = opts?.providerName
    ? createAiProvider({ provider: opts.providerName })
    : getWorkerAiProvider();
  return provider.alignScriptToTranscript(script, segments);
}
