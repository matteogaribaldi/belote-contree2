const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const RoomManager = require('./game/RoomManager');
const { getRecentGames, getTotalGames } = require('./game/database');
const { initializeDatabase, getGameStats } = require('./database/db');

const app = express();
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["*"]
  }
});

const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
  console.log('Nuovo client connesso:', socket.id);

  socket.on('getActiveRooms', () => {
    const activeRooms = roomManager.getActiveRooms();
    socket.emit('activeRoomsList', activeRooms);
  });

  socket.on('createRoom', (playerName) => {
    roomManager.createRoom(socket, playerName);
  });

  socket.on('joinRoom', ({ roomCode, playerName }) => {
    roomManager.joinRoom(socket, roomCode, playerName);
  });

  socket.on('choosePosition', ({ roomCode, position }) => {
    roomManager.choosePosition(socket, roomCode, position);
  });

  socket.on('toggleBot', ({ roomCode, position }) => {
    roomManager.toggleBot(socket, roomCode, position);
  });

  socket.on('startGame', (roomCode) => {
    roomManager.startGame(socket, roomCode);
  });

  socket.on('placeBid', ({ roomCode, bid }) => {
    roomManager.placeBid(socket, roomCode, bid);
  });

  socket.on('playCard', ({ roomCode, card }) => {
    roomManager.playCard(socket, roomCode, card);
  });

  socket.on('nextHand', (roomCode) => {
    roomManager.nextHand(socket, roomCode);
  });

  socket.on('deleteRoom', (roomCode) => {
    roomManager.deleteRoom(socket, roomCode);
  });

  socket.on('setTargetScore', ({ roomCode, targetScore }) => {
    roomManager.setTargetScore(socket, roomCode, targetScore);
  });

  socket.on('setAdvancedBotAI', ({ roomCode, enabled }) => {
    roomManager.setAdvancedBotAI(socket, roomCode, enabled);
  });

  socket.on('reconnect', ({ roomCode, playerName }) => {
    roomManager.reconnectPlayer(socket, roomCode, playerName);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnesso:', socket.id);
    roomManager.handleDisconnect(socket);
  });
});

// REST API endpoint per lo storico partite
app.get('/api/game-history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const games = getRecentGames(limit);
    const totalGames = getTotalGames();

    res.json({
      success: true,
      totalGames,
      games
    });
  } catch (error) {
    console.error('Errore nel recuperare lo storico:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recuperare lo storico delle partite'
    });
  }
});

// REST API endpoint per statistiche PostgreSQL
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getGameStats();

    if (!stats) {
      return res.json({
        success: false,
        message: 'Database non configurato o nessuna partita registrata',
        stats: {
          total_games: 0,
          completed_games: 0,
          ns_wins: 0,
          ew_wins: 0,
          avg_score_ns: 0,
          avg_score_ew: 0
        }
      });
    }

    res.json({
      success: true,
      stats: {
        total_games: parseInt(stats.total_games) || 0,
        completed_games: parseInt(stats.completed_games) || 0,
        ns_wins: parseInt(stats.ns_wins) || 0,
        ew_wins: parseInt(stats.ew_wins) || 0,
        avg_score_ns: parseFloat(stats.avg_score_ns) || 0,
        avg_score_ew: parseFloat(stats.avg_score_ew) || 0
      }
    });
  } catch (error) {
    console.error('Errore nel recuperare le statistiche:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel recuperare le statistiche'
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
  await initializeDatabase();
});