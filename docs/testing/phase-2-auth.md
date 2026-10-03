# Phase 2 Auth — Testing Guide (Dev C)

Test kit for Integration after Anto’s auth API and Brendan’s auth UI land.  
**Do not treat this as a substitute for Anto’s implementation** — shapes below follow `SDD.md` §5.1 / §5.10 and `DEVELOPMENT_PLAN.md` Phase 2.

## Prerequisites

```bash
cp .env.example .env   # JWT_SECRET, DATABASE_URL, PORT=4000
docker compose up -d
pnpm install
pnpm --filter api prisma:generate   # once User/Workspace models exist
# apply migrations when Anto adds them
pnpm --filter api dev
```

HTTP collection:

- `docs/api/auth.http` — VS Code REST Client / JetBrains HTTP Client
- `docs/api/auth.postman.json` — Postman / Insomnia import

Proposed TypeScript shapes (merge into `packages/shared` during Integration if Anto’s differ):  
`docs/proposed-auth-types.ts`

---

## Expected error JSON (SDD §5.10)

All failure responses should use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable explanation",
    "details": {}
  }
}
```

| Situation | Suggested HTTP | Suggested `error.code` |
|-----------|----------------|------------------------|
| Missing/invalid body fields | 400 | `VALIDATION_ERROR` |
| Password < 8 chars | 400 | `VALIDATION_ERROR` |
| Duplicate email | 409 | `EMAIL_TAKEN` or `CONFLICT` |
| Bad email/password on login | 401 | `INVALID_CREDENTIALS` |
| Missing / bad Bearer token | 401 | `UNAUTHORIZED` or `INVALID_TOKEN` |

**Note:** Phase 1 `packages/shared` `ApiError` is a flatter placeholder (`error` / `message` / `statusCode`). Prefer the nested SDD shape for Phase 2+; reconcile at Integration.

---

## Happy-path checklist

### 1. Register

```bash
curl -sS -X POST http://localhost:4000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"password123","name":"Test"}'
```

Expect:

- Status **201** or **200**
- Body includes public user fields (`id`, `email`, `name`, …) — **never** `passwordHash`
- Body includes JWT (`token` or `accessToken`)
- Side effect: User + Workspace created (1:1)

### 2. Login

```bash
curl -sS -X POST http://localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"password123"}'
```

Expect:

- Status **200**
- JWT present; claims should include `userId` and `workspaceId` (per Dev B tasks)

### 3. Me

```bash
TOKEN='<paste token>'
curl -sS http://localhost:4000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

Expect:

- Status **200**
- Current user public profile; workspace id if returned

### 4. Logout (optional server)

```bash
curl -sS -X POST http://localhost:4000/api/v1/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

Expect **200** or **204**. Client must discard token either way.

---

## Negative-case checklist

Run after a successful register of `a@b.com`.

| # | Case | Command sketch | Expect |
|---|------|----------------|--------|
| 1 | Duplicate email | Same register body again | 409 + clear message |
| 2 | Wrong password | login with `"password":"nope-nope"` | 401 `INVALID_CREDENTIALS` |
| 3 | Unknown email | login `nobody@example.com` | 401 (same code; no email enumeration) |
| 4 | Missing token | `GET /auth/me` no header | 401 |
| 5 | Garbage token | `Authorization: Bearer not.a.real.jwt` | 401 |
| 6 | Short password | register password `"short"` | 400 `VALIDATION_ERROR` |
| 7 | Missing fields | register `{ "email": "x@y.com" }` only | 400 `VALIDATION_ERROR` |

---

## Frontend smoke (Brendan)

1. Open `http://localhost:3000/register` — submit valid form → land on `/`.
2. Logout → `/login` → login → dashboard.
3. Invalid login shows API error message on the form.
4. Hard-refresh with token in `localStorage` still authenticated (or redirects cleanly if guard stub requires token).

---

## Integration verification (from Development Plan)

- [ ] Register / login / me works via curl
- [ ] Web forms work against API
- [ ] Shared Zod schemas used by API (and preferably web)
- [ ] Duplicate email returns clear error
- [ ] `context.md` updated

---

## Ownership reminder

| Path | Owner |
|------|--------|
| Auth API + Prisma User/Workspace | Anto (Dev B) |
| Auth UI | Brendan (Dev A) |
| This test kit + HTTP collections | Arvin (Dev C) |
| Password policy docs | Cyrus (Dev D) |
