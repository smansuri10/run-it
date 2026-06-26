const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';

// Constant-time dummy hash — used when email not found to prevent timing attacks
const DUMMY_HASH = '$2b$12$invalidhashfortimingpurposesXXXXXXXXXXXXXXXXXXXXXXXXX';

/**
 * Generate both tokens for a user.
 * Access token is short-lived, refresh token is long-lived.
 */
const generateTokens = (userId) => {
    const accessToken = jwt.sign(
        { sub: userId, type: 'access' },
        JWT_SECRET,
        { expiresIn: JWT_ACCESS_EXPIRES }
    );

    const refreshToken = jwt.sign(
        { sub: userId, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRES }
    );

    return { accessToken, refreshToken };
};

/**
 * Register a new user.
 * Checks email and username uniqueness, hashes password, creates user.
 */
const register = async ({ email, password, username, full_name }) => {
    // Check if email is already taken
    const existingEmail = await userModel.findByEmail(email);
    if (existingEmail) {
        const error = new Error('Email already in use');
        error.status = 409;
        throw error;
    }

    // Check if username is already taken
    const existingUsername = await userModel.findByUsername(username);
    if (existingUsername) {
        const error = new Error('Username already taken');
        error.status = 409;
        throw error;
    }

    // Hash the password — never store plain text
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create the user — trim full_name before storing
    const user = await userModel.create({
        email,
        password_hash,
        username,
        full_name: full_name?.trim() || null,
    });

    const tokens = generateTokens(user.id);

    return { user, ...tokens };
};

/**
 * Login an existing user.
 * Always runs bcrypt.compare to prevent timing attacks.
 */
const login = async ({ email, password }) => {
    const user = await userModel.findByEmail(email);

    // Always run bcrypt.compare regardless of whether user exists.
    // Skipping it when user is not found creates a timing oracle that
    // reveals which emails are registered.
    const hash = user ? user.password_hash : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hash);

    if (!user || !valid) {
        const error = new Error('Invalid email or password');
        error.status = 401;
        throw error;
    }

    const tokens = generateTokens(user.id);

    // Strip password_hash before returning
    const { password_hash, ...safeUser } = user;
    return { user: safeUser, ...tokens };
};

/**
 * Verify a refresh token and issue a new access token.
 */
const refresh = async (refreshToken) => {
    let payload;
    try {
        payload = jwt.verify(refreshToken, JWT_SECRET);
    } catch (err) {
        const error = new Error('Invalid or expired refresh token');
        error.status = 401;
        throw error;
    }

    if (payload.type !== 'refresh') {
        const error = new Error('Invalid token type');
        error.status = 401;
        throw error;
    }

    const user = await userModel.findById(payload.sub);
    if (!user) {
        const error = new Error('User not found');
        error.status = 401;
        throw error;
    }

    const accessToken = jwt.sign(
        { sub: user.id, type: 'access' },
        JWT_SECRET,
        { expiresIn: JWT_ACCESS_EXPIRES }
    );

    return { accessToken };
};

module.exports = { register, login, refresh };