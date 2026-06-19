import { createSignal, createMemo, onMount, createEffect, For, Show, onCleanup } from 'solid-js';
import { gameWS } from '../services/websocket';
import type {
  BattleReport,
  TurnSnapshot,
  TurnSnapshotUnit,
  TurnSnapshotSiegeEngine,
  TurnSnapshotDefense,
  TurnAction,
  PlayerBattleStats,
  GameEvent,
  MVPData,
  UnitTypeKillStats,
  Faction,
  UnitType,
  Position,
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

const SPEED_OPTIONS = [0.5, 1, 2];
const BASE_INTERVAL = 800;

type SortField = 'kills' | 'assists' | 'losses' | 'damageDealt' | 'damageTaken';
type SortDir = 'asc' | 'desc';
type PlaybackMode = 'static' | 'animated';

interface AnimatedState {
  units: TurnSnapshotUnit[];
  siegeEngines: TurnSnapshotSiegeEngine[];
  defenses: TurnSnapshotDefense[];
  attackFlash: { position: Position; time: number } | null;
  buildFadeIn: { position: Position; type: string; time: number } | null;
  deathFadeOut: { id: string; time: number; type: 'unit' | 'siegeEngine' | 'defense' } | null;
  moveProgress: { id: string; type: 'unit' | 'siegeEngine'; from: Position; to: Position; startTime: number } | null;
}

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

  const [playbackMode, setPlaybackMode] = createSignal<PlaybackMode>('static');
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [currentStep, setCurrentStep] = createSignal(0);
  const [playbackSpeed, setPlaybackSpeed] = createSignal(1);
  const [animState, setAnimState] = createSignal<AnimatedState | null>(null);

  let playbackTimer: number | null = null;
  let animationFrameId: number | null = null;

  const turnSnapshots = createMemo(() => report()?.turnSnapshots || []);
  const maxTurn = createMemo(() => turnSnapshots().length);

  const currentSnapshot = createMemo(() => {
    const idx = selectedTurn();
    const snaps = turnSnapshots();
    return idx < snaps.length ? snaps[idx] : null;
  });

  const currentActions = createMemo(() => {
    const snap = currentSnapshot();
    return snap?.actions || [];
  });

  const prevSnapshot = createMemo(() => {
    const idx = selectedTurn() - 1;
    const snaps = turnSnapshots();
    return idx >= 0 ? snaps[idx] : null;
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

  function cloneSnapshotState(snap: TurnSnapshot): AnimatedState {
    return {
      units: snap.units.map(u => ({ ...u, position: { ...u.position } })),
      siegeEngines: snap.siegeEngines.map(e => ({ ...e, position: { ...e.position } })),
      defenses: snap.defenses.map(d => ({ ...d, position: { ...d.position } })),
      attackFlash: null,
      buildFadeIn: null,
      deathFadeOut: null,
      moveProgress: null,
    };
  }

  function initAnimatedState() {
    const prev = prevSnapshot();
    const curr = currentSnapshot();
    if (!curr) return;

    const base = prev ? cloneSnapshotState(prev) : {
      units: [],
      siegeEngines: [],
      defenses: [],
      attackFlash: null,
      buildFadeIn: null,
      deathFadeOut: null,
      moveProgress: null,
    };
    setAnimState(base);
    setCurrentStep(0);
  }

  function applyActionUpTo(stepIndex: number) {
    const prev = prevSnapshot();
    const curr = currentSnapshot();
    if (!curr) return;

    let state: AnimatedState = prev ? cloneSnapshotState(prev) : {
      units: [],
      siegeEngines: [],
      defenses: [],
      attackFlash: null,
      buildFadeIn: null,
      deathFadeOut: null,
      moveProgress: null,
    };

    const actions = currentActions();
    for (let i = 0; i <= stepIndex && i < actions.length; i++) {
      state = applySingleAction(state, actions[i], false);
    }

    setAnimState(state);
  }

  function applySingleAction(state: AnimatedState, action: TurnAction, animate: boolean): AnimatedState {
    const now = performance.now();
    const newState: AnimatedState = {
      ...state,
      units: state.units.map(u => ({ ...u, position: { ...u.position } })),
      siegeEngines: state.siegeEngines.map(e => ({ ...e, position: { ...e.position } })),
      defenses: state.defenses.map(d => ({ ...d, position: { ...d.position } })),
      attackFlash: null,
      buildFadeIn: null,
      deathFadeOut: null,
      moveProgress: null,
    };

    switch (action.type) {
      case 'move': {
        if (action.actorType === 'unit') {
          const unit = newState.units.find(u => u.id === action.actorId);
          if (unit) {
            if (animate && action.fromPosition && action.toPosition) {
              newState.moveProgress = {
                id: action.actorId,
                type: 'unit',
                from: action.fromPosition,
                to: action.toPosition,
                startTime: now,
              };
            } else if (action.toPosition) {
              unit.position = { ...action.toPosition };
            }
          }
        } else if (action.actorType === 'siegeEngine') {
          const engine = newState.siegeEngines.find(e => e.id === action.actorId);
          if (engine) {
            if (animate && action.fromPosition && action.toPosition) {
              newState.moveProgress = {
                id: action.actorId,
                type: 'siegeEngine',
                from: action.fromPosition,
                to: action.toPosition,
                startTime: now,
              };
            } else if (action.toPosition) {
              engine.position = { ...action.toPosition };
            }
          }
        }
        break;
      }
      case 'attack':
      case 'siegeAttack': {
        if (action.targetId) {
          let target: TurnSnapshotUnit | TurnSnapshotSiegeEngine | TurnSnapshotDefense | undefined;
          let targetPos: Position | undefined;

          if (action.targetType === 'unit') {
            target = newState.units.find(u => u.id === action.targetId);
            if (target) {
              targetPos = target.position;
              if (action.damage) {
                (target as TurnSnapshotUnit).hp = Math.max(0, (target as TurnSnapshotUnit).hp - action.damage);
              }
            }
          } else if (action.targetType === 'siegeEngine') {
            target = newState.siegeEngines.find(e => e.id === action.targetId);
            if (target) {
              targetPos = target.position;
              if (action.damage) {
                (target as TurnSnapshotSiegeEngine).hp = Math.max(0, (target as TurnSnapshotSiegeEngine).hp - action.damage);
              }
            }
          } else if (action.targetType === 'defense') {
            target = newState.defenses.find(d => d.id === action.targetId);
            if (target) {
              targetPos = target.position;
              if (action.damage) {
                (target as TurnSnapshotDefense).hp = Math.max(0, (target as TurnSnapshotDefense).hp - action.damage);
              }
            }
          }

          if (targetPos && animate) {
            newState.attackFlash = { position: targetPos, time: now };
          }

          if (action.killed && target) {
            if (animate) {
              newState.deathFadeOut = {
                id: action.targetId,
                time: now,
                type: action.targetType as 'unit' | 'siegeEngine' | 'defense',
              };
            } else {
              if (action.targetType === 'unit') {
                newState.units = newState.units.filter(u => u.id !== action.targetId);
              } else if (action.targetType === 'siegeEngine') {
                newState.siegeEngines = newState.siegeEngines.filter(e => e.id !== action.targetId);
              } else if (action.targetType === 'defense') {
                newState.defenses = newState.defenses.filter(d => d.id !== action.targetId);
              }
            }
          }
        }
        break;
      }
      case 'build': {
        if (action.newBuildingId && action.toPosition && action.newBuildingType) {
          const curr = currentSnapshot();
          const isDefense = curr?.defenses.some(d => d.id === action.newBuildingId);
          const isEngine = curr?.siegeEngines.some(e => e.id === action.newBuildingId);

          if (animate) {
            newState.buildFadeIn = {
              position: action.toPosition,
              type: action.newBuildingType,
              time: now,
            };
          }

          if (isDefense) {
            const def = curr?.defenses.find(d => d.id === action.newBuildingId);
            if (def && !animate) {
              newState.defenses.push({ ...def, position: { ...def.position } });
            } else if (def && animate) {
              newState.defenses.push({ ...def, position: { ...def.position }, hp: 0 });
            }
          } else if (isEngine) {
            const eng = curr?.siegeEngines.find(e => e.id === action.newBuildingId);
            if (eng && !animate) {
              newState.siegeEngines.push({ ...eng, position: { ...eng.position } });
            } else if (eng && animate) {
              newState.siegeEngines.push({ ...eng, position: { ...eng.position }, hp: 0 });
            }
          }
        }
        break;
      }
      case 'repair': {
        if (action.targetId && action.repairAmount) {
          const def = newState.defenses.find(d => d.id === action.targetId);
          if (def) {
            def.hp = Math.min(def.maxHp, def.hp + action.repairAmount);
          }
        }
        break;
      }
      case 'train': {
        if (action.newUnitId && action.toPosition && action.newUnitType) {
          const curr = currentSnapshot();
          const unit = curr?.units.find(u => u.id === action.newUnitId);
          if (unit) {
            if (animate) {
              newState.buildFadeIn = {
                position: action.toPosition,
                type: action.newUnitType,
                time: now,
              };
              newState.units.push({ ...unit, position: { ...unit.position }, hp: 0 });
            } else {
              newState.units.push({ ...unit, position: { ...unit.position } });
            }
          }
        }
        break;
      }
    }

    return newState;
  }

  function playNextStep() {
    const actions = currentActions();
    if (currentStep() >= actions.length) {
      setIsPlaying(false);
      return;
    }

    const action = actions[currentStep()];
    setAnimState(prev => prev ? applySingleAction(prev, action, true) : prev);
    setCurrentStep(s => s + 1);
  }

  function stepForward() {
    const actions = currentActions();
    if (currentStep() >= actions.length) return;
    stopPlayback();
    applyActionUpTo(currentStep());
    setCurrentStep(s => s + 1);
  }

  function stepBackward() {
    if (currentStep() <= 0) return;
    stopPlayback();
    const newStep = currentStep() - 1;
    if (newStep === 0) {
      initAnimatedState();
    } else {
      applyActionUpTo(newStep - 1);
      setCurrentStep(newStep);
    }
  }

  function stopPlayback() {
    if (playbackTimer) {
      clearInterval(playbackTimer);
      playbackTimer = null;
    }
    setIsPlaying(false);
  }

  function startPlayback() {
    const actions = currentActions();
    if (currentStep() >= actions.length) {
      initAnimatedState();
    }
    setIsPlaying(true);
  }

  function togglePlayback() {
    if (isPlaying()) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function toggleMode() {
    stopPlayback();
    if (playbackMode() === 'static') {
      setPlaybackMode('animated');
      initAnimatedState();
    } else {
      setPlaybackMode('static');
      setAnimState(null);
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

  createEffect(() => {
    if (playbackMode() === 'animated') {
      initAnimatedState();
      if (isPlaying()) {
        startPlayback();
      }
    }
  });

  createEffect(() => {
    const snaps = turnSnapshots();
    const hover = hoverTurn();
    const canvas = canvasRef();
    if (!canvas || snaps.length === 0) return;

    requestAnimationFrame(() => {
      drawTimelineChart();
    });
  });

  createEffect(() => {
    const snap = currentSnapshot();
    const canvas = thumbnailRef();
    const mode = playbackMode();
    if (!canvas || !snap) return;

    if (mode === 'static') {
      requestAnimationFrame(() => {
        drawThumbnail();
      });
    }
  });

  createEffect(() => {
    if (playbackMode() !== 'animated') return;

    function renderLoop() {
      drawAnimatedThumbnail();
      animationFrameId = requestAnimationFrame(renderLoop);
    }
    animationFrameId = requestAnimationFrame(renderLoop);

    onCleanup(() => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    });
  });

  createEffect(() => {
    if (!isPlaying()) {
      if (playbackTimer) {
        clearInterval(playbackTimer);
        playbackTimer = null;
      }
      return;
    }

    const interval = BASE_INTERVAL / playbackSpeed();
    playbackTimer = window.setInterval(() => {
      playNextStep();
    }, interval);

    onCleanup(() => {
      if (playbackTimer) {
        clearInterval(playbackTimer);
        playbackTimer = null;
      }
    });
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

  function drawUnitShape(ctx: CanvasRenderingContext2D, u: TurnSnapshotUnit, cx: number, cy: number, alpha: number = 1) {
    ctx.globalAlpha = alpha;
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
    ctx.globalAlpha = 1;
  }

  function drawDefense(ctx: CanvasRenderingContext2D, d: TurnSnapshotDefense, px: number, py: number, tileSize: number, alpha: number = 1) {
    ctx.globalAlpha = alpha;
    const hpPct = d.maxHp > 0 ? d.hp / d.maxHp : 1;

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
    ctx.globalAlpha = 1;
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

    drawThumbnailBase(ctx, mapW, mapH, tileSize);

    for (const d of snap.defenses) {
      const px = d.position.x * tileSize;
      const py = d.position.y * tileSize;
      drawDefense(ctx, d, px, py, tileSize);
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
      drawUnitShape(ctx, u, cx, cy);
    }

    drawThumbnailLegend(ctx, mapH, tileSize, legendH);
  }

  function drawThumbnailBase(ctx: CanvasRenderingContext2D, mapW: number, mapH: number, tileSize: number) {
    ctx.fillStyle = '#0f1f2f';
    ctx.fillRect(0, 0, mapW * tileSize, mapH * tileSize);

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#1e3a2e' : '#193028';
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
  }

  function drawThumbnailLegend(ctx: CanvasRenderingContext2D, mapH: number, tileSize: number, legendH: number) {
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

  function drawAnimatedThumbnail() {
    const canvas = thumbnailRef();
    const state = animState();
    const snap = currentSnapshot();
    if (!canvas || !state || !snap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mapW = 20;
    const mapH = 20;
    const tileSize = 20;
    const legendH = 36;
    const canvasW = mapW * tileSize;
    const canvasH = mapH * tileSize + legendH;
    const now = performance.now();

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';
    ctx.scale(dpr, dpr);

    drawThumbnailBase(ctx, mapW, mapH, tileSize);

    let moveOffsetX = 0;
    let moveOffsetY = 0;
    let movingId: string | null = null;
    let movingType: 'unit' | 'siegeEngine' | null = null;

    if (state.moveProgress) {
      const elapsed = now - state.moveProgress.startTime;
      const duration = BASE_INTERVAL / playbackSpeed() * 0.7;
      const t = Math.min(1, elapsed / duration);
      const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      moveOffsetX = (state.moveProgress.to.x - state.moveProgress.from.x) * easeT;
      moveOffsetY = (state.moveProgress.to.y - state.moveProgress.from.y) * easeT;
      movingId = state.moveProgress.id;
      movingType = state.moveProgress.type;
    }

    for (const d of state.defenses) {
      const px = d.position.x * tileSize;
      const py = d.position.y * tileSize;
      let alpha = 1;

      if (state.deathFadeOut && state.deathFadeOut.id === d.id && state.deathFadeOut.type === 'defense') {
        const elapsed = now - state.deathFadeOut.time;
        const duration = BASE_INTERVAL / playbackSpeed() * 0.6;
        alpha = Math.max(0, 1 - elapsed / duration);
      }

      if (state.buildFadeIn && state.buildFadeIn.position.x === d.position.x && state.buildFadeIn.position.y === d.position.y) {
        const elapsed = now - state.buildFadeIn.time;
        const duration = BASE_INTERVAL / playbackSpeed() * 0.6;
        alpha = Math.min(1, elapsed / duration);
      }

      drawDefense(ctx, d, px, py, tileSize, alpha);
    }

    for (const e of state.siegeEngines) {
      let px = e.position.x * tileSize;
      let py = e.position.y * tileSize;
      let alpha = 1;

      if (movingId === e.id && movingType === 'siegeEngine') {
        px += moveOffsetX * tileSize;
        py += moveOffsetY * tileSize;
      }

      if (state.deathFadeOut && state.deathFadeOut.id === e.id && state.deathFadeOut.type === 'siegeEngine') {
        const elapsed = now - state.deathFadeOut.time;
        const duration = BASE_INTERVAL / playbackSpeed() * 0.6;
        alpha = Math.max(0, 1 - elapsed / duration);
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#b45309';
      ctx.fillRect(px + 5, py + 5, tileSize - 10, tileSize - 10);
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 5, py + 5, tileSize - 10, tileSize - 10);
      ctx.globalAlpha = 1;
    }

    for (const u of state.units) {
      let px = u.position.x * tileSize;
      let py = u.position.y * tileSize;
      let alpha = 1;

      if (movingId === u.id && movingType === 'unit') {
        px += moveOffsetX * tileSize;
        py += moveOffsetY * tileSize;
      }

      if (state.deathFadeOut && state.deathFadeOut.id === u.id && state.deathFadeOut.type === 'unit') {
        const elapsed = now - state.deathFadeOut.time;
        const duration = BASE_INTERVAL / playbackSpeed() * 0.6;
        alpha = Math.max(0, 1 - elapsed / duration);
      }

      if (state.buildFadeIn && state.buildFadeIn.position.x === u.position.x && state.buildFadeIn.position.y === u.position.y && state.buildFadeIn.type === u.type) {
        const elapsed = now - state.buildFadeIn.time;
        const duration = BASE_INTERVAL / playbackSpeed() * 0.6;
        alpha = Math.min(1, elapsed / duration);
      }

      const cx = px + tileSize / 2;
      const cy = py + tileSize / 2;
      drawUnitShape(ctx, u, cx, cy, alpha);
    }

    if (state.attackFlash) {
      const elapsed = now - state.attackFlash.time;
      const duration = BASE_INTERVAL / playbackSpeed() * 0.4;
      if (elapsed < duration) {
        const t = elapsed / duration;
        const flashAlpha = Math.sin(t * Math.PI) * 0.8;
        const px = state.attackFlash.position.x * tileSize;
        const py = state.attackFlash.position.y * tileSize;
        ctx.fillStyle = `rgba(255, 50, 50, ${flashAlpha})`;
        ctx.fillRect(px, py, tileSize, tileSize);
        ctx.strokeStyle = `rgba(255, 200, 50, ${flashAlpha})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
      }
    }

    drawThumbnailLegend(ctx, mapH, tileSize, legendH);
  }

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
              onMouseMove={(e) => { handleTimelineHover(e); }}
              onMouseLeave={() => { handleTimelineLeave(); }}
              onClick={(e) => { handleTimelineClick(e); }}
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
            <div class="thumbnail-header">
              <div class="mode-toggle">
                <span>静态快照</span>
                <div
                  class={`mode-toggle-switch ${playbackMode() === 'animated' ? 'active' : ''}`}
                  onClick={toggleMode}
                >
                  <div class="mode-toggle-knob" />
                </div>
                <span>动画回放</span>
              </div>
              <div style={{ color: '#a0a0c0', 'font-size': '13px' }}>
                第 {selectedTurn() + 1} 回合战场{playbackMode() === 'animated' ? ` (步骤 ${currentStep()}/${currentActions().length})` : '快照'}
              </div>
            </div>

            <Show when={playbackMode() === 'animated'}>
              <div class="playback-controls">
                <button
                  class="playback-btn"
                  onClick={stepBackward}
                  disabled={currentStep() <= 0 || isPlaying()}
                >
                  ⏮
                </button>
                <button
                  class="playback-btn play-btn"
                  onClick={togglePlayback}
                  disabled={currentActions().length === 0}
                >
                  {isPlaying() ? '⏸' : '▶'}
                </button>
                <button
                  class="playback-btn"
                  onClick={stepForward}
                  disabled={currentStep() >= currentActions().length || isPlaying()}
                >
                  ⏭
                </button>
                <span class="step-indicator">
                  {currentStep()} / {currentActions().length}
                </span>
                <div class="speed-btn-group">
                  <For each={SPEED_OPTIONS}>
                    {(speed) => (
                      <button
                        class={`speed-btn ${playbackSpeed() === speed ? 'active' : ''}`}
                        onClick={() => setPlaybackSpeed(speed)}
                      >
                        {speed}x
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>

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
