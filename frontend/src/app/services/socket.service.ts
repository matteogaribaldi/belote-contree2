import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;

  constructor() {
    this.socket = io(environment.socketUrl);

    // Tenta di riconnettersi automaticamente se c'è una partita salvata
    this.socket.on('connect', () => {
      const savedGame = localStorage.getItem('belote_game');
      if (savedGame) {
        const { roomCode, playerName } = JSON.parse(savedGame);
        console.log('Tentativo di riconnessione a', roomCode, 'come', playerName);
        this.reconnect(roomCode, playerName);
      }
    });
  }

  getSocketId(): string {
    return this.socket.id || '';
  }

  createRoom(playerName: string) {
    this.socket.emit('createRoom', playerName);
  }

  joinRoom(roomCode: string, playerName: string) {
    this.socket.emit('joinRoom', { roomCode, playerName });
  }

  choosePosition(roomCode: string, position: string) {
    this.socket.emit('choosePosition', { roomCode, position });
  }

  toggleBot(roomCode: string, position: string) {
    this.socket.emit('toggleBot', { roomCode, position });
  }

  startGame(roomCode: string) {
    this.socket.emit('startGame', roomCode);
  }

  placeBid(roomCode: string, bid: any) {
    this.socket.emit('placeBid', { roomCode, bid });
  }

  playCard(roomCode: string, card: any) {
    this.socket.emit('playCard', { roomCode, card });
  }

  nextHand(roomCode: string) {
    this.socket.emit('nextHand', roomCode);
  }

  getActiveRooms() {
    this.socket.emit('getActiveRooms');
  }

  deleteRoom(roomCode: string) {
    this.socket.emit('deleteRoom', roomCode);
  }

  reconnect(roomCode: string, playerName: string) {
    this.socket.emit('reconnect', { roomCode, playerName });
  }

  saveGameSession(roomCode: string, playerName: string) {
    localStorage.setItem('belote_game', JSON.stringify({ roomCode, playerName }));
  }

  clearGameSession() {
    localStorage.removeItem('belote_game');
  }

  onReconnected(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('reconnected', (data) => observer.next(data));
    });
  }

  onRoomCreated(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('roomCreated', (data) => observer.next(data));
    });
  }

  onRoomJoined(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('roomJoined', (data) => observer.next(data));
    });
  }

  onRoomState(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('roomState', (data) => observer.next(data));
    });
  }

  onGameState(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('gameState', (data) => observer.next(data));
    });
  }

  onError(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('error', (data) => observer.next(data));
    });
  }

  onActiveRoomsList(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('activeRoomsList', (data) => observer.next(data));
    });
  }

  onRoomDeleted(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('roomDeleted', (data) => observer.next(data));
    });
  }
}