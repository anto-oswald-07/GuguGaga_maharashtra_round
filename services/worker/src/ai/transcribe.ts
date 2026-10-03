/**
 * Worker STT helper — wraps AiProvider.transcribe.
 */
import {
  createAiProvider,
  type Transcript,
  type TranscribeInput,
} from '@creatorai/ai-provider';
import { getWorkerAiProvider } from './provider';

export async function transcribeAudio(
  input: TranscribeInput,
  opts?: { providerName?: string },
): Promise<Transcript> {
  const provider = opts?.providerName
    ? createAiProvider({ provider: opts.providerName })
    : getWorkerAiProvider();
  return provider.transcribe(input);
}
