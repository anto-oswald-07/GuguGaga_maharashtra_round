/**
 * OpenAI Whisper transcription via multipart fetch (no SDK).
 * Uses `verbose_json` so we get timed segments.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AiProviderError, type Transcript, type TranscriptSegment } from '../types';

export type WhisperTranscribeOptions = {
  apiKey: string;
  /** Default whisper-1 */
  model?: string;
  language?: string;
  filePath?: string;
  audio?: { data: Buffer | Uint8Array; mimeType: string; filename?: string };
};

function toSegments(raw: unknown): TranscriptSegment[] {
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const segs = Array.isArray(o.segments) ? o.segments : [];
  const out: TranscriptSegment[] = [];
  for (const s of segs) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    const text = typeof r.text === 'string' ? r.text.trim() : '';
    if (!text) continue;
    const start =
      typeof r.start === 'number'
        ? r.start
        : typeof r.start === 'string'
          ? Number(r.start)
          : 0;
    const end =
      typeof r.end === 'number'
        ? r.end
        : typeof r.end === 'string'
          ? Number(r.end)
          : start;
    out.push({
      startMs: Math.round(start * 1000),
      endMs: Math.round(Math.max(end, start) * 1000),
      text,
    });
  }
  // Fallback: whole text as one segment
  if (out.length === 0 && typeof o.text === 'string' && o.text.trim()) {
    out.push({ startMs: 0, endMs: 5000, text: o.text.trim() });
  }
  return out;
}

export async function whisperTranscribe(
  opts: WhisperTranscribeOptions,
): Promise<Transcript> {
  if (!opts.apiKey) {
    throw new AiProviderError(
      'OPENAI_API_KEY is required for Whisper transcription',
      'missing_api_key',
    );
  }

  let bytes: Buffer;
  let filename: string;
  let mimeType: string;

  if (opts.audio) {
    bytes = Buffer.isBuffer(opts.audio.data)
      ? opts.audio.data
      : Buffer.from(opts.audio.data);
    filename = opts.audio.filename ?? 'audio.wav';
    mimeType = opts.audio.mimeType;
  } else if (opts.filePath) {
    bytes = await readFile(opts.filePath);
    filename = path.basename(opts.filePath);
    const ext = path.extname(filename).toLowerCase();
    mimeType =
      ext === '.mp3'
        ? 'audio/mpeg'
        : ext === '.wav'
          ? 'audio/wav'
          : ext === '.m4a'
            ? 'audio/mp4'
            : ext === '.webm'
              ? 'audio/webm'
              : 'application/octet-stream';
  } else {
    throw new AiProviderError(
      'Whisper requires filePath or audio bytes',
      'invalid_config',
    );
  }

  const form = new FormData();
  form.append('model', opts.model ?? process.env.OPENAI_WHISPER_MODEL ?? 'whisper-1');
  form.append('response_format', 'verbose_json');
  if (opts.language) form.append('language', opts.language);
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: mimeType });
  form.append('file', blob, filename);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${opts.apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AiProviderError(
      `Whisper HTTP ${res.status}: ${body.slice(0, 300)}`,
      'http_error',
    );
  }

  const json = (await res.json()) as unknown;
  return { segments: toSegments(json) };
}
