import { createMemo, createSignal, onMount, onCleanup, createEffect } from 'solid-js';
import type { GameState, Unit, SiegeEngine, DefenseStructure, Position, Faction, UnitType } from '../types/game';

interface BattlefieldProps {
  gameState: GameState | null | undefined;
  playerFaction?: Faction;
  selectedUnit: Unit | null;
  selectedEngine: SiegeEngine | null;
  selectedDefense: DefenseStructure | null;
  selectedUnitType: UnitType | null;
  actionMode: string;
  subPhase: string;
  currentFaction?: Faction;
  onTileClick: (x: number, y: number) => void;
  onUnitHover: (unit: Unit | null, pos: { x: number; y: number } | null) => void;
}

const TILE_SIZE = 36;
const TILE_PADDING = 1;

interface AttackAnimation {
  from: Position;
  to: Position;
  startTime: number;
}

function Battlefield(props: BattlefieldProps) {
  const [canvasRef, setCanvasRef] = createSignal<HTMLCanvasElement | null>(null);
  const [hoverPos, setHoverPos] = createSignal<Position | null>(null);
  const [hoverUnit, setHoverUnit] = createSignal<Unit | null>(null);
  const [attackAnimations, setAttackAnimations] = createSignal<AttackAnimation[]>([]);

  const mapWidth = createMemo(() => props.gameState?.config.mapWidth || 20);
  const mapHeight = createMemo(() => props.gameState?.config.mapHeight || 20);

  let animationFrame: number;
  let isDrawing = false;

  const unitColors: Record<UnitType, { dark: string; light: string }> = {
    infantry: { dark: '#a02828', light: '#ff6b6b' },
    archer: { dark: '#1a5276', light: '#4dabf7' },
    cavalry: { dark: '#b7950b', light: '#ffd43b' },
    sapper: { dark: '#495057', light: '#868e96' },
    scout: { dark: '#ced4da', light: '#ffffff' },
  };

  const unitNames: Record<UnitType, string> = {
    infantry: '步兵',
    archer: '弓兵',
    cavalry: '骑兵',
    sapper: '工兵',
    scout: '斥候',
  };

  createEffect(() => {
    const state = props.gameState;
    if (!state) return;
    if (state.actionsPending && state.actionsPending.includes('attack')) {
      // Could add attack animations via gameState if needed
    }
  });

  const draw = () => {
    const canvas = canvasRef();
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = mapWidth();
    const h = mapHeight();
    const width = w * TILE_SIZE;
    const height = h * TILE_SIZE;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.fillStyle = '#1a2a3a';
    ctx.fillRect(0, 0, width, height);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x * TILE_SIZE + TILE_PADDING;
        const py = y * TILE_SIZE + TILE_PADDING;
        const size = TILE_SIZE - TILE_PADDING * 2;

        const isGrass = (x + y) % 2 === 0;
        ctx.fillStyle = isGrass ? '#2d4a3e' : '#264035';
        ctx.fillRect(px, py, size, size);
      }
    }

    const state = props.gameState;
    if (state) {
      drawStagingArea(ctx, state);

      if (props.selectedUnitType && props.playerFaction === props.currentFaction) {
        drawRecruitHighlight(ctx, state, props.playerFaction, props.subPhase);
      }

      state.defenses.forEach(defense => {
        drawDefense(ctx, defense);
      });

      if (props.selectedUnitType && props.playerFaction === 'defender' && props.subPhase === 'buildRepair') {
        drawWallHighlights(ctx, state);
      }

      state.siegeEngines.forEach(engine => {
        drawSiegeEngine(ctx, engine);
      });

      if (props.selectedUnit) {
        if (props.actionMode === 'move') {
          drawMovementRange(ctx, props.selectedUnit, state);
        } else if (props.actionMode === 'attack') {
          drawAttackRange(ctx, props.selectedUnit, state);
        }
      }

      state.units.forEach(unit => {
        drawUnit(ctx, unit);
      });

      if (props.selectedUnit) {
        highlightTile(ctx, props.selectedUnit.position, '#e94560');
      }

      if (props.selectedEngine) {
        highlightTile(ctx, props.selectedEngine.position, '#ff6b6b');
      }

      if (props.selectedDefense) {
        highlightTile(ctx, props.selectedDefense.position, '#4ecdc4');
      }

      drawAttackAnimations(ctx);
    }

    const hover = hoverPos();
    if (hover) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        hover.x * TILE_SIZE + TILE_PADDING,
        hover.y * TILE_SIZE + TILE_PADDING,
        TILE_SIZE - TILE_PADDING * 2,
        TILE_SIZE - TILE_PADDING * 2
      );
    }

    if (hoverUnit()) {
      drawUnitTooltip(ctx, hoverUnit()!, hover || hoverUnit()!.position);
    }

    animationFrame = requestAnimationFrame(draw);
  };

  const drawStagingArea = (ctx: CanvasRenderingContext2D, state: GameState) => {
    const h = state.config.mapHeight;
    for (let y = h - 2; y <= h - 1; y++) {
      for (let x = 0; x < state.config.mapWidth; x++) {
        const px = x * TILE_SIZE + TILE_PADDING;
        const py = y * TILE_SIZE + TILE_PADDING;
        const size = TILE_SIZE - TILE_PADDING * 2;
        ctx.fillStyle = 'rgba(233, 69, 96, 0.1)';
        ctx.fillRect(px, py, size, size);
      }
    }

    ctx.fillStyle = 'rgba(233, 69, 96, 0.5)';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('攻方集结区', (state.config.mapWidth * TILE_SIZE) / 2, (h - 2) * TILE_SIZE - 4);
  };

  const drawRecruitHighlight = (ctx: CanvasRenderingContext2D, state: GameState, faction: Faction | undefined, subPhase: string) => {
    if (faction === 'defender' && subPhase === 'buildRepair') {
      // Defender recruit mode - wall tiles are already highlighted separately
    } else if (faction === 'attacker' && subPhase === 'movement') {
      const h = state.config.mapHeight;
      ctx.fillStyle = 'rgba(233, 69, 96, 0.25)';
      ctx.strokeStyle = 'rgba(233, 69, 96, 0.7)';
      ctx.lineWidth = 2;
      for (let y = h - 2; y <= h - 1; y++) {
        for (let x = 0; x < state.config.mapWidth; x++) {
          const px = x * TILE_SIZE + TILE_PADDING + 1;
          const py = y * TILE_SIZE + TILE_PADDING + 1;
          const size = TILE_SIZE - TILE_PADDING * 2 - 2;
          ctx.fillRect(px, py, size, size);
          ctx.strokeRect(px, py, size, size);
        }
      }
    }
  };

  const drawWallHighlights = (ctx: CanvasRenderingContext2D, state: GameState) => {
    state.defenses.forEach(defense => {
      if (
        (defense.type === 'outerWall' || defense.type === 'innerWall' || defense.type === 'tower' || defense.type === 'arrowTower' || defense.type === 'gate') &&
        defense.hp > 0
      ) {
        const px = defense.position.x * TILE_SIZE + TILE_PADDING + 1;
        const py = defense.position.y * TILE_SIZE + TILE_PADDING + 1;
        const size = TILE_SIZE - TILE_PADDING * 2 - 2;

        const occupied = state.units.some(
          u => u.position.x === defense.position.x && u.position.y === defense.position.y
        );

        if (!occupied) {
          ctx.fillStyle = 'rgba(78, 205, 196, 0.25)';
          ctx.strokeStyle = 'rgba(78, 205, 196, 0.7)';
          ctx.lineWidth = 2;
          ctx.fillRect(px, py, size, size);
          ctx.strokeRect(px, py, size, size);
        }
      }
    });
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
    const colors = unitColors[unit.type];
    const mainColor = isAttacker ? colors.light : colors.dark;

    const hpPercent = unit.stats.hp / unit.stats.maxHp;

    ctx.save();

    if (unit.onWall) {
      ctx.shadowColor = '#4ecdc4';
      ctx.shadowBlur = 6;
    }

    ctx.fillStyle = mainColor;
    ctx.strokeStyle = isAttacker ? '#000' : '#fff';
    ctx.lineWidth = 1.5;

    const shapeSize = unit.type === 'scout' ? 6 : 11;

    switch (unit.type) {
      case 'infantry':
        ctx.fillRect(centerX - shapeSize, centerY - shapeSize, shapeSize * 2, shapeSize * 2);
        ctx.strokeRect(centerX - shapeSize, centerY - shapeSize, shapeSize * 2, shapeSize * 2);
        break;

      case 'archer':
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - shapeSize - 1);
        ctx.lineTo(centerX - shapeSize - 1, centerY + shapeSize);
        ctx.lineTo(centerX + shapeSize + 1, centerY + shapeSize);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'cavalry':
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - shapeSize - 1);
        ctx.lineTo(centerX + shapeSize + 1, centerY);
        ctx.lineTo(centerX, centerY + shapeSize + 1);
        ctx.lineTo(centerX - shapeSize - 1, centerY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;

      case 'sapper':
        ctx.beginPath();
        ctx.arc(centerX, centerY, shapeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;

      case 'scout':
        ctx.beginPath();
        ctx.arc(centerX, centerY, shapeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
    }

    ctx.restore();

    if (unit.moved && unit.faction === props.playerFaction) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, TILE_SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const barWidth = 22;
    const barHeight = 3;
    const barX = centerX - barWidth / 2;
    const barY = py + 2;

    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : hpPercent > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
  };

  const drawUnitTooltip = (ctx: CanvasRenderingContext2D, unit: Unit, screenPos: Position) => {
    const name = unitNames[unit.type];
    const factionName = unit.faction === 'attacker' ? '攻方' : '守方';
    const hpText = `HP: ${unit.stats.hp}/${unit.stats.maxHp}`;

    const padding = 6;
    const fontSize = 11;
    const lineHeight = fontSize + 4;

    ctx.font = `${fontSize}px Arial`;
    const nameWidth = ctx.measureText(name).width;
    const factionWidth = ctx.measureText(factionName).width;
    const hpWidth = ctx.measureText(hpText).width;
    const maxWidth = Math.max(nameWidth, factionWidth, hpWidth) + padding * 2;
    const boxHeight = lineHeight * 3 + padding * 2;

    let boxX = screenPos.x * TILE_SIZE + TILE_SIZE + 8;
    let boxY = screenPos.y * TILE_SIZE;

    const canvasWidth = ctx.canvas.width;
    if (boxX + maxWidth > canvasWidth) {
      boxX = screenPos.x * TILE_SIZE - maxWidth - 8;
    }

    ctx.fillStyle = 'rgba(20, 20, 40, 0.95)';
    ctx.strokeStyle = unit.faction === 'attacker' ? '#e94560' : '#4ecdc4';
    ctx.lineWidth = 2;

    ctx.beginPath();
    const radius = 4;
    ctx.moveTo(boxX + radius, boxY);
    ctx.lineTo(boxX + maxWidth - radius, boxY);
    ctx.quadraticCurveTo(boxX + maxWidth, boxY, boxX + maxWidth, boxY + radius);
    ctx.lineTo(boxX + maxWidth, boxY + boxHeight - radius);
    ctx.quadraticCurveTo(boxX + maxWidth, boxY + boxHeight, boxX + maxWidth - radius, boxY + boxHeight);
    ctx.lineTo(boxX + radius, boxY + boxHeight);
    ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
    ctx.lineTo(boxX, boxY + radius);
    ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillStyle = unit.faction === 'attacker' ? '#e94560' : '#4ecdc4';
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillText(name, boxX + padding, boxY + padding);

    ctx.fillStyle = '#a0a0c0';
    ctx.font = `${fontSize}px Arial`;
    ctx.fillText(factionName, boxX + padding, boxY + padding + lineHeight);

    ctx.fillStyle = unit.stats.hp > unit.stats.maxHp * 0.5 ? '#2ecc71' : unit.stats.hp > unit.stats.maxHp * 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillText(hpText, boxX + padding, boxY + padding + lineHeight * 2);
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
    ctx.fillStyle = 'rgba(46, 204, 113, 0.3)';
    ctx.strokeStyle = 'rgba(46, 204, 113, 0.8)';
    ctx.lineWidth = 1;

    if (unit.onWall) {
      for (let dx = -range; dx <= range; dx++) {
        if (dx === 0) continue;
        const x = unit.position.x + dx;
        const y = unit.position.y;
        if (x >= 0 && x < state.config.mapWidth && y >= 0 && y < state.config.mapHeight) {
          const targetDefense = state.defenses.find(d =>
            (d.type === 'outerWall' || d.type === 'innerWall' || d.type === 'tower' || d.type === 'arrowTower' || d.type === 'gate') &&
            d.position.x === x && d.position.y === y && d.hp > 0
          );
          if (targetDefense) {
            const blocked = state.units.some(u => u.position.x === x && u.position.y === y);
            if (!blocked) {
              ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
              ctx.strokeRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            }
          }
        }
      }
    } else {
      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist <= range && dist > 0) {
            const x = unit.position.x + dx;
            const y = unit.position.y + dy;
            if (x >= 0 && x < state.config.mapWidth && y >= 0 && y < state.config.mapHeight) {
              const blocked = state.units.some(u => u.position.x === x && u.position.y === y) ||
                state.siegeEngines.some(s => s.position.x === x && s.position.y === y);
              if (!blocked) {
                if (unit.faction === 'attacker') {
                  const moat = state.defenses.find(d =>
                    d.type === 'moat' && d.position.x === x && d.position.y === y
                  );
                  if (moat && moat.hp > 0 && !moat.moatFrozen) {
                    continue;
                  }
                }
                ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
                ctx.strokeRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
              }
            }
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

  const drawAttackAnimations = (ctx: CanvasRenderingContext2D) => {
    const now = Date.now();
    const anims = attackAnimations();
    const remaining: AttackAnimation[] = [];

    anims.forEach(anim => {
      const elapsed = now - anim.startTime;
      const duration = 300;
      if (elapsed < duration) {
        const progress = elapsed / duration;
        const alpha = 1 - progress;

        const fromX = anim.from.x * TILE_SIZE + TILE_SIZE / 2;
        const fromY = anim.from.y * TILE_SIZE + TILE_SIZE / 2;
        const toX = anim.to.x * TILE_SIZE + TILE_SIZE / 2;
        const toY = anim.to.y * TILE_SIZE + TILE_SIZE / 2;

        ctx.strokeStyle = `rgba(255, 100, 100, ${alpha})`;
        ctx.lineWidth = 3 + progress * 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        remaining.push(anim);
      }
    });

    if (remaining.length !== anims.length) {
      setAttackAnimations(remaining);
    }
  };

  const triggerAttackAnimation = (from: Position, to: Position) => {
    setAttackAnimations(prev => [...prev, { from, to, startTime: Date.now() }]);
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

      const state = props.gameState;
      if (state) {
        const unit = state.units.find(u => u.position.x === x && u.position.y === y);
        setHoverUnit(unit || null);
        props.onUnitHover(unit || null, unit ? { x, y } : null);
      }
    } else {
      setHoverPos(null);
      setHoverUnit(null);
      props.onUnitHover(null, null);
    }
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
    setHoverUnit(null);
    props.onUnitHover(null, null);
  };

  (window as any).triggerAttackAnimation = triggerAttackAnimation;

  createEffect(() => {
    const canvas = canvasRef();
    if (canvas && !isDrawing) {
      isDrawing = true;
      draw();
    }
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
