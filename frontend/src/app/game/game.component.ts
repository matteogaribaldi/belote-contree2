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
    const previousTrick = this.gameState?.lastTrick;
    const newTrick = state.lastTrick;
    
    this.gameState = state;
    
    // Se c'è un nuovo trick completato, mostra l'overlay
    if (newTrick && (!previousTrick || JSON.stringify(newTrick) !== JSON.stringify(previousTrick))) {
      this.showTrickOverlay = true;
      
      // Nascondi dopo 2 secondi
      setTimeout(() => {
        this.showTrickOverlay = false;
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
    const labels: any = {
      north: 'Nord',
      south: 'Sud',
      east: 'Est',
      west: 'Ovest'
    };
    return labels[position] || position;
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
}