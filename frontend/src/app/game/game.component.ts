import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { AudioService } from '../services/audio.service';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate } from '@angular/animations';

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

  bidPoints = [80, 90, 100, 110, 120, 130, 140, 150, 160];

  private subscriptions: Subscription[] = [];

  constructor(
    private route: ActivatedRoute,
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

    // Riproduci suono quando inizia una nuova mano
    if (previousState && !previousState.biddingPhase && state.biddingPhase) {
      this.audioService.play('newHand');
      this.audioService.play('shuffle');
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

    // Reset quando il trick viene pulito dal server
    if (!trickComplete && previousTrickComplete) {
      this.showWinningCard = false;
      this.winningCardPosition = '';
    }
  })
);

this.subscriptions.push(
  this.socketService.onReconnected().subscribe(data => {
    console.log('Riconnesso con successo!', data);
    // Il game state verrà inviato automaticamente dal server
  })
);

  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  isMyTurn(): boolean {
    return this.gameState && this.gameState.currentPlayer === this.gameState.position;
  }

  placeBid(type: string, suit?: string, points?: number) {
    if (!this.isMyTurn()) return;

    const bid: any = { type };
    if (type === 'bid' && suit && points) {
      bid.suit = suit;
      bid.points = points;
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
    this.socketService.playCard(this.roomCode, card);
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

  canBidPoints(points: number): boolean {
    return points >= this.getMinBidPoints();
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

  canCappotto(): boolean {
    if (!this.gameState || !this.gameState.bids) return false;

    // Controlla se nessuno ha ancora fatto un'offerta (solo pass finora)
    const hasBid = this.gameState.bids.some((b: any) => b.bid.type === 'bid' || b.bid.type === 'cappotto');
    return !hasBid;
  }

  placeCappotto() {
    if (!this.isMyTurn() || !this.canCappotto()) return;

    // Il cappotto viene dichiarato senza seme (si giocano tutte le mani)
    this.socketService.placeBid(this.roomCode, { type: 'cappotto', points: 250 });
    this.audioService.play('bid');
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
}