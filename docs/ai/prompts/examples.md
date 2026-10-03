# Prompt Output Examples — Good vs Bad

Use these when wiring Mock AI, writing tests, or debugging Zod failures.

Schema source: `packages/shared/src/schemas/scriptSchema.ts`

---

## 1. Generated script

### Good (passes `generatedScriptSchema`)

```json
{
  "hook": "Stop filming one Reel a day — batch a whole week this afternoon.",
  "body": "Pick one topic cluster. Write three hooks before you touch the camera. Film all A-roll in one outfit and lighting setup. Dump the takes into one project and cut decisions, not hunting. Adapt vertical once, then schedule.",
  "cta": "Save this and comment BATCH if you want the checklist.",
  "meta": {
    "topic": "How I batch-create Reels in one afternoon",
    "audience": "Solo creators",
    "tone": "Practical, energetic",
    "platform": "INSTAGRAM_REELS"
  }
}
```

### Bad (should fail validation)

```json
{
  "opening": "Hey guys welcome back",
  "content": "So basically just be consistent lol",
  "end": "Like and subscribe"
}
```

Why bad: wrong keys (`opening`/`content`/`end` instead of `hook`/`body`/`cta`); not speakable structure.

```json
{
  "hook": "",
  "body": "   ",
  "cta": "x"
}
```

Why bad: empty / whitespace-only required fields.

---

## 2. Hooks

### Good (passes `generatedHooksSchema`)

```json
{
  "hooks": [
    "You're editing wrong if you film a new Reel every single day.",
    "I used to post once a day. Now I batch five in one afternoon.",
    "The secret isn't more filming — it's fewer setup resets."
  ]
}
```

### Bad

```json
{
  "hooks": [
    "🔥🔥🔥 VIRAL HACK YOU WON'T BELIEVE #fyp #fyp #fyp"
  ]
}
```

Why bad: emoji/hashtag spam; usually want `n` hooks (e.g. 3); not speakable as a clean cold open.

```json
["hook one", "hook two"]
```

Why bad: bare array — schema expects `{ "hooks": string[] }`.

---

## 3. Supporting content

### Good (passes `supportingContentSchema`)

```json
{
  "titles": [
    "Batch a week of Reels in one afternoon",
    "Stop daily filming. Start batching.",
    "My 5-step Reel batching system"
  ],
  "captions": [
    "I used to burn out posting daily. Here's the batch system that fixed it — save this for your next content day.",
    "One topic. Three hooks. One film block. Multiple posts. That's the whole game."
  ],
  "hashtags": [
    "contentcreator",
    "reels tips",
    "shortform",
    "batching",
    "creatoreconomy"
  ],
  "description": "A practical walkthrough of batching short-form videos in a single afternoon: topic clusters, hooks-first writing, one lighting setup, and multi-platform adaptation."
}
```

### Bad

```json
{
  "titles": [],
  "captions": ["ok"],
  "hashtags": ["#a", "#b"],
  "description": ""
}
```

Why bad: empty `titles`; empty `description`; hashtags still include `#` (normalize before parse if needed; schema may reject empty description).

---

## Quick local check

```bash
cd packages/shared && npx tsc -p tsconfig.json
node -e "
const s = require('./dist/index.js');
const good = { hook: 'H', body: 'B', cta: 'C', meta: { topic: 't', audience: 'a', tone: 'to', platform: 'INSTAGRAM_REELS' } };
console.log(s.generatedScriptSchema.safeParse(good).success);
console.log(s.generatedScriptSchema.safeParse({ opening: 'x' }).success);
"
```
