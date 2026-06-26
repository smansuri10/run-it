const { body, validationResult } = require('express-validator');

/**
 * Runs after validation chains.
 * If any errors exist, returns 400 with the error list.
 * If clean, passes to the next middleware/controller.
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

/**
 * Validation rules for POST /auth/register
 */
const validateRegister = [
    body('email')
        .isEmail()
        .withMessage('Valid email is required')
        .normalizeEmail(),

    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/)
        .withMessage('Password must contain at least one uppercase letter')
        .matches(/[0-9]/)
        .withMessage('Password must contain at least one number'),

    body('username')
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),

    body('full_name')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Full name must be under 100 characters')
        .trim(),

    handleValidationErrors,
];

/**
 * Validation rules for POST /auth/login
 */
const validateLogin = [
    body('email')
        .isEmail()
        .withMessage('Valid email is required')
        .normalizeEmail(),

    body('password')
        .isLength({ min: 1 })
        .withMessage('Password is required'),

    handleValidationErrors,
];

module.exports = { validateRegister, validateLogin };