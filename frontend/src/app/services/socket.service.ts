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

  getActiveRooms() {
    this.socket.emit('getActiveRooms');
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
}