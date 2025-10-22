class TariboBotPlayer {
  constructor(gameLogic) {
    this.gameLogic = gameLogic;
  }

  // Decide se prendere o passare nella presa
  makeBid(hand, biddingRound, faceUpCard, currentBids, position) {
    this.position = position;
    this.currentHand = hand;

    if (biddingRound === 1) {
      // Primo giro: valuta se prendere la carta scoperta
      return this.evaluateFirstRound(hand, faceUpCard);
    } else {
      // Secondo giro: valuta se dichiarare un altro seme o sans
      return this.evaluateSecondRound(hand, faceUpCard);
    }
  }

  evaluateFirstRound(hand, faceUpCard) {
    const trumpSuit = faceUpCard.suit;
    const trumpCards = hand.filter(c => c.suit === trumpSuit);

    // Conta le carte di trump e valuta la forza
    const hasJack = trumpCards.some(c => c.rank === 'J');
    const hasNine = trumpCards.some(c => c.rank === '9');
    const hasAce = trumpCards.some(c => c.rank === 'A');
    const hasTen = trumpCards.some(c => c.rank === '10');
    const trumpCount = trumpCards.length;

    // Valuta se prendere:
    // - Se ho J+9 o J+A, prendo quasi sempre
    // - Se ho almeno 3 trump con carte buone, prendo
    // - Se ho solo 1-2 trump deboli, passo

    if (hasJack && hasNine) {
      return { type: 'take' }; // J+9 è fortissimo
    }

    if (hasJack && trumpCount >= 2) {
      return { type: 'take' }; // J con supporto
    }

    if (trumpCount >= 4 && (hasNine || hasAce)) {
      return { type: 'take' }; // Molti trump con carta forte
    }

    if (trumpCount >= 3 && hasJack) {
      return { type: 'take' }; // 3+ trump con J
    }

    // Altrimenti passa
    return { type: 'pass' };
  }

  evaluateSecondRound(hand, faceUpCard) {
    // Trova il miglior seme alternativo
    const excludedSuit = faceUpCard.suit;
    const bestSuit = this.findBestSuitExcluding(hand, excludedSuit);

    if (!bestSuit) {
      return { type: 'pass' };
    }

    const estimate = this.estimatePoints(hand, bestSuit.suit);

    // Soglia più alta per il secondo giro (devo essere più forte)
    if (estimate >= 70 && bestSuit.count >= 3) {
      // Controlla se dichiarare sans atout
      const sansEstimate = this.estimateSansAtout(hand);
      if (sansEstimate >= 80) {
        return { type: 'take', suit: 'sans' };
      }

      return { type: 'take', suit: bestSuit.suit };
    }

    return { type: 'pass' };
  }

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

    const defenseBonus = trumpCount * 5;

    return trumpPoints + acesOutside + tensOutside + defenseBonus;
  }

  estimateSansAtout(hand) {
    const sansValues = {
      'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0
    };

    let points = 0;
    let acesCount = 0;

    hand.forEach(card => {
      points += sansValues[card.rank] || 0;
      if (card.rank === 'A') acesCount++;
    });

    // Bonus per assi (molto importanti in sans)
    points += acesCount * 10;

    return points;
  }

  findBestSuitExcluding(hand, excludedSuit) {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'].filter(s => s !== excludedSuit);
    let bestSuit = null;
    let bestScore = 0;

    suits.forEach(suit => {
      const suitCards = hand.filter(c => c.suit === suit);
      if (suitCards.length === 0) return;

      const score = this.estimatePoints(hand, suit);
      if (score > bestScore) {
        bestScore = score;
        bestSuit = { suit, count: suitCards.length, score };
      }
    });

    return bestSuit;
  }

  playCard(hand, trick, trump, position, contract) {
    // Trova tutte le carte valide
    const validCards = hand.filter(card =>
      this.gameLogic.isValidPlay(card, hand, trick, trump, position)
    );

    if (validCards.length === 0) {
      console.error('Bot non ha carte valide!', { hand, trick, trump });
      return hand[0]; // Fallback
    }

    if (validCards.length === 1) {
      return validCards[0];
    }

    // Strategia semplice: gioca carta random tra quelle valide
    // (può essere migliorata con logica più sofisticata)
    const isFirstCard = Object.keys(trick).length === 0;

    if (isFirstCard) {
      // Prima carta: preferisci carte alte
      const strongCards = validCards.filter(c => ['A', '10', 'K', 'J'].includes(c.rank));
      if (strongCards.length > 0) {
        return strongCards[Math.floor(Math.random() * strongCards.length)];
      }
    } else {
      // Cerca di vincere se possibile
      const currentWinner = this.gameLogic.determineWinner(trick, trump, this.getLeadSuit(trick));
      const partnerWinning = currentWinner && this.gameLogic.getPartner(position) === currentWinner;

      if (partnerWinning) {
        // Partner vince: gioca carta bassa
        const lowCards = validCards.filter(c => ['7', '8', '9'].includes(c.rank));
        if (lowCards.length > 0) {
          return lowCards[0];
        }
      } else {
        // Prova a vincere con carta forte
        const strongCards = validCards.filter(c => ['A', '10', 'J'].includes(c.rank));
        if (strongCards.length > 0) {
          return strongCards[0];
        }
      }
    }

    // Default: carta random
    return validCards[Math.floor(Math.random() * validCards.length)];
  }

  getLeadSuit(trick) {
    const firstPlayer = Object.keys(trick)[0];
    return firstPlayer ? trick[firstPlayer].suit : null;
  }
}

module.exports = TariboBotPlayer;
