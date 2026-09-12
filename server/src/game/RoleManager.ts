import type { RoleDefinition } from "@citadel/shared";
import { getRankNineRole, getRoleSet } from "./roles/roles.js";
import type { Room } from "./types.js";

export class RoleManager {
  setup(room: Room): void {
    const roles = this.shuffle(this.getActiveRoles(room));
    const { faceUpCount, faceDownCount } = this.discardCounts(room, roles.length);
    const faceUpRoles: RoleDefinition[] = [];
    while (faceUpRoles.length < faceUpCount) {
      const index = roles.findIndex((role) => role.rank !== 4);
      if (index < 0) throw new Error("공개로 제외할 역할을 준비할 수 없습니다.");
      faceUpRoles.push(roles.splice(index, 1)[0]!);
    }
    const faceDownRoles = roles.splice(0, faceDownCount);
    room.game.availableRoleIds = roles.map((role) => role.id);
    room.game.faceUpDiscardedRoles = faceUpRoles;
    room.game.faceDownDiscardedRoleIds = faceDownRoles.map((role) => role.id);
    room.game.pendingRoleDiscardPlayerId = null;
    room.game.rolesByPlayerId.clear();
    const players = [...room.players.keys()];
    const crownIndex = Math.max(0, players.indexOf(room.crownHolderId));
    const selectionPlayers = [...players.slice(crownIndex), ...players.slice(0, crownIndex)];
    // Citadels Revised: 2~3인 게임에서는 각 플레이어가 역할을 두 개씩 맡는다.
    // 첫 선택을 모두 마친 뒤 같은 좌석 순서로 두 번째 선택을 진행한다.
    room.game.selectionOrder = room.players.size <= 3 ? [...selectionPlayers, ...selectionPlayers] : selectionPlayers;
    room.game.selectionIndex = 0;
  }

  getChoices(room: Room, playerId: string): RoleDefinition[] {
    if (room.game.pendingRoleDiscardPlayerId !== null) return [];
    if (room.game.selectionOrder[room.game.selectionIndex] !== playerId) return [];
    const roles = this.getActiveRoles(room);
    const choices = room.game.availableRoleIds
      .map((id) => roles.find((role) => role.id === id))
      .filter((role): role is RoleDefinition => Boolean(role));
    if (this.canChooseInitialFaceDownRole(room)) {
      const initialFaceDownRole = roles.find((role) => role.id === room.game.faceDownDiscardedRoleIds[0]);
      if (initialFaceDownRole) choices.push(initialFaceDownRole);
    }
    return choices;
  }

  getDiscardChoices(room: Room, playerId: string): RoleDefinition[] {
    if (room.game.pendingRoleDiscardPlayerId !== playerId) return [];
    const roles = this.getActiveRoles(room);
    return room.game.availableRoleIds
      .map((id) => roles.find((role) => role.id === id))
      .filter((role): role is RoleDefinition => Boolean(role));
  }

  select(room: Room, playerId: string, roleId: string): void {
    if (room.game.selectionOrder[room.game.selectionIndex] !== playerId) {
      throw new Error("현재는 내 역할 선택 차례가 아닙니다.");
    }
    const role = this.getChoices(room, playerId).find((candidate) => candidate.id === roleId);
    if (!role) throw new Error("선택할 수 없는 역할입니다.");
    room.game.rolesByPlayerId.set(playerId, [...(room.game.rolesByPlayerId.get(playerId) ?? []), role]);
    if (room.game.faceDownDiscardedRoleIds.includes(roleId)) {
      room.game.faceDownDiscardedRoleIds = room.game.faceDownDiscardedRoleIds.filter((id) => id !== roleId);
    } else {
      room.game.availableRoleIds = room.game.availableRoleIds.filter((id) => id !== roleId);
    }
    if (this.requiresSecondaryDiscard(room)) {
      room.game.pendingRoleDiscardPlayerId = playerId;
      return;
    }
    room.game.selectionIndex += 1;
    if (room.game.selectionIndex >= room.game.selectionOrder.length) {
      room.game.faceDownDiscardedRoleIds.push(...room.game.availableRoleIds);
      room.game.availableRoleIds = [];
    }
  }

  discard(room: Room, playerId: string, roleId: string): void {
    const role = this.getDiscardChoices(room, playerId).find((candidate) => candidate.id === roleId);
    if (!role) throw new Error("비공개로 버릴 수 없는 역할입니다.");
    room.game.availableRoleIds = room.game.availableRoleIds.filter((id) => id !== roleId);
    room.game.faceDownDiscardedRoleIds.push(roleId);
    room.game.pendingRoleDiscardPlayerId = null;
    room.game.selectionIndex += 1;
    if (room.game.selectionIndex >= room.game.selectionOrder.length) {
      room.game.faceDownDiscardedRoleIds.push(...room.game.availableRoleIds);
      room.game.availableRoleIds = [];
    }
  }

  private getActiveRoles(room: Room): RoleDefinition[] {
    const roles = [...getRoleSet(room.roleSetId).roles];
    if (room.rankNineEnabled) roles.push(getRankNineRole(room.rankNineRoleId));
    return roles;
  }

  private discardCounts(room: Room, roleCount: number): { faceUpCount: number; faceDownCount: number } {
    const playerCount = room.players.size;
    if (playerCount <= 3) return { faceUpCount: 0, faceDownCount: 1 };
    const faceUpByPlayerCount = roleCount === 9
      ? new Map([[4, 3], [5, 2], [6, 1], [7, 0], [8, 0]])
      : new Map([[4, 2], [5, 1], [6, 0], [7, 0]]);
    return { faceUpCount: faceUpByPlayerCount.get(playerCount) ?? 0, faceDownCount: 1 };
  }

  private canChooseInitialFaceDownRole(room: Room): boolean {
    const isLastSelection = room.game.selectionIndex === room.game.selectionOrder.length - 1;
    return isLastSelection && [7, 8].includes(room.players.size) && room.game.faceDownDiscardedRoleIds.length === 1;
  }

  private requiresSecondaryDiscard(room: Room): boolean {
    if (room.players.size === 2) return room.game.selectionIndex >= 2;
    return room.players.size === 3 && room.game.selectionIndex === 2;
  }

  private shuffle<T>(items: readonly T[]): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
    }
    return shuffled;
  }
}
