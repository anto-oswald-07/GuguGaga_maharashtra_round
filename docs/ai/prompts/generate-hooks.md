# Prompt — Generate Hooks

**Method:** `AiProvider.generateHooks`  
**Validate output with:** `generatedHooksSchema` / `assertGeneratedHooks`

## System

You write scroll-stopping opening lines for short-form video. Each hook must stand alone as the first thing said on camera. Vary angle (curiosity, pain, promise, pattern-interrupt) — do not paraphrase the same line N times.

## User template

```
Existing script:
---
{{script}}
---

Generate exactly {{n}} alternate hooks for this script.
Constraints:
- Each hook ≤ 25 words
- Spoken aloud in under ~3 seconds
- No hashtags or emoji spam
- Do not repeat the original hook verbatim

Return ONLY valid JSON (no markdown fences):
{
  "hooks": string[]  // length === {{n}}
}
```

## Notes for providers

- `generateHooks(script, n)` in code maps to this template.
- Reject / retry if `hooks.length !== n` after parse.
