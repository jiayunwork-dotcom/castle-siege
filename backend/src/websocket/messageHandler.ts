import { WSMessage, Position } from '../types/game';
import {
  createRoom,
  joinRoom,
  setPlayerFaction,
  togglePlayerReady,
  startGame,
  getGameEngine,
  getActiveRoom,
  registerPlayerSocket,
  removePlayerSocket,
  broadcastToRoom,
  sendToPlayer,
  getBattleReportAsync,
} from '../managers/roomManager';
import { saveGameState } from '../redis/gameStore';

export function handleWebSocketMessage(
  connection: any,
  rawMessage: string,
  roomId?: string,
  playerId?: string
): { roomId?: string; playerId?: string } {
  let message: WSMessage;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } }));
    return {};
  }

  console.log(`Received message: ${message.type}`, message.payload);

  switch (message.type) {
    case 'createRoom':
      return handleCreateRoom(connection, message);
    case 'joinRoom':
      return handleJoinRoom(connection, message);
    case 'setFaction':
      return handleSetFaction(connection, message, roomId, playerId);
    case 'toggleReady':
      return handleToggleReady(connection, message, roomId, playerId);
    case 'startGame':
      return handleStartGame(connection, message, roomId, playerId);
    case 'moveUnit':
      return handleMoveUnit(connection, message, roomId, playerId);
    case 'attack':
      return handleAttack(connection, message, roomId, playerId);
    case 'siegeAttack':
      return handleSiegeAttack(connection, message, roomId, playerId);
    case 'build':
      return handleBuild(connection, message, roomId, playerId);
    case 'repair':
      return handleRepair(connection, message, roomId, playerId);
    case 'trainUnit':
      return handleTrainUnit(connection, message, roomId, playerId);
    case 'endSubPhase':
      return handleEndSubPhase(connection, message, roomId, playerId);
    case 'getGameState':
      return handleGetGameState(connection, message, roomId, playerId);
    case 'chat':
      return handleChat(connection, message, roomId, playerId);
    case 'getBattleReport':
      return handleGetBattleReport(connection, message, roomId, playerId);
    default:
      connection.send(JSON.stringify({ type: 'error', payload: { message: 'Unknown message type' } }));
      return {};
  }
}

function handleCreateRoom(connection: any, message: WSMessage): { roomId?: string; playerId?: string } {
  const { playerName, roomName, maxPlayers } = message.payload;
  const result = createRoom(playerName, roomName, maxPlayers);

  if ('error' in result) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: (result as any).error } }));
    return {};
  }

  const { room, player } = result;
  registerPlayerSocket(room.id, player.id, connection);

  connection.send(JSON.stringify({
    type: 'roomCreated',
    payload: { room, playerId: player.id, player },
  }));

  return { roomId: room.id, playerId: player.id };
}

function handleJoinRoom(connection: any, message: WSMessage): { roomId?: string; playerId?: string } {
  const { roomId, playerName } = message.payload;
  const result = joinRoom(roomId, playerName);

  if ('error' in result) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: (result as any).error } }));
    return {};
  }

  const { room, player } = result as any;
  registerPlayerSocket(room.id, player.id, connection);

  connection.send(JSON.stringify({
    type: 'roomJoined',
    payload: { room, playerId: player.id, player },
  }));

  broadcastToRoom(room.id, {
    type: 'playerJoined',
    payload: { player },
  }, player.id);

  return { roomId: room.id, playerId: player.id };
}

function handleSetFaction(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Not in a room' } }));
    return {};
  }

  const result = setPlayerFaction(roomId, playerId, message.payload.faction);

  if ('error' in result) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: (result as any).error } }));
    return { roomId, playerId };
  }

  broadcastToRoom(roomId, {
    type: 'roomUpdated',
    payload: { room: result },
  });

  return { roomId, playerId };
}

function handleToggleReady(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Not in a room' } }));
    return {};
  }

  const result = togglePlayerReady(roomId, playerId);

  if ('error' in result) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: (result as any).error } }));
    return { roomId, playerId };
  }

  broadcastToRoom(roomId, {
    type: 'roomUpdated',
    payload: { room: result },
  });

  return { roomId, playerId };
}

function handleStartGame(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Not in a room' } }));
    return {};
  }

  const result = startGame(roomId, playerId);

  if ('error' in result) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: (result as any).error } }));
    return { roomId, playerId };
  }

  broadcastToRoom(roomId, {
    type: 'gameStarted',
    payload: { gameState: (result as any).gameState },
  });

  return { roomId, playerId };
}

function handleMoveUnit(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Not in a room' } }));
    return {};
  }

  const engine = getGameEngine(roomId);
  if (!engine) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Game not started' } }));
    return { roomId, playerId };
  }

  const activeRoom = getActiveRoom(roomId);
  const player = activeRoom?.room.players.find(p => p.id === playerId);
  if (!player) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Player not found' } }));
    return { roomId, playerId };
  }

  const { unitId, targetPosition } = message.payload;
  const result = engine.moveUnit(unitId, targetPosition, player.faction);

  if (result.success) {
    const state = engine.getState();
    saveGameState(roomId, state).catch(console.error);
    broadcastToRoom(roomId, {
      type: 'gameStateUpdate',
      payload: { gameState: state, action: 'move', unitId, targetPosition },
    });
  } else {
    connection.send(JSON.stringify({ type: 'actionFailed', payload: { message: result.message } }));
  }

  return { roomId, playerId };
}

function handleAttack(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Not in a room' } }));
    return {};
  }

  const engine = getGameEngine(roomId);
  if (!engine) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Game not started' } }));
    return { roomId, playerId };
  }

  const activeRoom = getActiveRoom(roomId);
  const player = activeRoom?.room.players.find(p => p.id === playerId);
  if (!player) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Player not found' } }));
    return { roomId, playerId };
  }

  const { attackerId, targetId, targetType } = message.payload;
  const result = engine.attackUnit(attackerId, targetId, targetType, player.faction);

  if (result.success) {
    const state = engine.getState();
    saveGameState(roomId, state).catch(console.error);
    broadcastToRoom(roomId, {
      type: 'gameStateUpdate',
      payload: { gameState: state, action: 'attack', damage: result.damage, targetId },
    });
  } else {
    connection.send(JSON.stringify({ type: 'actionFailed', payload: { message: result.message } }));
  }

  return { roomId, playerId };
}

function handleSiegeAttack(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Not in a room' } }));
    return {};
  }

  const engine = getGameEngine(roomId);
  if (!engine) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Game not started' } }));
    return { roomId, playerId };
  }

  const activeRoom = getActiveRoom(roomId);
  const player = activeRoom?.room.players.find(p => p.id === playerId);
  if (!player) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Player not found' } }));
    return { roomId, playerId };
  }

  const { engineId, targetId, targetType } = message.payload;
  const result = engine.siegeAttack(engineId, targetId, targetType, player.faction);

  if (result.success) {
    const state = engine.getState();
    saveGameState(roomId, state).catch(console.error);
    broadcastToRoom(roomId, {
      type: 'gameStateUpdate',
      payload: { gameState: state, action: 'siegeAttack', damage: result.damage, targetId },
    });
  } else {
    connection.send(JSON.stringify({ type: 'actionFailed', payload: { message: result.message } }));
  }

  return { roomId, playerId };
}

function handleBuild(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Not in a room' } }));
    return {};
  }

  const engine = getGameEngine(roomId);
  if (!engine) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Game not started' } }));
    return { roomId, playerId };
  }

  const { structureType, position, wallSection } = message.payload;
  const result = engine.build(structureType, position, wallSection);

  if (result.success) {
    const state = engine.getState();
    saveGameState(roomId, state).catch(console.error);
    broadcastToRoom(roomId, {
      type: 'gameStateUpdate',
      payload: { gameState: state, action: 'build' },
    });
  } else {
    connection.send(JSON.stringify({ type: 'actionFailed', payload: { message: result.message } }));
  }

  return { roomId, playerId };
}

function handleRepair(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Not in a room' } }));
    return {};
  }

  const engine = getGameEngine(roomId);
  if (!engine) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Game not started' } }));
    return { roomId, playerId };
  }

  const { structureId, amount } = message.payload;
  const result = engine.repair(structureId, amount);

  if (result.success) {
    const state = engine.getState();
    saveGameState(roomId, state).catch(console.error);
    broadcastToRoom(roomId, {
      type: 'gameStateUpdate',
      payload: { gameState: state, action: 'repair' },
    });
  } else {
    connection.send(JSON.stringify({ type: 'actionFailed', payload: { message: result.message } }));
  }

  return { roomId, playerId };
}

function handleTrainUnit(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Not in a room' } }));
    return {};
  }

  const engine = getGameEngine(roomId);
  if (!engine) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Game not started' } }));
    return { roomId, playerId };
  }

  const { unitType, position } = message.payload;
  const result = engine.train(unitType, position, playerId);

  if (result.success) {
    const state = engine.getState();
    saveGameState(roomId, state).catch(console.error);
    broadcastToRoom(roomId, {
      type: 'gameStateUpdate',
      payload: { gameState: state, action: 'train' },
    });
  } else {
    connection.send(JSON.stringify({ type: 'actionFailed', payload: { message: result.message } }));
  }

  return { roomId, playerId };
}

function handleEndSubPhase(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Not in a room' } }));
    return {};
  }

  const engine = getGameEngine(roomId);
  if (!engine) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Game not started' } }));
    return { roomId, playerId };
  }

  const state = engine.endSubPhase();
  saveGameState(roomId, state).catch(console.error);

  broadcastToRoom(roomId, {
    type: 'turnAdvanced',
    payload: { gameState: state },
  });

  return { roomId, playerId };
}

function handleGetGameState(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Not in a room' } }));
    return {};
  }

  const engine = getGameEngine(roomId);
  if (!engine) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Game not started' } }));
    return { roomId, playerId };
  }

  const state = engine.getState();
  connection.send(JSON.stringify({
    type: 'gameState',
    payload: { gameState: state },
  }));

  return { roomId, playerId };
}

function handleChat(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    return {};
  }

  const activeRoom = getActiveRoom(roomId);
  const player = activeRoom?.room.players.find(p => p.id === playerId);
  if (!player) return { roomId, playerId };

  broadcastToRoom(roomId, {
    type: 'chatMessage',
    payload: {
      playerId,
      playerName: player.name,
      message: message.payload.message,
      timestamp: Date.now(),
    },
  });

  return { roomId, playerId };
}

function handleGetBattleReport(connection: any, message: WSMessage, roomId?: string, playerId?: string) {
  if (!roomId || !playerId) {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Not in a room' } }));
    return {};
  }

  getBattleReportAsync(roomId).then(report => {
    if (report) {
      connection.send(JSON.stringify({
        type: 'battleReport',
        payload: { battleReport: report },
      }));
    } else {
      connection.send(JSON.stringify({ type: 'error', payload: { message: 'Battle report not available' } }));
    }
  }).catch(err => {
    connection.send(JSON.stringify({ type: 'error', payload: { message: 'Failed to get battle report' } }));
  });

  return { roomId, playerId };
}

export function handleDisconnect(roomId?: string, playerId?: string): void {
  if (!roomId || !playerId) return;

  removePlayerSocket(roomId, playerId);

  const activeRoom = getActiveRoom(roomId);
  if (activeRoom) {
    const player = activeRoom.room.players.find(p => p.id === playerId);
    if (player) {
      player.connected = false;
      broadcastToRoom(roomId, {
        type: 'playerLeft',
        payload: { playerId, playerName: player.name },
      });
    }
  }
}
