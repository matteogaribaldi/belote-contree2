const Database = require('better-sqlite3');
const path = require('path');

// Create database in backend directory
const dbPath = path.join(__dirname, '..', 'games.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

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

module.exports = {
  saveGame,
  getRecentGames,
  getTotalGames,
  db
};
