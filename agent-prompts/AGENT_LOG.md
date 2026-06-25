# Run It — Agent Log

This file is the communication layer between all three Claude agents.
Read it at the start of every session. Update it at the end.
Commit to GitHub after every update. Never delete entries — only add.

## Project overview

Full-stack pickup soccer finder. Users create games at local fields,
find nearby games on a map, join/leave games, chat with other players.

GitHub: https://github.com/smansuri10/run-it
Local path: ~/Projects/run-it
Node: v20.20.2 | PostgreSQL: 16.13

## Current phase

Phase 1 — Core (must ship)

## Phase 1 checklist

### Infrastructure
- [x] GitHub repo initialized (.gitignore, MIT license, README)
- [x] Folder structure created
- [x] Dependencies installed
- [x] package.json scripts (start, dev, migrate:*, test)
- [x] .env + .env.example
- [x] knexfile.js (development, test, production environments)
- [x] src/index.js — Express server with health check
- [x] src/config/db.js — Knex connection pool
- [x] Initial migration — all 6 tables created (sports, users, fields,
      games, game_players, messages) with indexes, status column on games,
      is_recurring boolean, and role/status CHECK constraints
- [x] runit_dev and runit_test databases created
- [x] Health check verified: GET /health → { status: ok, db: connected }

### Auth
- [x] POST /auth/register
- [x] POST /auth/login
- [x] POST /auth/refresh
- [x] POST /auth/logout
- [x] Auth middleware (protect routes)

### Games
- [ ] POST /games (create)
- [ ] GET /games (list with location filter)
- [ ] GET /games/:id (detail)
- [ ] POST /games/:id/join
- [ ] DELETE /games/:id/join (leave)

### Map
- [ ] GET /games?lat=&lng=&radius= (map endpoint)

## Agent 1 — Backend engineer log

### Session 1 — Infrastructure (completed)
Built: Express server, DB connection, initial migration (all 6 tables)
Key decisions:
- UUIDs for users/games/messages, integers for sports/fields
- gen_random_uuid() — no extension needed (Postgres 13+)
- onDelete CASCADE/RESTRICT/SET NULL chosen deliberately per table
- if (require.main === module) guard for Supertest compatibility
- /health endpoint hits the DB — not a fake 200

Handoff to Agent 2: Nothing to test yet — no business logic.
Handoff to Agent 3: Schema decisions ready to document.

### Session 2 — Auth (completed)
Built: Full auth system — register, login, refresh, logout, auth middleware
Files created:
- src/models/userModel.js — findByEmail, findById, create
- src/services/authService.js — register, login, refresh business logic
- src/controllers/authController.js — req/res handling, cookie setup
- src/middleware/validate.js — input validation for register and login
- src/middleware/auth.js — JWT middleware to protect routes
- src/routes/auth.js — route definitions with rate limiting
- src/index.js — updated to mount auth routes

Key decisions:
- password_hash never returned to client — stripped in service layer
- deleted_at never returned to client — filtered in model layer
- httpOnly cookie for refresh token — invisible to JavaScript, XSS safe
- Same error message for wrong email and wrong password — never reveal which
- Rate limiter: 10 attempts per 15 minutes per IP on all auth routes
- authenticate middleware attaches req.user for downstream controllers

Verified working:
- POST /auth/register creates user, returns access token
- POST /auth/login verifies password, returns access token + sets cookie
- Wrong password returns 401
- Invalid inputs return 400 with specific error messages per field
- password_hash and deleted_at never appear in responses

Handoff to Agent 2: Auth system ready for testing. Test happy paths,
wrong password, duplicate email, invalid inputs, missing fields,
expired tokens, and that password_hash never appears in any response.
Handoff to Agent 3: Auth decisions ready to document. Key ADRs needed:
JWT + httpOnly cookie strategy, bcrypt rounds decision, rate limiting approach.

## Agent 2 — QA engineer log

### Session 1
Status: Waiting — no business logic to test yet.

### Session 2
Status: Auth system ready for review and testing.

## Agent 3 — Tech writer log

### Session 1
Status: Schema decisions available to document.
Suggested ADRs to write:
- ADR-001: UUID strategy for user-facing entities
- ADR-002: onDelete behavior per foreign key
- ADR-003: Soft delete strategy (deleted_at)

### Session 2
Status: Auth decisions ready to document.
Suggested ADRs to write:
- ADR-004: JWT + httpOnly cookie auth strategy
- ADR-005: bcrypt rounds selection
- ADR-006: Rate limiting on auth endpoints

## Open questions and blockers

None currently.

## Handoff notes (updated each session)

### Latest from Agent 1
Auth complete. All endpoints verified working via curl.
Run npm run dev and test with curl before starting games.

### Latest from Agent 2
Nothing yet — auth testing pending.

### Latest from Agent 3
Nothing yet — documentation pending.

## Database state

runit_dev tables: sports, users, fields, games, game_players, messages,
knex_migrations, knex_migrations_lock

Seed data: One test user created during Session 2 testing (salim@test.com).

Test DB (runit_test): Created, migrations not yet run
(they run automatically via beforeAll in integration tests).

## Decisions log (quick reference)

| Decision                               | Rationale                                                  | ADR     |
| -------------------------------------- | ---------------------------------------------------------- | ------- |
| UUID for users/games/messages          | Prevents enumeration attacks                               | pending |
| Integer PK for sports/fields           | Never in URLs, faster joins                                | pending |
| bcrypt rounds=12                       | ~400ms — secure without perceptible lag                    | pending |
| JWT 15m access + 7d refresh cookie     | Short blast radius + seamless UX                           | pending |
| Knex over Prisma/TypeORM               | SQL-like, no black-box magic                               | pending |
| Vanilla JS + Alpine over React         | Shows platform understanding                               | pending |
| is_recurring on games                  | Pickup games repeat weekly — schema should reflect reality | pending |
| password_hash stripped before response | Never expose hashed credentials                            | pending |
| Same error for wrong email/password    | Never reveal which credential failed                       | pending |
| httpOnly cookie for refresh token      | JS cannot access it — XSS protection                       | pending |