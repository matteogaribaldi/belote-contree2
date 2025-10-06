const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const RoomManager = require('./game/RoomManager');

const app = express();
app.use(cors({
  origin: '*',
  credentials: true
}));

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

  socket.on('reconnect', ({ roomCode, playerName }) => {
    roomManager.reconnectPlayer(socket, roomCode, playerName);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnesso:', socket.id);
    roomManager.handleDisconnect(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});