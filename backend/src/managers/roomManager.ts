import { Room, Player, Faction, GameState, BattleReport } from '../types/game';
import { generateId } from '../utils/helpers';
import { saveRoom, getRoom, deleteRoom, listRooms, saveGameState, getGameState, saveBattleReport, getBattleReportFromStore } from '../redis/gameStore';
import { GameEngine } from '../game/GameEngine';

interface ActiveRoom {
  room: Room;
  gameEngine?: GameEngine;
  playerSockets: Map<string, any>;
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

export { activeRooms };
