import { GameState, Unit, Position, Faction, AIDifficulty, DefenseStructure, SiegeEngine, AIDecision } from '../types/game';
import { getDistance, getManhattanDistance, randomInt, isAdjacent } from '../utils/helpers';
import { WEATHER_MODIFIERS, SIEGE_ENGINE_COSTS, DEFENSE_COSTS, UNIT_COSTS } from '../constants/gameConfig';
import { canAfford } from './turnSystem';

const AI_THINKING_TIME: Record<AIDifficulty, number> = {
  easy: 1000,
  normal: 1500,
  hard: 2000,
};

export function getAIThinkingTime(difficulty: AIDifficulty): number {
  return AI_THINKING_TIME[difficulty];
}

export class AIEngine {
  private state: GameState;
  private faction: Faction;
  private difficulty: AIDifficulty;
  private aiPlayerId: string;

  constructor(state: GameState, faction: Faction, difficulty: AIDifficulty) {
    this.state = state;
    this.faction = faction;
    this.difficulty = difficulty;
    const aiPlayer = state.players.find(p => p.faction === faction && p.name.includes('AI'));
    this.aiPlayerId = aiPlayer?.id || 'ai-player';
  }

  updateState(state: GameState): void {
    this.state = state;
  }

  getFaction(): Faction {
    return this.faction;
  }

  makeDecisions(): AIDecision[] {
    const decisions: AIDecision[] = [];
    const subPhase = this.state.subPhase;

    switch (subPhase) {
      case 'movement':
        decisions.push(...this.decideMovement());
        break;
      case 'attack':
        decisions.push(...this.decideAttacks());
        break;
      case 'buildRepair':
        decisions.push(...this.decideBuildRepair());
        break;
      case 'supply':
        decisions.push(...this.decideSupply());
        break;
    }

    decisions.push({ type: 'endPhase' });
    return decisions;
  }

  private decideMovement(): AIDecision[] {
    const decisions: AIDecision[] = [];
    const myUnits = this.state.units.filter(u => u.faction === this.faction && !u.moved);
    const myEngines = this.state.siegeEngines.filter(e => e.faction === this.faction && !e.moved && e.stats.hp > 0);

    if (this.difficulty === 'easy') {
      for (const unit of myUnits) {
        const target = this.getRandomValidMove(unit);
        if (target) {
          decisions.push({
            type: 'move',
            unitId: unit.id,
            targetPosition: target,
          });
        }
      }
      for (const engine of myEngines) {
        const target = this.getRandomValidSiegeMove(engine);
        if (target) {
          decisions.push({
            type: 'move',
            unitId: engine.id,
            targetPosition: target,
          });
        }
      }
    } else if (this.difficulty === 'normal') {
      const orderedUnits = this.faction === 'attacker' 
        ? this.orderAttackerUnits(myUnits)
        : this.orderDefenderUnits(myUnits);
      
      for (const unit of orderedUnits) {
        const target = this.faction === 'attacker'
          ? this.getAttackerMoveTarget(unit)
          : this.getDefenderMoveTarget(unit);
        if (target) {
          decisions.push({
            type: 'move',
            unitId: unit.id,
            targetPosition: target,
          });
        }
      }

      if (this.faction === 'attacker') {
        for (const engine of myEngines) {
          const target = this.getSiegeEngineMoveTarget(engine);
          if (target) {
            decisions.push({
              type: 'move',
              unitId: engine.id,
              targetPosition: target,
            });
          }
        }
      }
    } else {
      const coordinatedDecisions = this.faction === 'attacker'
        ? this.getHardAttackerMoves(myUnits)
        : this.getHardDefenderMoves(myUnits);
      decisions.push(...coordinatedDecisions);

      if (this.faction === 'attacker') {
        const orderedEngines = [...myEngines].sort((a, b) => {
          if (a.type === 'batteringRam' && b.type !== 'batteringRam') return -1;
          if (b.type === 'batteringRam' && a.type !== 'batteringRam') return 1;
          if (a.type === 'catapult' && b.type !== 'catapult') return -1;
          if (b.type === 'catapult' && a.type !== 'catapult') return 1;
          return 0;
        });
        
        for (const engine of orderedEngines) {
          const target = this.getSiegeEngineMoveTarget(engine);
          if (target) {
            decisions.push({
              type: 'move',
              unitId: engine.id,
              targetPosition: target,
            });
          }
        }
      }
    }

    return decisions;
  }

  private orderAttackerUnits(units: Unit[]): Unit[] {
    return [...units].sort((a, b) => {
      if (a.type === 'infantry' && b.type !== 'infantry') return -1;
      if (b.type === 'infantry' && a.type !== 'infantry') return 1;
      if (a.type === 'cavalry' && b.type !== 'cavalry') return -1;
      if (b.type === 'cavalry' && a.type !== 'cavalry') return 1;
      return 0;
    });
  }

  private orderDefenderUnits(units: Unit[]): Unit[] {
    return [...units].sort((a, b) => {
      if (a.type === 'archer' && b.type !== 'archer') return -1;
      if (b.type === 'archer' && a.type !== 'archer') return 1;
      if (a.type === 'infantry' && b.type !== 'infantry') return -1;
      if (b.type === 'infantry' && a.type !== 'infantry') return 1;
      return 0;
    });
  }

  private getRandomValidMove(unit: Unit): Position | null {
    const weatherMod = WEATHER_MODIFIERS[this.state.weather].movementSpeed;
    const maxMove = Math.floor(unit.stats.speed * weatherMod);
    const validPositions: Position[] = [];

    for (let dx = -maxMove; dx <= maxMove; dx++) {
      for (let dy = -maxMove; dy <= maxMove; dy++) {
        if (dx === 0 && dy === 0) continue;
        const target = { x: unit.position.x + dx, y: unit.position.y + dy };
        if (this.isValidMove(unit, target)) {
          validPositions.push(target);
        }
      }
    }

    if (validPositions.length === 0) return null;
    return validPositions[randomInt(0, validPositions.length - 1)];
  }

  private isValidMove(unit: Unit, target: Position): boolean {
    if (target.x < 0 || target.x >= this.state.config.mapWidth) return false;
    if (target.y < 0 || target.y >= this.state.config.mapHeight) return false;

    const weatherMod = WEATHER_MODIFIERS[this.state.weather].movementSpeed;
    const maxMove = Math.floor(unit.stats.speed * weatherMod);

    if (unit.onWall) {
      if (unit.position.y !== target.y) return false;
      const dx = Math.abs(unit.position.x - target.x);
      if (dx > maxMove) return false;
      const targetDefense = this.state.defenses.find(d =>
        (d.type === 'outerWall' || d.type === 'innerWall' || d.type === 'tower' || d.type === 'arrowTower' || d.type === 'gate') &&
        d.position.x === target.x &&
        d.position.y === target.y &&
        d.hp > 0
      );
      if (!targetDefense) return false;
    } else {
      const distance = getManhattanDistance(unit.position, target);
      if (distance > maxMove) return false;
    }

    if (this.isPositionBlocked(target, unit.faction)) return false;

    return true;
  }

  private isPositionBlocked(pos: Position, faction: Faction): boolean {
    const unitAtPos = this.state.units.find(u => u.position.x === pos.x && u.position.y === pos.y);
    if (unitAtPos) return true;

    const siegeAtPos = this.state.siegeEngines.find(s => s.position.x === pos.x && s.position.y === pos.y);
    if (siegeAtPos) return true;

    if (faction === 'attacker') {
      const moat = this.state.defenses.find(d =>
        d.type === 'moat' && d.position.x === pos.x && d.position.y === pos.y
      );
      if (moat && moat.hp > 0 && !moat.moatFrozen) {
        return true;
      }
    }

    return false;
  }

  private getRandomValidSiegeMove(engine: SiegeEngine): Position | null {
    const weatherMod = WEATHER_MODIFIERS[this.state.weather].movementSpeed;
    const maxMove = Math.max(1, Math.floor(engine.stats.speed * weatherMod));
    const validPositions: Position[] = [];

    for (let dx = -maxMove; dx <= maxMove; dx++) {
      for (let dy = -maxMove; dy <= maxMove; dy++) {
        if (dx === 0 && dy === 0) continue;
        const target = { x: engine.position.x + dx, y: engine.position.y + dy };
        if (this.isValidSiegeMove(engine, target)) {
          validPositions.push(target);
        }
      }
    }

    if (validPositions.length === 0) return null;
    return validPositions[randomInt(0, validPositions.length - 1)];
  }

  private isValidSiegeMove(engine: SiegeEngine, target: Position): boolean {
    if (target.x < 0 || target.x >= this.state.config.mapWidth) return false;
    if (target.y < 0 || target.y >= this.state.config.mapHeight) return false;

    const weatherMod = WEATHER_MODIFIERS[this.state.weather].movementSpeed;
    const maxMove = Math.max(1, Math.floor(engine.stats.speed * weatherMod));

    const distance = getManhattanDistance(engine.position, target);
    if (distance > maxMove) return false;

    if (this.isPositionBlocked(target, engine.faction)) return false;

    return true;
  }

  private getSiegeEngineMoveTarget(engine: SiegeEngine): Position | null {
    const weatherMod = WEATHER_MODIFIERS[this.state.weather].movementSpeed;
    const maxMove = Math.max(1, Math.floor(engine.stats.speed * weatherMod));

    const targetWall = { position: this.findWeakestWallPoint() } as DefenseStructure;
    if (!targetWall) return this.getRandomValidSiegeMove(engine);

    let bestPosition: Position | null = null;
    let bestScore = -Infinity;

    for (let dx = -maxMove; dx <= maxMove; dx++) {
      for (let dy = -maxMove; dy <= maxMove; dy++) {
        if (dx === 0 && dy === 0) continue;
        const target = { x: engine.position.x + dx, y: engine.position.y + dy };
        if (!this.isValidSiegeMove(engine, target)) continue;

        let score = 0;
        const distToWall = getManhattanDistance(target, targetWall.position);
        score += (20 - distToWall) * 10;

        if (engine.type === 'catapult') {
          const distToTower = this.getDistanceToNearestTower(target);
          score += Math.max(0, (10 - distToTower) * 8);
          if (distToWall <= engine.stats.range) {
            score += 50;
          }
        } else if (engine.type === 'batteringRam') {
          if (distToWall <= 1) {
            score += 100;
          }
        } else if (engine.type === 'ladder') {
          if (distToWall <= 1) {
            score += 80;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestPosition = target;
        }
      }
    }

    return bestPosition;
  }

  private getDistanceToNearestTower(pos: Position): number {
    let minDist = Infinity;
    for (const defense of this.state.defenses) {
      if ((defense.type === 'tower' || defense.type === 'arrowTower') && defense.hp > 0) {
        const dist = getManhattanDistance(pos, defense.position);
        if (dist < minDist) {
          minDist = dist;
        }
      }
    }
    return minDist;
  }

  private getAttackerMoveTarget(unit: Unit): Position | null {
    const weakPoint = this.findWeakestWallPoint();
    const target = this.moveTowards(unit, weakPoint);
    
    if (target && this.isValidMove(unit, target)) {
      return target;
    }
    
    return this.getRandomValidMove(unit);
  }

  private getDefenderMoveTarget(unit: Unit): Position | null {
    let target: Position | null = null;

    if (unit.type === 'archer') {
      target = this.findBestTowerPosition(unit);
    } else if (unit.type === 'infantry') {
      target = this.findGatePosition();
    } else {
      target = this.findCenterOfDefense();
    }

    if (target && this.isValidMove(unit, target)) {
      return target;
    }

    return this.getRandomValidMove(unit);
  }

  private findWeakestWallPoint(): Position {
    const walls = this.state.defenses.filter(d => 
      (d.type === 'outerWall' || d.type === 'innerWall' || d.type === 'gate') && d.hp > 0
    );

    if (walls.length === 0) {
      const keep = this.state.defenses.find(d => d.type === 'keep');
      return keep?.position || { x: Math.floor(this.state.config.mapWidth / 2), y: Math.floor(this.state.config.mapHeight / 2) };
    }

    let weakest = walls[0];
    let minHpRatio = weakest.hp / weakest.maxHp;

    for (const wall of walls) {
      const ratio = wall.hp / wall.maxHp;
      if (ratio < minHpRatio) {
        minHpRatio = ratio;
        weakest = wall;
      }
    }

    return weakest.position;
  }

  private findBestTowerPosition(unit: Unit): Position | null {
    const towers = this.state.defenses.filter(d => 
      (d.type === 'tower' || d.type === 'arrowTower' || d.type === 'outerWall') && d.hp > 0
    );

    let best: DefenseStructure | null = null;
    let bestScore = -Infinity;

    for (const tower of towers) {
      const occupied = this.state.units.some(u => 
        u.position.x === tower.position.x && 
        u.position.y === tower.position.y && 
        u.id !== unit.id
      );
      if (occupied) continue;

      let score = 0;
      if (tower.type === 'tower' || tower.type === 'arrowTower') score += 100;
      if (tower.type === 'outerWall') score += 50;

      const attackerUnits = this.state.units.filter(u => u.faction === 'attacker');
      for (const enemy of attackerUnits) {
        const dist = getDistance(tower.position, enemy.position);
        score += Math.max(0, 50 - dist * 5);
      }

      if (score > bestScore) {
        bestScore = score;
        best = tower;
      }
    }

    return best?.position || null;
  }

  private findGatePosition(): Position | null {
    const gates = this.state.defenses.filter(d => d.type === 'gate' && d.hp > 0);
    if (gates.length === 0) return null;

    let closest: DefenseStructure | null = null;
    let minDist = Infinity;

    for (const gate of gates) {
      const dist = getManhattanDistance(
        { x: Math.floor(this.state.config.mapWidth / 2), y: 0 },
        gate.position
      );
      if (dist < minDist) {
        minDist = dist;
        closest = gate;
      }
    }

    return closest?.position || null;
  }

  private findCenterOfDefense(): Position {
    const keeps = this.state.defenses.filter(d => d.type === 'keep');
    if (keeps.length > 0) return keeps[0].position;

    return {
      x: Math.floor(this.state.config.mapWidth / 2),
      y: Math.floor(this.state.config.mapHeight / 2),
    };
  }

  private moveTowards(unit: Unit, target: Position): Position | null {
    const weatherMod = WEATHER_MODIFIERS[this.state.weather].movementSpeed;
    const maxMove = Math.floor(unit.stats.speed * weatherMod);
    
    const dx = target.x - unit.position.x;
    const dy = target.y - unit.position.y;
    
    const stepsX = Math.sign(dx) * Math.min(Math.abs(dx), maxMove);
    const remaining = maxMove - Math.abs(stepsX);
    const stepsY = Math.sign(dy) * Math.min(Math.abs(dy), remaining);

    return {
      x: unit.position.x + stepsX,
      y: unit.position.y + stepsY,
    };
  }

  private getHardAttackerMoves(units: Unit[]): AIDecision[] {
    const decisions: AIDecision[] = [];
    const weakPoint = this.findWeakestWallPoint();
    const infantry = units.filter(u => u.type === 'infantry' || u.type === 'cavalry');
    const archers = units.filter(u => u.type === 'archer');
    const others = units.filter(u => u.type !== 'infantry' && u.type !== 'cavalry' && u.type !== 'archer');

    for (const unit of infantry) {
      const target = this.moveTowards(unit, weakPoint);
      if (target && this.isValidMove(unit, target)) {
        decisions.push({ type: 'move', unitId: unit.id, targetPosition: target });
      }
    }

    for (const unit of archers) {
      let bestPos: Position | null = null;
      let bestScore = -Infinity;

      for (let dx = -unit.stats.speed; dx <= unit.stats.speed; dx++) {
        for (let dy = -unit.stats.speed; dy <= unit.stats.speed; dy++) {
          const pos = { x: unit.position.x + dx, y: unit.position.y + dy };
          if (!this.isValidMove(unit, pos)) continue;

          let score = 0;
          const distToWall = getDistance(pos, weakPoint);
          score += Math.max(0, 100 - distToWall * 10);

          if (distToWall <= unit.stats.range) {
            score += 50;
          }

          for (const inf of infantry) {
            if (isAdjacent(pos, inf.position)) {
              score += 20;
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestPos = pos;
          }
        }
      }

      if (bestPos) {
        decisions.push({ type: 'move', unitId: unit.id, targetPosition: bestPos });
      }
    }

    for (const unit of others) {
      const target = this.moveTowards(unit, weakPoint);
      if (target && this.isValidMove(unit, target)) {
        decisions.push({ type: 'move', unitId: unit.id, targetPosition: target });
      }
    }

    return decisions;
  }

  private getHardDefenderMoves(units: Unit[]): AIDecision[] {
    const decisions: AIDecision[] = [];
    const weakPoint = this.findWeakestWallPoint();
    const archers = units.filter(u => u.type === 'archer');
    const infantry = units.filter(u => u.type === 'infantry');
    const others = units.filter(u => u.type !== 'archer' && u.type !== 'infantry');

    for (const unit of archers) {
      const towerPos = this.findBestTowerPosition(unit);
      if (towerPos && this.isValidMove(unit, towerPos)) {
        decisions.push({ type: 'move', unitId: unit.id, targetPosition: towerPos });
      } else {
        const target = this.moveTowards(unit, weakPoint);
        if (target && this.isValidMove(unit, target)) {
          decisions.push({ type: 'move', unitId: unit.id, targetPosition: target });
        }
      }
    }

    for (const unit of infantry) {
      const gatePos = this.findGatePosition();
      if (gatePos) {
        const adjPositions = this.getAdjacentPositions(gatePos);
        for (const pos of adjPositions) {
          if (this.isValidMove(unit, pos)) {
            decisions.push({ type: 'move', unitId: unit.id, targetPosition: pos });
            break;
          }
        }
      }
    }

    for (const unit of others) {
      const center = this.findCenterOfDefense();
      const target = this.moveTowards(unit, center);
      if (target && this.isValidMove(unit, target)) {
        decisions.push({ type: 'move', unitId: unit.id, targetPosition: target });
      }
    }

    return decisions;
  }

  private getAdjacentPositions(pos: Position): Position[] {
    return [
      { x: pos.x - 1, y: pos.y },
      { x: pos.x + 1, y: pos.y },
      { x: pos.x, y: pos.y - 1 },
      { x: pos.x, y: pos.y + 1 },
    ];
  }

  private decideAttacks(): AIDecision[] {
    const decisions: AIDecision[] = [];
    const myUnits = this.state.units.filter(u => u.faction === this.faction && !u.attacked);
    const myEngines = this.state.siegeEngines.filter(e => e.faction === this.faction && !e.attacked && e.stats.currentReload === 0);

    let focusTarget: { id: string; type: 'unit' | 'defense' | 'siegeEngine' } | null = null;

    if (this.difficulty === 'hard') {
      focusTarget = this.findBestFocusTarget();
    }

    for (const unit of myUnits) {
      let attackDecision: AIDecision | null = null;

      if (this.difficulty === 'easy') {
        attackDecision = this.getRandomAttack(unit);
      } else if (this.difficulty === 'normal') {
        attackDecision = this.getBestAttack(unit);
      } else {
        attackDecision = focusTarget 
          ? this.getFocusedAttack(unit, focusTarget)
          : this.getBestAttack(unit);
      }

      if (attackDecision) {
        decisions.push(attackDecision);
      }
    }

    for (const engine of myEngines) {
      const decision = this.getBestSiegeAttack(engine);
      if (decision) {
        decisions.push(decision);
      }
    }

    return decisions;
  }

  private getRandomAttack(unit: Unit): AIDecision | null {
    const targets = this.getAllValidTargets(unit);
    if (targets.length === 0) return null;
    const target = targets[randomInt(0, targets.length - 1)];
    return {
      type: 'attack',
      unitId: unit.id,
      targetId: target.id,
      targetType: target.type,
    };
  }

  private getAllValidTargets(unit: Unit): Array<{ id: string; type: 'unit' | 'defense' | 'siegeEngine' }> {
    const targets: Array<{ id: string; type: 'unit' | 'defense' | 'siegeEngine' }> = [];
    let attackRange = unit.stats.range;

    if (unit.onWall && unit.type === 'archer') {
      attackRange = Math.floor(attackRange * 1.3);
    }

    for (const defense of this.state.defenses) {
      if (defense.hp > 0 && getDistance(unit.position, defense.position) <= attackRange) {
        if (this.faction === 'attacker') {
          targets.push({ id: defense.id, type: 'defense' });
        }
      }
    }

    for (const engine of this.state.siegeEngines) {
      if (engine.faction !== this.faction && engine.stats.hp > 0 && getDistance(unit.position, engine.position) <= attackRange) {
        targets.push({ id: engine.id, type: 'siegeEngine' });
      }
    }

    for (const enemy of this.state.units) {
      if (enemy.faction !== this.faction && enemy.stats.hp > 0 && getDistance(unit.position, enemy.position) <= attackRange) {
        targets.push({ id: enemy.id, type: 'unit' });
      }
    }

    return targets;
  }

  private getBestAttack(unit: Unit): AIDecision | null {
    const targets = this.getAllValidTargets(unit);
    if (targets.length === 0) return null;

    let bestTarget: { id: string; type: 'unit' | 'defense' | 'siegeEngine' } | null = null;
    let bestScore = -Infinity;

    for (const target of targets) {
      const score = this.scoreTarget(unit, target);
      if (score > bestScore) {
        bestScore = score;
        bestTarget = target;
      }
    }

    if (!bestTarget) return null;

    return {
      type: 'attack',
      unitId: unit.id,
      targetId: bestTarget.id,
      targetType: bestTarget.type,
    };
  }

  private scoreTarget(unit: Unit, target: { id: string; type: 'unit' | 'defense' | 'siegeEngine' }): number {
    let score = 0;

    if (target.type === 'unit') {
      const enemy = this.state.units.find(u => u.id === target.id);
      if (!enemy) return -Infinity;

      const hpRatio = enemy.stats.hp / enemy.stats.maxHp;
      score += (1 - hpRatio) * 100;

      if (enemy.type === 'archer' && unit.type === 'cavalry') score += 30;
      if (enemy.type === 'infantry' && unit.type === 'archer') score += 20;
      
      score += enemy.stats.attack * 0.5;
    } else if (target.type === 'defense') {
      const defense = this.state.defenses.find(d => d.id === target.id);
      if (!defense) return -Infinity;

      if (this.faction === 'attacker') {
        const hpRatio = defense.hp / defense.maxHp;
        score += (1 - hpRatio) * 80;

        if (defense.type === 'gate') score += 40;
        if (defense.type === 'arrowTower' || defense.type === 'tower') score += 50;
        if (defense.type === 'outerWall') score += 20;
        if (defense.type === 'keep') score += 60;
      }
    } else {
      const engine = this.state.siegeEngines.find(e => e.id === target.id);
      if (!engine) return -Infinity;

      if (this.faction === 'defender') {
        score += 70;
        const hpRatio = engine.stats.hp / engine.stats.maxHp;
        score += (1 - hpRatio) * 30;

        if (engine.type === 'catapult') score += 30;
        if (engine.type === 'batteringRam') score += 25;
      }
    }

    return score;
  }

  private findBestFocusTarget(): { id: string; type: 'unit' | 'defense' | 'siegeEngine' } | null {
    let bestTarget: { id: string; type: 'unit' | 'defense' | 'siegeEngine' } | null = null;
    let bestTotalDamage = 0;

    const enemyUnits = this.state.units.filter(u => u.faction !== this.faction);
    for (const enemy of enemyUnits) {
      const totalDamage = this.calculatePotentialDamage(enemy.position, enemy.stats.range);
      const killPotential = (enemy.stats.maxHp - enemy.stats.hp) / enemy.stats.maxHp;
      const score = totalDamage * (1 + killPotential * 2);

      if (score > bestTotalDamage) {
        bestTotalDamage = score;
        bestTarget = { id: enemy.id, type: 'unit' };
      }
    }

    if (this.faction === 'attacker') {
      for (const defense of this.state.defenses) {
        if (defense.type === 'keep' || defense.type === 'gate' || defense.type === 'arrowTower') {
          const totalDamage = this.calculatePotentialDamage(defense.position, 3);
          const killPotential = (defense.maxHp - defense.hp) / defense.maxHp;
          const score = totalDamage * (1 + killPotential * 2);

          if (score > bestTotalDamage) {
            bestTotalDamage = score;
            bestTarget = { id: defense.id, type: 'defense' };
          }
        }
      }
    }

    return bestTarget;
  }

  private calculatePotentialDamage(targetPos: Position, range: number): number {
    let totalDamage = 0;
    const myUnits = this.state.units.filter(u => u.faction === this.faction && !u.attacked);

    for (const unit of myUnits) {
      if (getDistance(unit.position, targetPos) <= range || getDistance(unit.position, targetPos) <= unit.stats.range) {
        totalDamage += unit.stats.attack;
      }
    }

    return totalDamage;
  }

  private getFocusedAttack(
    unit: Unit,
    focusTarget: { id: string; type: 'unit' | 'defense' | 'siegeEngine' }
  ): AIDecision | null {
    const targets = this.getAllValidTargets(unit);
    const hasFocus = targets.find(t => t.id === focusTarget.id && t.type === focusTarget.type);

    if (hasFocus) {
      return {
        type: 'attack',
        unitId: unit.id,
        targetId: focusTarget.id,
        targetType: focusTarget.type,
      };
    }

    return this.getBestAttack(unit);
  }

  private getBestSiegeAttack(engine: SiegeEngine): AIDecision | null {
    let bestTarget: DefenseStructure | Unit | null = null;
    let bestScore = -Infinity;
    let bestTargetType: 'defense' | 'unit' = 'defense';

    if (this.faction === 'attacker') {
      for (const defense of this.state.defenses) {
        if (getDistance(engine.position, defense.position) > engine.stats.range) continue;
        if (defense.hp <= 0) continue;

        let score = 0;
        const hpRatio = defense.hp / defense.maxHp;
        score += (1 - hpRatio) * 80;

        if (engine.type === 'catapult') {
          if (defense.type === 'arrowTower' || defense.type === 'tower') score += 60;
        }
        if (engine.type === 'batteringRam') {
          if (defense.type === 'gate') score += 80;
        }

        if (score > bestScore) {
          bestScore = score;
          bestTarget = defense;
          bestTargetType = 'defense';
        }
      }

      for (const unit of this.state.units) {
        if (unit.faction === this.faction) continue;
        if (unit.stats.hp <= 0) continue;
        if (getDistance(engine.position, unit.position) > engine.stats.range) continue;

        let score = 0;
        const hpRatio = unit.stats.hp / unit.stats.maxHp;
        score += (1 - hpRatio) * 60;

        if (score > bestScore) {
          bestScore = score;
          bestTarget = unit;
          bestTargetType = 'unit';
        }
      }
    } else {
      for (const enemyUnit of this.state.units) {
        if (enemyUnit.faction === this.faction) continue;
        if (enemyUnit.stats.hp <= 0) continue;
        if (getDistance(engine.position, enemyUnit.position) > engine.stats.range) continue;

        let score = 0;
        const hpRatio = enemyUnit.stats.hp / enemyUnit.stats.maxHp;
        score += (1 - hpRatio) * 70;

        if (enemyUnit.type === 'sapper') score += 40;

        if (score > bestScore) {
          bestScore = score;
          bestTarget = enemyUnit;
          bestTargetType = 'unit';
        }
      }

      for (const enemyEngine of this.state.siegeEngines) {
        if (enemyEngine.faction === this.faction) continue;
        if (enemyEngine.stats.hp <= 0) continue;
        if (getDistance(engine.position, enemyEngine.position) > engine.stats.range) continue;

        let score = 50;
        const hpRatio = enemyEngine.stats.hp / enemyEngine.stats.maxHp;
        score += (1 - hpRatio) * 40;

        if (score > bestScore) {
          bestScore = score;
          bestTarget = enemyEngine as any;
          bestTargetType = 'unit';
        }
      }
    }

    if (bestTarget) {
      return {
        type: 'attack',
        unitId: engine.id,
        targetId: bestTarget.id,
        targetType: bestTargetType,
      };
    }

    return null;
  }

  private decideBuildRepair(): AIDecision[] {
    const decisions: AIDecision[] = [];

    if (this.faction === 'defender') {
      decisions.push(...this.decideDefenderBuildRepair());
    } else {
      decisions.push(...this.decideAttackerBuild());
    }

    return decisions;
  }

  private decideDefenderBuildRepair(): AIDecision[] {
    const decisions: AIDecision[] = [];
    const resources = this.state.resources.defender;

    const damaged = this.state.defenses
      .filter(d => d.hp < d.maxHp)
      .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));

    for (const defense of damaged) {
      if (defense.hp / defense.maxHp < 0.3 || (this.difficulty !== 'easy' && defense.hp < defense.maxHp)) {
        const repairAmount = Math.min(defense.maxHp - defense.hp, 50);
        const repairCost = {
          gold: Math.floor(repairAmount * 0.5),
          wood: Math.floor(repairAmount * 0.3),
          stone: Math.floor(repairAmount * 0.4),
          food: 0,
        };

        if (canAfford(resources, repairCost)) {
          decisions.push({
            type: 'repair',
            structureId: defense.id,
            amount: repairAmount,
          });
          resources.gold -= repairCost.gold;
          resources.wood -= repairCost.wood;
          resources.stone -= repairCost.stone;
        }
      }
    }

    if (this.difficulty !== 'easy') {
      const arrowTowerCost = DEFENSE_COSTS.arrowTower;
      if (canAfford(resources, arrowTowerCost)) {
        const pos = this.findBuildPositionForDefender();
        if (pos) {
          decisions.push({
            type: 'build',
            structureType: 'arrowTower',
            targetPosition: pos,
          });
        }
      }
    }

    return decisions;
  }

  private findBuildPositionForDefender(): Position | null {
    const innerWalls = this.state.defenses.filter(d => d.type === 'innerWall' && d.hp > 0);
    for (const wall of innerWalls) {
      const occupied = this.state.units.some(u => 
        u.position.x === wall.position.x && u.position.y === wall.position.y
      ) || this.state.defenses.some(d => 
        d.position.x === wall.position.x && d.position.y === wall.position.y && d.id !== wall.id
      );
      if (!occupied && wall.type === 'innerWall') {
        return wall.position;
      }
    }
    return null;
  }

  private decideAttackerBuild(): AIDecision[] {
    const decisions: AIDecision[] = [];
    const resources = this.state.resources.attacker;
    const myEngines = this.state.siegeEngines.filter(e => e.faction === this.faction);

    const ladderCount = myEngines.filter(e => e.type === 'ladder').length;
    const batteringRamCount = myEngines.filter(e => e.type === 'batteringRam').length;
    const catapultCount = myEngines.filter(e => e.type === 'catapult').length;

    let neededEngine: string | null = null;

    if (this.difficulty === 'hard') {
      const towerCount = this.state.defenses.filter(d => d.type === 'tower' || d.type === 'arrowTower').length;
      const gates = this.state.defenses.filter(d => d.type === 'gate');
      const avgGateHp = gates.length > 0 
        ? gates.reduce((sum, g) => sum + g.hp / g.maxHp, 0) / gates.length 
        : 0;

      if (towerCount > 3 && catapultCount < 2) {
        neededEngine = 'catapult';
      } else if (avgGateHp > 0.5 && batteringRamCount < 2) {
        neededEngine = 'batteringRam';
      } else if (ladderCount < 3) {
        neededEngine = 'ladder';
      }
    } else {
      if (ladderCount < 2) {
        neededEngine = 'ladder';
      } else if (batteringRamCount < 1) {
        neededEngine = 'batteringRam';
      } else if (this.difficulty === 'normal' && catapultCount < 1) {
        neededEngine = 'catapult';
      }
    }

    if (neededEngine) {
      const cost = SIEGE_ENGINE_COSTS[neededEngine];
      if (cost && canAfford(resources, cost)) {
        const pos = this.findBuildPositionForAttacker();
        if (pos) {
          decisions.push({
            type: 'build',
            structureType: neededEngine as any,
            targetPosition: pos,
          });
        }
      }
    }

    return decisions;
  }

  private findBuildPositionForAttacker(): Position | null {
    const mapHeight = this.state.config.mapHeight;
    for (let y = mapHeight - 1; y >= mapHeight - 3; y--) {
      for (let x = 0; x < this.state.config.mapWidth; x++) {
        const occupied = this.state.units.some(u => u.position.x === x && u.position.y === y) ||
          this.state.siegeEngines.some(s => s.position.x === x && s.position.y === y);
        if (!occupied) {
          return { x, y };
        }
      }
    }
    return null;
  }

  private decideSupply(): AIDecision[] {
    const decisions: AIDecision[] = [];
    const resources = this.state.resources[this.faction];
    const myUnits = this.state.units.filter(u => u.faction === this.faction);

    const lowHpUnits = myUnits
      .filter(u => u.stats.hp < u.stats.maxHp * 0.7)
      .sort((a, b) => (a.stats.hp / a.stats.maxHp) - (b.stats.hp / b.stats.maxHp));

    let foodRemaining = resources.food;
    const foodPerHeal = 10;
    const healAmount = 20;

    for (const unit of lowHpUnits) {
      if (foodRemaining < foodPerHeal) break;

      let priority = 0;
      if (unit.type === 'archer') priority += 3;
      if (unit.type === 'infantry') priority += 2;
      if (unit.type === 'cavalry') priority += 2;
      if (unit.stats.hp < unit.stats.maxHp * 0.3) priority += 5;

      if (this.difficulty === 'easy') priority = 1;

      if (priority > 0) {
        const neededHeals = Math.ceil((unit.stats.maxHp - unit.stats.hp) / healAmount);
        const affordableHeals = Math.floor(foodRemaining / foodPerHeal);
        const actualHeals = Math.min(neededHeals, affordableHeals, this.difficulty === 'hard' ? 3 : 2);

        if (actualHeals > 0) {
          unit.stats.hp = Math.min(unit.stats.maxHp, unit.stats.hp + actualHeals * healAmount);
          foodRemaining -= actualHeals * foodPerHeal;
        }
      }
    }

    resources.food = foodRemaining;

    return decisions;
  }
}
