import { createSignal, createMemo, onMount, createEffect } from 'solid-js';
import { gameWS } from '../services/websocket';
import Battlefield from './Battlefield';
import ResourcePanel from './ResourcePanel';
import UnitInfoPanel from './UnitInfoPanel';
import ChatPanel from './ChatPanel';
import TurnControl from './TurnControl';
import UnitRecruitPanel from './UnitRecruitPanel';
import type { Unit, SiegeEngine, DefenseStructure, Position, UnitType, Resources } from '../types/game';

interface GameScreenProps {
  onBack: () => void;
  onViewReport: () => void;
}

const UNIT_COSTS: Record<UnitType, Resources> = {
  infantry: { gold: 50, wood: 10, stone: 0, food: 20 },
  archer: { gold: 60, wood: 20, stone: 0, food: 15 },
  cavalry: { gold: 120, wood: 10, stone: 0, food: 30 },
  sapper: { gold: 80, wood: 30, stone: 10, food: 20 },
  scout: { gold: 40, wood: 5, stone: 0, food: 10 },
};

function GameScreen(props: GameScreenProps) {
  const gameState = () => gameWS.gameState;
  const player = () => gameWS.player;

  const [selectedUnit, setSelectedUnit] = createSignal<Unit | null>(null);
  const [selectedEngine, setSelectedEngine] = createSignal<SiegeEngine | null>(null);
  const [selectedDefense, setSelectedDefense] = createSignal<DefenseStructure | null>(null);
  const [selectedUnitType, setSelectedUnitType] = createSignal<UnitType | null>(null);
  const [actionMode, setActionMode] = createSignal<'none' | 'move' | 'attack' | 'build' | 'repair'>('none');

  const isMyTurn = createMemo(() => {
    return gameState()?.currentFaction === player()?.faction;
  });

  const playerResources = createMemo(() => {
    if (!gameState() || !player()) return null;
    return gameState()!.resources[player()!.faction];
  });

  const canAffordUnit = (unitType: UnitType) => {
    const resources = playerResources();
    const cost = UNIT_COSTS[unitType];
    if (!resources || !cost) return false;
    return resources.gold >= cost.gold &&
      resources.wood >= cost.wood &&
      resources.stone >= cost.stone &&
      resources.food >= cost.food;
  };

  const canRecruitNow = createMemo(() => {
    if (!isMyTurn() || !player()) return false;
    const faction = player()!.faction;
    const subPhase = gameState()?.subPhase;
    if (faction === 'defender') {
      return subPhase === 'buildRepair';
    } else {
      return subPhase === 'movement';
    }
  });

  let lastActionData: { attackerPos?: Position; targetPos?: Position } = {};

  onMount(() => {
    gameWS.on('gameStateUpdate', (payload: any) => {
      if (payload.action === 'attack' && lastActionData.attackerPos && lastActionData.targetPos) {
        setTimeout(() => {
          const fn = (window as any).triggerAttackAnimation;
          if (fn && lastActionData.attackerPos && lastActionData.targetPos) {
            fn(lastActionData.attackerPos, lastActionData.targetPos);
          }
          lastActionData = {};
        }, 0);
      }
    });
  });

  createEffect(() => {
    const subPhase = gameState()?.subPhase;
    const faction = gameState()?.currentFaction;
    if (faction !== player()?.faction || !canRecruitNow()) {
      setSelectedUnitType(null);
    }
  });

  const handleTileClick = (x: number, y: number) => {
    if (!isMyTurn()) return;

    const state = gameState();
    if (!state) return;

    const unit = state.units.find(u => u.position.x === x && u.position.y === y);
    const engine = state.siegeEngines.find(s => s.position.x === x && s.position.y === y);
    const defense = state.defenses.find(d => d.position.x === x && d.position.y === y);

    if (selectedUnitType() && canRecruitNow()) {
      if (!canAffordUnit(selectedUnitType()!)) {
        gameWS.setErrorMessage('资源不足');
        setTimeout(() => gameWS.setErrorMessage(null), 2000);
        return;
      }

      const myFaction = player()?.faction;
      let validPosition = false;

      if (myFaction === 'defender') {
        const wallDefense = state.defenses.find(d =>
          (d.type === 'outerWall' || d.type === 'innerWall' || d.type === 'tower' || d.type === 'arrowTower' || d.type === 'gate') &&
          d.position.x === x && d.position.y === y && d.hp > 0
        );
        const occupied = state.units.some(u => u.position.x === x && u.position.y === y);
        validPosition = !!wallDefense && !occupied;
        if (!validPosition) {
          gameWS.setErrorMessage('只能部署在空的城墙上');
          setTimeout(() => gameWS.setErrorMessage(null), 2000);
          return;
        }
      } else {
        const mapHeight = state.config.mapHeight;
        validPosition = (y === mapHeight - 1 || y === mapHeight - 2);
        if (!validPosition) {
          gameWS.setErrorMessage('攻方只能在底部集结区招募');
          setTimeout(() => gameWS.setErrorMessage(null), 2000);
          return;
        }
        const occupied = state.units.some(u => u.position.x === x && u.position.y === y) ||
          state.siegeEngines.some(s => s.position.x === x && s.position.y === y);
        if (occupied) {
          gameWS.setErrorMessage('该位置已被占用');
          setTimeout(() => gameWS.setErrorMessage(null), 2000);
          return;
        }
      }

      gameWS.trainUnit(selectedUnitType()!, { x, y });
      setSelectedUnitType(null);
      return;
    }

    if (actionMode() === 'move' && selectedUnit()) {
      gameWS.moveUnit(selectedUnit()!.id, { x, y });
      setActionMode('none');
      setSelectedUnit(null);
      return;
    }

    if (actionMode() === 'attack' && selectedUnit()) {
      const attacker = selectedUnit()!;
      if (unit && unit.faction !== player()?.faction) {
        lastActionData = {
          attackerPos: { ...attacker.position },
          targetPos: { ...unit.position },
        };
        gameWS.attack(attacker.id, unit.id, 'unit');
      } else if (defense && player()?.faction === 'attacker') {
        lastActionData = {
          attackerPos: { ...attacker.position },
          targetPos: { ...defense.position },
        };
        gameWS.attack(attacker.id, defense.id, 'defense');
      } else if (engine && player()?.faction === 'defender') {
        lastActionData = {
          attackerPos: { ...attacker.position },
          targetPos: { ...engine.position },
        };
        gameWS.attack(attacker.id, engine.id, 'siegeEngine');
      }
      setActionMode('none');
      setSelectedUnit(null);
      return;
    }

    if (unit && unit.faction === player()?.faction) {
      setSelectedUnit(unit);
      setSelectedEngine(null);
      setSelectedDefense(null);
      setActionMode('none');
      setSelectedUnitType(null);
    } else if (engine && player()?.faction === 'attacker') {
      setSelectedEngine(engine);
      setSelectedUnit(null);
      setSelectedDefense(null);
      setActionMode('none');
      setSelectedUnitType(null);
    } else if (defense && player()?.faction === 'defender') {
      setSelectedDefense(defense);
      setSelectedUnit(null);
      setSelectedEngine(null);
      setActionMode('none');
      setSelectedUnitType(null);
    } else {
      setSelectedUnit(null);
      setSelectedEngine(null);
      setSelectedDefense(null);
      setActionMode('none');
    }
  };

  const handleMoveClick = () => {
    if (selectedUnit() && !selectedUnit()!.moved && gameState()?.subPhase === 'movement') {
      setActionMode('move');
      setSelectedUnitType(null);
    }
  };

  const handleAttackClick = () => {
    if (selectedUnit() && !selectedUnit()!.attacked && gameState()?.subPhase === 'attack') {
      setActionMode('attack');
      setSelectedUnitType(null);
    }
  };

  const handleEndSubPhase = () => {
    gameWS.endSubPhase();
    setSelectedUnit(null);
    setSelectedEngine(null);
    setSelectedDefense(null);
    setActionMode('none');
    setSelectedUnitType(null);
  };

  const handleSelectUnitType = (type: UnitType | null) => {
    setSelectedUnitType(type);
    setSelectedUnit(null);
    setSelectedEngine(null);
    setSelectedDefense(null);
    setActionMode('none');
  };

  const handleUnitHover = (_unit: Unit | null, _pos: { x: number; y: number } | null) => {
    // Hover tooltip handled in Battlefield canvas directly
  };

  const subPhaseNames: Record<string, string> = {
    movement: '移动阶段',
    attack: '攻击阶段',
    buildRepair: '建设/修复阶段',
    supply: '补给阶段',
  };

  const weatherIcons: Record<string, string> = {
    clear: '☀️',
    rain: '🌧️',
    fog: '🌫️',
    snow: '❄️',
  };

  const weatherNames: Record<string, string> = {
    clear: '晴天',
    rain: '雨天',
    fog: '大雾',
    snow: '大雪',
  };

  const errorMessage = () => gameWS.errorMessage;
  const isAIThinking = () => gameWS.isAIThinking;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      'flex-direction': 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        'justify-content': 'space-between',
        'align-items': 'center',
        padding: '10px 20px',
        background: 'rgba(26, 26, 46, 0.95)',
        'border-bottom': '2px solid #3a3a5a',
      }}>
        <div style={{ display: 'flex', gap: '20px', 'align-items': 'center' }}>
          <button onClick={props.onBack} style={{ background: '#555', padding: '6px 12px' }}>
            ← 退出
          </button>
          <div>
            <span style={{ color: '#a0a0c0' }}>回合 </span>
            <span style={{ 'font-size': '1.5rem', 'font-weight': 'bold', color: '#e94560' }}>
              {gameState()?.turn || 1}
            </span>
            <span style={{ color: '#a0a0c0' }}> / {gameState()?.config.maxTurns || 30}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', 'align-items': 'center' }}>
          <div style={{ 'text-align': 'center' }}>
            <span style={{ 'font-size': '1.5rem' }}>{weatherIcons[gameState()?.weather || 'clear']}</span>
            <p style={{ 'font-size': '0.8rem', color: '#a0a0c0' }}>{weatherNames[gameState()?.weather || 'clear']}</p>
          </div>
          <div style={{ 'text-align': 'center' }}>
            <span style={{ 'font-size': '1.5rem' }}>{gameState()?.timeOfDay === 'day' ? '☀️' : '🌙'}</span>
            <p style={{ 'font-size': '0.8rem', color: '#a0a0c0' }}>{gameState()?.timeOfDay === 'day' ? '白天' : '夜晚'}</p>
          </div>
          <div style={{
            padding: '8px 16px',
            'border-radius': '8px',
            background: gameState()?.currentFaction === 'attacker' ? 'rgba(233, 69, 96, 0.3)' : 'rgba(78, 205, 196, 0.3)',
            border: `2px solid ${gameState()?.currentFaction === 'attacker' ? '#e94560' : '#4ecdc4'}`,
          }}>
            <strong>{gameState()?.currentFaction === 'attacker' ? '攻方' : '守方'}行动</strong>
          </div>
          <div style={{
            padding: '6px 12px',
            'border-radius': '6px',
            background: '#3a3a5a',
          }}>
            {subPhaseNames[gameState()?.subPhase || 'movement']}
          </div>
        </div>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}>
        <div style={{
          width: '280px',
          padding: '10px',
          background: 'rgba(26, 26, 46, 0.9)',
          'border-right': '2px solid #3a3a5a',
          display: 'flex',
          'flex-direction': 'column',
          gap: '10px',
          overflow: 'auto',
        }}>
          <ResourcePanel />

          <UnitRecruitPanel
            playerFaction={player()?.faction}
            currentFaction={gameState()?.currentFaction}
            subPhase={gameState()?.subPhase || 'movement'}
            isMyTurn={isMyTurn()}
            selectedUnitType={selectedUnitType()}
            onSelectUnitType={handleSelectUnitType}
            resources={playerResources()}
            isAIThinking={isAIThinking()}
          />

          <UnitInfoPanel
            selectedUnit={selectedUnit()}
            selectedEngine={selectedEngine()}
            selectedDefense={selectedDefense()}
            onMove={handleMoveClick}
            onAttack={handleAttackClick}
            actionMode={actionMode()}
            subPhase={gameState()?.subPhase || 'movement'}
            isMyTurn={isMyTurn()}
          />
          <TurnControl
            onEndPhase={handleEndSubPhase}
            isMyTurn={isMyTurn()}
            currentSubPhase={gameState()?.subPhase || 'movement'}
            isAIThinking={isAIThinking()}
          />
        </div>

        <div style={{
          flex: 1,
          position: 'relative',
          overflow: 'auto',
          background: '#0f1f2f',
        }}>
          <Battlefield
            gameState={gameState()}
            playerFaction={player()?.faction}
            selectedUnit={selectedUnit()}
            selectedEngine={selectedEngine()}
            selectedDefense={selectedDefense()}
            selectedUnitType={selectedUnitType()}
            actionMode={actionMode()}
            subPhase={gameState()?.subPhase || 'movement'}
            currentFaction={gameState()?.currentFaction}
            onTileClick={handleTileClick}
            onUnitHover={handleUnitHover}
          />

          {isAIThinking() && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'z-index': 50,
              'pointer-events': 'none',
            }}>
              <div style={{
                padding: '30px 50px',
                background: 'rgba(26, 26, 46, 0.95)',
                border: '2px solid #4ecdc4',
                'border-radius': '16px',
                'text-align': 'center',
                'box-shadow': '0 0 40px rgba(78, 205, 196, 0.3)',
              }}>
                <div style={{
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'center',
                  gap: '15px',
                  'margin-bottom': '10px',
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    background: '#4ecdc4',
                    'border-radius': '50%',
                    animation: 'bounce 0.6s infinite alternate',
                  }} />
                  <span style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    background: '#4ecdc4',
                    'border-radius': '50%',
                    animation: 'bounce 0.6s infinite alternate',
                    'animation-delay': '0.2s',
                  }} />
                  <span style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    background: '#4ecdc4',
                    'border-radius': '50%',
                    animation: 'bounce 0.6s infinite alternate',
                    'animation-delay': '0.4s',
                  }} />
                </div>
                <div style={{
                  'font-size': '1.5rem',
                  'font-weight': 'bold',
                  color: '#4ecdc4',
                }}>
                  AI思考中...
                </div>
                <div style={{
                  'font-size': '0.9rem',
                  color: '#a0a0c0',
                  'margin-top': '5px',
                }}>
                  请稍候
                </div>
              </div>
            </div>
          )}

          {errorMessage() && (
            <div style={{
              position: 'fixed',
              top: '80px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '12px 24px',
              background: 'rgba(231, 76, 60, 0.95)',
              color: 'white',
              'border-radius': '8px',
              'font-weight': 'bold',
              'box-shadow': '0 4px 20px rgba(231, 76, 60, 0.4)',
              'z-index': 100,
              animation: 'shake 0.3s ease-in-out',
            }}>
              ⚠️ {errorMessage()}
            </div>
          )}
        </div>

        <div style={{
          width: '300px',
          padding: '10px',
          background: 'rgba(26, 26, 46, 0.9)',
          'border-left': '2px solid #3a3a5a',
          display: 'flex',
          'flex-direction': 'column',
          gap: '10px',
        }}>
          <ChatPanel />
        </div>
      </div>

      {gameState()?.phase === 'ended' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'z-index': 1000,
        }}>
          <div class="card" style={{ 'text-align': 'center', padding: '40px' }}>
            <h1 style={{ 'font-size': '3rem', 'margin-bottom': '20px' }}>
              {gameState()?.winner === player()?.faction ? '🎉 胜利!' : '💀 失败'}
            </h1>
            <p style={{ 'font-size': '1.2rem', color: '#a0a0c0', 'margin-bottom': '30px' }}>
              {gameState()?.winner === 'attacker' ? '攻方攻破了城堡！' : '守方成功保卫了城堡！'}
            </p>
            <div style={{ display: 'flex', gap: '16px', 'justify-content': 'center' }}>
              <button
                onClick={() => {
                  gameWS.requestBattleReport();
                  props.onViewReport();
                }}
                style={{
                  padding: '14px 40px',
                  'font-size': '18px',
                  background: 'linear-gradient(135deg, #4ecdc4, #26a69a)',
                }}
              >
                查看战报
              </button>
              <button onClick={props.onBack} style={{ padding: '14px 40px', 'font-size': '18px' }}>
                返回大厅
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GameScreen;
