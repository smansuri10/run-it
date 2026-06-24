const authService = require('../services/authService');

const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,    // JS cannot access this cookie — XSS protection
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'lax',  // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
};

/**
 * POST /auth/register
 */
const register = async (req, res, next) => {
    try {
        const { user, accessToken, refreshToken } = await authService.register(req.body);

        res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

        res.status(201).json({
            user,
            accessToken,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /auth/login
 */
const login = async (req, res, next) => {
    try {
        const { user, accessToken, refreshToken } = await authService.login(req.body);

        res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

        res.status(200).json({
            user,
            accessToken,
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /auth/refresh
 */
const refresh = async (req, res, next) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({ error: 'No refresh token provided' });
        }

        const { accessToken } = await authService.refresh(refreshToken);

        res.status(200).json({ accessToken });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /auth/logout
 */
const logout = async (req, res) => {
    res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
    res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = { register, login, refresh, logout };