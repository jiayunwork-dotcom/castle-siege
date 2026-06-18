import fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import { handleWebSocketMessage, handleDisconnect } from './websocket/messageHandler';
import { listRooms } from './redis/gameStore';
import { getRedisClient } from './redis/client';

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = fastify({
  logger: true,
});

async function startServer() {
  try {
    await app.register(fastifyCors, {
      origin: true,
      credentials: true,
    });

    await app.register(fastifyWebsocket);

    app.get('/health', async () => {
      return { status: 'ok', timestamp: Date.now() };
    });

    app.get('/api/rooms', async () => {
      const rooms = await listRooms();
      return { rooms };
    });

    app.get('/ws', { websocket: true }, (connection, req) => {
      let roomId: string | undefined;
      let playerId: string | undefined;

      console.log('New WebSocket connection');

      connection.socket.on('message', (message: Buffer) => {
        const result = handleWebSocketMessage(
          connection.socket,
          message.toString(),
          roomId,
          playerId
        );
        if (result.roomId) roomId = result.roomId;
        if (result.playerId) playerId = result.playerId;
      });

      connection.socket.on('close', () => {
        console.log('WebSocket connection closed');
        handleDisconnect(roomId, playerId);
      });

      connection.socket.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
      });
    });

    getRedisClient();

    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server listening on port ${PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await app.close();
  process.exit(0);
});
