const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';

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
 * Hashes password, creates user, returns tokens.
 */
const register = async ({ email, password, username, full_name }) => {
    // Check if email is already taken
    const existing = await userModel.findByEmail(email);
    if (existing) {
        const error = new Error('Email already in use');
        error.status = 409;
        throw error;
    }

    // Hash the password — never store plain text
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create the user
    const user = await userModel.create({
        email,
        password_hash,
        username,
        full_name,
    });

    const tokens = generateTokens(user.id);

    return { user, ...tokens };
};

/**
 * Login an existing user.
 * Verifies password, returns tokens.
 */
const login = async ({ email, password }) => {
    // Find the user
    const user = await userModel.findByEmail(email);
    if (!user) {
        const error = new Error('Invalid email or password');
        error.status = 401;
        throw error;
    }

    // Compare submitted password against stored hash
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        const error = new Error('Invalid email or password');
        error.status = 401;
        throw error;
    }

    const tokens = generateTokens(user.id);

    // Return user without password_hash
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