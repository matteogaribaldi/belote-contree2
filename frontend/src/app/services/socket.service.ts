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

  createRoom(roomName: string) {
    this.socket.emit('createRoom', roomName);
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

  declareBelote(roomCode: string) {
    this.socket.emit('declareBelote', { roomCode });
  }

  getActiveRooms() {
    this.socket.emit('getActiveRooms');
  }

  deleteRoom(roomCode: string) {
    this.socket.emit('deleteRoom', roomCode);
  }

  setTargetScore(roomCode: string, targetScore: number) {
    this.socket.emit('setTargetScore', { roomCode, targetScore });
  }

  setAdvancedBotAI(roomCode: string, enabled: boolean) {
    this.socket.emit('setAdvancedBotAI', { roomCode, enabled });
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

  // Taribo-specific socket methods
  createTariboRoom(playerName: string) {
    this.socket.emit('taribo:createRoom', playerName);
  }

  joinTariboRoom(roomCode: string, playerName: string) {
    this.socket.emit('taribo:joinRoom', { roomCode, playerName });
  }

  chooseTariboPosition(roomCode: string, position: string) {
    this.socket.emit('taribo:choosePosition', { roomCode, position });
  }

  toggleTariboBot(roomCode: string, position: string) {
    this.socket.emit('taribo:toggleBot', { roomCode, position });
  }

  startTariboGame(roomCode: string) {
    this.socket.emit('taribo:startGame', roomCode);
  }

  placeTariboBid(roomCode: string, bid: any) {
    this.socket.emit('taribo:placeBid', { roomCode, bid });
  }

  playTariboCard(roomCode: string, card: any) {
    this.socket.emit('taribo:playCard', { roomCode, card });
  }

  nextTariboHand(roomCode: string) {
    this.socket.emit('taribo:nextHand', roomCode);
  }

  getTariboActiveRooms() {
    this.socket.emit('taribo:getActiveRooms');
  }

  deleteTariboRoom(roomCode: string) {
    this.socket.emit('taribo:deleteRoom', roomCode);
  }

  setTariboTargetScore(roomCode: string, targetScore: number) {
    this.socket.emit('taribo:setTargetScore', { roomCode, targetScore });
  }

  saveTariboGameSession(roomCode: string, playerName: string) {
    localStorage.setItem('belote_taribo_game', JSON.stringify({ roomCode, playerName }));
  }

  onTariboRoomCreated(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('taribo:roomCreated', (data) => observer.next(data));
    });
  }

  onTariboRoomJoined(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('taribo:roomJoined', (data) => observer.next(data));
    });
  }

  onTariboRoomState(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('taribo:roomState', (data) => observer.next(data));
    });
  }

  onTariboGameState(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('taribo:gameState', (data) => observer.next(data));
    });
  }

  onTariboActiveRoomsList(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('taribo:activeRoomsList', (data) => observer.next(data));
    });
  }
}