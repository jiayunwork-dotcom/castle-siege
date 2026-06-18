import { getRedisClient } from './client';
import { GameState, Room, Player, BattleReport } from '../types/game';

const ROOM_PREFIX = 'room:';
const GAME_STATE_PREFIX = 'gamestate:';
const BATTLE_REPORT_PREFIX = 'battlereport:';
const ROOM_LIST_KEY = 'rooms:list';

export async function saveRoom(room: Room): Promise<void> {
  const redis = getRedisClient();
  const key = ROOM_PREFIX + room.id;
  await redis.set(key, JSON.stringify(room), 'EX', 86400);
  await redis.sadd(ROOM_LIST_KEY, room.id);
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const redis = getRedisClient();
  const key = ROOM_PREFIX + roomId;
  const data = await redis.get(key);
  if (!data) return null;
  return JSON.parse(data);
}

export async function deleteRoom(roomId: string): Promise<void> {
  const redis = getRedisClient();
  const key = ROOM_PREFIX + roomId;
  await redis.del(key);
  await redis.srem(ROOM_LIST_KEY, roomId);
  await redis.del(GAME_STATE_PREFIX + roomId);
}

export async function listRooms(): Promise<Room[]> {
  const redis = getRedisClient();
  const roomIds = await redis.smembers(ROOM_LIST_KEY);
  const rooms: Room[] = [];
  
  for (const id of roomIds) {
    const room = await getRoom(id);
    if (room) {
      rooms.push(room);
    } else {
      await redis.srem(ROOM_LIST_KEY, id);
    }
  }
  
  return rooms;
}

export async function saveGameState(roomId: string, state: GameState): Promise<void> {
  const redis = getRedisClient();
  const key = GAME_STATE_PREFIX + roomId;
  await redis.set(key, JSON.stringify(state), 'EX', 86400);
}

export async function getGameState(roomId: string): Promise<GameState | null> {
  const redis = getRedisClient();
  const key = GAME_STATE_PREFIX + roomId;
  const data = await redis.get(key);
  if (!data) return null;
  return JSON.parse(data);
}

export async function deleteGameState(roomId: string): Promise<void> {
  const redis = getRedisClient();
  const key = GAME_STATE_PREFIX + roomId;
  await redis.del(key);
}

export async function saveBattleReport(roomId: string, report: BattleReport): Promise<void> {
  const redis = getRedisClient();
  const key = BATTLE_REPORT_PREFIX + roomId;
  await redis.set(key, JSON.stringify(report), 'EX', 86400);
}

export async function getBattleReportFromStore(roomId: string): Promise<BattleReport | null> {
  const redis = getRedisClient();
  const key = BATTLE_REPORT_PREFIX + roomId;
  const data = await redis.get(key);
  if (!data) return null;
  return JSON.parse(data);
}
