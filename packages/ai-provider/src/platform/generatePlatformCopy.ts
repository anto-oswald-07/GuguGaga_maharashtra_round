/**
 * Platform-tuned title / caption / hashtags (Phase 9 — Dev C).
 *
 * Pure builder used by MockAiProvider.generateSupporting so demos
 * get distinct, length-clamped copy per Platform enum value.
 */
import type { Platform } from '@creatorai/shared';
import type { SupportingContent, SupportingContentItem } from '../types';
import {
  clampCopy,
  limitsForPlatform,
  normalizeHashtag,
  PLATFORM_COPY_LIMITS,
} from './copyLimits';

export { PLATFORM_COPY_LIMITS, limitsForPlatform, clampCopy, normalizeHashtag };

function hashStable(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Pull a short topic phrase from free-form script text. */
export function extractTopicBit(script: string): string {
  // Prefer structured ## Hook body before collapsing whitespace
  const hookBlock = script.match(/##\s*Hook\s*\r?\n+([\s\S]*?)(?=\r?\n##\s|\s*$)/i)?.[1]?.trim();
  if (hookBlock) {
    const firstLine = hookBlock.split(/\r?\n/)[0]?.trim() ?? hookBlock;
    return firstLine.slice(0, 48) || 'Creator tip';
  }
  const collapsed = script.replace(/\s+/g, ' ').trim();
  const topicMatch = collapsed.match(/topic[:\s]+([^.]{3,80})/i)?.[1]?.trim();
  if (topicMatch) return topicMatch.slice(0, 48);
  // Strip residual markdown headings if present
  const noHeadings = collapsed.replace(/##\s*\w+/gi, '').trim();
  return (noHeadings || collapsed).slice(0, 48) || 'Creator tip';
}

function baseHashtags(platform: Platform, topicBit: string): string[] {
  const slug = topicBit
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18) || 'creator';
  const shared = ['#creator', '#contentbatch', `#${slug}`];
  switch (platform) {
    case 'YOUTUBE':
      return [...shared, '#youtube', '#youtubecreator', '#contentstrategy'];
    case 'YOUTUBE_SHORTS':
      return [...shared, '#shorts', '#youtubeshorts', '#verticalvideo'];
    case 'INSTAGRAM_REELS':
      return [
        ...shared,
        '#reels',
        '#instagramreels',
        '#reelsinstagram',
        '#creatortips',
        '#batchcontent',
      ];
    case 'TIKTOK':
      return [...shared, '#tiktok', '#fyp', '#learnontiktok'];
    case 'LINKEDIN':
      return [...shared, '#linkedin', '#personalbrand', '#creatoreconomy'];
    default:
      return [...shared, '#shorts'];
  }
}

/**
 * Build one platform's packaging copy — titles/captions are length-clamped
 * and include a demo label so packs look distinct in the UI.
 */
export function buildPlatformCopyItem(
  script: string,
  platform: Platform,
): SupportingContentItem {
  const limits = limitsForPlatform(platform);
  const topic = extractTopicBit(script);
  const label = limits.demoLabel;
  const variant = hashStable(`${platform}:${topic}`) % 2;

  const rawTitles: string[] = (() => {
    switch (platform) {
      case 'YOUTUBE':
        return [
          `${label} ${topic} — full breakdown`,
          `${label} Watch next: ${topic} for creators`,
          `${label} Deep dive: ${topic}`,
        ];
      case 'YOUTUBE_SHORTS':
        return [
          `${label} ${topic} in 60s`,
          `${label} Quick: ${topic}`,
          `${label} Skip the fluff — ${topic}`,
        ];
      case 'INSTAGRAM_REELS':
        return [
          `${label} ${topic}`,
          `${label} Save this: ${topic}`,
          `${label} Batch tip — ${topic}`,
        ];
      case 'TIKTOK':
        return [
          `${label} POV: ${topic}`,
          `${label} Wait for it — ${topic}`,
          `${label} ${topic} (duet this)`,
        ];
      case 'LINKEDIN':
        return [
          `${label} A practical take on ${topic}`,
          `${label} Framework: ${topic} for professionals`,
          `${label} Lessons from shipping ${topic}`,
        ];
      default:
        return [`${label} ${topic}`, `${label} Tip: ${topic}`];
    }
  })();

  const rawCaptions: string[] = (() => {
    switch (platform) {
      case 'YOUTUBE': {
        const cta =
          variant === 0
            ? 'Subscribe for the full checklist.'
            : 'Comment READY for the template.';
        return [
          `${label} ${topic}. ${cta}`,
          `${label} Chapter-friendly walkthrough of ${topic}. Like if this helped.`,
        ];
      }
      case 'YOUTUBE_SHORTS':
        return [
          `${label} ${topic}. Follow for more Shorts.`,
          `${label} One tip on ${topic} — swipe for the rest.`,
        ];
      case 'INSTAGRAM_REELS':
        return [
          `${label} ${topic}. Save + share with a creator friend.`,
          `${label} Tried ${topic}? Tell me your biggest blocker 👇`,
        ];
      case 'TIKTOK':
        return [
          `${label} ${topic}. Duet your version.`,
          `${label} Sound on. ${topic} — stitch this.`,
        ];
      case 'LINKEDIN':
        return [
          `${label} ${topic}.\n\nHere is a concise take you can apply this week.\n\nWhat would you add?`,
          `${label} Shipping ${topic} taught me to batch decisions, not just footage.\n\nAgree?`,
        ];
      default:
        return [`${label} ${topic}.`];
    }
  })();

  const titles = rawTitles.map((t) => clampCopy(t, limits.titleMax));
  const captions = rawCaptions.map((c) => clampCopy(c, limits.captionMax));
  const hashtags = baseHashtags(platform, topic)
    .map(normalizeHashtag)
    .filter(Boolean)
    .slice(0, limits.hashtagMax);

  return { titles, captions, hashtags };
}

/**
 * Clamp an existing SupportingContentItem to platform soft limits
 * (used after OpenAI / Gemini responses).
 */
export function clampSupportingItem(
  platform: Platform | string,
  item: SupportingContentItem,
): SupportingContentItem {
  const limits = limitsForPlatform(platform);
  return {
    titles: item.titles.map((t) => clampCopy(t, limits.titleMax)).filter(Boolean),
    captions: item.captions
      .map((c) => clampCopy(c, limits.captionMax))
      .filter(Boolean),
    hashtags: item.hashtags
      .map(normalizeHashtag)
      .filter(Boolean)
      .slice(0, limits.hashtagMax),
  };
}

export type GeneratePlatformCopyInput = {
  script: string;
  platforms: Platform[];
};

/**
 * Deterministic platform pack copy for demos / mock provider.
 * Identical script + platforms → identical SupportingContent.
 */
export function generatePlatformCopyFromScript(
  script: string,
  platforms: Platform[],
): SupportingContent {
  const list =
    platforms.length > 0
      ? platforms
      : (['YOUTUBE_SHORTS'] as Platform[]);
  const byPlatform: SupportingContent['byPlatform'] = {};
  for (const p of list) {
    byPlatform[p] = buildPlatformCopyItem(script, p);
  }
  return { byPlatform, provider: 'mock', model: 'mock' };
}
