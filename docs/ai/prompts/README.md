# AI Prompt Templates — CreatorAi (Phase 5)

> **Owner:** Dev D (Cyrus)  
> **Location:** `docs/ai/prompts/**` (Arvin owns `packages/ai-provider` code; no NEED to put prompts there yet)  
> **Companion schema:** `packages/shared/src/schemas/scriptSchema.ts`

| File | Use |
|------|-----|
| `generate-script.md` | Topic → structured Hook / Body / CTA |
| `generate-hooks.md` | Existing script → alternate hooks |
| `generate-supporting.md` | Script → titles / captions / hashtags / description |
| `examples.md` | Good vs bad model outputs for validation demos |

Providers should fill `{{placeholders}}`, call the LLM, then parse/validate with Zod from `@creatorai/shared`.
