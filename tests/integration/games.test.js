const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/index');
const db = require('../../src/config/db');

/**
 * NOTE FOR AGENT 1: this file assumes POST /auth/register accepts
 * { email, username, password, full_name } and returns a JSON body
 * containing an access token and the created user's id. extractToken()
 * and extractUserId() below try a few common field-name shapes so this
 * file doesn't have to hardcode a guess — if your actual response shape
 * isn't covered, add it there rather than changing every test.
 */
function extractToken(body) {
  return (
    body.accessToken ||
    body.access_token ||
    body.token ||
    (body.data && (body.data.accessToken || body.data.access_token))
  );
}

function extractUserId(body) {
  return (body.user && body.user.id) || body.id || (body.data && body.data.id);
}

const SPORT_ID = 1;

const futureDate = (hoursFromNow = 24) =>
  new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();

const pastDate = () => new Date(Date.now() - 1000 * 60 * 60).toISOString();

async function registerUser(overrides = {}) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const payload = {
    email: `qa-${suffix}@test.com`,
    username: `qa_${suffix}`,
    password: 'ValidPass123!',
    full_name: 'QA Test User',
    ...overrides,
  };
  const res = await request(app).post('/auth/register').send(payload);
  if (res.statusCode !== 201) {
    throw new Error(
      `registerUser helper failed with status ${res.statusCode}: ${JSON.stringify(res.body)}. ` +
        `Check that the payload shape in this helper matches the real /auth/register contract.`
    );
  }
  return {
    token: extractToken(res.body),
    id: extractUserId(res.body),
  };
}

async function createGame(token, overrides = {}) {
  const payload = {
    sport_id: SPORT_ID,
    starts_at: futureDate(),
    max_players: 10,
    location_lat: 45.5,
    location_lng: -122.6,
    ...overrides,
  };
  return request(app).post('/games').set('Authorization', `Bearer ${token}`).send(payload);
}

describe('Games API', () => {
  let host, other, third;

  beforeAll(async () => {
    await db.migrate.latest();
    const sport = await db('sports').where({ id: SPORT_ID }).first();
    if (!sport) {
      await db('sports').insert({ id: SPORT_ID, name: 'Soccer' });
    }
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db('game_players').del();
    await db('games').del();
    await db('users').del();

    host = await registerUser();
    other = await registerUser();
    third = await registerUser();
  });

  // ───────────────────────────────────────────────────────────────────────
  // POST /games
  // ───────────────────────────────────────────────────────────────────────
  describe('POST /games', () => {
    it('creates a game and returns 201', async () => {
      const res = await createGame(host.token);

      expect(res.statusCode).toBe(201);
      expect(res.body.game).toBeDefined();
      expect(res.body.game.status).toBe('open');
    });

    it('adds the creator as the host player', async () => {
      const createRes = await createGame(host.token);
      const gameId = createRes.body.game.id;

      const getRes = await request(app).get(`/games/${gameId}`);

      expect(getRes.body.game.players).toHaveLength(1);
      expect(getRes.body.game.players[0].role).toBe('host');
    });

    it('returns 401 without an auth token', async () => {
      const res = await request(app).post('/games').send({
        sport_id: SPORT_ID,
        starts_at: futureDate(),
        max_players: 10,
        location_lat: 45.5,
        location_lng: -122.6,
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 400 when sport_id is missing', async () => {
      const res = await createGame(host.token, { sport_id: undefined });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when starts_at is missing', async () => {
      const res = await createGame(host.token, { starts_at: undefined });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when starts_at is in the past', async () => {
      const res = await createGame(host.token, { starts_at: pastDate() });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when max_players is missing', async () => {
      const res = await createGame(host.token, { max_players: undefined });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when max_players is out of range (1)', async () => {
      const res = await createGame(host.token, { max_players: 1 });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when max_players is out of range (51)', async () => {
      const res = await createGame(host.token, { max_players: 51 });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for an invalid skill_level', async () => {
      const res = await createGame(host.token, { skill_level: 'legendary' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when neither field_id nor a full lat/lng pair is provided', async () => {
      const res = await createGame(host.token, { location_lat: undefined, location_lng: undefined });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when only location_lat is provided without location_lng', async () => {
      const res = await createGame(host.token, { location_lng: undefined });
      expect(res.statusCode).toBe(400);
    });

    it(
      'SENTINEL — location_lat: 0, location_lng: 0 is a valid coordinate pair and should ' +
        'be accepted (Finding 1: falsy-zero bug). Expected to FAIL until fixed. Do not delete.',
      async () => {
        const res = await createGame(host.token, { location_lat: 0, location_lng: 0 });
        expect(res.statusCode).toBe(201);
      }
    );
  });

  // ───────────────────────────────────────────────────────────────────────
  // GET /games
  // ───────────────────────────────────────────────────────────────────────
  describe('GET /games', () => {
    it('returns open games without requiring auth', async () => {
      await createGame(host.token);

      const res = await request(app).get('/games');

      expect(res.statusCode).toBe(200);
      expect(res.body.games.length).toBeGreaterThanOrEqual(1);
    });

    it('does not return cancelled games', async () => {
      const createRes = await createGame(host.token);
      await db('games').where({ id: createRes.body.game.id }).update({ status: 'cancelled' });

      const res = await request(app).get('/games');

      expect(res.body.games.find((g) => g.id === createRes.body.game.id)).toBeUndefined();
    });

    it('does not return games that have already started', async () => {
      const createRes = await createGame(host.token, { starts_at: futureDate(1) });
      await db('games').where({ id: createRes.body.game.id }).update({ starts_at: pastDate() });

      const res = await request(app).get('/games');

      expect(res.body.games.find((g) => g.id === createRes.body.game.id)).toBeUndefined();
    });

    it('filters by sport_id', async () => {
      await createGame(host.token);

      const res = await request(app).get('/games').query({ sport_id: 999999 });

      expect(res.body.games).toHaveLength(0);
    });

    it('filters by skill_level', async () => {
      await createGame(host.token, { skill_level: 'beginner' });

      const res = await request(app).get('/games').query({ skill_level: 'advanced' });

      expect(res.body.games).toHaveLength(0);
    });

    it('returns games within the given radius', async () => {
      // Portland, OR coordinates
      await createGame(host.token, { location_lat: 45.5152, location_lng: -122.6784 });

      const res = await request(app)
        .get('/games')
        .query({ lat: 45.5152, lng: -122.6784, radius: 10 });

      expect(res.body.games.length).toBeGreaterThanOrEqual(1);
    });

    it('excludes games outside the given radius', async () => {
      // Seattle, WA — far outside a 10km radius from Portland
      await createGame(host.token, { location_lat: 47.6062, location_lng: -122.3321 });

      const res = await request(app)
        .get('/games')
        .query({ lat: 45.5152, lng: -122.6784, radius: 10 });

      expect(res.body.games).toHaveLength(0);
    });

    it(
      'SENTINEL — a location filter anchored at lat: 0, lng: 0 should still apply ' +
        '(Finding 1: same falsy-zero bug in gameModel.findAll). Expected to FAIL until fixed.',
      async () => {
        // Game far from null island — should be excluded by a working filter
        await createGame(host.token, { location_lat: 45.5152, location_lng: -122.6784 });

        const res = await request(app).get('/games').query({ lat: 0, lng: 0, radius: 10 });

        expect(res.body.games).toHaveLength(0);
      }
    );
  });

  // ───────────────────────────────────────────────────────────────────────
  // GET /games/:id
  // ───────────────────────────────────────────────────────────────────────
  describe('GET /games/:id', () => {
    it('returns the game with players and spots_remaining', async () => {
      const createRes = await createGame(host.token, { max_players: 5 });

      const res = await request(app).get(`/games/${createRes.body.game.id}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.game.player_count).toBe(1);
      expect(res.body.game.spots_remaining).toBe(4);
    });

    it('returns 404 for a well-formed but nonexistent id', async () => {
      const res = await request(app).get(`/games/${crypto.randomUUID()}`);
      expect(res.statusCode).toBe(404);
    });

    it(
      'SENTINEL — a malformed id should return 400, not a raw 500 ' +
        '(Finding 5: no UUID-format validation on the :id param). Expected to FAIL until ' +
        'a UUID validator is added to the route. Do not delete.',
      async () => {
        const res = await request(app).get('/games/not-a-uuid');
        expect(res.statusCode).toBe(400);
      }
    );
  });

  // ───────────────────────────────────────────────────────────────────────
  // POST /games/:id/join
  // ───────────────────────────────────────────────────────────────────────
  describe('POST /games/:id/join', () => {
    it('joins an open game as a player', async () => {
      const createRes = await createGame(host.token, { max_players: 10 });
      const gameId = createRes.body.game.id;

      const res = await request(app)
        .post(`/games/${gameId}/join`)
        .set('Authorization', `Bearer ${other.token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.role).toBe('player');
    });

    it('returns 401 without an auth token', async () => {
      const createRes = await createGame(host.token);
      const res = await request(app).post(`/games/${createRes.body.game.id}/join`);
      expect(res.statusCode).toBe(401);
    });

    it('returns 404 for a nonexistent game', async () => {
      const res = await request(app)
        .post(`/games/${crypto.randomUUID()}/join`)
        .set('Authorization', `Bearer ${other.token}`);
      expect(res.statusCode).toBe(404);
    });

    it('returns 409 when the host tries to join their own game again', async () => {
      const createRes = await createGame(host.token);

      const res = await request(app)
        .post(`/games/${createRes.body.game.id}/join`)
        .set('Authorization', `Bearer ${host.token}`);

      expect(res.statusCode).toBe(409);
    });

    it('returns 409 on a duplicate join attempt by the same non-host user', async () => {
      const createRes = await createGame(host.token, { max_players: 10 });
      const gameId = createRes.body.game.id;

      await request(app).post(`/games/${gameId}/join`).set('Authorization', `Bearer ${other.token}`);
      const res = await request(app)
        .post(`/games/${gameId}/join`)
        .set('Authorization', `Bearer ${other.token}`);

      expect(res.statusCode).toBe(409);
    });

    it('returns 400 when the game is cancelled', async () => {
      const createRes = await createGame(host.token);
      await db('games').where({ id: createRes.body.game.id }).update({ status: 'cancelled' });

      const res = await request(app)
        .post(`/games/${createRes.body.game.id}/join`)
        .set('Authorization', `Bearer ${other.token}`);

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when the game is completed', async () => {
      const createRes = await createGame(host.token);
      await db('games').where({ id: createRes.body.game.id }).update({ status: 'completed' });

      const res = await request(app)
        .post(`/games/${createRes.body.game.id}/join`)
        .set('Authorization', `Bearer ${other.token}`);

      expect(res.statusCode).toBe(400);
    });

    it('waitlists a player once the game reaches max_players, and flips status to full', async () => {
      // host + other = 2 players fills a max_players: 2 game
      const createRes = await createGame(host.token, { max_players: 2 });
      const gameId = createRes.body.game.id;

      const fillRes = await request(app)
        .post(`/games/${gameId}/join`)
        .set('Authorization', `Bearer ${other.token}`);
      expect(fillRes.statusCode).toBe(200);
      expect(fillRes.body.role).toBe('player');

      const waitlistRes = await request(app)
        .post(`/games/${gameId}/join`)
        .set('Authorization', `Bearer ${third.token}`);
      expect(waitlistRes.statusCode).toBe(200);
      expect(waitlistRes.body.role).toBe('waitlist');

      const gameAfter = await db('games').where({ id: gameId }).first();
      expect(gameAfter.status).toBe('full');
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // DELETE /games/:id/join (leave)
  // ───────────────────────────────────────────────────────────────────────
  describe('DELETE /games/:id/join', () => {
    it('lets a joined player leave the game', async () => {
      const createRes = await createGame(host.token, { max_players: 10 });
      const gameId = createRes.body.game.id;
      await request(app).post(`/games/${gameId}/join`).set('Authorization', `Bearer ${other.token}`);

      const res = await request(app)
        .delete(`/games/${gameId}/join`)
        .set('Authorization', `Bearer ${other.token}`);

      expect(res.statusCode).toBe(200);
    });

    it('returns 401 without an auth token', async () => {
      const createRes = await createGame(host.token);
      const res = await request(app).delete(`/games/${createRes.body.game.id}/join`);
      expect(res.statusCode).toBe(401);
    });

    it('returns 404 for a nonexistent game', async () => {
      const res = await request(app)
        .delete(`/games/${crypto.randomUUID()}/join`)
        .set('Authorization', `Bearer ${other.token}`);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when the user is not in the game', async () => {
      const createRes = await createGame(host.token);

      const res = await request(app)
        .delete(`/games/${createRes.body.game.id}/join`)
        .set('Authorization', `Bearer ${other.token}`);

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when the host tries to leave', async () => {
      const createRes = await createGame(host.token);

      const res = await request(app)
        .delete(`/games/${createRes.body.game.id}/join`)
        .set('Authorization', `Bearer ${host.token}`);

      expect(res.statusCode).toBe(400);
    });

    it('promotes the first waitlisted player when a full game loses a player', async () => {
      const createRes = await createGame(host.token, { max_players: 2 });
      const gameId = createRes.body.game.id;

      // fill the game: host + other
      await request(app).post(`/games/${gameId}/join`).set('Authorization', `Bearer ${other.token}`);
      // third waitlists
      await request(app).post(`/games/${gameId}/join`).set('Authorization', `Bearer ${third.token}`);

      // other leaves — third should be promoted
      const leaveRes = await request(app)
        .delete(`/games/${gameId}/join`)
        .set('Authorization', `Bearer ${other.token}`);
      expect(leaveRes.statusCode).toBe(200);

      const thirdPlayerRow = await db('game_players')
        .where({ game_id: gameId, user_id: third.id })
        .first();
      expect(thirdPlayerRow.role).toBe('player');

      const gameAfter = await db('games').where({ id: gameId }).first();
      expect(gameAfter.status).toBe('full');
    });

    it('flips status back to open when a full game loses a player and no one is waitlisted', async () => {
      const createRes = await createGame(host.token, { max_players: 2 });
      const gameId = createRes.body.game.id;

      await request(app).post(`/games/${gameId}/join`).set('Authorization', `Bearer ${other.token}`);

      const gameFull = await db('games').where({ id: gameId }).first();
      expect(gameFull.status).toBe('full');

      await request(app).delete(`/games/${gameId}/join`).set('Authorization', `Bearer ${other.token}`);

      const gameAfter = await db('games').where({ id: gameId }).first();
      expect(gameAfter.status).toBe('open');
    });
  });
});
