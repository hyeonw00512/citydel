import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@citadel/shared";
import { GameEngine } from "../game/GameEngine.js";
import type { Room } from "../game/types.js";
import { RoomManager } from "../rooms/RoomManager.js";

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
const graveyardTimers = new Map<string, ReturnType<typeof setTimeout>>();
const disconnectedTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DISCONNECTED_TURN_TIMEOUT_MS = 30_000;

export function registerSocketHandlers(io: GameServer, rooms: RoomManager, engine: GameEngine): void {
  io.on("connection", (socket) => {
    socket.on("room:create", (nickname, callback) => handle(socket, callback, () => {
      const result = rooms.create(nickname, socket.id);
      socket.join(result.room.code);
      publish(io, rooms, engine, result.room);
      return result.session;
    }));

    socket.on("room:join", (payload, callback) => handle(socket, callback, () => {
      const result = rooms.join(payload.roomCode, payload.nickname, socket.id, payload.playerToken);
      clearDisconnectedTurnTimer(result.session.playerId);
      socket.join(result.room.code);
      publish(io, rooms, engine, result.room);
      return result.session;
    }));

    socket.on("room:spectate", (payload, callback) => handle(socket, callback, () => {
      const result = rooms.spectate(payload.roomCode, payload.nickname, socket.id, payload.playerToken);
      socket.join(result.room.code);
      publish(io, rooms, engine, result.room);
      return result.session;
    }));

    socket.on("room:ready", (ready, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      if (room.game.phase !== "LOBBY") throw new Error("로비에서만 준비 상태를 바꿀 수 있습니다.");
      player.isReady = ready;
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("room:role-set", (roleSetId, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      rooms.setRoleSet(room, player.id, roleSetId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("room:rank-nine", (payload, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      rooms.setRankNine(room, player.id, payload.enabled, payload.roleId, payload.customMode);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("game:start", (callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.start(room, player.id);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("game:rematch", (callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      rooms.restart(room, player.id);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("role:select", (roleId, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.selectRole(room, player.id, roleId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("role:choose-pair", ({ roleId, discardRoleId }, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.chooseRolePair(room, player.id, roleId, discardRoleId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("role:discard", (roleId, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.discardRole(room, player.id, roleId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("income:take", (type, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.takeIncome(room, player.id, type);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("income:choose", (cardInstanceId, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.chooseIncomeCard(room, player.id, cardInstanceId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("district:build", (cardInstanceId, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.buildDistrict(room, player.id, cardInstanceId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("district:ability", (payload, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.useDistrictAbility(room, player.id, payload);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("ability:use", (targetRoleId, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.useAbility(room, player.id, targetRoleId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("ability:color-income", (color, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.useColorIncomeAbility(room, player.id, color);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("ability:magician", (payload, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.useMagicianAbility(room, player.id, payload);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("ability:warlord", (payload, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.useWarlordAbility(room, player.id, payload.targetPlayerId, payload.districtInstanceId);
      scheduleGraveyardRecoveryExpiry(io, rooms, engine, room);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("ability:scholar", (callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.useScholarAbility(room, player.id);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("ability:artist", (districtInstanceId, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.useArtistAbility(room, player.id, districtInstanceId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("ability:spy", (color, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.useSpyAbility(room, player.id, color);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("ability:seer", (payload, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.useSeerAbility(room, player.id, payload.firstPlayerId, payload.secondPlayerId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("ability:wizard", (targetPlayerId, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.useWizardAbility(room, player.id, targetPlayerId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("ability:magistrate", (targetPlayerId, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.useMagistrateAbility(room, player.id, targetPlayerId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("ability:emperor", (targetPlayerId, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.useEmperorAbility(room, player.id, targetPlayerId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("scholar:choose", (cardInstanceId, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.chooseScholarCard(room, player.id, cardInstanceId);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("graveyard:recover", (recover, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.chooseGraveyardRecovery(room, player.id, recover);
      clearGraveyardRecoveryExpiry(room.code);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("action:skip", (callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.skipAction(room, player.id);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("turn:end", (callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      engine.endTurn(room, player.id);
      publish(io, rooms, engine, room);
      return undefined;
    }));

    socket.on("chat:send", (message, callback) => handle(socket, callback, () => {
      const { room, player } = requireSession(rooms, socket.id);
      const chat = rooms.sendChat(room, player.id, message);
      io.to(room.code).emit("chat:message", chat);
      return undefined;
    }));

    socket.on("disconnect", () => {
      const room = rooms.disconnect(socket.id);
      if (room) publish(io, rooms, engine, room);
    });
  });
}

function scheduleGraveyardRecoveryExpiry(io: GameServer, rooms: RoomManager, engine: GameEngine, room: Room): void {
  const pending = room.game.pendingGraveyardRecovery;
  if (!pending) return;
  clearGraveyardRecoveryExpiry(room.code);
  const delay = Math.max(0, pending.expiresAt - Date.now());
  graveyardTimers.set(room.code, setTimeout(() => {
    graveyardTimers.delete(room.code);
    const currentRoom = rooms.get(room.code);
    if (currentRoom && engine.expireGraveyardRecovery(currentRoom)) publish(io, rooms, engine, currentRoom);
  }, delay));
}

function clearGraveyardRecoveryExpiry(roomCode: string): void {
  const timer = graveyardTimers.get(roomCode);
  if (timer) clearTimeout(timer);
  graveyardTimers.delete(roomCode);
}

function syncDisconnectedTurnTimers(io: GameServer, rooms: RoomManager, engine: GameEngine, room: Room): void {
  const game = engine.toPublicState(room);
  const activePlayerId = game.phase === "ROLE_SELECTION" ? game.selectionPlayerId : game.currentPlayerId;
  for (const player of room.players.values()) {
    const shouldAutoAdvance = player.socketId === null && player.id === activePlayerId;
    if (!shouldAutoAdvance) {
      clearDisconnectedTurnTimer(player.id);
      continue;
    }
    if (disconnectedTurnTimers.has(player.id)) continue;
    disconnectedTurnTimers.set(player.id, setTimeout(() => {
      disconnectedTurnTimers.delete(player.id);
      const currentRoom = rooms.get(room.code);
      try {
        if (currentRoom && engine.autoAdvanceDisconnectedPlayer(currentRoom, player.id)) publish(io, rooms, engine, currentRoom);
      } catch {
        // A stale timeout must never bring down the game server.
      }
    }, DISCONNECTED_TURN_TIMEOUT_MS));
  }
}

function clearDisconnectedTurnTimer(playerId: string): void {
  const timer = disconnectedTurnTimers.get(playerId);
  if (timer) clearTimeout(timer);
  disconnectedTurnTimers.delete(playerId);
}

function publish(io: GameServer, rooms: RoomManager, engine: GameEngine, room: Room): void {
  syncDisconnectedTurnTimers(io, rooms, engine, room);
  io.to(room.code).emit("room:state", rooms.toPublic(room));
  for (const player of room.players.values()) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit("player:private", {
      ...engine.toPrivateState(room, player.id),
      playerToken: player.token
    });
  }
}

function requireSession(rooms: RoomManager, socketId: string) {
  const found = rooms.findBySocket(socketId);
  if (!found) throw new Error("먼저 방에 참가해 주세요.");
  return found;
}

function handle<T>(socket: GameSocket, callback: (result: { ok: boolean; error?: string; data?: T }) => void, action: () => T): void {
  try {
    callback({ ok: true, data: action() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
    callback({ ok: false, error: message });
    socket.emit("game:error", message);
  }
}
