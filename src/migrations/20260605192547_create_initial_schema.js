exports.up = async function (knex) {

    // 1. Sports — lookup table
    await knex.schema.createTable('sports', (t) => {
        t.increments('id').primary();
        t.string('name', 50).notNullable().unique();
        t.string('icon', 100);
        t.timestamps(true, true);
    });

    // 2. Users
    await knex.schema.createTable('users', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('email', 255).notNullable().unique();
        t.string('password_hash', 255).notNullable();
        t.string('username', 50).notNullable().unique();
        t.string('full_name', 100);
        t.string('avatar_url', 500);
        t.enu('role', ['player', 'admin']).notNullable().defaultTo('player');
        t.timestamp('deleted_at');
        t.timestamps(true, true);
    });

    // 3. Fields — physical locations
    await knex.schema.createTable('fields', (t) => {
        t.increments('id').primary();
        t.integer('sport_id')
            .notNullable()
            .references('id')
            .inTable('sports')
            .onDelete('RESTRICT');
        t.string('name', 100).notNullable();
        t.string('address', 255);
        t.decimal('latitude', 10, 8).notNullable();
        t.decimal('longitude', 11, 8).notNullable();
        t.text('notes');
        t.timestamp('deleted_at');
        t.timestamps(true, true);
    });

    // 4. Games — core entity
    await knex.schema.createTable('games', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('host_id')
            .notNullable()
            .references('id')
            .inTable('users')
            .onDelete('CASCADE');
        t.integer('sport_id')
            .notNullable()
            .references('id')
            .inTable('sports')
            .onDelete('RESTRICT');
        t.integer('field_id')
            .references('id')
            .inTable('fields')
            .onDelete('SET NULL');
        t.string('location_name', 255);
        t.decimal('location_lat', 10, 8);
        t.decimal('location_lng', 11, 8);
        t.timestamp('starts_at').notNullable();
        t.integer('max_players').notNullable().defaultTo(10);
        t.enu('skill_level', ['any', 'beginner', 'intermediate', 'advanced']).defaultTo('any');
        t.text('description');
        t.enu('status', ['open', 'full', 'cancelled', 'completed'])
            .notNullable()
            .defaultTo('open');
        t.boolean('is_recurring').notNullable().defaultTo(false);
        t.timestamp('deleted_at');
        t.timestamps(true, true);
    });

    // 5. Game players — join table with waitlist support
    await knex.schema.createTable('game_players', (t) => {
        t.increments('id').primary();
        t.uuid('game_id')
            .notNullable()
            .references('id')
            .inTable('games')
            .onDelete('CASCADE');
        t.uuid('user_id')
            .notNullable()
            .references('id')
            .inTable('users')
            .onDelete('CASCADE');
        t.enu('role', ['host', 'player', 'waitlist']).notNullable().defaultTo('player');
        t.timestamp('joined_at').notNullable().defaultTo(knex.fn.now());
        t.unique(['game_id', 'user_id']);
        t.timestamps(true, true);
    });

    // 6. Messages — in-game chat
    await knex.schema.createTable('messages', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('game_id')
            .notNullable()
            .references('id')
            .inTable('games')
            .onDelete('CASCADE');
        t.uuid('user_id')
            .notNullable()
            .references('id')
            .inTable('users')
            .onDelete('CASCADE');
        t.text('body').notNullable();
        t.timestamp('deleted_at');
        t.timestamps(true, true);
    });

    // Indexes — speeds up the queries you'll run constantly
    await knex.schema.raw('CREATE INDEX idx_game_players_game_id ON game_players(game_id)');
    await knex.schema.raw('CREATE INDEX idx_messages_game_id ON messages(game_id)');
    await knex.schema.raw('CREATE INDEX idx_games_sport_id ON games(sport_id)');
    await knex.schema.raw('CREATE INDEX idx_games_starts_at ON games(starts_at)');
};

exports.down = async function (knex) {
    // Drop indexes first
    await knex.schema.raw('DROP INDEX IF EXISTS idx_game_players_game_id');
    await knex.schema.raw('DROP INDEX IF EXISTS idx_messages_game_id');
    await knex.schema.raw('DROP INDEX IF EXISTS idx_games_sport_id');
    await knex.schema.raw('DROP INDEX IF EXISTS idx_games_starts_at');

    // Drop tables in reverse order — dependencies first
    await knex.schema.dropTableIfExists('messages');
    await knex.schema.dropTableIfExists('game_players');
    await knex.schema.dropTableIfExists('games');
    await knex.schema.dropTableIfExists('fields');
    await knex.schema.dropTableIfExists('users');
    await knex.schema.dropTableIfExists('sports');
};