import { createSignal } from 'solid-js';
import type { GameState, Room, Player, WSMessage, ChatMessage, Faction, Position, BattleReport } from '../types/game';

class GameWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private _gameState = createSignal<GameState | null>(null);
  private _room = createSignal<Room | null>(null);
  private _player = createSignal<Player | null>(null);
  private _isConnected = createSignal(false);
  private _chatMessages = createSignal<ChatMessage[]>([]);
  private _errorMessage = createSignal<string | null>(null);
  private _battleReport = createSignal<BattleReport | null>(null);

  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  get gameState() {
    return this._gameState[0]();
  }

  get room() {
    return this._room[0]();
  }

  get player() {
    return this._player[0]();
  }

  get isConnected() {
    return this._isConnected[0]();
  }

  get chatMessages() {
    return this._chatMessages[0]();
  }

  get errorMessage() {
    return this._errorMessage[0]();
  }

  get battleReport() {
    return this._battleReport[0]();
  }

  setGameState = (value: GameState | null) => this._gameState[1](value);
  setRoom = (value: Room | null) => this._room[1](value);
  setPlayer = (value: Player | null) => this._player[1](value);
  setIsConnected = (value: boolean) => this._isConnected[1](value);
  setChatMessages = (updater: any) => this._chatMessages[1](updater);
  setErrorMessage = (value: string | null) => this._errorMessage[1](value);
  setBattleReport = (value: BattleReport | null) => this._battleReport[1](value);

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
      const wsUrl = `${protocol}//${host}:${port}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.setIsConnected(true);
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.setIsConnected(false);
        this.attemptReconnect();
      };
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => {
        this.connect().catch(() => {});
      }, 2000 * this.reconnectAttempts);
    }
  }

  private handleMessage(message: WSMessage): void {
    console.log('Received message:', message.type, message.payload);

    switch (message.type) {
      case 'roomCreated':
      case 'roomJoined':
        this.setRoom(message.payload.room);
        this.setPlayer(message.payload.player);
        localStorage.setItem('playerId', message.payload.playerId);
        localStorage.setItem('roomId', message.payload.room.id);
        break;

      case 'roomUpdated':
        this.setRoom(message.payload.room);
        if (this.player && message.payload.room) {
          const updatedPlayer = message.payload.room.players.find(
            (p: any) => p.id === this.player!.id
          );
          if (updatedPlayer) {
            this.setPlayer(updatedPlayer);
          }
        }
        break;

      case 'playerJoined':
        if (this.room) {
          const updatedRoom = { ...this.room! };
          updatedRoom.players = [...updatedRoom.players, message.payload.player];
          this.setRoom(updatedRoom);
        }
        break;

      case 'playerLeft':
        if (this.room) {
          const updatedRoom = { ...this.room! };
          updatedRoom.players = updatedRoom.players.filter(p => p.id !== message.payload.playerId);
          this.setRoom(updatedRoom);
        }
        break;

      case 'gameStarted':
        this.setGameState(message.payload.gameState);
        if (this.room) {
          const updatedRoom = { ...this.room!, gameState: message.payload.gameState };
          this.setRoom(updatedRoom);
        }
        break;

      case 'gameStateUpdate':
      case 'turnAdvanced':
        this.setGameState(message.payload.gameState);
        break;

      case 'gameState':
        this.setGameState(message.payload.gameState);
        break;

      case 'chatMessage':
        this.setChatMessages((prev: ChatMessage[]) => [...prev, message.payload]);
        break;

      case 'actionFailed':
        this.setErrorMessage(message.payload.message);
        setTimeout(() => this.setErrorMessage(null), 3000);
        break;

      case 'battleReport':
        this.setBattleReport(message.payload.battleReport);
        break;

      case 'error':
        this.setErrorMessage(message.payload.message);
        setTimeout(() => this.setErrorMessage(null), 3000);
        break;
    }

    const listeners = this.listeners.get(message.type);
    if (listeners) {
      listeners.forEach(callback => callback(message.payload));
    }
  }

  send(type: string, payload: any = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected');
      return;
    }

    const message: WSMessage = { type, payload };
    this.ws.send(JSON.stringify(message));
  }

  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: (data: any) => void): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      this.listeners.set(event, listeners.filter(cb => cb !== callback));
    }
  }

  createRoom(playerName: string, roomName: string, maxPlayers: number = 6): void {
    this.send('createRoom', { playerName, roomName, maxPlayers });
  }

  joinRoom(roomId: string, playerName: string): void {
    this.send('joinRoom', { roomId, playerName });
  }

  setFaction(faction: Faction): void {
    this.send('setFaction', { faction });
  }

  toggleReady(): void {
    this.send('toggleReady', {});
  }

  startGame(): void {
    this.send('startGame', {});
  }

  moveUnit(unitId: string, targetPosition: Position): void {
    this.send('moveUnit', { unitId, targetPosition });
  }

  attack(attackerId: string, targetId: string, targetType: 'unit' | 'defense' | 'siegeEngine'): void {
    this.send('attack', { attackerId, targetId, targetType });
  }

  siegeAttack(engineId: string, targetId: string, targetType: 'defense' | 'unit'): void {
    this.send('siegeAttack', { engineId, targetId, targetType });
  }

  build(structureType: string, position: Position, wallSection?: string): void {
    this.send('build', { structureType, position, wallSection });
  }

  repair(structureId: string, amount: number): void {
    this.send('repair', { structureId, amount });
  }

  trainUnit(unitType: string, position: Position): void {
    this.send('trainUnit', { unitType, position });
  }

  endSubPhase(): void {
    this.send('endSubPhase', {});
  }

  getGameState(): void {
    this.send('getGameState', {});
  }

  sendChat(message: string): void {
    this.send('chat', { message });
  }

  requestBattleReport(): void {
    this.send('getBattleReport', {});
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const gameWS = new GameWebSocket();
