import { createSignal, createMemo, For, onMount } from 'solid-js';
import { gameWS } from '../services/websocket';
import type { Player, Faction } from '../types/game';

interface RoomScreenProps {
  onBack: () => void;
}

function RoomScreen(props: RoomScreenProps) {
  const room = () => gameWS.room;
  const player = () => gameWS.player;
  const isSinglePlayer = () => gameWS.isSinglePlayer;

  const isHost = createMemo(() => {
    return player()?.id === room()?.hostId;
  });

  onMount(() => {
    if (isSinglePlayer() && isHost()) {
      setTimeout(() => {
        gameWS.startSinglePlayerGame();
      }, 500);
    }
  });

  const allReady = createMemo(() => {
    const r = room();
    if (!r) return false;
    return r.players.every(p => p.ready) && r.players.length >= 2;
  });

  const factionPlayers = (faction: Faction) => {
    return room()?.players.filter(p => p.faction === faction) || [];
  };

  const canJoinFaction = (faction: Faction) => {
    const r = room();
    if (!r) return false;
    const maxPerTeam = Math.floor(r.maxPlayers / 2);
    const currentCount = r.players.filter(p => p.faction === faction).length;
    return currentCount < maxPerTeam;
  };

  const handleToggleFaction = () => {
    if (!player()) return;
    const newFaction: Faction = player()!.faction === 'attacker' ? 'defender' : 'attacker';
    if (canJoinFaction(newFaction)) {
      gameWS.setFaction(newFaction);
    }
  };

  const handleToggleReady = () => {
    gameWS.toggleReady();
  };

  const handleStartGame = () => {
    gameWS.startGame();
  };

  const copyRoomId = () => {
    if (room()) {
      navigator.clipboard.writeText(room()!.id);
    }
  };

  return (
    <div style={{
      'min-height': '100vh',
      padding: '20px',
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
    }}>
      <div style={{ width: '100%', 'max-width': '900px' }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'margin-bottom': '20px' }}>
          <button onClick={props.onBack} style={{ background: '#555' }}>
            ← 返回
          </button>
          <h1 class="title" style={{ 'font-size': '1.8rem' }}>{room()?.name || '房间'}</h1>
          <div />
        </div>

        <div class="card" style={{ 'margin-bottom': '20px' }}>
          <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
            <div>
              <span style={{ color: '#a0a0c0' }}>房间ID: </span>
              <span style={{ 'font-family': 'monospace', 'font-size': '1.1rem' }}>{room()?.id}</span>
            </div>
            <button onClick={copyRoomId} style={{ background: '#4ecdc4', padding: '8px 16px' }}>
              📋 复制ID
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '20px', 'margin-bottom': '20px' }}>
          <div class="card">
            <h2 style={{ color: '#e94560', 'margin-bottom': '15px', display: 'flex', 'align-items': 'center', gap: '10px' }}>
              ⚔️ 攻方 ({factionPlayers('attacker').length}/{Math.floor(room()?.maxPlayers || 6 / 2)})
            </h2>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
              <For each={factionPlayers('attacker')}>
                {(p) => <PlayerCard player={p} isCurrentPlayer={p.id === player()?.id} />}
              </For>
              {factionPlayers('attacker').length === 0 && (
                <p style={{ color: '#666', 'font-style': 'italic' }}>暂无玩家</p>
              )}
            </div>
          </div>

          <div class="card">
            <h2 style={{ color: '#4ecdc4', 'margin-bottom': '15px', display: 'flex', 'align-items': 'center', gap: '10px' }}>
              🛡️ 守方 ({factionPlayers('defender').length}/{Math.floor(room()?.maxPlayers || 6 / 2)})
            </h2>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
              <For each={factionPlayers('defender')}>
                {(p) => <PlayerCard player={p} isCurrentPlayer={p.id === player()?.id} />}
              </For>
              {factionPlayers('defender').length === 0 && (
                <p style={{ color: '#666', 'font-style': 'italic' }}>暂无玩家</p>
              )}
            </div>
          </div>
        </div>

        <div class="card">
          <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
            <div>
              <p>你是: <strong style={{ color: player()?.faction === 'attacker' ? '#e94560' : '#4ecdc4' }}>
                {player()?.faction === 'attacker' ? '攻方' : '守方'}
              </strong></p>
              <p style={{ 'margin-top': '8px', color: '#a0a0c0' }}>
                状态: {player()?.ready ? '✅ 已准备' : '⏳ 未准备'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleToggleFaction}
                disabled={player()?.ready}
                style={{ background: '#845EC2' }}
              >
                🔄 切换阵营
              </button>
              <button onClick={handleToggleReady}>
                {player()?.ready ? '取消准备' : '准备开始'}
              </button>
            </div>
          </div>

          {isHost() && (
            <div style={{ 'margin-top': '20px', 'padding-top': '20px', 'border-top': '1px solid #3a3a5a' }}>
              <button
                onClick={handleStartGame}
                disabled={!allReady()}
                style={{ width: '100%', padding: '16px', 'font-size': '18px' }}
              >
                🎮 开始游戏
              </button>
              {!allReady() && (
                <p style={{ 'margin-top': '10px', color: '#e94560', 'text-align': 'center' }}>
                  需要所有玩家准备完毕才能开始
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ player, isCurrentPlayer }: { player: Player; isCurrentPlayer: boolean }) {
  return (
    <div style={{
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      padding: '12px 16px',
      background: isCurrentPlayer ? 'rgba(233, 69, 96, 0.2)' : 'rgba(58, 58, 90, 0.5)',
      'border-radius': '8px',
      border: isCurrentPlayer ? '2px solid #e94560' : '2px solid transparent',
    }}>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
        <span style={{ 'font-size': '1.5rem' }}>👤</span>
        <div>
          <p style={{ 'font-weight': '600' }}>
            {player.name}
            {isCurrentPlayer && <span style={{ 'font-size': '0.8rem', color: '#e94560', 'margin-left': '8px' }}>(你)</span>}
          </p>
          <p style={{ 'font-size': '0.8rem', color: '#a0a0c0' }}>
            {player.connected ? '🟢 在线' : '🔴 离线'}
          </p>
        </div>
      </div>
      <span style={{ 'font-size': '1.5rem' }}>
        {player.ready ? '✅' : '⏳'}
      </span>
    </div>
  );
}

export default RoomScreen;
