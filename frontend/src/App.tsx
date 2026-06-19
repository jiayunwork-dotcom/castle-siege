import { createSignal, onMount, createEffect } from 'solid-js';
import { gameWS } from './services/websocket';
import LobbyScreen from './components/LobbyScreen';
import RoomScreen from './components/RoomScreen';
import GameScreen from './components/GameScreen';
import BattleReportScreen from './components/BattleReport';
import SinglePlayerConfig from './components/SinglePlayerConfig';
import type { GameState, Room } from './types/game';

type Screen = 'lobby' | 'room' | 'game' | 'battleReport' | 'singlePlayerConfig';

function App() {
  const [currentScreen, setCurrentScreen] = createSignal<Screen>('lobby');
  const [isConnected, setIsConnected] = createSignal(false);
  const [singlePlayerName, setSinglePlayerName] = createSignal('');

  onMount(async () => {
    try {
      await gameWS.connect();
      setIsConnected(true);
    } catch (e) {
      console.error('Failed to connect:', e);
    }
  });

  createEffect(() => {
    const room = gameWS.room;
    const gameState = gameWS.gameState;

    if (gameState && currentScreen() !== 'game' && currentScreen() !== 'battleReport') {
      setCurrentScreen('game');
    } else if (room && !gameState && currentScreen() !== 'room') {
      setCurrentScreen('room');
    }
  });

  const goToLobby = () => {
    gameWS.setRoom(null);
    gameWS.setGameState(null);
    gameWS.setPlayer(null);
    gameWS.setBattleReport(null);
    setCurrentScreen('lobby');
  };

  const goToBattleReport = () => {
    setCurrentScreen('battleReport');
  };

  const goToSinglePlayerConfig = (playerName: string) => {
    setSinglePlayerName(playerName);
    setCurrentScreen('singlePlayerConfig');
  };

  const goToLobbyFromSinglePlayer = () => {
    setSinglePlayerName('');
    setCurrentScreen('lobby');
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {gameWS.errorMessage && (
        <div class="error-toast">{gameWS.errorMessage}</div>
      )}

      {currentScreen() === 'lobby' && (
        <LobbyScreen isConnected={isConnected()} onStartSinglePlayer={goToSinglePlayerConfig} />
      )}

      {currentScreen() === 'singlePlayerConfig' && (
        <SinglePlayerConfig
          playerName={singlePlayerName()}
          onBack={goToLobbyFromSinglePlayer}
          isConnected={isConnected()}
        />
      )}

      {currentScreen() === 'room' && (
        <RoomScreen onBack={goToLobby} />
      )}

      {currentScreen() === 'game' && (
        <GameScreen onBack={goToLobby} onViewReport={goToBattleReport} />
      )}

      {currentScreen() === 'battleReport' && (
        <BattleReportScreen onBack={goToLobby} />
      )}

      {!isConnected() && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '10px 20px',
          background: '#e94560',
          color: 'white',
          'border-radius': '8px',
          'z-index': 1000,
        }}>
          正在连接服务器...
        </div>
      )}
    </div>
  );
}

export default App;
