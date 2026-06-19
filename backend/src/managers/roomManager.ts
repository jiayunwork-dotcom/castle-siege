import { Room, Player, Faction, GameState, BattleReport, SinglePlayerConfig, AIDifficulty } from '../types/game';
import { generateId } from '../utils/helpers';
import { saveRoom, getRoom, deleteRoom, listRooms, saveGameState, getGameState, saveBattleReport, getBattleReportFromStore } from '../redis/gameStore';
import { GameEngine } from '../game/GameEngine';
import { AIEngine, getAIThinkingTime } from '../game/aiEngine';

interface ActiveRoom {
  room: Room;
  gameEngine?: GameEngine;
  playerSockets: Map<string, any>;
  isSinglePlayer?: boolean;
  aiEngine?: AIEngine;
  aiDifficulty?: AIDifficulty;
  aiThinking?: boolean;
  aiTimeout?: NodeJS.Timeout;
}

const activeRooms = new Map<string, ActiveRoom>();

export function createRoom(
  hostName: string,
  roomName: string,
  maxPlayers: number = 6,
  hasPassword: boolean = false
): { room: Room; player: Player } {
  const roomId = generateId();
  const playerId = generateId();

  const player: Player = {
    id: playerId,
    name: hostName,
    faction: 'defender',
    ready: false,
    connected: true,
  };

  const room: Room = {
    id: roomId,
    name: roomName,
    hostId: playerId,
    players: [player],
    createdAt: Date.now(),
    hasPassword,
    maxPlayers,
  };

  activeRooms.set(roomId, {
    room,
    playerSockets: new Map(),
  });

  saveRoom(room).catch(console.error);

  return { room, player };
}

export function joinRoom(roomId: string, playerName: string): { room: Room; player: Player } | { error: string } {
  const activeRoom = activeRooms.get(roomId);
  if (!activeRoom) {
    return { error: 'Room not found' };
  }

  if (activeRoom.room.players.length >= activeRoom.room.maxPlayers) {
    return { error: 'Room is full' };
  }

  if (activeRoom.room.gameState) {
    return { error: 'Game already started' };
  }

  const playerId = generateId();
  const faction = getAvailableFaction(activeRoom.room);

  const player: Player = {
    id: playerId,
    name: playerName,
    faction,
    ready: false,
    connected: true,
  };

  activeRoom.room.players.push(player);
  saveRoom(activeRoom.room).catch(console.error);

  return { room: activeRoom.room, player };
}

function getAvailableFaction(room: Room): Faction {
  const defenders = room.players.filter(p => p.faction === 'defender').length;
  const attackers = room.players.filter(p => p.faction === 'attacker').length;

  const maxPerTeam = Math.floor(room.maxPlayers / 2);

  if (attackers < defenders && attackers < maxPerTeam) {
    return 'attacker';
  }
  if (defenders < maxPerTeam) {
    return 'defender';
  }
  return 'attacker';
}

export function setPlayerFaction(roomId: string, playerId: string, faction: Faction): Room | { error: string } {
  const activeRoom = activeRooms.get(roomId);
  if (!activeRoom) {
    return { error: 'Room not found' };
  }

  const player = activeRoom.room.players.find(p => p.id === playerId);
  if (!player) {
    return { error: 'Player not found' };
  }

  const maxPerTeam = Math.floor(activeRoom.room.maxPlayers / 2);
  const factionCount = activeRoom.room.players.filter(p => p.faction === faction).length;

  if (factionCount >= maxPerTeam && player.faction !== faction) {
    return { error: 'Faction is full' };
  }

  player.faction = faction;
  saveRoom(activeRoom.room).catch(console.error);

  return activeRoom.room;
}

export function togglePlayerReady(roomId: string, playerId: string): Room | { error: string } {
  const activeRoom = activeRooms.get(roomId);
  if (!activeRoom) {
    return { error: 'Room not found' };
  }

  const player = activeRoom.room.players.find(p => p.id === playerId);
  if (!player) {
    return { error: 'Player not found' };
  }

  player.ready = !player.ready;
  saveRoom(activeRoom.room).catch(console.error);

  return activeRoom.room;
}

export function startGame(roomId: string, hostPlayerId: string): { gameState: GameState } | { error: string } {
  const activeRoom = activeRooms.get(roomId);
  if (!activeRoom) {
    return { error: 'Room not found' };
  }

  if (activeRoom.room.hostId !== hostPlayerId) {
    return { error: 'Only host can start the game' };
  }

  const defenders = activeRoom.room.players.filter(p => p.faction === 'defender').length;
  const attackers = activeRoom.room.players.filter(p => p.faction === 'attacker').length;

  if (defenders < 1 || attackers < 1) {
    return { error: 'Both factions must have at least 1 player' };
  }

  const readyPlayers = activeRoom.room.players.filter(p => p.ready).length;
  if (readyPlayers < activeRoom.room.players.length) {
    return { error: 'All players must be ready' };
  }

  const gameEngine = new GameEngine(roomId);
  gameEngine.setPlayers(activeRoom.room.players);
  const gameState = gameEngine.startGame();

  activeRoom.gameEngine = gameEngine;
  activeRoom.room.gameState = gameState;

  saveRoom(activeRoom.room).catch(console.error);
  saveGameState(roomId, gameState).catch(console.error);

  return { gameState };
}

export function getActiveRoom(roomId: string): ActiveRoom | undefined {
  return activeRooms.get(roomId);
}

export function getGameEngine(roomId: string): GameEngine | undefined {
  return activeRooms.get(roomId)?.gameEngine;
}

export function registerPlayerSocket(roomId: string, playerId: string, socket: any): void {
  const activeRoom = activeRooms.get(roomId);
  if (activeRoom) {
    activeRoom.playerSockets.set(playerId, socket);
  }
}

export function removePlayerSocket(roomId: string, playerId: string): void {
  const activeRoom = activeRooms.get(roomId);
  if (activeRoom) {
    activeRoom.playerSockets.delete(playerId);
  }
}

export function broadcastToRoom(roomId: string, message: any, excludePlayerId?: string): void {
  const activeRoom = activeRooms.get(roomId);
  if (!activeRoom) return;

  activeRoom.playerSockets.forEach((socket, playerId) => {
    if (playerId !== excludePlayerId && socket.readyState === 1) {
      socket.send(JSON.stringify(message));
    }
  });
}

export function sendToPlayer(roomId: string, playerId: string, message: any): void {
  const activeRoom = activeRooms.get(roomId);
  if (!activeRoom) return;

  const socket = activeRoom.playerSockets.get(playerId);
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}

export function getBattleReport(roomId: string): BattleReport | null {
  const activeRoom = activeRooms.get(roomId);
  if (activeRoom?.gameEngine) {
    const report = activeRoom.gameEngine.getBattleReport();
    if (report) {
      saveBattleReport(roomId, report).catch(console.error);
      return report;
    }
  }
  return null;
}

export async function getBattleReportAsync(roomId: string): Promise<BattleReport | null> {
  const activeRoom = activeRooms.get(roomId);
  if (activeRoom?.gameEngine) {
    const report = activeRoom.gameEngine.getBattleReport();
    if (report) {
      await saveBattleReport(roomId, report);
      return report;
    }
  }
  return await getBattleReportFromStore(roomId);
}

export function createSinglePlayerRoom(config: SinglePlayerConfig): { room: Room; player: Player; gameState: GameState } {
  const roomId = generateId();
  const playerId = generateId();
  const aiPlayerId = generateId();

  const aiFaction: Faction = config.playerFaction === 'attacker' ? 'defender' : 'attacker';

  const player: Player = {
    id: playerId,
    name: config.playerName,
    faction: config.playerFaction,
    ready: true,
    connected: true,
  };

  const aiPlayer: Player = {
    id: aiPlayerId,
    name: `AI对手(${config.aiDifficulty === 'easy' ? '简单' : config.aiDifficulty === 'normal' ? '普通' : '困难'})`,
    faction: aiFaction,
    ready: true,
    connected: true,
  };

  const room: Room = {
    id: roomId,
    name: '单人练习',
    hostId: playerId,
    players: [player, aiPlayer],
    createdAt: Date.now(),
    hasPassword: false,
    maxPlayers: 2,
  };

  const activeRoomEntry: any = {
    room,
    playerSockets: new Map(),
    isSinglePlayer: true,
    aiDifficulty: config.aiDifficulty,
  };

  activeRooms.set(roomId, activeRoomEntry);

  const gameEngine = new GameEngine(roomId);
  gameEngine.setPlayers([player, aiPlayer]);
  const gameState = gameEngine.startGame();

  activeRoomEntry.aiEngine = new AIEngine(gameState, aiFaction, config.aiDifficulty);
  activeRoomEntry.gameEngine = gameEngine;
  room.gameState = gameState;

  saveRoom(room).catch(console.error);
  saveGameState(roomId, gameState).catch(console.error);

  return { room, player, gameState };
}

export function startSinglePlayerGame(roomId: string, hostPlayerId: string): { gameState: GameState } | { error: string } {
  const activeRoom = activeRooms.get(roomId);
  if (!activeRoom) {
    return { error: 'Room not found' };
  }

  if (!activeRoom.isSinglePlayer) {
    return { error: 'Not a single player room' };
  }

  if (activeRoom.room.hostId !== hostPlayerId) {
    return { error: 'Only host can start the game' };
  }

  const gameEngine = new GameEngine(roomId);
  gameEngine.setPlayers(activeRoom.room.players);
  const gameState = gameEngine.startGame();

  const aiFaction = activeRoom.room.players.find(p => p.id !== hostPlayerId)?.faction;
  if (aiFaction && activeRoom.aiDifficulty) {
    activeRoom.aiEngine = new AIEngine(gameState, aiFaction, activeRoom.aiDifficulty);
  }

  activeRoom.gameEngine = gameEngine;
  activeRoom.room.gameState = gameState;

  saveRoom(activeRoom.room).catch(console.error);
  saveGameState(roomId, gameState).catch(console.error);

  return { gameState };
}

export function isAITurn(roomId: string): boolean {
  const activeRoom = activeRooms.get(roomId);
  if (!activeRoom || !activeRoom.isSinglePlayer || !activeRoom.aiEngine) return false;

  const state = activeRoom.gameEngine?.getState();
  if (!state) return false;

  return state.currentFaction === activeRoom.aiEngine.getFaction() && state.phase !== 'ended';
}

export function getAIThinkingTimeForRoom(roomId: string): number {
  const activeRoom = activeRooms.get(roomId);
  if (!activeRoom || !activeRoom.aiDifficulty) return 1500;
  return getAIThinkingTime(activeRoom.aiDifficulty);
}

export function setAIThinking(roomId: string, thinking: boolean): void {
  const activeRoom = activeRooms.get(roomId);
  if (activeRoom) {
    activeRoom.aiThinking = thinking;
  }
}

export function isAIThinking(roomId: string): boolean {
  const activeRoom = activeRooms.get(roomId);
  return activeRoom?.aiThinking || false;
}

export function processAITurn(roomId: string): GameState | null {
  const activeRoom = activeRooms.get(roomId);
  if (!activeRoom || !activeRoom.gameEngine || !activeRoom.aiEngine) return null;

  let state = activeRoom.gameEngine.getState();
  const aiFaction = activeRoom.aiEngine.getFaction();
  let iterationCount = 0;
  const MAX_ITERATIONS = 20;

  while (state.currentFaction === aiFaction && state.phase !== 'ended' && iterationCount < MAX_ITERATIONS) {
    iterationCount++;
    activeRoom.aiEngine.updateState(state);
    const decisions = activeRoom.aiEngine.makeDecisions();

    for (const decision of decisions) {
      const currentState = activeRoom.gameEngine!.getState();
      if (currentState.phase === 'ended') break;
      if (currentState.currentFaction !== aiFaction) break;

      switch (decision.type) {
        case 'move':
          if (decision.unitId && decision.targetPosition) {
            try {
              activeRoom.gameEngine.moveUnit(decision.unitId, decision.targetPosition, aiFaction);
            } catch (e) {
              console.error('AI moveUnit error:', e);
            }
          }
          break;
        case 'attack':
          if (decision.unitId && decision.targetId && decision.targetType) {
            try {
              const currentStateForCheck = activeRoom.gameEngine!.getState();
              const isSiegeEngine = currentStateForCheck.siegeEngines.some(e => e.id === decision.unitId);
              if (isSiegeEngine) {
                if (decision.targetType === 'defense' || decision.targetType === 'unit') {
                  activeRoom.gameEngine.siegeAttack(decision.unitId, decision.targetId, decision.targetType as any, aiFaction);
                }
              } else {
                activeRoom.gameEngine.attackUnit(decision.unitId, decision.targetId, decision.targetType, aiFaction);
              }
            } catch (e) {
              console.error('AI attack error:', e);
            }
          }
          break;
        case 'build':
          if (decision.structureType && decision.targetPosition) {
            try {
              activeRoom.gameEngine.build(decision.structureType as any, decision.targetPosition);
            } catch (e) {
              console.error('AI build error:', e);
            }
          }
          break;
        case 'repair':
          if (decision.structureId && decision.amount) {
            try {
              activeRoom.gameEngine.repair(decision.structureId, decision.amount);
            } catch (e) {
              console.error('AI repair error:', e);
            }
          }
          break;
        case 'endPhase':
          try {
            activeRoom.gameEngine.endSubPhase();
          } catch (e) {
            console.error('AI endSubPhase error:', e);
          }
          break;
      }
    }

    state = activeRoom.gameEngine.getState();
  }

  if (iterationCount >= MAX_ITERATIONS) {
    console.warn(`AI turn exceeded max iterations (${MAX_ITERATIONS}), forcing turn advance`);
    try {
      while (state.currentFaction === aiFaction && state.phase !== 'ended') {
        activeRoom.gameEngine.endSubPhase();
        state = activeRoom.gameEngine.getState();
      }
    } catch (e) {
      console.error('Force turn advance error:', e);
    }
  }

  const newState = activeRoom.gameEngine.getState();
  saveGameState(roomId, newState).catch(console.error);

  return newState;
}

export function setAITimeout(roomId: string, timeout: NodeJS.Timeout): void {
  const activeRoom = activeRooms.get(roomId);
  if (activeRoom) {
    activeRoom.aiTimeout = timeout;
  }
}

export function clearAITimeout(roomId: string): void {
  const activeRoom = activeRooms.get(roomId);
  if (activeRoom?.aiTimeout) {
    clearTimeout(activeRoom.aiTimeout);
    activeRoom.aiTimeout = undefined;
  }
}

export function isSinglePlayerRoom(roomId: string): boolean {
  const activeRoom = activeRooms.get(roomId);
  return activeRoom?.isSinglePlayer || false;
}

export { activeRooms };
