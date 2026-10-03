# Auth Security Checklist — CreatorAi (Phase 2)

> Owned by Dev D (Cyrus). Proposal for Anto (API) and Brendan (web) to enforce during Phase 2 Auth.
> Companion code: `packages/shared/src/validation/password.ts`

---

## 1. Password rules (Anto enforces server-side)

| Rule | Requirement | Notes |
|------|-------------|-------|
| Minimum length | **≥ 8 characters** | Reject shorter passwords on register (and any password-change endpoint later) |
| Storage | bcrypt hash only | Never store plaintext; never return `passwordHash` in API responses |
| Client | Optional UX hint | Web may use `checkPasswordStrength` for feedback; **server remains source of truth** |
| Encoding | UTF-8 | Count characters as JS string length for MVP |

**Register validation (recommended message):**  
`Password must be at least 8 characters.`

Anto should reject before hashing. Do not rely on the frontend alone.

---

## 2. JWT secret requirements

| Rule | Requirement |
|------|-------------|
| Source | `JWT_SECRET` from environment only (see root `.env.example`) |
| Strength | At least **32 random bytes** (≈ 43+ chars base64 / 64+ hex). Do **not** ship `change-me` in any shared demo env that leaves the laptop |
| Rotation | Changing `JWT_SECRET` invalidates all existing tokens (acceptable for MVP) |
| Client | Secret never bundled in Next.js / `NEXT_PUBLIC_*` |
| Algorithm | HS256 (or whatever Anto picks) with explicit expiry (short TTL OK for MVP) |

**Checklist before demo:**
- [ ] `.env` exists locally and is gitignored
- [ ] `JWT_SECRET` is unique per machine / deploy
- [ ] No JWT secret in README screenshots or `context.md`

---

## 3. Tokens must not be logged

| Surface | Rule |
|---------|------|
| API request logs | Do **not** log `Authorization` header values or raw JWT strings |
| Error payloads | Do **not** echo the bearer token back in error `details` |
| Job / worker logs | Do **not** print tokens if workers ever call authenticated routes |
| Browser | Prefer not to `console.log` the token; localStorage is OK for MVP but treat as secret |
| `context.md` | Never paste real JWTs or passwords into the team log |

**Safe logging pattern:** log `userId` / `workspaceId` / `requestId` only after auth succeeds — not the credential material.

---

## 4. Password strength helper (shared)

Pure helper lives at:

```ts
import { checkPasswordStrength, isPasswordAcceptable } from '@creatorai/shared';
```

(Integration must ensure `packages/shared/src/index.ts` re-exports `./validation/password`.)

- `isPasswordAcceptable(password)` → `true` iff length ≥ 8 (MVP gate matching Anto’s enforce rule).
- `checkPasswordStrength(password)` → `{ acceptable, score, hints[] }` for UI / docs demos.

Anto may wrap the same rules in Zod; keep the **min-8** rule identical.

---

## 5. Phase 2 verify (for Integration Lead — Brendan)

- [ ] Register rejects password shorter than 8 chars
- [ ] Login returns JWT; `/auth/me` works with Bearer
- [ ] Duplicate email returns clear error (no stack / hash leak)
- [ ] Grep logs: no JWT / password plaintext in default log paths
- [ ] `JWT_SECRET` only via env
