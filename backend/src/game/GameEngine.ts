import { GameState, Position, MoveAction, AttackAction, BuildAction, RepairAction, BattleReport, Player } from '../types/game';
import { createInitialGameState } from './gameInitializer';
import { canMoveUnit, canAttackUnit, useSiegeEngine, checkGameEnd, setCombatCallback } from './combatSystem';
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
      onCombat: (attackerOwnerId, targetOwnerId, targetFaction, targetType, targetUnitType, targetId, damage, killed) => {
        this.snapshotSystem.recordCombat(attackerOwnerId, targetOwnerId, targetFaction, targetType, targetUnitType, targetId, damage, killed);
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
    return canMoveUnit(this.state, unitId, targetPosition);
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

    if (this.state.currentFaction === 'defender') {
      return buildDefense(this.state, structureType as any, position, 'defender');
    } else {
      return buildSiegeEngine(this.state, structureType as any, position, 'system', 'attacker') as any;
    }
  }

  repair(structureId: string, amount: number): { success: boolean; message?: string } {
    if (this.state.subPhase !== 'buildRepair') {
      return { success: false, message: 'Not build/repair phase' };
    }
    return repairStructure(this.state, structureId, amount, this.state.currentFaction);
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
    return trainUnit(this.state, unitType, position, ownerId, this.state.currentFaction);
  }

  endSubPhase(): GameState {
    if (this.state.subPhase === 'supply') {
      processSupplyPhase(this.state);
    }

    const wasEndOfTurn = this.state.subPhase === 'supply';

    advanceTurn(this.state);

    if (wasEndOfTurn) {
      this.snapshotSystem.captureSnapshot(this.state);
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
