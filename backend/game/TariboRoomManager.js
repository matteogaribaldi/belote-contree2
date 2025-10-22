const TariboDeck = require('./TariboDeck');
const TariboGameLogic = require('./TariboGameLogic');
const TariboBotPlayer = require('./TariboBotPlayer');
const { createGame, updateGamePlayers, endGame } = require('../database/db');

class TariboRoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.playerRooms = new Map();
    this.deck = new TariboDeck();
    this.gameLogic = new TariboGameLogic();
    this.botPlayer = new TariboBotPlayer(this.gameLogic);
    this.dealerRotation = ['north', 'east', 'south', 'west'];
    this.disconnectedPlayers = new Map();
    this.reconnectionTimeout = 60000; // 60 secondi
    this.turnTimeouts = new Map();
    this.TURN_TIMEOUT_MS = 20000; // 20 secondi
  }

  generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  async createRoom(socket, playerName) {
    console.log('📝 [Taribo] createRoom called:', { socketId: socket.id, playerName });

    const existingRoom = Array.from(this.rooms.values()).find(r => r.state === 'waiting');

    if (existingRoom) {
      console.log('⚠️  [Taribo] Existing room found, rejecting:', existingRoom.code);
      socket.emit('error', { message: 'Esiste già una stanza in attesa. Unisciti a quella invece di crearne una nuova.' });
      return;
    }

    const roomCode = this.generateRoomCode();
    const creatorIp = socket.handshake.address;
    console.log('✅ [Taribo] Creating new room:', { roomCode, creatorIp, playerName });

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
      disconnectedStatus: {
        north: false,
        east: false,
        south: false,
        west: false
      },
      playerNames: {},
      botCounter: 0,
      state: 'waiting',
      game: null,
      gameScore: { northSouth: 0, eastWest: 0 },
      targetScore: 501,
      handHistory: []
    };

    this.rooms.set(roomCode, room);
    this.playerRooms.set(socket.id, roomCode);
    room.playerNames[socket.id] = playerName;

    socket.join(roomCode);
    console.log('🚀 [Taribo] Emitting roomCreated event:', { roomCode, playerName, socketId: socket.id });
    socket.emit('taribo:roomCreated', { roomCode, playerName });

    console.log(`✅ [Taribo] Stanza creata: ${roomCode} da ${playerName}`);

    await createGame(roomCode, creatorIp);

    this.broadcastRoomState(roomCode);
    this.broadcastActiveRooms();
  }

  joinRoom(socket, roomCode, playerName) {
    if (!roomCode) {
      const waitingRoom = Array.from(this.rooms.values()).find(r => r.state === 'waiting');
      if (!waitingRoom) {
        socket.emit('error', { message: 'Nessuna stanza disponibile' });
        return;
      }
      roomCode = waitingRoom.code;
    }

    const room = this.rooms.get(roomCode);

    if (!room) {
      socket.emit('error', { message: 'Stanza non trovata' });
      return;
    }

    if (room.state !== 'waiting') {
      socket.emit('error', { message: 'Partita già iniziata' });
      return;
    }

    const hasRealPlayers = Object.values(room.players).some(player =>
      player !== null &&
      !player.startsWith('bot-') &&
      player !== socket.id
    );

    const hostSocket = room.host ? this.io.sockets.sockets.get(room.host) : null;
    const hostDisconnected = !hostSocket;

    if (!hasRealPlayers || hostDisconnected) {
      room.host = socket.id;
      console.log(`[Taribo] ${playerName} è il nuovo host della stanza ${roomCode}`);
    }

    this.playerRooms.set(socket.id, roomCode);
    room.playerNames[socket.id] = playerName;

    socket.join(roomCode);
    socket.emit('taribo:roomJoined', { roomCode, playerName });

    this.broadcastRoomState(roomCode);
    this.broadcastActiveRooms();

    console.log(`[Taribo] ${playerName} si è unito alla stanza ${roomCode}`);
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

      if (room.bots[position]) {
        room.botCounter++;
        const botId = `bot-${position}`;
        const botName = `Bot ${room.botCounter}`;
        room.players[position] = botId;
        room.playerNames[botId] = botName;
      } else {
        room.players[position] = null;
      }

      this.broadcastRoomState(roomCode);
    }
  }

  async startGame(socket, roomCode) {
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
    this.broadcastActiveRooms();

    const playerMap = {
      N: this.getPlayerName(room, 'north'),
      E: this.getPlayerName(room, 'east'),
      S: this.getPlayerName(room, 'south'),
      W: this.getPlayerName(room, 'west')
    };
    await updateGamePlayers(roomCode, playerMap, room.bots);

    this.initializeGame(room);

    console.log(`[Taribo] Partita iniziata nella stanza ${roomCode}`);
  }

  initializeGame(room, isNewHand = false) {
    // Distribuzione iniziale: 5 carte per giocatore + 1 carta scoperta
    const { hands, faceUpCard, remainingDeck } = this.deck.dealInitial();

    let dealer, firstPlayer;
    if (!isNewHand || !room.game) {
      dealer = 'west';
      firstPlayer = 'north';
    } else {
      const currentDealerIndex = this.dealerRotation.indexOf(room.game.dealer);
      const nextDealerIndex = (currentDealerIndex + 1) % 4;
      dealer = this.dealerRotation[nextDealerIndex];
      firstPlayer = this.dealerRotation[(nextDealerIndex + 1) % 4];
    }

    room.game = {
      hands: hands,
      initialHands: JSON.parse(JSON.stringify(hands)),
      faceUpCard: faceUpCard,
      remainingDeck: remainingDeck,
      currentPlayer: firstPlayer,
      firstPlayer: firstPlayer,
      dealer: dealer,
      biddingPhase: true,
      biddingRound: 1, // 1 o 2
      bids: [],
      takerPosition: null,
      trump: null,
      currentTrick: {},
      tricks: [],
      score: { northSouth: 0, eastWest: 0 },
      beloteRebelote: null,
      lastTrick: null,
      trickDisplaying: false,
      declarationsPhase: false,
      declarations: null,
      declaredPlayers: [],
      gameOver: false,
      winner: null,
      turnStartTime: Date.now(),
      turnTimeoutMs: this.TURN_TIMEOUT_MS
    };

    // Ordina le carte iniziali (5 carte)
    this.sortHands(hands, null);

    this.logGameStart(room, hands, faceUpCard, dealer, firstPlayer);

    this.broadcastGameState(room.code);

    this.startTurnTimer(room.code, firstPlayer);

    if (this.isBot(room, firstPlayer)) {
      setTimeout(() => this.botBid(room, firstPlayer), 500);
    }
  }

  placeBid(socket, roomCode, bid, botPosition = null) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'playing' || !room.game.biddingPhase) return;

    const position = botPosition || this.getPlayerPosition(room, socket.id);
    if (!position || room.game.currentPlayer !== position) return;

    this.clearTurnTimer(roomCode);

    room.game.bids.push({ player: position, bid });

    console.log(`[Taribo] ${position} bid:`, bid, `Round: ${room.game.biddingRound}`);

    if (bid.type === 'take') {
      // Qualcuno ha preso
      room.game.takerPosition = position;

      if (room.game.biddingRound === 1) {
        // Ha preso la carta scoperta nel primo giro
        room.game.trump = bid.suit || room.game.faceUpCard.suit;
      } else {
        // Ha scelto un seme nel secondo giro
        room.game.trump = bid.suit;
      }

      // Completa la distribuzione: taker riceve carta scoperta + 2, altri +3
      this.deck.dealRemaining(
        room.game.hands,
        room.game.faceUpCard,
        position,
        room.game.remainingDeck
      );

      // Riordina le mani con il trump definitivo
      this.sortHands(room.game.hands, room.game.trump);

      room.game.biddingPhase = false;
      room.game.currentPlayer = this.gameLogic.getNextPlayer(room.game.dealer);
      room.game.turnStartTime = Date.now();

      console.log(`[Taribo] ${position} ha preso! Trump: ${room.game.trump}`);

      this.broadcastGameState(room.code);

      this.startTurnTimer(room.code, room.game.currentPlayer);

      if (this.isBot(room, room.game.currentPlayer)) {
        setTimeout(() => this.botPlay(room, room.game.currentPlayer), 500);
      }
      return;
    }

    if (bid.type === 'pass') {
      // Conta i pass consecutivi
      const allPassed = room.game.bids.filter(b => b.bid.type === 'pass').length;

      if (allPassed === 4) {
        if (room.game.biddingRound === 1) {
          // Primo giro: tutti passati -> secondo giro
          console.log('[Taribo] Tutti passati nel primo giro, inizio secondo giro');
          room.game.biddingRound = 2;
          room.game.bids = []; // Reset bids
          room.game.currentPlayer = room.game.firstPlayer;
          room.game.turnStartTime = Date.now();

          this.broadcastGameState(room.code);

          this.startTurnTimer(room.code, room.game.currentPlayer);

          if (this.isBot(room, room.game.currentPlayer)) {
            setTimeout(() => this.botBid(room, room.game.currentPlayer), 500);
          }
          return;
        } else {
          // Secondo giro: tutti passati -> ridistribuzione
          console.log('[Taribo] Tutti passati nel secondo giro, ridistribuzione carte');
          this.initializeGame(room, false);
          return;
        }
      }
    }

    room.game.currentPlayer = this.gameLogic.getNextPlayer(room.game.currentPlayer);
    room.game.turnStartTime = Date.now();
    this.broadcastGameState(room.code);

    this.startTurnTimer(room.code, room.game.currentPlayer);

    if (this.isBot(room, room.game.currentPlayer)) {
      setTimeout(() => this.botBid(room, room.game.currentPlayer), 500);
    }
  }

  playCard(socket, roomCode, card, botPosition = null) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'playing' || room.game.biddingPhase) return;

    if (room.game.trickDisplaying) return;

    const position = botPosition || this.getPlayerPosition(room, socket.id);
    if (!position || room.game.currentPlayer !== position) return;

    const hand = room.game.hands[position];
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);

    console.log(`[Taribo] playCard: ${position} gioca ${card.rank} di ${card.suit}`);

    if (cardIndex === -1) {
      console.log(`[Taribo] ERRORE: Carta non trovata in mano!`);
      return;
    }

    if (!this.gameLogic.isValidPlay(card, hand, room.game.currentTrick, room.game.trump, position)) {
      socket.emit('error', { message: 'Carta non valida' });
      return;
    }

    this.clearTurnTimer(roomCode);

    const beloteCheck = this.gameLogic.checkBeloteRebelote(card, hand, room.game.trump);
    let isBelote = false;
    let isRebelote = false;

    if (beloteCheck === 'belote') {
      room.game.beloteRebelote = { player: position, announced: false };
      isBelote = true;
    } else if (beloteCheck === 'rebelote' && room.game.beloteRebelote) {
      room.game.beloteRebelote.announced = true;
      isRebelote = true;
    }

    hand.splice(cardIndex, 1);
    room.game.currentTrick[position] = card;

    if (isBelote || isRebelote) {
      room.game.lastSpeechBubble = {
        position,
        message: isBelote ? 'Belote!' : 'Rebelote!',
        timestamp: Date.now(),
        isBelote,
        isRebelote
      };
    }

    console.log(`[Taribo] Trick corrente ha ${Object.keys(room.game.currentTrick).length} carte`);

    if (Object.keys(room.game.currentTrick).length === 4) {
      console.log('[Taribo] Trick completo');

      // Controlla se è il primo trick completato -> fase dichiarazioni
      if (room.game.tricks.length === 0) {
        this.completeTrickAndStartDeclarations(room);
      } else {
        this.completeTrick(room);
      }
    } else {
      room.game.currentPlayer = this.gameLogic.getNextPlayer(room.game.currentPlayer);
      room.game.turnStartTime = Date.now();
      this.broadcastGameState(room.code);

      this.startTurnTimer(room.code, room.game.currentPlayer);

      if (this.isBot(room, room.game.currentPlayer)) {
        setTimeout(() => this.botPlay(room, room.game.currentPlayer), 500);
      }
    }
  }

  completeTrickAndStartDeclarations(room) {
    console.log('[Taribo] === PRIMO TRICK COMPLETATO - INIZIO DICHIARAZIONI ===');

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

    // Analizza dichiarazioni
    room.game.declarations = this.gameLogic.analyzeDeclarations(room.game.hands, room.game.trump);

    console.log('[Taribo] Dichiarazioni trovate:', room.game.declarations);

    // Aggiungi punti dichiarazioni
    if (room.game.declarations.sequence) {
      const team = room.game.declarations.sequence.team;
      if (team === 'NS') {
        room.game.score.northSouth += room.game.declarations.sequence.points;
      } else {
        room.game.score.eastWest += room.game.declarations.sequence.points;
      }
    }

    if (room.game.declarations.carre) {
      const team = room.game.declarations.carre.team;
      if (team === 'NS') {
        room.game.score.northSouth += room.game.declarations.carre.points;
      } else {
        room.game.score.eastWest += room.game.declarations.carre.points;
      }
    }

    room.game.trickDisplaying = true;
    room.game.declarationsPhase = true;

    this.broadcastGameState(room.code);

    // Dopo 5 secondi (tempo per vedere dichiarazioni), continua
    setTimeout(() => {
      room.game.trickDisplaying = false;
      room.game.declarationsPhase = false;
      room.game.currentTrick = {};
      room.game.currentPlayer = winner;
      room.game.turnStartTime = Date.now();

      this.broadcastGameState(room.code);

      this.startTurnTimer(room.code, room.game.currentPlayer);

      if (this.isBot(room, room.game.currentPlayer)) {
        setTimeout(() => this.botPlay(room, room.game.currentPlayer), 500);
      }
    }, 5000);
  }

  completeTrick(room) {
    console.log('[Taribo] === COMPLETE TRICK ===');

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

    const handsEmpty = Object.values(room.game.hands).every(hand => hand.length === 0);

    room.game.trickDisplaying = true;

    this.broadcastGameState(room.code);

    setTimeout(() => {
      room.game.trickDisplaying = false;
      room.game.currentTrick = {};
      room.game.currentPlayer = winner;
      room.game.turnStartTime = Date.now();

      if (handsEmpty) {
        this.endHand(room);
      } else {
        this.broadcastGameState(room.code);

        this.startTurnTimer(room.code, room.game.currentPlayer);

        if (this.isBot(room, room.game.currentPlayer)) {
          setTimeout(() => this.botPlay(room, room.game.currentPlayer), 500);
        }
      }
    }, 3000);
  }

  async endHand(room) {
    // Aggiungi 10 punti per l'ultima mano
    const lastTrick = room.game.tricks[room.game.tricks.length - 1];
    if (lastTrick.winner === 'north' || lastTrick.winner === 'south') {
      room.game.score.northSouth += 10;
    } else {
      room.game.score.eastWest += 10;
    }

    // Aggiungi Belote/Rebelote
    if (room.game.beloteRebelote && room.game.beloteRebelote.announced) {
      const player = room.game.beloteRebelote.player;
      if (player === 'north' || player === 'south') {
        room.game.score.northSouth += 20;
      } else {
        room.game.score.eastWest += 20;
      }
    }

    // Controlla se il taker ha fatto almeno 82 punti
    const takerTeam = (room.game.takerPosition === 'north' || room.game.takerPosition === 'south')
      ? 'northSouth' : 'eastWest';
    const takerScore = room.game.score[takerTeam];

    let finalScore = { northSouth: 0, eastWest: 0 };

    if (takerScore >= 82) {
      // Taker ha vinto
      finalScore[takerTeam] = room.game.score[takerTeam];
      const otherTeam = takerTeam === 'northSouth' ? 'eastWest' : 'northSouth';
      finalScore[otherTeam] = room.game.score[otherTeam];
    } else {
      // Taker ha perso: avversari prendono 252
      const otherTeam = takerTeam === 'northSouth' ? 'eastWest' : 'northSouth';
      finalScore[otherTeam] = 252;

      // Belote rimane alla squadra che l'ha fatta
      if (room.game.beloteRebelote && room.game.beloteRebelote.announced) {
        const belotePlayer = room.game.beloteRebelote.player;
        const beloteTeam = (belotePlayer === 'north' || belotePlayer === 'south') ? 'northSouth' : 'eastWest';
        if (beloteTeam === takerTeam) {
          finalScore[takerTeam] = 20;
        }
      } else {
        finalScore[takerTeam] = 0;
      }
    }

    room.game.finalScore = finalScore;
    room.game.handComplete = true;

    room.gameScore.northSouth += finalScore.northSouth;
    room.gameScore.eastWest += finalScore.eastWest;

    room.handHistory.push({
      handNumber: room.handHistory.length + 1,
      taker: room.game.takerPosition,
      trump: room.game.trump,
      finalScore: finalScore,
      winner: finalScore.northSouth > finalScore.eastWest ? 'northSouth' : 'eastWest',
      gameScore: { ...room.gameScore },
      initialHands: room.game.initialHands
    });

    const targetScore = room.targetScore || 501;
    console.log(`[Taribo] Check fine partita: NS=${room.gameScore.northSouth}, EW=${room.gameScore.eastWest}, target=${targetScore}`);

    if (room.gameScore.northSouth >= targetScore || room.gameScore.eastWest >= targetScore) {
      room.game.gameOver = true;
      room.game.winner = room.gameScore.northSouth >= targetScore ? 'northSouth' : 'eastWest';
      console.log(`[Taribo] GAME OVER! Winner: ${room.game.winner}`);

      const winningTeam = room.game.winner === 'northSouth' ? 'NS' : 'EW';
      await endGame(
        room.code,
        winningTeam,
        room.gameScore.northSouth,
        room.gameScore.eastWest,
        room.handHistory.length
      );
    }

    this.broadcastGameState(room.code);
  }

  nextHand(socket, roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'playing') return;

    if (room.game.gameOver) {
      socket.emit('error', { message: 'La partita è terminata' });
      return;
    }

    this.initializeGame(room, true);
  }

  botBid(room, position) {
    console.log(`[Taribo] botBid chiamato per posizione: ${position}`);

    if (!this.isBot(room, position)) {
      console.log(`[Taribo] ${position} non è un bot!`);
      return;
    }

    const hand = room.game.hands[position];
    const bid = this.botPlayer.makeBid(
      hand,
      room.game.biddingRound,
      room.game.faceUpCard,
      room.game.bids,
      position
    );

    console.log(`[Taribo] Bot ${position} ha scelto:`, bid);

    this.placeBid({ id: 'bot' }, room.code, bid, position);
  }

  botPlay(room, position) {
    if (!this.isBot(room, position)) return;

    const hand = room.game.hands[position];
    const card = this.botPlayer.playCard(
      hand,
      room.game.currentTrick,
      room.game.trump,
      position,
      { player: room.game.takerPosition }
    );

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

  sortHands(hands, trump) {
    const suitOrder = { 'hearts': 0, 'diamonds': 1, 'clubs': 2, 'spades': 3 };
    const rankOrder = { 'A': 8, 'K': 7, 'Q': 6, 'J': 5, '10': 4, '9': 3, '8': 2, '7': 1 };

    for (let position in hands) {
      hands[position].sort((a, b) => {
        if (suitOrder[a.suit] !== suitOrder[b.suit]) {
          return suitOrder[a.suit] - suitOrder[b.suit];
        }
        return rankOrder[b.rank] - rankOrder[a.rank];
      });
    }
  }

  broadcastRoomState(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const roomState = {
      code: room.code,
      host: room.host,
      players: {},
      bots: room.bots,
      state: room.state,
      targetScore: room.targetScore || 501
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

    this.io.to(roomCode).emit('taribo:roomState', roomState);
  }

  broadcastGameState(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.game) return;

    const playerNames = {};
    for (let pos in room.players) {
      const socketId = room.players[pos];
      if (socketId) {
        if (room.disconnectedStatus[pos]) {
          const originalName = room.playerNames[socketId] || this.getPositionLabel(pos);
          playerNames[pos] = `${originalName} (Disconnesso...)`;
        } else {
          playerNames[pos] = room.playerNames[socketId] || this.getPositionLabel(pos);
        }
      } else if (room.bots[pos]) {
        playerNames[pos] = 'BOT';
      } else {
        playerNames[pos] = this.getPositionLabel(pos);
      }
    }

    for (let pos in room.players) {
      const socketId = room.players[pos];
      if (!socketId || this.isBot(room, pos)) continue;

      const gameState = {
        position: pos,
        hand: room.game.hands[pos],
        faceUpCard: room.game.faceUpCard,
        currentPlayer: room.game.currentPlayer,
        firstPlayer: room.game.firstPlayer,
        dealer: room.game.dealer,
        biddingPhase: room.game.biddingPhase,
        biddingRound: room.game.biddingRound,
        bids: room.game.bids,
        takerPosition: room.game.takerPosition,
        trump: room.game.trump,
        currentTrick: room.game.currentTrick,
        score: room.game.score,
        lastTrick: room.game.lastTrick,
        beloteRebelote: room.game.beloteRebelote,
        handComplete: room.game.handComplete,
        finalScore: room.game.finalScore,
        trickDisplaying: room.game.trickDisplaying,
        declarationsPhase: room.game.declarationsPhase,
        declarations: room.game.declarations,
        playerNames: playerNames,
        gameScore: room.gameScore,
        handHistory: room.handHistory,
        gameOver: room.game.gameOver,
        winner: room.game.winner,
        lastSpeechBubble: room.game.lastSpeechBubble,
        initialHands: room.game.initialHands,
        turnStartTime: room.game.turnStartTime,
        turnTimeoutMs: room.game.turnTimeoutMs
      };

      this.io.to(socketId).emit('taribo:gameState', gameState);
    }
  }

  getPositionLabel(position) {
    const labels = {
      north: 'Nord',
      south: 'Sud',
      east: 'Est',
      west: 'Ovest'
    };
    return labels[position] || position;
  }

  getPlayerName(room, position) {
    const socketId = room.players[position];
    if (!socketId) return null;
    return room.playerNames[socketId] || 'Giocatore';
  }

  getActiveRooms() {
    const activeRooms = [];

    for (let [code, room] of this.rooms) {
      if (room.state === 'waiting') {
        const playerCount = Object.values(room.players).filter(p => p !== null).length;
        const hostName = room.playerNames[room.host] || 'Host';

        activeRooms.push({
          code: code,
          hostName: hostName,
          playerCount: playerCount
        });
      }
    }

    return activeRooms;
  }

  broadcastActiveRooms() {
    const activeRooms = this.getActiveRooms();
    this.io.emit('taribo:activeRoomsList', activeRooms);
  }

  handleDisconnect(socket) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    const room = this.rooms.get(roomCode);
    if (!room) return;

    const position = this.getPlayerPosition(room, socket.id);

    if (position) {
      if (room.state === 'playing') {
        const disconnectKey = `${roomCode}-${position}`;
        const playerName = room.playerNames[socket.id];

        console.log(`[Taribo] Giocatore ${position} (${playerName}) disconnesso dalla stanza ${roomCode}`);

        const timeout = setTimeout(() => {
          console.log(`[Taribo] Timeout scaduto. ${position} convertito in bot nella stanza ${roomCode}`);

          room.bots[position] = true;
          room.disconnectedStatus[position] = false;
          room.botCounter++;
          const botName = `Bot ${room.botCounter}`;
          room.players[position] = `bot-${position}`;
          room.playerNames[`bot-${position}`] = botName;

          this.disconnectedPlayers.delete(disconnectKey);
          this.broadcastGameState(roomCode);

          if (room.game && room.game.currentPlayer === position) {
            if (room.game.biddingPhase) {
              setTimeout(() => this.botBid(room, position), 500);
            } else {
              setTimeout(() => this.botPlay(room, position), 500);
            }
          }
        }, this.reconnectionTimeout);

        this.disconnectedPlayers.set(disconnectKey, {
          playerName,
          oldSocketId: socket.id,
          wasHost: room.host === socket.id,
          timeout
        });

        room.disconnectedStatus[position] = true;
        room.bots[position] = true;
        room.players[position] = `bot-${position}`;
        room.playerNames[`bot-${position}`] = playerName;

        this.broadcastGameState(roomCode);

        if (room.game.currentPlayer === position) {
          if (room.game.biddingPhase) {
            setTimeout(() => this.botBid(room, position), 500);
          } else {
            setTimeout(() => this.botPlay(room, position), 500);
          }
        }
      } else {
        const wasHost = room.host === socket.id;
        room.players[position] = null;

        if (wasHost) {
          const newHost = Object.values(room.players).find(player => player !== null && !player.startsWith('bot-'));
          if (newHost) {
            room.host = newHost;
            const newHostName = room.playerNames[newHost] || 'Giocatore';
            console.log(`[Taribo] ${newHostName} è il nuovo host della stanza ${roomCode}`);
          }
        }

        this.broadcastRoomState(roomCode);
        this.broadcastActiveRooms();
      }
    }

    this.playerRooms.delete(socket.id);
  }

  logGameStart(room, hands, faceUpCard, dealer, firstPlayer) {
    console.log('\n' + '='.repeat(80));
    console.log('[TARIBO] NUOVA MANO - Stanza:', room.code);
    console.log('Dealer:', dealer.toUpperCase(), '| Primo a giocare:', firstPlayer.toUpperCase());
    console.log('Carta scoperta:', `${faceUpCard.rank} di ${faceUpCard.suit}`);
    console.log('='.repeat(80));

    const positions = ['north', 'east', 'south', 'west'];
    const suitSymbols = {
      'hearts': '♥',
      'diamonds': '♦',
      'clubs': '♣',
      'spades': '♠'
    };

    positions.forEach(pos => {
      const playerName = room.playerNames[room.players[pos]] || 'Giocatore';
      const hand = hands[pos];

      const cardsBySuit = {
        'hearts': [],
        'diamonds': [],
        'clubs': [],
        'spades': []
      };

      hand.forEach(card => {
        cardsBySuit[card.suit].push(card.rank);
      });

      const cardsStr = ['hearts', 'diamonds', 'clubs', 'spades']
        .map(suit => {
          if (cardsBySuit[suit].length === 0) return null;
          return `${suitSymbols[suit]} ${cardsBySuit[suit].join(' ')}`;
        })
        .filter(s => s !== null)
        .join(' | ');

      console.log(`[${pos.toUpperCase().padEnd(5)}] ${playerName.padEnd(20)} ${cardsStr}`);
    });

    console.log('='.repeat(80) + '\n');
  }

  startTurnTimer(roomCode, position) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.game) return;

    if (this.isBot(room, position)) return;

    this.clearTurnTimer(roomCode);

    const timeoutId = setTimeout(() => {
      this.handleTurnTimeout(roomCode, position);
    }, this.TURN_TIMEOUT_MS);

    this.turnTimeouts.set(roomCode, timeoutId);
  }

  clearTurnTimer(roomCode) {
    const timeoutId = this.turnTimeouts.get(roomCode);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.turnTimeouts.delete(roomCode);
    }
  }

  handleTurnTimeout(roomCode, position) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.game) return;

    if (room.game.currentPlayer !== position) return;

    console.log(`[Taribo] ⏱️  Timeout per ${position} nella stanza ${roomCode}`);

    if (room.game.biddingPhase) {
      this.placeBid({ id: 'timeout' }, roomCode, { type: 'pass' }, position);
    } else {
      const hand = room.game.hands[position];
      if (hand && hand.length > 0) {
        const card = this.botPlayer.playCard(
          hand,
          room.game.currentTrick,
          room.game.trump,
          position,
          { player: room.game.takerPosition }
        );
        this.playCard({ id: 'timeout' }, roomCode, card, position);
      }
    }
  }

  setTargetScore(socket, roomCode, targetScore) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Stanza non trovata' });
      return;
    }

    if (room.host !== socket.id) {
      socket.emit('error', { message: 'Solo l\'host può cambiare il punteggio target' });
      return;
    }

    if (![301, 501, 701].includes(targetScore)) {
      socket.emit('error', { message: 'Punteggio target non valido' });
      return;
    }

    room.targetScore = targetScore;
    console.log(`[Taribo] Target score impostato a ${targetScore} per la stanza ${roomCode}`);

    this.broadcastRoomState(roomCode);
  }

  deleteRoom(socket, roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    if (socket.id !== room.host) {
      socket.emit('error', { message: 'Solo l\'host può cancellare il tavolo' });
      return;
    }

    if (room.state !== 'waiting') {
      socket.emit('error', { message: 'Non puoi cancellare il tavolo durante una partita' });
      return;
    }

    console.log(`[Taribo] Stanza ${roomCode} cancellata dall'host`);

    for (let pos in room.players) {
      const playerId = room.players[pos];
      if (playerId && !playerId.startsWith('bot-')) {
        this.playerRooms.delete(playerId);
      }
    }

    this.rooms.delete(roomCode);

    this.io.to(roomCode).emit('taribo:roomDeleted', { message: 'Il tavolo è stato cancellato dall\'host' });

    this.broadcastActiveRooms();
  }

  reconnectPlayer(socket, roomCode, playerName) {
    const room = this.rooms.get(roomCode);

    if (!room) {
      socket.emit('error', { message: 'Stanza non trovata' });
      return;
    }

    if (room.state !== 'playing') {
      socket.emit('error', { message: 'La partita non è in corso' });
      return;
    }

    let reconnectedPosition = null;
    for (let pos in room.players) {
      const disconnectKey = `${roomCode}-${pos}`;
      const disconnectedData = this.disconnectedPlayers.get(disconnectKey);

      if (disconnectedData && disconnectedData.playerName === playerName) {
        reconnectedPosition = pos;

        clearTimeout(disconnectedData.timeout);
        this.disconnectedPlayers.delete(disconnectKey);

        room.bots[pos] = false;
        room.disconnectedStatus[pos] = false;

        if (disconnectedData.wasHost) {
          room.host = socket.id;
        }

        room.players[pos] = socket.id;
        room.playerNames[socket.id] = playerName;
        this.playerRooms.set(socket.id, roomCode);

        socket.join(roomCode);

        console.log(`[Taribo] ${playerName} riconnesso come ${pos} nella stanza ${roomCode}`);

        socket.emit('taribo:reconnected', { roomCode, position: pos });
        this.broadcastGameState(roomCode);

        return;
      }
    }

    socket.emit('error', { message: 'Nessuna partita in attesa di riconnessione trovata' });
  }

  broadcastRoomState(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const roomState = {
      code: room.code,
      host: room.host,
      players: {},
      bots: room.bots,
      state: room.state,
      targetScore: room.targetScore || 501
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

    this.io.to(roomCode).emit('taribo:roomState', roomState);
  }
}

module.exports = TariboRoomManager;
