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

    // IMPORTANTE: Se prendiamo, avremo anche la carta scoperta!
    // Aggiungiamo la carta scoperta alla valutazione
    const allTrumpCards = [...trumpCards, faceUpCard];

    // Conta le carte di trump e valuta la forza (INCLUDENDO la carta scoperta)
    const hasJack = allTrumpCards.some(c => c.rank === 'J');
    const hasNine = allTrumpCards.some(c => c.rank === '9');
    const hasAce = allTrumpCards.some(c => c.rank === 'A');
    const trumpCount = allTrumpCards.length;

    // Conta atout "alti" (A, 10, K, Q) includendo la carta scoperta
    const highTrumps = allTrumpCards.filter(c => ['A', '10', 'K', 'Q'].includes(c.rank));

    // REGOLA TARIBO: Prendi se (includendo la carta scoperta) avrai almeno 3 atout di cui:
    // - J + 2 atout alti (A, 10, K, Q)
    // - OPPURE 9 + A + un altro atout

    // Caso 1: J + almeno 2 atout alti
    if (hasJack && trumpCount >= 3 && highTrumps.length >= 2) {
      return { type: 'take' };
    }

    // Caso 2: 9 + A + almeno un altro atout
    if (hasNine && hasAce && trumpCount >= 3) {
      return { type: 'take' };
    }

    // Altrimenti passa
    return { type: 'pass' };
  }

  evaluateSecondRound(hand, faceUpCard) {
    // Trova il miglior seme alternativo (escludendo quello della carta scoperta)
    const excludedSuit = faceUpCard.suit;
    const bestSuit = this.findBestSuitExcluding(hand, excludedSuit);

    if (!bestSuit) {
      return { type: 'pass' };
    }

    // Usa stessa logica della Contrée per bid a 80:
    // (J O 9, ma non entrambi) + almeno 3 atout totali
    const suitCards = hand.filter(c => c.suit === bestSuit.suit);
    const hasJack = suitCards.some(c => c.rank === 'J');
    const hasNine = suitCards.some(c => c.rank === '9');
    const trumpCount = suitCards.length;

    // REGOLA SPECIALE: Se ha J+9 dello stesso seme, rischia con 50% di probabilità
    if (hasJack && hasNine && trumpCount >= 3) {
      const shouldRisk = Math.random() < 0.5;
      if (shouldRisk) {
        // Controlla se dichiarare sans atout
        const sansEstimate = this.estimateSansAtout(hand);
        if (sansEstimate >= 80) {
          return { type: 'sans' };
        }

        return { type: 'suit', suit: bestSuit.suit };
      }
      // Altrimenti passa (50% delle volte)
      return { type: 'pass' };
    }

    // Deve avere J oppure 9 (non entrambi) e almeno 3 atout
    if ((hasJack || hasNine) && trumpCount >= 3) {
      // Controlla se dichiarare sans atout
      const sansEstimate = this.estimateSansAtout(hand);
      if (sansEstimate >= 80) {
        return { type: 'sans' };
      }

      return { type: 'suit', suit: bestSuit.suit };
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
