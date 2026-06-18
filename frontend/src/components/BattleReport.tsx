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
    const tileSize = 20;
    const legendH = 36;
    const canvasW = mapW * tileSize;
    const canvasH = mapH * tileSize + legendH;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0f1f2f';
    ctx.fillRect(0, 0, canvasW, canvasH);

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#1e3a2e' : '#193028';
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }

    for (const d of snap.defenses) {
      const px = d.position.x * tileSize;
      const py = d.position.y * tileSize;
      const hpPct = d.hp / d.maxHp;

      switch (d.type) {
        case 'moat':
          ctx.fillStyle = 'rgba(37, 99, 235, 0.5)';
          ctx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
          break;
        case 'keep':
          ctx.fillStyle = hpPct > 0.5 ? '#ffd700' : hpPct > 0.25 ? '#f39c12' : '#e94560';
          ctx.fillRect(px + 4, py + 4, tileSize - 8, tileSize - 8);
          ctx.strokeStyle = '#aa8800';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 4, py + 4, tileSize - 8, tileSize - 8);
          break;
        case 'gate':
          ctx.fillStyle = hpPct > 0.5 ? '#8b5e3c' : hpPct > 0.25 ? '#6b4423' : '#4a2f18';
          ctx.fillRect(px + 2, py + 4, tileSize - 4, tileSize - 8);
          ctx.strokeStyle = '#654321';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 2, py + 4, tileSize - 4, tileSize - 8);
          break;
        case 'outerWall':
          ctx.fillStyle = hpPct > 0.5 ? '#7a7a8e' : hpPct > 0.25 ? '#5a5a6e' : '#3a3a4e';
          ctx.fillRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
          break;
        case 'innerWall':
          ctx.fillStyle = hpPct > 0.5 ? '#8a8a9e' : hpPct > 0.25 ? '#6a6a7e' : '#4a4a5e';
          ctx.fillRect(px + 3, py + 3, tileSize - 6, tileSize - 6);
          break;
        case 'tower':
        case 'arrowTower':
          ctx.fillStyle = hpPct > 0.5 ? '#6a6a7e' : hpPct > 0.25 ? '#4a4a5e' : '#3a3a4e';
          ctx.fillRect(px + 4, py + 4, tileSize - 8, tileSize - 8);
          ctx.fillStyle = d.type === 'arrowTower' ? '#e94560' : '#8b0000';
          ctx.fillRect(px + tileSize / 2 - 2, py + 2, 4, 4);
          break;
      }

      if (d.maxHp > 0 && d.type !== 'moat') {
        const barW = tileSize - 4;
        const barH = 2;
        ctx.fillStyle = '#111';
        ctx.fillRect(px + 2, py - 1, barW, barH);
        ctx.fillStyle = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#e94560';
        ctx.fillRect(px + 2, py - 1, barW * hpPct, barH);
      }
    }

    for (const e of snap.siegeEngines) {
      const px = e.position.x * tileSize;
      const py = e.position.y * tileSize;
      ctx.fillStyle = '#b45309';
      ctx.fillRect(px + 5, py + 5, tileSize - 10, tileSize - 10);
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 5, py + 5, tileSize - 10, tileSize - 10);
    }

    for (const u of snap.units) {
      const px = u.position.x * tileSize;
      const py = u.position.y * tileSize;
      const cx = px + tileSize / 2;
      const cy = py + tileSize / 2;

      ctx.fillStyle = u.faction === 'attacker' ? '#e94560' : '#4ecdc4';

      switch (u.type) {
        case 'infantry':
          ctx.fillRect(cx - 5, cy - 5, 10, 10);
          break;
        case 'archer':
          ctx.beginPath();
          ctx.moveTo(cx, cy - 6);
          ctx.lineTo(cx - 5, cy + 5);
          ctx.lineTo(cx + 5, cy + 5);
          ctx.closePath();
          ctx.fill();
          break;
        case 'cavalry':
          ctx.beginPath();
          ctx.moveTo(cx, cy - 6);
          ctx.lineTo(cx + 6, cy);
          ctx.lineTo(cx, cy + 6);
          ctx.lineTo(cx - 6, cy);
          ctx.closePath();
          ctx.fill();
          break;
        case 'sapper':
          ctx.beginPath();
          ctx.arc(cx, cy, 4, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'scout':
          ctx.beginPath();
          ctx.arc(cx, cy, 3, 0, Math.PI * 2);
          ctx.fill();
          break;
      }

      ctx.strokeStyle = u.faction === 'attacker' ? '#ff9999' : '#80e8e0';
      ctx.lineWidth = 0.5;
      if (u.type === 'infantry') {
        ctx.strokeRect(cx - 5, cy - 5, 10, 10);
      } else if (u.type !== 'sapper' && u.type !== 'scout') {
        ctx.stroke();
      }
    }

    const legendY = mapH * tileSize + 8;
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const legendItems = [
      { color: '#7a7a8e', label: '城墙' },
      { color: '#8b5e3c', label: '城门' },
      { color: '#ffd700', label: '主堡' },
      { color: 'rgba(37,99,235,0.5)', label: '护城河' },
      { color: '#e94560', label: '攻方' },
      { color: '#4ecdc4', label: '守方' },
    ];

    let lx = 6;
    for (const item of legendItems) {
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, legendY + 2, 10, 10);
      ctx.fillStyle = '#a0a0c0';
      ctx.fillText(item.label, lx + 13, legendY + 7);
      lx += ctx.measureText(item.label).width + 24;
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
          </div>

          <div class="thumbnail-section">
            <div style={{ color: '#a0a0c0', 'font-size': '13px', 'margin-bottom': '6px', 'text-align': 'center' }}>
              第 {selectedTurn() + 1} 回合战场快照
            </div>
            <div style={{ display: 'flex', 'justify-content': 'center' }}>
              <canvas ref={setThumbnailRef} style={{ border: '2px solid #3a3a5a', 'border-radius': '6px' }} />
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
