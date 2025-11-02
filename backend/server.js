const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const RoomManager = require('./game/RoomManager');
const TariboRoomManager = require('./game/TariboRoomManager');
const { getRecentGames, getTotalGames } = require('./game/database');

// CORS Configuration
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      process.env.FRONTEND_URL || 'https://belote-frontend.onrender.com',
      'https://belotta.net',
      'https://www.belotta.net'
    ]
  : ['http://localhost:4200', 'http://localhost:3000'];

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`⚠️  CORS blocked origin: ${origin}`);
      callback(null, true); // Still allow for now, just log
    }
  },
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["*"]
  }
});

const roomManager = new RoomManager(io);
const tariboRoomManager = new TariboRoomManager(io);

io.on('connection', (socket) => {
  console.log('Nuovo client connesso:', socket.id);

  socket.on('getActiveRooms', () => {
    const activeRooms = roomManager.getActiveRooms();
    socket.emit('activeRoomsList', activeRooms);
  });

  socket.on('createRoom', (roomName) => {
    roomManager.createRoom(socket, roomName);
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

  socket.on('declareBelote', ({ roomCode }) => {
    roomManager.declareBelote(socket, roomCode);
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

  socket.on('closeRoom', ({ roomCode }) => {
    roomManager.closeRoom(socket, roomCode);
  });

  socket.on('reconnect', ({ roomCode, playerName }) => {
    roomManager.reconnectPlayer(socket, roomCode, playerName);
  });

  // Taribo events (prefissati con 'taribo:')
  socket.on('taribo:createRoom', (playerName) => {
    tariboRoomManager.createRoom(socket, playerName);
  });

  socket.on('taribo:joinRoom', ({ roomCode, playerName }) => {
    tariboRoomManager.joinRoom(socket, roomCode, playerName);
  });

  socket.on('taribo:choosePosition', ({ roomCode, position }) => {
    tariboRoomManager.choosePosition(socket, roomCode, position);
  });

  socket.on('taribo:toggleBot', ({ roomCode, position }) => {
    tariboRoomManager.toggleBot(socket, roomCode, position);
  });

  socket.on('taribo:startGame', (roomCode) => {
    tariboRoomManager.startGame(socket, roomCode);
  });

  socket.on('taribo:placeBid', ({ roomCode, bid }) => {
    tariboRoomManager.placeBid(socket, roomCode, bid);
  });

  socket.on('taribo:playCard', ({ roomCode, card }) => {
    tariboRoomManager.playCard(socket, roomCode, card);
  });

  socket.on('taribo:confirmTrick', (roomCode) => {
    tariboRoomManager.confirmTrick(socket, roomCode);
  });

  socket.on('taribo:nextHand', (roomCode) => {
    tariboRoomManager.nextHand(socket, roomCode);
  });

  socket.on('taribo:getActiveRooms', () => {
    const activeRooms = tariboRoomManager.getActiveRooms();
    socket.emit('taribo:activeRoomsList', activeRooms);
  });

  socket.on('taribo:deleteRoom', (roomCode) => {
    tariboRoomManager.deleteRoom(socket, roomCode);
  });

  socket.on('taribo:setTargetScore', ({ roomCode, targetScore }) => {
    tariboRoomManager.setTargetScore(socket, roomCode, targetScore);
  });

  socket.on('taribo:reconnect', ({ roomCode, playerName }) => {
    tariboRoomManager.reconnectPlayer(socket, roomCode, playerName);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnesso:', socket.id);
    roomManager.handleDisconnect(socket);
    tariboRoomManager.handleDisconnect(socket);
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


const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);

  // Recover active games from database
  await roomManager.recoverActiveGames();

  // Start cleanup cron job (every hour)
  setInterval(() => roomManager.cleanupExpired(), 3600000);
});