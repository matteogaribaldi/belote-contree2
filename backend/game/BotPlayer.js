class BotPlayer {
  constructor(gameLogic) {
    this.gameLogic = gameLogic;
  }

  makeBid(hand, currentBid, position) {
    this.position = position; // Memorizza la posizione per il calcolo dei compagni

    // Analizza la forza della mano per ogni seme
    const suitStrength = this.analyzeSuitStrength(hand);

    // Trova il seme più forte
    const bestSuit = Object.keys(suitStrength).reduce((best, suit) =>
      suitStrength[suit].score > suitStrength[best].score ? suit : best
    );

    const bestScore = suitStrength[bestSuit].score;
    const bestCount = suitStrength[bestSuit].count;

    // Soglie per fare una puntata:
    // - Almeno 3 carte del seme
    // - Score minimo di 25 punti (es. J+9 = 34, J+A = 31, 9+A = 25)
    if (bestCount < 3 || bestScore < 25) {
      return { type: 'pass' };
    }

    // Determina la puntata base sul punteggio del seme
    let bidAmount;
    if (bestScore >= 45) {
      bidAmount = 120; // Mano molto forte
    } else if (bestScore >= 35) {
      bidAmount = 100; // Mano forte (es. J+9+A)
    } else {
      bidAmount = 80;  // Mano discreta
    }

    // Se c'è già una puntata (currentBid è { player: position, bid: {...} })
    if (currentBid && currentBid.bid && currentBid.bid.type === 'bid') {
      const currentPoints = currentBid.bid.points;
      const currentSuit = currentBid.bid.suit;
      const minBid = currentPoints + 10;

      // Non si può puntare oltre 160
      if (minBid > 160) {
        return { type: 'pass' };
      }

      // Se è il compagno che ha puntato (N-S o E-W sono compagni)
      const isPartnerBid = this.isPartnerBidding(currentBid.player, position);

      if (isPartnerBid) {
        // Sostieni il compagno se hai un minimo di forza (15+ punti in qualsiasi seme)
        if (bestScore >= 15) {
          return {
            type: 'bid',
            points: minBid,
            suit: currentSuit
          };
        }
        // Compagno ha puntato ma non ho abbastanza forza
        return { type: 'pass' };
      } else {
        // Avversario ha puntato - contrasta solo se hai un seme forte
        if (bestScore >= 35) {
          // Usa la puntata base se è abbastanza alta, altrimenti usa il minimo
          const finalBid = bidAmount >= minBid ? bidAmount : minBid;
          if (finalBid <= 160) {
            return {
              type: 'bid',
              points: finalBid,
              suit: bestSuit
            };
          }
        }
        // Non abbastanza forte per contrastare
        return { type: 'pass' };
      }
    }

    // Prima puntata: fai una puntata se hai un seme forte
    return {
      type: 'bid',
      points: bidAmount,
      suit: bestSuit
    };
  }

  analyzeSuitStrength(hand) {
    const deck = require('./Deck');
    const deckInstance = new deck();
    const strength = {};

    // Inizializza per ogni seme
    ['hearts', 'diamonds', 'clubs', 'spades'].forEach(suit => {
      strength[suit] = { score: 0, count: 0, cards: [] };
    });

    // Analizza ogni carta
    hand.forEach(card => {
      const suit = card.suit;
      // Calcola il valore come se questo seme fosse atout
      const value = deckInstance.getCardValue(card, suit);

      strength[suit].score += value;
      strength[suit].count++;
      strength[suit].cards.push(card.rank);
    });

    return strength;
  }

  isPartnerBidding(bidderPosition, botPosition) {
    // N-S sono compagni, E-W sono compagni
    const partners = {
      'north': 'south',
      'south': 'north',
      'east': 'west',
      'west': 'east'
    };

    return partners[botPosition] === bidderPosition;
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