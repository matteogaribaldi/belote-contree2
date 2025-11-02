const Database = require('better-sqlite3');
const path = require('path');

// Create database in backend directory
const dbPath = path.join(__dirname, '..', 'games.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Database schema version management
function migrateSchema() {
  const version = db.pragma('user_version', { simple: true });

  if (version < 1) {
    console.log('📦 Migrating database to version 1 (active_games table)...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS active_games (
        room_code TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        last_updated INTEGER NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('waiting', 'playing')),
        game_snapshot TEXT NOT NULL,
        last_activity INTEGER NOT NULL,
        version INTEGER DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_last_activity
      ON active_games(last_activity DESC);
    `);
    db.pragma('user_version = 1');
    console.log('✅ Migration to version 1 complete');
  }

  // Future migrations: if (version < 2) { ... }
}

migrateSchema();

// Create table for game history
db.exec(`
  CREATE TABLE IF NOT EXISTS game_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    date_string TEXT NOT NULL,
    players TEXT NOT NULL,
    player_ips TEXT NOT NULL,
    winner_team TEXT,
    final_score TEXT,
    hands_played INTEGER,
    target_score INTEGER
  )
`);

// Create index for faster queries
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_timestamp ON game_history(timestamp DESC)
`);

/**
 * Save a completed game to the database
 */
function saveGame(roomCode, players, playerIps, winnerTeam, finalScore, handsPlayed, targetScore) {
  const stmt = db.prepare(`
    INSERT INTO game_history (
      room_code,
      timestamp,
      date_string,
      players,
      player_ips,
      winner_team,
      final_score,
      hands_played,
      target_score
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  const dateString = new Date(now).toISOString();

  stmt.run(
    roomCode,
    now,
    dateString,
    JSON.stringify(players),
    JSON.stringify(playerIps),
    winnerTeam,
    JSON.stringify(finalScore),
    handsPlayed,
    targetScore
  );
}

/**
 * Get recent game history (last N games)
 */
function getRecentGames(limit = 50) {
  const stmt = db.prepare(`
    SELECT * FROM game_history
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit);

  // Parse JSON fields
  return rows.map(row => ({
    ...row,
    players: JSON.parse(row.players),
    playerIps: JSON.parse(row.player_ips),
    finalScore: JSON.parse(row.final_score)
  }));
}

/**
 * Get total number of games played
 */
function getTotalGames() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM game_history');
  return stmt.get().count;
}

/**
 * Save active game state (for crash recovery)
 */
function saveActiveGame(roomCode, state, gameSnapshot) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO active_games
    (room_code, created_at, last_updated, state, game_snapshot, last_activity, version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  const createdAt = getActiveGame(roomCode)?.created_at || now;

  stmt.run(
    roomCode,
    createdAt,
    now,
    state,
    JSON.stringify(gameSnapshot),
    now,
    1
  );
}

/**
 * Get active game state by room code
 */
function getActiveGame(roomCode) {
  const stmt = db.prepare('SELECT * FROM active_games WHERE room_code = ?');
  const row = stmt.get(roomCode);

  if (!row) return null;

  return {
    ...row,
    game_snapshot: JSON.parse(row.game_snapshot)
  };
}

/**
 * Get all active games (for recovery on startup)
 */
function getAllActiveGames(maxAgeHours = 24) {
  const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
  const stmt = db.prepare(`
    SELECT * FROM active_games
    WHERE last_activity > ?
    ORDER BY last_updated DESC
  `);

  const rows = stmt.all(cutoff);
  return rows.map(row => ({
    ...row,
    game_snapshot: JSON.parse(row.game_snapshot)
  }));
}

/**
 * Remove active game state (when game completes or is abandoned)
 */
function removeActiveGame(roomCode) {
  const stmt = db.prepare('DELETE FROM active_games WHERE room_code = ?');
  stmt.run(roomCode);
}

/**
 * Cleanup expired active games (run periodically)
 */
function cleanupExpiredGames(maxAgeHours = 24) {
  const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
  const stmt = db.prepare(`
    DELETE FROM active_games
    WHERE last_activity < ?
  `);

  const result = stmt.run(cutoff);
  return result.changes;
}

module.exports = {
  saveGame,
  getRecentGames,
  getTotalGames,
  saveActiveGame,
  getActiveGame,
  getAllActiveGames,
  removeActiveGame,
  cleanupExpiredGames,
  db
};
