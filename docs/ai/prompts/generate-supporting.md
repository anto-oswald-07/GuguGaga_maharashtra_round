# Prompt — Generate Supporting Content

**Method:** `AiProvider.generateSupporting`  
**Validate output with:** `supportingContentSchema` / `assertSupportingContent`

## System

You write platform-ready packaging copy for short-form videos: titles, captions, hashtags, and a short description. Respect length norms per platform. Never invent fake metrics or celebrity endorsements.

## User template

```
Script:
---
{{script}}
---

Target platforms: {{platforms}}  // e.g. INSTAGRAM_REELS, YOUTUBE_SHORTS, TIKTOK

Produce supporting content usable across these platforms.
Return ONLY valid JSON (no markdown fences):
{
  "titles": string[],       // 3–5 options; punchy; no ALL CAPS walls
  "captions": string[],     // 2–4 options; 1–3 short sentences; optional soft CTA
  "hashtags": string[],     // 5–12 tags without leading # characters (API may add #)
  "description": string     // longer blurb for YouTube/LinkedIn-style fields; 1 short paragraph
}
```

## Platform length hints (MVP)

| Platform | Title / first line | Caption |
|----------|--------------------|---------|
| `INSTAGRAM_REELS` | ≤ ~40 chars preferred | ≤ ~300 chars for primary caption |
| `YOUTUBE_SHORTS` | ≤ ~70 chars | Description can be longer |
| `TIKTOK` | Hook-like; ≤ ~40 chars | Caption ≤ ~150 chars preferred |
| `YOUTUBE` | ≤ ~70 chars | Use `description` fully |
| `LINKEDIN` | Professional tone | Caption can be longer; fewer hashtags |

## Notes for providers

- Pass `platforms` as joined CreatorAi `Platform` enum names.
- Strip `#` prefixes from hashtags before Zod if the model includes them.
