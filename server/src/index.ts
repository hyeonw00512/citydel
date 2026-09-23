import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";
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
    visibility: "PUBLIC",
    requiresPassword: false,
    canJoin: room.game.phase === "LOBBY" && room.players.size < 8,
    canSpectate: true,
    canReserveNextRound: false,
    joinUrl: `https://citydel-game.onrender.com/?room=${room.code}`
  }))
}));
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (existsSync(clientDist)) {
  // Vite 자산은 콘텐츠 해시 파일명이라 오래 캐시해도 새 배포와 충돌하지 않는다.
  // HTML만 매번 확인해 모바일 재방문은 빠르고 배포 반영도 즉시 되게 한다.
  app.use(express.static(clientDist, {
    setHeaders(response, filePath) {
      if (filePath.includes(`${sep}assets${sep}`)) {
        response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (basename(filePath) === "index.html") {
        response.setHeader("Cache-Control", "no-cache");
      }
    }
  }));
  app.get("*", (_request, response) => response.sendFile(resolve(clientDist, "index.html"), {
    headers: { "Cache-Control": "no-cache" }
  }));
}

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Citadel server listening on http://0.0.0.0:${port}`);
});
