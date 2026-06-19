import { Room, Player, Faction, GameState, BattleReport, SinglePlayerConfig, AIDifficulty, AIDecisionLogEntry, PowerUpdate, RoundPowerRecord } from '../types/game';
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
  roundPowerHistory?: RoundPowerRecord[];
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

  const initialPower = calculatePower(gameState);
  const initialRecord: RoundPowerRecord = {
    turn: 0,
    attackerPower: initialPower.attackerPower,
    defenderPower: initialPower.defenderPower,
  };
  activeRoomEntry.roundPowerHistory = [initialRecord];

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

  const hostPlayerId = activeRoom.room.hostId;

  const sendDual = (message: any) => {
    broadcastToRoom(roomId, message);
    if (hostPlayerId) {
      sendToPlayer(roomId, hostPlayerId, message);
    }
  };

  const UNIT_TYPE_NAMES: Record<string, string> = {
    infantry: '步兵', archer: '弓箭手', cavalry: '骑兵', sapper: '工兵', scout: '侦察兵',
  };
  const SIEGE_TYPE_NAMES: Record<string, string> = {
    siegeTower: '攻城塔', batteringRam: '攻城锤', catapult: '投石机', ladder: '云梯', ballista: '弩炮', tunnel: '地道',
  };
  const DEFENSE_TYPE_NAMES: Record<string, string> = {
    outerWall: '外墙', innerWall: '内墙', tower: '塔楼', moat: '护城河', gate: '城门', arrowTower: '箭塔', keep: '主堡',
  };
  const SUB_PHASE_NAMES: Record<string, string> = {
    movement: '移动阶段', attack: '攻击阶段', buildRepair: '建设阶段', supply: '补给阶段',
  };

  const getUnitName = (unitId: string): string => {
    const unit = state.units.find(u => u.id === unitId);
    if (unit) return `${UNIT_TYPE_NAMES[unit.type] || unit.type}${unitId.slice(-2).toUpperCase()}`;
    const engine = state.siegeEngines.find(e => e.id === unitId);
    if (engine) return `${SIEGE_TYPE_NAMES[engine.type] || engine.type}${unitId.slice(-2).toUpperCase()}`;
    return unitId.slice(-4);
  };

  const getTargetName = (targetId: string, targetType?: string): string => {
    if (targetType === 'defense') {
      const def = state.defenses.find(d => d.id === targetId);
      return def ? (DEFENSE_TYPE_NAMES[def.type] || def.type) : targetId.slice(-4);
    }
    if (targetType === 'siegeEngine') {
      const eng = state.siegeEngines.find(e => e.id === targetId);
      return eng ? (SIEGE_TYPE_NAMES[eng.type] || eng.type) : targetId.slice(-4);
    }
    const unit = state.units.find(u => u.id === targetId);
    if (unit) return `${UNIT_TYPE_NAMES[unit.type] || unit.type}${targetId.slice(-2).toUpperCase()}`;
    return targetId.slice(-4);
  };

  const broadcastDecisionLog = (subPhase: string, description: string) => {
    const logEntry: AIDecisionLogEntry = {
      timestamp: Date.now(),
      turn: state.turn,
      subPhase: subPhase as any,
      description,
    };
    sendDual({
      type: 'aiDecisionLog',
      payload: logEntry,
    });
  };

  const broadcastPowerUpdate = () => {
    const currentState = activeRoom.gameEngine!.getState();
    const power = calculatePower(currentState);
    sendDual({
      type: 'powerUpdate',
      payload: power,
    });
  };

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
            const unitName = getUnitName(decision.unitId);
            const dx = decision.targetPosition.x - (currentState.units.find(u => u.id === decision.unitId)?.position.x || currentState.siegeEngines.find(e => e.id === decision.unitId)?.position.x || 0);
            const dy = decision.targetPosition.y - (currentState.units.find(u => u.id === decision.unitId)?.position.y || currentState.siegeEngines.find(e => e.id === decision.unitId)?.position.y || 0);
            const steps = Math.abs(dx) + Math.abs(dy);
            const direction = [];
            if (dy < 0) direction.push('向城门方向');
            else if (dy > 0) direction.push('向后退');
            if (dx < 0) direction.push('向左');
            else if (dx > 0) direction.push('向右');
            const dirText = direction.length > 0 ? direction.join('') : '原地调整';
            broadcastDecisionLog(currentState.subPhase, `${SUB_PHASE_NAMES[currentState.subPhase] || currentState.subPhase}:${unitName}${dirText}前进${steps}格`);

            try {
              const currentStateForMove = activeRoom.gameEngine!.getState();
              const isSiegeEngineMove = currentStateForMove.siegeEngines.some(e => e.id === decision.unitId);
              if (isSiegeEngineMove) {
                activeRoom.gameEngine.moveSiegeEngine(decision.unitId, decision.targetPosition, aiFaction);
              } else {
                activeRoom.gameEngine.moveUnit(decision.unitId, decision.targetPosition, aiFaction);
              }
            } catch (e) {
              console.error('AI move error:', e);
            }
            broadcastPowerUpdate();
          }
          break;
        case 'attack':
          if (decision.unitId && decision.targetId && decision.targetType) {
            const attackerName = getUnitName(decision.unitId);
            const targetName = getTargetName(decision.targetId, decision.targetType);
            let damage = 0;
            try {
              const currentStateForCheck = activeRoom.gameEngine!.getState();
              const isSiegeEngine = currentStateForCheck.siegeEngines.some(e => e.id === decision.unitId);
              if (isSiegeEngine) {
                if (decision.targetType === 'defense' || decision.targetType === 'unit') {
                  const result = activeRoom.gameEngine.siegeAttack(decision.unitId, decision.targetId, decision.targetType as any, aiFaction);
                  if (result.success && result.damage) damage = result.damage;
                }
              } else {
                const result = activeRoom.gameEngine.attackUnit(decision.unitId, decision.targetId, decision.targetType, aiFaction);
                if (result.success && result.damage) damage = result.damage;
              }
            } catch (e) {
              console.error('AI attack error:', e);
            }
            const actionVerb = decision.targetType === 'defense' ? '攻击' : '射击';
            const locationText = decision.targetType === 'defense' ? '' : '';
            broadcastDecisionLog(activeRoom.gameEngine!.getState().subPhase, `${SUB_PHASE_NAMES[activeRoom.gameEngine!.getState().subPhase] || '攻击阶段'}:${attackerName}${actionVerb}${targetName}${locationText},造成${damage}点伤害`);
            broadcastPowerUpdate();
          }
          break;
        case 'build':
          if (decision.structureType && decision.targetPosition) {
            const structName = aiFaction === 'attacker'
              ? (SIEGE_TYPE_NAMES[decision.structureType] || decision.structureType)
              : (DEFENSE_TYPE_NAMES[decision.structureType] || decision.structureType);
            broadcastDecisionLog(activeRoom.gameEngine!.getState().subPhase, `${SUB_PHASE_NAMES[activeRoom.gameEngine!.getState().subPhase] || '建设阶段'}:建造${structName}`);

            try {
              activeRoom.gameEngine.build(decision.structureType as any, decision.targetPosition);
            } catch (e) {
              console.error('AI build error:', e);
            }
            broadcastPowerUpdate();
          }
          break;
        case 'repair':
          if (decision.structureId && decision.amount) {
            const targetName = getTargetName(decision.structureId, 'defense');
            broadcastDecisionLog(activeRoom.gameEngine!.getState().subPhase, `${SUB_PHASE_NAMES[activeRoom.gameEngine!.getState().subPhase] || '建设阶段'}:修复${targetName},恢复${decision.amount}点耐久`);

            try {
              activeRoom.gameEngine.repair(decision.structureId, decision.amount);
            } catch (e) {
              console.error('AI repair error:', e);
            }
            broadcastPowerUpdate();
          }
          break;
        case 'endPhase':
          try {
            const prevTurn = activeRoom.gameEngine!.getState().turn;
            activeRoom.gameEngine.endSubPhase();
            const afterState = activeRoom.gameEngine!.getState();
            if (afterState.turn !== prevTurn || afterState.currentFaction !== aiFaction) {
              const power = calculatePower(afterState);
              const record: RoundPowerRecord = {
                turn: prevTurn,
                attackerPower: power.attackerPower,
                defenderPower: power.defenderPower,
              };
              addRoundPowerRecord(roomId, record);
              sendDual({
                type: 'roundSummary',
                payload: {
                  roundPowerHistory: getRoundPowerHistory(roomId),
                },
              });
            }
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
      let forceCount = 0;
      const MAX_FORCE_ATTEMPTS = 10;
      while (state.currentFaction === aiFaction && state.phase !== 'ended' && forceCount < MAX_FORCE_ATTEMPTS) {
        activeRoom.gameEngine.endSubPhase();
        state = activeRoom.gameEngine.getState();
        forceCount++;
      }
      if (forceCount >= MAX_FORCE_ATTEMPTS) {
        console.error('Force turn advance failed after max attempts, switching faction manually');
        const currentState = activeRoom.gameEngine.getState();
        currentState.currentFaction = currentState.currentFaction === 'attacker' ? 'defender' : 'attacker';
        currentState.subPhase = 'movement';
        if (currentState.currentFaction === 'attacker') {
          currentState.turn = Math.min((currentState.turn || 1) + 1, currentState.config.maxTurns);
        }
      }
    } catch (e) {
      console.error('Force turn advance error:', e);
      try {
        const currentState = activeRoom.gameEngine.getState();
        currentState.currentFaction = currentState.currentFaction === 'attacker' ? 'defender' : 'attacker';
        currentState.subPhase = 'movement';
        if (currentState.currentFaction === 'attacker') {
          currentState.turn = Math.min((currentState.turn || 1) + 1, currentState.config.maxTurns);
        }
      } catch (e2) {
        console.error('Manual faction switch failed:', e2);
      }
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

export function calculatePower(state: GameState): PowerUpdate {
  const attackerUnits = state.units.filter(u => u.faction === 'attacker' && u.stats.hp > 0);
  const attackerUnitPower = attackerUnits.reduce((sum, u) => sum + u.stats.attack, 0);

  const attackerEngines = state.siegeEngines.filter(e => e.faction === 'attacker' && e.stats.hp > 0);
  const attackerEngineHp = attackerEngines.reduce((sum, e) => sum + e.stats.hp, 0);

  const attackerPower = attackerUnitPower + attackerEngineHp * 0.5;

  const defenderUnits = state.units.filter(u => u.faction === 'defender' && u.stats.hp > 0);
  const defenderUnitPower = defenderUnits.reduce((sum, u) => sum + u.stats.attack, 0);

  const defenderDefenses = state.defenses.filter(d => d.hp > 0);
  const defenderDefenseHp = defenderDefenses.reduce((sum, d) => sum + d.hp, 0);

  const arrowTowerCount = defenderDefenses.filter(d => d.type === 'arrowTower').length;

  const defenderPower = defenderUnitPower + defenderDefenseHp * 0.3 + arrowTowerCount * 15;

  return { attackerPower: Math.round(attackerPower * 10) / 10, defenderPower: Math.round(defenderPower * 10) / 10 };
}

export function switchAIDifficulty(roomId: string, newDifficulty: AIDifficulty): { success: boolean; message?: string } {
  const activeRoom = activeRooms.get(roomId);
  if (!activeRoom) {
    return { success: false, message: 'Room not found' };
  }
  if (!activeRoom.isSinglePlayer) {
    return { success: false, message: 'Not a single player room' };
  }
  if (!activeRoom.gameEngine) {
    return { success: false, message: 'Game not started' };
  }

  activeRoom.aiDifficulty = newDifficulty;

  const aiFaction = activeRoom.aiEngine?.getFaction();
  if (aiFaction) {
    const currentState = activeRoom.gameEngine.getState();
    activeRoom.aiEngine = new AIEngine(currentState, aiFaction, newDifficulty);
  }

  return { success: true };
}

export function getAIDifficulty(roomId: string): AIDifficulty | null {
  const activeRoom = activeRooms.get(roomId);
  return activeRoom?.aiDifficulty || null;
}

export function addRoundPowerRecord(roomId: string, record: RoundPowerRecord): void {
  const activeRoom = activeRooms.get(roomId);
  if (activeRoom) {
    if (!activeRoom.roundPowerHistory) {
      activeRoom.roundPowerHistory = [];
    }
    activeRoom.roundPowerHistory.push(record);
  }
}

export function getRoundPowerHistory(roomId: string): RoundPowerRecord[] {
  const activeRoom = activeRooms.get(roomId);
  return activeRoom?.roundPowerHistory || [];
}

export { activeRooms };
