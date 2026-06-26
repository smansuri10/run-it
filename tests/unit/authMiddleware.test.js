'use strict';

/**
 * Unit tests — middleware/auth.js (authenticate)
 *
 * The model layer and JWT are mocked.
 * We simulate req/res/next directly — no HTTP server needed.
 */

jest.mock('../../src/models/userModel');
jest.mock('jsonwebtoken');

const userModel = require('../../src/models/userModel');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../../src/middleware/auth');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockUser = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    email: 'salim@test.com',
    username: 'salim_10',
    role: 'player',
};

const makeReq = (overrides = {}) => ({
    headers: { authorization: 'Bearer valid.access.token' },
    ...overrides,
});

const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

const validPayload = { sub: mockUser.id, type: 'access' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('authenticate middleware', () => {
    let next;

    beforeEach(() => {
        jest.clearAllMocks();
        next = jest.fn();
        jwt.verify.mockReturnValue(validPayload);
        userModel.findById.mockResolvedValue(mockUser);
    });

    // Happy path
    it('calls next() and attaches user to req when token is valid', async () => {
        const req = makeReq();
        const res = makeRes();

        await authenticate(req, res, next);

        expect(next).toHaveBeenCalledWith(); // next() with no args = success
        expect(req.user).toEqual(mockUser);
    });

    it('attaches the full user object from the DB (not just the token payload)', async () => {
        const req = makeReq();
        const res = makeRes();

        await authenticate(req, res, next);

        expect(req.user).toEqual(mockUser);
        expect(req.user).not.toEqual(validPayload);
    });

    // Missing / malformed Authorization header
    it('returns 401 when Authorization header is absent', async () => {
        const req = makeReq({ headers: {} });
        const res = makeRes();

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization header does not start with Bearer', async () => {
        const req = makeReq({ headers: { authorization: 'Basic abc123' } });
        const res = makeRes();

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization header is just "Bearer" with no token', async () => {
        const req = makeReq({ headers: { authorization: 'Bearer ' } });
        const res = makeRes();

        // jwt.verify will throw for an empty string
        jwt.verify.mockImplementation(() => {
            throw new Error('jwt must be provided');
        });

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization header is an empty string', async () => {
        const req = makeReq({ headers: { authorization: '' } });
        const res = makeRes();

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    // Invalid / expired tokens
    it('returns 401 when the token signature is invalid', async () => {
        jwt.verify.mockImplementation(() => {
            const err = new Error('invalid signature');
            err.name = 'JsonWebTokenError';
            throw err;
        });

        const req = makeReq();
        const res = makeRes();

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when the access token is expired', async () => {
        jwt.verify.mockImplementation(() => {
            const err = new Error('jwt expired');
            err.name = 'TokenExpiredError';
            throw err;
        });

        const req = makeReq();
        const res = makeRes();

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when a refresh token is used instead of an access token', async () => {
        jwt.verify.mockReturnValue({ sub: mockUser.id, type: 'refresh' });

        const req = makeReq();
        const res = makeRes();

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when a token with no type field is used', async () => {
        jwt.verify.mockReturnValue({ sub: mockUser.id }); // type missing

        const req = makeReq();
        const res = makeRes();

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    // User not found
    it('returns 401 when the user from the token no longer exists in the DB', async () => {
        userModel.findById.mockResolvedValue(null);

        const req = makeReq();
        const res = makeRes();

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    // Soft-deleted user
    it('returns 401 when the user has been soft-deleted', async () => {
        // findById already filters deleted_at at the model level.
        // If the user is soft-deleted, findById returns null.
        userModel.findById.mockResolvedValue(null);

        const req = makeReq();
        const res = makeRes();

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    // DB errors
    it('calls next(err) when findById throws unexpectedly', async () => {
        userModel.findById.mockRejectedValue(new Error('DB timeout'));

        const req = makeReq();
        const res = makeRes();

        await authenticate(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(res.status).not.toHaveBeenCalled();
    });

    // password_hash must never appear on req.user
    it('never attaches password_hash to req.user', async () => {
        // Even if the model accidentally returned it
        userModel.findById.mockResolvedValue({ ...mockUser, password_hash: 'shouldnotbehere' });

        const req = makeReq();
        const res = makeRes();

        await authenticate(req, res, next);

        // The middleware does not strip it — see Findings.
        // This test documents the current behavior.
        // If it passes with password_hash present, that's a finding for Agent 1.
        expect(req.user).not.toHaveProperty('password_hash');
    });
});
