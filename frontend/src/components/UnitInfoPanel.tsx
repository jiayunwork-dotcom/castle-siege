import type { Unit, SiegeEngine, DefenseStructure } from '../types/game';

interface UnitInfoPanelProps {
  selectedUnit: Unit | null;
  selectedEngine: SiegeEngine | null;
  selectedDefense: DefenseStructure | null;
  onMove: () => void;
  onAttack: () => void;
  actionMode: string;
  subPhase: string;
  isMyTurn: boolean;
}

const unitNames: Record<string, string> = {
  infantry: '步兵',
  archer: '弓兵',
  cavalry: '骑兵',
  sapper: '工兵',
  scout: '斥候',
};

const engineNames: Record<string, string> = {
  siegeTower: '攻城塔',
  batteringRam: '破城锤',
  catapult: '投石机',
  ladder: '云梯',
  ballista: '攻城弩',
  tunnel: '地道',
};

const defenseNames: Record<string, string> = {
  outerWall: '外墙',
  innerWall: '内墙',
  tower: '塔楼',
  moat: '护城河',
  gate: '城门',
  arrowTower: '箭塔',
  keep: '内城',
};

function UnitInfoPanel(props: UnitInfoPanelProps) {
  if (!props.selectedUnit && !props.selectedEngine && !props.selectedDefense) {
    return (
      <div class="card" style={{ padding: '12px' }}>
        <h3 style={{ 'margin-bottom': '10px', 'font-size': '1rem', color: '#a0a0c0' }}>
          单位信息
        </h3>
        <p style={{ color: '#666', 'font-size': '0.9rem' }}>点击地图上的单位查看信息</p>
      </div>
    );
  }

  if (props.selectedUnit) {
    const unit = props.selectedUnit;
    const hpPercent = (unit.stats.hp / unit.stats.maxHp) * 100;

    return (
      <div class="card" style={{ padding: '12px' }}>
        <h3 style={{ 'margin-bottom': '10px', 'font-size': '1rem', color: unit.faction === 'attacker' ? '#e94560' : '#4ecdc4' }}>
          {unitNames[unit.type] || unit.type}
        </h3>

        <div style={{ 'margin-bottom': '12px' }}>
          <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '4px' }}>
            <span style={{ 'font-size': '0.85rem' }}>生命值</span>
            <span style={{ 'font-size': '0.85rem' }}>{unit.stats.hp}/{unit.stats.maxHp}</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: '#333', 'border-radius': '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${hpPercent}%`,
                height: '100%',
                background: hpPercent > 50 ? '#2ecc71' : hpPercent > 25 ? '#f39c12' : '#e74c3c',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '8px', 'margin-bottom': '12px' }}>
          <StatItem label="攻击力" value={unit.stats.attack} icon="⚔️" />
          <StatItem label="防御力" value={unit.stats.defense} icon="🛡️" />
          <StatItem label="移动力" value={unit.stats.speed} icon="👟" />
          <StatItem label="射程" value={unit.stats.range} icon="🎯" />
        </div>

        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <button
            onClick={props.onMove}
            disabled={!props.isMyTurn || props.subPhase !== 'movement' || unit.moved}
            style={{
              background: props.actionMode === 'move' ? '#4ecdc4' : '#3a3a5a',
              padding: '8px',
              'font-size': '0.85rem',
            }}
          >
            {unit.moved ? '已移动' : '移动'}
          </button>
          <button
            onClick={props.onAttack}
            disabled={!props.isMyTurn || props.subPhase !== 'attack' || unit.attacked}
            style={{
              background: props.actionMode === 'attack' ? '#e94560' : '#3a3a5a',
              padding: '8px',
              'font-size': '0.85rem',
            }}
          >
            {unit.attacked ? '已攻击' : '攻击'}
          </button>
        </div>
      </div>
    );
  }

  if (props.selectedEngine) {
    const engine = props.selectedEngine;
    const hpPercent = (engine.stats.hp / engine.stats.maxHp) * 100;

    return (
      <div class="card" style={{ padding: '12px' }}>
        <h3 style={{ 'margin-bottom': '10px', 'font-size': '1rem', color: '#e94560' }}>
          {engineNames[engine.type] || engine.type}
        </h3>

        <div style={{ 'margin-bottom': '12px' }}>
          <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '4px' }}>
            <span style={{ 'font-size': '0.85rem' }}>耐久度</span>
            <span style={{ 'font-size': '0.85rem' }}>{engine.stats.hp}/{engine.stats.maxHp}</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: '#333', 'border-radius': '4px', overflow: 'hidden' }}>
            <div style={{ width: `${hpPercent}%`, height: '100%', background: '#e94560' }} />
          </div>
        </div>

        <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '8px' }}>
          <StatItem label="攻击" value={engine.stats.attack} icon="⚔️" />
          <StatItem label="射程" value={engine.stats.range} icon="🎯" />
          <StatItem label="移动" value={engine.stats.speed} icon="👟" />
          <StatItem label="装填" value={engine.stats.reloadTime} icon="⏱️" />
        </div>
      </div>
    );
  }

  if (props.selectedDefense) {
    const defense = props.selectedDefense;
    const hpPercent = (defense.hp / defense.maxHp) * 100;

    return (
      <div class="card" style={{ padding: '12px' }}>
        <h3 style={{ 'margin-bottom': '10px', 'font-size': '1rem', color: '#4ecdc4' }}>
          {defenseNames[defense.type] || defense.type}
        </h3>

        <div style={{ 'margin-bottom': '12px' }}>
          <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '4px' }}>
            <span style={{ 'font-size': '0.85rem' }}>耐久度</span>
            <span style={{ 'font-size': '0.85rem' }}>{defense.hp}/{defense.maxHp}</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: '#333', 'border-radius': '4px', overflow: 'hidden' }}>
            <div style={{ width: `${hpPercent}%`, height: '100%', background: '#4ecdc4' }} />
          </div>
        </div>

        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px', 'font-size': '0.85rem' }}>
          <p>等级: <strong>{defense.level}</strong></p>
          {defense.wallSection && <p>位置: <strong>{defense.wallSection}</strong></p>}
          {defense.gateUpgrades && (
            <>
              {defense.gateUpgrades.ironBars && <p style={{ color: '#ffd700' }}>✅ 铁栅门</p>}
              {defense.gateUpgrades.boilingOil && <p style={{ color: '#ffd700' }}>✅ 沸油装置</p>}
            </>
          )}
          {defense.moatFrozen !== undefined && (
            <p>状态: <strong>{defense.moatFrozen ? '❄️ 已冻结' : '💧 未冻结'}</strong></p>
          )}
        </div>
      </div>
    );
  }

  return null;
}

function StatItem({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div style={{
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      padding: '6px',
      background: 'rgba(58, 58, 90, 0.5)',
      'border-radius': '6px',
    }}>
      <span style={{ 'font-size': '0.9rem' }}>{icon}</span>
      <div>
        <p style={{ 'font-size': '0.7rem', color: '#a0a0c0' }}>{label}</p>
        <p style={{ 'font-weight': 'bold', 'font-size': '0.9rem' }}>{value}</p>
      </div>
    </div>
  );
}

export default UnitInfoPanel;
