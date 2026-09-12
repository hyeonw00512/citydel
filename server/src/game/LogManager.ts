import type { Room } from "./types.js";

export class LogManager {
  add(room: Room, message: string): void {
    room.game.logs.push({ id: room.game.nextLogId++, round: room.game.round, message });
    if (room.game.logs.length > 50) room.game.logs.shift();
  }
}
