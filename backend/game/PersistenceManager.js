const { saveActiveGame, removeActiveGame } = require('./database');

/**
 * PersistenceManager handles debounced saving of game state to SQLite
 * for crash recovery purposes.
 */
class PersistenceManager {
  constructor() {
    this.pendingSaves = new Map(); // roomCode → timeout
  }

  /**
   * Schedule a save with optional debouncing
   * @param {string} roomCode - Room identifier
   * @param {Object} room - Complete room object from RoomManager
   * @param {string} eventType - Type of event triggering save ('card_played', 'trick_completed', 'hand_ended')
   */
  scheduleSave(roomCode, room, eventType = 'card_played') {
    // Determine debounce delay based on event type
    const debounceMs = this.getDebounceDelay(eventType);

    // Clear existing timeout if any
    if (this.pendingSaves.has(roomCode)) {
      clearTimeout(this.pendingSaves.get(roomCode));
    }

    if (debounceMs === 0) {
      // Immediate save for critical events
      this.saveImmediately(roomCode, room);
      this.pendingSaves.delete(roomCode);
    } else {
      // Debounced save
      const timeout = setTimeout(() => {
        this.saveImmediately(roomCode, room);
        this.pendingSaves.delete(roomCode);
      }, debounceMs);

      this.pendingSaves.set(roomCode, timeout);
    }
  }

  /**
   * Get debounce delay based on event type
   */
  getDebounceDelay(eventType) {
    const delays = {
      'card_played': 100,        // 100ms debounce for card plays
      'trick_completed': 0,      // Immediate save after trick
      'hand_ended': 0,           // Immediate save after hand
      'game_started': 0          // Immediate save when game starts
    };
    return delays[eventType] || 100;
  }

  /**
   * Save game state immediately to database
   */
  saveImmediately(roomCode, room) {
    try {
      const snapshot = this.serializeGameState(room);
      const state = room.state || 'waiting';

      saveActiveGame(roomCode, state, snapshot);

      // Optional: log for monitoring
      // console.log(`💾 Saved game state for room ${roomCode}`);
    } catch (err) {
      console.error(`❌ Failed to save game state for ${roomCode}:`, err);
    }
  }

  /**
   * Serialize room object to minimal recovery state
   * Excludes: socket IDs, timeouts, UI transient state
   */
  serializeGameState(room) {
    const snapshot = {
      // Room configuration
      roomCode: room.code,
      targetScore: room.targetScore,
      advancedBotAI: room.advancedBotAI,

      // Players mapping (position → player data, WITHOUT socket IDs)
      players: {},

      // Game score across hands
      gameScore: room.gameScore || { northSouth: 0, eastWest: 0 },
      handHistory: room.handHistory || [],

      // Game state (only if playing)
      game: null
    };

    // Serialize players (store names and bot flags, not socket IDs)
    for (const pos of ['north', 'east', 'south', 'west']) {
      const playerId = room.players[pos];
      if (playerId) {
        snapshot.players[pos] = {
          name: room.playerNames[playerId] || 'Unknown',
          isBot: room.bots[pos] || false
        };
      }
    }

    // Serialize active game state if playing
    if (room.state === 'playing' && room.game) {
      snapshot.game = {
        // Cards
        hands: room.game.hands,
        initialHands: room.game.initialHands, // For UI display

        // Turn tracking
        currentPlayer: room.game.currentPlayer,
        firstPlayer: room.game.firstPlayer,
        dealer: room.game.dealer,

        // Bidding phase
        biddingPhase: room.game.biddingPhase,
        // NOTE: Not saving bids array - will restart bidding from zero if crash during auction
        contract: room.game.contract || null,
        trump: room.game.trump || null,
        contro: room.game.contro || false,
        surcontre: room.game.surcontre || false,

        // Play phase
        currentTrick: room.game.currentTrick || { north: null, east: null, south: null, west: null },
        tricks: room.game.tricks || [],

        // Scoring
        score: room.game.score || { northSouth: 0, eastWest: 0 },
        beloteRebelote: room.game.beloteRebelote || null,
        beloteDeclared: room.game.beloteDeclared || {}
      };
    }

    return snapshot;
  }

  /**
   * Remove game state from database (call when game completes)
   */
  removeGame(roomCode) {
    // Cancel any pending save
    if (this.pendingSaves.has(roomCode)) {
      clearTimeout(this.pendingSaves.get(roomCode));
      this.pendingSaves.delete(roomCode);
    }

    // Remove from database
    try {
      removeActiveGame(roomCode);
      console.log(`🗑️  Removed completed game state for room ${roomCode}`);
    } catch (err) {
      console.error(`❌ Failed to remove game state for ${roomCode}:`, err);
    }
  }

  /**
   * Flush any pending saves immediately (call on graceful shutdown)
   */
  flushAll(rooms) {
    console.log(`🔄 Flushing ${this.pendingSaves.size} pending saves...`);

    for (const [roomCode, timeout] of this.pendingSaves.entries()) {
      clearTimeout(timeout);
      const room = rooms.get(roomCode);
      if (room) {
        this.saveImmediately(roomCode, room);
      }
    }

    this.pendingSaves.clear();
  }
}

module.exports = PersistenceManager;
