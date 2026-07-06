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
- [x] Auth test suite (109/110 passing — 1 intentional blocklist sentinel)

### Games
- [x] POST /games (create)
- [x] GET /games (list with location filter)
- [x] GET /games/:id (detail)
- [x] POST /games/:id/join
- [x] DELETE /games/:id/join (leave)
- [x] Games test suite (177/178 passing — 1 intentional blocklist sentinel)

### Map
- [ ] GET /games?lat=&lng=&radius= (map endpoint — covered by GET /games filters)

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
- src/models/userModel.js — findByEmail, findById, findByUsername, create
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
- Rate limiter set to 1000 in test environment to prevent false 429s
- authenticate middleware strips password_hash and deleted_at defensively
- Constant-time login — always calls bcrypt.compare even when user not found
- Username uniqueness checked in service layer — clean 409 not raw DB error
- Blocklist deferred to Session 5 — low risk in dev, required before launch

Verified working:
- POST /auth/register creates user, returns access token
- POST /auth/login verifies password, returns access token and sets cookie
- Wrong password returns 401
- Duplicate email returns 409
- Duplicate username returns 409
- Invalid inputs return 400 with specific error messages per field
- password_hash and deleted_at never appear in responses
- 109/110 tests passing — 1 intentional failure documents missing blocklist

Handoff to Agent 2: Complete — see Session 2 entry below.
Handoff to Agent 3: Auth decisions ready to document.

### Session 3 — Games (completed)
Built: Full games feature — create, list, detail, join, leave with waitlist logic
Files created:
- src/models/gameModel.js — 12 DB functions including Haversine geo filter
- src/services/gameService.js — createGame, getGameById, listGames, joinGame, leaveGame
- src/controllers/gameController.js — 5 endpoints
- src/routes/games.js — public and protected routes with UUID param validation
- src/index.js — updated to mount games routes

Key decisions:
- GET /games and GET /games/:id are public — no auth required for discovery
- Host automatically added as first player with role host on game creation
- Waitlist promotion is FIFO via joined_at ordering
- Host cannot leave — cancel endpoint deferred to later session
- Haversine formula clamped with GREATEST/LEAST to prevent acos out-of-range error
- Falsy-zero bug fixed — coordinate 0 no longer rejected as missing location
- UUID validation on all :id params — clean 400 instead of raw Postgres cast error
- COALESCE handles both known field coordinates and freeform game coordinates

Verified working:
- POST /games creates game, host added automatically as first player
- GET /games lists open future games with display_location computed field
- GET /games/:id returns game with players array, player_count, spots_remaining
- POST /games/:id/join adds as player or waitlist depending on capacity
- DELETE /games/:id/join removes player, promotes waitlist if game was full
- No token returns 401, already in game returns 409, invalid UUID returns 400
- 177/178 tests passing — 1 intentional failure (blocklist sentinel)

Handoff to Agent 2: Complete — see Session 3 entry below.
Handoff to Agent 3: Games decisions ready to document.

## Agent 2 — QA engineer log

### Session 1
Status: Waiting — no business logic to test yet.

### Session 2 — Auth review and testing (completed)
Status: Complete. Full test suite written, delivered, and passing.

Files created:
- tests/unit/authService.test.js — 32 unit tests, model layer mocked
- tests/unit/authMiddleware.test.js — 15 unit tests, JWT and model mocked
- tests/integration/auth.test.js — 48 integration tests against runit_test

Results: 109 passing, 1 intentional failure (blocklist sentinel)

Key findings addressed:
- FIXED — Timing side-channel: login now always calls bcrypt.compare
- FIXED — Duplicate username throws clean 409 instead of raw DB error
- FIXED — Auth middleware defensively strips password_hash and deleted_at
- FIXED — validateLogin rejects empty string password as 400
- FIXED — knexfile test DB hardcoded to runit_test
- FIXED — Rate limiter disabled in test environment
- DEFERRED — Logout does not invalidate refresh token (no blocklist)
  Fix planned for Session 5 — auth hardening.

Handoff to Agent 1: Auth system solid. Ready for Session 3 games endpoints.

### Session 3 — Games feature review and testing (completed)
Status: Complete. Findings delivered, full test suite passing.

Files created:
- tests/unit/gameService.test.js — 27 unit tests, model layer mocked
- tests/integration/games.test.js — integration tests for all 5 game routes

Results: 177/178 passing — 1 intentional failure (blocklist sentinel)

Key findings addressed:
- FIXED — Falsy-zero bug on location coordinates in createGame and findAll
- FIXED — UUID validation on :id params — clean 400 instead of raw 500
- FIXED — Haversine acos clamp prevents out-of-range Postgres error
- DEFERRED — Join race condition needs transaction design decision
- DEFERRED — No cancel endpoint exists — leaveGame references it but route does not exist
- DEFERRED — No query param validation on GET /games
- NOTED — Join does not re-check starts_at (intentional grace period)

Handoff to Agent 1:
Address race condition and cancel endpoint before public launch.
Ready for Session 4 — frontend.

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
- ADR-007: Refresh token blocklist — deferred decision and reasoning
- ADR-008: Constant-time login pattern

### Session 3
Status: Games decisions ready to document.
Suggested ADRs to write:
- ADR-009: Waitlist promotion strategy (FIFO via joined_at)
- ADR-010: Haversine distance filter and acos clamp
- ADR-011: Public vs protected route decision for game discovery
- ADR-012: Cancel game deferred — reasoning and plan

## Open questions and blockers

Refresh token blocklist not yet implemented — documented as known gap.
Low risk in development, required before public launch.

Join race condition not yet resolved — two simultaneous joins on the last
spot could overfill a game. Needs transaction design decision before launch.

Cancel game endpoint not yet built — leaveGame blocks host from leaving
but no cancel route exists. Planned for a future session.

## Handoff notes (updated each session)

### Latest from Agent 1
Games complete and hardened. 177/178 tests passing.
Sport seeded in runit_dev: Soccer id=1.
Ready for Session 4 — frontend.

### Latest from Agent 2
Games test suite complete. 177/178 passing.
Key deferred items: join race condition, cancel endpoint.
Ready for Session 4 — frontend.

### Latest from Agent 3
Nothing yet — documentation pending.

## Database state

runit_dev tables: sports, users, fields, games, game_players, messages,
knex_migrations, knex_migrations_lock

Seed data:
- Sports: Soccer id=1
- Test users: salim@test.com, test2@test.com, player2@test.com
- Test games: Pier Park game created during Session 3 testing

Test DB (runit_test): Migrations run automatically via beforeAll.
Wiped between every test via beforeEach. Clean state guaranteed.
Sports seeded in beforeAll by integration test setup.

## Decisions log (quick reference)

| Decision                                    | Rationale                                                  | ADR     |
| ------------------------------------------- | ---------------------------------------------------------- | ------- |
| UUID for users/games/messages               | Prevents enumeration attacks                               | pending |
| Integer PK for sports/fields                | Never in URLs, faster joins                                | pending |
| bcrypt rounds=12                            | ~400ms — secure without perceptible lag                    | pending |
| JWT 15m access + 7d refresh cookie          | Short blast radius + seamless UX                           | pending |
| Knex over Prisma/TypeORM                    | SQL-like, no black-box magic                               | pending |
| Vanilla JS + Alpine over React              | Shows platform understanding                               | pending |
| is_recurring on games                       | Pickup games repeat weekly — schema should reflect reality | pending |
| password_hash stripped before response      | Never expose hashed credentials                            | pending |
| Same error for wrong email/password         | Never reveal which credential failed                       | pending |
| httpOnly cookie for refresh token           | JS cannot access it — XSS protection                       | pending |
| Constant-time login (DUMMY_HASH)            | Prevents timing oracle revealing registered emails         | pending |
| Username uniqueness check in service        | Clean 409 instead of raw DB 23505 error                    | pending |
| Middleware strips password_hash defensively | Safe even if model changes later                           | pending |
| Blocklist deferred to Session 5             | Low risk for dev phase, required before public launch      | pending |
| Rate limiter bypassed in test env           | 1000 req limit prevents false 429s in test suite           | pending |
| GET /games public, POST protected           | Discovery without account, actions require auth            | pending |
| Waitlist promotion FIFO                     | joined_at ordering — first in first promoted               | pending |
| Haversine GREATEST/LEAST clamp              | Prevents acos domain error on identical coordinates        | pending |
| Falsy-zero check on coordinates             | 0 is valid lat/lng — use undefined/null not truthiness     | pending |
| UUID param validation                       | Clean 400 instead of raw Postgres cast error               | pending |
| Join race condition deferred                | Needs transaction design decision before public launch     | pending |
| Cancel game deferred                        | Host cannot leave but no cancel route exists yet           | pending |