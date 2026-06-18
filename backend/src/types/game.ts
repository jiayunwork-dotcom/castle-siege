export type Faction = 'attacker' | 'defender';

export type UnitType = 'infantry' | 'archer' | 'cavalry' | 'sapper' | 'scout';

export type SiegeEngineType = 'siegeTower' | 'batteringRam' | 'catapult' | 'ladder' | 'ballista' | 'tunnel';

export type DefenseType = 'outerWall' | 'innerWall' | 'tower' | 'moat' | 'gate' | 'arrowTower' | 'keep';

export type GamePhase = 'lobby' | 'preparation' | 'scouting' | 'advancement' | 'rangedCombat' | 'approach' | 'siege' | 'streetFighting' | 'ended';

export type TurnSubPhase = 'movement' | 'attack' | 'buildRepair' | 'supply';

export type Weather = 'clear' | 'rain' | 'fog' | 'snow';

export type TimeOfDay = 'day' | 'night';

export type WallDirection = 'north' | 'south' | 'east' | 'west';

export interface Position {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  name: string;
  faction: Faction;
  ready: boolean;
  zone?: WallDirection;
  connected: boolean;
}

export interface UnitStats {
  attack: number;
  defense: number;
  speed: number;
  range: number;
  hp: number;
  maxHp: number;
}

export interface Unit {
  id: string;
  type: UnitType;
  ownerId: string;
  faction: Faction;
  position: Position;
  stats: UnitStats;
  moved: boolean;
  attacked: boolean;
  onWall: boolean;
  wallSection?: WallDirection;
}

export interface SiegeEngineStats {
  hp: number;
  maxHp: number;
  attack: number;
  range: number;
  speed: number;
  reloadTime: number;
  currentReload: number;
}

export interface SiegeEngine {
  id: string;
  type: SiegeEngineType;
  ownerId: string;
  faction: Faction;
  position: Position;
  stats: SiegeEngineStats;
  moved: boolean;
  attacked: boolean;
  targetPosition?: Position;
  progress?: number;
}

export interface DefenseStructure {
  id: string;
  type: DefenseType;
  position: Position;
  hp: number;
  maxHp: number;
  level: number;
  wallSection?: WallDirection;
  hasGate?: boolean;
  hasMoat?: boolean;
  moatFrozen?: boolean;
  gateUpgrades?: {
    ironBars: boolean;
    boilingOil: boolean;
  };
  hasArrowTower?: boolean;
  garrisonedUnits?: string[];
}

export interface Resources {
  gold: number;
  wood: number;
  stone: number;
  food: number;
}

export interface GameConfig {
  maxPlayers: number;
  attackersPerTeam: number;
  defendersPerTeam: number;
  maxTurns: number;
  startingResources: Resources;
  mapWidth: number;
  mapHeight: number;
}

export interface GameState {
  id: string;
  phase: GamePhase;
  turn: number;
  subPhase: TurnSubPhase;
  currentFaction: Faction;
  players: Player[];
  units: Unit[];
  siegeEngines: SiegeEngine[];
  defenses: DefenseStructure[];
  resources: Record<Faction, Resources>;
  weather: Weather;
  timeOfDay: TimeOfDay;
  config: GameConfig;
  winner?: Faction;
  reinforcementTurn?: number;
  actionsPending: string[];
  lastUpdate: number;
}

export interface Room {
  id: string;
  name: string;
  hostId: string;
  players: Player[];
  gameState?: GameState;
  createdAt: number;
  hasPassword: boolean;
  maxPlayers: number;
}

export interface WSMessage {
  type: string;
  payload: any;
  playerId?: string;
  roomId?: string;
}

export interface MoveAction {
  unitId: string;
  targetPosition: Position;
}

export interface AttackAction {
  unitId: string;
  targetId: string;
  targetType: 'unit' | 'defense' | 'siegeEngine';
}

export interface BuildAction {
  structureType: DefenseType | SiegeEngineType;
  position: Position;
  wallSection?: WallDirection;
}

export interface RepairAction {
  structureId: string;
  amount: number;
}
