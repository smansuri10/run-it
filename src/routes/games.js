const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { authenticate } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

/**
 * Validation error handler — reused across routes.
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

/**
 * Validation rules for POST /games
 */
const validateCreateGame = [
    body('sport_id')
        .isInt({ min: 1 })
        .withMessage('sport_id must be a positive integer'),

    body('starts_at')
        .isISO8601()
        .withMessage('starts_at must be a valid ISO 8601 date')
        .custom((value) => {
            if (new Date(value) <= new Date()) {
                throw new Error('starts_at must be in the future');
            }
            return true;
        }),

    body('max_players')
        .isInt({ min: 2, max: 50 })
        .withMessage('max_players must be between 2 and 50'),

    body('skill_level')
        .optional()
        .isIn(['any', 'beginner', 'intermediate', 'advanced'])
        .withMessage('skill_level must be any, beginner, intermediate, or advanced'),

    body('description')
        .optional()
        .isLength({ max: 500 })
        .withMessage('description must be under 500 characters')
        .trim(),

    body('location_name')
        .optional()
        .isLength({ max: 255 })
        .withMessage('location_name must be under 255 characters')
        .trim(),

    body('location_lat')
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage('location_lat must be a valid latitude'),

    body('location_lng')
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage('location_lng must be a valid longitude'),

    body('is_recurring')
        .optional()
        .isBoolean()
        .withMessage('is_recurring must be a boolean'),

    handleValidationErrors,
];

// ─── Routes ───────────────────────────────────────────────────────────────────

// Public routes — no auth required
router.get('/', gameController.listGames);
router.get('/:id', gameController.getGameById);

// Protected routes — auth required
router.post('/', authenticate, validateCreateGame, gameController.createGame);
router.post('/:id/join', authenticate, gameController.joinGame);
router.delete('/:id/join', authenticate, gameController.leaveGame);

module.exports = router;