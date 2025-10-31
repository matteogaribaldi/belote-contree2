class BotPlayer {
  constructor(gameLogic) {
    this.gameLogic = gameLogic;
    this.hasRaisedOnPartner = false; // Traccia se ha già supportato il partner
  }

  // Reset stato per nuova mano
  resetForNewHand() {
    this.hasRaisedOnPartner = false;
  }

  makeBid(hand, currentBid, position, allBids = [], game = null) {
    this.position = position;
    this.currentHand = hand; // Salva la mano corrente per usarla nelle funzioni

    // Trova il seme migliore
    const bestSuit = this.findBestSuit(hand);

    // Calcola stima punti per il seme migliore
    const estimate = this.estimatePoints(hand, bestSuit);

    // Estrai informazioni dalle puntate precedenti
    const partnerBid = this.getPartnerBid(allBids, position);
    const opponentsBid = this.getOpponentsBid(allBids, position);
    const lastBid = currentBid;

    // CASO SPECIALE: C'è un contro attivo - gestisci surcontre
    if (game && game.contro && !game.surcontre) {
      // Trova l'ultima bid (non contro/surcontre)
      const originalBid = [...allBids].reverse().find(b => b.bid.type === 'bid' || b.bid.type === 'cappotto');

      // Controlla se siamo nella squadra che ha fatto la bid originale
      if (originalBid) {
        const bidderTeam = (originalBid.player === 'north' || originalBid.player === 'south') ? 'NS' : 'EW';
        const myTeam = (position === 'north' || position === 'south') ? 'NS' : 'EW';

        // Se siamo nella squadra che ha fatto la bid, possiamo fare surcontre
        if (bidderTeam === myTeam) {
          return this.handleSurcontreDecision(hand, originalBid, estimate, bestSuit);
        }
      }
      // Altrimenti, non possiamo fare nulla, passa
      return { type: 'pass' };
    }

    // CASO 1: Partner ha già puntato
    if (partnerBid && partnerBid.bid.type === 'bid') {
      return this.handlePartnerBid(hand, partnerBid, opponentsBid, lastBid, game);
    }

    // CASO 2: Avversari hanno puntato
    if (opponentsBid && opponentsBid.bid.type === 'bid') {
      return this.handleOpponentBid(hand, opponentsBid, estimate, bestSuit, game);
    }

    // CASO 3: Nessuno ha ancora puntato (o solo passi)
    return this.handleOpeningBid(estimate, bestSuit);
  }

  // CASO 1: Gestione puntata partner
  handlePartnerBid(hand, partnerBid, opponentsBid, lastBid, game) {
    const partnerSuit = partnerBid.bid.suit;
    const partnerPoints = partnerBid.bid.points;

    // CASO 1A: Supporto partner (solo prima volta e se nessun avversario ha rilanciato)
    if (!this.hasRaisedOnPartner && (!opponentsBid || opponentsBid.bid.type !== 'bid')) {
      const suitCards = hand.filter(c => c.suit === partnerSuit);
      const hasJack = suitCards.some(c => c.rank === 'J');
      const hasNine = suitCards.some(c => c.rank === '9');
      const acesOutside = hand.filter(c => c.suit !== partnerSuit && c.rank === 'A');

      // LINGUAGGIO 80: Partner ha J O 9 (manca uno dei due)
      // Rispondo +10 SOLO se ho la carta mancante
      if (partnerPoints === 80) {
        // Se ho sia J che 9, partner ha dichiarato male (ha entrambi doveva dire 90+)
        // Ma supporto comunque
        if (hasJack && hasNine) {
          const newPoints = partnerPoints + 10;
          if (newPoints <= 160) {
            this.hasRaisedOnPartner = true;
            return { type: 'bid', suit: partnerSuit, points: newPoints };
          }
        }
        // Se ho J o 9 (ma non entrambi), supporto - partner ha l'altro
        else if (hasJack || hasNine) {
          const newPoints = partnerPoints + 10;
          if (newPoints <= 160) {
            this.hasRaisedOnPartner = true;
            return { type: 'bid', suit: partnerSuit, points: newPoints };
          }
        }
        // Se non ho né J né 9, non supporto l'80 (passo o annuncio altro colore)
        // In questo caso, passo semplicemente
      }

      // LINGUAGGIO 90+: Partner ha J+9 + pli maestri
      // Supporto con assi esterni
      if (partnerPoints >= 90 && acesOutside.length > 0) {
        const raiseAmount = acesOutside.length >= 2 ? 20 : 10;
        const newPoints = partnerPoints + raiseAmount;
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
      // Fai contro solo se non è già stato fatto e sei abbastanza forte
      if (defensiveStrength >= 40 && !game.contro) {
        return { type: 'contro' };
      }
    }

    // Altrimenti passa
    return { type: 'pass' };
  }

  // CASO 2: Gestione puntata avversari
  handleOpponentBid(hand, opponentsBid, estimate, bestSuit, game) {
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

    // Se ho mano difensiva forte, faccio contro (solo se non è già stato fatto)
    const defensiveStrength = this.evaluateDefense(hand, opponentSuit);
    if (defensiveStrength >= 40 && !game.contro) {
      return { type: 'contro' };
    }

    // Altrimenti passo
    return { type: 'pass' };
  }

  // CASO SPECIALE: Gestione surcontre dopo un contro
  handleSurcontreDecision(hand, originalBid, estimate, bestSuit) {
    const bidSuit = originalBid.bid.suit;
    const bidPoints = originalBid.bid.points || 500; // 500 per cappotto

    // Calcola la forza nella suit dell'offerta
    const suitStrength = this.estimatePoints(hand, bidSuit);

    // Se l'offerta originale è del partner e abbiamo una mano forte, surcontre
    const isPartnerBid = this.getPartnerPosition(this.position) === originalBid.player;

    if (isPartnerBid) {
      // Il partner ha fatto la bid, valutiamo se supportare con surcontre
      const suitCards = hand.filter(c => c.suit === bidSuit);
      const hasJack = suitCards.some(c => c.rank === 'J');
      const hasNine = suitCards.some(c => c.rank === '9');
      const acesOutside = hand.filter(c => c.suit !== bidSuit && c.rank === 'A');

      // Surcontre se abbiamo supporto forte (J o 9 + assi esterni)
      if ((hasJack || hasNine) && acesOutside.length >= 1) {
        return { type: 'surcontre' };
      }

      // Oppure se abbiamo molte carte del seme e assi esterni
      if (suitCards.length >= 3 && acesOutside.length >= 2) {
        return { type: 'surcontre' };
      }
    } else {
      // Noi abbiamo fatto la bid originale, valutiamo se confermare con surcontre
      const suitCards = hand.filter(c => c.suit === bidSuit);
      const hasJack = suitCards.some(c => c.rank === 'J');
      const hasNine = suitCards.some(c => c.rank === '9');

      // Surcontre solo se siamo molto sicuri (J+9 insieme)
      if (hasJack && hasNine && suitCards.length >= 4) {
        return { type: 'surcontre' };
      }

      // Oppure se abbiamo puntato alto e abbiamo una mano eccezionale
      if (bidPoints >= 110 && suitStrength >= 120) {
        return { type: 'surcontre' };
      }
    }

    // Se non siamo sicuri, passa
    return { type: 'pass' };
  }

  // CASO 3: Apertura (nessuno ha puntato)
  // Linguaggio standardizzato Belote Contrée
  handleOpeningBid(estimate, bestSuit) {
    const hand = this.currentHand;
    const suitCards = hand.filter(c => c.suit === bestSuit);

    const hasJack = suitCards.some(c => c.rank === 'J');
    const hasNine = suitCards.some(c => c.rank === '9');
    const acesOutside = hand.filter(c => c.suit !== bestSuit && c.rank === 'A');
    const masterTricks = this.countMasterTricks(hand, bestSuit); // Conta assi + 10

    // ANNUNCIO 110: J+9 ("34") + 2 altri atout + almeno 2 assi
    if (hasJack && hasNine && suitCards.length >= 4 && acesOutside.length >= 2) {
      return { type: 'bid', suit: bestSuit, points: 110 };
    }

    // ANNUNCIO 100: J+9 + 2 altri atout + 1 asso
    if (hasJack && hasNine && suitCards.length >= 4 && acesOutside.length >= 1) {
      return { type: 'bid', suit: bestSuit, points: 100 };
    }

    // ANNUNCIO 90: J+9 + almeno 1 altro atout + 1-2 pli maestri in altri colori
    if (hasJack && hasNine && suitCards.length >= 3 && masterTricks >= 1) {
      return { type: 'bid', suit: bestSuit, points: 90 };
    }

    // ANNUNCIO 80: (J O 9, manca uno dei due) + almeno 2 altri atout
    // Significato: "partner, ho J o 9, se hai l'altro puoi supportare"
    if ((hasJack || hasNine) && suitCards.length >= 3) {
      return { type: 'bid', suit: bestSuit, points: 80 };
    }

    // Se non raggiungo le condizioni minime, passo
    return { type: 'pass' };
  }

  // Helper: conta i "pli maestri" (assi e 10 che possono prendere)
  countMasterTricks(hand, trumpSuit) {
    const nonTrumpCards = hand.filter(c => c.suit !== trumpSuit);
    let count = 0;

    // Conta assi (sempre maestri)
    count += nonTrumpCards.filter(c => c.rank === 'A').length;

    // Conta 10 accompagnati da A (molto probabilmente maestri)
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'].filter(s => s !== trumpSuit);
    suits.forEach(suit => {
      const suitCards = nonTrumpCards.filter(c => c.suit === suit);
      const hasAce = suitCards.some(c => c.rank === 'A');
      const hasTen = suitCards.some(c => c.rank === '10');
      if (hasAce && hasTen) {
        count += 0.5; // A+10 insieme valgono come 1.5 pli maestri
      }
    });

    return count;
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
    const trumpCards = hand.filter(c => c.suit === opponentTrump);
    const trumpCount = trumpCards.length;

    // Analizza le carte di atout in mano
    const hasJack = trumpCards.some(c => c.rank === 'J');
    const hasNine = trumpCards.some(c => c.rank === '9');
    const hasAce = trumpCards.some(c => c.rank === 'A');
    const hasTen = trumpCards.some(c => c.rank === '10');

    // Conta assi esterni (potenziali mani da prendere)
    const acesOutside = hand.filter(c => c.suit !== opponentTrump && c.rank === 'A').length;
    const tensOutside = hand.filter(c => c.suit !== opponentTrump && c.rank === '10').length;

    // LOGICA CONTRO: Calcola quante mani possiamo realisticamente prendere
    let estimatedTricks = 0;

    // 1. Mani garantite con atout forte
    if (hasJack) {
      // J prende sempre almeno 1 mano
      estimatedTricks += 1;

      // Se ho anche 9, prendo sicuramente un'altra mano dopo che esce J
      if (hasNine) {
        estimatedTricks += 1;
      }
      // Se ho J + A ma non 9, potrei prendere 1-2 mani (dipende da chi ha il 9)
      else if (hasAce) {
        estimatedTricks += 0.5;
      }
    } else if (hasNine) {
      // Ho 9 senza J: prendo solo se J è già uscito o è nel mio partner
      // Stima conservativa: 0.5 mani (potrebbe prendere dopo che esce J)
      estimatedTricks += 0.5;

      // Se ho anche A, aumenta probabilità
      if (hasAce) {
        estimatedTricks += 0.3;
      }
    } else if (hasAce && trumpCount >= 3) {
      // Ho A senza J/9, ma ho molti atout: potrei eventualmente prendere
      estimatedTricks += 0.3;
    }

    // 2. Mani con assi laterali (dopo che atout sono usciti)
    // Se abbiamo buoni atout, gli assi esterni hanno più valore
    if (trumpCount >= 3 || hasJack || hasNine) {
      estimatedTricks += acesOutside * 0.8; // Probabilità alta di prendere con assi
      estimatedTricks += tensOutside * 0.4; // 10 potrebbe prendere
    } else {
      // Con poco atout, assi rischiano di essere tagliati
      estimatedTricks += acesOutside * 0.5;
      estimatedTricks += tensOutside * 0.2;
    }

    // 3. Bonus se abbiamo molti atout (controllo del gioco)
    if (trumpCount >= 4) {
      estimatedTricks += 0.5; // Controllo extra
    }

    // DECISIONE CONTRO:
    // - Serve fare almeno 82 punti (162 totali - 80 minimo contratto = 82 per difensori)
    // - In media ogni mano vale ~20 punti (162/8)
    // - Per fare 82 punti servono circa 4 mani
    // - Con il "contro" i punti raddoppiano, quindi basta fare 2 mane sicure (40 punti base * 2 = 80)

    // Ritorna punteggio: ogni mano stimata vale 20 punti
    const defenseScore = estimatedTricks * 20;

    return defenseScore;
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
      this.gameLogic.isValidPlay(card, hand, trick, trump, position)
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
