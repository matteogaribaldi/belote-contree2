import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { AudioService } from '../services/audio.service';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate, state, keyframes } from '@angular/animations';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css'],
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px) scale(0.8)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ opacity: 0, transform: 'translateY(-10px) scale(0.8)' }))
      ])
    ]),
    trigger('cardDeal', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translate(-50vw, -50vh) scale(0.3) rotate(0deg)' }),
        animate('600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({ opacity: 1, transform: 'translate(0, 0) scale(1) rotate(0deg)' }))
      ])
    ]),
    trigger('cardPlay', [
      state('hand', style({ transform: 'translateY(0) scale(1) rotate(0deg)' })),
      state('table', style({ transform: 'translateY(-200px) scale(1.1) rotate(5deg)' })),
      transition('hand => table', [
        animate('500ms cubic-bezier(0.34, 1.56, 0.64, 1)')
      ])
    ]),
    trigger('trickCollect', [
      transition(':leave', [
        animate('600ms ease-in', keyframes([
          style({ opacity: 1, transform: 'scale(1) rotate(0deg)', offset: 0 }),
          style({ opacity: 1, transform: 'scale(1.1) rotate(5deg)', offset: 0.3 }),
          style({ opacity: 0, transform: 'scale(0.5) rotate(15deg) translateY(-100px)', offset: 1 })
        ]))
      ])
    ])
  ]
})
export class GameComponent implements OnInit, OnDestroy {
  roomCode = '';
  gameState: any = null;
  selectedBid: any = null;
  showTrickOverlay = false;
  showWinnerAnnouncement = false;
  showWinningCard = false;
  winningCardPosition: string = '';
  showInitialHands = false;
  timerPercentage = 100;
  private timerInterval: any;
  showBelotePopup = false;
  private belotePopupTimeout: any;

  // Animation state properties
  dealingCards = false;
  playingCardId: string | null = null;
  collectingTrick = false;
  cardAnimationStates: Map<string, string> = new Map(); 

  suitSymbols: any = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
  };

  suitNames: any = {
    hearts: 'Cuori',
    diamonds: 'Quadri',
    clubs: 'Fiori',
    spades: 'Picche'
  };

  bidPoints = [80, 90, 100, 110, 120, 130, 140, 150, 160, 'cappotto'];

  private subscriptions: Subscription[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private socketService: SocketService,
    public audioService: AudioService
  ) {}

  ngOnInit() {
    this.roomCode = this.route.snapshot.params['code'];

this.subscriptions.push(
  this.socketService.onGameState().subscribe(state => {
    const previousState = this.gameState;
    this.gameState = state;

    // Salva la sessione in localStorage quando ricevi lo stato di gioco
    const playerName = localStorage.getItem('belote_playerName');
    if (playerName) {
      this.socketService.saveGameSession(this.roomCode, playerName);
    }

    // Pulisci la sessione se la partita è finita
    if (state.gameOver) {
      this.socketService.clearGameSession();
      this.audioService.play('victory');
    }

    // Aggiorna timer quando cambia il turno
    if (!previousState || previousState.turnStartTime !== state.turnStartTime) {
      this.startTimer();
    }

    // Riproduci suono quando inizia una nuova mano
    if (previousState && !previousState.biddingPhase && state.biddingPhase) {
      this.audioService.play('newHand');
      this.audioService.play('shuffle');
      // Trigger card dealing animation
      this.triggerCardDealAnimation();
    }

    // Handle new hand dealt (from bidding to playing phase)
    if (previousState?.biddingPhase && !state.biddingPhase && state.hand?.length > 0) {
      this.triggerCardDealAnimation();
    }

    // Riproduci suono quando viene giocata una carta
    const previousTrickSize = previousState ? Object.keys(previousState.currentTrick || {}).length : 0;
    const currentTrickSize = Object.keys(state.currentTrick).length;
    if (currentTrickSize > previousTrickSize) {
      this.audioService.play('playCard');
    }

    // Riproduci suono Belote/Rebelote e mostra popup
    if (state.beloteRebelote?.announced &&
        (!previousState?.beloteRebelote?.announced)) {
      this.audioService.play('belote');

      // Mostra popup "+20 punti"
      this.showBelotePopup = true;

      // Nascondi popup dopo 4 secondi
      if (this.belotePopupTimeout) {
        clearTimeout(this.belotePopupTimeout);
      }
      this.belotePopupTimeout = setTimeout(() => {
        this.showBelotePopup = false;
      }, 4000);
    }

    // Mostra animazione vincitore quando un trick è completo (4 carte sul tavolo)
    const trickComplete = Object.keys(state.currentTrick).length === 4;
    const previousTrickComplete = previousState && Object.keys(previousState.currentTrick || {}).length === 4;

    if (trickComplete && !previousTrickComplete) {
      // Determina il vincitore dal lastTrick
      if (state.lastTrick?.winner) {
        this.winningCardPosition = state.lastTrick.winner;
      }

      // Prima: evidenzia subito la carta vincente
      this.showWinningCard = true;

      // Dopo 600ms: mostra popup verde con annuncio
      setTimeout(() => {
        this.audioService.play('winTrick');
        this.showWinnerAnnouncement = true;

        // Nascondi popup dopo 1.2 secondi
        setTimeout(() => {
          this.showWinnerAnnouncement = false;
        }, 1200);
      }, 600);
    }

    // Reset quando il trick viene pulito dal server - trigger collection animation
    if (!trickComplete && previousTrickComplete) {
      this.triggerTrickCollectionAnimation();
      setTimeout(() => {
        this.showWinningCard = false;
        this.winningCardPosition = '';
        this.collectingTrick = false;
      }, 700);
    }
  })
);

this.subscriptions.push(
  this.socketService.onReconnected().subscribe(data => {
    console.log('Riconnesso con successo!', data);
    // Il game state verrà inviato automaticamente dal server
  })
);

this.subscriptions.push(
  this.socketService.onError().subscribe(error => {
    console.error('Errore dalla stanza:', error);
    // Se la stanza non esiste, reindirizza alla lobby
    if (error.message && error.message.includes('non trovata')) {
      this.socketService.clearGameSession();
      this.router.navigate(['/']);
    }
  })
);

this.subscriptions.push(
  this.socketService.onRoomClosed().subscribe(data => {
    console.log('Tavolo chiuso:', data);
    this.socketService.clearGameSession();
    this.router.navigate(['/']);
  })
);

  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    if (this.belotePopupTimeout) {
      clearTimeout(this.belotePopupTimeout);
    }
  }

  isMyTurn(): boolean {
    return this.gameState && this.gameState.currentPlayer === this.gameState.position;
  }

  placeBid(type: string, suit?: string, points?: number | string) {
    if (!this.isMyTurn()) return;

    const bid: any = { type };
    if (type === 'bid' && suit && points) {
      bid.suit = suit;
      bid.points = points;
      this.audioService.play('bid');
    } else if (type === 'cappotto' && suit) {
      bid.type = 'cappotto';
      bid.suit = suit;
      bid.points = 250;
      this.audioService.play('bid');
    } else if (type === 'pass') {
      this.audioService.play('pass');
    } else if (type === 'contro' || type === 'surcontre') {
      this.audioService.play('bid');
    }

    this.socketService.placeBid(this.roomCode, bid);
    this.selectedBid = null;
  }

  playCard(card: any) {
    if (!this.isMyTurn() || this.gameState.biddingPhase) return;

    // Set animation state for this card
    const cardId = this.getCardId(card);
    this.playingCardId = cardId;
    this.cardAnimationStates.set(cardId, 'table');

    // Send play card request with slight delay for animation
    setTimeout(() => {
      this.socketService.playCard(this.roomCode, card);
      this.playingCardId = null;
    }, 100);
  }

  getCardClass(card: any): string {
    return card.suit === 'hearts' || card.suit === 'diamonds' ? 'red' : 'black';
  }

  getSuitSymbol(suit: string): string {
    return this.suitSymbols[suit] || suit;
  }

  getSuitName(suit: string): string {
    return this.suitNames[suit] || suit;
  }

  getMinBidPoints(): number {
    if (!this.gameState || !this.gameState.bids) return 80;

    const lastBid = [...this.gameState.bids].reverse().find((b: any) => b.bid.type === 'bid');
    return lastBid ? lastBid.bid.points + 10 : 80;
  }

  canBidPoints(points: number | string): boolean {
    if (points === 'cappotto') {
      return this.canBidCappotto();
    }
    return (points as number) >= this.getMinBidPoints();
  }

  selectBidSuit(suit: string) {
    this.selectedBid = { suit };
  }

  canContro(): boolean {
    if (!this.gameState || !this.gameState.bids) return false;

    // Deve esserci una puntata attiva
    const lastBid = [...this.gameState.bids].reverse().find((b: any) => b.bid.type === 'bid');
    if (!lastBid) return false;

    // Non deve esserci già un contro
    if (this.gameState.contro) return false;

    // Deve essere della squadra avversaria
    const bidderTeam = (lastBid.player === 'north' || lastBid.player === 'south') ? 'NS' : 'EW';
    const myTeam = (this.gameState.position === 'north' || this.gameState.position === 'south') ? 'NS' : 'EW';
    return bidderTeam !== myTeam;
  }

  canSurcontre(): boolean {
    if (!this.gameState || !this.gameState.bids) return false;

    // Deve esserci un contro attivo
    if (!this.gameState.contro) return false;

    // Non deve esserci già un surcontre
    if (this.gameState.surcontre) return false;

    // Trova l'ultima puntata
    const lastBid = [...this.gameState.bids].reverse().find((b: any) => b.bid.type === 'bid');
    if (!lastBid) return false;

    // Deve essere della squadra che ha fatto l'offerta originale
    const bidderTeam = (lastBid.player === 'north' || lastBid.player === 'south') ? 'NS' : 'EW';
    const myTeam = (this.gameState.position === 'north' || this.gameState.position === 'south') ? 'NS' : 'EW';
    return bidderTeam === myTeam;
  }

  placeContro() {
    if (!this.isMyTurn() || !this.canContro()) return;
    this.socketService.placeBid(this.roomCode, { type: 'contro' });
  }

  placeSurcontre() {
    if (!this.isMyTurn() || !this.canSurcontre()) return;
    this.socketService.placeBid(this.roomCode, { type: 'surcontre' });
  }

  canBidCappotto(): boolean {
    if (!this.gameState || !this.gameState.bids) return true;

    // Cappotto può essere dichiarato se non c'è già un altro cappotto
    const hasCappotto = this.gameState.bids.some((b: any) => b.bid.type === 'cappotto');
    return !hasCappotto;
  }

  isCappotto(points: any): boolean {
    return points === 'cappotto';
  }

  getPointsLabel(points: any): string {
    return points === 'cappotto' ? 'Cappotto' : points.toString();
  }

  getTrickPosition(position: string): string {
    const positions: any = {
      north: 'top',
      south: 'bottom',
      east: 'right',
      west: 'left'
    };
    return positions[position] || '';
  }

  getPositionLabel(position: string): string {
    // Se abbiamo i nomi dei giocatori nel gameState, usali
    if (this.gameState?.playerNames && this.gameState.playerNames[position]) {
      return this.gameState.playerNames[position];
    }

    // Altrimenti usa le etichette di default
    const labels: any = {
      north: 'Nord',
      south: 'Sud',
      east: 'Est',
      west: 'Ovest'
    };
    return labels[position] || position;
  }

  getTeamNames(team: string): string {
    if (!this.gameState?.playerNames) {
      return team === 'northSouth' ? 'Nord-Sud' : 'Est-Ovest';
    }

    if (team === 'northSouth') {
      const north = this.gameState.playerNames['north'] || 'Nord';
      const south = this.gameState.playerNames['south'] || 'Sud';
      return `${north} - ${south}`;
    } else {
      const east = this.gameState.playerNames['east'] || 'Est';
      const west = this.gameState.playerNames['west'] || 'Ovest';
      return `${east} - ${west}`;
    }
  }

  getContractTeam(): string {
    if (!this.gameState?.contract) return '';
    return this.gameState.contract.player === 'north' || this.gameState.contract.player === 'south' 
      ? 'northSouth' : 'eastWest';
  }

  isContractRespected(): boolean {
    if (!this.gameState?.finalScore || !this.gameState?.contract) return false;
    const contractTeam = this.getContractTeam();
    return this.gameState.finalScore[contractTeam] >= this.gameState.contract.bid.points;
  }

  isMyTeam(team: string): boolean {
    if (!this.gameState?.position) return false;
    const myPosition = this.gameState.position;
    if (team === 'northSouth') {
      return myPosition === 'north' || myPosition === 'south';
    } else {
      return myPosition === 'east' || myPosition === 'west';
    }
  }

  nextHand() {
    this.socketService.nextHand(this.roomCode);
  }

  goHome() {
    window.location.href = '/';
  }

  closeRoom() {
    if (confirm('Sei sicuro di voler chiudere il tavolo? Tutti i giocatori verranno disconnessi e la partita verrà cancellata.')) {
      this.socketService.closeRoom(this.roomCode);
    }
  }

  isDealer(position: string): boolean {
    return this.gameState?.dealer === position;
  }

  isFirstHand(position: string): boolean {
    return this.gameState?.firstPlayer === position;
  }

  getWinnerTeamName(): string {
    if (!this.gameState?.winner) return '';
    return this.getTeamNames(this.gameState.winner);
  }

  shouldShowSpeechBubble(position: string): boolean {
    if (!this.gameState?.lastSpeechBubble) return false;

    const bubble = this.gameState.lastSpeechBubble;

    // Mostra solo se è la posizione corretta
    if (bubble.position !== position) return false;

    // Mostra per 2 secondi dopo il timestamp
    const now = Date.now();
    const elapsed = now - bubble.timestamp;
    return elapsed < 2000;
  }

  toggleAudio() {
    this.audioService.toggle();
  }

  isWinningCard(position: string): boolean {
    return this.showWinningCard && this.winningCardPosition === position;
  }

  getCardsForSuit(hand: any[], suit: string): string {
    if (!hand) return '';

    const cardsInSuit = hand
      .filter(card => card.suit === suit)
      .map(card => card.rank);

    return cardsInSuit.length > 0 ? cardsInSuit.join(' ') : '-';
  }

  // Animation helper methods
  getCardId(card: any): string {
    return `${card.suit}-${card.rank}`;
  }

  getCardDelay(index: number): string {
    return `${index * 50}ms`;
  }

  triggerCardDealAnimation() {
    this.dealingCards = true;
    setTimeout(() => {
      this.dealingCards = false;
    }, 1000);
  }

  triggerTrickCollectionAnimation() {
    this.collectingTrick = true;
  }

  getCardAnimationState(card: any): string {
    const cardId = this.getCardId(card);
    return this.cardAnimationStates.get(cardId) || 'hand';
  }

  startTimer() {
    // Pulisci timer precedente
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    if (!this.gameState || !this.gameState.turnStartTime || !this.gameState.turnTimeoutMs) {
      console.log('Timer non avviato - dati mancanti:', {
        hasGameState: !!this.gameState,
        turnStartTime: this.gameState?.turnStartTime,
        turnTimeoutMs: this.gameState?.turnTimeoutMs
      });
      this.timerPercentage = 100;
      return;
    }

    console.log('Timer avviato:', {
      turnStartTime: this.gameState.turnStartTime,
      turnTimeoutMs: this.gameState.turnTimeoutMs,
      currentPlayer: this.gameState.currentPlayer
    });

    // Calcola subito il primo valore
    const now = Date.now();
    const elapsed = now - this.gameState.turnStartTime;
    const remaining = Math.max(0, this.gameState.turnTimeoutMs - elapsed);
    this.timerPercentage = (remaining / this.gameState.turnTimeoutMs) * 100;
    console.log('Timer percentage iniziale:', this.timerPercentage);

    // Aggiorna timer ogni 100ms
    this.timerInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.gameState.turnStartTime;
      const remaining = Math.max(0, this.gameState.turnTimeoutMs - elapsed);
      this.timerPercentage = (remaining / this.gameState.turnTimeoutMs) * 100;

      // Ferma il timer quando scade
      if (this.timerPercentage === 0) {
        clearInterval(this.timerInterval);
      }
    }, 100);
  }

  declareBelote() {
    if (this.gameState.biddingPhase) return;

    // Controlla se il giocatore ha K e Q di atout in mano
    const trump = this.gameState.trump;
    const hasKing = this.gameState.hand.some((c: any) => c.suit === trump && c.rank === 'K');
    const hasQueen = this.gameState.hand.some((c: any) => c.suit === trump && c.rank === 'Q');

    if (hasKing && hasQueen) {
      // Dichiara Belote
      this.socketService.declareBelote(this.roomCode);
    } else {
      // Mostra messaggio di sfida
      const messages = ['Dove vai?', 'Pollo!', 'Ti piacerebbe!'];
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      alert(randomMessage);
    }
  }

  // Helper methods for card validation
  getCardOrder(card: any, trump: string): number {
    const isTrump = card.suit === trump;

    if (isTrump) {
      const order: any = { 'J': 8, '9': 7, 'A': 6, '10': 5, 'K': 4, 'Q': 3, '8': 2, '7': 1 };
      return order[card.rank];
    } else {
      const order: any = { 'A': 8, '10': 7, 'K': 6, 'Q': 5, 'J': 4, '9': 3, '8': 2, '7': 1 };
      return order[card.rank];
    }
  }

  getPartner(position: string): string {
    const partners: any = {
      north: 'south',
      south: 'north',
      east: 'west',
      west: 'east'
    };
    return partners[position];
  }

  determineWinner(trick: any, trump: string, leadSuit: string): string | null {
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

  isPartnerWinning(trick: any, trump: string, leadSuit: string): boolean {
    const players = Object.keys(trick);
    if (players.length === 0) return false;

    const partner = this.getPartner(this.gameState.position);

    if (!trick[partner]) return false;

    const winningPlayer = this.determineWinner(trick, trump, leadSuit);
    return winningPlayer === partner;
  }

  isCardPlayable(card: any): boolean {
    if (!this.gameState || this.gameState.biddingPhase) return true;
    if (!this.isMyTurn()) return false;

    const hand = this.gameState.hand;
    const trick = this.gameState.currentTrick;
    const trump = this.gameState.trump;

    // Prima carta del trick
    if (Object.keys(trick).length === 0) {
      return true;
    }

    const leadCard = trick[Object.keys(trick)[0]];
    const leadSuit = leadCard.suit;

    // Devo seguire il seme se ce l'ho
    const hasSuit = hand.some((c: any) => c.suit === leadSuit);
    if (hasSuit && card.suit !== leadSuit) {
      return false;
    }

    // Se seguo il seme di atout, devo SEMPRE surclassare se posso
    if (hasSuit && leadSuit === trump && card.suit === trump) {
      const trumpsInTrick = Object.values(trick).filter((c: any) => c.suit === trump);
      if (trumpsInTrick.length > 0) {
        const highestTrump = trumpsInTrick.reduce((max: any, c: any) =>
          this.getCardOrder(c, trump) > this.getCardOrder(max, trump) ? c : max
        );

        const canSurpass = hand.some((c: any) =>
          c.suit === trump &&
          this.getCardOrder(c, trump) > this.getCardOrder(highestTrump, trump)
        );

        if (canSurpass && this.getCardOrder(card, trump) <= this.getCardOrder(highestTrump, trump)) {
          return false;
        }
      }
    }

    // Se non ho il seme
    if (!hasSuit) {
      const hasTrump = hand.some((c: any) => c.suit === trump);
      const partnerWinning = this.isPartnerWinning(trick, trump, leadSuit);

      // Se ho atout e il partner non sta vincendo, devo giocare atout
      if (hasTrump && !partnerWinning && card.suit !== trump) {
        return false;
      }

      // Se gioco atout, devo SEMPRE surclassare se posso
      if (card.suit === trump) {
        const trumpsInTrick = Object.values(trick).filter((c: any) => c.suit === trump);
        if (trumpsInTrick.length > 0) {
          const highestTrump = trumpsInTrick.reduce((max: any, c: any) =>
            this.getCardOrder(c, trump) > this.getCardOrder(max, trump) ? c : max
          );

          const canSurpass = hand.some((c: any) =>
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
}