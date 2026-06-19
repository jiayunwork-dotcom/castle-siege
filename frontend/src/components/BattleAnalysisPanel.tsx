import { createSignal, createEffect, onMount, For, Show } from 'solid-js';
import { gameWS } from '../services/websocket';
import type { AIDifficulty, AIDecisionLogEntry, RoundPowerRecord } from '../types/game';

function BattleAnalysisPanel() {
  const power = () => gameWS.powerUpdate;
  const logs = () => gameWS.aiDecisionLogs;
  const roundHistory = () => gameWS.roundPowerHistory;
  const currentDifficulty = () => gameWS.aiDifficulty;
  const difficultyMsg = () => gameWS.aiDifficultyChangeMsg;

  let logContainer: HTMLDivElement | undefined;
  let chartCanvas: HTMLCanvasElement | undefined;

  const [tooltipInfo, setTooltipInfo] = createSignal<{ x: number; y: number; turn: number; attacker: number; defender: number } | null>(null);

  createEffect(() => {
    if (logContainer && logs()) {
      logs();
      logContainer.scrollTop = 0;
    }
  });

  createEffect(() => {
    const history = roundHistory();
    if (chartCanvas && history.length > 0) {
      drawChart(history);
    }
  });

  onMount(() => {
    const history = roundHistory();
    if (chartCanvas && history.length > 0) {
      drawChart(history);
    }
  });

  const attackerPercent = () => {
    const p = power();
    if (!p || (p.attackerPower === 0 && p.defenderPower === 0)) return 50;
    const total = p.attackerPower + p.defenderPower;
    return Math.round((p.attackerPower / total) * 100);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const difficultyOptions: { value: AIDifficulty; label: string }[] = [
    { value: 'easy', label: '简单' },
    { value: 'normal', label: '普通' },
    { value: 'hard', label: '困难' },
  ];

  const handleDifficultyChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    gameWS.switchAIDifficulty(target.value as AIDifficulty);
  };

  const drawChart = (history: RoundPowerRecord[]) => {
    const canvas = chartCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padLeft = 40;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 28;

    ctx.clearRect(0, 0, w, h);

    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    if (history.length < 1) return;

    const maxPower = Math.max(
      ...history.map(r => Math.max(r.attackerPower, r.defenderPower)),
      1
    );

    ctx.strokeStyle = '#2a3a4a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padTop + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();

      ctx.fillStyle = '#6a7a8a';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      const val = Math.round(maxPower * (1 - i / 4));
      ctx.fillText(String(val), padLeft - 4, y + 3);
    }

    const minTurn = Math.min(...history.map(r => r.turn));
    const maxTurn = Math.max(...history.map(r => r.turn));
    const turnRange = Math.max(maxTurn - minTurn, 1);

    const getX = (turn: number) => padLeft + ((turn - minTurn) / turnRange) * chartW;
    const getY = (val: number) => padTop + chartH - (val / maxPower) * chartH;

    ctx.fillStyle = '#6a7a8a';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    for (const record of history) {
      if (history.length <= 10 || record.turn % Math.ceil(turnRange / 8) === 0 || record.turn === maxTurn) {
        ctx.fillText(String(record.turn), getX(record.turn), h - 6);
      }
    }

    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const x = getX(history[i].turn);
      const y = getY(history[i].attackerPower);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const x = getX(history[i].turn);
      const y = getY(history[i].defenderPower);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    for (const record of history) {
      const ax = getX(record.turn);
      const ay = getY(record.attackerPower);
      ctx.fillStyle = '#e94560';
      ctx.beginPath();
      ctx.arc(ax, ay, 3, 0, Math.PI * 2);
      ctx.fill();

      const dy = getY(record.defenderPower);
      ctx.fillStyle = '#4ecdc4';
      ctx.beginPath();
      ctx.arc(ax, dy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    (canvas as any)._chartData = { history, getX, getY, padLeft, padRight, padTop, padBottom, chartW, chartH, maxPower, minTurn, maxTurn, turnRange };
  };

  const handleChartMouseMove = (e: MouseEvent) => {
    const canvas = chartCanvas;
    if (!canvas) return;
    const chartData = (canvas as any)._chartData;
    if (!chartData) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const { history, getX, getY } = chartData;

    let closest: RoundPowerRecord | null = null;
    let closestDist = Infinity;

    for (const record of history) {
      const rx = getX(record.turn);
      const dist = Math.abs(mx - rx);
      if (dist < closestDist) {
        closestDist = dist;
        closest = record;
      }
    }

    if (closest && closestDist < 30) {
      setTooltipInfo({
        x: getX(closest.turn),
        y: Math.min(getY(closest.attackerPower), getY(closest.defenderPower)),
        turn: closest.turn,
        attacker: closest.attackerPower,
        defender: closest.defenderPower,
      });
    } else {
      setTooltipInfo(null);
    }
  };

  const handleChartMouseLeave = () => {
    setTooltipInfo(null);
  };

  return (
    <div style={{
      display: 'flex',
      'flex-direction': 'column',
      height: '100%',
      gap: '8px',
      'font-size': '12px',
    }}>
      <div style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        padding: '6px 10px',
        background: 'rgba(20, 25, 40, 0.8)',
        'border-radius': '8px',
        border: '1px solid #2a3a4a',
      }}>
        <span style={{ color: '#a0a0c0', 'font-weight': 'bold' }}>AI难度</span>
        <select
          value={currentDifficulty()}
          onChange={handleDifficultyChange}
          style={{
            padding: '4px 8px',
            background: '#1a1a2e',
            color: '#eee',
            border: '1px solid #3a3a5a',
            'border-radius': '4px',
            'font-size': '12px',
            cursor: 'pointer',
          }}
        >
          <For each={difficultyOptions}>
            {(opt) => <option value={opt.value}>{opt.label}</option>}
          </For>
        </select>
      </div>

      <Show when={difficultyMsg()}>
        <div style={{
          padding: '6px 10px',
          background: 'rgba(78, 205, 196, 0.15)',
          border: '1px solid rgba(78, 205, 196, 0.4)',
          'border-radius': '6px',
          color: '#4ecdc4',
          'text-align': 'center',
          'font-weight': 'bold',
          'font-size': '12px',
        }}>
          {difficultyMsg()}
        </div>
      </Show>

      <div style={{
        background: 'rgba(20, 25, 40, 0.8)',
        'border-radius': '8px',
        padding: '10px',
        border: '1px solid #2a3a4a',
      }}>
        <div style={{ color: '#a0a0c0', 'font-weight': 'bold', 'margin-bottom': '8px' }}>
          ⚔️ 战力对比
        </div>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '6px' }}>
          <span style={{ color: '#e94560', 'font-size': '11px', 'min-width': '28px' }}>攻方</span>
          <div style={{
            flex: 1,
            height: '20px',
            background: '#2a3a4a',
            'border-radius': '10px',
            overflow: 'hidden',
            display: 'flex',
          }}>
            <div style={{
              width: `${attackerPercent()}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #e94560, #ff6b6b)',
              transition: 'width 0.5s ease',
              'border-radius': attackerPercent() === 100 ? '10px' : '10px 0 0 10px',
            }} />
            <div style={{
              width: `${100 - attackerPercent()}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #4ecdc4, #26a69a)',
              transition: 'width 0.5s ease',
              'border-radius': attackerPercent() === 0 ? '10px' : '0 10px 10px 0',
            }} />
          </div>
          <span style={{ color: '#4ecdc4', 'font-size': '11px', 'min-width': '28px', 'text-align': 'right' }}>守方</span>
        </div>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'font-size': '11px' }}>
          <span style={{ color: '#e94560' }}>{power()?.attackerPower?.toFixed(1) ?? '0'}</span>
          <span style={{ color: '#a0a0c0' }}>{attackerPercent()}% vs {100 - attackerPercent()}%</span>
          <span style={{ color: '#4ecdc4' }}>{power()?.defenderPower?.toFixed(1) ?? '0'}</span>
        </div>
      </div>

      <div style={{
        background: 'rgba(20, 25, 40, 0.8)',
        'border-radius': '8px',
        padding: '10px',
        border: '1px solid #2a3a4a',
        flex: '0 0 auto',
        'max-height': '180px',
        display: 'flex',
        'flex-direction': 'column',
      }}>
        <div style={{ color: '#a0a0c0', 'font-weight': 'bold', 'margin-bottom': '6px' }}>
          📋 AI决策日志
        </div>
        <div
          ref={logContainer}
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            'flex-direction': 'column',
            gap: '3px',
            'padding-right': '4px',
          }}
        >
          <Show when={logs().length === 0}>
            <div style={{ color: '#555', 'text-align': 'center', padding: '12px', 'font-size': '11px' }}>
              等待AI行动...
            </div>
          </Show>
          <For each={logs()}>
            {(log: AIDecisionLogEntry) => (
              <div style={{
                padding: '4px 6px',
                background: 'rgba(15, 20, 35, 0.6)',
                'border-radius': '4px',
                'border-left': '2px solid #3a3a5a',
                'font-size': '11px',
                'line-height': '1.4',
              }}>
                <span style={{ color: '#555', 'font-size': '10px', 'margin-right': '4px' }}>
                  {formatTime(log.timestamp)}
                </span>
                <span style={{ color: '#ccc' }}>{log.description}</span>
              </div>
            )}
          </For>
        </div>
      </div>

      <div style={{
        background: 'rgba(20, 25, 40, 0.8)',
        'border-radius': '8px',
        padding: '10px',
        border: '1px solid #2a3a4a',
        flex: '1 1 auto',
        display: 'flex',
        'flex-direction': 'column',
        'min-height': '140px',
      }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '6px' }}>
          <span style={{ color: '#a0a0c0', 'font-weight': 'bold' }}>📈 战局趋势</span>
          <div style={{ display: 'flex', gap: '10px', 'font-size': '10px' }}>
            <span style={{ display: 'flex', 'align-items': 'center', gap: '3px' }}>
              <span style={{ width: '8px', height: '3px', background: '#e94560', 'border-radius': '2px', display: 'inline-block' }} />
              <span style={{ color: '#a0a0c0' }}>攻方</span>
            </span>
            <span style={{ display: 'flex', 'align-items': 'center', gap: '3px' }}>
              <span style={{ width: '8px', height: '3px', background: '#4ecdc4', 'border-radius': '2px', display: 'inline-block' }} />
              <span style={{ color: '#a0a0c0' }}>守方</span>
            </span>
          </div>
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <canvas
            ref={chartCanvas}
            onMouseMove={handleChartMouseMove}
            onMouseLeave={handleChartMouseLeave}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
            }}
          />
          <Show when={tooltipInfo()}>
            {(tip) => (
              <div style={{
                position: 'absolute',
                left: `${tip().x}px`,
                top: `${tip().y - 60}px`,
                background: 'rgba(15, 20, 35, 0.95)',
                border: '1px solid #3a3a5a',
                'border-radius': '6px',
                padding: '6px 10px',
                'pointer-events': 'none',
                'z-index': 10,
                'white-space': 'nowrap',
                'box-shadow': '0 4px 12px rgba(0,0,0,0.5)',
              }}>
                <div style={{ 'font-weight': 'bold', 'font-size': '11px', 'margin-bottom': '3px', color: '#fff' }}>
                  回合 {tip().turn}
                </div>
                <div style={{ color: '#e94560', 'font-size': '10px' }}>
                  攻方: {tip().attacker.toFixed(1)}
                </div>
                <div style={{ color: '#4ecdc4', 'font-size': '10px' }}>
                  守方: {tip().defender.toFixed(1)}
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}

export default BattleAnalysisPanel;
