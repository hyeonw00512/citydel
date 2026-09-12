import type { DistrictColor, RoleDefinition } from "@citadel/shared";
import { DeckManager } from "./DeckManager.js";
import { getRankNineRole, getRoleSet } from "./roles/roles.js";
import type { Room } from "./types.js";

export interface AbilityResult {
  message: string;
}

export type MagicianAction = { type: "SWAP"; targetPlayerId: string } | { type: "REDRAW" };

export class AbilityManager {
  constructor(private readonly deck = new DeckManager()) {}

  canUse(role: RoleDefinition | undefined): boolean {
    return Boolean(role && !["NONE", "PASSIVE_TAX", "SEER_SWAP", "WIZARD_BORROW", "MAGISTRATE_THREAT"].includes(role.abilityType));
  }

  targets(room: Room, role: RoleDefinition | undefined): RoleDefinition[] {
    if (!role || !["ASSASSINATE", "STEAL_GOLD", "WITCH_CONTROL"].includes(role.abilityType)) return [];
    const roles = [...getRoleSet(room.roleSetId).roles];
    if (room.rankNineEnabled) roles.push(getRankNineRole(room.rankNineRoleId));
    return roles.filter((candidate) => candidate.id !== role.id && !(role.abilityType === "STEAL_GOLD" && candidate.rank <= 2) && !(role.abilityType === "WITCH_CONTROL" && candidate.rank <= 1));
  }

  use(room: Room, playerId: string, targetRoleId?: string): AbilityResult {
    if (room.game.abilityUsed) throw new Error("이번 턴에는 이미 능력을 사용했습니다.");
    const player = room.players.get(playerId)!;
    const role = this.currentRole(room, playerId);
    if (!role || role.abilityType === "NONE") throw new Error("현재 사용할 수 있는 능력이 없습니다.");
    if (["WARLORD", "ARTIST"].includes(role.abilityType)) throw new Error("선택한 역할 능력은 대상 건물을 지정해 사용해 주세요.");

    if (role.abilityType === "QUEEN_ADJACENT") {
      const players = [...room.players.values()];
      const queenSeat = players.findIndex((player) => player.id === playerId);
      const rankFourPlayerId = [...room.game.rolesByPlayerId.entries()].find(([, selected]) => selected.some((role) => role.rank === 4))?.[0];
      const rankFourSeat = players.findIndex((player) => player.id === rankFourPlayerId);
      const adjacent = rankFourSeat >= 0 && players.length > 1 && (Math.abs(queenSeat - rankFourSeat) === 1 || Math.abs(queenSeat - rankFourSeat) === players.length - 1);
      room.game.abilityUsed = true;
      if (adjacent) {
        player.gold += 3;
        return { message: `${player.nickname}님이 4번 역할과 인접해 금화 3개를 얻었습니다.` };
      }
      return { message: `${player.nickname}님은 4번 역할과 인접하지 않아 보상을 얻지 못했습니다.` };
    }

    if (["ASSASSINATE", "STEAL_GOLD", "WITCH_CONTROL"].includes(role.abilityType)) {
      const target = this.targets(room, role).find((candidate) => candidate.id === targetRoleId);
      if (!target) throw new Error("선택할 수 없는 대상 역할입니다.");
      room.game.abilityUsed = true;
      if (role.abilityType === "ASSASSINATE") {
        room.game.assassinatedRoleId = target.id;
        return { message: `${player.nickname}님이 비밀리에 역할 하나의 행동을 봉쇄했습니다.` };
      }
      if (role.abilityType === "WITCH_CONTROL") {
        room.game.witchTargetRoleId = target.id;
        return { message: `${player.nickname}님이 비밀리에 위임받을 역할을 지정했습니다.` };
      }
      room.game.robbedRoleId = target.id;
      return { message: `${player.nickname}님이 비밀리에 역할 하나를 노렸습니다.` };
    }
    if (role.abilityType === "COLOR_INCOME") {
      return this.useColorIncome(room, playerId, role.incomeColor!);
    }

    room.game.abilityUsed = true;
    const cards = this.deck.draw(room, 2);
    player.hand.push(...cards);
    return { message: `${player.nickname}님이 역할 능력으로 건물 카드 ${cards.length}장을 얻었습니다.` };
  }

  useColorIncome(room: Room, playerId: string, requestedColor: DistrictColor): AbilityResult {
    if (room.game.abilityUsed) throw new Error("이번 턴에는 이미 능력을 사용했습니다.");
    const player = room.players.get(playerId)!;
    const role = this.currentRole(room, playerId);
    if (role?.abilityType !== "COLOR_INCOME" || !role.incomeColor) throw new Error("색상 수입 역할만 사용할 수 있는 능력입니다.");
    const hasMagicSchool = player.city.some((card) => card.definitionId === "school_of_magic");
    if (!hasMagicSchool && requestedColor !== role.incomeColor) throw new Error("마법 학교가 없으면 역할 고유 색상으로만 수입을 받을 수 있습니다.");
    const amount = player.city.filter((card) => card.color === requestedColor).length;
    player.gold += amount;
    room.game.abilityUsed = true;
    const label = hasMagicSchool && requestedColor !== role.incomeColor ? `마법 학교로 ${requestedColor} 색` : "도시";
    return { message: `${player.nickname}님이 ${label} 수입으로 금화 ${amount}개를 얻었습니다.` };
  }

  useMagician(room: Room, playerId: string, action: MagicianAction): AbilityResult {
    if (room.game.abilityUsed) throw new Error("이번 턴에는 이미 능력을 사용했습니다.");
    const player = room.players.get(playerId)!;
    const role = this.currentRole(room, playerId);
    if (role?.abilityType !== "MAGICIAN") throw new Error("마술사만 사용할 수 있는 능력입니다.");

    if (action.type === "SWAP") {
      const target = room.players.get(action.targetPlayerId);
      if (!target || target.id === playerId) throw new Error("교환할 다른 플레이어를 선택해 주세요.");
      [player.hand, target.hand] = [target.hand, player.hand];
      room.game.abilityUsed = true;
      return { message: `${player.nickname}님이 다른 플레이어와 손패를 교환했습니다.` };
    }

    const count = player.hand.length;
    room.game.discard.push(...player.hand);
    player.hand = this.deck.draw(room, count);
    room.game.abilityUsed = true;
    return { message: `${player.nickname}님이 손패 ${count}장을 새 카드로 바꿨습니다.` };
  }

  useWarlord(room: Room, playerId: string, targetPlayerId: string, districtInstanceId: string): AbilityResult {
    if (room.game.abilityUsed) throw new Error("이번 턴에는 이미 능력을 사용했습니다.");
    const player = room.players.get(playerId)!;
    const role = this.currentRole(room, playerId);
    if (role?.abilityType !== "WARLORD") throw new Error("장군만 사용할 수 있는 능력입니다.");
    const target = room.players.get(targetPlayerId);
    if (!target) throw new Error("파괴할 도시를 선택해 주세요.");
    const completedCitySize = room.players.size <= 3 ? 8 : 7;
    if (target.city.length >= completedCitySize) throw new Error("완성된 도시의 건물은 파괴할 수 없습니다.");
    if (room.game.rolesByPlayerId.get(target.id)?.some((role) => role.id === "bishop")) throw new Error("주교의 도시는 파괴할 수 없습니다.");
    const district = target.city.find((card) => card.instanceId === districtInstanceId);
    if (!district) throw new Error("선택한 도시에 해당 건물이 없습니다.");
    if (district.definitionId === "keep") throw new Error("성채는 장군의 파괴 능력으로 파괴할 수 없습니다.");
    const wallSurcharge = target.city.some((card) => card.definitionId === "great_wall") ? 1 : 0;
    const cost = Math.max(0, district.cost - 1) + wallSurcharge;
    if (player.gold < cost) throw new Error("파괴 비용을 낼 금화가 부족합니다.");

    const income = player.city.filter((card) => card.color === "MILITARY").length;
    player.gold += income - cost;
    target.city = target.city.filter((card) => card.instanceId !== district.instanceId);
    if (district.definitionId !== "graveyard" && target.city.some((card) => card.definitionId === "graveyard")) {
      room.game.pendingGraveyardRecovery = { playerId: target.id, card: district, expiresAt: Date.now() + 20_000 };
    } else {
      room.game.discard.push(district);
    }
    room.game.abilityUsed = true;
    return { message: `${player.nickname}님이 군사 수입 ${income}개를 얻고 ${target.nickname}님의 ${district.name}을(를) 파괴했습니다.` };
  }

  useSpy(room: Room, playerId: string, color: DistrictColor): AbilityResult {
    if (room.game.abilityUsed) throw new Error("이번 턴에는 이미 능력을 사용했습니다.");
    const player = room.players.get(playerId)!;
    if (this.currentRole(room, playerId)?.abilityType !== "SPY_COLOR") throw new Error("밀정만 사용할 수 있는 능력입니다.");
    const count = [...room.players.values()].filter((target) => target.id !== playerId && target.city.some((district) => district.color === color)).length;
    const cards = this.deck.draw(room, count);
    player.hand.push(...cards);
    room.game.abilityUsed = true;
    return { message: `${player.nickname}님이 ${color} 도시를 정찰해 설계도 ${cards.length}장을 얻었습니다.` };
  }

  useSeer(room: Room, playerId: string, firstPlayerId: string, secondPlayerId: string): AbilityResult {
    if (room.game.abilityUsed) throw new Error("이번 턴에는 이미 능력을 사용했습니다.");
    if (this.currentRole(room, playerId)?.abilityType !== "SEER_SWAP") throw new Error("예언자만 사용할 수 있는 능력입니다.");
    const first = room.players.get(firstPlayerId);
    const second = room.players.get(secondPlayerId);
    if (!first || !second || first.id === second.id || first.id === playerId || second.id === playerId) throw new Error("서로 다른 두 플레이어를 선택해 주세요.");
    [first.hand, second.hand] = [second.hand, first.hand];
    room.game.abilityUsed = true;
    return { message: `${room.players.get(playerId)!.nickname}님이 두 플레이어의 손패 흐름을 바꿨습니다.` };
  }

  useWizard(room: Room, playerId: string, targetPlayerId: string): AbilityResult {
    if (room.game.abilityUsed) throw new Error("이번 턴에는 이미 능력을 사용했습니다.");
    if (this.currentRole(room, playerId)?.abilityType !== "WIZARD_BORROW") throw new Error("마법사만 사용할 수 있는 능력입니다.");
    const player = room.players.get(playerId)!;
    const target = room.players.get(targetPlayerId);
    if (!target || target.id === playerId) throw new Error("다른 플레이어를 선택해 주세요.");
    if (target.hand.length === 0) throw new Error("대상 플레이어에게 가져올 설계도가 없습니다.");
    const index = Math.floor(Math.random() * target.hand.length);
    const [card] = target.hand.splice(index, 1);
    player.hand.push(card);
    room.game.abilityUsed = true;
    return { message: `${player.nickname}님이 다른 플레이어의 손패에서 설계도 1장을 가져왔습니다.` };
  }

  useMagistrate(room: Room, playerId: string, targetPlayerId: string): AbilityResult {
    if (room.game.abilityUsed) throw new Error("이번 턴에는 이미 능력을 사용했습니다.");
    if (this.currentRole(room, playerId)?.abilityType !== "MAGISTRATE_THREAT") throw new Error("치안판사만 사용할 수 있는 능력입니다.");
    if (!room.players.has(targetPlayerId) || targetPlayerId === playerId) throw new Error("다른 플레이어를 선택해 주세요.");
    room.game.magistrateThreatenedPlayerId = targetPlayerId;
    room.game.abilityUsed = true;
    return { message: `${room.players.get(playerId)!.nickname}님이 비공개 건설 위협 표식을 배치했습니다.` };
  }

  useEmperor(room: Room, playerId: string, targetPlayerId: string): AbilityResult {
    if (room.game.abilityUsed) throw new Error("이번 턴에는 이미 능력을 사용했습니다.");
    if (this.currentRole(room, playerId)?.abilityType !== "EMPEROR_CROWN") throw new Error("황제만 사용할 수 있는 능력입니다.");
    const emperor = room.players.get(playerId)!;
    const recipient = room.players.get(targetPlayerId);
    if (!recipient || recipient.id === emperor.id) throw new Error("왕관을 받을 다른 플레이어를 선택해 주세요.");
    const formerHolder = room.players.get(room.crownHolderId)!;
    const nobleIncome = emperor.city.filter((district) => district.color === "NOBLE").length;
    emperor.gold += nobleIncome;
    room.crownHolderId = recipient.id;
    room.game.abilityUsed = true;
    if (formerHolder.gold > 0) {
      formerHolder.gold -= 1;
      emperor.gold += 1;
      return { message: `${emperor.nickname}님이 귀족 수입 ${nobleIncome}개를 얻고 왕관을 ${recipient.nickname}님에게 넘긴 뒤 기존 보유자에게서 금화 1개를 받았습니다.` };
    }
    if (formerHolder.hand.length > 0) {
      const [card] = formerHolder.hand.splice(Math.floor(Math.random() * formerHolder.hand.length), 1);
      emperor.hand.push(card!);
      return { message: `${emperor.nickname}님이 귀족 수입 ${nobleIncome}개를 얻고 왕관을 ${recipient.nickname}님에게 넘긴 뒤 기존 보유자의 설계도 1장을 받았습니다.` };
    }
    return { message: `${emperor.nickname}님이 귀족 수입 ${nobleIncome}개를 얻고 왕관을 ${recipient.nickname}님에게 넘겼습니다.` };
  }

  buildLimit(role: RoleDefinition | undefined, abilityUsed: boolean): number {
    return role?.abilityType === "ARCHITECT_DRAW" && abilityUsed ? 3 : 1;
  }

  private currentRole(room: Room, playerId: string): RoleDefinition | undefined {
    const turn = room.game.turnOrder[room.game.turnIndex];
    return turn?.playerId === playerId ? turn.role : undefined;
  }
}
