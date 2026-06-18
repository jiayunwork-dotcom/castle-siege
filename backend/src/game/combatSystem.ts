import { GameState, Unit, Position, DefenseStructure, SiegeEngine, Faction } from '../types/game';
import { getDistance, clamp, randomInt } from '../utils/helpers';
import { WEATHER_MODIFIERS, TIME_OF_DAY_MODIFIERS, WALL_DEFENSE_BONUS, UNIT_COUNTERS, SIEGE_ENGINE_STATS, DEFENSE_STATS } from '../constants/gameConfig';

export function canMoveUnit(state: GameState, unitId: string, targetPos: Position): { success: boolean; message?: string } {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit) return { success: false, message: 'Unit not found' };
  if (unit.moved) return { success: false, message: 'Unit already moved this turn' };
  if (unit.faction !== state.currentFaction) return { success: false, message: "Not your faction's turn" };

  const distance = getDistance(unit.position, targetPos);
  const weatherMod = WEATHER_MODIFIERS[state.weather].movementSpeed;
  const maxMove = Math.floor(unit.stats.speed * weatherMod);

  if (distance > maxMove) return { success: false, message: 'Target out of movement range' };

  const tileBlocked = isPositionBlocked(state, targetPos, unit.faction);
  if (tileBlocked) return { success: false, message: 'Target position is blocked' };

  unit.position = { ...targetPos };
  unit.moved = true;

  return { success: true };
}

function isPositionBlocked(state: GameState, pos: Position, faction: Faction): boolean {
  const unitAtPos = state.units.find(u => u.position.x === pos.x && u.position.y === pos.y);
  if (unitAtPos) return true;

  const siegeAtPos = state.siegeEngines.find(s => s.position.x === pos.x && s.position.y === pos.y);
  if (siegeAtPos) return true;

  if (faction === 'attacker') {
    const moat = state.defenses.find(d =>
      d.type === 'moat' && d.position.x === pos.x && d.position.y === pos.y
    );
    if (moat && moat.hp > 0 && !moat.moatFrozen) {
      return true;
    }
  }

  return false;
}

export function canAttackUnit(state: GameState, attackerId: string, targetId: string, targetType: 'unit' | 'defense' | 'siegeEngine'): { success: boolean; damage?: number; message?: string } {
  const attacker = state.units.find(u => u.id === attackerId);
  if (!attacker) return { success: false, message: 'Attacker not found' };
  if (attacker.attacked) return { success: false, message: 'Unit already attacked this turn' };
  if (attacker.faction !== state.currentFaction) return { success: false, message: "Not your faction's turn" };

  let target: Unit | DefenseStructure | SiegeEngine | undefined;
  let targetPos: Position | undefined;

  if (targetType === 'unit') {
    target = state.units.find(u => u.id === targetId);
    if (target && target.faction === attacker.faction) return { success: false, message: "Cannot attack friendly units" };
  } else if (targetType === 'defense') {
    target = state.defenses.find(d => d.id === targetId);
  } else {
    target = state.siegeEngines.find(s => s.id === targetId);
  }

  if (!target) return { success: false, message: 'Target not found' };
  targetPos = target.position;

  const distance = getDistance(attacker.position, targetPos);
  let attackRange = attacker.stats.range;

  if (attacker.onWall && attacker.type === 'archer') {
    attackRange = Math.floor(attackRange * (1 + WALL_DEFENSE_BONUS.range));
  }

  const timeMod = TIME_OF_DAY_MODIFIERS[state.timeOfDay].visibility;
  const weatherMod = WEATHER_MODIFIERS[state.weather].visibility;
  const effectiveRange = Math.floor(attackRange * timeMod * weatherMod);

  if (distance > effectiveRange) return { success: false, message: 'Target out of attack range' };

  let damage = calculateDamage(attacker, target, targetType, state);

  attacker.attacked = true;

  if (targetType === 'unit') {
    (target as Unit).stats.hp -= damage;
  } else {
    (target as any).hp -= damage;
  }

  return { success: true, damage };
}

function calculateDamage(
  attacker: Unit,
  target: any,
  targetType: string,
  state: GameState
): number {
  let baseDamage = attacker.stats.attack;
  let defense = 0;

  if (targetType === 'unit') {
    defense = (target as Unit).stats.defense;

    if ((target as Unit).onWall) {
      defense = Math.floor(defense * (1 + WALL_DEFENSE_BONUS.defense));
    }

    const counterKey = `${attacker.type}Counter`;
    if (UNIT_COUNTERS[counterKey] === (target as Unit).type) {
      baseDamage = Math.floor(baseDamage * 1.5);
    }

    if ((target as Unit).type === 'infantry' && attacker.type === 'cavalry') {
      baseDamage = Math.floor(baseDamage * 1.5);
    }
  }

  if (attacker.type === 'archer') {
    const weatherMod = WEATHER_MODIFIERS[state.weather].bowAccuracy;
    const distance = getDistance(attacker.position, target.position);
    const accuracyPenalty = Math.max(0.5, 1 - (distance / attacker.stats.range) * 0.3);
    baseDamage = Math.floor(baseDamage * weatherMod * accuracyPenalty);
  }

  const damage = Math.max(1, Math.floor(baseDamage * (100 / (100 + defense))));
  const variance = randomInt(-2, 2);

  return Math.max(1, damage + variance);
}

export function useSiegeEngine(state: GameState, engineId: string, targetId: string, targetType: 'defense' | 'unit'): { success: boolean; damage?: number; message?: string } {
  const engine = state.siegeEngines.find(s => s.id === engineId);
  if (!engine) return { success: false, message: 'Siege engine not found' };
  if (engine.attacked) return { success: false, message: 'Engine already attacked this turn' };

  let target: DefenseStructure | Unit | undefined;
  if (targetType === 'defense') {
    target = state.defenses.find(d => d.id === targetId);
  } else {
    target = state.units.find(u => u.id === targetId);
  }

  if (!target) return { success: false, message: 'Target not found' };

  const distance = getDistance(engine.position, target.position);
  if (distance > engine.stats.range) return { success: false, message: 'Target out of range' };

  if (engine.stats.currentReload > 0) {
    return { success: false, message: 'Engine is reloading' };
  }

  let damage = engine.stats.attack;

  if (engine.type === 'catapult') {
    const distanceFactor = distance / engine.stats.range;
    const scatterChance = distanceFactor * 0.4;
    if (Math.random() < scatterChance) {
      damage = Math.floor(damage * 0.3);
    }
  }

  if (targetType === 'unit') {
    damage = Math.floor(damage * 0.7);
  }

  engine.attacked = true;
  engine.stats.currentReload = engine.stats.reloadTime;

  if (targetType === 'defense') {
    (target as DefenseStructure).hp -= damage;
  } else {
    (target as Unit).stats.hp -= damage;
  }

  return { success: true, damage };
}

export function checkGameEnd(state: GameState): GameState {
  state.units = state.units.filter(u => u.stats.hp > 0);
  state.siegeEngines = state.siegeEngines.filter(s => s.stats.hp > 0);
  state.defenses = state.defenses.filter(d => d.hp > 0);

  const keep = state.defenses.find(d => d.type === 'keep');
  if (!keep || keep.hp <= 0) {
    state.phase = 'ended';
    state.winner = 'attacker';
    return state;
  }

  const attackerUnits = state.units.filter(u => u.faction === 'attacker');
  if (attackerUnits.length === 0) {
    state.phase = 'ended';
    state.winner = 'defender';
    return state;
  }

  if (state.turn >= state.config.maxTurns) {
    state.phase = 'ended';
    state.winner = 'defender';
  }

  return state;
}
