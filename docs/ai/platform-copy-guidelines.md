# Platform copy guidelines

> **Owner:** Dev C (Arvin) — Phase 9  
> **Companion code:** `packages/ai-provider/src/platform/copyLimits.ts`  
> **Method:** `AiProvider.generateSupporting(script, platforms)`

Soft limits enforced by `@creatorai/ai-provider` mock builder + clamp helpers.
Live LLM providers should prefer these; responses are clamped post-hoc.

## Soft character limits (MVP)

| Platform | Title / first line | Caption / post body | Hashtags (max) | Description | Default aspect |
|----------|--------------------|---------------------|----------------|-------------|----------------|
| `YOUTUBE` | ≤ **70** | ≤ **200** (short CTA line) | **8** | ≤ **2000** | 16:9 |
| `YOUTUBE_SHORTS` | ≤ **70** | ≤ **100** | **5** | ≤ **500** | 9:16 |
| `INSTAGRAM_REELS` | ≤ **40** | ≤ **300** | **12** | n/a | 9:16 |
| `TIKTOK` | ≤ **40** | ≤ **150** | **5** | n/a | 9:16 |
| `LINKEDIN` | ≤ **100** | ≤ **600** | **5** | ≤ **1500** | 1:1 |

These are **soft** packaging targets for demos and clamp helpers — not hard API 400s.
Shared Zod (`supportingContentSchema`) allows larger absolute ceilings for user edits.

## Tone / structure

| Platform | Tone | Structure |
|----------|------|-----------|
| `YOUTUBE` | Clear, chapter-friendly | Title searchable; caption = short CTA; longer description for chapters/links |
| `YOUTUBE_SHORTS` | Punchy vertical | Title ≤70; caption one tight line |
| `INSTAGRAM_REELS` | Casual creator | Short title; caption with save/share CTA; more hashtags OK |
| `TIKTOK` | Native / POV | Hook-first title; short caption; few hashtags (`#fyp` ok for mock) |
| `LINKEDIN` | Professional | Framework / lesson framing; fewer hashtags; longer caption OK |

## Mock demo labels

`MockAiProvider.generateSupporting` prefixes titles/captions with a platform label so packs are visually distinct in the UI:

- `[YT]` · `[Shorts]` · `[Reels]` · `[TikTok]` · `[LinkedIn]`

Identical `script` + `platforms` → identical JSON (deterministic demos).

## Hashtags

- Stored/returned with a leading `#` from the ai-provider mock.
- Shared script Zod (`assertSupportingContent`) for **flat** Phase 5 supporting blobs expects tags **without** `#` — strip before that assert if needed.
- Packs API (Anto) should accept either; normalize on write.

## Worker CLI

```bash
AI_PROVIDER=mock pnpm --filter worker generate-platform-copy -- --fixture
echo '{"script":"...","platforms":["TIKTOK","INSTAGRAM_REELS"]}' \
  | AI_PROVIDER=mock pnpm --filter worker generate-platform-copy -- --stdin
```

## Integration notes

- **Anto (9 B):** `ADAPT_PLATFORM` / packs generate should call `AiProvider.generateSupporting` (or worker helper) and store per-platform title/caption/hashtags alongside Cyrus aspect outputs.
- **Brendan (9 A):** Show editable fields; do not silently overwrite user edits on re-generate without confirm.
- **Cyrus (9 D):** Aspect ratios above are the intended defaults per platform.
