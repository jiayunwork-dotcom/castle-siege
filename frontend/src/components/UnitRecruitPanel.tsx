import type { Faction, UnitType, Resources } from '../types/game';
import { createMemo } from 'solid-js';

interface UnitRecruitPanelProps {
  playerFaction: Faction | undefined;
  currentFaction: Faction | undefined;
  subPhase: string;
  isMyTurn: boolean;
  selectedUnitType: UnitType | null;
  onSelectUnitType: (type: UnitType | null) => void;
  resources: Resources | null | undefined;
  isAIThinking?: boolean;
}

const unitNames: Record<UnitType, string> = {
  infantry: '步兵',
  archer: '弓兵',
  cavalry: '骑兵',
  sapper: '工兵',
  scout: '斥候',
};

const unitDescriptions: Record<UnitType, string> = {
  infantry: '近战主力，血厚攻高',
  archer: '远程攻击，射程3格',
  cavalry: '高机动，移动力4',
  sapper: '擅长破坏防御工事',
  scout: '移动迅速，侦查单位',
};

const unitCosts: Record<UnitType, Resources> = {
  infantry: { gold: 50, wood: 10, stone: 0, food: 20 },
  archer: { gold: 60, wood: 20, stone: 0, food: 15 },
  cavalry: { gold: 120, wood: 10, stone: 0, food: 30 },
  sapper: { gold: 80, wood: 30, stone: 10, food: 20 },
  scout: { gold: 40, wood: 5, stone: 0, food: 10 },
};

const unitShapes: Record<UnitType, { shape: string; color: string; darkColor: string; lightColor: string }> = {
  infantry: { shape: '■', color: '#ff6b6b', darkColor: '#c0392b', lightColor: '#ff8a8a' },
  archer: { shape: '▲', color: '#4dabf7', darkColor: '#1864ab', lightColor: '#74c0fc' },
  cavalry: { shape: '◆', color: '#ffd43b', darkColor: '#e67700', lightColor: '#ffe066' },
  sapper: { shape: '●', color: '#868e96', darkColor: '#495057', lightColor: '#adb5bd' },
  scout: { shape: '·', color: '#ffffff', darkColor: '#ced4da', lightColor: '#ffffff' },
};

const unitTypes: UnitType[] = ['infantry', 'archer', 'cavalry', 'sapper', 'scout'];

function UnitRecruitPanel(props: UnitRecruitPanelProps) {
  const canRecruit = createMemo(() => {
    if (!props.isMyTurn || !props.playerFaction) return false;
    if (props.currentFaction !== props.playerFaction) return false;
    if (props.playerFaction === 'defender') {
      return props.subPhase === 'buildRepair';
    } else {
      return props.subPhase === 'movement';
    }
  });

  const panelTitle = createMemo(() => {
    if (props.playerFaction === 'defender') {
      return '🏰 城防招募';
    } else {
      return '⚔️ 集结区招募';
    }
  });

  const instructionText = createMemo(() => {
    if (props.isAIThinking) return '🤖 AI思考中...';
    if (!props.isMyTurn) return '等待对方行动...';
    if (!canRecruit()) {
      if (props.playerFaction === 'defender') {
        return '建设/修复阶段可招募';
      } else {
        return '移动阶段可招募';
      }
    }
    if (props.selectedUnitType) {
      if (props.playerFaction === 'defender') {
        return '点击城墙上的位置放置士兵';
      } else {
        return '点击底部集结区放置士兵';
      }
    }
    return '选择兵种后点击地图部署';
  });

  const canAffordUnit = (cost: Resources) => {
    if (!props.resources) return false;
    return props.resources.gold >= cost.gold &&
      props.resources.wood >= cost.wood &&
      props.resources.stone >= cost.stone &&
      props.resources.food >= cost.food;
  };

  return (
    <div class="card" style={{ padding: '12px' }}>
      <h3 style={{ 'margin-bottom': '10px', 'font-size': '1rem', color: props.playerFaction === 'attacker' ? '#e94560' : '#4ecdc4' }}>
        {panelTitle()}
      </h3>

      <p style={{
        'font-size': '0.8rem',
        color: canRecruit() ? '#4ecdc4' : '#666',
        'margin-bottom': '12px',
        padding: '6px 8px',
        background: 'rgba(58, 58, 90, 0.3)',
        'border-radius': '4px',
      }}>
        {instructionText()}
      </p>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
        {unitTypes.map(type => {
          const cost = unitCosts[type];
          const affordable = canAffordUnit(cost);
          const selected = props.selectedUnitType === type;
          const disabled = !canRecruit() || !affordable;
          const shape = unitShapes[type];
          const displayColor = props.playerFaction === 'defender' ? shape.darkColor : shape.lightColor;

          return (
            <button
              onClick={() => {
                if (disabled) return;
                props.onSelectUnitType(selected ? null : type);
              }}
              disabled={disabled}
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '10px',
                padding: '8px',
                'border-radius': '6px',
                background: selected
                  ? (props.playerFaction === 'attacker' ? 'rgba(233, 69, 96, 0.3)' : 'rgba(78, 205, 196, 0.3)')
                  : 'rgba(58, 58, 90, 0.5)',
                border: selected
                  ? `2px solid ${props.playerFaction === 'attacker' ? '#e94560' : '#4ecdc4'}`
                  : '2px solid transparent',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                transition: 'all 0.2s',
                'text-align': 'left',
                width: '100%',
              }}
            >
              <div style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                'font-size': type === 'scout' ? '28px' : '20px',
                color: displayColor,
                'font-weight': 'bold',
                background: 'rgba(0, 0, 0, 0.3)',
                'border-radius': '4px',
                'flex-shrink': 0,
              }}>
                {shape.shape}
              </div>
              <div style={{ flex: 1, 'min-width': 0 }}>
                <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
                  <span style={{ 'font-weight': 'bold', 'font-size': '0.9rem' }}>{unitNames[type]}</span>
                </div>
                <p style={{ 'font-size': '0.7rem', color: '#a0a0c0', margin: '2px 0' }}>
                  {unitDescriptions[type]}
                </p>
                <div style={{ display: 'flex', gap: '8px', 'font-size': '0.7rem', 'flex-wrap': 'wrap' }}>
                  {cost.gold > 0 && (
                    <span style={{ color: affordable ? '#ffd700' : '#e74c3c' }}>💰{cost.gold}</span>
                  )}
                  {cost.wood > 0 && (
                    <span style={{ color: affordable ? '#8b4513' : '#e74c3c' }}>🪵{cost.wood}</span>
                  )}
                  {cost.stone > 0 && (
                    <span style={{ color: affordable ? '#808080' : '#e74c3c' }}>🪨{cost.stone}</span>
                  )}
                  {cost.food > 0 && (
                    <span style={{ color: affordable ? '#deb887' : '#e74c3c' }}>🍞{cost.food}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {props.selectedUnitType && canRecruit() && (
        <button
          onClick={() => props.onSelectUnitType(null)}
          style={{
            'margin-top': '10px',
            padding: '6px',
            'font-size': '0.8rem',
            background: '#555',
            width: '100%',
          }}
        >
          取消选择
        </button>
      )}
    </div>
  );
}

export default UnitRecruitPanel;
