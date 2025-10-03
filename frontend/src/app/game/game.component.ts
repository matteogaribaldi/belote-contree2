import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css']
})
export class GameComponent implements OnInit, OnDestroy {
  roomCode = '';
  gameState: any = null;
  selectedBid: any = null;
  showTrickOverlay = false;
  showWinnerAnnouncement = false; 

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
    private socketService: SocketService
  ) {}

  ngOnInit() {
    this.roomCode = this.route.snapshot.params['code'];

this.subscriptions.push(
  this.socketService.onGameState().subscribe(state => {
    const previousState = this.gameState;
    this.gameState = state;

    // Mostra animazione vincitore quando un trick è completo (4 carte sul tavolo)
    const trickComplete = Object.keys(state.currentTrick).length === 4;
    const previousTrickComplete = previousState && Object.keys(previousState.currentTrick || {}).length === 4;

    if (trickComplete && !previousTrickComplete) {
      // Nuovo trick completo, mostra animazione
      this.showWinnerAnnouncement = true;

      // Nascondi l'annuncio dopo 2 secondi
      setTimeout(() => {
        this.showWinnerAnnouncement = false;
      }, 2000);
    }
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
}