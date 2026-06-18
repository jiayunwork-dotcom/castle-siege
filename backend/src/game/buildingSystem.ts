import { GameState, DefenseStructure, SiegeEngine, Position, DefenseType, SiegeEngineType, Faction, WallDirection } from '../types/game';
import { generateId } from '../utils/helpers';
import { DEFENSE_COSTS, DEFENSE_STATS, SIEGE_ENGINE_COSTS, SIEGE_ENGINE_STATS, UNIT_COSTS, UNIT_BASE_STATS } from '../constants/gameConfig';
import { canAfford, deductResources } from './turnSystem';

export function buildDefense(
  state: GameState,
  structureType: DefenseType,
  position: Position,
  faction: Faction
): { success: boolean; structure?: DefenseStructure; message?: string } {
  if (faction !== 'defender') {
    return { success: false, message: 'Only defenders can build defenses' };
  }

  const cost = DEFENSE_COSTS[structureType];
  if (!cost) {
    return { success: false, message: 'Invalid structure type' };
  }

  if (!canAfford(state.resources.defender, cost)) {
    return { success: false, message: 'Insufficient resources' };
  }

  const existing = state.defenses.find(
    d => d.position.x === position.x && d.position.y === position.y
  );
  if (existing) {
    return { success: false, message: 'Position already occupied' };
  }

  const baseStats = DEFENSE_STATS[structureType];
  const structure: DefenseStructure = {
    id: generateId(),
    type: structureType,
    position,
    hp: baseStats.hp,
    maxHp: baseStats.hp,
    level: 1,
    garrisonedUnits: [],
  };

  state.defenses.push(structure);
  state.resources.defender = deductResources(state.resources.defender, cost) as any;

  return { success: true, structure };
}

export function repairStructure(
  state: GameState,
  structureId: string,
  amount: number,
  faction: Faction
): { success: boolean; message?: string } {
  const structure = state.defenses.find(d => d.id === structureId);
  if (!structure) {
    return { success: false, message: 'Structure not found' };
  }

  if (faction !== 'defender') {
    return { success: false, message: 'Only defenders can repair structures' };
  }

  const actualRepair = Math.min(amount, structure.maxHp - structure.hp);
  if (actualRepair <= 0) {
    return { success: false, message: 'Structure is at full health' };
  }

  const repairCost = {
    gold: Math.floor(actualRepair * 0.5),
    wood: Math.floor(actualRepair * 0.3),
    stone: Math.floor(actualRepair * 0.4),
    food: 0,
  };

  if (!canAfford(state.resources.defender, repairCost)) {
    return { success: false, message: 'Insufficient resources for repair' };
  }

  structure.hp += actualRepair;
  state.resources.defender = deductResources(state.resources.defender, repairCost) as any;

  return { success: true };
}

export function upgradeGate(
  state: GameState,
  gateId: string,
  upgradeType: 'ironBars' | 'boilingOil',
  faction: Faction
): { success: boolean; message?: string } {
  const gate = state.defenses.find(d => d.id === gateId);
  if (!gate || gate.type !== 'gate') {
    return { success: false, message: 'Gate not found' };
  }

  if (faction !== 'defender') {
    return { success: false, message: 'Only defenders can upgrade gates' };
  }

  if (gate.gateUpgrades?.[upgradeType]) {
    return { success: false, message: 'Upgrade already installed' };
  }

  const upgradeCost = upgradeType === 'ironBars'
    ? { gold: 100, wood: 50, stone: 80, food: 0 }
    : { gold: 150, wood: 80, stone: 30, food: 0 };

  if (!canAfford(state.resources.defender, upgradeCost)) {
    return { success: false, message: 'Insufficient resources' };
  }

  if (!gate.gateUpgrades) {
    gate.gateUpgrades = { ironBars: false, boilingOil: false };
  }
  gate.gateUpgrades[upgradeType] = true;
  gate.maxHp += upgradeType === 'ironBars' ? 100 : 0;
  gate.hp += upgradeType === 'ironBars' ? 100 : 0;

  state.resources.defender = deductResources(state.resources.defender, upgradeCost) as any;

  return { success: true };
}

export function buildSiegeEngine(
  state: GameState,
  engineType: SiegeEngineType,
  position: Position,
  ownerId: string,
  faction: Faction
): { success: boolean; engine?: SiegeEngine; message?: string } {
  if (faction !== 'attacker') {
    return { success: false, message: 'Only attackers can build siege engines' };
  }

  const cost = SIEGE_ENGINE_COSTS[engineType];
  if (!cost) {
    return { success: false, message: 'Invalid siege engine type' };
  }

  if (!canAfford(state.resources.attacker, cost)) {
    return { success: false, message: 'Insufficient resources' };
  }

  const baseStats = { ...SIEGE_ENGINE_STATS[engineType] };
  const engine: SiegeEngine = {
    id: generateId(),
    type: engineType,
    ownerId,
    faction,
    position: { ...position },
    stats: baseStats,
    moved: false,
    attacked: false,
  };

  state.siegeEngines.push(engine);
  state.resources.attacker = deductResources(state.resources.attacker, cost) as any;

  return { success: true, engine };
}

export function trainUnit(
  state: GameState,
  unitType: string,
  position: Position,
  ownerId: string,
  faction: Faction
): { success: boolean; unit?: any; message?: string } {
  const cost = UNIT_COSTS[unitType];
  if (!cost) {
    return { success: false, message: 'Invalid unit type' };
  }

  if (!canAfford(state.resources[faction], cost)) {
    return { success: false, message: 'Insufficient resources' };
  }

  const tileBlocked = isPositionBlocked(state, position);
  if (tileBlocked) {
    return { success: false, message: 'Position already occupied' };
  }

  let onWall = false;
  let wallSection: WallDirection | undefined;

  if (faction === 'defender') {
    const wallDefense = state.defenses.find(d =>
      (d.type === 'outerWall' || d.type === 'innerWall' || d.type === 'tower' || d.type === 'arrowTower' || d.type === 'gate') &&
      d.position.x === position.x &&
      d.position.y === position.y &&
      d.hp > 0
    );
    if (wallDefense) {
      onWall = true;
      wallSection = wallDefense.wallSection;
    }
  }

  if (faction === 'attacker') {
    const mapHeight = state.config.mapHeight;
    if (position.y !== mapHeight - 1 && position.y !== mapHeight - 2) {
      return { success: false, message: 'Attacker units must be recruited in the staging area' };
    }
  }

  const baseStats = { ...UNIT_BASE_STATS[unitType as keyof typeof UNIT_BASE_STATS] };
  const unit = {
    id: generateId(),
    type: unitType as any,
    ownerId,
    faction,
    position: { ...position },
    stats: baseStats,
    moved: true,
    attacked: true,
    onWall,
    wallSection,
  };

  state.units.push(unit);
  state.resources[faction] = deductResources(state.resources[faction], cost) as any;

  return { success: true, unit };
}

function isPositionBlocked(state: GameState, pos: Position): boolean {
  const unitAtPos = state.units.find(u => u.position.x === pos.x && u.position.y === pos.y);
  if (unitAtPos) return true;

  const siegeAtPos = state.siegeEngines.find(s => s.position.x === pos.x && s.position.y === pos.y);
  if (siegeAtPos) return true;

  return false;
}
