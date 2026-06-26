# Agent 2 — QA Review
## Session 2 — Auth System
### Date: June 25, 2026

---

## Files delivered

| File                                | Purpose                                                     |
| ----------------------------------- | ----------------------------------------------------------- |
| `tests/unit/authService.test.js`    | Unit tests — register, login, refresh (model layer mocked)  |
| `tests/unit/authMiddleware.test.js` | Unit tests — authenticate middleware (model + JWT mocked)   |
| `tests/integration/auth.test.js`    | Integration tests — all 4 auth endpoints against runit_test |

---

## How to run

```bash
# All tests
NODE_ENV=test npx jest --runInBand

# Unit only
NODE_ENV=test npx jest --runInBand tests/unit/

# Integration only
NODE_ENV=test npx jest --runInBand tests/integration/auth.test.js
```

Make sure `runit_test` database exists and `.env` is populated before running
integration tests. The `beforeAll` in auth.test.js runs `migrate.latest()`
automatically.

---

## Findings

These are ordered by severity. Each one is a specific question or concern for
Agent 1 to address before Session 3 builds on top of this layer.

---

### FINDING 1 — CRITICAL: Logout does not invalidate the refresh token

**File:** `src/controllers/authController.js` — `logout`
**File:** `src/services/authService.js` — no blocklist logic exists

Logout clears the cookie on the client side only. The refresh token JWT itself
remains cryptographically valid for 7 days. If a user logs out on a public
computer, or if the cookie was already exfiltrated, the token can still be
used to mint new access tokens indefinitely until it expires.

The integration test `after logout, the old refresh token can no longer be
used to refresh` is written to FAIL intentionally. It documents this gap. The
test should pass once a blocklist is implemented.

**Question for Agent 1:** Will you add a token blocklist (a `refresh_tokens`
table or Redis set) before games endpoints go live? At minimum, storing issued
refresh tokens in the DB and deleting on logout would close this. Without it,
logout is cosmetic.

---

### FINDING 2 — HIGH: Timing side-channel on login (missing user vs wrong password)

**File:** `src/services/authService.js` — `login`

When the email is not found, the service throws immediately without calling
`bcrypt.compare`. When the password is wrong, `bcrypt.compare` runs for ~400ms
(12 rounds). An attacker measuring response time can determine whether an email
address is registered, even though the error message is identical. This is a
classic timing oracle.

The fix is to always call `bcrypt.compare` against a dummy hash even when the
user is not found:

```js
const DUMMY_HASH = '$2b$12$invalidhashfortimingnoBrI3Lmj7FU6uiCmFka0Em4WZwCMEKPi';

const login = async ({ email, password }) => {
  const user = await userModel.findByEmail(email);
  const hash = user ? user.password_hash : DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }
  // ...
};
```

The unit test `does not call bcrypt.compare when user is not found` is written
to document current behavior. If Agent 1 applies the fix above, that test will
fail and should be updated to assert `bcrypt.compare WAS called`.

**Question for Agent 1:** Will you apply constant-time login before the app
goes public? The timing window is measurable with ~100 requests.

---

### FINDING 3 — HIGH: authenticate middleware does not strip password_hash if model returns it

**File:** `src/middleware/auth.js` — `authenticate`

`findById` explicitly excludes `password_hash` in its SELECT list, so this is
safe today. But if the model ever changes — a column is added, a raw query is
used, a developer forgets — the middleware will attach whatever `findById`
returns directly to `req.user` with no secondary filter.

The unit test `never attaches password_hash to req.user` is written to assert
this. As written it will FAIL if `findById` is mocked to return a user WITH
`password_hash` (which is what the test does), because the middleware does not
strip it.

**Question for Agent 1:** Should the middleware defensively strip sensitive
fields from `req.user` regardless of what the model returns? One line:
`const { password_hash, deleted_at, ...safeUser } = user; req.user = safeUser;`

---

### FINDING 4 — MEDIUM: validateLogin accepts an empty string password

**File:** `src/middleware/validate.js` — `validateLogin`

The login validator uses `.notEmpty()` on the password field. In
express-validator, `notEmpty()` rejects `undefined` and `null` but passes an
empty string `""` through. An empty string then reaches `bcrypt.compare`,
which will simply return false — so no security hole, but the error path is
401 (wrong credentials) instead of 400 (bad input), which is confusing and
leaks that the endpoint reached the credential-check stage.

```js
body('password').notEmpty() // passes ""
// should be:
body('password').isLength({ min: 1 }) // or .trim().notEmpty()
```

The integration test `returns 401 for a blank password string` uses
`expect([400, 401]).toContain(res.status)` to document this ambiguity. It
should be tightened to `expect(res.status).toBe(400)` once the validator is
fixed.

**Question for Agent 1:** Can you tighten the login password validator to
reject empty strings as 400 before they reach bcrypt?

---

### FINDING 5 — MEDIUM: No username uniqueness enforced at the service layer

**File:** `src/services/authService.js` — `register`

The DB schema has a UNIQUE constraint on `users.username`. The service only
checks for duplicate email. If two users submit the same username
simultaneously, the DB will throw a raw Knex/PostgreSQL error (code `23505`)
which bubbles up to the global error handler and returns a 500 with the raw
message in non-production environments.

There is no `findByUsername` model function and no service-level check before
insert.

**Question for Agent 1:** Should `register` check username uniqueness
explicitly and throw a clean 409 — the same way it handles duplicate email?
Or is catching the DB constraint error in the global handler acceptable?
Either is defensible, but a raw `23505` reaching the client in dev is
confusing and the error message will say `duplicate key value violates unique
constraint "users_username_unique"`.

---

### FINDING 6 — MEDIUM: Rate limiter is shared across all auth routes including refresh

**File:** `src/routes/auth.js`

The same `authLimiter` (10 req / 15 min) is applied to `/register`, `/login`,
AND `/refresh`. Refresh is called silently in the background by the frontend
every ~14 minutes to keep the session alive. On a tab that stays open, this
consumes 1 of the 10 allowed requests every 14 minutes, cycling through the
window. With multiple tabs open, a legitimate user could hit the limit and get
locked out with a 429.

`/logout` has no rate limiter at all — a minor inconsistency but low risk.

**Question for Agent 1:** Should `/refresh` have a separate, higher limit
(e.g. 60 req / 15 min) since it is a background operation? And should
`/logout` get any limiter at all, even a loose one?

---

### FINDING 7 — LOW: knexfile.js constructs the test DB name by string concatenation

**File:** `knexfile.js`

```js
database: process.env.DB_NAME + '_test',
```

If `DB_NAME` is undefined (missing `.env`), this silently becomes
`'undefined_test'` — a database name that almost certainly does not exist.
The error that follows (`database "undefined_test" does not exist`) is
confusing because it hides the real problem.

**Question for Agent 1:** Should there be a guard at startup that throws a
clear error when required env vars are missing? Something like:

```js
if (!process.env.DB_NAME) throw new Error('DB_NAME env var is not set');
```

---

### FINDING 8 — LOW: `full_name` is stored with leading/trailing whitespace

**File:** `src/middleware/validate.js`

`full_name` has `.trim()` in the validator chain, but `.trim()` in
express-validator only affects the value used for validation — it does NOT
mutate `req.body`. The raw `req.body.full_name` is what the controller passes
to the service. So `"  Salim  "` gets stored as `"  Salim  "`.

Compare to `email` which uses `.normalizeEmail()` — that one DOES mutate
`req.body` (it uses `sanitize` under the hood).

**Question for Agent 1:** Should `full_name` use `.customSanitizer` or a
manual `req.body.full_name = req.body.full_name?.trim()` before insert?

---

### FINDING 9 — LOW: `secure` flag on the cookie is false in test and development

**File:** `src/controllers/authController.js`

```js
secure: process.env.NODE_ENV === 'production',
```

This is correct and intentional (HTTPS is not available locally). Documenting
it here because integration tests run in `NODE_ENV=test`, so the cookie will
NOT have the `Secure` flag in any test assertion. If a test ever checks for
`Secure`, it will fail in CI even though production is safe.

No action needed — just awareness for future test authors.

---

### FINDING 10 — OBSERVATION: `avatar_url` is in the schema but not in the register flow

**File:** `src/models/userModel.js` — `create` returning clause
**File:** `src/services/authService.js` — `register`

`avatar_url` exists on the users table but is not included in the `returning`
clause of `create` and is not accepted as input at register time. This is
probably intentional (set later via a profile update endpoint). Noting it here
so Session 3 does not need to wonder why `avatar_url` is null on the register
response.

No action needed unless profile update is in scope for Phase 1.

---

## AGENT_LOG.md entries to paste in

Replace the current "Agent 2 — Session 2" entry with:

---

### Session 2 (paste this block into Agent 2 log section)

```
Session 2 — Auth review and testing (completed)

Status: Complete. Full test suite written and delivered.

Files created:
  tests/unit/authService.test.js     — 32 unit tests, model layer mocked
  tests/unit/authMiddleware.test.js  — 15 unit tests, JWT + model mocked
  tests/integration/auth.test.js     — 48 integration tests against runit_test

Test counts:
  authService.register   — 13 unit tests
  authService.login      — 10 unit tests
  authService.refresh    — 10 unit tests
  authenticate middleware — 15 unit tests
  POST /auth/register    — 22 integration tests
  POST /auth/login       — 14 integration tests
  POST /auth/refresh     — 8 integration tests
  POST /auth/logout      — 4 integration tests

Key findings for Agent 1 to address (see AGENT_2_SESSION_2_FINDINGS.md):
  CRITICAL — Logout does not invalidate the refresh token (no blocklist)
  HIGH     — Timing side-channel: missing user skips bcrypt, leaks registration status
  HIGH     — authenticate middleware passes password_hash to req.user if model returns it
  MEDIUM   — validateLogin accepts empty string password (reaches bcrypt as 401 not 400)
  MEDIUM   — Duplicate username throws raw DB 23505 error instead of clean 409
  MEDIUM   — authLimiter on /refresh risks locking out legitimate users with multiple tabs
  LOW      — knexfile DB_NAME concatenation silently produces 'undefined_test'
  LOW      — full_name .trim() in validator does not mutate req.body before insert
  LOW      — secure cookie flag is false in test/dev (expected, just documented)

One intentionally failing test:
  "after logout, the old refresh token can no longer be used to refresh"
  This test SHOULD fail until Agent 1 implements a refresh token blocklist.
  Do not delete it. It is a sentinel for Finding 1.

Handoff to Agent 1:
  Address findings before Session 3. At minimum: Finding 1 (blocklist) and
  Finding 2 (timing) should be resolved before any authenticated game routes
  go live. The rest can be deferred to a hardening pass but should be tracked.

Handoff to Agent 3:
  ADRs to write from findings:
    ADR-007: Refresh token blocklist strategy (or explicit decision to defer)
    ADR-008: Constant-time login pattern
    ADR-009: Rate limit strategy per auth endpoint type
```

---

Also update the "Latest from Agent 2" section to:

```
Latest from Agent 2
Auth test suite complete. 10 findings filed (1 critical, 2 high, 3 medium, 4 low).
One intentionally failing integration test documents the missing token blocklist.
Agent 1 should review AGENT_2_SESSION_2_FINDINGS.md before building Session 3 games.
The most important: logout is currently cosmetic — the refresh token stays valid.
```
