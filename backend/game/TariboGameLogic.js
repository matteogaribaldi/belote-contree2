const Deck = require('./Deck');

class TariboGameLogic {
  constructor() {
    this.deck = new Deck();
  }

  // Determina il vincitore del trick (identico a Contrée)
  determineWinner(trick, trump, leadSuit) {
    const players = Object.keys(trick);
    if (players.length === 0) return null;

    let winningPlayer = players[0];
    let winningCard = trick[winningPlayer];

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
        if (this.getCardOrder(card, trump) > this.getCardOrder(winningCard, trump)) {
          winningCard = card;
          winningPlayer = player;
        }
      }
      // Se la carta vincente non è trump e la carta corrente è del seme di apertura
      else if (winningCard.suit !== trump && card.suit === leadSuit) {
        if (this.getCardOrder(card, trump) > this.getCardOrder(winningCard, trump)) {
          winningCard = card;
          winningPlayer = player;
        }
      }
    }

    return winningPlayer;
  }

  // Calcola i punti di un trick
  calculateTrickPoints(trick, trump) {
    let points = 0;
    for (let player in trick) {
      points += this.getCardValue(trick[player], trump);
    }
    return points;
  }

  // Validazione carta giocata (regole standard Belote)
  isValidPlay(card, hand, trick, trump, currentPlayer) {
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

    // Se seguo il seme di atout, devo surclassare se posso
    if (hasSuit && leadSuit === trump && card.suit === trump) {
      const players = Object.keys(trick);
      const leadPlayer = players[0];
      const partner = this.getPartner(currentPlayer);
      const partnerWinning = this.isPartnerWinning(trick, trump, leadSuit, currentPlayer);

      const mustSurpass = !partnerWinning || (partnerWinning && leadPlayer === partner);

      if (mustSurpass) {
        const trumpsInTrick = Object.values(trick).filter(c => c.suit === trump);
        if (trumpsInTrick.length > 0) {
          const highestTrump = trumpsInTrick.reduce((max, c) =>
            this.getCardOrder(c, trump) > this.getCardOrder(max, trump) ? c : max
          );

          const canSurpass = hand.some(c =>
            c.suit === trump &&
            this.getCardOrder(c, trump) > this.getCardOrder(highestTrump, trump)
          );

          if (canSurpass && this.getCardOrder(card, trump) <= this.getCardOrder(highestTrump, trump)) {
            return false;
          }
        }
      }
    }

    // Se non ho il seme
    if (!hasSuit) {
      const hasTrump = hand.some(c => c.suit === trump);
      const partnerWinning = this.isPartnerWinning(trick, trump, leadSuit, currentPlayer);

      // Se ho atout e il partner non sta vincendo, devo giocare atout
      if (hasTrump && !partnerWinning && card.suit !== trump) {
        return false;
      }

      // Se gioco atout, devo surclassare se posso
      if (card.suit === trump && !partnerWinning) {
        const trumpsInTrick = Object.values(trick).filter(c => c.suit === trump);
        if (trumpsInTrick.length > 0) {
          const highestTrump = trumpsInTrick.reduce((max, c) =>
            this.getCardOrder(c, trump) > this.getCardOrder(max, trump) ? c : max
          );

          const canSurpass = hand.some(c =>
            c.suit === trump &&
            this.getCardOrder(c, trump) > this.getCardOrder(highestTrump, trump)
          );

          if (canSurpass && this.getCardOrder(card, trump) <= this.getCardOrder(highestTrump, trump)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  isPartnerWinning(trick, trump, leadSuit, currentPlayer) {
    const players = Object.keys(trick);
    if (players.length === 0) return false;

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

  // Controlla Belote/Rebelote (K+Q di trump)
  checkBeloteRebelote(card, hand, trump) {
    if (card.suit !== trump) return null;

    const isKing = card.rank === 'K';
    const isQueen = card.rank === 'Q';

    if (!isKing && !isQueen) return null;

    const hasKing = hand.some(c => c.suit === trump && c.rank === 'K') || (isKing && card.suit === trump);
    const hasQueen = hand.some(c => c.suit === trump && c.rank === 'Q') || (isQueen && card.suit === trump);

    if (hasKing && hasQueen) {
      return isKing ? 'belote' : 'rebelote';
    }

    return null;
  }

  // Valore carta (trump o sans atout)
  getCardValue(card, trump) {
    if (trump === 'sans') {
      // Sans atout: valori standard
      const sansValues = {
        'A': 11, '10': 10, 'K': 4, 'Q': 3,
        'J': 2, '9': 0, '8': 0, '7': 0
      };
      return sansValues[card.rank];
    }

    const isTrump = card.suit === trump;

    if (isTrump) {
      const trumpValues = {
        'J': 20, '9': 14, 'A': 11, '10': 10,
        'K': 4, 'Q': 3, '8': 0, '7': 0
      };
      return trumpValues[card.rank];
    } else {
      const normalValues = {
        'A': 11, '10': 10, 'K': 4, 'Q': 3,
        'J': 2, '9': 0, '8': 0, '7': 0
      };
      return normalValues[card.rank];
    }
  }

  // Ordine carta per confronto (trump o sans atout)
  getCardOrder(card, trump) {
    if (trump === 'sans') {
      // Sans atout: A > 10 > K > Q > J > 9 > 8 > 7
      const order = { 'A': 8, '10': 7, 'K': 6, 'Q': 5, 'J': 4, '9': 3, '8': 2, '7': 1 };
      return order[card.rank];
    }

    const isTrump = card.suit === trump;

    if (isTrump) {
      const order = { 'J': 8, '9': 7, 'A': 6, '10': 5, 'K': 4, 'Q': 3, '8': 2, '7': 1 };
      return order[card.rank];
    } else {
      const order = { 'A': 8, '10': 7, 'K': 6, 'Q': 5, 'J': 4, '9': 3, '8': 2, '7': 1 };
      return order[card.rank];
    }
  }

  // === DICHIARAZIONI ===

  // Trova tutte le sequenze in una mano
  findSequences(hand) {
    const sequences = [];
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const rankOrder = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    for (const suit of suits) {
      const cardsInSuit = hand
        .filter(c => c.suit === suit)
        .sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank));

      if (cardsInSuit.length < 3) continue;

      // Trova sequenze consecutive
      let currentSeq = [cardsInSuit[0]];

      for (let i = 1; i < cardsInSuit.length; i++) {
        const prevIdx = rankOrder.indexOf(cardsInSuit[i - 1].rank);
        const currIdx = rankOrder.indexOf(cardsInSuit[i].rank);

        if (currIdx === prevIdx + 1) {
          currentSeq.push(cardsInSuit[i]);
        } else {
          if (currentSeq.length >= 3) {
            sequences.push([...currentSeq]);
          }
          currentSeq = [cardsInSuit[i]];
        }
      }

      if (currentSeq.length >= 3) {
        sequences.push(currentSeq);
      }
    }

    // Ritorna la sequenza più lunga/migliore
    if (sequences.length === 0) return null;

    return sequences.reduce((best, seq) => {
      if (seq.length > best.length) return seq;
      if (seq.length === best.length) {
        const seqHighRank = rankOrder.indexOf(seq[seq.length - 1].rank);
        const bestHighRank = rankOrder.indexOf(best[best.length - 1].rank);
        return seqHighRank > bestHighRank ? seq : best;
      }
      return best;
    });
  }

  // Trova i carré (4 carte stesso valore)
  findCarre(hand) {
    const ranks = ['J', '9', 'A', 'K', 'Q']; // Solo questi contano

    for (const rank of ranks) {
      const cards = hand.filter(c => c.rank === rank);
      if (cards.length === 4) {
        return { rank, cards, points: rank === 'J' ? 200 : 100 };
      }
    }

    return null;
  }

  // Calcola punti dichiarazione sequenza
  getSequencePoints(sequence) {
    if (!sequence) return 0;
    const length = sequence.length;
    if (length === 3) return 20;
    if (length === 4) return 50;
    if (length === 5) return 100;
    if (length === 6) return 150;
    if (length === 7) return 200;
    if (length === 8) return 250;
    return 0;
  }

  // Confronta sequenze tra giocatori
  compareSequences(seq1, seq2, trump) {
    if (!seq1) return -1;
    if (!seq2) return 1;

    // Più lunga vince
    if (seq1.length > seq2.length) return 1;
    if (seq1.length < seq2.length) return -1;

    // A parità, carta più alta
    const rankOrder = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const rank1 = rankOrder.indexOf(seq1[seq1.length - 1].rank);
    const rank2 = rankOrder.indexOf(seq2[seq2.length - 1].rank);

    if (rank1 > rank2) return 1;
    if (rank1 < rank2) return -1;

    // A parità, atout vince
    const isTrump1 = trump !== 'sans' && seq1[0].suit === trump;
    const isTrump2 = trump !== 'sans' && seq2[0].suit === trump;

    if (isTrump1 && !isTrump2) return 1;
    if (!isTrump1 && isTrump2) return -1;

    return 0;
  }

  // Analizza tutte le dichiarazioni dei giocatori dopo il primo trick
  analyzeDeclarations(hands, trump) {
    const declarations = {
      north: { sequence: this.findSequences(hands.north), carre: this.findCarre(hands.north) },
      east: { sequence: this.findSequences(hands.east), carre: this.findCarre(hands.east) },
      south: { sequence: this.findSequences(hands.south), carre: this.findCarre(hands.south) },
      west: { sequence: this.findSequences(hands.west), carre: this.findCarre(hands.west) }
    };

    // Trova migliore sequenza
    let bestSeqPlayer = null;
    let bestSeq = null;

    for (const [player, decl] of Object.entries(declarations)) {
      if (decl.sequence && this.compareSequences(decl.sequence, bestSeq, trump) > 0) {
        bestSeq = decl.sequence;
        bestSeqPlayer = player;
      }
    }

    // Trova miglior carré
    let bestCarrePlayer = null;
    let bestCarre = null;

    for (const [player, decl] of Object.entries(declarations)) {
      if (decl.carre && (!bestCarre || decl.carre.points > bestCarre.points)) {
        bestCarre = decl.carre;
        bestCarrePlayer = player;
      }
    }

    return {
      sequence: bestSeqPlayer ? {
        player: bestSeqPlayer,
        team: ['north', 'south'].includes(bestSeqPlayer) ? 'NS' : 'EW',
        cards: bestSeq,
        points: this.getSequencePoints(bestSeq)
      } : null,
      carre: bestCarrePlayer ? {
        player: bestCarrePlayer,
        team: ['north', 'south'].includes(bestCarrePlayer) ? 'NS' : 'EW',
        rank: bestCarre.rank,
        points: bestCarre.points
      } : null
    };
  }
}

module.exports = TariboGameLogic;
