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

  playCard(hand, trick, trump, position, contract) {
    // Trova tutte le carte valide
    const validCards = hand.filter(card =>
      this.gameLogic.isValidPlay(card, hand, trick, trump)
    );

    if (validCards.length === 0) {
      console.error('Bot non ha carte valide!', { hand, trick, trump });
      return hand[0]; // Fallback
    }

    // Se c'è una sola carta valida, giocala
    if (validCards.length === 1) {
      return validCards[0];
    }

    // Determina se siamo la squadra che ha vinto il contratto
    const contractPlayer = contract ? contract.player : null;
    const isAttacking = this.isOnContractTeam(position, contractPlayer);

    // Situazione del trick
    const isFirstCard = Object.keys(trick).length === 0;
    const partnerWinning = this.gameLogic.isPartnerWinning(trick, trump, this.getLeadSuit(trick));
    const currentWinner = this.gameLogic.determineWinner(trick, trump, this.getLeadSuit(trick));
    const weAreWinning = currentWinner ? this.isOnSameTeam(position, currentWinner) : false;

    // STRATEGIA: Scegli la carta migliore basandoti sulla situazione
    if (isFirstCard) {
      return this.chooseOpeningCard(validCards, trump, isAttacking, hand);
    } else if (weAreWinning) {
      return this.chooseDefensiveCard(validCards, trump);
    } else {
      return this.chooseTakingCard(validCards, trick, trump, isAttacking);
    }
  }

  // Scelta carta di apertura
  chooseOpeningCard(validCards, trump, isAttacking, hand) {
    if (isAttacking) {
      const trumpCards = hand.filter(c => c.suit === trump);
      const trumpCount = trumpCards.length;

      // STRATEGIA ATOUT: Gioca 1-2 giri di atout se ne hai abbastanza
      // per ripulire le mani avversarie - MA SOLO SE PUOI PRENDERE SICURO
      if (trumpCount >= 3) {
        const validTrumps = validCards.filter(c => c.suit === trump);
        if (validTrumps.length > 0) {
          // Se ho il J, giocalo subito per prendere sicuro
          const jack = validTrumps.find(c => c.rank === 'J');
          if (jack) return jack;

          // Se ho il 9 MA NON il J, giocalo solo se ho anche carte di controllo
          const nine = validTrumps.find(c => c.rank === '9');
          if (nine && trumpCount >= 4) return nine;

          // Se ho A+9 insieme, posso giocare A (tanto poi prendo con 9)
          const ace = validTrumps.find(c => c.rank === 'A');
          if (ace && nine) return ace;

          // Altrimenti NON giocare atout se rischi di perdere punti
          // (es: se ho solo A o solo 10, un avversario potrebbe avere J o 9)
        }
      }

      // Dopo che hai giocato atout, gioca assi di semi laterali (ora sono sicuri)
      const nonTrumpAces = validCards.filter(c => c.suit !== trump && c.rank === 'A');
      if (nonTrumpAces.length > 0) return nonTrumpAces[0];

      // Poi 10 laterali
      const nonTrumpTens = validCards.filter(c => c.suit !== trump && c.rank === '10');
      if (nonTrumpTens.length > 0) return nonTrumpTens[0];

      // Altrimenti carta alta qualsiasi
      const strongCards = validCards.filter(c => ['A', '10', 'K'].includes(c.rank));
      if (strongCards.length > 0) return strongCards[0];
    } else {
      // Se difendo, preferisco carte basse (non sprecare atout)
      const nonTrumpCards = validCards.filter(c => c.suit !== trump);
      if (nonTrumpCards.length > 0) {
        // Preferisco carte basse
        const lowCards = nonTrumpCards.filter(c => ['7', '8', '9'].includes(c.rank));
        if (lowCards.length > 0) return lowCards[0];

        return nonTrumpCards[0];
      }
    }

    // Fallback: carta random
    return validCards[Math.floor(Math.random() * validCards.length)];
  }

  // Scelta carta difensiva (quando stiamo vincendo)
  chooseDefensiveCard(validCards, trump) {
    // Gioca la carta più bassa per conservare le alte
    const nonTrumpCards = validCards.filter(c => c.suit !== trump);

    if (nonTrumpCards.length > 0) {
      // Ordina per valore crescente e prendi la più bassa
      const sorted = nonTrumpCards.sort((a, b) => {
        const rankOrder = { '7': 0, '8': 1, '9': 2, 'J': 3, 'Q': 4, 'K': 5, '10': 6, 'A': 7 };
        return rankOrder[a.rank] - rankOrder[b.rank];
      });
      return sorted[0];
    }

    // Se ho solo atout, gioca il più basso
    const sorted = validCards.sort((a, b) =>
      this.gameLogic.deck.getCardOrder(a, trump) - this.gameLogic.deck.getCardOrder(b, trump)
    );
    return sorted[0];
  }

  // Scelta carta per prendere la mano
  chooseTakingCard(validCards, trick, trump, isAttacking) {
    const currentWinningCard = this.getCurrentWinningCard(trick, trump);

    // Trova carte che possono vincere
    const winningCards = validCards.filter(c =>
      this.canBeat(c, currentWinningCard, trump, this.getLeadSuit(trick))
    );

    if (winningCards.length > 0) {
      if (isAttacking) {
        // Se attacco, prendi con la carta più forte possibile
        const sorted = winningCards.sort((a, b) =>
          this.gameLogic.deck.getCardOrder(b, trump) - this.gameLogic.deck.getCardOrder(a, trump)
        );
        return sorted[0];
      } else {
        // Se difendo, prendi con la carta più debole che vince
        const sorted = winningCards.sort((a, b) =>
          this.gameLogic.deck.getCardOrder(a, trump) - this.gameLogic.deck.getCardOrder(b, trump)
        );
        return sorted[0];
      }
    }

    // Non posso vincere: gioca la carta più bassa
    return this.chooseDefensiveCard(validCards, trump);
  }

  // Helper: determina se siamo nella squadra che ha il contratto
  isOnContractTeam(position, contractPlayer) {
    if (!contractPlayer) return false;
    return this.isOnSameTeam(position, contractPlayer);
  }

  // Helper: determina se due posizioni sono nella stessa squadra
  isOnSameTeam(pos1, pos2) {
    const team1 = (pos1 === 'north' || pos1 === 'south') ? 'NS' : 'EW';
    const team2 = (pos2 === 'north' || pos2 === 'south') ? 'NS' : 'EW';
    return team1 === team2;
  }

  // Helper: ottiene il seme di apertura del trick
  getLeadSuit(trick) {
    const firstPlayer = Object.keys(trick)[0];
    return firstPlayer ? trick[firstPlayer].suit : null;
  }

  // Helper: ottiene la carta attualmente vincente
  getCurrentWinningCard(trick, trump) {
    const winner = this.gameLogic.determineWinner(trick, trump, this.getLeadSuit(trick));
    return winner ? trick[winner] : null;
  }

  // Helper: determina se una carta può battere un'altra
  canBeat(card, targetCard, trump, leadSuit) {
    if (!targetCard) return true;

    // Trump batte sempre non-trump
    if (card.suit === trump && targetCard.suit !== trump) return true;
    if (card.suit !== trump && targetCard.suit === trump) return false;

    // Stesso seme: confronta ordine
    if (card.suit === targetCard.suit) {
      return this.gameLogic.deck.getCardOrder(card, trump) >
             this.gameLogic.deck.getCardOrder(targetCard, trump);
    }

    // Seme diverso (nessuno è trump): la carta non del seme di apertura non vince
    if (card.suit !== leadSuit) return false;

    return false;
  }
}

module.exports = BotPlayer;
