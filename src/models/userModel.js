const db = require('../config/db');

/**
 * Find a user by email address.
 * Includes password_hash so the service can verify it during login.
 * The service strips it before returning to the controller.
 */
const findByEmail = async (email) => {
    return db('users')
        .where({ email })
        .whereNull('deleted_at')
        .select([
            'id',
            'email',
            'username',
            'full_name',
            'avatar_url',
            'role',
            'password_hash',
            'created_at',
            'updated_at'
        ])
        .first();
};

/**
 * Find a user by their UUID.
 * Used by auth middleware — never needs password_hash.
 */
const findById = async (id) => {
    return db('users')
        .where({ id })
        .whereNull('deleted_at')
        .select([
            'id',
            'email',
            'username',
            'full_name',
            'avatar_url',
            'role',
            'created_at',
            'updated_at'
        ])
        .first();
};

/**
 * Find a user by username.
 * Used during registration to check if username is already taken.
 */
const findByUsername = async (username) => {
    return db('users')
        .where({ username })
        .whereNull('deleted_at')
        .select(['id', 'username'])
        .first();
};

/**
 * Create a new user and return the created record.
 */
const create = async (userData) => {
    const [user] = await db('users')
        .insert(userData)
        .returning(['id', 'email', 'username', 'full_name', 'role', 'created_at']);
    return user;
};

module.exports = { findByEmail, findById, findByUsername, create };