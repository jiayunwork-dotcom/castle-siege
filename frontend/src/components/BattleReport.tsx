import { createSignal, createMemo, onMount, For, Show } from 'solid-js';
import { gameWS } from '../services/websocket';
import type {
  BattleReport,
  TurnSnapshot,
  PlayerBattleStats,
  GameEvent,
  MVPData,
  UnitTypeKillStats,
  Faction,
  UnitType,
} from '../types/game';

interface BattleReportProps {
  onBack: () => void;
}

const UNIT_TYPE_NAMES: Record<string, string> = {
  infantry: '步兵',
  archer: '弓兵',
  cavalry: '骑兵',
  sapper: '工兵',
  scout: '斥候',
};

const EVENT_TYPE_NAMES: Record<string, string> = {
  wallBreached: '城墙被攻破',
  gateFallen: '城门失守',
  towerDestroyed: '塔楼被摧毁',
  reinforcementsArrived: '援军到达',
  innerCityBreakthrough: '首次突破内城',
  keepDamaged: '主堡受损',
};

const EVENT_TYPE_ICONS: Record<string, string> = {
  wallBreached: '🏚️',
  gateFallen: '🚪',
  towerDestroyed: '🗼',
  reinforcementsArrived: '⚔️',
  innerCityBreakthrough: '🏰',
  keepDamaged: '💥',
};

type SortField = 'kills' | 'assists' | 'losses' | 'damageDealt' | 'damageTaken';
type SortDir = 'asc' | 'desc';

function BattleReportScreen(props: BattleReportProps) {
  const report = createMemo(() => gameWS.battleReport);

  const [selectedTurn, setSelectedTurn] = createSignal(0);
  const [hoverTurn, setHoverTurn] = createSignal<number | null>(null);
  const [tooltipData, setTooltipData] = createSignal<{ x: number; y: number; turn: number } | null>(null);
  const [attackerSortField, setAttackerSortField] = createSignal<SortField>('kills');
  const [attackerSortDir, setAttackerSortDir] = createSignal<SortDir>('desc');
  const [defenderSortField, setDefenderSortField] = createSignal<SortField>('kills');
  const [defenderSortDir, setDefenderSortDir] = createSignal<SortDir>('desc');
  const [canvasRef, setCanvasRef] = createSignal<HTMLCanvasElement | null>(null);
  const [thumbnailRef, setThumbnailRef] = createSignal<HTMLCanvasElement | null>(null);

  const turnSnapshots = createMemo(() => report()?.turnSnapshots || []);
  const maxTurn = createMemo(() => turnSnapshots().length);

  const currentSnapshot = createMemo(() => {
    const idx = selectedTurn();
    const snaps = turnSnapshots();
    return idx < snaps.length ? snaps[idx] : null;
  });

  const attackerStats = createMemo(() => {
    const stats = report()?.playerStats.filter(s => s.faction === 'attacker') || [];
    return sortStats(stats, attackerSortField(), attackerSortDir());
  });

  const defenderStats = createMemo(() => {
    const stats = report()?.playerStats.filter(s => s.faction === 'defender') || [];
    return sortStats(stats, defenderSortField(), defenderSortDir());
  });

  const keyEvents = createMemo(() => report()?.keyEvents || []);

  function sortStats(stats: PlayerBattleStats[], field: SortField, dir: SortDir): PlayerBattleStats[] {
    return [...stats].sort((a, b) => {
      const diff = a[field] - b[field];
      return dir === 'desc' ? -diff : diff;
    });
  }

  function toggleAttackerSort(field: SortField) {
    if (attackerSortField() === field) {
      setAttackerSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setAttackerSortField(field);
      setAttackerSortDir('desc');
    }
  }

  function toggleDefenderSort(field: SortField) {
    if (defenderSortField() === field) {
      setDefenderSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setDefenderSortField(field);
      setDefenderSortDir('desc');
    }
  }

  function handleTimelineHover(e: MouseEvent) {
    const canvas = canvasRef();
    if (!canvas || !maxTurn()) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = 60;
    const chartWidth = rect.width - padding * 2;
    const turnIdx = Math.round(((x - padding) / chartWidth) * (maxTurn() - 1));
    if (turnIdx >= 0 && turnIdx < maxTurn()) {
      setHoverTurn(turnIdx);
      setTooltipData({ x: e.clientX, y: e.clientY, turn: turnIdx + 1 });
    }
  }

  function handleTimelineLeave() {
    setHoverTurn(null);
    setTooltipData(null);
  }

  function handleTimelineClick(e: MouseEvent) {
    const canvas = canvasRef();
    if (!canvas || !maxTurn()) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = 60;
    const chartWidth = rect.width - padding * 2;
    const turnIdx = Math.round(((x - padding) / chartWidth) * (maxTurn() - 1));
    if (turnIdx >= 0 && turnIdx < maxTurn()) {
      setSelectedTurn(turnIdx);
    }
  }

  function handleSliderChange(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    setSelectedTurn(val);
  }

  function jumpToTurn(turn: number) {
    const idx = turn - 1;
    if (idx >= 0 && idx < maxTurn()) {
      setSelectedTurn(idx);
    }
  }

  onMount(() => {
    drawTimelineChart();
    drawThumbnail();
  });

  function drawTimelineChart() {
    const canvas = canvasRef();
    if (!canvas) return;
    const snaps = turnSnapshots();
    if (snaps.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.parentElement?.clientWidth || 800;
    const displayHeight = 280;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    ctx.scale(dpr, dpr);

    const padding = 60;
    const chartWidth = displayWidth - padding * 2;
    const chartHeight = displayHeight - 80;

    ctx.fillStyle = '#0f1f2f';
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    const maxUnits = Math.max(
      ...snaps.map(s => Math.max(s.attackerUnitCount, s.defenderUnitCount)),
      1
    );

    ctx.strokeStyle = '#2a3a4a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = 40 + chartHeight * (1 - i / 5);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartWidth, y);
      ctx.stroke();

      ctx.fillStyle = '#6a7a8a';
      ctx.font = '11px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxUnits * i / 5).toString(), padding - 8, y + 4);
    }

    const hoveredIdx = hoverTurn();

    const drawLine = (getter: (s: TurnSnapshot) => number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < snaps.length; i++) {
        const x = padding + (i / Math.max(snaps.length - 1, 1)) * chartWidth;
        const y = 40 + chartHeight * (1 - getter(snaps[i]) / maxUnits);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      for (let i = 0; i < snaps.length; i++) {
        const x = padding + (i / Math.max(snaps.length - 1, 1)) * chartWidth;
        const y = 40 + chartHeight * (1 - getter(snaps[i]) / maxUnits);
        ctx.fillStyle = i === hoveredIdx ? '#fff' : color;
        ctx.beginPath();
        ctx.arc(x, y, i === hoveredIdx ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawLine(s => s.attackerUnitCount, '#e94560');
    drawLine(s => s.defenderUnitCount, '#4ecdc4');

    for (let i = 0; i < snaps.length; i++) {
      const x = padding + (i / Math.max(snaps.length - 1, 1)) * chartWidth;
      ctx.fillStyle = '#6a7a8a';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText((i + 1).toString(), x, displayHeight - 15);
    }

    ctx.fillStyle = '#e94560';
    ctx.fillRect(padding, displayHeight - 8, 14, 4);
    ctx.fillStyle = '#a0a0c0';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('攻方兵力', padding + 18, displayHeight - 4);

    ctx.fillStyle = '#4ecdc4';
    ctx.fillRect(padding + 90, displayHeight - 8, 14, 4);
    ctx.fillStyle = '#a0a0c0';
    ctx.fillText('守方兵力', padding + 108, displayHeight - 4);
  }

  function drawThumbnail() {
    const canvas = thumbnailRef();
    const snap = currentSnapshot();
    if (!canvas || !snap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mapW = 20;
    const mapH = 20;
    const tileSize = 12;

    canvas.width = mapW * tileSize;
    canvas.height = mapH * tileSize;

    ctx.fillStyle = '#1a2a3a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#2d4a3e' : '#264035';
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }

    for (const d of snap.defenses) {
      const hpPct = d.hp / d.maxHp;
      if (d.type === 'moat') {
        ctx.fillStyle = 'rgba(37, 99, 235, 0.6)';
      } else if (d.type === 'keep') {
        ctx.fillStyle = hpPct > 0.5 ? '#ffd700' : hpPct > 0.25 ? '#f39c12' : '#e94560';
      } else {
        ctx.fillStyle = hpPct > 0.5 ? '#6b6b7a' : hpPct > 0.25 ? '#5a5a68' : '#4a4a58';
      }
      ctx.fillRect(d.position.x * tileSize + 1, d.position.y * tileSize + 1, tileSize - 2, tileSize - 2);
    }

    for (const e of snap.siegeEngines) {
      ctx.fillStyle = '#e94560';
      ctx.fillRect(e.position.x * tileSize + 2, e.position.y * tileSize + 2, tileSize - 4, tileSize - 4);
    }

    for (const u of snap.units) {
      ctx.fillStyle = u.faction === 'attacker' ? '#ff6b6b' : '#4ecdc4';
      ctx.beginPath();
      ctx.arc(u.position.x * tileSize + tileSize / 2, u.position.y * tileSize + tileSize / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const timelineRequestFrame = () => {
    requestAnimationFrame(() => {
      drawTimelineChart();
      drawThumbnail();
    });
  };

  function renderPieChart(data: UnitTypeKillStats[], factionColor: string): string {
    if (data.length === 0) return '';
    const total = data.reduce((sum, d) => sum + d.kills, 0);
    if (total === 0) return '';

    const size = 120;
    const cx = size / 2;
    const cy = size / 2;
    const r = 45;

    const colors = factionColor === '#e94560'
      ? ['#e94560', '#ff6b6b', '#ff9999', '#cc3355', '#aa2244']
      : ['#4ecdc4', '#26a69a', '#80cbc4', '#00897b', '#00695c'];

    let currentAngle = -Math.PI / 2;
    let paths = '';

    data.forEach((d, i) => {
      const sliceAngle = (d.kills / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(currentAngle);
      const y1 = cy + r * Math.sin(currentAngle);
      const x2 = cx + r * Math.cos(currentAngle + sliceAngle);
      const y2 = cy + r * Math.sin(currentAngle + sliceAngle);
      const largeArc = sliceAngle > Math.PI ? 1 : 0;

      paths += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${colors[i % colors.length]}" stroke="#0f1f2f" stroke-width="2"/>`;

      const midAngle = currentAngle + sliceAngle / 2;
      const labelR = r + 16;
      const lx = cx + labelR * Math.cos(midAngle);
      const ly = cy + labelR * Math.sin(midAngle);
      const pct = Math.round((d.kills / total) * 100);

      paths += `<text x="${lx}" y="${ly}" fill="#a0a0c0" font-size="9" text-anchor="middle" dominant-baseline="middle">${UNIT_TYPE_NAMES[d.unitType] || d.unitType} ${pct}%</text>`;

      currentAngle += sliceAngle;
    });

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}</svg>`;
  }

  function renderMVPCard(mvp: MVPData, factionColor: string) {
    const initial = mvp.playerName ? mvp.playerName.charAt(0).toUpperCase() : '?';
    return (
      <div class="mvp-card" style={{ 'border-color': factionColor }}>
        <div class="mvp-badge" style={{ background: factionColor }}>MVP</div>
        <div class="mvp-avatar" style={{ 'border-color': factionColor }}>
          <span style={{ 'font-size': '2rem', color: factionColor }}>{initial}</span>
        </div>
        <div class="mvp-name" style={{ color: factionColor }}>{mvp.playerName || '未知'}</div>
        <div class="mvp-score">评分: {mvp.score}</div>
        <div class="mvp-stats-grid">
          <div class="mvp-stat">
            <div class="mvp-stat-val">{mvp.kills}</div>
            <div class="mvp-stat-label">击杀</div>
          </div>
          <div class="mvp-stat">
            <div class="mvp-stat-val">{mvp.damageDealt}</div>
            <div class="mvp-stat-label">伤害</div>
          </div>
          <div class="mvp-stat">
            <div class="mvp-stat-val">{mvp.survivalTurns}</div>
            <div class="mvp-stat-label">存活回合</div>
          </div>
        </div>
      </div>
    );
  }

  function renderStatsTable(
    stats: PlayerBattleStats[],
    sortField: SortField,
    sortDir: SortDir,
    toggleSort: (f: SortField) => void,
    factionColor: string
  ) {
    const sortIcon = (field: SortField) => {
      if (sortField !== field) return ' ↕';
      return sortDir === 'desc' ? ' ↓' : ' ↑';
    };

    return (
      <table class="stats-table">
        <thead>
          <tr>
            <th style={{ color: factionColor }}>玩家</th>
            <th class="sortable" onClick={() => toggleSort('kills')}>
              击杀{sortIcon('kills')}
            </th>
            <th class="sortable" onClick={() => toggleSort('assists')}>
              助攻{sortIcon('assists')}
            </th>
            <th class="sortable" onClick={() => toggleSort('losses')}>
              损失{sortIcon('losses')}
            </th>
            <th class="sortable" onClick={() => toggleSort('damageDealt')}>
              总伤害{sortIcon('damageDealt')}
            </th>
            <th class="sortable" onClick={() => toggleSort('damageTaken')}>
              承伤{sortIcon('damageTaken')}
            </th>
          </tr>
        </thead>
        <tbody>
          <For each={stats}>
            {(s) => (
              <tr>
                <td style={{ color: factionColor, 'font-weight': 'bold' }}>{s.playerName}</td>
                <td>{s.kills}</td>
                <td>{s.assists}</td>
                <td>{s.losses}</td>
                <td>{s.damageDealt}</td>
                <td>{s.damageTaken}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    );
  }

  return (
    <div class="battle-report">
      <div class="report-header">
        <div class="report-header-left">
          <button class="report-back-btn" onClick={props.onBack}>← 返回</button>
          <h1 class="report-title">战后复盘</h1>
        </div>
        <div class="report-result">
          <span style={{
            'font-size': '2rem',
            'font-weight': 'bold',
            color: report()?.winner === 'attacker' ? '#e94560' : '#4ecdc4',
          }}>
            {report()?.winner === 'attacker' ? '攻方胜利' : '守方胜利'}
          </span>
          <span style={{ color: '#6a7a8a', 'margin-left': '16px' }}>
            共 {report()?.totalTurns || 0} 回合
          </span>
        </div>
      </div>

      <div class="report-content">
        <div class="report-section">
          <h2 class="section-title">回合时间线</h2>
          <div class="timeline-chart-wrapper" style={{ position: 'relative' }}>
            <canvas
              ref={setCanvasRef}
              onMouseMove={(e) => { handleTimelineHover(e); timelineRequestFrame(); }}
              onMouseLeave={() => { handleTimelineLeave(); timelineRequestFrame(); }}
              onClick={(e) => { handleTimelineClick(e); timelineRequestFrame(); }}
              style={{ width: '100%', height: '280px', cursor: 'pointer' }}
            />
            <Show when={tooltipData() && hoverTurn() !== null && turnSnapshots()[hoverTurn()!]}>
              {(_) => {
                const snap = turnSnapshots()[hoverTurn()!];
                if (!snap) return null;
                const td = tooltipData()!;
                return (
                  <div
                    class="timeline-tooltip"
                    style={{
                      left: Math.min(td.x + 12, window.innerWidth - 260) + 'px',
                      top: (td.y - 10) + 'px',
                    }}
                  >
                    <div class="tooltip-turn">第 {snap.turn} 回合</div>
                    <div class="tooltip-row" style={{ color: '#e94560' }}>
                      攻方击杀: {snap.attackerKills} | 损失: {snap.attackerLosses}
                    </div>
                    <div class="tooltip-row" style={{ color: '#4ecdc4' }}>
                      守方击杀: {snap.defenderKills} | 损失: {snap.defenderLosses}
                    </div>
                    <div class="tooltip-row">
                      攻方消耗: 金{snap.resourceConsumption.attacker.gold} 木{snap.resourceConsumption.attacker.wood} 石{snap.resourceConsumption.attacker.stone} 粮{snap.resourceConsumption.attacker.food}
                    </div>
                    <div class="tooltip-row">
                      守方消耗: 金{snap.resourceConsumption.defender.gold} 木{snap.resourceConsumption.defender.wood} 石{snap.resourceConsumption.defender.stone} 粮{snap.resourceConsumption.defender.food}
                    </div>
                  </div>
                );
              }}
            </Show>
          </div>

          <div class="timeline-slider-row">
            <span style={{ color: '#6a7a8a', 'font-size': '12px' }}>回合 1</span>
            <input
              type="range"
              min="0"
              max={Math.max(maxTurn() - 1, 0)}
              value={selectedTurn()}
              onInput={handleSliderChange}
              class="timeline-slider"
              style={{ flex: 1 }}
            />
            <span style={{ color: '#6a7a8a', 'font-size': '12px' }}>回合 {maxTurn()}</span>

            <div class="thumbnail-wrapper">
              <div style={{ color: '#a0a0c0', 'font-size': '12px', 'margin-bottom': '4px', 'text-align': 'center' }}>
                第 {selectedTurn() + 1} 回合战场快照
              </div>
              <canvas ref={setThumbnailRef} style={{ border: '2px solid #3a3a5a', 'border-radius': '4px' }} />
            </div>
          </div>
        </div>

        <div class="report-section">
          <h2 class="section-title">击杀统计</h2>
          <div class="stats-panels">
            <div class="stats-panel">
              <h3 class="stats-panel-title" style={{ color: '#e94560' }}>攻方</h3>
              {renderStatsTable(attackerStats(), attackerSortField(), attackerSortDir(), toggleAttackerSort, '#e94560')}
              <Show when={(report()?.attackerKillByType.length || 0) > 0}>
                <div class="pie-chart-wrapper">
                  <div innerHTML={renderPieChart(report()?.attackerKillByType || [], '#e94560')} />
                </div>
              </Show>
            </div>
            <div class="stats-panel">
              <h3 class="stats-panel-title" style={{ color: '#4ecdc4' }}>守方</h3>
              {renderStatsTable(defenderStats(), defenderSortField(), defenderSortDir(), toggleDefenderSort, '#4ecdc4')}
              <Show when={(report()?.defenderKillByType.length || 0) > 0}>
                <div class="pie-chart-wrapper">
                  <div innerHTML={renderPieChart(report()?.defenderKillByType || [], '#4ecdc4')} />
                </div>
              </Show>
            </div>
          </div>
        </div>

        <div class="report-section">
          <h2 class="section-title">关键事件</h2>
          <Show when={keyEvents().length > 0} fallback={<div style={{ color: '#6a7a8a' }}>本局无关键事件</div>}>
            <div class="events-timeline">
              <For each={keyEvents()}>
                {(evt, idx) => (
                  <div
                    class="event-item"
                    onClick={() => jumpToTurn(evt.turn)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div class="event-dot" style={{
                      background: evt.type === 'innerCityBreakthrough' || evt.type === 'keepDamaged'
                        ? '#e94560'
                        : evt.type === 'gateFallen' || evt.type === 'wallBreached'
                          ? '#f39c12'
                          : '#4ecdc4',
                    }} />
                    <div class="event-connector" />
                    <div class="event-content">
                      <div class="event-header">
                        <span class="event-icon">{EVENT_TYPE_ICONS[evt.type] || '📋'}</span>
                        <span class="event-type">{EVENT_TYPE_NAMES[evt.type] || evt.type}</span>
                        <span class="event-turn">第 {evt.turn} 回合</span>
                      </div>
                      <div class="event-desc">{evt.description}</div>
                      <Show when={evt.playerName}>
                        <div class="event-player">触发者: {evt.playerName}</div>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="report-section">
          <h2 class="section-title">MVP 评选</h2>
          <div class="mvp-row">
            <Show when={report()?.attackerMVP}>
              {(mvp) => renderMVPCard(mvp(), '#e94560')}
            </Show>
            <Show when={report()?.defenderMVP}>
              {(mvp) => renderMVPCard(mvp(), '#4ecdc4')}
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BattleReportScreen;
