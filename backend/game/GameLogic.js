const Deck = require('./Deck');

class GameLogic {
  constructor() {
    this.deck = new Deck();
  }

  determineWinner(trick, trump, leadSuit) {
  // Ottieni il primo giocatore e la sua carta
  const players = Object.keys(trick);
  if (players.length === 0) return null;
  
  let winningPlayer = players[0];
  let winningCard = trick[winningPlayer];

  // Confronta con le altre carte
  for (let i = 1; i < players.length; i++) {
    const player = players[i];
    const card = trick[player];
    
    // Trump batte sempre non-trump
    if (card.suit === trump && winningCard.suit !== trump) {
      winningCard = card;
      winningPlayer = player;
    }
    // Entrambi trump o entrambi dello stesso seme
    else if (card.suit === winningCard.suit) {
      if (this.deck.getCardOrder(card, trump) > this.deck.getCardOrder(winningCard, trump)) {
        winningCard = card;
        winningPlayer = player;
      }
    }
    // Se la carta vincente non è trump e la carta corrente è del seme di apertura
    else if (winningCard.suit !== trump && card.suit === leadSuit) {
      if (this.deck.getCardOrder(card, trump) > this.deck.getCardOrder(winningCard, trump)) {
        winningCard = card;
        winningPlayer = player;
      }
    }
  }

  return winningPlayer;
}

  calculateTrickPoints(trick, trump) {
    let points = 0;
    for (let player in trick) {
      points += this.deck.getCardValue(trick[player], trump);
    }
    return points;
  }

  isValidPlay(card, hand, trick, trump) {
    // Prima carta del trick
    if (Object.keys(trick).length === 0) {
      return true;
    }

    const leadCard = trick[Object.keys(trick)[0]];
    const leadSuit = leadCard.suit;

    // Devo seguire il seme se ce l'ho
    const hasSuit = hand.some(c => c.suit === leadSuit);
    if (hasSuit && card.suit !== leadSuit) {
      return false;
    }

    // Se non ho il seme
    if (!hasSuit) {
      const hasTrump = hand.some(c => c.suit === trump);
      const partnerWinning = this.isPartnerWinning(trick, trump, leadSuit);

      // Se ho atout e il partner non sta vincendo, devo giocare atout
      if (hasTrump && !partnerWinning && card.suit !== trump) {
        return false;
      }

      // Se gioco atout, devo surclassare se posso
      if (card.suit === trump) {
        const trumpsInTrick = Object.values(trick).filter(c => c.suit === trump);
        if (trumpsInTrick.length > 0) {
          const highestTrump = trumpsInTrick.reduce((max, c) => 
            this.deck.getCardOrder(c, trump) > this.deck.getCardOrder(max, trump) ? c : max
          );
          
          const canSurpass = hand.some(c => 
            c.suit === trump && 
            this.deck.getCardOrder(c, trump) > this.deck.getCardOrder(highestTrump, trump)
          );

          if (canSurpass && this.deck.getCardOrder(card, trump) <= this.deck.getCardOrder(highestTrump, trump)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  isPartnerWinning(trick, trump, leadSuit) {
    const players = Object.keys(trick);
    if (players.length === 0) return false;

    const currentPlayer = players[players.length - 1];
    const partner = this.getPartner(currentPlayer);

    if (!trick[partner]) return false;

    const winningPlayer = this.determineWinner(trick, trump, leadSuit);
    return winningPlayer === partner;
  }

  getPartner(position) {
    const partners = {
      north: 'south',
      south: 'north',
      east: 'west',
      west: 'east'
    };
    return partners[position];
  }

  getNextPlayer(currentPlayer) {
    const order = ['north', 'east', 'south', 'west'];
    const index = order.indexOf(currentPlayer);
    return order[(index + 1) % 4];
  }

  checkBeloteRebelote(card, hand, trump) {
    if (card.suit !== trump) return null;
    
    const isKing = card.rank === 'K';
    const isQueen = card.rank === 'Q';
    
    if (!isKing && !isQueen) return null;

    // Controlla se il giocatore ha entrambe K e Q di atout
    const hasKing = hand.some(c => c.suit === trump && c.rank === 'K') || (isKing && card.suit === trump);
    const hasQueen = hand.some(c => c.suit === trump && c.rank === 'Q') || (isQueen && card.suit === trump);

    if (hasKing && hasQueen) {
      return isKing ? 'belote' : 'rebelote';
    }

    return null;
  }
}

module.exports = GameLogic;