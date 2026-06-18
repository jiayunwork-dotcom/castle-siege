import { createSignal } from 'solid-js';
import { gameWS } from '../services/websocket';

interface LobbyScreenProps {
  isConnected: boolean;
}

function LobbyScreen(props: LobbyScreenProps) {
  const [playerName, setPlayerName] = createSignal('');
  const [roomName, setRoomName] = createSignal('');
  const [joinRoomId, setJoinRoomId] = createSignal('');
  const [showCreateForm, setShowCreateForm] = createSignal(false);
  const [showJoinForm, setShowJoinForm] = createSignal(false);

  const handleCreateRoom = () => {
    if (!playerName() || !roomName()) return;
    gameWS.createRoom(playerName(), roomName(), 6);
  };

  const handleJoinRoom = () => {
    if (!playerName() || !joinRoomId()) return;
    gameWS.joinRoom(joinRoomId(), playerName());
  };

  return (
    <div style={{
      'min-height': '100vh',
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      'justify-content': 'center',
      padding: '20px',
      'background-image': 'radial-gradient(circle at 50% 50%, rgba(233, 69, 96, 0.1) 0%, transparent 50%)',
    }}>
      <div style={{ 'text-align': 'center', 'margin-bottom': '40px' }}>
        <h1 class="title">⚔️ 城堡攻防战 ⚔️</h1>
        <p class="subtitle" style={{ 'margin-top': '10px' }}>
          多人回合制中世纪策略游戏
        </p>
      </div>

      <div class="card" style={{ width: '100%', 'max-width': '450px' }}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', 'margin-bottom': '8px', 'font-weight': '600' }}>
              玩家名称
            </label>
            <input
              type="text"
              placeholder="输入你的名字"
              value={playerName()}
              onInput={(e) => setPlayerName(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          {!showCreateForm() && !showJoinForm() && (
            <>
              <button
                onClick={() => setShowCreateForm(true)}
                style={{ width: '100%', padding: '14px', 'font-size': '16px' }}
                disabled={!props.isConnected}
              >
                🏰 创建房间
              </button>
              <button
                onClick={() => setShowJoinForm(true)}
                style={{ width: '100%', padding: '14px', 'font-size': '16px', background: '#4ecdc4' }}
                disabled={!props.isConnected}
              >
                🚪 加入房间
              </button>
            </>
          )}

          {showCreateForm() && (
            <>
              <div>
                <label style={{ display: 'block', 'margin-bottom': '8px', 'font-weight': '600' }}>
                  房间名称
                </label>
                <input
                  type="text"
                  placeholder="输入房间名称"
                  value={roomName()}
                  onInput={(e) => setRoomName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <button
                onClick={handleCreateRoom}
                style={{ width: '100%', padding: '14px', 'font-size': '16px' }}
                disabled={!playerName() || !roomName() || !props.isConnected}
              >
                创建房间
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                style={{ width: '100%', padding: '12px', background: '#555' }}
              >
                返回
              </button>
            </>
          )}

          {showJoinForm() && (
            <>
              <div>
                <label style={{ display: 'block', 'margin-bottom': '8px', 'font-weight': '600' }}>
                  房间ID
                </label>
                <input
                  type="text"
                  placeholder="输入房间ID"
                  value={joinRoomId()}
                  onInput={(e) => setJoinRoomId(e.target.value)}
                  style={{ width: '100%', 'font-family': 'monospace' }}
                />
              </div>
              <button
                onClick={handleJoinRoom}
                style={{ width: '100%', padding: '14px', 'font-size': '16px', background: '#4ecdc4' }}
                disabled={!playerName() || !joinRoomId() || !props.isConnected}
              >
                加入房间
              </button>
              <button
                onClick={() => setShowJoinForm(false)}
                style={{ width: '100%', padding: '12px', background: '#555' }}
              >
                返回
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ 'margin-top': '40px', display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '20px', 'max-width': '800px', width: '100%' }}>
        <div class="card" style={{ 'text-align': 'center' }}>
          <div style={{ 'font-size': '2rem', 'margin-bottom': '10px' }}>🛡️</div>
          <h3>守方</h3>
          <p style={{ color: '#a0a0c0', 'font-size': '0.9rem' }}>
            建造防御，保卫内城
          </p>
        </div>
        <div class="card" style={{ 'text-align': 'center' }}>
          <div style={{ 'font-size': '2rem', 'margin-bottom': '10px' }}>⚔️</div>
          <h3>攻方</h3>
          <p style={{ color: '#a0a0c0', 'font-size': '0.9rem' }}>
            指挥攻城，突破防线
          </p>
        </div>
        <div class="card" style={{ 'text-align': 'center' }}>
          <div style={{ 'font-size': '2rem', 'margin-bottom': '10px' }}>👥</div>
          <h3>多人协作</h3>
          <p style={{ color: '#a0a0c0', 'font-size': '0.9rem' }}>
            2-6人同时对战
          </p>
        </div>
      </div>
    </div>
  );
}

export default LobbyScreen;
