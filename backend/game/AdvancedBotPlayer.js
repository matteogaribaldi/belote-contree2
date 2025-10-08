const BotPlayer = require('./BotPlayer');
const GameLogic = require('./GameLogic');
const Deck = require('./Deck');

/**
 * Advanced Bot usando Determinization + Monte Carlo Sampling
 *
 * Strategia:
 * 1. Per ogni mossa valida, crea N "mondi" (determinizations) distribuendo le carte sconosciute
 * 2. Simula partite complete in ogni mondo
 * 3. Sceglie la mossa con miglior win-rate
 */
class AdvancedBotPlayer extends BotPlayer {
  constructor(gameLogic) {
    super(gameLogic);
    this.NUM_DETERMINIZATIONS = 50; // Bilanciamento velocità/accuratezza
    this.TIMEOUT_MS = 2500; // Safety timeout (max 2.5s per decisione)
  }

  /**
   * Override del metodo playCard per usare Monte Carlo
   */
  playCard(hand, trick, trump, position, contract, gameState) {
    const startTime = Date.now();

    // Trova tutte le carte valide
    const validCards = hand.filter(card =>
      this.gameLogic.isValidPlay(card, hand, trick, trump, position)
    );

    if (validCards.length === 0) {
      console.error('AdvancedBot: nessuna carta valida!');
      return hand[0];
    }

    // Se c'è una sola carta valida, niente da calcolare
    if (validCards.length === 1) {
      return validCards[0];
    }

    console.log(`\n[AdvancedBot ${position}] Analisi Monte Carlo per ${validCards.length} carte valide...`);

    // Prepara stato del gioco
    const knownCards = this.extractKnownCards(gameState, hand, position);
    const unknownCards = this.getUnknownCards(knownCards);

    // Valuta ogni carta valida
    const cardScores = validCards.map(card => {
      let totalScore = 0;
      let simulations = 0;

      for (let i = 0; i < this.NUM_DETERMINIZATIONS; i++) {
        // Safety timeout
        if (Date.now() - startTime > this.TIMEOUT_MS) {
          console.log(`[AdvancedBot] Timeout raggiunto dopo ${simulations} simulazioni`);
          break;
        }

        // Crea un "mondo" possibile
        const world = this.createDeterminization(unknownCards, hand, position, gameState);

        // Simula la partita giocando questa carta
        const score = this.simulate(card, world, trump, position, contract, gameState, trick);
        totalScore += score;
        simulations++;
      }

      const avgScore = simulations > 0 ? totalScore / simulations : 0;
      return { card, avgScore, simulations };
    });

    // Scegli la carta con miglior score medio
    cardScores.sort((a, b) => b.avgScore - a.avgScore);

    const bestCard = cardScores[0];
    const elapsedMs = Date.now() - startTime;

    console.log(`[AdvancedBot] Scelta: ${bestCard.card.rank}${this.suitSymbol(bestCard.card.suit)} ` +
                `(score: ${bestCard.avgScore.toFixed(1)}, ${bestCard.simulations} sim, ${elapsedMs}ms)`);

    return bestCard.card;
  }

  /**
   * Estrae le carte conosciute (giocate + in mano al bot)
   */
  extractKnownCards(gameState, botHand, botPosition) {
    const known = [...botHand];

    // Aggiungi carte del trick corrente
    if (gameState.currentTrick) {
      Object.values(gameState.currentTrick).forEach(card => {
        known.push(card);
      });
    }

    // Aggiungi carte dei trick completati
    if (gameState.completedTricks) {
      gameState.completedTricks.forEach(trick => {
        Object.values(trick).forEach(card => {
          known.push(card);
        });
      });
    }

    return known;
  }

  /**
   * Ottiene tutte le carte non ancora conosciute
   */
  getUnknownCards(knownCards) {
    const deck = new Deck();
    const allCards = deck.createDeck();

    return allCards.filter(card => {
      return !knownCards.some(known =>
        known.suit === card.suit && known.rank === card.rank
      );
    });
  }

  /**
   * Crea una determinization: distribuisce le carte sconosciute agli altri giocatori
   */
  createDeterminization(unknownCards, botHand, botPosition, gameState) {
    const shuffled = [...unknownCards];

    // Shuffle Fisher-Yates
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Distribuisci equamente agli altri 3 giocatori
    const positions = ['north', 'east', 'south', 'west'];
    const otherPositions = positions.filter(p => p !== botPosition);

    const world = {
      hands: { [botPosition]: [...botHand] }
    };

    // Calcola quante carte ha già giocato ogni giocatore per sapere quante ne hanno ancora
    const cardsPerPlayer = Math.floor(shuffled.length / otherPositions.length);

    otherPositions.forEach((pos, idx) => {
      const start = idx * cardsPerPlayer;
      const end = idx === otherPositions.length - 1 ? shuffled.length : start + cardsPerPlayer;
      world.hands[pos] = shuffled.slice(start, end);
    });

    return world;
  }

  /**
   * Simula una partita giocando la carta specificata
   * Ritorna lo score per la coppia del bot (positivo = buono, negativo = male)
   */
  simulate(firstCard, world, trump, botPosition, contract, gameState, currentTrick) {
    // Copia lo stato per non modificare l'originale
    const simHands = {
      north: [...world.hands.north],
      east: [...world.hands.east],
      south: [...world.hands.south],
      west: [...world.hands.west]
    };

    // Copia trick corrente
    const trick = JSON.parse(JSON.stringify(currentTrick));

    // Il bot gioca la firstCard
    const positions = ['north', 'east', 'south', 'west'];
    const currentPlayerIdx = positions.indexOf(botPosition);

    // Rimuovi la carta dalla mano del bot
    simHands[botPosition] = simHands[botPosition].filter(c =>
      !(c.suit === firstCard.suit && c.rank === firstCard.rank)
    );

    trick[botPosition] = firstCard;

    // Completa il trick corrente
    let nextPlayerIdx = (currentPlayerIdx + 1) % 4;
    while (Object.keys(trick).length < 4) {
      const nextPos = positions[nextPlayerIdx];
      const card = this.chooseSimulatedCard(simHands[nextPos], trick, trump, nextPos, contract);

      if (!card) break; // Errore: nessuna carta valida

      trick[nextPos] = card;
      simHands[nextPos] = simHands[nextPos].filter(c =>
        !(c.suit === card.suit && c.rank === card.rank)
      );

      nextPlayerIdx = (nextPlayerIdx + 1) % 4;
    }

    // Determina chi vince questo trick
    const leadSuit = trick[Object.keys(trick)[0]].suit;
    const trickWinner = this.gameLogic.determineWinner(trick, trump, leadSuit);
    const trickPoints = this.gameLogic.calculateTrickPoints(trick, trump);

    // Inizializza punteggi
    let botTeamScore = this.isOnSameTeam(botPosition, trickWinner) ? trickPoints : 0;
    let opponentScore = !this.isOnSameTeam(botPosition, trickWinner) ? trickPoints : 0;

    // Simula i trick rimanenti
    let currentLeader = trickWinner;
    const tricksRemaining = Math.min(...Object.values(simHands).map(h => h.length));

    for (let t = 0; t < tricksRemaining; t++) {
      const newTrick = {};
      let leaderIdx = positions.indexOf(currentLeader);

      // Gioca le 4 carte
      for (let p = 0; p < 4; p++) {
        const pos = positions[leaderIdx];
        const card = this.chooseSimulatedCard(simHands[pos], newTrick, trump, pos, contract);

        if (!card) break;

        newTrick[pos] = card;
        simHands[pos] = simHands[pos].filter(c =>
          !(c.suit === card.suit && c.rank === card.rank)
        );

        leaderIdx = (leaderIdx + 1) % 4;
      }

      if (Object.keys(newTrick).length < 4) break;

      const newLeadSuit = newTrick[Object.keys(newTrick)[0]].suit;
      const winner = this.gameLogic.determineWinner(newTrick, trump, newLeadSuit);
      const points = this.gameLogic.calculateTrickPoints(newTrick, trump);

      if (this.isOnSameTeam(botPosition, winner)) {
        botTeamScore += points;
      } else {
        opponentScore += points;
      }

      currentLeader = winner;
    }

    // Bonus ultimo trick (+10 punti)
    if (this.isOnSameTeam(botPosition, currentLeader)) {
      botTeamScore += 10;
    } else {
      opponentScore += 10;
    }

    // Score finale: differenza punti (più positivo = meglio per il bot)
    // Se siamo la squadra del contratto, dobbiamo fare più punti possibile
    // Se difendiamo, vogliamo minimizzare i punti dell'attaccante
    const contractPlayer = contract ? contract.player : null;
    const isAttacking = this.isOnContractTeam(botPosition, contractPlayer);

    if (isAttacking) {
      // Attacco: massimizza i nostri punti
      return botTeamScore;
    } else {
      // Difesa: massimizza i punti che prendiamo (per impedire agli avversari di fare il contratto)
      return botTeamScore;
    }
  }

  /**
   * Sceglie una carta durante la simulazione
   * Il bot usa strategia intelligente, compagno usa euristica ragionevole, avversari giocano validamente
   */
  chooseSimulatedCard(hand, trick, trump, position, contract) {
    const validCards = hand.filter(card =>
      this.gameLogic.isValidPlay(card, hand, trick, trump, position)
    );

    if (validCards.length === 0) return null;
    if (validCards.length === 1) return validCards[0];

    const contractPlayer = contract ? contract.player : null;
    const isAttacking = this.isOnContractTeam(position, contractPlayer);
    const isBot = position === this.position;
    const isPartner = this.isOnSameTeam(position, this.position);

    // Bot e partner giocano con strategia intelligente
    if (isBot || isPartner) {
      return this.chooseSmartCard(validCards, trick, trump, isAttacking, hand);
    } else {
      // Avversari giocano ragionevolmente (carta forte ponderata)
      return this.chooseReasonableCard(validCards, trick, trump);
    }
  }

  /**
   * Strategia intelligente per bot e partner
   */
  chooseSmartCard(validCards, trick, trump, isAttacking, hand) {
    const isFirstCard = Object.keys(trick).length === 0;
    const weAreWinning = this.isTeamWinning(trick, trump, this.position);

    if (isFirstCard) {
      // Apri con carta forte
      const trumpCards = validCards.filter(c => c.suit === trump);
      if (trumpCards.length > 0 && isAttacking) {
        const strong = trumpCards.filter(c => ['J', '9', 'A'].includes(c.rank));
        if (strong.length > 0) return strong[0];
      }

      const aces = validCards.filter(c => c.rank === 'A');
      if (aces.length > 0) return aces[0];

      return validCards[0];
    }

    if (weAreWinning) {
      // Stiamo vincendo: gioca carta bassa
      return this.getLowestCard(validCards, trump);
    } else {
      // Prova a vincere
      const winningCards = this.getWinningCards(validCards, trick, trump);
      if (winningCards.length > 0) {
        // Vinci con carta più debole possibile
        return this.getLowestCard(winningCards, trump);
      }
      // Non possiamo vincere: scarta basso
      return this.getLowestCard(validCards, trump);
    }
  }

  /**
   * Strategia ragionevole per avversari (ponderata verso carte forti)
   */
  chooseReasonableCard(validCards, trick, trump) {
    // 60% probabilità di giocare una carta alta, 40% random
    if (Math.random() < 0.6) {
      const strongCards = validCards.filter(c => ['A', '10', 'K', 'J', '9'].includes(c.rank));
      if (strongCards.length > 0) {
        return strongCards[Math.floor(Math.random() * strongCards.length)];
      }
    }

    return validCards[Math.floor(Math.random() * validCards.length)];
  }

  /**
   * Helper: ottiene la carta più bassa
   */
  getLowestCard(cards, trump) {
    return cards.reduce((lowest, card) =>
      this.gameLogic.deck.getCardOrder(card, trump) < this.gameLogic.deck.getCardOrder(lowest, trump)
        ? card : lowest
    );
  }

  /**
   * Helper: ottiene carte che possono vincere il trick
   */
  getWinningCards(validCards, trick, trump) {
    const currentWinner = this.gameLogic.determineWinner(trick, trump, this.getLeadSuit(trick));
    if (!currentWinner) return validCards;

    const winningCard = trick[currentWinner];

    return validCards.filter(card => this.canBeat(card, winningCard, trump, this.getLeadSuit(trick)));
  }

  /**
   * Helper: verifica se il nostro team sta vincendo il trick
   */
  isTeamWinning(trick, trump, position) {
    const winner = this.gameLogic.determineWinner(trick, trump, this.getLeadSuit(trick));
    if (!winner) return false;
    return this.isOnSameTeam(position, winner);
  }

  /**
   * Helper: simbolo del seme
   */
  suitSymbol(suit) {
    const symbols = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
    return symbols[suit] || suit;
  }
}

module.exports = AdvancedBotPlayer;
