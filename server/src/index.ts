import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@citadel/shared";
import { GameEngine } from "./game/GameEngine.js";
import { RoomManager } from "./rooms/RoomManager.js";
import { registerSocketHandlers } from "./socket/registerSocketHandlers.js";

const port = Number(process.env.PORT ?? 3001);
const clientOrigin = process.env.CLIENT_ORIGIN ?? "*";
const app = express();
app.use(cors({ origin: clientOrigin }));
app.get("/health", (_request, response) => response.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: clientOrigin, methods: ["GET", "POST"] }
});
const engine = new GameEngine();
const rooms = new RoomManager(engine);
registerSocketHandlers(io, rooms, engine);
app.get("/api/platform/rooms", (_request, response) => response.json({
  version: 1,
  gameId: "crown-city",
  updatedAt: new Date().toISOString(),
  capabilities: { canSpectate: true, canReserveNextRound: false },
  rooms: rooms.listPublicRooms().map((room) => ({
    roomCode: room.code,
    hostNickname: room.players.get(room.hostId)?.nickname ?? "알 수 없음",
    playerCount: room.players.size,
    maxPlayers: 8,
    spectatorCount: room.spectators.size,
    status: room.game.phase === "LOBBY" ? "WAITING" : room.game.phase === "GAME_END" ? "FINISHED" : "PLAYING",
    requiresPassword: false,
    canJoin: room.game.phase === "LOBBY" && room.players.size < 8,
    canSpectate: true,
    canReserveNextRound: false,
    joinUrl: `https://citydel-game.onrender.com/?room=${room.code}`
  }))
}));
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_request, response) => response.sendFile(resolve(clientDist, "index.html")));
}

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Citadel server listening on http://0.0.0.0:${port}`);
});
