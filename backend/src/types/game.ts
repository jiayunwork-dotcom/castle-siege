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

export interface GameEvent {
  turn: number;
  type: 'wallBreached' | 'gateFallen' | 'towerDestroyed' | 'reinforcementsArrived' | 'innerCityBreakthrough' | 'keepDamaged';
  description: string;
  playerId?: string;
  playerName?: string;
  position?: Position;
}

export interface TurnSnapshotUnit {
  id: string;
  type: UnitType;
  faction: Faction;
  position: Position;
  hp: number;
  maxHp: number;
  ownerId: string;
}

export interface TurnSnapshotSiegeEngine {
  id: string;
  type: SiegeEngineType;
  faction: Faction;
  position: Position;
  hp: number;
  maxHp: number;
}

export interface TurnSnapshotDefense {
  id: string;
  type: DefenseType;
  position: Position;
  hp: number;
  maxHp: number;
}

export type ActionType = 'move' | 'attack' | 'build' | 'repair' | 'train' | 'siegeAttack';

export interface TurnAction {
  type: ActionType;
  actorId: string;
  actorType?: 'unit' | 'siegeEngine';
  fromPosition?: Position;
  toPosition?: Position;
  targetId?: string;
  targetType?: 'unit' | 'defense' | 'siegeEngine';
  damage?: number;
  killed?: boolean;
  newBuildingType?: DefenseType | SiegeEngineType;
  newUnitType?: UnitType;
  repairAmount?: number;
  newUnitId?: string;
  newBuildingId?: string;
}

export interface TurnSnapshot {
  turn: number;
  attackerUnitCount: number;
  defenderUnitCount: number;
  attackerSiegeEngineCount: number;
  defenderDefenseCount: number;
  units: TurnSnapshotUnit[];
  siegeEngines: TurnSnapshotSiegeEngine[];
  defenses: TurnSnapshotDefense[];
  startUnits: TurnSnapshotUnit[];
  startSiegeEngines: TurnSnapshotSiegeEngine[];
  startDefenses: TurnSnapshotDefense[];
  resources: Record<Faction, Resources>;
  events: GameEvent[];
  attackerKills: number;
  defenderKills: number;
  attackerLosses: number;
  defenderLosses: number;
  resourceConsumption: Record<Faction, Resources>;
  actions: TurnAction[];
}

export interface PlayerBattleStats {
  playerId: string;
  playerName: string;
  faction: Faction;
  kills: number;
  assists: number;
  losses: number;
  damageDealt: number;
  damageTaken: number;
  survivalTurns: number;
}

export interface UnitTypeKillStats {
  unitType: UnitType;
  kills: number;
}

export interface MVPData {
  playerId: string;
  playerName: string;
  faction: Faction;
  kills: number;
  damageDealt: number;
  survivalTurns: number;
  score: number;
}

export interface BattleReport {
  gameId: string;
  winner: Faction;
  totalTurns: number;
  turnSnapshots: TurnSnapshot[];
  playerStats: PlayerBattleStats[];
  attackerKillByType: UnitTypeKillStats[];
  defenderKillByType: UnitTypeKillStats[];
  keyEvents: GameEvent[];
  attackerMVP: MVPData;
  defenderMVP: MVPData;
}

export type AIDifficulty = 'easy' | 'normal' | 'hard';

export interface AIDecision {
  type: 'move' | 'attack' | 'build' | 'repair' | 'supply' | 'endPhase';
  unitId?: string;
  targetPosition?: Position;
  targetId?: string;
  targetType?: 'unit' | 'defense' | 'siegeEngine';
  structureType?: DefenseType | SiegeEngineType;
  structureId?: string;
  amount?: number;
}

export interface AIConfig {
  difficulty: AIDifficulty;
  faction: Faction;
}

export interface SinglePlayerConfig {
  playerName: string;
  playerFaction: Faction;
  aiDifficulty: AIDifficulty;
}

export interface AIDecisionLogEntry {
  timestamp: number;
  turn: number;
  subPhase: TurnSubPhase;
  description: string;
}

export interface PowerUpdate {
  attackerPower: number;
  defenderPower: number;
}

export interface RoundPowerRecord {
  turn: number;
  attackerPower: number;
  defenderPower: number;
}
