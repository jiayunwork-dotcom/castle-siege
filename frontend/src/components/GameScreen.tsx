import { createSignal, createMemo, onMount, createEffect } from 'solid-js';
import { gameWS } from '../services/websocket';
import Battlefield from './Battlefield';
import ResourcePanel from './ResourcePanel';
import UnitInfoPanel from './UnitInfoPanel';
import ChatPanel from './ChatPanel';
import TurnControl from './TurnControl';
import type { Unit, SiegeEngine, DefenseStructure, Position } from '../types/game';

interface GameScreenProps {
  onBack: () => void;
}

function GameScreen(props: GameScreenProps) {
  const gameState = () => gameWS.gameState;
  const player = () => gameWS.player;

  const [selectedUnit, setSelectedUnit] = createSignal<Unit | null>(null);
  const [selectedEngine, setSelectedEngine] = createSignal<SiegeEngine | null>(null);
  const [selectedDefense, setSelectedDefense] = createSignal<DefenseStructure | null>(null);
  const [actionMode, setActionMode] = createSignal<'none' | 'move' | 'attack' | 'build' | 'repair'>('none');

  const isMyTurn = createMemo(() => {
    return gameState()?.currentFaction === player()?.faction;
  });

  const myUnits = createMemo(() => {
    return gameState()?.units.filter(u => u.faction === player()?.faction) || [];
  });

  const handleTileClick = (x: number, y: number) => {
    if (!isMyTurn()) return;

    const state = gameState();
    if (!state) return;

    const unit = state.units.find(u => u.position.x === x && u.position.y === y);
    const engine = state.siegeEngines.find(s => s.position.x === x && s.position.y === y);
    const defense = state.defenses.find(d => d.position.x === x && d.position.y === y);

    if (actionMode() === 'move' && selectedUnit()) {
      gameWS.moveUnit(selectedUnit()!.id, { x, y });
      setActionMode('none');
      setSelectedUnit(null);
      return;
    }

    if (actionMode() === 'attack' && selectedUnit()) {
      if (unit && unit.faction !== player()?.faction) {
        gameWS.attack(selectedUnit()!.id, unit.id, 'unit');
      } else if (defense && player()?.faction === 'attacker') {
        gameWS.attack(selectedUnit()!.id, defense.id, 'defense');
      } else if (engine && player()?.faction === 'defender') {
        gameWS.attack(selectedUnit()!.id, engine.id, 'siegeEngine');
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
    } else if (engine && player()?.faction === 'attacker') {
      setSelectedEngine(engine);
      setSelectedUnit(null);
      setSelectedDefense(null);
      setActionMode('none');
    } else if (defense && player()?.faction === 'defender') {
      setSelectedDefense(defense);
      setSelectedUnit(null);
      setSelectedEngine(null);
      setActionMode('none');
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
    }
  };

  const handleAttackClick = () => {
    if (selectedUnit() && !selectedUnit()!.attacked && gameState()?.subPhase === 'attack') {
      setActionMode('attack');
    }
  };

  const handleEndSubPhase = () => {
    gameWS.endSubPhase();
    setSelectedUnit(null);
    setSelectedEngine(null);
    setSelectedDefense(null);
    setActionMode('none');
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
          width: '250px',
          padding: '10px',
          background: 'rgba(26, 26, 46, 0.9)',
          'border-right': '2px solid #3a3a5a',
          display: 'flex',
          'flex-direction': 'column',
          gap: '10px',
          overflow: 'auto',
        }}>
          <ResourcePanel />
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
          <TurnControl onEndPhase={handleEndSubPhase} isMyTurn={isMyTurn()} />
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
            actionMode={actionMode()}
            onTileClick={handleTileClick}
          />
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
            <button onClick={props.onBack} style={{ padding: '14px 40px', 'font-size': '18px' }}>
              返回大厅
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GameScreen;
