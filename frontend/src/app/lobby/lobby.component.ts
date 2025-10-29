import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.css'],
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
export class LobbyComponent implements OnInit {
  roomName = '';
  playerName = '';
  selectedRoomCode = '';
  showPlayerNameModal = false;
  showConfirmCreateModal = false;
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
    this.socketService.onRoomCreated().subscribe(data => {
      this.isCreatingRoom = false;
      // Dopo aver creato la stanza, mostra il modal per inserire il nome del giocatore
      this.selectedRoomCode = data.roomCode;
      this.showPlayerNameModal = true;
      // Aggiorna la lista delle stanze
      this.socketService.getActiveRooms();
    });

    this.socketService.onRoomJoined().subscribe(data => {
      localStorage.setItem('belote_playerName', data.playerName);
      this.router.navigate(['/waiting', data.roomCode]);
    });

    this.socketService.onError().subscribe(error => {
      this.isCreatingRoom = false;
      this.showError(error.message);
    });

    this.socketService.onActiveRoomsList().subscribe(rooms => {
      this.activeRooms = rooms;
    });

    this.socketService.getActiveRooms();
  }

  createRoom() {
    if (this.roomName.trim()) {
      // Se ci sono già tavoli attivi, mostra il popup di conferma
      if (this.activeRooms.length > 0) {
        this.showConfirmCreateModal = true;
      } else {
        // Altrimenti crea direttamente
        this.confirmCreateRoom();
      }
    } else {
      this.showError('Inserisci il nome del tavolo prima di crearlo');
    }
  }

  confirmCreateRoom() {
    this.isCreatingRoom = true;
    this.showConfirmCreateModal = false;
    this.socketService.createRoom(this.roomName.trim());
  }

  cancelCreateRoom() {
    this.showConfirmCreateModal = false;
  }

  selectRoom(roomCode: string) {
    this.selectedRoomCode = roomCode;
    this.showPlayerNameModal = true;
    this.playerName = '';
  }

  closePlayerNameModal() {
    this.showPlayerNameModal = false;
    this.selectedRoomCode = '';
    this.playerName = '';
  }

  joinRoomWithPlayerName() {
    if (this.playerName.trim() && this.selectedRoomCode) {
      this.socketService.joinRoom(this.selectedRoomCode, this.playerName.trim());
      this.closePlayerNameModal();
    } else {
      this.showError('Inserisci il tuo nome per unirti al tavolo');
    }
  }

  showError(message: string) {
    this.errorMessage = message;
    setTimeout(() => {
      this.errorMessage = '';
    }, 4000);
  }

  showInfo() {
    alert(`🎴 COME GIOCARE A BELOTTA

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

🃏 REGOLE DEL GIOCO:
Le regole seguono la tradizione della Belotte Bridgè come si gioca a San Lorenzo al Mare (IM).
Leggenda narra che il gioco si chiamasse "Belotte Bridgè", ma è probabilmente la variante nota come Belote Contrée.
Obiettivo: raggiungere 701 punti prima degli avversari.

Buon divertimento! 🎉`);
  }

  showHistory() {
    this.showHistoryModal = true;
    this.loadingHistory = true;

    const backendUrl = environment.socketUrl.replace(/\/$/, '');
    this.http.get<any>(`${backendUrl}/api/game-history?limit=50`).subscribe({
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
    this.http.get<any>(`${backendUrl}/api/player-stats`).subscribe({
      next: (data) => {
        this.playerStats = data.players || [];
      },
      error: (error) => {
        console.error('Errore nel caricare le statistiche giocatori:', error);
      }
    });

    // Carica lista partite
    this.http.get<any>(`${backendUrl}/api/games-list?limit=20`).subscribe({
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
}