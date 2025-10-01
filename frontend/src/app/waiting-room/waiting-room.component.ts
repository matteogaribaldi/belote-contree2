import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-waiting-room',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './waiting-room.component.html',
  styleUrls: ['./waiting-room.component.css']
})
export class WaitingRoomComponent implements OnInit, OnDestroy {
  roomCode = '';
  roomState: any = null;
  mySocketId = '';
  positions = ['north', 'east', 'south', 'west'];
  positionLabels: any = {
    north: 'Nord',
    east: 'Est',
    south: 'Sud',
    west: 'Ovest'
  };

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
      this.socketService.onRoomState().subscribe(state => {
        this.roomState = state;
        console.log('Room State:', state);
        console.log('Host:', state.host);
        console.log('My ID:', this.mySocketId);
        
        if (state.state === 'playing') {
          this.router.navigate(['/game', this.roomCode]);
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  choosePosition(position: string) {
    if (this.isPositionAvailable(position)) {
      this.socketService.choosePosition(this.roomCode, position);
    }
  }

  toggleBot(position: string) {
    if (this.isHost()) {
      this.socketService.toggleBot(this.roomCode, position);
    }
  }

  startGame() {
    if (this.isHost() && this.allPositionsFilled()) {
      this.socketService.startGame(this.roomCode);
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
      return player.name;
    } else if (isBot) {
      return '🤖 BOT';
    } else {
      return 'Vuoto';
    }
  }

  copyRoomCode() {
    navigator.clipboard.writeText(this.roomCode);
    alert('Codice copiato!');
  }
}