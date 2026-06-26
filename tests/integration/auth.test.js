'use strict';

/**
 * Integration tests — /auth endpoints
 *
 * Hits the real runit_test database via Supertest.
 * NODE_ENV=test is required — knexfile routes to runit_test automatically.
 *
 * Run with:
 *   NODE_ENV=test npx jest --runInBand tests/integration/auth.test.js
 */

const request = require('supertest');
const app = require('../../src/index');
const db = require('../../src/config/db');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const validUser = {
    email: 'salim@test.com',
    password: 'Password1',
    username: 'salim_10',
    full_name: 'Salim Mansuri',
};

// Helper: register a user and return the full response body + cookies
const registerUser = (overrides = {}) =>
    request(app)
        .post('/auth/register')
        .send({ ...validUser, ...overrides });

// Helper: extract the refreshToken cookie value from a response
const getRefreshCookie = (res) => {
    const cookies = res.headers['set-cookie'] || [];
    const match = cookies.find((c) => c.startsWith('refreshToken='));
    return match ? match.split(';')[0].split('=')[1] : null;
};

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
    await db.migrate.latest();
});

afterAll(async () => {
    await db.destroy();
});

beforeEach(async () => {
    // Reset users before every test — no test depends on another's side effects
    await db('users').del();
});

// ─── POST /auth/register ──────────────────────────────────────────────────────

describe('POST /auth/register', () => {

    // Happy path
    it('returns 201 with user object and accessToken on valid input', async () => {
        const res = await registerUser();

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('user');
        expect(res.body).toHaveProperty('accessToken');
    });

    it('returns a user object with id, email, username, role, and created_at', async () => {
        const res = await registerUser();

        expect(res.body.user).toMatchObject({
            email: 'salim@test.com',
            username: 'salim_10',
            role: 'player',
        });
        expect(res.body.user).toHaveProperty('id');
        expect(res.body.user).toHaveProperty('created_at');
    });

    it('assigns role: player by default', async () => {
        const res = await registerUser();

        expect(res.body.user.role).toBe('player');
    });

    it('sets an httpOnly refreshToken cookie', async () => {
        const res = await registerUser();

        const cookies = res.headers['set-cookie'] || [];
        const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));

        expect(refreshCookie).toBeDefined();
        expect(refreshCookie.toLowerCase()).toContain('httponly');
    });

    it('sets the refreshToken cookie with SameSite=Lax', async () => {
        const res = await registerUser();

        const cookies = res.headers['set-cookie'] || [];
        const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));

        expect(refreshCookie.toLowerCase()).toContain('samesite=lax');
    });

    it('actually creates the user in the database', async () => {
        await registerUser();

        const user = await db('users').where({ email: 'salim@test.com' }).first();
        expect(user).toBeDefined();
        expect(user.username).toBe('salim_10');
    });

    it('stores a hash in the database — never the plain password', async () => {
        await registerUser();

        const user = await db('users').where({ email: 'salim@test.com' }).first();
        expect(user.password_hash).not.toBe('Password1');
        expect(user.password_hash).toMatch(/^\$2b\$/); // bcrypt signature
    });

    it('works without full_name (optional field)', async () => {
        const res = await registerUser({ full_name: undefined });

        expect(res.status).toBe(201);
    });

    // Security: sensitive fields must never appear in the response
    it('never returns password_hash in the response body', async () => {
        const res = await registerUser();

        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain('password_hash');
    });

    it('never returns deleted_at in the response body', async () => {
        const res = await registerUser();

        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain('deleted_at');
    });

    it('returns a user id that is a valid UUID v4 format', async () => {
        const res = await registerUser();

        const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(res.body.user.id).toMatch(uuidRegex);
    });

    it('normalizes email to lowercase before storing', async () => {
        const res = await registerUser({ email: 'SALIM@TEST.COM' });

        expect(res.status).toBe(201);
        // normalizeEmail in validate.js lowercases it
        const user = await db('users').where({ email: 'salim@test.com' }).first();
        expect(user).toBeDefined();
    });

    // Duplicate email
    it('returns 409 when email is already registered', async () => {
        await registerUser(); // first registration
        const res = await registerUser(); // same email

        expect(res.status).toBe(409);
    });

    it('returns an error message on 409 — not a stack trace', async () => {
        await registerUser();
        const res = await registerUser();

        expect(res.body).toHaveProperty('error');
        expect(res.body.error).not.toContain('at '); // no stack trace
    });

    it('returns 409 when same email submitted with different casing', async () => {
        await registerUser({ email: 'salim@test.com' });
        const res = await registerUser({ email: 'SALIM@TEST.COM' });

        expect(res.status).toBe(409);
    });

    // Validation failures — missing fields
    it('returns 400 when email is missing', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ password: 'Password1', username: 'salim_10' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when password is missing', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ email: 'salim@test.com', username: 'salim_10' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when username is missing', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ email: 'salim@test.com', password: 'Password1' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when the request body is completely empty', async () => {
        const res = await request(app).post('/auth/register').send({});

        expect(res.status).toBe(400);
    });

    // Validation failures — bad values
    it('returns 400 when email format is invalid', async () => {
        const res = await registerUser({ email: 'not-an-email' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when password is fewer than 8 characters', async () => {
        const res = await registerUser({ password: 'Pass1' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when password has no uppercase letter', async () => {
        const res = await registerUser({ password: 'password1' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when password has no number', async () => {
        const res = await registerUser({ password: 'Password' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when username is fewer than 3 characters', async () => {
        const res = await registerUser({ username: 'ab' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when username exceeds 50 characters', async () => {
        const res = await registerUser({ username: 'a'.repeat(51) });

        expect(res.status).toBe(400);
    });

    it('returns 400 when username contains spaces', async () => {
        const res = await registerUser({ username: 'salim mansuri' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when username contains special characters', async () => {
        const res = await registerUser({ username: 'salim@10' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when full_name exceeds 100 characters', async () => {
        const res = await registerUser({ full_name: 'A'.repeat(101) });

        expect(res.status).toBe(400);
    });

    it('returns 400 errors as an array with field-level messages', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ email: 'bad', password: 'short', username: 'ok' });

        expect(res.body).toHaveProperty('errors');
        expect(Array.isArray(res.body.errors)).toBe(true);
        expect(res.body.errors.length).toBeGreaterThan(0);
    });

    // Bad actor inputs
    it('returns 400 for a SQL injection attempt in the email field', async () => {
        const res = await registerUser({ email: "' OR 1=1; --" });

        expect(res.status).toBe(400); // caught by isEmail() validator
    });

    it('returns 400 for an oversized email string', async () => {
        const res = await registerUser({ email: 'a'.repeat(300) + '@test.com' });

        // isEmail() should reject this
        expect(res.status).toBe(400);
    });

    it('handles a non-JSON body gracefully', async () => {
        const res = await request(app)
            .post('/auth/register')
            .set('Content-Type', 'text/plain')
            .send('this is not json');

        // Express parses it as empty body — validator returns 400
        expect([400, 415]).toContain(res.status);
    });
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

describe('POST /auth/login', () => {

    beforeEach(async () => {
        // Seed one user for login tests
        await registerUser();
    });

    // Happy path
    it('returns 200 with user object and accessToken on valid credentials', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'salim@test.com', password: 'Password1' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('user');
        expect(res.body).toHaveProperty('accessToken');
    });

    it('sets an httpOnly refreshToken cookie on successful login', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'salim@test.com', password: 'Password1' });

        const cookies = res.headers['set-cookie'] || [];
        const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));

        expect(refreshCookie).toBeDefined();
        expect(refreshCookie.toLowerCase()).toContain('httponly');
    });

    it('never returns password_hash in the response body', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'salim@test.com', password: 'Password1' });

        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain('password_hash');
    });

    it('never returns deleted_at in the response body', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'salim@test.com', password: 'Password1' });

        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain('deleted_at');
    });

    it('accepts email in uppercase (normalizeEmail)', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'SALIM@TEST.COM', password: 'Password1' });

        expect(res.status).toBe(200);
    });

    // Wrong credentials
    it('returns 401 when the password is wrong', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'salim@test.com', password: 'WrongPassword1' });

        expect(res.status).toBe(401);
    });

    it('returns 401 when the email is not registered', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'ghost@test.com', password: 'Password1' });

        expect(res.status).toBe(401);
    });

    it('returns the SAME error message for wrong email and wrong password', async () => {
        const wrongEmail = await request(app)
            .post('/auth/login')
            .send({ email: 'ghost@test.com', password: 'Password1' });

        const wrongPassword = await request(app)
            .post('/auth/login')
            .send({ email: 'salim@test.com', password: 'WrongPassword1' });

        expect(wrongEmail.body.error).toBe(wrongPassword.body.error);
    });

    it('does not set a cookie on failed login', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'salim@test.com', password: 'WrongPassword1' });

        const cookies = res.headers['set-cookie'] || [];
        const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));

        expect(refreshCookie).toBeUndefined();
    });

    // Validation failures
    it('returns 400 when email is missing', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ password: 'Password1' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when password is missing', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'salim@test.com' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when email format is invalid', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'not-an-email', password: 'Password1' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when the request body is empty', async () => {
        const res = await request(app).post('/auth/login').send({});

        expect(res.status).toBe(400);
    });

    // Bad actor
    it('returns 401 for a SQL injection attempt in the password field', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'salim@test.com', password: "' OR '1'='1" });

        // bcrypt.compare will simply return false — no DB injection possible
        expect(res.status).toBe(401);
    });

    it('returns 401 for a blank password string', async () => {
        // validateLogin only checks notEmpty() on password.
        // An empty string passes notEmpty — see Findings.
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'salim@test.com', password: '' });

        // Should be 400 from validator, but may be 401 from bcrypt — see Findings.
        expect([400, 401]).toContain(res.status);
    });
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {

    let refreshTokenCookie;

    beforeEach(async () => {
        const res = await registerUser();
        const cookie = res.headers['set-cookie']?.find((c) =>
            c.startsWith('refreshToken=')
        );
        refreshTokenCookie = cookie;
    });

    // Happy path
    it('returns 200 with a new accessToken when a valid refresh cookie is present', async () => {
        const res = await request(app)
            .post('/auth/refresh')
            .set('Cookie', refreshTokenCookie);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('accessToken');
    });

    it('returns only accessToken — not a new refreshToken in the body', async () => {
        const res = await request(app)
            .post('/auth/refresh')
            .set('Cookie', refreshTokenCookie);

        expect(res.body).not.toHaveProperty('refreshToken');
    });

    it('returns a different accessToken than the original (token was actually refreshed)', async () => {
        const registerRes = await request(app)
            .post('/auth/register')
            .send({ ...validUser, email: 'refresh_unique@test.com', username: 'refresh_u' });

        const originalToken = registerRes.body.accessToken;
        const cookie = registerRes.headers['set-cookie']?.find((c) =>
            c.startsWith('refreshToken=')
        );

        // Small delay to ensure iat differs
        await new Promise((r) => setTimeout(r, 1100));

        const refreshRes = await request(app)
            .post('/auth/refresh')
            .set('Cookie', cookie);

        expect(refreshRes.body.accessToken).not.toBe(originalToken);
    });

    // No cookie
    it('returns 401 when no refresh cookie is present', async () => {
        const res = await request(app).post('/auth/refresh');
        // No cookie set at all

        expect(res.status).toBe(401);
    });

    // Tampered / invalid token
    it('returns 401 when the refresh token cookie is tampered with', async () => {
        const res = await request(app)
            .post('/auth/refresh')
            .set('Cookie', 'refreshToken=tampered.garbage.value');

        expect(res.status).toBe(401);
    });

    it('returns 401 when an access token is submitted as the refresh token', async () => {
        // Register, grab the access token, submit it as a cookie
        const registerRes = await registerUser({
            email: 'access_as_refresh@test.com',
            username: 'access_rf',
        });
        const accessToken = registerRes.body.accessToken;

        const res = await request(app)
            .post('/auth/refresh')
            .set('Cookie', `refreshToken=${accessToken}`);

        expect(res.status).toBe(401);
    });

    it('returns 401 when the refresh token is a random string', async () => {
        const res = await request(app)
            .post('/auth/refresh')
            .set('Cookie', 'refreshToken=randomstringthatisnotavalidjwt');

        expect(res.status).toBe(401);
    });

    it('never returns password_hash in the refresh response', async () => {
        const res = await request(app)
            .post('/auth/refresh')
            .set('Cookie', refreshTokenCookie);

        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain('password_hash');
    });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {

    let refreshTokenCookie;

    beforeEach(async () => {
        const res = await registerUser();
        refreshTokenCookie = res.headers['set-cookie']?.find((c) =>
            c.startsWith('refreshToken=')
        );
    });

    it('returns 200 with a success message', async () => {
        const res = await request(app)
            .post('/auth/logout')
            .set('Cookie', refreshTokenCookie);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message');
    });

    it('clears the refreshToken cookie', async () => {
        const res = await request(app)
            .post('/auth/logout')
            .set('Cookie', refreshTokenCookie);

        const cookies = res.headers['set-cookie'] || [];
        const clearedCookie = cookies.find((c) => c.startsWith('refreshToken='));

        // A cleared cookie has an empty value and a past Expires date
        expect(clearedCookie).toBeDefined();
        const cookieLower = clearedCookie.toLowerCase();
        const hasEmptyValue = clearedCookie.startsWith('refreshToken=;');
        const hasExpired =
            cookieLower.includes('expires=') &&
            (cookieLower.includes('1970') || cookieLower.includes('invalid date'));

        expect(hasEmptyValue || hasExpired).toBe(true);
    });

    it('returns 200 even when no cookie is present (idempotent logout)', async () => {
        // Logging out without a cookie should still succeed — no session to invalidate
        const res = await request(app).post('/auth/logout');

        expect(res.status).toBe(200);
    });

    it('after logout, the old refresh token can no longer be used to refresh', async () => {
        // Logout
        await request(app)
            .post('/auth/logout')
            .set('Cookie', refreshTokenCookie);

        // Note: the token itself is still cryptographically valid until it expires.
        // Run It does not yet maintain a token blocklist.
        // This test documents that limitation — see Findings.
        const refreshRes = await request(app)
            .post('/auth/refresh')
            .set('Cookie', refreshTokenCookie);

        // EXPECTED BEHAVIOR once blocklist is implemented: 401
        // CURRENT BEHAVIOR (no blocklist): 200 — token still works after logout
        // This test will fail until a blocklist is added — that is intentional.
        expect(refreshRes.status).toBe(401);
    });
});

// ─── authenticate middleware via a protected route ────────────────────────────
// There is no protected route yet — these will be more relevant in Session 3.
// Adding a canary test now using /health as a baseline.

describe('authenticate middleware (integration canary)', () => {

    it('GET /health is reachable without a token (public route)', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
    });

    it('GET / returns 200 (public route baseline)', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
    });

    it('unknown routes return 404', async () => {
        const res = await request(app).get('/auth/doesnotexist');
        expect(res.status).toBe(404);
    });
});
