const Deck = require('./Deck');
const GameLogic = require('./GameLogic');
const BotPlayer = require('./BotPlayer');

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.playerRooms = new Map();
    this.deck = new Deck();
    this.gameLogic = new GameLogic();
    this.botPlayer = new BotPlayer(this.gameLogic);
  }

  generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  createRoom(socket, playerName) {
    const roomCode = this.generateRoomCode();
    
    const room = {
      code: roomCode,
      host: socket.id,
      players: {
        north: null,
        east: null,
        south: null,
        west: null
      },
      bots: {
        north: false,
        east: false,
        south: false,
        west: false
      },
      playerNames: {},
      state: 'waiting',
      game: null
    };

    this.rooms.set(roomCode, room);
    this.playerRooms.set(socket.id, roomCode);
    
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, playerName });
    
    console.log(`Stanza creata: ${roomCode} da ${playerName}`);

    this.broadcastRoomState(roomCode);
  }

  joinRoom(socket, roomCode, playerName) {
    const room = this.rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { message: 'Stanza non trovata' });
      return;
    }

    if (room.state !== 'waiting') {
      socket.emit('error', { message: 'Partita già iniziata' });
      return;
    }

    this.playerRooms.set(socket.id, roomCode);
    room.playerNames[socket.id] = playerName;
    
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, playerName });
    
    this.broadcastRoomState(roomCode);
    
    console.log(`${playerName} si è unito alla stanza ${roomCode}`);
  }

  choosePosition(socket, roomCode, position) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    for (let pos in room.players) {
      if (room.players[pos] === socket.id) {
        room.players[pos] = null;
      }
    }

    if (room.players[position] === null) {
      room.players[position] = socket.id;
      this.broadcastRoomState(roomCode);
    }
  }

  toggleBot(socket, roomCode, position) {
    const room = this.rooms.get(roomCode);
    if (!room || socket.id !== room.host) return;

    if (room.players[position] === null) {
      room.bots[position] = !room.bots[position];
      this.broadcastRoomState(roomCode);
    }
  }

  startGame(socket, roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || socket.id !== room.host) return;

    for (let pos in room.players) {
      if (room.players[pos] === null && !room.bots[pos]) {
        socket.emit('error', { message: 'Tutti i posti devono essere occupati' });
        return;
      }
    }

    room.state = 'playing';

    this.broadcastRoomState(roomCode);

    this.initializeGame(room);
    
    console.log(`Partita iniziata nella stanza ${roomCode}`);
  }

  initializeGame(room) {
  const hands = this.deck.deal();
  
  room.game = {
    hands: hands,
    currentPlayer: 'north',
    dealer: 'west',
    biddingPhase: true,
    bids: [],
    contract: null,
    trump: null,
    currentTrick: {},
    tricks: [],
    score: { northSouth: 0, eastWest: 0 },
    beloteRebelote: null,
    lastTrick: null
  };
  
  // Ordina le carte DOPO aver inizializzato room.game
  this.sortHands(hands, null);

  this.broadcastGameState(room.code);
  
  if (this.isBot(room, 'north')) {
    setTimeout(() => this.botBid(room, 'north'), 1000);
  }
}

  placeBid(socket, roomCode, bid, botPosition = null) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'playing' || !room.game.biddingPhase) return;

    // Se è un bot, usa la posizione passata, altrimenti trova la posizione del giocatore
    const position = botPosition || this.getPlayerPosition(room, socket.id);
    if (!position || room.game.currentPlayer !== position) return;

    if (!this.isValidBid(room.game, bid)) {
      socket.emit('error', { message: 'Puntata non valida' });
      return;
    }

    room.game.bids.push({ player: position, bid });

    if (bid.type === 'pass') {
  // Conta i pass consecutivi
  let consecutivePasses = 0;
  let lastBidExists = false;
  
  for (let i = room.game.bids.length - 1; i >= 0; i--) {
    if (room.game.bids[i].bid.type === 'pass') {
      consecutivePasses++;
    } else if (room.game.bids[i].bid.type === 'bid') {
      lastBidExists = true;
      break;
    }
  }

  // Se ci sono 3 pass consecutivi dopo una puntata, l'asta è chiusa
  if (lastBidExists && consecutivePasses === 3) {
    const lastBid = [...room.game.bids].reverse().find(b => b.bid.type === 'bid');
    room.game.contract = lastBid;
    room.game.trump = lastBid.bid.suit;
    room.game.biddingPhase = false;
    room.game.currentPlayer = this.gameLogic.getNextPlayer(room.game.dealer);
    
    this.broadcastGameState(room.code);
    
    if (this.isBot(room, room.game.currentPlayer)) {
      setTimeout(() => this.botPlay(room, room.game.currentPlayer), 1500);
    }
    return;
  }
  
  // Se tutti e 4 hanno passato senza puntate, ridistribuisci
  if (room.game.bids.length === 4 && !lastBidExists) {
    this.initializeGame(room);
    return;
  }
}

    room.game.currentPlayer = this.gameLogic.getNextPlayer(room.game.currentPlayer);
    this.broadcastGameState(room.code);

    if (this.isBot(room, room.game.currentPlayer)) {
      setTimeout(() => this.botBid(room, room.game.currentPlayer), 1000);
    }
  }

  isValidBid(game, bid) {
  // Passo è sempre valido
  if (bid.type === 'pass') {
    return true;
  }
  
  // Se è una puntata
  if (bid.type === 'bid') {
    // Controlla che i punti siano validi
    const validPoints = [80, 90, 100, 110, 120, 130, 140, 150, 160];
    if (!validPoints.includes(bid.points)) {
      return false;
    }

    // Controlla che il seme sia valido
    const validSuits = ['hearts', 'diamonds', 'clubs', 'spades'];
    if (!validSuits.includes(bid.suit)) {
      return false;
    }

    // Trova l'ultima puntata (non pass)
    const lastBid = [...game.bids].reverse().find(b => b.bid.type === 'bid');
    
    // Se c'è già una puntata, la nuova deve essere superiore di almeno 10 punti
    if (lastBid && bid.points <= lastBid.bid.points) {
      return false;
    }

    return true;
  }

  // Se non è né pass né bid, non è valido
  return false;
}

playCard(socket, roomCode, card, botPosition = null) {
  const room = this.rooms.get(roomCode);
  if (!room || room.state !== 'playing' || room.game.biddingPhase) return;

  const position = botPosition || this.getPlayerPosition(room, socket.id);
  if (!position || room.game.currentPlayer !== position) return;

    const hand = room.game.hands[position];
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    
    if (cardIndex === -1) return;

    if (!this.gameLogic.isValidPlay(card, hand, room.game.currentTrick, room.game.trump)) {
      socket.emit('error', { message: 'Carta non valida' });
      return;
    }

    const beloteCheck = this.gameLogic.checkBeloteRebelote(card, hand, room.game.trump);
    if (beloteCheck === 'belote') {
      room.game.beloteRebelote = { player: position, announced: false };
    } else if (beloteCheck === 'rebelote' && room.game.beloteRebelote) {
      room.game.beloteRebelote.announced = true;
    }

    hand.splice(cardIndex, 1);
    room.game.currentTrick[position] = card;

    if (Object.keys(room.game.currentTrick).length === 4) {
  this.completeTrick(room);
} else {
  room.game.currentPlayer = this.gameLogic.getNextPlayer(room.game.currentPlayer);
  this.broadcastGameState(room.code);

  // Se il prossimo è un bot
  if (this.isBot(room, room.game.currentPlayer)) {
    setTimeout(() => this.botPlay(room, room.game.currentPlayer), 2500);  // <-- CAMBIATO
  }
}
  }

  completeTrick(room) {
    const leadPlayer = Object.keys(room.game.currentTrick)[0];
    const leadCard = room.game.currentTrick[leadPlayer];
    const winner = this.gameLogic.determineWinner(room.game.currentTrick, room.game.trump, leadCard.suit);
    const points = this.gameLogic.calculateTrickPoints(room.game.currentTrick, room.game.trump);

    room.game.lastTrick = { ...room.game.currentTrick, winner, points };
    room.game.tricks.push({ trick: room.game.currentTrick, winner, points });

    if (winner === 'north' || winner === 'south') {
      room.game.score.northSouth += points;
    } else {
      room.game.score.eastWest += points;
    }

    room.game.currentTrick = {};
    room.game.currentPlayer = winner;

    const handsEmpty = Object.values(room.game.hands).every(hand => hand.length === 0);
    
    if (handsEmpty) {
      this.endHand(room);
    } else {
      this.broadcastGameState(room.code);

      if (this.isBot(room, winner)) {
        setTimeout(() => this.botPlay(room, winner), 3000);
      }
    }
  }

  endHand(room) {
    const lastTrick = room.game.tricks[room.game.tricks.length - 1];
    if (lastTrick.winner === 'north' || lastTrick.winner === 'south') {
      room.game.score.northSouth += 10;
    } else {
      room.game.score.eastWest += 10;
    }

    if (room.game.beloteRebelote && room.game.beloteRebelote.announced) {
      const player = room.game.beloteRebelote.player;
      if (player === 'north' || player === 'south') {
        room.game.score.northSouth += 20;
      } else {
        room.game.score.eastWest += 20;
      }
    }

    const contractTeam = room.game.contract.player === 'north' || room.game.contract.player === 'south' 
      ? 'northSouth' : 'eastWest';
    const contractPoints = room.game.contract.bid.points;
    const teamScore = room.game.score[contractTeam];

    let finalScore = { northSouth: 0, eastWest: 0 };

    if (teamScore >= contractPoints) {
      finalScore[contractTeam] = room.game.score[contractTeam];
      const otherTeam = contractTeam === 'northSouth' ? 'eastWest' : 'northSouth';
      finalScore[otherTeam] = room.game.score[otherTeam];
    } else {
      const otherTeam = contractTeam === 'northSouth' ? 'eastWest' : 'northSouth';
      finalScore[otherTeam] = 162;
      if (room.game.beloteRebelote && room.game.beloteRebelote.announced) {
        const beloteTeam = room.game.beloteRebelote.player === 'north' || room.game.beloteRebelote.player === 'south'
          ? 'northSouth' : 'eastWest';
        if (beloteTeam !== contractTeam) {
          finalScore[beloteTeam] += 20;
        }
      }
    }

    room.game.finalScore = finalScore;
    room.game.handComplete = true;

    this.broadcastGameState(room.code);
  }

 botBid(room, position) {
  console.log(`botBid chiamato per posizione: ${position}`);
  
  if (!this.isBot(room, position)) {
    console.log(`${position} non è un bot!`);
    return;
  }

  const hand = room.game.hands[position];
  const currentBid = [...room.game.bids].reverse().find(b => b.bid.type === 'bid');
  
  console.log(`Bot ${position} sta facendo bid...`);
  const bid = this.botPlayer.makeBid(hand, currentBid);
  console.log(`Bot ${position} ha scelto:`, bid);
  
  this.placeBid({ id: 'bot' }, room.code, bid, position);
 }

  botPlay(room, position) {
    if (!this.isBot(room, position)) return;

    const hand = room.game.hands[position];
    const card = this.botPlayer.playCard(hand, room.game.currentTrick, room.game.trump, position);
    
     this.playCard({ id: 'bot' }, room.code, card, position);
  }

  isBot(room, position) {
    return room.bots[position] || (room.players[position] && room.players[position].startsWith('bot-'));
  }

  getPlayerPosition(room, socketId) {
    for (let pos in room.players) {
      if (room.players[pos] === socketId) {
        return pos;
      }
    }
    return null;
  }

  handleDisconnect(socket) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    const room = this.rooms.get(roomCode);
    if (!room) return;

    const position = this.getPlayerPosition(room, socket.id);
    
    if (position) {
      if (room.state === 'playing') {
        room.bots[position] = true;
        room.players[position] = `bot-${position}`;
        
        console.log(`Giocatore ${position} convertito in bot nella stanza ${roomCode}`);
        
        this.broadcastGameState(roomCode);
        
        if (room.game.currentPlayer === position) {
          if (room.game.biddingPhase) {
            setTimeout(() => this.botBid(room, position), 1000);
          } else {
            setTimeout(() => this.botPlay(room, position), 1500);
          }
        }
      } else {
        room.players[position] = null;
        this.broadcastRoomState(roomCode);
      }
    }

    this.playerRooms.delete(socket.id);
  }

  broadcastRoomState(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const roomState = {
      code: room.code,
      host: room.host,
      players: {},
      bots: room.bots,
      state: room.state
    };

    for (let pos in room.players) {
      if (room.players[pos]) {
        roomState.players[pos] = {
          id: room.players[pos],
          name: room.playerNames[room.players[pos]] || 'Giocatore'
        };
      } else {
        roomState.players[pos] = null;
      }
    }

    this.io.to(roomCode).emit('roomState', roomState);
  }
  sortHands(hands, trump) {
  const suitOrder = { 'hearts': 0, 'diamonds': 1, 'clubs': 2, 'spades': 3 };
  const rankOrder = { 'A': 8, 'K': 7, 'Q': 6, 'J': 5, '10': 4, '9': 3, '8': 2, '7': 1 };
  
  for (let position in hands) {
    hands[position].sort((a, b) => {
      // Prima ordina per seme
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      // Poi ordina per valore (dal più alto al più basso)
      return rankOrder[b.rank] - rankOrder[a.rank];
    });
  }
}

  broadcastGameState(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.game) return;

    for (let pos in room.players) {
      const socketId = room.players[pos];
      if (!socketId || this.isBot(room, pos)) continue;

      const gameState = {
        position: pos,
        hand: room.game.hands[pos],
        currentPlayer: room.game.currentPlayer,
        biddingPhase: room.game.biddingPhase,
        bids: room.game.bids,
        contract: room.game.contract,
        trump: room.game.trump,
        currentTrick: room.game.currentTrick,
        score: room.game.score,
        lastTrick: room.game.lastTrick,
        beloteRebelote: room.game.beloteRebelote,
        handComplete: room.game.handComplete,
        finalScore: room.game.finalScore
      };

      this.io.to(socketId).emit('gameState', gameState);
    }
  }
}

module.exports = RoomManager;