import { GameState, TurnSubPhase, Faction, DefenseStructure, SiegeEngine } from '../types/game';
import { randomizeWeather, randomizeTimeOfDay } from './gameInitializer';
import { checkGameEnd } from './combatSystem';
import { WEATHER_MODIFIERS } from '../constants/gameConfig';

export function advanceTurn(state: GameState): GameState {
  const subPhases: TurnSubPhase[] = ['movement', 'attack', 'buildRepair', 'supply'];
  const currentIndex = subPhases.indexOf(state.subPhase);

  if (currentIndex < subPhases.length - 1) {
    state.subPhase = subPhases[currentIndex + 1];
  } else {
    if (state.currentFaction === 'defender') {
      state.currentFaction = 'attacker';
    } else {
      state.currentFaction = 'defender';
      state.turn++;

      state.weather = randomizeWeather() as any;
      state.timeOfDay = randomizeTimeOfDay(state.turn) as any;

      updateMoatFreeze(state);
    }
    state.subPhase = 'movement';
  }

  resetUnitsForNewSubPhase(state);
  resetSiegeEnginesReload(state);
  checkGameEnd(state);

  state.lastUpdate = Date.now();

  return state;
}

function resetUnitsForNewSubPhase(state: GameState): void {
  if (state.subPhase === 'movement') {
    state.units.forEach(unit => {
      if (unit.faction === state.currentFaction) {
        unit.moved = false;
        unit.attacked = false;
      }
    });
    state.siegeEngines.forEach(engine => {
      if (engine.faction === state.currentFaction) {
        engine.moved = false;
        engine.attacked = false;
      }
    });
  } else if (state.subPhase === 'attack') {
    state.units.forEach(unit => {
      if (unit.faction === state.currentFaction) {
        unit.attacked = false;
      }
    });
  }
}

function resetSiegeEnginesReload(state: GameState): void {
  state.siegeEngines.forEach(engine => {
    if (engine.stats.currentReload > 0) {
      engine.stats.currentReload--;
    }
  });
}

function updateMoatFreeze(state: GameState): void {
  const frozen = WEATHER_MODIFIERS[state.weather].moatFrozen;
  state.defenses.forEach(d => {
    if (d.type === 'moat') {
      d.moatFrozen = frozen;
    }
  });
}

export function processSupplyPhase(state: GameState): GameState {
  const attackerUnits = state.units.filter(u => u.faction === 'attacker');
  const defenderUnits = state.units.filter(u => u.faction === 'defender');

  const attackerFoodCost = attackerUnits.length * 2;
  const defenderFoodCost = defenderUnits.length * 1;

  state.resources.attacker.food -= attackerFoodCost;
  state.resources.defender.food -= defenderFoodCost;

  if (state.resources.attacker.food < 0) {
    const starvingUnits = Math.ceil(Math.abs(state.resources.attacker.food) / 10);
    for (let i = 0; i < starvingUnits && attackerUnits.length > 0; i++) {
      const idx = Math.floor(Math.random() * attackerUnits.length);
      attackerUnits[idx].stats.hp -= 20;
    }
    state.resources.attacker.food = 0;
  }

  if (state.resources.defender.food < 0) {
    const starvingUnits = Math.ceil(Math.abs(state.resources.defender.food) / 10);
    for (let i = 0; i < starvingUnits && defenderUnits.length > 0; i++) {
      const idx = Math.floor(Math.random() * defenderUnits.length);
      defenderUnits[idx].stats.hp -= 20;
    }
    state.resources.defender.food = 0;
  }

  return state;
}

export function canAfford(resources: any, cost: any): boolean {
  return resources.gold >= cost.gold &&
    resources.wood >= cost.wood &&
    resources.stone >= cost.stone &&
    resources.food >= cost.food;
}

export function deductResources(resources: any, cost: any): any {
  return {
    gold: resources.gold - cost.gold,
    wood: resources.wood - cost.wood,
    stone: resources.stone - cost.stone,
    food: resources.food - cost.food,
  };
}
