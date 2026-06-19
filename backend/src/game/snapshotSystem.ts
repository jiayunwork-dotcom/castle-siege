import {
  GameState,
  GameEvent,
  TurnSnapshot,
  TurnSnapshotUnit,
  TurnSnapshotSiegeEngine,
  TurnSnapshotDefense,
  PlayerBattleStats,
  UnitTypeKillStats,
  MVPData,
  BattleReport,
  Faction,
  UnitType,
  Resources,
  TurnAction,
  Position,
  DefenseType,
  SiegeEngineType,
} from '../types/game';

interface CombatRecord {
  attackerOwnerId: string;
  targetOwnerId: string;
  targetFaction: Faction;
  targetType: 'unit' | 'defense' | 'siegeEngine';
  targetUnitType?: string;
  targetId: string;
  damage: number;
  killed: boolean;
}

export class SnapshotSystem {
  private turnSnapshots: TurnSnapshot[] = [];
  private turnEvents: GameEvent[] = [];
  private combatRecords: CombatRecord[] = [];
  private turnActions: TurnAction[] = [];
  private playerStatsMap: Map<string, PlayerBattleStats> = new Map();
  private killByTypeMap: Map<string, Map<string, number>> = new Map();
  private turnResourceBefore: Record<Faction, Resources> = {
    attacker: { gold: 0, wood: 0, stone: 0, food: 0 },
    defender: { gold: 0, wood: 0, stone: 0, food: 0 },
  };
  private previousUnitIds: Set<string> = new Set();
  private destroyedDefenseIdsThisTurn: Set<string> = new Set();

  constructor() {
    this.killByTypeMap.set('attacker', new Map());
    this.killByTypeMap.set('defender', new Map());
  }

  initPlayers(players: { id: string; name: string; faction: Faction }[]): void {
    for (const p of players) {
      this.playerStatsMap.set(p.id, {
        playerId: p.id,
        playerName: p.name,
        faction: p.faction,
        kills: 0,
        assists: 0,
        losses: 0,
        damageDealt: 0,
        damageTaken: 0,
        survivalTurns: 0,
      });
    }
  }

  recordResourceBefore(state: GameState): void {
    this.turnResourceBefore = {
      attacker: { ...state.resources.attacker },
      defender: { ...state.resources.defender },
    };
    this.previousUnitIds = new Set(state.units.map(u => u.id));
    this.destroyedDefenseIdsThisTurn = new Set();
    this.turnActions = [];
  }

  recordMove(actorId: string, actorType: 'unit' | 'siegeEngine', fromPosition: Position, toPosition: Position): void {
    this.turnActions.push({
      type: 'move',
      actorId,
      actorType,
      fromPosition: { ...fromPosition },
      toPosition: { ...toPosition },
    });
  }

  recordAttack(
    actorId: string,
    actorType: 'unit' | 'siegeEngine',
    targetId: string,
    targetType: 'unit' | 'defense' | 'siegeEngine',
    damage: number,
    killed: boolean
  ): void {
    this.turnActions.push({
      type: actorType === 'siegeEngine' ? 'siegeAttack' : 'attack',
      actorId,
      actorType,
      targetId,
      targetType,
      damage,
      killed,
    });
  }

  recordBuild(
    actorId: string,
    position: Position,
    newBuildingType: DefenseType | SiegeEngineType,
    newBuildingId: string
  ): void {
    this.turnActions.push({
      type: 'build',
      actorId,
      toPosition: { ...position },
      newBuildingType,
      newBuildingId,
    });
  }

  recordRepair(actorId: string, targetId: string, repairAmount: number): void {
    this.turnActions.push({
      type: 'repair',
      actorId,
      targetId,
      repairAmount,
    });
  }

  recordTrain(
    actorId: string,
    position: Position,
    newUnitType: UnitType,
    newUnitId: string
  ): void {
    this.turnActions.push({
      type: 'train',
      actorId,
      toPosition: { ...position },
      newUnitType,
      newUnitId,
    });
  }

  recordCombat(
    attackerOwnerId: string,
    targetOwnerId: string,
    targetFaction: Faction,
    targetType: 'unit' | 'defense' | 'siegeEngine',
    targetUnitType: string | undefined,
    targetId: string,
    damage: number,
    killed: boolean
  ): void {
    this.combatRecords.push({
      attackerOwnerId,
      targetOwnerId,
      targetFaction,
      targetType,
      targetUnitType,
      targetId,
      damage,
      killed,
    });
  }

  recordDefenseDestroyed(
    defenseType: string,
    position: { x: number; y: number },
    turn: number,
    attackerOwnerId?: string,
    players?: { id: string; name: string; faction: Faction }[]
  ): void {
    this.destroyedDefenseIdsThisTurn.add(`${defenseType}-${position.x}-${position.y}`);

    const playerName = attackerOwnerId && players
      ? players.find(p => p.id === attackerOwnerId)?.name
      : undefined;

    let eventType: GameEvent['type'] | null = null;
    let description = '';

    if (defenseType === 'outerWall' || defenseType === 'innerWall') {
      eventType = defenseType === 'outerWall' ? 'wallBreached' : 'innerCityBreakthrough';
      description = defenseType === 'outerWall'
        ? `城墙被攻破`
        : `内城被突破`;
    } else if (defenseType === 'gate') {
      eventType = 'gateFallen';
      description = '城门失守';
    } else if (defenseType === 'tower' || defenseType === 'arrowTower') {
      eventType = 'towerDestroyed';
      description = defenseType === 'tower' ? '塔楼被摧毁' : '箭塔被摧毁';
    } else if (defenseType === 'keep') {
      eventType = 'keepDamaged';
      description = '主堡受到攻击';
    }

    if (eventType) {
      this.turnEvents.push({
        turn,
        type: eventType,
        description,
        playerId: attackerOwnerId,
        playerName,
        position: { ...position },
      });
    }
  }

  captureSnapshot(state: GameState, actualTurn: number): void {
    const killedByAttacker = this.combatRecords.filter(
      r => r.killed && r.targetFaction === 'defender'
    ).length;
    const killedByDefender = this.combatRecords.filter(
      r => r.killed && r.targetFaction === 'attacker'
    ).length;

    const attackerLosses = killedByDefender;
    const defenderLosses = killedByAttacker;

    for (const record of this.combatRecords) {
      const attackerStats = this.playerStatsMap.get(record.attackerOwnerId);
      if (attackerStats) {
        attackerStats.damageDealt += record.damage;
        if (record.killed) {
          attackerStats.kills += 1;
          const factionKills = this.killByTypeMap.get(attackerStats.faction)!;
          if (record.targetUnitType) {
            factionKills.set(
              record.targetUnitType,
              (factionKills.get(record.targetUnitType) || 0) + 1
            );
          }
        }
      }

      const targetStats = this.playerStatsMap.get(record.targetOwnerId);
      if (targetStats) {
        targetStats.damageTaken += record.damage;
        if (record.killed) {
          targetStats.losses += 1;
        }
      }
    }

    const assistTracker = new Map<string, Set<string>>();
    for (const record of this.combatRecords) {
      if (!assistTracker.has(record.targetId)) {
        assistTracker.set(record.targetId, new Set());
      }
      assistTracker.get(record.targetId)!.add(record.attackerOwnerId);
    }
    for (const [targetId, attackers] of assistTracker) {
      const killRecord = this.combatRecords.find(
        r => r.targetId === targetId && r.killed
      );
      if (killRecord && attackers.size > 1) {
        for (const attackerId of attackers) {
          if (attackerId !== killRecord.attackerOwnerId) {
            const stats = this.playerStatsMap.get(attackerId);
            if (stats) {
              stats.assists += 1;
            }
          }
        }
      }
    }

    const attackerUnits = state.units.filter(u => u.faction === 'attacker');
    const defenderUnits = state.units.filter(u => u.faction === 'defender');

    const currentUnitOwnerIds = new Set(state.units.map(u => u.ownerId));
    for (const [playerId, stats] of this.playerStatsMap) {
      const hasLivingUnits = currentUnitOwnerIds.has(playerId);
      if (hasLivingUnits) {
        stats.survivalTurns += 1;
      }
    }

    const resourceConsumption: Record<Faction, Resources> = {
      attacker: {
        gold: Math.max(0, this.turnResourceBefore.attacker.gold - state.resources.attacker.gold),
        wood: Math.max(0, this.turnResourceBefore.attacker.wood - state.resources.attacker.wood),
        stone: Math.max(0, this.turnResourceBefore.attacker.stone - state.resources.attacker.stone),
        food: Math.max(0, this.turnResourceBefore.attacker.food - state.resources.attacker.food),
      },
      defender: {
        gold: Math.max(0, this.turnResourceBefore.defender.gold - state.resources.defender.gold),
        wood: Math.max(0, this.turnResourceBefore.defender.wood - state.resources.defender.wood),
        stone: Math.max(0, this.turnResourceBefore.defender.stone - state.resources.defender.stone),
        food: Math.max(0, this.turnResourceBefore.defender.food - state.resources.defender.food),
      },
    };

    const snapshotUnits: TurnSnapshotUnit[] = state.units.map(u => ({
      id: u.id,
      type: u.type,
      faction: u.faction,
      position: { ...u.position },
      hp: u.stats.hp,
      maxHp: u.stats.maxHp,
      ownerId: u.ownerId,
    }));

    const snapshotEngines: TurnSnapshotSiegeEngine[] = state.siegeEngines.map(e => ({
      id: e.id,
      type: e.type,
      faction: e.faction,
      position: { ...e.position },
      hp: e.stats.hp,
      maxHp: e.stats.maxHp,
    }));

    const snapshotDefenses: TurnSnapshotDefense[] = state.defenses.map(d => ({
      id: d.id,
      type: d.type,
      position: { ...d.position },
      hp: d.hp,
      maxHp: d.maxHp,
    }));

    const snapshot: TurnSnapshot = {
      turn: actualTurn,
      attackerUnitCount: attackerUnits.length,
      defenderUnitCount: defenderUnits.length,
      attackerSiegeEngineCount: state.siegeEngines.filter(e => e.faction === 'attacker').length,
      defenderDefenseCount: state.defenses.length,
      units: snapshotUnits,
      siegeEngines: snapshotEngines,
      defenses: snapshotDefenses,
      resources: {
        attacker: { ...state.resources.attacker },
        defender: { ...state.resources.defender },
      },
      events: [...this.turnEvents],
      attackerKills: killedByAttacker,
      defenderKills: killedByDefender,
      attackerLosses,
      defenderLosses,
      resourceConsumption,
      actions: [...this.turnActions],
    };

    this.turnSnapshots.push(snapshot);

    this.turnEvents = [];
    this.combatRecords = [];
    this.turnActions = [];
    this.destroyedDefenseIdsThisTurn = new Set();
  }

  generateBattleReport(state: GameState): BattleReport {
    const allPlayerStats = Array.from(this.playerStatsMap.values());

    const attackerStats = allPlayerStats.filter(s => s.faction === 'attacker');
    const defenderStats = allPlayerStats.filter(s => s.faction === 'defender');

    const attackerMVP = computeMVP(attackerStats);
    const defenderMVP = computeMVP(defenderStats);

    const attackerKillByType: UnitTypeKillStats[] = [];
    const attackerKills = this.killByTypeMap.get('attacker')!;
    for (const [unitType, kills] of attackerKills) {
      attackerKillByType.push({ unitType: unitType as UnitType, kills });
    }

    const defenderKillByType: UnitTypeKillStats[] = [];
    const defenderKills = this.killByTypeMap.get('defender')!;
    for (const [unitType, kills] of defenderKills) {
      defenderKillByType.push({ unitType: unitType as UnitType, kills });
    }

    const keyEvents = this.turnSnapshots.flatMap(s => s.events);

    return {
      gameId: state.id,
      winner: state.winner || 'defender',
      totalTurns: state.turn,
      turnSnapshots: this.turnSnapshots,
      playerStats: allPlayerStats,
      attackerKillByType,
      defenderKillByType,
      keyEvents,
      attackerMVP,
      defenderMVP,
    };
  }
}

function computeMVP(stats: PlayerBattleStats[]): MVPData {
  if (stats.length === 0) {
    return {
      playerId: '',
      playerName: '',
      faction: 'attacker',
      kills: 0,
      damageDealt: 0,
      survivalTurns: 0,
      score: 0,
    };
  }

  let best = stats[0];
  let bestScore = 0;

  for (const s of stats) {
    const score = s.kills * 30 + s.damageDealt + s.survivalTurns * 10 + s.assists * 15;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  return {
    playerId: best.playerId,
    playerName: best.playerName,
    faction: best.faction,
    kills: best.kills,
    damageDealt: best.damageDealt,
    survivalTurns: best.survivalTurns,
    score: bestScore,
  };
}
