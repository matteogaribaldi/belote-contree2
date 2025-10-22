class TariboDeck {
  constructor() {
    this.suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    this.ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  }

  createDeck() {
    const deck = [];
    for (let suit of this.suits) {
      for (let rank of this.ranks) {
        deck.push({ suit, rank });
      }
    }
    return deck;
  }

  shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // Taribo initial deal: 5 cards per player + 1 face-up
  dealInitial() {
    let deck = this.createDeck();
    deck = this.shuffle(deck);

    const hands = {
      north: deck.slice(0, 5),
      east: deck.slice(5, 10),
      south: deck.slice(10, 15),
      west: deck.slice(15, 20)
    };

    const faceUpCard = deck[20];

    return { hands, faceUpCard, remainingDeck: deck.slice(21) };
  }

  // Complete distribution after bidding: +3 cards per player (or +2 + face-up for taker)
  dealRemaining(hands, faceUpCard, takerPosition, remainingDeck) {
    const positions = ['north', 'east', 'south', 'west'];
    let deckIndex = 0;

    for (let position of positions) {
      if (position === takerPosition) {
        // Taker gets face-up card + 2 more
        hands[position].push(faceUpCard);
        hands[position].push(remainingDeck[deckIndex++]);
        hands[position].push(remainingDeck[deckIndex++]);
      } else {
        // Others get 3 cards
        hands[position].push(remainingDeck[deckIndex++]);
        hands[position].push(remainingDeck[deckIndex++]);
        hands[position].push(remainingDeck[deckIndex++]);
      }
    }

    return hands;
  }

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
}

module.exports = TariboDeck;
