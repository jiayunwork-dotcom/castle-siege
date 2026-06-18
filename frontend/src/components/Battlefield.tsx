import { createMemo, createSignal, onMount, onCleanup } from 'solid-js';
import type { GameState, Unit, SiegeEngine, DefenseStructure, Position, Faction } from '../types/game';

interface BattlefieldProps {
  gameState: GameState | null | undefined;
  playerFaction?: Faction;
  selectedUnit: Unit | null;
  selectedEngine: SiegeEngine | null;
  selectedDefense: DefenseStructure | null;
  actionMode: string;
  onTileClick: (x: number, y: number) => void;
}

const TILE_SIZE = 32;
const TILE_PADDING = 1;

function Battlefield(props: BattlefieldProps) {
  const [canvasRef, setCanvasRef] = createSignal<HTMLCanvasElement | null>(null);
  const [hoverPos, setHoverPos] = createSignal<Position | null>(null);

  const mapWidth = createMemo(() => props.gameState?.config.mapWidth || 20);
  const mapHeight = createMemo(() => props.gameState?.config.mapHeight || 20);

  let animationFrame: number;

  const draw = () => {
    const canvas = canvasRef();
    if (!canvas || !props.gameState) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = mapWidth() * TILE_SIZE;
    const height = mapHeight() * TILE_SIZE;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#1a2a3a';
    ctx.fillRect(0, 0, width, height);

    for (let y = 0; y < mapHeight(); y++) {
      for (let x = 0; x < mapWidth(); x++) {
        const px = x * TILE_SIZE + TILE_PADDING;
        const py = y * TILE_SIZE + TILE_PADDING;
        const size = TILE_SIZE - TILE_PADDING * 2;

        const isGrass = (x + y) % 2 === 0;
        ctx.fillStyle = isGrass ? '#2d4a3e' : '#264035';
        ctx.fillRect(px, py, size, size);
      }
    }

    props.gameState.defenses.forEach(defense => {
      drawDefense(ctx, defense);
    });

    props.gameState.siegeEngines.forEach(engine => {
      drawSiegeEngine(ctx, engine);
    });

    props.gameState.units.forEach(unit => {
      drawUnit(ctx, unit);
    });

    if (props.selectedUnit) {
      highlightTile(ctx, props.selectedUnit.position, '#e94560');
      if (props.actionMode === 'move') {
        drawMovementRange(ctx, props.selectedUnit, props.gameState);
      } else if (props.actionMode === 'attack') {
        drawAttackRange(ctx, props.selectedUnit, props.gameState);
      }
    }

    if (props.selectedEngine) {
      highlightTile(ctx, props.selectedEngine.position, '#ff6b6b');
    }

    if (props.selectedDefense) {
      highlightTile(ctx, props.selectedDefense.position, '#4ecdc4');
    }

    if (hoverPos()) {
      const pos = hoverPos()!;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        pos.x * TILE_SIZE + TILE_PADDING,
        pos.y * TILE_SIZE + TILE_PADDING,
        TILE_SIZE - TILE_PADDING * 2,
        TILE_SIZE - TILE_PADDING * 2
      );
    }

    animationFrame = requestAnimationFrame(draw);
  };

  const drawDefense = (ctx: CanvasRenderingContext2D, defense: DefenseStructure) => {
    const px = defense.position.x * TILE_SIZE;
    const py = defense.position.y * TILE_SIZE;
    const size = TILE_SIZE;

    const hpPercent = defense.hp / defense.maxHp;

    switch (defense.type) {
      case 'outerWall':
        ctx.fillStyle = hpPercent > 0.5 ? '#6b6b7a' : hpPercent > 0.25 ? '#5a5a68' : '#4a4a58';
        ctx.fillRect(px + 2, py + 4, size - 4, size - 8);
        ctx.fillStyle = '#555';
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(px + 4 + i * 10, py + 2, 6, 4);
        }
        break;

      case 'innerWall':
        ctx.fillStyle = hpPercent > 0.5 ? '#7a7a8a' : hpPercent > 0.25 ? '#6a6a78' : '#5a5a68';
        ctx.fillRect(px + 4, py + 6, size - 8, size - 12);
        break;

      case 'tower':
        ctx.fillStyle = '#5a5a68';
        ctx.fillRect(px + 4, py + 6, size - 8, size - 8);
        ctx.fillStyle = '#8b0000';
        ctx.beginPath();
        ctx.moveTo(px + 2, py + 8);
        ctx.lineTo(px + size / 2, py);
        ctx.lineTo(px + size - 2, py + 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(px + size / 2 - 2, py - 8, 4, 10);
        break;

      case 'moat':
        ctx.fillStyle = defense.moatFrozen ? '#a8d8ea' : '#2563eb';
        ctx.fillRect(px + 2, py + 2, size - 4, size - 4);
        if (!defense.moatFrozen) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.fillRect(px + 6, py + 8, 8, 2);
          ctx.fillRect(px + 16, py + 18, 10, 2);
        }
        break;

      case 'gate':
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(px + 6, py + 2, size - 12, size - 4);
        ctx.fillStyle = '#654321';
        ctx.fillRect(px + size / 2 - 1, py + 2, 2, size - 4);
        if (defense.gateUpgrades?.ironBars) {
          ctx.strokeStyle = '#888';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 4, py, size - 8, size);
        }
        break;

      case 'arrowTower':
        ctx.fillStyle = '#5a5a68';
        ctx.fillRect(px + 8, py + 8, size - 16, size - 10);
        ctx.fillStyle = '#8b0000';
        ctx.fillRect(px + 6, py + 4, size - 12, 6);
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(px + size / 2, py + size / 2, 4, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'keep':
        ctx.fillStyle = '#4a4a5a';
        ctx.fillRect(px + 2, py + 6, size - 4, size - 6);
        ctx.fillStyle = '#8b0000';
        ctx.beginPath();
        ctx.moveTo(px, py + 10);
        ctx.lineTo(px + size / 2, py);
        ctx.lineTo(px + size, py + 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(px + size / 2 - 3, py - 12, 6, 14);
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(px + size / 2 - 4, py + size - 12, 8, 10);
        break;
    }

    if (defense.maxHp > 0) {
      const barWidth = size - 8;
      const barHeight = 3;
      const barX = px + 4;
      const barY = py - 5;

      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      ctx.fillStyle = hpPercent > 0.5 ? '#4ecdc4' : hpPercent > 0.25 ? '#f39c12' : '#e94560';
      ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
    }
  };

  const drawSiegeEngine = (ctx: CanvasRenderingContext2D, engine: SiegeEngine) => {
    const px = engine.position.x * TILE_SIZE;
    const py = engine.position.y * TILE_SIZE;
    const size = TILE_SIZE;

    const hpPercent = engine.stats.hp / engine.stats.maxHp;

    switch (engine.type) {
      case 'siegeTower':
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(px + 4, py + 2, size - 8, size - 4);
        ctx.fillStyle = '#654321';
        ctx.fillRect(px + 6, py + 6, 4, 6);
        ctx.fillRect(px + size - 10, py + 6, 4, 6);
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(px + 8, py + size - 4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px + size - 8, py + size - 4, 4, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'batteringRam':
        ctx.fillStyle = '#654321';
        ctx.fillRect(px + 2, py + 10, size - 4, 8);
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(px + size - 10, py + 8, 10, 12);
        ctx.fillStyle = '#444';
        ctx.fillRect(px + size - 12, py + 12, 4, 4);
        break;

      case 'catapult':
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(px + 4, py + 16, size - 8, 10);
        ctx.fillStyle = '#654321';
        ctx.beginPath();
        ctx.moveTo(px + size / 2, py + 4);
        ctx.lineTo(px + 4, py + 16);
        ctx.lineTo(px + size - 4, py + 16);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.arc(px + size / 2, py + 8, 5, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'ladder':
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(px + 6, py, 2, size);
        ctx.fillRect(px + size - 8, py, 2, size);
        ctx.fillStyle = '#a0522d';
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(px + 6, py + 6 + i * 7, size - 12, 2);
        }
        break;

      case 'ballista':
        ctx.fillStyle = '#654321';
        ctx.fillRect(px + 4, py + 12, size - 8, 10);
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(px + 2, py + 14, size - 4, 3);
        ctx.fillStyle = '#333';
        ctx.fillRect(px + size / 2 - 1, py + 4, 2, 14);
        break;

      case 'tunnel':
        ctx.fillStyle = '#3a3a3a';
        ctx.beginPath();
        ctx.ellipse(px + size / 2, py + size / 2, size / 3, size / 4, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    if (engine.stats.maxHp > 0) {
      const barWidth = size - 8;
      const barHeight = 3;
      const barX = px + 4;
      const barY = py - 5;

      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      ctx.fillStyle = hpPercent > 0.5 ? '#e94560' : hpPercent > 0.25 ? '#f39c12' : '#c0392b';
      ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
    }
  };

  const drawUnit = (ctx: CanvasRenderingContext2D, unit: Unit) => {
    const px = unit.position.x * TILE_SIZE;
    const py = unit.position.y * TILE_SIZE;
    const centerX = px + TILE_SIZE / 2;
    const centerY = py + TILE_SIZE / 2;

    const isAttacker = unit.faction === 'attacker';
    const baseColor = isAttacker ? '#e94560' : '#4ecdc4';

    const hpPercent = unit.stats.hp / unit.stats.maxHp;

    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isAttacker ? '#c0392b' : '#2d9c94';
    ctx.beginPath();
    ctx.arc(centerX, centerY - 3, 6, 0, Math.PI * 2);
    ctx.fill();

    const iconMap: Record<string, string> = {
      infantry: '⚔',
      archer: '🏹',
      cavalry: '🐴',
      sapper: '⛏',
      scout: '👁',
    };

    ctx.font = '12px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(iconMap[unit.type] || '?', centerX, centerY + 1);

    if (unit.moved && unit.faction === props.playerFaction) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    const barWidth = 20;
    const barHeight = 3;
    const barX = centerX - barWidth / 2;
    const barY = py + 2;

    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : hpPercent > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
  };

  const highlightTile = (ctx: CanvasRenderingContext2D, pos: Position, color: string) => {
    const px = pos.x * TILE_SIZE;
    const py = pos.y * TILE_SIZE;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  };

  const drawMovementRange = (ctx: CanvasRenderingContext2D, unit: Unit, state: GameState) => {
    const range = unit.stats.speed;
    ctx.fillStyle = 'rgba(78, 205, 196, 0.3)';
    ctx.strokeStyle = 'rgba(78, 205, 196, 0.8)';
    ctx.lineWidth = 1;

    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist <= range && dist > 0) {
          const x = unit.position.x + dx;
          const y = unit.position.y + dy;
          if (x >= 0 && x < state.config.mapWidth && y >= 0 && y < state.config.mapHeight) {
            ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.strokeRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          }
        }
      }
    }
  };

  const drawAttackRange = (ctx: CanvasRenderingContext2D, unit: Unit, state: GameState) => {
    const range = unit.stats.range;
    ctx.fillStyle = 'rgba(233, 69, 96, 0.3)';
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.8)';
    ctx.lineWidth = 1;

    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= range && dist > 0) {
          const x = unit.position.x + dx;
          const y = unit.position.y + dy;
          if (x >= 0 && x < state.config.mapWidth && y >= 0 && y < state.config.mapHeight) {
            ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.strokeRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          }
        }
      }
    }
  };

  const handleClick = (e: MouseEvent) => {
    const canvas = canvasRef();
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);

    if (x >= 0 && x < mapWidth() && y >= 0 && y < mapHeight()) {
      props.onTileClick(x, y);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const canvas = canvasRef();
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);

    if (x >= 0 && x < mapWidth() && y >= 0 && y < mapHeight()) {
      setHoverPos({ x, y });
    } else {
      setHoverPos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
  };

  onMount(() => {
    draw();
  });

  onCleanup(() => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      padding: '20px',
      overflow: 'auto',
    }}>
      <canvas
        ref={setCanvasRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          border: '3px solid #3a3a5a',
          'border-radius': '8px',
          cursor: 'pointer',
          'box-shadow': '0 0 30px rgba(0, 0, 0, 0.5)',
        }}
      />
    </div>
  );
}

export default Battlefield;
