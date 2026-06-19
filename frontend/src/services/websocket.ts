import { createSignal } from 'solid-js';
import type { GameState, Room, Player, WSMessage, ChatMessage, Faction, Position, BattleReport, AIDifficulty, AIDecisionLogEntry, PowerUpdate, RoundPowerRecord } from '../types/game';

export const [gameState, setGameState] = createSignal<GameState | null>(null);
export const [room, setRoom] = createSignal<Room | null>(null);
export const [player, setPlayer] = createSignal<Player | null>(null);
export const [isConnected, setIsConnected] = createSignal(false);
export const [chatMessages, setChatMessages] = createSignal<ChatMessage[]>([]);
export const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
export const [battleReport, setBattleReport] = createSignal<BattleReport | null>(null);
export const [isAIThinking, setIsAIThinking] = createSignal(false);
export const [isSinglePlayer, setIsSinglePlayer] = createSignal(false);

export const [aiDecisionLogs, setAiDecisionLogs] = createSignal<AIDecisionLogEntry[]>([]);
export const [powerUpdate, setPowerUpdate] = createSignal<PowerUpdate | null>(null);
export const [roundPowerHistory, setRoundPowerHistory] = createSignal<RoundPowerRecord[]>([]);
export const [aiDifficulty, setAiDifficulty] = createSignal<AIDifficulty>('normal');
export const [aiDifficultyChangeMsg, setAiDifficultyChangeMsg] = createSignal<string | null>(null);

class GameWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  get gameState(): GameState | null { return null as any; }
  setGameState!: (v: GameState | null) => void;

  get room(): Room | null { return null as any; }
  setRoom!: (v: Room | null) => void;

  get player(): Player | null { return null as any; }
  setPlayer!: (v: Player | null) => void;

  get isConnected(): boolean { return false as any; }
  setIsConnected!: (v: boolean) => void;

  get chatMessages(): ChatMessage[] { return [] as any; }
  setChatMessages!: (updater: any) => void;

  get errorMessage(): string | null { return null as any; }
  setErrorMessage!: (v: string | null) => void;

  get battleReport(): BattleReport | null { return null as any; }
  setBattleReport!: (v: BattleReport | null) => void;

  get isAIThinking(): boolean { return false as any; }
  setIsAIThinking!: (v: boolean) => void;

  get isSinglePlayer(): boolean { return false as any; }
  setIsSinglePlayer!: (v: boolean) => void;

  get aiDecisionLogs(): AIDecisionLogEntry[] { return [] as any; }
  setAiDecisionLogs!: (updater: any) => void;

  get powerUpdate(): PowerUpdate | null { return null as any; }
  setPowerUpdate!: (v: PowerUpdate | null) => void;

  get roundPowerHistory(): RoundPowerRecord[] { return [] as any; }
  setRoundPowerHistory!: (v: RoundPowerRecord[]) => void;

  get aiDifficulty(): AIDifficulty { return 'normal' as any; }
  setAiDifficulty!: (v: AIDifficulty) => void;

  get aiDifficultyChangeMsg(): string | null { return null as any; }
  setAiDifficultyChangeMsg!: (v: string | null) => void;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
      const wsUrl = `${protocol}//${host}:${port}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
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
        setIsConnected(false);
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
        setRoom(message.payload.room);
        setPlayer(message.payload.player);
        if (message.payload.isSinglePlayer) {
          setIsSinglePlayer(true);
        }
        localStorage.setItem('playerId', message.payload.playerId);
        localStorage.setItem('roomId', message.payload.room.id);
        break;

      case 'roomUpdated':
        setRoom(message.payload.room);
        if (player() && message.payload.room) {
          const updatedPlayer = message.payload.room.players.find(
            (p: any) => p.id === player()!.id
          );
          if (updatedPlayer) {
            setPlayer(updatedPlayer);
          }
        }
        break;

      case 'playerJoined':
        if (room()) {
          const updatedRoom = { ...room()! };
          updatedRoom.players = [...updatedRoom.players, message.payload.player];
          setRoom(updatedRoom);
        }
        break;

      case 'playerLeft':
        if (room()) {
          const updatedRoom = { ...room()! };
          updatedRoom.players = updatedRoom.players.filter(p => p.id !== message.payload.playerId);
          setRoom(updatedRoom);
        }
        break;

      case 'gameStarted':
        setGameState(message.payload.gameState);
        if (message.payload.isSinglePlayer) {
          setIsSinglePlayer(true);
        }
        if (room()) {
          const updatedRoom = { ...room()!, gameState: message.payload.gameState };
          setRoom(updatedRoom);
          if (!player() && localStorage.getItem('playerId')) {
            const savedPlayerId = localStorage.getItem('playerId');
            const roomPlayer = updatedRoom.players.find((p: any) => p.id === savedPlayerId);
            if (roomPlayer) {
              setPlayer(roomPlayer);
            }
          }
        }
        break;

      case 'aiThinking':
        setIsAIThinking(message.payload.thinking);
        break;

      case 'gameStateUpdate':
      case 'turnAdvanced':
        setGameState(message.payload.gameState);
        break;

      case 'gameState':
        setGameState(message.payload.gameState);
        break;

      case 'chatMessage':
        setChatMessages((prev: ChatMessage[]) => [...prev, message.payload]);
        break;

      case 'actionFailed':
        setErrorMessage(message.payload.message);
        setTimeout(() => setErrorMessage(null), 3000);
        break;

      case 'battleReport':
        setBattleReport(message.payload.battleReport);
        break;

      case 'aiDecisionLog':
        setAiDecisionLogs((prev: AIDecisionLogEntry[]) => {
          const updated = [message.payload, ...prev];
          return updated.slice(0, 30);
        });
        break;

      case 'powerUpdate':
        setPowerUpdate(message.payload);
        break;

      case 'roundSummary':
        if (message.payload.roundPowerHistory) {
          setRoundPowerHistory(message.payload.roundPowerHistory);
        }
        break;

      case 'aiDifficultyInfo':
        setAiDifficulty(message.payload.difficulty);
        break;

      case 'aiDifficultyChanged':
        setAiDifficulty(message.payload.difficulty);
        setAiDifficultyChangeMsg(`AI难度已切换为${message.payload.difficultyName}`);
        setTimeout(() => setAiDifficultyChangeMsg(null), 3000);
        break;

      case 'error':
        setErrorMessage(message.payload.message);
        setTimeout(() => setErrorMessage(null), 3000);
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

  createSinglePlayerRoom(playerName: string, playerFaction: Faction, aiDifficulty: AIDifficulty): void {
    this.send('createSinglePlayerRoom', { playerName, playerFaction, aiDifficulty });
  }

  startSinglePlayerGame(): void {
    this.send('startSinglePlayerGame', {});
  }

  switchAIDifficulty(difficulty: AIDifficulty): void {
    this.send('switchAIDifficulty', { difficulty });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    setIsSinglePlayer(false);
    setIsAIThinking(false);
  }
}

export const gameWS = new GameWebSocket();

Object.defineProperty(gameWS, 'gameState', { get: () => gameState() });
Object.defineProperty(gameWS, 'room', { get: () => room() });
Object.defineProperty(gameWS, 'player', { get: () => player() });
Object.defineProperty(gameWS, 'isConnected', { get: () => isConnected() });
Object.defineProperty(gameWS, 'chatMessages', { get: () => chatMessages() });
Object.defineProperty(gameWS, 'errorMessage', { get: () => errorMessage() });
Object.defineProperty(gameWS, 'battleReport', { get: () => battleReport() });
Object.defineProperty(gameWS, 'isAIThinking', { get: () => isAIThinking() });
Object.defineProperty(gameWS, 'isSinglePlayer', { get: () => isSinglePlayer() });
Object.defineProperty(gameWS, 'aiDecisionLogs', { get: () => aiDecisionLogs() });
Object.defineProperty(gameWS, 'powerUpdate', { get: () => powerUpdate() });
Object.defineProperty(gameWS, 'roundPowerHistory', { get: () => roundPowerHistory() });
Object.defineProperty(gameWS, 'aiDifficulty', { get: () => aiDifficulty() });
Object.defineProperty(gameWS, 'aiDifficultyChangeMsg', { get: () => aiDifficultyChangeMsg() });

gameWS.setGameState = setGameState;
gameWS.setRoom = setRoom;
gameWS.setPlayer = setPlayer;
gameWS.setIsConnected = setIsConnected;
gameWS.setChatMessages = setChatMessages as any;
gameWS.setErrorMessage = setErrorMessage;
gameWS.setBattleReport = setBattleReport;
gameWS.setIsAIThinking = setIsAIThinking;
gameWS.setIsSinglePlayer = setIsSinglePlayer;
gameWS.setAiDecisionLogs = setAiDecisionLogs as any;
gameWS.setPowerUpdate = setPowerUpdate;
gameWS.setRoundPowerHistory = setRoundPowerHistory;
gameWS.setAiDifficulty = setAiDifficulty;
gameWS.setAiDifficultyChangeMsg = setAiDifficultyChangeMsg;
