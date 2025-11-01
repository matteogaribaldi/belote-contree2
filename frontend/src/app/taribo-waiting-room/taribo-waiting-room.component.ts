import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { Subscription } from 'rxjs';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-taribo-waiting-room',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './taribo-waiting-room.component.html',
  styleUrls: ['./taribo-waiting-room.component.css'],
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ opacity: 0, transform: 'translateY(-20px)' }))
      ])
    ])
  ]
})
export class TariboWaitingRoomComponent implements OnInit, OnDestroy {
  roomCode = '';
  roomState: any = null;
  mySocketId = '';
  myPlayerName = '';
  positions = ['north', 'east', 'south', 'west'];
  positionLabels: any = {
    north: 'Nord',
    east: 'Est',
    south: 'Sud',
    west: 'Ovest'
  };
  notification = '';
  notificationType: 'success' | 'error' | 'info' = 'info';

  private subscriptions: Subscription[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private socketService: SocketService
  ) {}

  ngOnInit() {
    this.roomCode = this.route.snapshot.params['code'];

    // Ottieni il socket ID
    setTimeout(() => {
      this.mySocketId = this.socketService.getSocketId();
      console.log('My Socket ID:', this.mySocketId);
    }, 100);

    this.subscriptions.push(
      this.socketService.onTariboRoomState().subscribe(state => {
        this.roomState = state;
        console.log('Taribo Room State:', state);
        console.log('Host:', state.host);
        console.log('My ID:', this.mySocketId);

        // Trova il nome del giocatore corrente
        for (let pos in state.players) {
          if (state.players[pos]?.id === this.mySocketId) {
            this.myPlayerName = state.players[pos].name;
            break;
          }
        }

        if (state.state === 'playing') {
          this.router.navigate(['/taribo/game', this.roomCode]);
        }
      })
    );

    this.subscriptions.push(
      this.socketService.onRoomDeleted().subscribe(data => {
        this.showNotification(data.message, 'info');
        setTimeout(() => this.router.navigate(['/taribo']), 2000);
      })
    );

    this.subscriptions.push(
      this.socketService.onError().subscribe(error => {
        console.error('Errore dalla stanza:', error);
        // Se la stanza non esiste, reindirizza alla lobby
        if (error.message && error.message.includes('non trovata')) {
          this.socketService.clearGameSession();
          this.router.navigate(['/taribo']);
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  choosePosition(position: string) {
    if (this.isPositionAvailable(position)) {
      this.socketService.chooseTariboPosition(this.roomCode, position);
    }
  }

  toggleBot(position: string) {
    if (this.isHost()) {
      this.socketService.toggleTariboBot(this.roomCode, position);
    }
  }

  startGame() {
    if (this.isHost() && this.allPositionsFilled()) {
      this.socketService.startTariboGame(this.roomCode);
    }
  }

  isPositionAvailable(position: string): boolean {
    if (!this.roomState) return false;
    return this.roomState.players[position] === null && !this.roomState.bots[position];
  }

  isMyPosition(position: string): boolean {
    if (!this.roomState) return false;
    return this.roomState.players[position]?.id === this.mySocketId;
  }

  isHost(): boolean {
    if (!this.roomState || !this.mySocketId) return false;
    return this.roomState.host === this.mySocketId;
  }

  allPositionsFilled(): boolean {
    if (!this.roomState) return false;
    return this.positions.every(pos =>
      this.roomState.players[pos] !== null || this.roomState.bots[pos]
    );
  }

  getPositionDisplay(position: string): string {
    if (!this.roomState) return '';

    const player = this.roomState.players[position];
    const isBot = this.roomState.bots[position];

    if (player) {
      // Se è il giocatore corrente, mostra "Tu (Nome)"
      if (player.id === this.mySocketId) {
        return `Tu (${player.name})`;
      }
      return player.name;
    } else if (isBot) {
      return '🤖 BOT';
    } else {
      return 'Vuoto';
    }
  }

  copyRoomCode() {
    const fullUrl = `https://www.belotta.net/taribo/waiting/${this.roomCode}`;
    navigator.clipboard.writeText(fullUrl);
    this.showNotification('Link copiato!', 'success');
  }

  showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
    this.notification = message;
    this.notificationType = type;
    setTimeout(() => {
      this.notification = '';
    }, 3000);
  }

  deleteRoom() {
    if (confirm('Sei sicuro di voler cancellare il tavolo?')) {
      this.socketService.deleteTariboRoom(this.roomCode);
      this.router.navigate(['/taribo']);
    }
  }

  goBack() {
    this.router.navigate(['/taribo']);
  }

  setTargetScore(score: number) {
    if (this.isHost()) {
      this.socketService.setTariboTargetScore(this.roomCode, score);
    }
  }
}
