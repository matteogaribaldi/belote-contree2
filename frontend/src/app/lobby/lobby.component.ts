import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SocketService } from '../services/socket.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.css']
})
export class LobbyComponent implements OnInit {
  playerName = '';
  roomCode = '';
  showJoinForm = false;

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
      alert(error.message);
    });
  }

  createRoom() {
    if (this.playerName.trim()) {
      this.socketService.createRoom(this.playerName.trim());
    }
  }

  joinRoom() {
    if (this.playerName.trim() && this.roomCode.trim()) {
      this.socketService.joinRoom(this.roomCode.trim().toUpperCase(), this.playerName.trim());
    }
  }

  toggleJoinForm() {
    this.showJoinForm = !this.showJoinForm;
    this.roomCode = '';
  }
}