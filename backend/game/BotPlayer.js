class BotPlayer {
  constructor(gameLogic) {
    this.gameLogic = gameLogic;
    this.hasRaisedOnPartner = false; // Traccia se ha già supportato il partner
  }

  // Reset stato per nuova mano
  resetForNewHand() {
    this.hasRaisedOnPartner = false;
  }

  makeBid(hand, currentBid, position, allBids = []) {
    this.position = position;

    // Trova il seme migliore
    const bestSuit = this.findBestSuit(hand);

    // Calcola stima punti per il seme migliore
    const estimate = this.estimatePoints(hand, bestSuit);

    // Estrai informazioni dalle puntate precedenti
    const partnerBid = this.getPartnerBid(allBids, position);
    const opponentsBid = this.getOpponentsBid(allBids, position);
    const lastBid = currentBid;

    // CASO 1: Partner ha già puntato
    if (partnerBid && partnerBid.bid.type === 'bid') {
      return this.handlePartnerBid(hand, partnerBid, opponentsBid, lastBid);
    }

    // CASO 2: Avversari hanno puntato
    if (opponentsBid && opponentsBid.bid.type === 'bid') {
      return this.handleOpponentBid(hand, opponentsBid, estimate, bestSuit);
    }

    // CASO 3: Nessuno ha ancora puntato (o solo passi)
    return this.handleOpeningBid(estimate, bestSuit);
  }

  // CASO 1: Gestione puntata partner
  handlePartnerBid(hand, partnerBid, opponentsBid, lastBid) {
    const partnerSuit = partnerBid.bid.suit;
    const partnerPoints = partnerBid.bid.points;

    // CASO 1A: Supporto partner (solo prima volta e se nessun avversario ha rilanciato)
    if (!this.hasRaisedOnPartner && (!opponentsBid || opponentsBid.bid.type !== 'bid')) {
      const hasJackOrNine = hand.some(c =>
        c.suit === partnerSuit && (c.rank === 'J' || c.rank === '9')
      );
      const hasAceOutside = hand.some(c =>
        c.suit !== partnerSuit && c.rank === 'A'
      );

      if (hasJackOrNine || hasAceOutside) {
        const newPoints = partnerPoints + 10;
        if (newPoints <= 160) {
          this.hasRaisedOnPartner = true;
          return {
            type: 'bid',
            suit: partnerSuit,
            points: newPoints
          };
        }
      }
    }

    // CASO 1B: Avversari hanno rilanciato su partner
    if (opponentsBid && opponentsBid.bid.type === 'bid') {
      const defensiveStrength = this.evaluateDefense(hand, opponentsBid.bid.suit);
      if (defensiveStrength >= 40) {
        return { type: 'contro' };
      }
    }

    // Altrimenti passa
    return { type: 'pass' };
  }

  // CASO 2: Gestione puntata avversari
  handleOpponentBid(hand, opponentsBid, estimate, bestSuit) {
    const opponentPoints = opponentsBid.bid.points;
    const opponentSuit = opponentsBid.bid.suit;

    // Se ho mano eccezionale, rilancio
    if (estimate >= 110) {
      const newPoints = opponentPoints + 10;
      if (newPoints <= 160) {
        return {
          type: 'bid',
          suit: bestSuit,
          points: newPoints
        };
      }
    }

    // Se ho mano difensiva forte, faccio contro
    const defensiveStrength = this.evaluateDefense(hand, opponentSuit);
    if (defensiveStrength >= 40) {
      return { type: 'contro' };
    }

    // Altrimenti passo
    return { type: 'pass' };
  }

  // CASO 3: Apertura (nessuno ha puntato)
  handleOpeningBid(estimate, bestSuit) {
    if (estimate >= 90) {
      return { type: 'bid', suit: bestSuit, points: 100 };
    }
    if (estimate >= 75) {
      return { type: 'bid', suit: bestSuit, points: 90 };
    }
    if (estimate >= 60) {
      return { type: 'bid', suit: bestSuit, points: 80 };
    }

    return { type: 'pass' };
  }

  // Stima punti totali per un seme come trump
  estimatePoints(hand, trumpSuit) {
    const trumpValues = {
      'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3, '8': 0, '7': 0
    };
    const normalValues = {
      'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0
    };

    let trumpPoints = 0;
    let acesOutside = 0;
    let tensOutside = 0;
    let trumpCount = 0;

    hand.forEach(card => {
      if (card.suit === trumpSuit) {
        trumpPoints += trumpValues[card.rank] || 0;
        trumpCount++;
      } else {
        if (card.rank === 'A') acesOutside += 15;
        if (card.rank === '10') tensOutside += 10;
      }
    });

    // Bonus difesa: più trump = più controllo
    const defenseBonus = trumpCount * 5;

    return trumpPoints + acesOutside + tensOutside + defenseBonus;
  }

  // Valuta forza difensiva contro un trump avversario
  evaluateDefense(hand, opponentTrump) {
    let trumpHonors = 0;
    let aces = 0;

    hand.forEach(card => {
      if (card.suit === opponentTrump) {
        if (card.rank === 'J') trumpHonors += 20;
        if (card.rank === '9') trumpHonors += 14;
        if (card.rank === 'A') trumpHonors += 11;
      } else {
        if (card.rank === 'A') aces += 15;
      }
    });

    return trumpHonors + aces;
  }

  // Trova il seme migliore da puntare
  findBestSuit(hand) {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    let bestSuit = suits[0];
    let bestScore = 0;

    suits.forEach(suit => {
      const score = this.estimatePoints(hand, suit);
      if (score > bestScore) {
        bestScore = score;
        bestSuit = suit;
      }
    });

    return bestSuit;
  }

  // Trova la puntata del partner
  getPartnerBid(allBids, position) {
    const partnerPos = this.getPartnerPosition(position);

    // Cerca l'ultima puntata del partner (esclusi i pass)
    for (let i = allBids.length - 1; i >= 0; i--) {
      if (allBids[i].player === partnerPos && allBids[i].bid.type === 'bid') {
        return allBids[i];
      }
    }

    return null;
  }

  // Trova l'ultima puntata degli avversari
  getOpponentsBid(allBids, position) {
    const partnerPos = this.getPartnerPosition(position);

    // Cerca l'ultima puntata di un avversario
    for (let i = allBids.length - 1; i >= 0; i--) {
      const bidder = allBids[i].player;
      if (bidder !== position && bidder !== partnerPos && allBids[i].bid.type === 'bid') {
        return allBids[i];
      }
    }

    return null;
  }

  // Ottieni posizione del partner
  getPartnerPosition(position) {
    const partners = {
      'north': 'south',
      'south': 'north',
      'east': 'west',
      'west': 'east'
    };
    return partners[position];
  }

  // Vecchio metodo per compatibilità
  analyzeSuitStrength(hand) {
    const deck = require('./Deck');
    const deckInstance = new deck();
    const strength = {};

    ['hearts', 'diamonds', 'clubs', 'spades'].forEach(suit => {
      strength[suit] = { score: 0, count: 0, cards: [] };
    });

    hand.forEach(card => {
      const suit = card.suit;
      const value = deckInstance.getCardValue(card, suit);

      strength[suit].score += value;
      strength[suit].count++;
      strength[suit].cards.push(card.rank);
    });

    return strength;
  }

  // Vecchio metodo per compatibilità
  isPartnerBidding(bidderPosition, botPosition) {
    return this.getPartnerPosition(botPosition) === bidderPosition;
  }

  playCard(hand, trick, trump, position) {
    // Trova tutte le carte valide
    const validCards = hand.filter(card =>
      this.gameLogic.isValidPlay(card, hand, trick, trump)
    );

    if (validCards.length === 0) {
      console.error('Bot non ha carte valide!', { hand, trick, trump });
      return hand[0]; // Fallback
    }

    // Gioca una carta casuale tra quelle valide
    const randomIndex = Math.floor(Math.random() * validCards.length);
    return validCards[randomIndex];
  }
}

module.exports = BotPlayer;
