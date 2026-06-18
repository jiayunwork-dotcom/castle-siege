import { createSignal, createEffect, For } from 'solid-js';
import { gameWS } from '../services/websocket';

function ChatPanel() {
  const [message, setMessage] = createSignal('');
  const messages = () => gameWS.chatMessages;
  let chatContainer: HTMLDivElement | undefined;

  createEffect(() => {
    if (chatContainer && messages()) {
      messages();
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  });

  const handleSend = () => {
    if (!message().trim()) return;
    gameWS.sendChat(message().trim());
    setMessage('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div class="card" style={{ flex: 1, display: 'flex', 'flex-direction': 'column', padding: '12px' }}>
      <h3 style={{ 'margin-bottom': '10px', 'font-size': '1rem', color: '#a0a0c0' }}>
        💬 聊天
      </h3>

      <div
        ref={chatContainer}
        style={{
          flex: 1,
          overflow: 'auto',
          'margin-bottom': '10px',
          'padding-right': '8px',
          display: 'flex',
          'flex-direction': 'column',
          gap: '8px',
        }}
      >
        {messages()?.length === 0 && (
          <p style={{ color: '#666', 'font-size': '0.85rem', 'text-align': 'center', 'margin-top': '20px' }}>
            暂无消息
          </p>
        )}
        <For each={messages() || []}>
          {(msg) => (
            <div style={{ 'font-size': '0.85rem' }}>
              <span style={{ color: '#e94560', 'font-weight': 'bold' }}>
                {msg.playerName}:
              </span>
              <span style={{ 'margin-left': '6px', color: '#ddd' }}>
                {msg.message}
              </span>
            </div>
          )}
        </For>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          placeholder="输入消息..."
          value={message()}
          onInput={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ flex: 1, padding: '8px' }}
        />
        <button onClick={handleSend} style={{ padding: '8px 16px' }}>
          发送
        </button>
      </div>
    </div>
  );
}

export default ChatPanel;
