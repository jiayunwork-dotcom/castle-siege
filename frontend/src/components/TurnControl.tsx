interface TurnControlProps {
  onEndPhase: () => void;
  isMyTurn: boolean;
  currentSubPhase: string;
  isAIThinking?: boolean;
}

const subPhaseNames: Record<string, string> = {
  movement: '移动阶段',
  attack: '攻击阶段',
  buildRepair: '建设阶段',
  supply: '补给阶段',
};

const subPhaseDescriptions: Record<string, string> = {
  movement: '移动你的单位和攻城器械',
  attack: '命令单位和器械发动攻击',
  buildRepair: '建造防御设施或招募部队',
  supply: '消耗粮草补给部队',
};

function TurnControl(props: TurnControlProps) {
  return (
    <div class="card" style={{ padding: '12px' }}>
      <h3 style={{ 'margin-bottom': '10px', 'font-size': '1rem', color: '#a0a0c0' }}>
        回合控制
      </h3>

      <div style={{ 'margin-bottom': '12px' }}>
        <p style={{ 'font-size': '0.85rem', color: '#888', 'margin-bottom': '4px' }}>
          当前阶段
        </p>
        <p style={{ 'font-weight': 'bold', 'font-size': '1.1rem', color: '#e94560' }}>
          {subPhaseNames[props.currentSubPhase] || props.currentSubPhase}
        </p>
      </div>

      <div style={{ 'margin-bottom': '12px', padding: '8px', background: 'rgba(58, 58, 90, 0.5)', 'border-radius': '6px' }}>
        <p style={{ 'font-size': '0.8rem', color: '#a0a0c0' }}>
          {subPhaseDescriptions[props.currentSubPhase] || ''}
        </p>
      </div>

      <button
        onClick={props.onEndPhase}
        disabled={!props.isMyTurn}
        style={{
          width: '100%',
          padding: '12px',
          'font-size': '1rem',
          background: props.isAIThinking ? '#9b59b6' : props.isMyTurn ? '#e94560' : '#555',
        }}
      >
        {props.isAIThinking ? '🤖 AI思考中...' : props.isMyTurn ? '⏭️ 结束阶段' : '等待对方行动...'}
      </button>

      {!props.isMyTurn && (
        <p style={{ 'margin-top': '8px', 'text-align': 'center', 'font-size': '0.8rem', color: props.isAIThinking ? '#9b59b6' : '#888' }}>
          {props.isAIThinking ? '请稍候，AI正在决策' : '轮到对方回合'}
        </p>
      )}
    </div>
  );
}

export default TurnControl;
