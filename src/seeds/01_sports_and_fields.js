exports.seed = async function (knex) {
    // Clear existing data in correct order
    await knex('game_players').del();
    await knex('games').del();
    await knex('fields').del();
    await knex('sports').del();

    // Insert soccer
    const [sport] = await knex('sports')
        .insert({ name: 'Soccer', icon: 'soccer-ball' })
        .returning('id');

    const sportId = sport.id;

    // Real Portland soccer fields
    await knex('fields').insert([
        {
            sport_id: sportId,
            name: 'Pier Park Soccer Fields',
            address: 'N Bruce Ave, Portland, OR 97203',
            latitude: 45.5963,
            longitude: -122.7329,
            notes: 'Multiple grass fields, free to use',
        },
        {
            sport_id: sportId,
            name: 'Adidas Soccer Complex',
            address: '1719 NW Overton St, Portland, OR 97209',
            latitude: 45.5308,
            longitude: -122.6890,
            notes: 'Premium turf fields, requires reservation',
        },
        {
            sport_id: sportId,
            name: 'Fernhill Park',
            address: 'NE 37th Ave & Ainsworth St, Portland, OR 97211',
            latitude: 45.5600,
            longitude: -122.6365,
            notes: 'Grass field, open play welcome',
        },
        {
            sport_id: sportId,
            name: 'Gabriel Park',
            address: 'SW 45th Ave & Vermont St, Portland, OR 97219',
            latitude: 45.4841,
            longitude: -122.7134,
            notes: 'Large grass field in SW Portland',
        },
        {
            sport_id: sportId,
            name: 'Lents Park',
            address: 'SE 92nd Ave & Steele St, Portland, OR 97266',
            latitude: 45.4815,
            longitude: -122.5685,
            notes: 'Turf field in SE Portland',
        },
        {
            sport_id: sportId,
            name: 'Delta Park Athletic Fields',
            address: 'N Broadacre St, Portland, OR 97217',
            latitude: 45.6089,
            longitude: -122.6919,
            notes: 'Multiple fields, high volume pickup games',
        },
        {
            sport_id: sportId,
            name: 'Glenhaven Park',
            address: 'NE 82nd Ave & Tillamook St, Portland, OR 97220',
            latitude: 45.5389,
            longitude: -122.5712,
            notes: 'Grass field in NE Portland',
        },
        {
            sport_id: sportId,
            name: 'Woodstock Park',
            address: 'SE 47th Ave & Steele St, Portland, OR 97206',
            latitude: 45.4848,
            longitude: -122.6270,
            notes: 'Grass field, popular weekend pickup spot',
        },
    ]);
};