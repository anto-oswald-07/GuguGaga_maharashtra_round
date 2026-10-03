import type { Platform } from '@creatorai/shared';
import { fuzzyAlignScriptToTranscript } from '../align/fuzzyAlign';
import { scoreClipWindowsFromTranscript } from '../clips/scoreClipWindows';
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
  type TimelineContext,
  type Transcript,
  type TranscriptSegment,
  type TranscribeInput,
} from '../types';

/** Stable hash → positive int for deterministic variation. */
function hashTopic(topic: string): number {
  let h = 0;
  for (let i = 0; i < topic.length; i += 1) {
    h = (h * 31 + topic.charCodeAt(i)) >>> 0;
  }
  return h;
}

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Deterministic mock — no network, no keys.
 * Content is derived from topic/audience/tone so demos are stable.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock' as const;

  async generateScript(input: ScriptGenInput): Promise<ScriptGenResult> {
    const topic = input.topic.trim() || 'your topic';
    const audience = input.audience.trim() || 'creators';
    const tone = input.tone.trim() || 'practical';
    const platform = String(input.platform || 'YOUTUBE_SHORTS');
    const n = hashTopic(topic.toLowerCase()) % 3;

    const hooks = [
      `Stop guessing. In the next 60 seconds I’ll show you ${topic} — built for ${audience}.`,
      `If you’re a ${audience} still stuck on ${topic}, watch this.`,
      `${titleCase(topic)} without the fluff — a ${tone} playbook for ${audience}.`,
    ];
    const hook = hooks[n]!;

    let body = [
      `First, clarify the one outcome you want from ${topic}.`,
      `Second, write three hooks before you film — strong openings decide whether ${audience} stay.`,
      `Third, batch the work: same setup, back-to-back takes, then edit decisions not hunting footage.`,
      `Fourth, adapt once for ${platform}: keep the core story, change the cut and caption.`,
    ].join('\n\n');

    if (input.refineInstruction?.trim()) {
      body += `\n\n[Refine applied: ${input.refineInstruction.trim()}]`;
    }

    const cta = `Save this and comment “READY” if you want the checklist for ${topic}. Then ship one piece this week.`;
    const title = `${titleCase(topic)} — ${tone} guide for ${audience}`;
    const fullText = `## Hook\n\n${hook}\n\n## Body\n\n${body}\n\n## CTA\n\n${cta}`;

    return {
      title,
      hook,
      body,
      cta,
      fullText,
      provider: this.name,
      model: 'mock',
    };
  }

  async generateHooks(script: string, n: number): Promise<string[]> {
    const count = Math.max(1, Math.min(n || 3, 10));
    const snippet = script.replace(/\s+/g, ' ').trim().slice(0, 80) || 'your script';
    const base = hashTopic(snippet);
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const variant = (base + i) % 3;
      if (variant === 0) {
        out.push(`Hook ${i + 1}: Most people skip this — ${snippet}… here’s the fix.`);
      } else if (variant === 1) {
        out.push(`Hook ${i + 1}: In 30 seconds: the ${snippet} shortcut that actually sticks.`);
      } else {
        out.push(`Hook ${i + 1}: If you’ve tried ${snippet} and failed, this is why.`);
      }
    }
    return out;
  }

  async generateSupporting(
    script: string,
    platforms: Platform[],
  ): Promise<SupportingContent> {
    const topicBit =
      script.match(/topic[:\s]+([^\n.]+)/i)?.[1]?.trim() ||
      script.slice(0, 40).replace(/\s+/g, ' ').trim() ||
      'Creator tip';
    const byPlatform: SupportingContent['byPlatform'] = {};
    const list = platforms.length > 0 ? platforms : (['YOUTUBE_SHORTS'] as Platform[]);

    for (const p of list) {
      byPlatform[p] = {
        titles: [
          `${topicBit} (quick tip)`,
          `How I actually do ${topicBit}`,
          `${topicBit} — no fluff`,
        ],
        captions: [
          `${topicBit}. Save this for later. #creator`,
          `Tried ${topicBit}? Drop a comment with your biggest blocker.`,
        ],
        hashtags: ['#creator', '#contentbatch', '#shorts', `#${p.toLowerCase()}`],
      };
    }

    return { byPlatform, provider: this.name, model: 'mock' };
  }

  /**
   * Mock STT: prefer `hintText`; otherwise invent spoken text from file basename.
   * Never calls the network.
   */
  async transcribe(input: TranscribeInput): Promise<Transcript> {
    let text = input.hintText?.trim() ?? '';
    if (!text && input.filePath) {
      const base = input.filePath.split(/[/\\]/).pop() ?? 'footage';
      text = `This is mock speech for ${base}. First pick one topic cluster. Second write three hooks. Third film all A-roll in one session.`;
    }
    if (!text && input.audio) {
      text =
        'Mock speech from in-memory audio. Batch your Reels in one afternoon without burning out.';
    }
    if (!text) {
      throw new AiProviderError(
        'Mock transcribe needs hintText, filePath, or audio',
        'invalid_config',
      );
    }
    return mockTranscribeFromText(text);
  }

  async alignScriptToTranscript(
    script: ScriptDoc,
    segments: TranscriptSegment[],
  ): Promise<Alignment[]> {
    return fuzzyAlignScriptToTranscript(script, segments);
  }

  /**
   * Phase 7 — rank 15–60s windows; always returns 3 stable candidates for demos.
   */
  async scoreClipWindows(
    transcript: Transcript,
    script: ScriptDoc,
  ): Promise<ClipIdea[]> {
    return scoreClipWindowsFromTranscript(transcript, script, {
      maxCandidates: 3,
    });
  }

  async proposeTimeline(_ctx: TimelineContext): Promise<EditTimeline> {
    throw new AiProviderError(
      'proposeTimeline is Phase 8 — not implemented in Phase 6',
      'not_implemented',
    );
  }
}
