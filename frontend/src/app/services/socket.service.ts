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

  closeRoom(roomCode: string) {
    this.socket.emit('closeRoom', { roomCode });
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

  clearTariboGameSession() {
    localStorage.removeItem('belote_taribo_game');
  }

  onReconnected(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('reconnected', handler);
      return () => this.socket.off('reconnected', handler);
    });
  }

  onRoomCreated(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('roomCreated', handler);
      return () => this.socket.off('roomCreated', handler);
    });
  }

  onRoomJoined(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('roomJoined', handler);
      return () => this.socket.off('roomJoined', handler);
    });
  }

  onRoomState(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('roomState', handler);
      return () => this.socket.off('roomState', handler);
    });
  }

  onGameState(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('gameState', handler);
      return () => this.socket.off('gameState', handler);
    });
  }

  onError(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('error', handler);
      return () => this.socket.off('error', handler);
    });
  }

  onActiveRoomsList(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('activeRoomsList', handler);
      return () => this.socket.off('activeRoomsList', handler);
    });
  }

  onRoomDeleted(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('roomDeleted', handler);
      return () => this.socket.off('roomDeleted', handler);
    });
  }

  onRoomClosed(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('roomClosed', handler);
      return () => this.socket.off('roomClosed', handler);
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
      const handler = (data: any) => observer.next(data);
      this.socket.on('taribo:roomCreated', handler);
      return () => this.socket.off('taribo:roomCreated', handler);
    });
  }

  onTariboRoomJoined(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('taribo:roomJoined', handler);
      return () => this.socket.off('taribo:roomJoined', handler);
    });
  }

  onTariboRoomState(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('taribo:roomState', handler);
      return () => this.socket.off('taribo:roomState', handler);
    });
  }

  onTariboGameState(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('taribo:gameState', handler);
      return () => this.socket.off('taribo:gameState', handler);
    });
  }

  onTariboActiveRoomsList(): Observable<any> {
    return new Observable(observer => {
      const handler = (data: any) => observer.next(data);
      this.socket.on('taribo:activeRoomsList', handler);
      return () => this.socket.off('taribo:activeRoomsList', handler);
    });
  }
}