const gameModel = require('../models/gameModel');

/**
 * Create a new game.
 * The host is automatically added as the first player.
 */
const createGame = async (hostId, gameData) => {
    // Validate location — must have either field_id or lat/lng
    if (!gameData.field_id && !(gameData.location_lat !== undefined && gameData.location_lat !== null && gameData.location_lng !== undefined && gameData.location_lng !== null)) {
        const error = new Error('A game must have either a field or a location');
        error.status = 400;
        throw error;
    }

    // Create the game
    const game = await gameModel.create({
        ...gameData,
        host_id: hostId,
        status: 'open',
    });

    // Add the host as the first player
    await gameModel.addPlayer(game.id, hostId, 'host');

    return game;
};

/**
 * Get a single game by ID with player list and count.
 */
const getGameById = async (id) => {
    const game = await gameModel.findById(id);
    if (!game) {
        const error = new Error('Game not found');
        error.status = 404;
        throw error;
    }

    const [players, playerCount] = await Promise.all([
        gameModel.getPlayers(id),
        gameModel.getPlayerCount(id),
    ]);

    return {
        ...game,
        players,
        player_count: playerCount,
        spots_remaining: game.max_players - playerCount,
    };
};

/**
 * List open games with optional filters.
 */
const listGames = async (filters = {}) => {
    const games = await gameModel.findAll(filters);
    return games;
};

/**
 * Join a game.
 * If the game is full, the player is added to the waitlist.
 * If the game is already cancelled or completed, joining is not allowed.
 */
const joinGame = async (gameId, userId) => {
    const game = await gameModel.findById(gameId);
    if (!game) {
        const error = new Error('Game not found');
        error.status = 404;
        throw error;
    }

    // Can't join a cancelled or completed game
    if (game.status === 'cancelled' || game.status === 'completed') {
        const error = new Error('This game is no longer accepting players');
        error.status = 400;
        throw error;
    }

    // Check if user is already in the game
    const existing = await gameModel.findPlayer(gameId, userId);
    if (existing) {
        const error = new Error('You are already in this game');
        error.status = 409;
        throw error;
    }

    // Check current player count
    const playerCount = await gameModel.getPlayerCount(gameId);
    const isFull = playerCount >= game.max_players;

    if (isFull) {
        // Add to waitlist
        const record = await gameModel.addPlayer(gameId, userId, 'waitlist');
        return { role: 'waitlist', record };
    }

    // Add as player
    const record = await gameModel.addPlayer(gameId, userId, 'player');

    // If this fills the game, update status to full
    if (playerCount + 1 >= game.max_players) {
        await gameModel.updateStatus(gameId, 'full');
    }

    return { role: 'player', record };
};

/**
 * Leave a game.
 * If the game was full and someone leaves, promote the first waitlisted player.
 * The host cannot leave — they must cancel the game instead.
 */
const leaveGame = async (gameId, userId) => {
    const game = await gameModel.findById(gameId);
    if (!game) {
        const error = new Error('Game not found');
        error.status = 404;
        throw error;
    }

    const player = await gameModel.findPlayer(gameId, userId);
    if (!player) {
        const error = new Error('You are not in this game');
        error.status = 400;
        throw error;
    }

    // Host cannot leave — they must cancel
    if (player.role === 'host') {
        const error = new Error('The host cannot leave — cancel the game instead');
        error.status = 400;
        throw error;
    }

    const wasFullBeforeLeaving = game.status === 'full';

    // Remove the player
    await gameModel.removePlayer(gameId, userId);

    // If the game was full, promote the first waitlisted player
    if (wasFullBeforeLeaving) {
        const nextPlayer = await gameModel.getFirstWaitlisted(gameId);
        if (nextPlayer) {
            await gameModel.updatePlayerRole(gameId, nextPlayer.user_id, 'player');
        } else {
            // No waitlist — flip status back to open
            await gameModel.updateStatus(gameId, 'open');
        }
    }

    return { message: 'Successfully left the game' };
};

module.exports = { createGame, getGameById, listGames, joinGame, leaveGame };