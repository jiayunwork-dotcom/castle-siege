import { createSignal } from 'solid-js';
import { gameWS } from '../services/websocket';
import type { Faction, AIDifficulty } from '../types/game';

interface SinglePlayerConfigProps {
  playerName: string;
  onBack: () => void;
  isConnected: boolean;
}

function SinglePlayerConfig(props: SinglePlayerConfigProps) {
  const [selectedFaction, setSelectedFaction] = createSignal<Faction>('attacker');
  const [selectedDifficulty, setSelectedDifficulty] = createSignal<AIDifficulty>('normal');

  const handleStart = () => {
    if (!props.playerName || !props.isConnected) return;
    gameWS.createSinglePlayerRoom(props.playerName, selectedFaction(), selectedDifficulty());
  };

  const difficultyDescriptions: Record<AIDifficulty, string> = {
    easy: 'AI随机行动,适合新手熟悉游戏',
    normal: 'AI按策略行动,但不考虑配合',
    hard: 'AI多单位协同作战,具有挑战性',
  };

  const factionDescriptions: Record<Faction, { icon: string; name: string; desc: string }> = {
    attacker: {
      icon: '⚔️',
      name: '攻方',
      desc: '指挥攻城器械和军队,突破敌方防线,攻陷城堡',
    },
    defender: {
      icon: '🛡️',
      name: '守方',
      desc: '建造防御工事,调配守军,保卫城堡不被攻陷',
    },
  };

  return (
    <div style={{
      'min-height': '100vh',
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      'justify-content': 'center',
      padding: '20px',
      'background-image': 'radial-gradient(circle at 50% 50%, rgba(78, 205, 196, 0.1) 0%, transparent 50%)',
    }}>
      <div style={{ 'text-align': 'center', 'margin-bottom': '40px' }}>
        <h1 class="title">🎮 单人练习模式</h1>
        <p class="subtitle" style={{ 'margin-top': '10px' }}>
          与AI对战,熟悉游戏机制
        </p>
      </div>

      <div class="card" style={{ width: '100%', 'max-width': '550px' }}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '25px' }}>
          <div>
            <label style={{ display: 'block', 'margin-bottom': '12px', 'font-weight': '600', 'font-size': '1.1rem' }}>
              选择阵营
            </label>
            <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '15px' }}>
              {(['attacker', 'defender'] as Faction[]).map((faction) => {
                const info = factionDescriptions[faction];
                const isSelected = selectedFaction() === faction;
                return (
                  <button
                    onClick={() => setSelectedFaction(faction)}
                    style={{
                      padding: '20px',
                      'text-align': 'center',
                      background: isSelected
                        ? faction === 'attacker'
                          ? 'rgba(233, 69, 96, 0.2)'
                          : 'rgba(78, 205, 196, 0.2)'
                        : 'rgba(255, 255, 255, 0.05)',
                      border: `2px solid ${isSelected
                        ? faction === 'attacker' ? '#e94560' : '#4ecdc4'
                        : '#3a3a5a'}`,
                      'border-radius': '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ 'font-size': '2.5rem', 'margin-bottom': '8px' }}>{info.icon}</div>
                    <div style={{ 'font-size': '1.2rem', 'font-weight': 'bold', 'margin-bottom': '6px' }}>
                      {info.name}
                    </div>
                    <div style={{ 'font-size': '0.85rem', color: '#a0a0c0', 'line-height': '1.4' }}>
                      {info.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', 'margin-bottom': '12px', 'font-weight': '600', 'font-size': '1.1rem' }}>
              选择AI难度
            </label>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
              {(['easy', 'normal', 'hard'] as AIDifficulty[]).map((difficulty) => {
                const isSelected = selectedDifficulty() === difficulty;
                const colors = {
                  easy: { bg: 'rgba(46, 204, 113, 0.2)', border: '#2ecc71', label: '🌟 简单' },
                  normal: { bg: 'rgba(241, 196, 15, 0.2)', border: '#f1c40f', label: '⭐ 普通' },
                  hard: { bg: 'rgba(231, 76, 60, 0.2)', border: '#e74c3c', label: '💀 困难' },
                };
                const c = colors[difficulty];
                return (
                  <button
                    onClick={() => setSelectedDifficulty(difficulty)}
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      'justify-content': 'space-between',
                      'align-items': 'center',
                      background: isSelected ? c.bg : 'rgba(255, 255, 255, 0.05)',
                      border: `2px solid ${isSelected ? c.border : '#3a3a5a'}`,
                      'border-radius': '10px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <span style={{ 'font-weight': 'bold', 'font-size': '1.05rem' }}>{c.label}</span>
                    <span style={{ 'font-size': '0.85rem', color: '#a0a0c0' }}>
                      {difficultyDescriptions[difficulty]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{
            padding: '15px',
            background: 'rgba(255, 255, 255, 0.03)',
            'border-radius': '8px',
            'border-left': '3px solid #4ecdc4',
          }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'margin-bottom': '8px' }}>
              <span>👤</span>
              <span style={{ 'font-weight': '600' }}>玩家: {props.playerName || '未设置'}</span>
            </div>
            <div style={{ 'font-size': '0.9rem', color: '#a0a0c0' }}>
              将扮演 {factionDescriptions[selectedFaction()].name},
              对战 {difficultyDescriptions[selectedDifficulty()].split('，')[0]} AI
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={props.onBack}
              style={{ flex: 1, padding: '14px', 'font-size': '16px', background: '#555' }}
            >
              ← 返回大厅
            </button>
            <button
              onClick={handleStart}
              style={{
                flex: 2,
                padding: '14px',
                'font-size': '16px',
                background: 'linear-gradient(135deg, #e94560, #c73e54)',
                'font-weight': 'bold',
              }}
              disabled={!props.playerName || !props.isConnected}
            >
              🚀 开始练习
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SinglePlayerConfig;
