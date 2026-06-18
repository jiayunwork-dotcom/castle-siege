import { UnitStats, SiegeEngineStats, Resources, GameConfig } from '../types/game';

export const UNIT_BASE_STATS: Record<string, UnitStats> = {
  infantry: {
    attack: 15,
    defense: 12,
    speed: 2,
    range: 1,
    hp: 100,
    maxHp: 100,
  },
  archer: {
    attack: 10,
    defense: 5,
    speed: 2,
    range: 3,
    hp: 60,
    maxHp: 60,
  },
  cavalry: {
    attack: 20,
    defense: 8,
    speed: 4,
    range: 1,
    hp: 80,
    maxHp: 80,
  },
  sapper: {
    attack: 5,
    defense: 6,
    speed: 2,
    range: 1,
    hp: 50,
    maxHp: 50,
  },
  scout: {
    attack: 3,
    defense: 3,
    speed: 5,
    range: 3,
    hp: 30,
    maxHp: 30,
  },
};

export const UNIT_COSTS: Record<string, Resources> = {
  infantry: { gold: 50, wood: 10, stone: 0, food: 20 },
  archer: { gold: 60, wood: 20, stone: 0, food: 15 },
  cavalry: { gold: 120, wood: 10, stone: 0, food: 30 },
  sapper: { gold: 80, wood: 30, stone: 10, food: 20 },
  scout: { gold: 40, wood: 5, stone: 0, food: 10 },
};

export const SIEGE_ENGINE_STATS: Record<string, SiegeEngineStats> = {
  siegeTower: {
    hp: 200,
    maxHp: 200,
    attack: 0,
    range: 0,
    speed: 0.5,
    reloadTime: 0,
    currentReload: 0,
  },
  batteringRam: {
    hp: 150,
    maxHp: 150,
    attack: 40,
    range: 1,
    speed: 0.5,
    reloadTime: 1,
    currentReload: 0,
  },
  catapult: {
    hp: 100,
    maxHp: 100,
    attack: 50,
    range: 8,
    speed: 0.3,
    reloadTime: 2,
    currentReload: 0,
  },
  ladder: {
    hp: 30,
    maxHp: 30,
    attack: 0,
    range: 0,
    speed: 1,
    reloadTime: 0,
    currentReload: 0,
  },
  ballista: {
    hp: 80,
    maxHp: 80,
    attack: 25,
    range: 6,
    speed: 0.5,
    reloadTime: 1,
    currentReload: 0,
  },
  tunnel: {
    hp: 0,
    maxHp: 0,
    attack: 60,
    range: 0,
    speed: 0.2,
    reloadTime: 0,
    currentReload: 0,
  },
};

export const SIEGE_ENGINE_COSTS: Record<string, Resources> = {
  siegeTower: { gold: 300, wood: 200, stone: 50, food: 0 },
  batteringRam: { gold: 150, wood: 100, stone: 20, food: 0 },
  catapult: { gold: 250, wood: 150, stone: 80, food: 0 },
  ladder: { gold: 30, wood: 30, stone: 0, food: 0 },
  ballista: { gold: 180, wood: 80, stone: 30, food: 0 },
  tunnel: { gold: 200, wood: 50, stone: 0, food: 0 },
};

export const DEFENSE_STATS: Record<string, { hp: number; attack?: number; range?: number }> = {
  outerWall: { hp: 300 },
  innerWall: { hp: 200 },
  tower: { hp: 250, attack: 15, range: 5 },
  moat: { hp: 100 },
  gate: { hp: 200 },
  arrowTower: { hp: 150, attack: 20, range: 6 },
  keep: { hp: 500 },
};

export const DEFENSE_COSTS: Record<string, Resources> = {
  outerWall: { gold: 100, wood: 50, stone: 150, food: 0 },
  innerWall: { gold: 80, wood: 40, stone: 100, food: 0 },
  tower: { gold: 200, wood: 100, stone: 150, food: 0 },
  moat: { gold: 80, wood: 20, stone: 50, food: 0 },
  gate: { gold: 150, wood: 80, stone: 80, food: 0 },
  arrowTower: { gold: 180, wood: 60, stone: 100, food: 0 },
  keep: { gold: 500, wood: 200, stone: 400, food: 0 },
};

export const DEFAULT_CONFIG: GameConfig = {
  maxPlayers: 6,
  attackersPerTeam: 3,
  defendersPerTeam: 3,
  maxTurns: 30,
  startingResources: {
    gold: 1000,
    wood: 500,
    stone: 300,
    food: 200,
  },
  mapWidth: 20,
  mapHeight: 20,
};

export const WEATHER_MODIFIERS: Record<string, {
  bowDamage: number;
  bowAccuracy: number;
  movementSpeed: number;
  visibility: number;
  moatFrozen: boolean;
}> = {
  clear: {
    bowDamage: 1,
    bowAccuracy: 1,
    movementSpeed: 1,
    visibility: 1,
    moatFrozen: false,
  },
  rain: {
    bowDamage: 0.7,
    bowAccuracy: 0.6,
    movementSpeed: 0.8,
    visibility: 0.8,
    moatFrozen: false,
  },
  fog: {
    bowDamage: 1,
    bowAccuracy: 0.8,
    movementSpeed: 1,
    visibility: 0.5,
    moatFrozen: false,
  },
  snow: {
    bowDamage: 0.8,
    bowAccuracy: 0.9,
    movementSpeed: 0.7,
    visibility: 0.7,
    moatFrozen: true,
  },
};

export const TIME_OF_DAY_MODIFIERS: Record<string, {
  visibility: number;
  detectionChance: number;
}> = {
  day: {
    visibility: 1,
    detectionChance: 1,
  },
  night: {
    visibility: 0.5,
    detectionChance: 0.4,
  },
};

export const WALL_DEFENSE_BONUS = {
  defense: 0.5,
  range: 0.3,
};

export const UNIT_COUNTERS: Record<string, string> = {
  cavalry: 'infantry',
  infantrySpear: 'cavalry',
  archer: 'infantry',
};
