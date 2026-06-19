import { GameState, Position, MoveAction, AttackAction, BuildAction, RepairAction, BattleReport, Player, Unit, DefenseStructure, SiegeEngine } from '../types/game';
import { createInitialGameState } from './gameInitializer';
import { canMoveUnit, canMoveSiegeEngine, canAttackUnit, useSiegeEngine, checkGameEnd, setCombatCallback } from './combatSystem';
import { advanceTurn, processSupplyPhase } from './turnSystem';
import { buildDefense, repairStructure, upgradeGate, buildSiegeEngine, trainUnit } from './buildingSystem';
import { SnapshotSystem } from './snapshotSystem';

export class GameEngine {
  private state: GameState;
  private snapshotSystem: SnapshotSystem;
  private players: Player[] = [];

  constructor(roomId: string) {
    this.state = createInitialGameState(roomId);
    this.snapshotSystem = new SnapshotSystem();

    setCombatCallback({
      onCombat: (attackerOwnerId, targetOwnerId, targetFaction, targetType, targetUnitType, targetId, damage, killed, actorId, actorType) => {
        this.snapshotSystem.recordCombat(attackerOwnerId, targetOwnerId, targetFaction, targetType, targetUnitType, targetId, damage, killed);
        if (actorId) {
          this.snapshotSystem.recordAttack(actorId, actorType || 'unit', targetId, targetType, damage, killed);
        }
      },
      onDefenseDestroyed: (defenseType, position, attackerOwnerId) => {
        this.snapshotSystem.recordDefenseDestroyed(defenseType, position, this.state.turn, attackerOwnerId, this.players);
      },
    });
  }

  getState(): GameState {
    return { ...this.state };
  }

  getPublicState(playerFaction?: string): GameState {
    const state = { ...this.state };
    return state;
  }

  getBattleReport(): BattleReport | null {
    if (this.state.phase !== 'ended') return null;
    return this.snapshotSystem.generateBattleReport(this.state);
  }

  moveUnit(unitId: string, targetPosition: Position, playerFaction: string): { success: boolean; message?: string } {
    if (this.state.subPhase !== 'movement') {
      return { success: false, message: 'Not movement phase' };
    }
    const unit = this.state.units.find(u => u.id === unitId);
    const fromPos = unit ? { ...unit.position } : null;
    const result = canMoveUnit(this.state, unitId, targetPosition);
    if (result.success && fromPos && unit) {
      this.snapshotSystem.recordMove(unitId, 'unit', fromPos, targetPosition);
    }
    return result;
  }

  moveSiegeEngine(engineId: string, targetPosition: Position, playerFaction: string): { success: boolean; message?: string } {
    if (this.state.subPhase !== 'movement') {
      return { success: false, message: 'Not movement phase' };
    }
    const engine = this.state.siegeEngines.find(s => s.id === engineId);
    const fromPos = engine ? { ...engine.position } : null;
    const result = canMoveSiegeEngine(this.state, engineId, targetPosition);
    if (result.success && fromPos && engine) {
      this.snapshotSystem.recordMove(engineId, 'siegeEngine', fromPos, targetPosition);
    }
    return result;
  }

  attackUnit(attackerId: string, targetId: string, targetType: 'unit' | 'defense' | 'siegeEngine', playerFaction: string): { success: boolean; damage?: number; message?: string } {
    if (this.state.subPhase !== 'attack') {
      return { success: false, message: 'Not attack phase' };
    }
    const result = canAttackUnit(this.state, attackerId, targetId, targetType);
    if (result.success) {
      checkGameEnd(this.state);
    }
    return result;
  }

  siegeAttack(engineId: string, targetId: string, targetType: 'defense' | 'unit', playerFaction: string): { success: boolean; damage?: number; message?: string } {
    if (this.state.subPhase !== 'attack') {
      return { success: false, message: 'Not attack phase' };
    }
    const result = useSiegeEngine(this.state, engineId, targetId, targetType);
    if (result.success) {
      checkGameEnd(this.state);
    }
    return result;
  }

  build(structureType: string, position: Position, wallSection?: string): { success: boolean; message?: string } {
    if (this.state.subPhase !== 'buildRepair') {
      return { success: false, message: 'Not build/repair phase' };
    }

    let result;
    if (this.state.currentFaction === 'defender') {
      result = buildDefense(this.state, structureType as any, position, 'defender');
      if (result.success && result.structure) {
        const players = this.players.filter(p => p.faction === 'defender');
        const actorId = players.length > 0 ? players[0].id : 'system';
        this.snapshotSystem.recordBuild(actorId, position, structureType as any, result.structure.id);
      }
    } else {
      result = buildSiegeEngine(this.state, structureType as any, position, 'system', 'attacker') as any;
      if (result.success && result.engine) {
        const players = this.players.filter(p => p.faction === 'attacker');
        const actorId = players.length > 0 ? players[0].id : 'system';
        this.snapshotSystem.recordBuild(actorId, position, structureType as any, result.engine.id);
      }
    }
    return result;
  }

  repair(structureId: string, amount: number): { success: boolean; message?: string } {
    if (this.state.subPhase !== 'buildRepair') {
      return { success: false, message: 'Not build/repair phase' };
    }
    const result = repairStructure(this.state, structureId, amount, this.state.currentFaction);
    if (result.success) {
      const players = this.players.filter(p => p.faction === this.state.currentFaction);
      const actorId = players.length > 0 ? players[0].id : 'system';
      this.snapshotSystem.recordRepair(actorId, structureId, amount);
    }
    return result;
  }

  upgradeGateFeature(gateId: string, upgradeType: 'ironBars' | 'boilingOil'): { success: boolean; message?: string } {
    if (this.state.subPhase !== 'buildRepair') {
      return { success: false, message: 'Not build/repair phase' };
    }
    return upgradeGate(this.state, gateId, upgradeType, 'defender');
  }

  train(unitType: string, position: Position, ownerId: string): { success: boolean; message?: string } {
    if (this.state.currentFaction === 'defender' && this.state.subPhase !== 'buildRepair') {
      return { success: false, message: 'Defenders can only train units during build/repair phase' };
    }
    if (this.state.currentFaction === 'attacker' && this.state.subPhase !== 'movement' && this.state.subPhase !== 'buildRepair') {
      return { success: false, message: 'Attackers can only train units during movement phase' };
    }
    const result = trainUnit(this.state, unitType, position, ownerId, this.state.currentFaction);
    if (result.success && result.unit) {
      this.snapshotSystem.recordTrain(ownerId, position, unitType as any, result.unit.id);
    }
    return result;
  }

  endSubPhase(): GameState {
    if (this.state.subPhase === 'supply') {
      processSupplyPhase(this.state);
    }

    const wasEndOfTurn = this.state.subPhase === 'supply';
    const completedTurn = this.state.turn;

    advanceTurn(this.state);

    if (wasEndOfTurn) {
      this.snapshotSystem.captureSnapshot(this.state, completedTurn);
      this.snapshotSystem.recordResourceBefore(this.state);
    }

    return this.state;
  }

  startGame(): GameState {
    this.state.phase = 'preparation';
    this.state.turn = 1;
    this.state.subPhase = 'movement';
    this.state.currentFaction = 'defender';

    this.snapshotSystem.recordResourceBefore(this.state);

    return this.state;
  }

  setPlayers(players: Player[]): void {
    this.players = players;
    this.snapshotSystem.initPlayers(players.map(p => ({
      id: p.id,
      name: p.name,
      faction: p.faction,
    })));
  }
}
