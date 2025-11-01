const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration - only create pool if DATABASE_URL is valid
let pool = null;

if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres://')) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    console.log('✓ Database pool created');
  } catch (error) {
    console.error('✗ Database pool creation error:', error.message);
    pool = null;
  }
} else {
  console.log('⚠ DATABASE_URL not configured or invalid, running without database');
}

// Initialize database schema
async function initializeDatabase() {
  if (!pool) {
    console.log('⚠ Database not available, skipping initialization');
    return;
  }

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('✓ Database schema initialized');
  } catch (error) {
    console.error('✗ Database initialization error:', error.message);
    // Don't throw - allow app to run without database
  }
}

// Insert new game when room is created
async function createGame(roomCode, creatorIp) {
  if (!pool) {
    return null;
  }

  try {
    const result = await pool.query(
      'INSERT INTO games (room_code, creator_ip) VALUES ($1, $2) RETURNING id',
      [roomCode, creatorIp]
    );
    console.log(`✓ Game created in database: ${roomCode} (ID: ${result.rows[0].id})`);
    return result.rows[0].id;
  } catch (error) {
    console.error('✗ Error creating game:', error.message);
    return null;
  }
}

// Update game when players join or start
async function updateGamePlayers(roomCode, players, bots) {
  if (!pool) return;

  try {
    await pool.query(
      `UPDATE games SET
        player_north = $1, player_east = $2, player_south = $3, player_west = $4,
        is_bot_north = $5, is_bot_east = $6, is_bot_south = $7, is_bot_west = $8
       WHERE room_code = $9`,
      [
        players.N?.name || null,
        players.E?.name || null,
        players.S?.name || null,
        players.W?.name || null,
        bots.N || false,
        bots.E || false,
        bots.S || false,
        bots.W || false,
        roomCode
      ]
    );
  } catch (error) {
    console.error('✗ Error updating game players:', error.message);
  }
}

// End game and record winner
async function endGame(roomCode, winningTeam, scoreNS, scoreEW, totalHands) {
  if (!pool) return;

  try {
    await pool.query(
      `UPDATE games SET
        ended_at = CURRENT_TIMESTAMP,
        winning_team = $1,
        final_score_ns = $2,
        final_score_ew = $3,
        total_hands = $4
       WHERE room_code = $5`,
      [winningTeam, scoreNS, scoreEW, totalHands, roomCode]
    );
    console.log(`✓ Game ended: ${roomCode} | Winner: ${winningTeam} | Score: NS ${scoreNS} - EW ${scoreEW}`);
  } catch (error) {
    console.error('✗ Error ending game:', error.message);
  }
}

// Record individual hand result (optional, for detailed analytics)
async function recordHand(roomCode, handNumber, contractTeam, contractAmount, contractSuit, declarer, scoreNS, scoreEW, contractMade) {
  if (!pool) return;

  try {
    const gameResult = await pool.query('SELECT id FROM games WHERE room_code = $1', [roomCode]);
    if (gameResult.rows.length === 0) return;

    const gameId = gameResult.rows[0].id;
    await pool.query(
      `INSERT INTO hands (game_id, hand_number, contract_team, contract_amount, contract_suit, declarer, team_ns_score, team_ew_score, contract_made)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [gameId, handNumber, contractTeam, contractAmount, contractSuit, declarer, scoreNS, scoreEW, contractMade]
    );
  } catch (error) {
    console.error('✗ Error recording hand:', error.message);
  }
}

// Get game statistics (for future analytics endpoint)
async function getGameStats() {
  if (!pool) return null;

  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_games,
        COUNT(*) FILTER (WHERE ended_at IS NOT NULL) as completed_games,
        AVG(final_score_ns) as avg_score_ns,
        AVG(final_score_ew) as avg_score_ew,
        COUNT(*) FILTER (WHERE winning_team = 'NS') as ns_wins,
        COUNT(*) FILTER (WHERE winning_team = 'EW') as ew_wins
      FROM games
    `);
    return result.rows[0];
  } catch (error) {
    console.error('✗ Error fetching game stats:', error.message);
    return null;
  }
}

// Get player-specific statistics (wins by player name)
async function getPlayerStats() {
  if (!pool) return null;

  try {
    const result = await pool.query(`
      WITH player_games AS (
        SELECT player_north AS player_name, winning_team,
               CASE WHEN winning_team = 'NS' THEN 1 ELSE 0 END AS won
        FROM games
        WHERE player_north IS NOT NULL AND is_bot_north = false AND ended_at IS NOT NULL

        UNION ALL

        SELECT player_south AS player_name, winning_team,
               CASE WHEN winning_team = 'NS' THEN 1 ELSE 0 END AS won
        FROM games
        WHERE player_south IS NOT NULL AND is_bot_south = false AND ended_at IS NOT NULL

        UNION ALL

        SELECT player_east AS player_name, winning_team,
               CASE WHEN winning_team = 'EW' THEN 1 ELSE 0 END AS won
        FROM games
        WHERE player_east IS NOT NULL AND is_bot_east = false AND ended_at IS NOT NULL

        UNION ALL

        SELECT player_west AS player_name, winning_team,
               CASE WHEN winning_team = 'EW' THEN 1 ELSE 0 END AS won
        FROM games
        WHERE player_west IS NOT NULL AND is_bot_west = false AND ended_at IS NOT NULL
      )
      SELECT
        player_name,
        COUNT(*) AS total_games,
        SUM(won) AS wins
      FROM player_games
      GROUP BY player_name
      ORDER BY wins DESC, total_games DESC
    `);
    return result.rows;
  } catch (error) {
    console.error('✗ Error fetching player stats:', error.message);
    return null;
  }
}

// Get list of completed games
async function getGamesList(limit = 50) {
  if (!pool) return null;

  try {
    const result = await pool.query(`
      SELECT
        room_code,
        created_at,
        ended_at,
        winning_team,
        final_score_ns,
        final_score_ew,
        total_hands,
        player_north,
        player_east,
        player_south,
        player_west,
        is_bot_north,
        is_bot_east,
        is_bot_south,
        is_bot_west
      FROM games
      WHERE ended_at IS NOT NULL
      ORDER BY ended_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  } catch (error) {
    console.error('✗ Error fetching games list:', error.message);
    return null;
  }
}

// Save or update game state for recovery
async function upsertGameState(roomCode, gameState, roomMetadata, gameId = null) {
  if (!pool) return null;

  try {
    await pool.query(
      `INSERT INTO game_states (room_code, game_id, game_state, room_metadata, last_updated, expires_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '2 hours')
       ON CONFLICT (room_code)
       DO UPDATE SET
         game_state = $3,
         room_metadata = $4,
         last_updated = CURRENT_TIMESTAMP,
         expires_at = CURRENT_TIMESTAMP + INTERVAL '2 hours',
         version = game_states.version + 1`,
      [roomCode, gameId, JSON.stringify(gameState), JSON.stringify(roomMetadata)]
    );
    return true;
  } catch (error) {
    console.error('⚠ Cannot save game state (game continues):', error.message);
    return null;
  }
}

// Get game state for a specific room
async function getGameState(roomCode) {
  if (!pool) return null;

  try {
    const result = await pool.query(
      `SELECT game_state, room_metadata, version, last_updated
       FROM game_states
       WHERE room_code = $1 AND expires_at > CURRENT_TIMESTAMP`,
      [roomCode]
    );

    if (result.rows.length === 0) return null;

    return {
      roomCode,
      gameState: result.rows[0].game_state,
      roomMetadata: result.rows[0].room_metadata,
      version: result.rows[0].version,
      lastUpdated: result.rows[0].last_updated
    };
  } catch (error) {
    console.error('✗ Error fetching game state:', error.message);
    return null;
  }
}

// Get all active game states (not expired)
async function getActiveGameStates() {
  if (!pool) return [];

  try {
    const result = await pool.query(
      `SELECT room_code, game_state, room_metadata, version, last_updated
       FROM game_states
       WHERE expires_at > CURRENT_TIMESTAMP
       ORDER BY last_updated DESC`
    );

    return result.rows.map(row => ({
      roomCode: row.room_code,
      gameState: row.game_state,
      roomMetadata: row.room_metadata,
      version: row.version,
      lastUpdated: row.last_updated
    }));
  } catch (error) {
    console.error('✗ Error fetching active game states:', error.message);
    return [];
  }
}

// Clean up expired game states
async function cleanupExpiredStates() {
  if (!pool) return 0;

  try {
    const result = await pool.query(
      `DELETE FROM game_states
       WHERE expires_at < CURRENT_TIMESTAMP
       RETURNING room_code`
    );

    const count = result.rows.length;
    if (count > 0) {
      console.log(`🧹 Cleaned up ${count} expired game state(s)`);
    }
    return count;
  } catch (error) {
    console.error('✗ Error cleaning up expired states:', error.message);
    return 0;
  }
}

// Delete game state when game ends normally
async function deleteGameState(roomCode) {
  if (!pool) return;

  try {
    await pool.query('DELETE FROM game_states WHERE room_code = $1', [roomCode]);
  } catch (error) {
    console.error('✗ Error deleting game state:', error.message);
  }
}

module.exports = {
  pool,
  initializeDatabase,
  createGame,
  updateGamePlayers,
  endGame,
  recordHand,
  getGameStats,
  getPlayerStats,
  getGamesList,
  // Game state persistence functions
  upsertGameState,
  getGameState,
  getActiveGameStates,
  cleanupExpiredStates,
  deleteGameState
};
