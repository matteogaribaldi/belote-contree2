import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-taribo-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './taribo-lobby.component.html',
  styleUrls: ['./taribo-lobby.component.css'],
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
export class TariboLobbyComponent implements OnInit {
  playerName = '';
  roomCode = '';
  showJoinForm = false;
  activeRooms: any[] = [];
  errorMessage = '';
  isCreatingRoom = false;
  showHistoryModal = false;
  loadingHistory = false;
  gameHistory: any = null;
  showStatsModal = false;
  loadingStats = false;
  gameStats: any = null;
  playerStats: any[] = [];
  gamesList: any[] = [];

  constructor(
    private socketService: SocketService,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.socketService.onTariboRoomCreated().subscribe(data => {
      this.isCreatingRoom = false;
      this.router.navigate(['/taribo/waiting', data.roomCode]);
    });

    this.socketService.onTariboRoomJoined().subscribe(data => {
      this.router.navigate(['/taribo/waiting', data.roomCode]);
    });

    this.socketService.onError().subscribe(error => {
      this.isCreatingRoom = false;
      this.showError(error.message);
    });

    this.socketService.onTariboActiveRoomsList().subscribe(rooms => {
      this.activeRooms = rooms;
    });

    this.socketService.getTariboActiveRooms();
  }

  createRoom() {
    if (this.playerName.trim()) {
      this.isCreatingRoom = true;
      localStorage.setItem('belote_playerName', this.playerName.trim());
      // Cancella sessione precedente prima di creare una nuova room
      this.socketService.clearTariboGameSession();
      this.socketService.createTariboRoom(this.playerName.trim());
    } else {
      this.showError('Inserisci il tuo nome prima di creare una partita');
    }
  }

  joinRoom() {
    if (this.playerName.trim()) {
      localStorage.setItem('belote_playerName', this.playerName.trim());
      // Cancella sessione precedente prima di joinare una nuova room
      this.socketService.clearTariboGameSession();
      // Se c'è una stanza disponibile, entra automaticamente in quella
      if (this.activeRooms.length > 0) {
        this.socketService.joinTariboRoom(this.activeRooms[0].code, this.playerName.trim());
      } else {
        // Altrimenti usa il roomCode manuale se fornito
        if (this.roomCode.trim()) {
          this.socketService.joinTariboRoom(this.roomCode.trim().toUpperCase(), this.playerName.trim());
        } else {
          this.showError('Nessuna stanza disponibile');
        }
      }
    } else {
      this.showError('Inserisci il tuo nome prima di unirti a una partita');
    }
  }

  toggleJoinForm() {
    this.showJoinForm = !this.showJoinForm;
    this.roomCode = '';
  }

  joinActiveRoom(roomCode: string) {
    if (this.playerName.trim()) {
      localStorage.setItem('belote_playerName', this.playerName.trim());
      // Cancella sessione precedente prima di joinare una nuova room
      this.socketService.clearTariboGameSession();
      this.socketService.joinTariboRoom(roomCode, this.playerName.trim());
    } else {
      this.showError('Inserisci il tuo nome prima di unirti a una partita');
    }
  }

  showError(message: string) {
    this.errorMessage = message;
    setTimeout(() => {
      this.errorMessage = '';
    }, 4000);
  }

  showInfo() {
    alert(`🎴 COME GIOCARE A BELOTTA TARIBO (Belote Classica)

📝 CREAZIONE PARTITA:
1. Inserisci il tuo nome
2. Clicca "Crea Partita" per creare una nuova stanza
3. Condividi il codice stanza con gli amici

👥 UNISCITI A UNA PARTITA:
1. Inserisci il tuo nome
2. Clicca "Unisciti a Partita"
3. Inserisci il codice stanza condiviso dall'host
   OPPURE
   Scegli una partita dalla lista "Partite Attive"

🎮 CONFIGURAZIONE:
• Ogni giocatore sceglie una posizione (Nord, Est, Sud, Ovest)
• L'host può aggiungere bot per le posizioni vuote
• Servono 4 giocatori (umani o bot) per iniziare
• L'host avvia la partita quando tutti sono pronti

📱 RICONNESSIONE AUTOMATICA:
• Se ti disconnetti, hai 60 secondi per riconnetterti
• Riapri la pagina e verrai automaticamente riconnesso
• Il gioco continua con un bot temporaneo durante la disconnessione

🃏 REGOLE TARIBO (Belote Classica):
Belote Classica con regole francesi standard.
Differenze rispetto alla Contrée:
• Carta scoperta durante le puntate
• Puntate in due turni: Prendi/Passa, poi scelta seme/sans
• Dichiarazioni (tierce, cinquante, carré) dopo il primo trick
Obiettivo: raggiungere 501 punti prima degli avversari.

Buon divertimento! 🎉`);
  }

  showHistory() {
    this.showHistoryModal = true;
    this.loadingHistory = true;

    const backendUrl = environment.socketUrl.replace(/\/$/, '');
    this.http.get<any>(`${backendUrl}/api/taribo-game-history?limit=50`).subscribe({
      next: (data) => {
        this.gameHistory = data;
        this.loadingHistory = false;
      },
      error: (error) => {
        console.error('Errore nel caricare lo storico:', error);
        this.loadingHistory = false;
        this.showError('Errore nel caricare lo storico delle partite');
      }
    });
  }

  closeHistory() {
    this.showHistoryModal = false;
  }

  showStats() {
    this.showStatsModal = true;
    this.loadingStats = true;

    const backendUrl = environment.socketUrl.replace(/\/$/, '');

    // Carica statistiche giocatori
    this.http.get<any>(`${backendUrl}/api/taribo-player-stats`).subscribe({
      next: (data) => {
        this.playerStats = data.players || [];
      },
      error: (error) => {
        console.error('Errore nel caricare le statistiche giocatori:', error);
      }
    });

    // Carica lista partite
    this.http.get<any>(`${backendUrl}/api/taribo-games-list?limit=20`).subscribe({
      next: (data) => {
        this.gamesList = data.games || [];
        this.loadingStats = false;
      },
      error: (error) => {
        console.error('Errore nel caricare la lista partite:', error);
        this.loadingStats = false;
        this.showError('Errore nel caricare le statistiche');
      }
    });
  }

  closeStats() {
    this.showStatsModal = false;
  }

  formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ora';
    if (diffMins < 60) return `${diffMins} minuti fa`;
    if (diffHours < 24) return `${diffHours} ore fa`;
    if (diffDays < 7) return `${diffDays} giorni fa`;

    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getFormattedDate(dateString: string): string {
    const date = new Date(dateString);
    return this.formatDate(date.getTime());
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
