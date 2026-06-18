import { GameState, DefenseStructure, Unit, Faction, WallDirection, GameConfig } from '../types/game';
import { generateId, randomInt } from '../utils/helpers';
import { DEFAULT_CONFIG, DEFENSE_STATS, UNIT_BASE_STATS } from '../constants/gameConfig';

export function createInitialGameState(roomId: string, config: Partial<GameConfig> = {}): GameState {
  const gameConfig: GameConfig = { ...DEFAULT_CONFIG, ...config };
  const { mapWidth, mapHeight } = gameConfig;

  const defenses = createCastleDefenses(mapWidth, mapHeight);
  const units = createInitialUnits(mapWidth, mapHeight);

  const state: GameState = {
    id: roomId,
    phase: 'preparation',
    turn: 1,
    subPhase: 'movement',
    currentFaction: 'defender',
    players: [],
    units,
    siegeEngines: [],
    defenses,
    resources: {
      attacker: { ...gameConfig.startingResources },
      defender: { ...gameConfig.startingResources },
    },
    weather: 'clear',
    timeOfDay: 'day',
    config: gameConfig,
    actionsPending: [],
    lastUpdate: Date.now(),
  };

  return state;
}

function createCastleDefenses(mapWidth: number, mapHeight: number): DefenseStructure[] {
  const defenses: DefenseStructure[] = [];
  const castleStartX = Math.floor(mapWidth * 0.3);
  const castleStartY = Math.floor(mapHeight * 0.3);
  const castleEndX = Math.floor(mapWidth * 0.7);
  const castleEndY = Math.floor(mapHeight * 0.7);

  const outerWallHp = DEFENSE_STATS.outerWall.hp;
  const innerWallHp = DEFENSE_STATS.innerWall.hp;
  const towerHp = DEFENSE_STATS.tower.hp;
  const gateHp = DEFENSE_STATS.gate.hp;
  const moatHp = DEFENSE_STATS.moat.hp;
  const arrowTowerHp = DEFENSE_STATS.arrowTower.hp;
  const keepHp = DEFENSE_STATS.keep.hp;

  for (let x = castleStartX; x <= castleEndX; x++) {
    defenses.push(createDefense('outerWall', { x, y: castleStartY }, outerWallHp, 'north'));
    defenses.push(createDefense('outerWall', { x, y: castleEndY }, outerWallHp, 'south'));
    defenses.push(createDefense('moat', { x, y: castleStartY - 1 }, moatHp, 'north'));
    defenses.push(createDefense('moat', { x, y: castleEndY + 1 }, moatHp, 'south'));
  }

  for (let y = castleStartY + 1; y < castleEndY; y++) {
    defenses.push(createDefense('outerWall', { x: castleStartX, y }, outerWallHp, 'west'));
    defenses.push(createDefense('outerWall', { x: castleEndX, y }, outerWallHp, 'east'));
    defenses.push(createDefense('moat', { x: castleStartX - 1, y }, moatHp, 'west'));
    defenses.push(createDefense('moat', { x: castleEndX + 1, y }, moatHp, 'east'));
  }

  const innerStartX = castleStartX + 2;
  const innerStartY = castleStartY + 2;
  const innerEndX = castleEndX - 2;
  const innerEndY = castleEndY - 2;

  for (let x = innerStartX; x <= innerEndX; x++) {
    defenses.push(createDefense('innerWall', { x, y: innerStartY }, innerWallHp, 'north'));
    defenses.push(createDefense('innerWall', { x, y: innerEndY }, innerWallHp, 'south'));
  }

  for (let y = innerStartY + 1; y < innerEndY; y++) {
    defenses.push(createDefense('innerWall', { x: innerStartX, y }, innerWallHp, 'west'));
    defenses.push(createDefense('innerWall', { x: innerEndX, y }, innerWallHp, 'east'));
  }

  defenses.push(createDefense('tower', { x: castleStartX, y: castleStartY }, towerHp, 'north'));
  defenses.push(createDefense('tower', { x: castleEndX, y: castleStartY }, towerHp, 'north'));
  defenses.push(createDefense('tower', { x: castleStartX, y: castleEndY }, towerHp, 'south'));
  defenses.push(createDefense('tower', { x: castleEndX, y: castleEndY }, towerHp, 'south'));

  const midX = Math.floor((castleStartX + castleEndX) / 2);
  const midY = Math.floor((castleStartY + castleEndY) / 2);

  const northGate = createDefense('gate', { x: midX, y: castleStartY }, gateHp, 'north');
  northGate.hasGate = true;
  northGate.gateUpgrades = { ironBars: false, boilingOil: false };
  defenses.push(northGate);

  const southGate = createDefense('gate', { x: midX, y: castleEndY }, gateHp, 'south');
  southGate.hasGate = true;
  southGate.gateUpgrades = { ironBars: false, boilingOil: false };
  defenses.push(southGate);

  const westGate = createDefense('gate', { x: castleStartX, y: midY }, gateHp, 'west');
  westGate.hasGate = true;
  westGate.gateUpgrades = { ironBars: false, boilingOil: false };
  defenses.push(westGate);

  const eastGate = createDefense('gate', { x: castleEndX, y: midY }, gateHp, 'east');
  eastGate.hasGate = true;
  eastGate.gateUpgrades = { ironBars: false, boilingOil: false };
  defenses.push(eastGate);

  const arrowTowerPositions = [
    { x: castleStartX + Math.floor((castleEndX - castleStartX) / 3), y: castleStartY },
    { x: castleStartX + Math.floor((castleEndX - castleStartX) * 2 / 3), y: castleStartY },
    { x: castleStartX + Math.floor((castleEndX - castleStartX) / 3), y: castleEndY },
    { x: castleStartX + Math.floor((castleEndX - castleStartX) * 2 / 3), y: castleEndY },
  ];

  arrowTowerPositions.forEach(pos => {
    const arrowTower = createDefense('arrowTower', pos, arrowTowerHp, 'north');
    arrowTower.hasArrowTower = true;
    defenses.push(arrowTower);
  });

  const keepX = Math.floor((innerStartX + innerEndX) / 2);
  const keepY = Math.floor((innerStartY + innerEndY) / 2);
  defenses.push(createDefense('keep', { x: keepX, y: keepY }, keepHp));

  return defenses;
}

function createDefense(
  type: string,
  position: { x: number; y: number },
  hp: number,
  wallSection?: WallDirection
): DefenseStructure {
  return {
    id: generateId(),
    type: type as any,
    position,
    hp,
    maxHp: hp,
    level: 1,
    wallSection,
    garrisonedUnits: [],
  };
}

function createInitialUnits(mapWidth: number, mapHeight: number): Unit[] {
  const units: Unit[] = [];
  const castleStartX = Math.floor(mapWidth * 0.3);
  const castleEndX = Math.floor(mapWidth * 0.7);
  const castleEndY = Math.floor(mapHeight * 0.7);

  const defenderUnits = [
    { type: 'infantry' as const, count: 5 },
    { type: 'archer' as const, count: 4 },
    { type: 'sapper' as const, count: 2 },
    { type: 'cavalry' as const, count: 2 },
  ];

  let unitIndex = 0;
  defenderUnits.forEach(({ type, count }) => {
    for (let i = 0; i < count; i++) {
      const x = castleStartX + 2 + (unitIndex % 6);
      const y = castleEndY - 2 + Math.floor(unitIndex / 6);
      units.push(createUnit(type, 'defender', { x, y }, `defender-${unitIndex}`));
      unitIndex++;
    }
  });

  const attackerUnits = [
    { type: 'infantry' as const, count: 6 },
    { type: 'archer' as const, count: 4 },
    { type: 'cavalry' as const, count: 3 },
    { type: 'sapper' as const, count: 3 },
    { type: 'scout' as const, count: 2 },
  ];

  unitIndex = 0;
  attackerUnits.forEach(({ type, count }) => {
    for (let i = 0; i < count; i++) {
      const x = 2 + (unitIndex % 8);
      const y = Math.floor(mapHeight * 0.5) - 3 + Math.floor(unitIndex / 8);
      units.push(createUnit(type, 'attacker', { x, y }, `attacker-${unitIndex}`));
      unitIndex++;
    }
  });

  return units;
}

function createUnit(
  type: string,
  faction: Faction,
  position: { x: number; y: number },
  ownerId: string
): Unit {
  const baseStats = { ...UNIT_BASE_STATS[type as keyof typeof UNIT_BASE_STATS] };
  return {
    id: generateId(),
    type: type as any,
    ownerId,
    faction,
    position,
    stats: baseStats,
    moved: false,
    attacked: false,
    onWall: false,
  };
}

export function randomizeWeather(): string {
  const weathers = ['clear', 'clear', 'clear', 'rain', 'fog', 'snow'];
  return weathers[randomInt(0, weathers.length - 1)];
}

export function randomizeTimeOfDay(turn: number): string {
  return turn % 4 < 2 ? 'day' : 'night';
}
