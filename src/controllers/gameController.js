const gameService = require('../services/gameService');

/**
 * POST /games
 * Create a new game. Host is the authenticated user.
 */
const createGame = async (req, res, next) => {
    try {
        const game = await gameService.createGame(req.user.id, req.body);
        res.status(201).json({ game });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /games
 * List open games with optional filters.
 * Query params: lat, lng, radius, sport_id, skill_level
 */
const listGames = async (req, res, next) => {
    try {
        const { lat, lng, radius, sport_id, skill_level } = req.query;

        const filters = {
            lat: lat ? parseFloat(lat) : undefined,
            lng: lng ? parseFloat(lng) : undefined,
            radius: radius ? parseFloat(radius) : undefined,
            sport_id: sport_id ? parseInt(sport_id) : undefined,
            skill_level,
        };

        const games = await gameService.listGames(filters);
        res.status(200).json({ games });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /games/:id
 * Get a single game with players and spot count.
 */
const getGameById = async (req, res, next) => {
    try {
        const game = await gameService.getGameById(req.params.id);
        res.status(200).json({ game });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /games/:id/join
 * Join a game. Authenticated user joins the game.
 */
const joinGame = async (req, res, next) => {
    try {
        const result = await gameService.joinGame(req.params.id, req.user.id);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

/**
 * DELETE /games/:id/join
 * Leave a game. Authenticated user leaves the game.
 */
const leaveGame = async (req, res, next) => {
    try {
        const result = await gameService.leaveGame(req.params.id, req.user.id);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

module.exports = { createGame, listGames, getGameById, joinGame, leaveGame };