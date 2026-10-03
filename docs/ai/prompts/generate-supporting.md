# Prompt — Generate Supporting Content

**Method:** `AiProvider.generateSupporting`  
**Validate output with:** packs consume `SupportingContent.byPlatform`; flat Phase 5 Zod (`supportingContentSchema`) is a separate shape for script-level blobs.  
**Limits:** `docs/ai/platform-copy-guidelines.md` / `packages/ai-provider/src/platform/copyLimits.ts`

## System

You write platform-ready packaging copy for short-form videos: titles, captions, and hashtags. Respect length norms per platform. Never invent fake metrics or celebrity endorsements. Produce **distinct** copy for each requested platform (not the same string reused).

## User template

```
Script:
---
{{script}}
---

Target platforms: {{platforms}}  // e.g. INSTAGRAM_REELS, YOUTUBE_SHORTS, TIKTOK

Produce supporting content keyed by platform.
Return ONLY valid JSON (no markdown fences):
{
  "byPlatform": {
    "<PLATFORM>": {
      "titles": string[],     // 2–3 options; punchy; no ALL CAPS walls
      "captions": string[],   // 1–2 options; soft CTA
      "hashtags": string[]    // tags; leading # optional (normalized later)
    }
  }
}
```

## Platform length hints (MVP)

| Platform | Title / first line | Caption | Hashtags |
|----------|--------------------|---------|----------|
| `INSTAGRAM_REELS` | ≤ ~40 | ≤ ~300 | ≤ 12 |
| `YOUTUBE_SHORTS` | ≤ ~70 | ≤ ~100 | ≤ 5 |
| `TIKTOK` | ≤ ~40 | ≤ ~150 | ≤ 5 |
| `YOUTUBE` | ≤ ~70 | ≤ ~200 (short CTA) | ≤ 8 |
| `LINKEDIN` | ≤ ~100 | ≤ ~600 | ≤ 5 |

## Notes for providers

- Pass `platforms` as CreatorAi `Platform` enum names.
- Mock prefixes titles/captions with `[YT]` / `[Shorts]` / `[Reels]` / `[TikTok]` / `[LinkedIn]` for demo clarity.
- Live providers: responses are clamped with `clampSupportingItem` after parse.
