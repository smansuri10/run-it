'use strict';

/**
 * Unit tests — authService.js
 *
 * The model layer is fully mocked. No database is touched.
 * Every test exercises the service contract: inputs in, outputs/errors out.
 */

// ─── Mock dependencies before requiring the service ──────────────────────────

jest.mock('../../src/models/userModel');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

const userModel = require('../../src/models/userModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authService = require('../../src/services/authService');

// ─── Shared test fixtures ─────────────────────────────────────────────────────

const mockUser = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    email: 'salim@test.com',
    username: 'salim_10',
    full_name: 'Salim Mansuri',
    role: 'player',
    password_hash: '$2b$12$hashedpasswordhere',
    created_at: new Date(),
    updated_at: new Date(),
};

const mockUserSafe = (() => {
    const { password_hash, ...safe } = mockUser;
    return safe;
})();

// ─── generateTokens (indirect — tested via register/login) ───────────────────
// generateTokens is not exported, so we test its behavior through the
// functions that call it. Assertions on token shape live in register/login.

// ─── register ─────────────────────────────────────────────────────────────────

describe('authService.register', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default happy-path setup
        userModel.findByEmail.mockResolvedValue(null); // email not taken
        bcrypt.hash.mockResolvedValue('$2b$12$hashedpasswordhere');
        userModel.create.mockResolvedValue({
            id: mockUser.id,
            email: mockUser.email,
            username: mockUser.username,
            full_name: mockUser.full_name,
            role: mockUser.role,
            created_at: mockUser.created_at,
        });
        jwt.sign.mockReturnValueOnce('mock.access.token').mockReturnValueOnce('mock.refresh.token');
    });

    it('returns user, accessToken, and refreshToken on valid input', async () => {
        const result = await authService.register({
            email: 'salim@test.com',
            password: 'Password1',
            username: 'salim_10',
            full_name: 'Salim Mansuri',
        });

        expect(result).toHaveProperty('user');
        expect(result).toHaveProperty('accessToken');
        expect(result).toHaveProperty('refreshToken');
    });

    it('calls findByEmail with the submitted email', async () => {
        await authService.register({
            email: 'salim@test.com',
            password: 'Password1',
            username: 'salim_10',
        });

        expect(userModel.findByEmail).toHaveBeenCalledWith('salim@test.com');
    });

    it('hashes the password before storing it', async () => {
        await authService.register({
            email: 'salim@test.com',
            password: 'Password1',
            username: 'salim_10',
        });

        expect(bcrypt.hash).toHaveBeenCalledWith('Password1', expect.any(Number));
    });

    it('passes the hash — not the plain password — to userModel.create', async () => {
        await authService.register({
            email: 'salim@test.com',
            password: 'Password1',
            username: 'salim_10',
        });

        const createCall = userModel.create.mock.calls[0][0];
        expect(createCall).toHaveProperty('password_hash');
        expect(createCall).not.toHaveProperty('password');
    });

    it('never returns password_hash in the user object', async () => {
        const result = await authService.register({
            email: 'salim@test.com',
            password: 'Password1',
            username: 'salim_10',
        });

        expect(result.user).not.toHaveProperty('password_hash');
    });

    it('throws 409 when email is already taken', async () => {
        userModel.findByEmail.mockResolvedValue(mockUser);

        await expect(
            authService.register({
                email: 'salim@test.com',
                password: 'Password1',
                username: 'salim_10',
            })
        ).rejects.toMatchObject({ status: 409 });
    });

    it('throws 409 with a descriptive message when email is already taken', async () => {
        userModel.findByEmail.mockResolvedValue(mockUser);

        await expect(
            authService.register({
                email: 'salim@test.com',
                password: 'Password1',
                username: 'salim_10',
            })
        ).rejects.toThrow('Email already in use');
    });

    it('does not call bcrypt.hash when email is already taken', async () => {
        userModel.findByEmail.mockResolvedValue(mockUser);

        await authService.register({
            email: 'salim@test.com',
            password: 'Password1',
            username: 'salim_10',
        }).catch(() => { });

        expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    it('does not call userModel.create when email is already taken', async () => {
        userModel.findByEmail.mockResolvedValue(mockUser);

        await authService.register({
            email: 'salim@test.com',
            password: 'Password1',
            username: 'salim_10',
        }).catch(() => { });

        expect(userModel.create).not.toHaveBeenCalled();
    });

    it('propagates unexpected DB errors from findByEmail', async () => {
        userModel.findByEmail.mockRejectedValue(new Error('DB connection lost'));

        await expect(
            authService.register({
                email: 'salim@test.com',
                password: 'Password1',
                username: 'salim_10',
            })
        ).rejects.toThrow('DB connection lost');
    });

    it('propagates unexpected DB errors from userModel.create', async () => {
        userModel.create.mockRejectedValue(new Error('unique constraint violation'));

        await expect(
            authService.register({
                email: 'salim@test.com',
                password: 'Password1',
                username: 'salim_10',
            })
        ).rejects.toThrow('unique constraint violation');
    });

    it('generates both an access token and a refresh token', async () => {
        await authService.register({
            email: 'salim@test.com',
            password: 'Password1',
            username: 'salim_10',
        });

        // jwt.sign should be called exactly twice — once per token
        expect(jwt.sign).toHaveBeenCalledTimes(2);
    });

    it('embeds the user UUID as the sub claim in both tokens', async () => {
        await authService.register({
            email: 'salim@test.com',
            password: 'Password1',
            username: 'salim_10',
        });

        const calls = jwt.sign.mock.calls;
        expect(calls[0][0]).toMatchObject({ sub: mockUser.id });
        expect(calls[1][0]).toMatchObject({ sub: mockUser.id });
    });

    it('sets type: access on the access token and type: refresh on the refresh token', async () => {
        await authService.register({
            email: 'salim@test.com',
            password: 'Password1',
            username: 'salim_10',
        });

        const calls = jwt.sign.mock.calls;
        expect(calls[0][0]).toMatchObject({ type: 'access' });
        expect(calls[1][0]).toMatchObject({ type: 'refresh' });
    });

    it('works when full_name is omitted (optional field)', async () => {
        const result = await authService.register({
            email: 'salim@test.com',
            password: 'Password1',
            username: 'salim_10',
            // full_name deliberately omitted
        });

        expect(result).toHaveProperty('accessToken');
    });
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('authService.login', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        userModel.findByEmail.mockResolvedValue(mockUser);
        bcrypt.compare.mockResolvedValue(true);
        jwt.sign
            .mockReturnValueOnce('mock.access.token')
            .mockReturnValueOnce('mock.refresh.token');
    });

    it('returns user, accessToken, and refreshToken on valid credentials', async () => {
        const result = await authService.login({
            email: 'salim@test.com',
            password: 'Password1',
        });

        expect(result).toHaveProperty('user');
        expect(result).toHaveProperty('accessToken');
        expect(result).toHaveProperty('refreshToken');
    });

    it('never returns password_hash in the user object', async () => {
        const result = await authService.login({
            email: 'salim@test.com',
            password: 'Password1',
        });

        expect(result.user).not.toHaveProperty('password_hash');
    });

    it('throws 401 when user is not found', async () => {
        userModel.findByEmail.mockResolvedValue(null);

        await expect(
            authService.login({ email: 'ghost@test.com', password: 'Password1' })
        ).rejects.toMatchObject({ status: 401 });
    });

    it('throws 401 when password is wrong', async () => {
        bcrypt.compare.mockResolvedValue(false);

        await expect(
            authService.login({ email: 'salim@test.com', password: 'WrongPassword1' })
        ).rejects.toMatchObject({ status: 401 });
    });

    it('returns the SAME error message for wrong email and wrong password', async () => {
        userModel.findByEmail.mockResolvedValue(null);
        let wrongEmailError;
        try {
            await authService.login({ email: 'ghost@test.com', password: 'Password1' });
        } catch (e) {
            wrongEmailError = e.message;
        }

        userModel.findByEmail.mockResolvedValue(mockUser);
        bcrypt.compare.mockResolvedValue(false);
        let wrongPasswordError;
        try {
            await authService.login({ email: 'salim@test.com', password: 'WrongPassword1' });
        } catch (e) {
            wrongPasswordError = e.message;
        }

        // Critical: attacker cannot distinguish which credential failed
        expect(wrongEmailError).toBe(wrongPasswordError);
    });

    it('calls bcrypt.compare with the submitted password and the stored hash', async () => {
        await authService.login({ email: 'salim@test.com', password: 'Password1' });

        expect(bcrypt.compare).toHaveBeenCalledWith('Password1', mockUser.password_hash);
    });

    it('always calls bcrypt.compare even when user is not found (prevents timing attack)', async () => {
        userModel.findByEmail.mockResolvedValue(null);

        await authService.login({ email: 'ghost@test.com', password: 'Password1' }).catch(() => { });

        expect(bcrypt.compare).toHaveBeenCalled();
    });

    it('propagates unexpected DB errors', async () => {
        userModel.findByEmail.mockRejectedValue(new Error('connection refused'));

        await expect(
            authService.login({ email: 'salim@test.com', password: 'Password1' })
        ).rejects.toThrow('connection refused');
    });

    it('returns the user id from the DB record', async () => {
        const result = await authService.login({
            email: 'salim@test.com',
            password: 'Password1',
        });

        expect(result.user.id).toBe(mockUser.id);
    });
});

// ─── refresh ──────────────────────────────────────────────────────────────────

describe('authService.refresh', () => {
    const validRefreshPayload = {
        sub: mockUser.id,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    };

    beforeEach(() => {
        jest.clearAllMocks();

        jwt.verify.mockReturnValue(validRefreshPayload);
        userModel.findById.mockResolvedValue(mockUserSafe);
        jwt.sign.mockReturnValue('new.access.token');
    });

    it('returns a new accessToken on a valid refresh token', async () => {
        const result = await authService.refresh('valid.refresh.token');

        expect(result).toHaveProperty('accessToken');
        expect(typeof result.accessToken).toBe('string');
    });

    it('does not return a new refreshToken (access token only)', async () => {
        const result = await authService.refresh('valid.refresh.token');

        expect(result).not.toHaveProperty('refreshToken');
    });

    it('throws 401 when the token signature is invalid', async () => {
        jwt.verify.mockImplementation(() => {
            const err = new Error('invalid signature');
            err.name = 'JsonWebTokenError';
            throw err;
        });

        await expect(authService.refresh('tampered.token')).rejects.toMatchObject({ status: 401 });
    });

    it('throws 401 when the token is expired', async () => {
        jwt.verify.mockImplementation(() => {
            const err = new Error('jwt expired');
            err.name = 'TokenExpiredError';
            throw err;
        });

        await expect(authService.refresh('expired.token')).rejects.toMatchObject({ status: 401 });
    });

    it('throws 401 when an access token is submitted instead of a refresh token', async () => {
        jwt.verify.mockReturnValue({ sub: mockUser.id, type: 'access' });

        await expect(authService.refresh('access.token.not.refresh')).rejects.toMatchObject({
            status: 401,
        });
    });

    it('throws 401 when the user no longer exists in the DB', async () => {
        userModel.findById.mockResolvedValue(null);

        await expect(authService.refresh('valid.refresh.token')).rejects.toMatchObject({
            status: 401,
        });
    });

    it('calls findById with the sub from the token payload', async () => {
        await authService.refresh('valid.refresh.token');

        expect(userModel.findById).toHaveBeenCalledWith(mockUser.id);
    });

    it('issues the new access token with type: access', async () => {
        await authService.refresh('valid.refresh.token');

        const signCall = jwt.sign.mock.calls[0];
        expect(signCall[0]).toMatchObject({ type: 'access' });
    });

    it('throws 401 when token has no type field', async () => {
        jwt.verify.mockReturnValue({ sub: mockUser.id }); // type missing

        await expect(authService.refresh('no.type.token')).rejects.toMatchObject({ status: 401 });
    });

    it('propagates unexpected errors from findById', async () => {
        userModel.findById.mockRejectedValue(new Error('DB timeout'));

        await expect(authService.refresh('valid.refresh.token')).rejects.toThrow('DB timeout');
    });
});
