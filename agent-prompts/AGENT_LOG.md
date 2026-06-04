# Run It — Agent Log

This file is the communication layer between all three Claude agents.
**Read it at the start of every session. Update it at the end.**
Commit to GitHub after every update. Never delete entries — only add.

---

## Project overview

Full-stack pickup soccer finder. Users create games at local fields,
find nearby games on a map, join/leave games, chat with other players.

**GitHub:** https://github.com/smansuri10/run-it
**Local path:** ~/Projects/run-it
**Node:** v20.20.2 | **PostgreSQL:** 16.13

---

## Current phase

Phase 1 — Core (must ship)

---

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
      games, game_players, messages)
- [x] runit_dev and runit_test databases created
- [x] Health check verified: GET /health → { status: ok, db: connected }

### Auth
- [ ] POST /auth/register
- [ ] POST /auth/login
- [ ] POST /auth/refresh
- [ ] POST /auth/logout
- [ ] Auth middleware (protect routes)

### Games
- [ ] POST /games (create)
- [ ] GET /games (list with location filter)
- [ ] GET /games/:id (detail)
- [ ] POST /games/:id/join
- [ ] DELETE /games/:id/join (leave)

### Map
- [ ] GET /games?lat=&lng=&radius= (map endpoint)

---

## Agent 1 — Backend engineer log

### Session 1 — Infrastructure (completed)
**Built:** Express server, DB connection, initial migration (all 6 tables)
**Key decisions:**
- UUIDs for users/games/messages, integers for sports/fields
- gen_random_uuid() — no extension needed (Postgres 13+)
- onDelete CASCADE/RESTRICT/SET NULL chosen deliberately per table
- if (require.main === module) guard for Supertest compatibility
- /health endpoint hits the DB — not a fake 200

**Handoff to Agent 2:** Nothing to test yet — no business logic.
**Handoff to Agent 3:** Schema decisions ready to document.

---

## Agent 2 — QA engineer log

### Session 1
**Status:** Waiting — no business logic to test yet.

---

## Agent 3 — Tech writer log

### Session 1
**Status:** Schema decisions available to document.
**Suggested ADRs to write:**
- ADR-001: UUID strategy for user-facing entities
- ADR-002: onDelete behavior per foreign key
- ADR-003: Soft delete strategy (deleted_at)

---

## Open questions and blockers

_None currently._

---

## Handoff notes (updated each session)

### Latest from Agent 1
Infrastructure complete. Ready to build auth next session.
Run `npm run dev` and `curl http://localhost:3000/health` to verify.

### Latest from Agent 2
Nothing yet.

### Latest from Agent 3
Nothing yet.

---

## Database state

**runit_dev tables:** sports, users, fields, games, game_players, messages,
knex_migrations, knex_migrations_lock

**Seed data:** None yet.

**Test DB (runit_test):** Created, migrations not yet run
(they run automatically via beforeAll in integration tests).

---

## Decisions log (quick reference)

| Decision | Rationale | ADR |
|----------|-----------|-----|
| UUID for users/games/messages | Prevents enumeration attacks | pending |
| Integer PK for sports/fields | Never in URLs, faster joins | pending |
| bcrypt rounds=12 | ~400ms — secure without perceptible lag | pending |
| JWT 15m access + 7d refresh cookie | Short blast radius + seamless UX | pending |
| Knex over Prisma/TypeORM | SQL-like, no black-box magic | pending |
| Vanilla JS + Alpine over React | Shows platform understanding | pending |
