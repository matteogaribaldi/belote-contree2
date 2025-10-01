class Deck {
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

  deal() {
    let deck = this.createDeck();
    deck = this.shuffle(deck);
    
    const hands = {
      north: deck.slice(0, 8),
      east: deck.slice(8, 16),
      south: deck.slice(16, 24),
      west: deck.slice(24, 32)
    };

    return hands;
  }

  getCardValue(card, trump) {
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

module.exports = Deck;
