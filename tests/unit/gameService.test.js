const gameModel = require('../../src/models/gameModel');
const gameService = require('../../src/services/gameService');

jest.mock('../../src/models/gameModel');

const HOST_ID = 'host-uuid-1';
const USER_ID = 'user-uuid-2';
const GAME_ID = 'game-uuid-1';

const futureDate = () => new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────
// createGame
// ─────────────────────────────────────────────────────────────────────────
describe('gameService.createGame', () => {
  it('creates a game with a field_id and adds the host as the first player', async () => {
    const createdGame = { id: GAME_ID, host_id: HOST_ID, field_id: 5, status: 'open' };
    gameModel.create.mockResolvedValue(createdGame);
    gameModel.addPlayer.mockResolvedValue({ game_id: GAME_ID, user_id: HOST_ID, role: 'host' });

    const result = await gameService.createGame(HOST_ID, {
      field_id: 5,
      sport_id: 1,
      starts_at: futureDate(),
      max_players: 10,
    });

    expect(gameModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ field_id: 5, host_id: HOST_ID, status: 'open' })
    );
    expect(gameModel.addPlayer).toHaveBeenCalledWith(GAME_ID, HOST_ID, 'host');
    expect(result).toEqual(createdGame);
  });

  it('creates a game with location_lat/location_lng when no field_id is given', async () => {
    gameModel.create.mockResolvedValue({ id: GAME_ID });
    gameModel.addPlayer.mockResolvedValue({});

    await gameService.createGame(HOST_ID, {
      location_lat: 45.5,
      location_lng: -122.6,
      sport_id: 1,
      starts_at: futureDate(),
      max_players: 10,
    });

    expect(gameModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ location_lat: 45.5, location_lng: -122.6 })
    );
  });

  it('throws 400 when neither field_id nor a full lat/lng pair is provided', async () => {
    await expect(
      gameService.createGame(HOST_ID, { sport_id: 1, starts_at: futureDate(), max_players: 10 })
    ).rejects.toMatchObject({ status: 400 });
    expect(gameModel.create).not.toHaveBeenCalled();
  });

  it('throws 400 when only location_lat is provided without location_lng', async () => {
    await expect(
      gameService.createGame(HOST_ID, {
        location_lat: 45.5,
        sport_id: 1,
        starts_at: futureDate(),
        max_players: 10,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when only location_lng is provided without location_lat', async () => {
    await expect(
      gameService.createGame(HOST_ID, {
        location_lng: -122.6,
        sport_id: 1,
        starts_at: futureDate(),
        max_players: 10,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it(
    'SENTINEL — location_lat: 0 is a legitimate coordinate and should be accepted ' +
      '(documents Finding 1: falsy-zero bug in the field_id/lat/lng check). ' +
      'This test is expected to FAIL until gameService.createGame stops using ' +
      '`&&` truthiness checks on location_lat/location_lng. Do not delete.',
    async () => {
      gameModel.create.mockResolvedValue({ id: GAME_ID });
      gameModel.addPlayer.mockResolvedValue({});

      await expect(
        gameService.createGame(HOST_ID, {
          location_lat: 0,
          location_lng: 0,
          sport_id: 1,
          starts_at: futureDate(),
          max_players: 10,
        })
      ).resolves.toBeDefined();
    }
  );

  it('propagates errors thrown by the model layer', async () => {
    gameModel.create.mockRejectedValue(new Error('DB connection lost'));

    await expect(
      gameService.createGame(HOST_ID, {
        field_id: 5,
        sport_id: 1,
        starts_at: futureDate(),
        max_players: 10,
      })
    ).rejects.toThrow('DB connection lost');
  });

  it('does not add the host as a player if game creation fails', async () => {
    gameModel.create.mockRejectedValue(new Error('DB error'));

    await expect(
      gameService.createGame(HOST_ID, {
        field_id: 5,
        sport_id: 1,
        starts_at: futureDate(),
        max_players: 10,
      })
    ).rejects.toThrow();

    expect(gameModel.addPlayer).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// getGameById
// ─────────────────────────────────────────────────────────────────────────
describe('gameService.getGameById', () => {
  it('returns the game with players and computed spots_remaining', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, max_players: 10 });
    gameModel.getPlayers.mockResolvedValue([{ id: HOST_ID, role: 'host' }]);
    gameModel.getPlayerCount.mockResolvedValue(1);

    const result = await gameService.getGameById(GAME_ID);

    expect(result.player_count).toBe(1);
    expect(result.spots_remaining).toBe(9);
    expect(result.players).toHaveLength(1);
  });

  it('throws 404 when the game does not exist', async () => {
    gameModel.findById.mockResolvedValue(undefined);

    await expect(gameService.getGameById('nonexistent')).rejects.toMatchObject({ status: 404 });
    expect(gameModel.getPlayers).not.toHaveBeenCalled();
    expect(gameModel.getPlayerCount).not.toHaveBeenCalled();
  });

  it(
    'FINDING — spots_remaining can go negative if player_count exceeds max_players ' +
      '(possible under the join race condition described in Finding 2). ' +
      'This documents current behavior, not a requirement.',
    async () => {
      gameModel.findById.mockResolvedValue({ id: GAME_ID, max_players: 2 });
      gameModel.getPlayers.mockResolvedValue([{}, {}, {}]);
      gameModel.getPlayerCount.mockResolvedValue(3);

      const result = await gameService.getGameById(GAME_ID);
      expect(result.spots_remaining).toBe(-1);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────
// listGames
// ─────────────────────────────────────────────────────────────────────────
describe('gameService.listGames', () => {
  it('returns whatever the model returns, unmodified', async () => {
    const games = [{ id: 'g1' }, { id: 'g2' }];
    gameModel.findAll.mockResolvedValue(games);

    const result = await gameService.listGames({ sport_id: 1 });

    expect(result).toEqual(games);
    expect(gameModel.findAll).toHaveBeenCalledWith({ sport_id: 1 });
  });

  it('works with no filters passed at all', async () => {
    gameModel.findAll.mockResolvedValue([]);

    const result = await gameService.listGames();

    expect(result).toEqual([]);
    expect(gameModel.findAll).toHaveBeenCalledWith({});
  });

  it('returns an empty array when nothing matches', async () => {
    gameModel.findAll.mockResolvedValue([]);
    const result = await gameService.listGames({ sport_id: 999 });
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// joinGame
// ─────────────────────────────────────────────────────────────────────────
describe('gameService.joinGame', () => {
  it('adds the user as a player when spots are available', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'open', max_players: 10 });
    gameModel.findPlayer.mockResolvedValue(undefined);
    gameModel.getPlayerCount.mockResolvedValue(3);
    gameModel.addPlayer.mockResolvedValue({ role: 'player' });

    const result = await gameService.joinGame(GAME_ID, USER_ID);

    expect(gameModel.addPlayer).toHaveBeenCalledWith(GAME_ID, USER_ID, 'player');
    expect(result.role).toBe('player');
    expect(gameModel.updateStatus).not.toHaveBeenCalled();
  });

  it('waitlists the user when the game is already full', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'open', max_players: 2 });
    gameModel.findPlayer.mockResolvedValue(undefined);
    gameModel.getPlayerCount.mockResolvedValue(2);
    gameModel.addPlayer.mockResolvedValue({ role: 'waitlist' });

    const result = await gameService.joinGame(GAME_ID, USER_ID);

    expect(gameModel.addPlayer).toHaveBeenCalledWith(GAME_ID, USER_ID, 'waitlist');
    expect(result.role).toBe('waitlist');
    expect(gameModel.updateStatus).not.toHaveBeenCalled();
  });

  it('flips status to full when this join fills the last open spot', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'open', max_players: 2 });
    gameModel.findPlayer.mockResolvedValue(undefined);
    gameModel.getPlayerCount.mockResolvedValue(1);
    gameModel.addPlayer.mockResolvedValue({ role: 'player' });

    await gameService.joinGame(GAME_ID, USER_ID);

    expect(gameModel.updateStatus).toHaveBeenCalledWith(GAME_ID, 'full');
  });

  it('does not flip status to full when spots remain after joining', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'open', max_players: 10 });
    gameModel.findPlayer.mockResolvedValue(undefined);
    gameModel.getPlayerCount.mockResolvedValue(3);
    gameModel.addPlayer.mockResolvedValue({ role: 'player' });

    await gameService.joinGame(GAME_ID, USER_ID);

    expect(gameModel.updateStatus).not.toHaveBeenCalled();
  });

  it('throws 404 when the game does not exist', async () => {
    gameModel.findById.mockResolvedValue(undefined);

    await expect(gameService.joinGame(GAME_ID, USER_ID)).rejects.toMatchObject({ status: 404 });
  });

  it('throws 400 when the game is cancelled', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'cancelled', max_players: 10 });

    await expect(gameService.joinGame(GAME_ID, USER_ID)).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when the game is completed', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'completed', max_players: 10 });

    await expect(gameService.joinGame(GAME_ID, USER_ID)).rejects.toMatchObject({ status: 400 });
  });

  it('throws 409 when the user already has any role in the game', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'open', max_players: 10 });
    gameModel.findPlayer.mockResolvedValue({ role: 'waitlist' });

    await expect(gameService.joinGame(GAME_ID, USER_ID)).rejects.toMatchObject({ status: 409 });
    expect(gameModel.addPlayer).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// leaveGame
// ─────────────────────────────────────────────────────────────────────────
describe('gameService.leaveGame', () => {
  it('removes the player and returns a success message', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'open' });
    gameModel.findPlayer.mockResolvedValue({ role: 'player' });

    const result = await gameService.leaveGame(GAME_ID, USER_ID);

    expect(gameModel.removePlayer).toHaveBeenCalledWith(GAME_ID, USER_ID);
    expect(result.message).toMatch(/left the game/i);
  });

  it('throws 404 when the game does not exist', async () => {
    gameModel.findById.mockResolvedValue(undefined);

    await expect(gameService.leaveGame(GAME_ID, USER_ID)).rejects.toMatchObject({ status: 404 });
  });

  it('throws 400 when the user is not in the game', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'open' });
    gameModel.findPlayer.mockResolvedValue(undefined);

    await expect(gameService.leaveGame(GAME_ID, USER_ID)).rejects.toMatchObject({ status: 400 });
    expect(gameModel.removePlayer).not.toHaveBeenCalled();
  });

  it('throws 400 when the host tries to leave', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'open' });
    gameModel.findPlayer.mockResolvedValue({ role: 'host' });

    await expect(gameService.leaveGame(GAME_ID, HOST_ID)).rejects.toMatchObject({ status: 400 });
    expect(gameModel.removePlayer).not.toHaveBeenCalled();
  });

  it('promotes the first waitlisted player when a full game loses a player', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'full' });
    gameModel.findPlayer.mockResolvedValue({ role: 'player' });
    gameModel.getFirstWaitlisted.mockResolvedValue({ user_id: 'waitlisted-user' });

    await gameService.leaveGame(GAME_ID, USER_ID);

    expect(gameModel.updatePlayerRole).toHaveBeenCalledWith(GAME_ID, 'waitlisted-user', 'player');
    expect(gameModel.updateStatus).not.toHaveBeenCalled();
  });

  it('flips status back to open when a full game loses a player and no one is waitlisted', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'full' });
    gameModel.findPlayer.mockResolvedValue({ role: 'player' });
    gameModel.getFirstWaitlisted.mockResolvedValue(undefined);

    await gameService.leaveGame(GAME_ID, USER_ID);

    expect(gameModel.updateStatus).toHaveBeenCalledWith(GAME_ID, 'open');
    expect(gameModel.updatePlayerRole).not.toHaveBeenCalled();
  });

  it('does not touch the waitlist when a non-full game loses a player', async () => {
    gameModel.findById.mockResolvedValue({ id: GAME_ID, status: 'open' });
    gameModel.findPlayer.mockResolvedValue({ role: 'player' });

    await gameService.leaveGame(GAME_ID, USER_ID);

    expect(gameModel.getFirstWaitlisted).not.toHaveBeenCalled();
    expect(gameModel.updateStatus).not.toHaveBeenCalled();
  });
});
