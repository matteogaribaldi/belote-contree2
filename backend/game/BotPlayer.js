class BotPlayer {
  constructor(gameLogic) {
    this.gameLogic = gameLogic;
  }

  makeBid(hand, currentBid) {
    // Bot semplice: passa sempre per ora
    // TODO: implementare logica più intelligente
    return { type: 'pass' };
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