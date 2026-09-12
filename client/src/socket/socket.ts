import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@citadel/shared";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_SERVER_URL ?? (import.meta.env.DEV ? `${location.protocol}//${location.hostname}:3001` : location.origin),
  { autoConnect: true, transports: ["websocket", "polling"] }
);
