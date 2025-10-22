import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { AudioService } from '../services/audio.service';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate, state, keyframes } from '@angular/animations';

@Component({
  selector: 'app-taribo-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './taribo-game.component.html',
  styleUrls: ['./taribo-game.component.css'],
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
export class TariboGameComponent implements OnInit, OnDestroy {
  roomCode = '';
  gameState: any = null;
  showWinnerAnnouncement = false;
  showWinningCard = false;
  winningCardPosition: string = '';
  showInitialHands = false;
  timerPercentage = 100;
  private timerInterval: any;

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
      this.socketService.onTariboGameState().subscribe(state => {
        const previousState = this.gameState;
        this.gameState = state;

        // Salva la sessione in localStorage quando ricevi lo stato di gioco
        const playerName = localStorage.getItem('belote_playerName');
        if (playerName) {
          this.socketService.saveTariboGameSession(this.roomCode, playerName);
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

        // Riproduci suono Belote/Rebelote
        if (state.beloteRebelote?.announced &&
            (!previousState?.beloteRebelote?.announced)) {
          this.audioService.play('belote');
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
      })
    );

    this.subscriptions.push(
      this.socketService.onError().subscribe(error => {
        console.error('Errore dalla stanza:', error);
        if (error.message && error.message.includes('non trovata')) {
          this.socketService.clearGameSession();
          this.router.navigate(['/taribo']);
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  isMyTurn(): boolean {
    return this.gameState && this.gameState.currentPlayer === this.gameState.position;
  }

  placeBid(action: string, suit?: string) {
    if (!this.isMyTurn()) return;

    const bid: any = { type: action };
    if (action === 'take') {
      this.audioService.play('bid');
    } else if (action === 'pass') {
      this.audioService.play('pass');
    } else if (action === 'suit' && suit) {
      bid.suit = suit;
      this.audioService.play('bid');
    } else if (action === 'sans') {
      this.audioService.play('bid');
    }

    this.socketService.placeTariboBid(this.roomCode, bid);
  }

  playCard(card: any) {
    if (!this.isMyTurn() || this.gameState.biddingPhase) return;

    const cardId = this.getCardId(card);
    this.playingCardId = cardId;
    this.cardAnimationStates.set(cardId, 'table');

    setTimeout(() => {
      this.socketService.playTariboCard(this.roomCode, card);
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
    if (this.gameState?.playerNames && this.gameState.playerNames[position]) {
      return this.gameState.playerNames[position];
    }

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
    return this.gameState.finalScore[contractTeam] >= 82; // 82 is half of 162 + 2 (for rounding)
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
    this.socketService.nextTariboHand(this.roomCode);
  }

  goHome() {
    window.location.href = '/taribo';
  }

  isDealer(position: string): boolean {
    return this.gameState?.dealer === position;
  }

  getWinnerTeamName(): string {
    if (!this.gameState?.winner) return '';
    return this.getTeamNames(this.gameState.winner);
  }

  shouldShowSpeechBubble(position: string): boolean {
    if (!this.gameState?.lastSpeechBubble) return false;

    const bubble = this.gameState.lastSpeechBubble;

    if (bubble.position !== position) return false;

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
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    if (!this.gameState || !this.gameState.turnStartTime || !this.gameState.turnTimeoutMs) {
      this.timerPercentage = 100;
      return;
    }

    const now = Date.now();
    const elapsed = now - this.gameState.turnStartTime;
    const remaining = Math.max(0, this.gameState.turnTimeoutMs - elapsed);
    this.timerPercentage = (remaining / this.gameState.turnTimeoutMs) * 100;

    this.timerInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.gameState.turnStartTime;
      const remaining = Math.max(0, this.gameState.turnTimeoutMs - elapsed);
      this.timerPercentage = (remaining / this.gameState.turnTimeoutMs) * 100;

      if (this.timerPercentage === 0) {
        clearInterval(this.timerInterval);
      }
    }, 100);
  }

  // Taribo-specific: Check if we're in round 1 or round 2 of bidding
  isRound1Bidding(): boolean {
    return this.gameState?.biddingPhase && this.gameState?.biddingRound === 1;
  }

  isRound2Bidding(): boolean {
    return this.gameState?.biddingPhase && this.gameState?.biddingRound === 2;
  }

  // Check if declarations should be shown (after first trick)
  shouldShowDeclarations(): boolean {
    return this.gameState?.declarations && this.gameState?.tricksPlayed > 0;
  }

  getDeclarationsText(): string {
    if (!this.gameState?.declarations) return '';

    const decls: string[] = [];
    for (const position in this.gameState.declarations) {
      const playerDecls = this.gameState.declarations[position];
      if (playerDecls && playerDecls.length > 0) {
        const playerName = this.getPositionLabel(position);
        const declList = playerDecls.join(', ');
        decls.push(`${playerName}: ${declList}`);
      }
    }
    return decls.join(' | ');
  }
}
