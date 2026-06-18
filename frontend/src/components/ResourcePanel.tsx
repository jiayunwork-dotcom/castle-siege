import { createMemo } from 'solid-js';
import { gameWS } from '../services/websocket';

function ResourcePanel() {
  const gameState = () => gameWS.gameState;
  const player = () => gameWS.player;

  const resources = createMemo(() => {
    if (!gameState() || !player()) return null;
    return gameState()!.resources[player()!.faction];
  });

  const resourceItems = [
    { key: 'gold', icon: '💰', name: '金币', color: '#ffd700' },
    { key: 'wood', icon: '🪵', name: '木材', color: '#8b4513' },
    { key: 'stone', icon: '🪨', name: '石料', color: '#808080' },
    { key: 'food', icon: '🍞', name: '粮食', color: '#deb887' },
  ];

  return (
    <div class="card" style={{ padding: '12px' }}>
      <h3 style={{ 'margin-bottom': '10px', 'font-size': '1rem', color: '#a0a0c0' }}>资源</h3>
      <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '8px' }}>
        {resourceItems.map(item => (
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              gap: '6px',
              padding: '6px 8px',
              background: 'rgba(58, 58, 90, 0.5)',
              'border-radius': '6px',
            }}
          >
            <span style={{ 'font-size': '1rem' }}>{item.icon}</span>
            <div>
              <p style={{ 'font-size': '0.75rem', color: '#a0a0c0' }}>{item.name}</p>
              <p style={{ 'font-weight': 'bold', color: item.color }}>
                {resources()?.[item.key as keyof typeof resources] || 0}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ResourcePanel;
