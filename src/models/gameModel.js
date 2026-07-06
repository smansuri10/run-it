const db = require('../config/db');

/**
 * Create a new game and return the created record.
 */
const create = async (gameData) => {
    const [game] = await db('games')
        .insert(gameData)
        .returning('*');
    return game;
};

/**
 * Find a game by its UUID.
 */
const findById = async (id) => {
    return db('games')
        .where({ id })
        .whereNull('deleted_at')
        .first();
};

/**
 * List open games with optional location filtering.
 * Uses Haversine formula to calculate distance in kilometers.
 */
const findAll = async ({ lat, lng, radius, sport_id, skill_level } = {}) => {
    let query = db('games')
        .whereNull('games.deleted_at')
        .where('games.status', 'open')
        .where('games.starts_at', '>', db.fn.now())
        .select([
            'games.*',
            db.raw(`
        CASE
          WHEN games.field_id IS NOT NULL THEN fields.name
          ELSE games.location_name
        END as display_location
      `),
        ])
        .leftJoin('fields', 'games.field_id', 'fields.id')
        .orderBy('games.starts_at', 'asc');

    // Filter by sport if provided
    if (sport_id) {
        query = query.where('games.sport_id', sport_id);
    }

    // Filter by skill level if provided
    if (skill_level) {
        query = query.where('games.skill_level', skill_level);
    }

    // Location filter using Haversine formula
    if (lat !== undefined && lat !== null && lng !== undefined && lng !== null && radius) {
        query = query.whereRaw(`
            (
              6371 * acos(
                GREATEST(-1, LEAST(1,
                  cos(radians(?)) *
                  cos(radians(
                    COALESCE(fields.latitude, games.location_lat)
                  )) *
                  cos(radians(
                    COALESCE(fields.longitude, games.location_lng)
                  ) - radians(?)) +
                  sin(radians(?)) *
                  sin(radians(
                    COALESCE(fields.latitude, games.location_lat)
                  ))
                ))
              )
            ) <= ?
          `, [lat, lng, lat, radius]);
    }

    return query;
};

/**
 * Get the player count for a game.
 */
const getPlayerCount = async (gameId) => {
    const result = await db('game_players')
        .where({ game_id: gameId })
        .whereIn('role', ['host', 'player'])
        .count('id as count')
        .first();
    return parseInt(result.count);
};

/**
 * Get all players for a game.
 */
const getPlayers = async (gameId) => {
    return db('game_players')
        .where({ game_id: gameId })
        .join('users', 'game_players.user_id', 'users.id')
        .select([
            'users.id',
            'users.username',
            'users.full_name',
            'users.avatar_url',
            'game_players.role',
            'game_players.joined_at',
        ])
        .orderBy('game_players.joined_at', 'asc');
};

/**
 * Find a specific player in a game.
 */
const findPlayer = async (gameId, userId) => {
    return db('game_players')
        .where({ game_id: gameId, user_id: userId })
        .first();
};

/**
 * Add a player to a game.
 */
const addPlayer = async (gameId, userId, role = 'player') => {
    const [record] = await db('game_players')
        .insert({
            game_id: gameId,
            user_id: userId,
            role,
        })
        .returning('*');
    return record;
};

/**
 * Remove a player from a game.
 */
const removePlayer = async (gameId, userId) => {
    return db('game_players')
        .where({ game_id: gameId, user_id: userId })
        .delete();
};

/**
 * Update a player's role in a game.
 */
const updatePlayerRole = async (gameId, userId, role) => {
    return db('game_players')
        .where({ game_id: gameId, user_id: userId })
        .update({ role });
};

/**
 * Get the first waitlisted player for a game.
 */
const getFirstWaitlisted = async (gameId) => {
    return db('game_players')
        .where({ game_id: gameId, role: 'waitlist' })
        .orderBy('joined_at', 'asc')
        .first();
};

/**
 * Update a game's status.
 */
const updateStatus = async (gameId, status) => {
    return db('games')
        .where({ id: gameId })
        .update({ status });
};

/**
 * Soft delete a game.
 */
const softDelete = async (gameId) => {
    return db('games')
        .where({ id: gameId })
        .update({ deleted_at: db.fn.now() });
};

module.exports = {
    create,
    findById,
    findAll,
    getPlayerCount,
    getPlayers,
    findPlayer,
    addPlayer,
    removePlayer,
    updatePlayerRole,
    getFirstWaitlisted,
    updateStatus,
    softDelete,
};