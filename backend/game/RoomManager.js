const Deck = require('./Deck');
const GameLogic = require('./GameLogic');
const BotPlayer = require('./BotPlayer');
const AdvancedBotPlayer = require('./AdvancedBotPlayer');
const { saveGame } = require('./database');

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.playerRooms = new Map();
    this.deck = new Deck();
    this.gameLogic = new GameLogic();
    this.botPlayer = new BotPlayer(this.gameLogic);
    this.advancedBotPlayer = new AdvancedBotPlayer(this.gameLogic);
    this.dealerRotation = ['north', 'east', 'south', 'west'];
    this.disconnectedPlayers = new Map(); // { roomCode-position: { playerName, timeout } }
    this.reconnectionTimeout = 60000; // 60 secondi
  }

  generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  createRoom(socket, playerName) {
    // Controlla se esiste già una stanza in waiting
    const existingRoom = Array.from(this.rooms.values()).find(r => r.state === 'waiting');

    if (existingRoom) {
      socket.emit('error', { message: 'Esiste già una stanza in attesa. Unisciti a quella invece di crearne una nuova.' });
      return;
    }

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
      advancedBotAI: false,
      handHistory: []
    };

    this.rooms.set(roomCode, room);
    this.playerRooms.set(socket.id, roomCode);
    room.playerNames[socket.id] = playerName;

    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, playerName });

    console.log(`Stanza creata: ${roomCode} da ${playerName}`);

    this.broadcastRoomState(roomCode);
    this.broadcastActiveRooms();
  }

  joinRoom(socket, roomCode, playerName) {
    // Se non viene fornito un roomCode, trova l'unica stanza disponibile
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

    // Controlla se ci sono giocatori reali nella stanza (escludendo chi si sta connettendo)
    const hasRealPlayers = Object.values(room.players).some(player =>
      player !== null &&
      !player.startsWith('bot-') &&
      player !== socket.id
    );

    // Controlla se l'host corrente esiste ancora nei socket connessi
    const hostSocket = room.host ? this.io.sockets.sockets.get(room.host) : null;
    const hostDisconnected = !hostSocket;

    // Se non ci sono giocatori reali o l'host è disconnesso, il nuovo giocatore diventa host
    if (!hasRealPlayers || hostDisconnected) {
      room.host = socket.id;
      console.log(`${playerName} è il nuovo host della stanza ${roomCode} (${hostDisconnected ? 'host precedente disconnesso' : 'nessun altro giocatore presente'})`);
    }

    this.playerRooms.set(socket.id, roomCode);
    room.playerNames[socket.id] = playerName;

    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, playerName });

    this.broadcastRoomState(roomCode);
    this.broadcastActiveRooms();

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

      if (room.bots[position]) {
        // Aggiungi il bot con nome personalizzato
        room.botCounter++;
        const botId = `bot-${position}`;
        const botName = `Bot ${room.botCounter}`;
        room.players[position] = botId;
        room.playerNames[botId] = botName;
      } else {
        // Rimuovi il bot
        room.players[position] = null;
      }

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
    this.broadcastActiveRooms();

    this.initializeGame(room);

    console.log(`Partita iniziata nella stanza ${roomCode}`);
  }

  initializeGame(room, isNewHand = false) {
  const hands = this.deck.deal();

  // Reset stato bot per nuova mano
  this.botPlayer.resetForNewHand();

  // Determina il dealer
  let dealer, firstPlayer;
  if (!isNewHand || !room.game) {
    // Prima mano della partita
    dealer = 'west';
    firstPlayer = 'north';
  } else {
    // Mano successiva - ruota il dealer
    const currentDealerIndex = this.dealerRotation.indexOf(room.game.dealer);
    const nextDealerIndex = (currentDealerIndex + 1) % 4;
    dealer = this.dealerRotation[nextDealerIndex];
    // Il primo giocatore è quello dopo il dealer
    firstPlayer = this.dealerRotation[(nextDealerIndex + 1) % 4];
  }

room.game = {
  hands: hands,
  initialHands: JSON.parse(JSON.stringify(hands)), // Salva copia delle carte iniziali
  currentPlayer: firstPlayer,
  firstPlayer: firstPlayer, // Primo giocatore della mano (per asta)
  dealer: dealer,
  biddingPhase: true,
  bids: [],
  contract: null,
  trump: null,
  currentTrick: {},
  tricks: [],
  score: { northSouth: 0, eastWest: 0 },
  beloteRebelote: null,
  lastTrick: null,
  trickConfirmations: null,
  waitingForConfirmation: false,
  isLastTrick: false,
  trickDisplaying: false,
  contro: false,
  surcontre: false,
  gameOver: false,
  winner: null
};

  // Ordina le carte DOPO aver inizializzato room.game
  this.sortHands(hands, null);

  // Log inizio partita con tutte le carte
  this.logGameStart(room, hands, dealer, firstPlayer);

  this.broadcastGameState(room.code);

  if (this.isBot(room, firstPlayer)) {
    setTimeout(() => this.botBid(room, firstPlayer), 1000);
  }
}

  placeBid(socket, roomCode, bid, botPosition = null) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'playing' || !room.game.biddingPhase) return;

    // Se è un bot, usa la posizione passata, altrimenti trova la posizione del giocatore
    const position = botPosition || this.getPlayerPosition(room, socket.id);
    if (!position || room.game.currentPlayer !== position) return;

    if (!this.isValidBid(room.game, bid, position)) {
      if (socket && socket.emit) {
        socket.emit('error', { message: 'Puntata non valida' });
      }
      return;
    }

    room.game.bids.push({ player: position, bid });

    // Gestisci contro e surcontre
    if (bid.type === 'contro') {
      room.game.contro = true;
    } else if (bid.type === 'surcontre') {
      room.game.surcontre = true;

      // Dopo un surcontro, l'asta si chiude immediatamente
      const lastBid = [...room.game.bids].reverse().find(b => b.bid.type === 'bid' || b.bid.type === 'cappotto');
      room.game.contract = lastBid;

      if (lastBid.bid.type === 'cappotto') {
        const declarerHand = room.game.hands[lastBid.player];
        room.game.trump = declarerHand[0].suit;
      } else {
        room.game.trump = lastBid.bid.suit;
      }

      room.game.biddingPhase = false;
      room.game.currentPlayer = this.gameLogic.getNextPlayer(room.game.dealer);

      this.broadcastGameState(room.code);

      if (this.isBot(room, room.game.currentPlayer)) {
        setTimeout(() => this.botPlay(room, room.game.currentPlayer), 1000);
      }
      return;
    } else if (bid.type === 'bid' || bid.type === 'cappotto') {
      // Se qualcuno fa una nuova offerta dopo un contro, resettiamo contro e surcontre
      room.game.contro = false;
      room.game.surcontre = false;
    }

    if (bid.type === 'pass') {
  // Conta i pass consecutivi
  let consecutivePasses = 0;
  let lastBidExists = false;

  for (let i = room.game.bids.length - 1; i >= 0; i--) {
    if (room.game.bids[i].bid.type === 'pass') {
      consecutivePasses++;
    } else if (room.game.bids[i].bid.type === 'bid' || room.game.bids[i].bid.type === 'cappotto') {
      lastBidExists = true;
      break;
    }
  }

  // Se ci sono 3 pass consecutivi dopo una puntata, l'asta è chiusa
  if (lastBidExists && consecutivePasses === 3) {
    const lastBid = [...room.game.bids].reverse().find(b => b.bid.type === 'bid' || b.bid.type === 'cappotto');
    room.game.contract = lastBid;

    // Per il cappotto, scegliamo un seme di trump casuale (potrebbe essere il primo seme della mano del dichiarante)
    if (lastBid.bid.type === 'cappotto') {
      const declarerHand = room.game.hands[lastBid.player];
      room.game.trump = declarerHand[0].suit; // Usa il seme della prima carta
    } else {
      room.game.trump = lastBid.bid.suit;
    }

    room.game.biddingPhase = false;
    room.game.currentPlayer = this.gameLogic.getNextPlayer(room.game.dealer);

    this.broadcastGameState(room.code);

    if (this.isBot(room, room.game.currentPlayer)) {
      setTimeout(() => this.botPlay(room, room.game.currentPlayer), 1000);
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

  isValidBid(game, bid, position) {
  // Passo è sempre valido
  if (bid.type === 'pass') {
    return true;
  }

  // Se è cappotto
  if (bid.type === 'cappotto') {
    // Cappotto può essere dichiarato solo se nessuno ha ancora fatto offerte
    const hasPreviousBid = game.bids.some(b => b.bid.type === 'bid' || b.bid.type === 'cappotto');
    return !hasPreviousBid;
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
    const lastBid = [...game.bids].reverse().find(b => b.bid.type === 'bid' || b.bid.type === 'cappotto');

    // Se c'è già una puntata, la nuova deve essere superiore di almeno 10 punti
    if (lastBid && bid.points <= lastBid.bid.points) {
      return false;
    }

    return true;
  }

  // Se è contro
  if (bid.type === 'contro') {
    // Deve esserci una puntata attiva
    const lastBid = [...game.bids].reverse().find(b => b.bid.type === 'bid');
    if (!lastBid) return false;

    // Non deve esserci già un contro
    if (game.contro) return false;

    // Deve essere della squadra avversaria
    const bidderTeam = (lastBid.player === 'north' || lastBid.player === 'south') ? 'NS' : 'EW';
    const playerTeam = (position === 'north' || position === 'south') ? 'NS' : 'EW';
    if (bidderTeam === playerTeam) return false;

    return true;
  }

  // Se è surcontre
  if (bid.type === 'surcontre') {
    // Deve esserci un contro attivo
    if (!game.contro) return false;

    // Non deve esserci già un surcontre
    if (game.surcontre) return false;

    // Trova l'ultima puntata (non pass, non contro, non surcontre)
    const lastBid = [...game.bids].reverse().find(b => b.bid.type === 'bid');
    if (!lastBid) return false;

    // Deve essere della squadra che ha fatto l'offerta originale
    const bidderTeam = (lastBid.player === 'north' || lastBid.player === 'south') ? 'NS' : 'EW';
    const playerTeam = (position === 'north' || position === 'south') ? 'NS' : 'EW';
    if (bidderTeam !== playerTeam) return false;

    return true;
  }

  // Se non è né pass né bid né contro né surcontre, non è valido
  return false;
}

playCard(socket, roomCode, card, botPosition = null) {
  const room = this.rooms.get(roomCode);
  if (!room || room.state !== 'playing' || room.game.biddingPhase) return;

  // Blocca le giocate durante la visualizzazione del trick
  if (room.game.trickDisplaying) return;

  const position = botPosition || this.getPlayerPosition(room, socket.id);
  if (!position || room.game.currentPlayer !== position) return;

    const hand = room.game.hands[position];
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);

    console.log(`playCard: ${position} gioca ${card.rank} di ${card.suit}, carte rimanenti: ${hand.length}`);

    if (cardIndex === -1) {
      console.log(`ERRORE: Carta non trovata in mano! ${position} cercava ${card.rank} di ${card.suit}`);
      return;
    }

    if (!this.gameLogic.isValidPlay(card, hand, room.game.currentTrick, room.game.trump, position)) {
      socket.emit('error', { message: 'Carta non valida' });
      return;
    }

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

    // Fumetto per Belote/Rebelote (priorità massima)
    if (isBelote || isRebelote) {
      room.game.lastSpeechBubble = {
        position,
        message: isBelote ? 'Belote!' : 'Rebelote!',
        timestamp: Date.now(),
        isJackOfTrump: false,
        isNineOfTrump: false,
        isBelote,
        isRebelote
      };
    } else {
      // Genera fumetto normale (60% probabilità)
      const speechBubble = this.generateSpeechBubble(card, room.game.currentTrick, room.game.trump);
      if (speechBubble) {
        const isJackOfTrump = card.rank === 'J' && card.suit === room.game.trump;
        const isNineOfTrump = card.rank === '9' && card.suit === room.game.trump;
        room.game.lastSpeechBubble = {
          position,
          message: speechBubble,
          timestamp: Date.now(),
          isJackOfTrump,
          isNineOfTrump
        };
      }
    }

    console.log(`Dopo rimozione: ${position} ha ${hand.length} carte rimanenti`);
    console.log(`Trick corrente ha ${Object.keys(room.game.currentTrick).length} carte`);

    if (Object.keys(room.game.currentTrick).length === 4) {
  console.log('Trick completo, chiamando completeTrick');
  this.completeTrick(room);
} else {
  room.game.currentPlayer = this.gameLogic.getNextPlayer(room.game.currentPlayer);
  this.broadcastGameState(room.code);

  // Se il prossimo è un bot
  if (this.isBot(room, room.game.currentPlayer)) {
    setTimeout(() => this.botPlay(room, room.game.currentPlayer), 2000);  // <-- CAMBIATO
  }
}
  }

completeTrick(room) {
  console.log('=== COMPLETE TRICK CHIAMATO ===');
  console.log('Trick corrente:', room.game.currentTrick);

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

  // Controlla se è l'ultimo trick (mani vuote)
  const handsEmpty = Object.values(room.game.hands).every(hand => hand.length === 0);
  console.log('Mani vuote?', handsEmpty);
  console.log('Carte rimanenti per posizione:', {
    north: room.game.hands.north.length,
    east: room.game.hands.east.length,
    south: room.game.hands.south.length,
    west: room.game.hands.west.length
  });

  // Blocca le giocate durante la visualizzazione del trick
  room.game.trickDisplaying = true;

  // Mostra il trick completo per 3 secondi
  this.broadcastGameState(room.code);

  // Dopo 3 secondi, passa al prossimo trick o termina la mano
  setTimeout(() => {
    // Sblocca le giocate e resetta il trick
    room.game.trickDisplaying = false;
    room.game.currentTrick = {};
    room.game.currentPlayer = winner;

    if (handsEmpty) {
      this.endHand(room);
    } else {
      this.broadcastGameState(room.code);

      // Se il vincitore è un bot, fallo giocare
      if (this.isBot(room, room.game.currentPlayer)) {
        setTimeout(() => this.botPlay(room, room.game.currentPlayer), 1000);
      }
    }
  }, 3000);

  console.log('=== FINE COMPLETE TRICK ===');
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
    const isCappotto = room.game.contract.bid.type === 'cappotto';
    const contractPoints = room.game.contract.bid.points;
    const teamScore = room.game.score[contractTeam];

    // Calcola il moltiplicatore
    let multiplier = 1;
    if (room.game.surcontre) {
      multiplier = 4;
    } else if (room.game.contro) {
      multiplier = 2;
    }

    let finalScore = { northSouth: 0, eastWest: 0 };

    // Gestione cappotto
    if (isCappotto) {
      const otherTeam = contractTeam === 'northSouth' ? 'eastWest' : 'northSouth';
      const madeAllTricks = room.game.tricks.every(trick => {
        const winner = trick.winner;
        const winnerTeam = (winner === 'north' || winner === 'south') ? 'northSouth' : 'eastWest';
        return winnerTeam === contractTeam;
      });

      if (madeAllTricks) {
        // Cappotto riuscito: 250 punti alla squadra che ha dichiarato
        finalScore[contractTeam] = 250 * multiplier;
        finalScore[otherTeam] = 0;
      } else {
        // Cappotto fallito: 250 punti alla squadra avversaria
        finalScore[otherTeam] = 250 * multiplier;
        finalScore[contractTeam] = 0;
      }
    } else {
      // Contratto normale
      if (teamScore >= contractPoints) {
        finalScore[contractTeam] = room.game.score[contractTeam] * multiplier;
        const otherTeam = contractTeam === 'northSouth' ? 'eastWest' : 'northSouth';
        finalScore[otherTeam] = room.game.score[otherTeam] * multiplier;
      } else {
        const otherTeam = contractTeam === 'northSouth' ? 'eastWest' : 'northSouth';
        finalScore[otherTeam] = 162 * multiplier;
        if (room.game.beloteRebelote && room.game.beloteRebelote.announced) {
          const beloteTeam = room.game.beloteRebelote.player === 'north' || room.game.beloteRebelote.player === 'south'
            ? 'northSouth' : 'eastWest';
          if (beloteTeam !== contractTeam) {
            finalScore[beloteTeam] += 20 * multiplier;
          }
        }
      }
    }

    room.game.finalScore = finalScore;
    room.game.handComplete = true;

    // Aggiungi i punti della mano al punteggio totale della partita
    room.gameScore.northSouth += finalScore.northSouth;
    room.gameScore.eastWest += finalScore.eastWest;

    // Salva lo storico della mano
    room.handHistory.push({
      handNumber: room.handHistory.length + 1,
      contract: room.game.contract,
      finalScore: finalScore,
      winner: finalScore.northSouth > finalScore.eastWest ? 'northSouth' : 'eastWest',
      gameScore: { ...room.gameScore },
      initialHands: room.game.initialHands // Salva le carte iniziali nello storico
    });

    // Controlla se qualcuno ha raggiunto il punteggio target
    const targetScore = room.targetScore || 501;
    if (room.gameScore.northSouth >= targetScore || room.gameScore.eastWest >= targetScore) {
      room.game.gameOver = true;
      room.game.winner = room.gameScore.northSouth >= targetScore ? 'northSouth' : 'eastWest';

      // Salva la partita completata nel database
      this.saveGameToDatabase(room);
    }

    this.broadcastGameState(room.code);
  }

  nextHand(socket, roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'playing') return;

    // Verifica che il gioco non sia finito
    if (room.game.gameOver) {
      socket.emit('error', { message: 'La partita è terminata' });
      return;
    }

    // Inizializza una nuova mano con rotazione del dealer
    this.initializeGame(room, true);
  }

 botBid(room, position) {
  console.log(`botBid chiamato per posizione: ${position}`);

  if (!this.isBot(room, position)) {
    console.log(`${position} non è un bot!`);
    return;
  }

  const hand = room.game.hands[position];
  const currentBid = [...room.game.bids].reverse().find(b => b.bid.type === 'bid');
  const allBids = room.game.bids; // Passa tutte le puntate per analisi

  console.log(`Bot ${position} sta facendo bid...`);
  const bid = this.botPlayer.makeBid(hand, currentBid, position, allBids, room.game);
  console.log(`Bot ${position} ha scelto:`, bid);

  this.placeBid({ id: 'bot' }, room.code, bid, position);
 }

  botPlay(room, position) {
    if (!this.isBot(room, position)) return;

    const hand = room.game.hands[position];

    // Scegli il bot in base alla configurazione della room
    const bot = room.advancedBotAI ? this.advancedBotPlayer : this.botPlayer;

    // Prepara gameState per AdvancedBotPlayer (serve per Monte Carlo)
    const gameState = {
      currentTrick: room.game.currentTrick,
      completedTricks: room.game.completedTricks || []
    };

    const card = bot.playCard(hand, room.game.currentTrick, room.game.trump, position, room.game.contract, gameState);

     this.playCard({ id: 'bot' }, room.code, card, position);
  }

  isBot(room, position) {
    return room.bots[position] || (room.players[position] && room.players[position].startsWith('bot-'));
  }

  generateSpeechBubble(card, currentTrick, trump) {
    const isTrump = card.suit === trump;
    const isJackOfTrump = card.rank === 'J' && isTrump;
    const isNineOfTrump = card.rank === '9' && isTrump;

    // Mostra sempre il fumetto per Jack e 9 di atout
    // Altrimenti 60% probabilità di mostrare un fumetto
    if (!isJackOfTrump && !isNineOfTrump && Math.random() > 0.6) return null;

    const leadCard = currentTrick[Object.keys(currentTrick)[0]];
    const isFirstCard = Object.keys(currentTrick).length === 0;
    const leadSuit = leadCard ? leadCard.suit : null;
    const isGoodCard = ['A', 'J', '10', 'K'].includes(card.rank);

    const messages = [];

    // Taglio (gioco atout quando il seme di apertura è diverso)
    if (isTrump && leadSuit && leadSuit !== trump) {
      messages.push('Taglio!', 'Atout!', 'Tajo!', 'Arilla!', 'Rille!');
    }

    // Prima carta di picche
    if (isFirstCard && card.suit === 'spades') {
      messages.push('Picche nere!', 'Picche!');
    }

    // Prima carta di cuori
    if (isFirstCard && card.suit === 'hearts') {
      messages.push('Cuppe!', 'Cuori!');
    }

    // Prima carta di quadri
    if (isFirstCard && card.suit === 'diamonds') {
      messages.push('Quadri!', 'Carréa!');
    }

    // Prima carta di fiori
    if (isFirstCard && card.suit === 'clubs') {
      messages.push('Fiori!', 'Baštùn!');
    }

    // Gioca un 10
    if (card.rank === '10') {
      messages.push('Maniglia!', 'Dièsc!', 'Arilla!', 'Rilliamo!', 'Rille!', 'Aaaaaah!', 'A bagno!');
    }

    // Gioca un Asso
    if (card.rank === 'A') {
      messages.push('Asso!', 'Às!', 'Bibbaaa!', 'Babbaaa!', 'Bibaaa!', 'Eh bibi bibi!', 'Aaaaaah!', 'A bagno!');
    }

    // Gioca il Jack di atout
    if (card.rank === 'J' && isTrump) {
      messages.push('Jack!', 'Valet!', 'Rillina!', 'Trillina!', 'Arilla!', 'Rille!', 'Aaaaaah!', 'Bibaaa!', 'A bagno!');
    }

    // Gioca il 9 di atout
    if (card.rank === '9' && isTrump) {
      messages.push('Neu d\'atout!', 'Nove!', 'Rillina!', 'Trillina!', 'Arilla!', 'Rille!', 'Aaaaaah!');
    }

    // Gioca un Re (buona carta)
    if (card.rank === 'K' && isGoodCard) {
      messages.push('Re!', 'Arilla!', 'Rille!', 'Aaaaaah!');
    }

    // Gioca picche (oltre prima carta)
    if (!isFirstCard && card.suit === 'spades' && isGoodCard) {
      messages.push('Picche nere!');
    }

    // Gioca cuori (oltre prima carta)
    if (!isFirstCard && card.suit === 'hearts' && isGoodCard) {
      messages.push('Cuppe!');
    }

    // Esclamazioni generiche (più rare)
    if (Math.random() > 0.7) {
      messages.push('Bon!', 'Ecco!', 'Via!', 'Andiamo!', 'Dai!');
    }

    return messages.length > 0 ? messages[Math.floor(Math.random() * messages.length)] : null;
  }

  getPlayerPosition(room, socketId) {
    for (let pos in room.players) {
      if (room.players[pos] === socketId) {
        return pos;
      }
    }
    return null;
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

    // Cerca il giocatore disconnesso
    let reconnectedPosition = null;
    for (let pos in room.players) {
      const disconnectKey = `${roomCode}-${pos}`;
      const disconnectedData = this.disconnectedPlayers.get(disconnectKey);

      if (disconnectedData && disconnectedData.playerName === playerName) {
        reconnectedPosition = pos;

        // Cancella il timeout
        clearTimeout(disconnectedData.timeout);
        this.disconnectedPlayers.delete(disconnectKey);

        // Ripristina il giocatore
        room.bots[pos] = false;
        room.disconnectedStatus[pos] = false;

        // Se era l'host, ripristina lo stato di host
        if (disconnectedData.wasHost) {
          room.host = socket.id;
        }

        room.players[pos] = socket.id;
        room.playerNames[socket.id] = playerName;
        this.playerRooms.set(socket.id, roomCode);

        socket.join(roomCode);

        console.log(`${playerName} riconnesso come ${pos} nella stanza ${roomCode}${disconnectedData.wasHost ? ' (host ripristinato)' : ''}`);

        socket.emit('reconnected', { roomCode, position: pos });
        this.broadcastGameState(roomCode);

        return;
      }
    }

    socket.emit('error', { message: 'Nessuna partita in attesa di riconnessione trovata' });
  }

  handleDisconnect(socket) {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;

    const room = this.rooms.get(roomCode);
    if (!room) return;

    const position = this.getPlayerPosition(room, socket.id);

    if (position) {
      if (room.state === 'playing') {
        // Salva i dati del giocatore disconnesso
        const disconnectKey = `${roomCode}-${position}`;
        const playerName = room.playerNames[socket.id];

        console.log(`Giocatore ${position} (${playerName}) disconnesso dalla stanza ${roomCode}. Attesa riconnessione...`);

        // Imposta timeout per convertire in bot dopo 60 secondi
        const timeout = setTimeout(() => {
          console.log(`Timeout scaduto. ${position} convertito in bot nella stanza ${roomCode}`);

          room.bots[position] = true;
          room.disconnectedStatus[position] = false;
          room.botCounter++;
          const botName = `Bot ${room.botCounter}`;
          room.players[position] = `bot-${position}`;
          room.playerNames[`bot-${position}`] = botName;

          this.disconnectedPlayers.delete(disconnectKey);
          this.broadcastGameState(roomCode);

          // Se è il turno del giocatore disconnesso, fallo giocare come bot
          if (room.game && room.game.currentPlayer === position) {
            if (room.game.biddingPhase) {
              setTimeout(() => this.botBid(room, position), 1000);
            } else {
              setTimeout(() => this.botPlay(room, position), 1000);
            }
          }
        }, this.reconnectionTimeout);

        this.disconnectedPlayers.set(disconnectKey, {
          playerName,
          oldSocketId: socket.id,
          wasHost: room.host === socket.id,
          timeout
        });

        // Marca come disconnesso (non come bot permanente)
        room.disconnectedStatus[position] = true;
        room.bots[position] = true;  // Temporaneamente per far giocare l'AI
        room.players[position] = `bot-${position}`;
        // Mantieni il nome originale invece di sovrascriverlo
        room.playerNames[`bot-${position}`] = playerName;

        this.broadcastGameState(roomCode);

        // Se è il turno del giocatore, continua con il bot
        if (room.game.currentPlayer === position) {
          if (room.game.biddingPhase) {
            setTimeout(() => this.botBid(room, position), 1000);
          } else {
            setTimeout(() => this.botPlay(room, position), 1000);
          }
        }
      } else {
        // In waiting room
        const wasHost = room.host === socket.id;
        room.players[position] = null;

        // Se era l'host, assegna l'host al primo giocatore disponibile
        if (wasHost) {
          const newHost = Object.values(room.players).find(player => player !== null && !player.startsWith('bot-'));
          if (newHost) {
            room.host = newHost;
            const newHostName = room.playerNames[newHost] || 'Giocatore';
            console.log(`${newHostName} è il nuovo host della stanza ${roomCode}`);
          }
        }

        this.broadcastRoomState(roomCode);
        this.broadcastActiveRooms();
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
      state: room.state,
      targetScore: room.targetScore || 501,
      advancedBotAI: room.advancedBotAI || false
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

    // Crea una mappa con i nomi dei giocatori per ogni posizione
    const playerNames = {};
    for (let pos in room.players) {
      const socketId = room.players[pos];
      if (socketId) {
        if (room.disconnectedStatus[pos]) {
          // Mostra il nome originale con "(Disconnesso...)"
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
        currentPlayer: room.game.currentPlayer,
        firstPlayer: room.game.firstPlayer,
        dealer: room.game.dealer,
        biddingPhase: room.game.biddingPhase,
        bids: room.game.bids,
        contract: room.game.contract,
        trump: room.game.trump,
        currentTrick: room.game.currentTrick,
        score: room.game.score,
        lastTrick: room.game.lastTrick,
        beloteRebelote: room.game.beloteRebelote,
        handComplete: room.game.handComplete,
        finalScore: room.game.finalScore,
        waitingForConfirmation: room.game.waitingForConfirmation,
        trickConfirmations: room.game.trickConfirmations,
        isLastTrick: room.game.isLastTrick,
        trickDisplaying: room.game.trickDisplaying,
        playerNames: playerNames,
        contro: room.game.contro,
        surcontre: room.game.surcontre,
        gameScore: room.gameScore,
        handHistory: room.handHistory,
        gameOver: room.game.gameOver,
        winner: room.game.winner,
        lastSpeechBubble: room.game.lastSpeechBubble,
        initialHands: room.game.initialHands // Invia carte iniziali per visualizzazione fine mano
      };

      this.io.to(socketId).emit('gameState', gameState);
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
    this.io.emit('activeRoomsList', activeRooms);
  }

  deleteRoom(socket, roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    // Controlla se il richiedente è l'host
    if (socket.id !== room.host) {
      socket.emit('error', { message: 'Solo l\'host può cancellare il tavolo' });
      return;
    }

    // Controlla se la partita non è già iniziata
    if (room.state !== 'waiting') {
      socket.emit('error', { message: 'Non puoi cancellare il tavolo durante una partita' });
      return;
    }

    console.log(`Stanza ${roomCode} cancellata dall'host`);

    // Rimuovi tutti i giocatori dalla stanza
    for (let pos in room.players) {
      const playerId = room.players[pos];
      if (playerId && !playerId.startsWith('bot-')) {
        this.playerRooms.delete(playerId);
      }
    }

    // Elimina la stanza
    this.rooms.delete(roomCode);

    // Notifica tutti i client nella stanza
    this.io.to(roomCode).emit('roomDeleted', { message: 'Il tavolo è stato cancellato dall\'host' });

    // Aggiorna la lista delle stanze attive
    this.broadcastActiveRooms();
  }

  // Helper: Log inizio partita con tutte le carte
  logGameStart(room, hands, dealer, firstPlayer) {
    console.log('\n' + '='.repeat(80));
    console.log('NUOVA MANO - Stanza:', room.code);
    console.log('Dealer:', dealer.toUpperCase(), '| Primo a giocare:', firstPlayer.toUpperCase());
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

      // Formatta le carte per seme
      const cardsBySuit = {
        'hearts': [],
        'diamonds': [],
        'clubs': [],
        'spades': []
      };

      hand.forEach(card => {
        cardsBySuit[card.suit].push(card.rank);
      });

      // Costruisci stringa delle carte
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

  setTargetScore(socket, roomCode, targetScore) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Stanza non trovata' });
      return;
    }

    // Solo l'host può cambiare il target score
    if (room.host !== socket.id) {
      socket.emit('error', { message: 'Solo l\'host può cambiare il punteggio target' });
      return;
    }

    // Valida il target score
    if (![301, 501, 701].includes(targetScore)) {
      socket.emit('error', { message: 'Punteggio target non valido' });
      return;
    }

    room.targetScore = targetScore;
    console.log(`Target score impostato a ${targetScore} per la stanza ${roomCode}`);

    this.broadcastRoomState(roomCode);
  }

  setAdvancedBotAI(socket, roomCode, enabled) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Stanza non trovata' });
      return;
    }

    // Solo l'host può cambiare l'AI dei bot
    if (room.host !== socket.id) {
      socket.emit('error', { message: 'Solo l\'host può cambiare l\'AI dei bot' });
      return;
    }

    room.advancedBotAI = enabled;
    console.log(`Advanced Bot AI ${enabled ? 'abilitata' : 'disabilitata'} per la stanza ${roomCode}`);

    this.broadcastRoomState(roomCode);
  }

  saveGameToDatabase(room) {
    try {
      // Prepara i dati dei giocatori
      const players = ['north', 'east', 'south', 'west'].map(pos => ({
        position: pos,
        name: room.players[pos]?.name || 'Bot',
        isBot: room.bots[pos]
      }));

      // Prepara gli IP dei giocatori
      const playerIps = ['north', 'east', 'south', 'west'].map(pos => {
        return room.players[pos]?.ip || 'bot';
      });

      saveGame(
        room.code,
        players,
        playerIps,
        room.game.winner,
        room.gameScore,
        room.game.handHistory.length,
        room.targetScore || 501
      );

      console.log(`✅ Partita ${room.code} salvata nel database`);
    } catch (error) {
      console.error('❌ Errore nel salvare la partita nel database:', error);
    }
  }
}

module.exports = RoomManager;