# Password Rules — CreatorAi (Phase 2 proposal)

> Dev D (Cyrus). Canonical narrative for Anto’s register/login validation.
> Code: `packages/shared/src/validation/password.ts`  
> Full checklist: `docs/security/auth-checklist.md`

## MVP policy (enforce in API)

1. Minimum length: **8 characters**.
2. Hash with **bcrypt** before persist; never return the hash.
3. Reject empty / whitespace-only passwords after trim if you trim (prefer: do not trim interior spaces; leading/trailing trim optional — document choice in Integration).

## Optional stronger rules (P2 — do not block MVP)

- At least one letter and one digit.
- Not equal to the user’s email local-part.

These appear as **hints** from `checkPasswordStrength`, not hard failures, unless Anto opts in during Integration.

## Shared helper usage

```ts
import {
  MIN_PASSWORD_LENGTH,
  isPasswordAcceptable,
  checkPasswordStrength,
} from '@creatorai/shared';

if (!isPasswordAcceptable(password)) {
  // return 400 with message from auth-checklist
}

const strength = checkPasswordStrength(password);
// strength.score: 0–3; strength.hints for UI
```
