import type { Room } from "./types.js";

export class TurnManager {
  begin(room: Room): void {
    room.game.turnOrder = [...room.game.rolesByPlayerId.entries()]
      .flatMap(([playerId, roles]) => roles.map((role) => ({ playerId, role })))
      .sort((left, right) => left.role.rank - right.role.rank);
    room.game.turnIndex = 0;
  }

  endTurn(room: Room, playerId: string): "NEXT_TURN" | "ROUND_END" {
    if (room.game.turnOrder[room.game.turnIndex]?.playerId !== playerId) {
      throw new Error("현재는 내 턴이 아닙니다.");
    }
    room.game.turnIndex += 1;
    return room.game.turnIndex >= room.game.turnOrder.length ? "ROUND_END" : "NEXT_TURN";
  }
}
