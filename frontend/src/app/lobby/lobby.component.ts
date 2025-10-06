import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SocketService } from '../services/socket.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  playerName = '';
  roomCode = '';
  showJoinForm = false;
  activeRooms: any[] = [];
  errorMessage = '';

  constructor(
    private socketService: SocketService,
    private router: Router
  ) {}

  ngOnInit() {
    this.socketService.onRoomCreated().subscribe(data => {
      this.router.navigate(['/waiting', data.roomCode]);
    });

    this.socketService.onRoomJoined().subscribe(data => {
      this.router.navigate(['/waiting', data.roomCode]);
    });

    this.socketService.onError().subscribe(error => {
      this.showError(error.message);
    });

    this.socketService.onActiveRoomsList().subscribe(rooms => {
      this.activeRooms = rooms;
    });

    this.socketService.getActiveRooms();
  }

  createRoom() {
    if (this.playerName.trim()) {
      localStorage.setItem('belote_playerName', this.playerName.trim());
      this.socketService.createRoom(this.playerName.trim());
    } else {
      this.showError('Inserisci il tuo nome prima di creare una partita');
    }
  }

  joinRoom() {
    if (this.playerName.trim()) {
      localStorage.setItem('belote_playerName', this.playerName.trim());
      // Se c'è una stanza disponibile, entra automaticamente in quella
      if (this.activeRooms.length > 0) {
        this.socketService.joinRoom(this.activeRooms[0].code, this.playerName.trim());
      } else {
        // Altrimenti usa il roomCode manuale se fornito
        if (this.roomCode.trim()) {
          this.socketService.joinRoom(this.roomCode.trim().toUpperCase(), this.playerName.trim());
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
      this.socketService.joinRoom(roomCode, this.playerName.trim());
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
}