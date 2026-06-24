const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRegister, validateLogin } = require('../middleware/validate');
const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for auth endpoints.
 * Max 10 attempts per 15 minutes per IP.
 * Prevents brute force attacks on login and register.
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Too many attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/register', authLimiter, validateRegister, authController.register);
router.post('/login', authLimiter, validateLogin, authController.login);
router.post('/refresh', authLimiter, authController.refresh);
router.post('/logout', authController.logout);

module.exports = router;