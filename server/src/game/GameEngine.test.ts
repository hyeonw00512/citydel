import { describe, expect, it } from "vitest";
import { GameEngine } from "./GameEngine.js";
import { RoomManager } from "../rooms/RoomManager.js";
import { ScoreManager } from "./ScoreManager.js";
import { GamePhase, type DistrictColor } from "@citadel/shared";
import type { Room } from "./types.js";

function completeRoleSelection(engine: GameEngine, room: Room, preserveAllTurns = false): void {
  while (room.game.phase === GamePhase.ROLE_SELECTION) {
    const playerId = room.game.selectionOrder[room.game.selectionIndex]!;
    const privateState = engine.toPrivateState(room, playerId);
    if (privateState.canChooseRolePair) {
      const pair = privateState.rolePairChoices
        .sort((left, right) => right.rank - left.rank);
      engine.chooseRolePair(room, playerId, pair[0]!.id, pair[1]!.id);
      continue;
    }
    if (privateState.canDiscardRole) {
      engine.discardRole(room, playerId, privateState.roleDiscardChoices[0]!.id);
      continue;
    }
    const role = privateState.roleChoices
      .sort((left, right) => right.rank - left.rank)[0]!;
    engine.selectRole(room, playerId, role.id);
  }
  if (preserveAllTurns) return;

  // 기존 능력 단위 검증은 첫 역할만 진행하던 시나리오다. 두 번째 역할은
  // 아래 통합 검증에서 다루고, 여기서는 기존 역할의 행동 단위만 유지한다.
  const firstRoles = new Map([...room.game.rolesByPlayerId.entries()].map(([playerId, roles]) => [playerId, roles[0]!]));
  room.game.turnOrder = room.game.turnOrder.filter((turn) => firstRoles.get(turn.playerId)?.id === turn.role.id);
  room.game.turnIndex = 0;
  (engine as unknown as { startCurrentTurn(target: Room): void }).startCurrentTurn(room);
}

function restoreDiscardedRolesForAbilityTest(room: Room): void {
  room.game.availableRoleIds.push(...room.game.faceUpDiscardedRoles.map((role) => role.id), ...room.game.faceDownDiscardedRoleIds);
  room.game.faceUpDiscardedRoles = [];
  room.game.faceDownDiscardedRoleIds = [];
}

const selectRoleWithDiscardedRoles = GameEngine.prototype.selectRole;
GameEngine.prototype.selectRole = function selectRoleForAbilityTest(room, playerId, roleId): void {
  if (room.game.phase === GamePhase.ROLE_SELECTION && !room.game.availableRoleIds.includes(roleId)) {
    restoreDiscardedRolesForAbilityTest(room);
  }
  selectRoleWithDiscardedRoles.call(this, room, playerId, roleId);
};

describe("authoritative game flow", () => {
  it("keeps selected roles out of public state and starts turns by rank", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.get(first.session.playerId)!.isReady = true;
    first.room.players.get(second.session.playerId)!.isReady = true;
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "warlord");
    engine.selectRole(first.room, second.session.playerId, "assassin");
    completeRoleSelection(engine, first.room, true);
    const publicPayload = JSON.stringify(rooms.toPublic(first.room).game);
    expect(publicPayload).not.toContain("warlord");
    expect(publicPayload).not.toContain("assassin");
    expect(first.room.game.turnOrder.map((turn) => turn.playerId)).toEqual([second.session.playerId, second.session.playerId, first.session.playerId, first.session.playerId]);
    expect(first.room.game.rolesByPlayerId.get(first.session.playerId)).toHaveLength(2);
    expect(first.room.game.rolesByPlayerId.get(second.session.playerId)).toHaveLength(2);
    expect(first.room.game.phase).toBe(GamePhase.INCOME);
    expect(first.room.players.get(first.session.playerId)!.hand).toHaveLength(4);
    expect(first.room.players.get(first.session.playerId)!.gold).toBe(2);
  });

  it("keeps hands private and validates income and construction on the server", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "warlord");
    engine.selectRole(first.room, second.session.playerId, "assassin");
    completeRoleSelection(engine, first.room);

    const activePlayer = first.room.players.get(second.session.playerId)!;
    const privateCard = activePlayer.hand[0];
    expect(JSON.stringify(rooms.toPublic(first.room))).not.toContain(privateCard.instanceId);
    expect(() => engine.buildDistrict(first.room, second.session.playerId, privateCard.instanceId)).toThrow();

    engine.takeIncome(first.room, second.session.playerId, "GOLD");
    expect(activePlayer.gold).toBe(4);
    engine.skipAction(first.room, second.session.playerId);
    activePlayer.gold = 10;
    engine.buildDistrict(first.room, second.session.playerId, privateCard.instanceId);
    expect(activePlayer.city).toContainEqual(privateCard);
    expect(activePlayer.hand).not.toContainEqual(privateCard);
    expect(activePlayer.gold).toBe(10 - privateCard.cost);
  });

  it("sends card-income choices only through the active player's private state", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "warlord");
    engine.selectRole(first.room, second.session.playerId, "assassin");
    completeRoleSelection(engine, first.room);

    engine.takeIncome(first.room, second.session.playerId, "CARDS");
    const privateState = engine.toPrivateState(first.room, second.session.playerId);
    expect(privateState.incomeChoices).toHaveLength(2);
    expect(JSON.stringify(rooms.toPublic(first.room))).not.toContain(privateState.incomeChoices[0].instanceId);
    engine.chooseIncomeCard(first.room, second.session.playerId, privateState.incomeChoices[0].instanceId);
    expect(engine.toPrivateState(first.room, second.session.playerId).hand).toHaveLength(5);
    expect(first.room.game.phase).toBe(GamePhase.ACTION);
  });

  it("applies role abilities once and grants the architect three builds", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "warlord");
    engine.selectRole(first.room, second.session.playerId, "architect");
    completeRoleSelection(engine, first.room);

    const architect = first.room.players.get(second.session.playerId)!;
    engine.takeIncome(first.room, architect.id, "GOLD");
    const before = architect.hand.length;
    engine.useAbility(first.room, architect.id);
    expect(architect.hand).toHaveLength(before + 2);
    expect(engine.toPrivateState(first.room, architect.id).buildsRemaining).toBe(3);
    expect(() => engine.useAbility(first.room, architect.id)).toThrow();
  });

  it("keeps assassin targets private and skips the targeted role's turn", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "assassin");
    engine.selectRole(first.room, second.session.playerId, "warlord");
    completeRoleSelection(engine, first.room);

    engine.takeIncome(first.room, first.session.playerId, "GOLD");
    expect(engine.toPrivateState(first.room, first.session.playerId).abilityTargets.map((role) => role.id)).toContain("warlord");
    engine.useAbility(first.room, first.session.playerId, "warlord");
    expect(JSON.stringify(rooms.toPublic(first.room))).not.toContain("warlord");
    engine.endTurn(first.room, first.session.playerId);
    expect(first.room.game.phase).toBe(GamePhase.ROLE_SELECTION);
    expect(first.room.game.round).toBe(2);
  });

  it("moves a robbed role's gold to the thief when its turn begins", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    const third = rooms.join(first.room.code, "세번째", "socket-3");
    first.room.rankNineEnabled = true;
    first.room.rankNineRoleId = "artist";
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "thief");
    engine.selectRole(first.room, second.session.playerId, "king");
    engine.selectRole(first.room, third.session.playerId, "warlord");
    completeRoleSelection(engine, first.room);

    const thief = first.room.players.get(first.session.playerId)!;
    const king = first.room.players.get(second.session.playerId)!;
    king.gold = 5;
    engine.takeIncome(first.room, thief.id, "GOLD");
    expect(() => engine.useAbility(first.room, thief.id, "assassin")).toThrow("선택할 수 없는");
    engine.useAbility(first.room, thief.id, "king");
    engine.endTurn(first.room, thief.id);
    expect(king.gold).toBe(0);
    expect(thief.gold).toBe(9);
  });

  it("lets the magician swap hands or redraw only during its own action phase", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "magician");
    engine.selectRole(first.room, second.session.playerId, "warlord");
    completeRoleSelection(engine, first.room);

    const magician = first.room.players.get(first.session.playerId)!;
    const warlord = first.room.players.get(second.session.playerId)!;
    const magicianHand = magician.hand;
    const warlordHand = warlord.hand;
    engine.takeIncome(first.room, magician.id, "GOLD");
    engine.useMagicianAbility(first.room, magician.id, { type: "SWAP", targetPlayerId: warlord.id });
    expect(magician.hand).toBe(warlordHand);
    expect(warlord.hand).toBe(magicianHand);
    expect(() => engine.useMagicianAbility(first.room, magician.id, { type: "REDRAW" })).toThrow("현재 단계");
  });

  it("stores validated chat messages with the sender identity on the server", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const chat = rooms.sendChat(first.room, first.session.playerId, "  안녕하세요   도시 여러분! ");
    expect(chat.nickname).toBe("첫번째");
    expect(chat.message).toBe("안녕하세요 도시 여러분!");
    expect(rooms.toPublic(first.room).chat).toEqual([chat]);
    expect(() => rooms.sendChat(first.room, first.session.playerId, " ")).toThrow("내용");
  });

  it("grants the hidden tax collector one gold whenever another player builds", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.rankNineEnabled = true;
    first.room.rankNineRoleId = "tax_collector";
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "assassin");
    engine.selectRole(first.room, second.session.playerId, "tax_collector");
    completeRoleSelection(engine, first.room);

    const builder = first.room.players.get(first.session.playerId)!;
    const collector = first.room.players.get(second.session.playerId)!;
    const card = builder.hand[0];
    builder.gold = 20;
    engine.takeIncome(first.room, builder.id, "GOLD");
    engine.skipAction(first.room, builder.id);
    engine.buildDistrict(first.room, builder.id, card.instanceId);
    expect(collector.gold).toBe(3);
    expect(engine.toPrivateState(first.room, collector.id).canUseAbility).toBe(false);
    expect(JSON.stringify(rooms.toPublic(first.room).game)).not.toContain("tax_collector");
  });

  it("lets the warlord destroy another player's district at one less than its cost", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "assassin");
    engine.selectRole(first.room, second.session.playerId, "warlord");
    completeRoleSelection(engine, first.room);

    const target = first.room.players.get(first.session.playerId)!;
    const warlord = first.room.players.get(second.session.playerId)!;
    const district = target.hand.find((card) => card.definitionId !== "keep")!;
    target.gold = 20;
    engine.takeIncome(first.room, target.id, "GOLD");
    engine.skipAction(first.room, target.id);
    engine.buildDistrict(first.room, target.id, district.instanceId);
    engine.endTurn(first.room, target.id);

    warlord.gold = 20;
    engine.takeIncome(first.room, warlord.id, "GOLD");
    engine.useWarlordAbility(first.room, warlord.id, target.id, district.instanceId);
    expect(target.city).not.toContainEqual(district);
    expect(first.room.game.discard).toContainEqual(district);
    expect(warlord.gold).toBe(22 - Math.max(0, district.cost - 1));
  });

  it("charges one extra gold to destroy a district in a city with a great wall", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "assassin");
    engine.selectRole(first.room, second.session.playerId, "warlord");
    completeRoleSelection(engine, first.room);
    const target = first.room.players.get(first.session.playerId)!;
    const warlord = first.room.players.get(second.session.playerId)!;
    const district = { instanceId: "wall-target", definitionId: "fort", name: "요새", cost: 3, color: "MILITARY" as const, description: "테스트", unique: false };
    target.city.push({ instanceId: "wall-test", definitionId: "great_wall", name: "성벽", cost: 6, color: "UNIQUE", description: "테스트", unique: true }, district);
    engine.takeIncome(first.room, target.id, "GOLD");
    engine.skipAction(first.room, target.id);
    engine.endTurn(first.room, target.id);
    warlord.gold = 1;
    engine.takeIncome(first.room, warlord.id, "GOLD");
    engine.useWarlordAbility(first.room, warlord.id, target.id, district.instanceId);
    expect(warlord.gold).toBe(0);
  });

  it("lets a color-income role use the school of magic as a chosen city color", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "king");
    engine.selectRole(first.room, second.session.playerId, "assassin");
    completeRoleSelection(engine, first.room);
    const king = first.room.players.get(first.session.playerId)!;
    king.city.push(
      { instanceId: "magic-school-test", definitionId: "school_of_magic", name: "마법 학교", cost: 6, color: "UNIQUE", description: "테스트", unique: true },
      { instanceId: "trade-test", definitionId: "market", name: "시장", cost: 2, color: "TRADE", description: "테스트", unique: false }
    );
    king.gold = 0;
    const assassin = first.room.players.get(second.session.playerId)!;
    engine.takeIncome(first.room, assassin.id, "GOLD");
    engine.skipAction(first.room, assassin.id);
    engine.endTurn(first.room, assassin.id);
    engine.takeIncome(first.room, king.id, "GOLD");
    engine.useColorIncomeAbility(first.room, king.id, "TRADE");
    expect(king.gold).toBe(3);
    expect(first.room.game.phase).toBe(GamePhase.BUILD);
  });

  it("lets only the graveyard owner recover a district destroyed by the warlord", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "assassin");
    engine.selectRole(first.room, second.session.playerId, "warlord");
    completeRoleSelection(engine, first.room);

    const target = first.room.players.get(first.session.playerId)!;
    const warlord = first.room.players.get(second.session.playerId)!;
    const destroyed = { instanceId: "destroyed-test", definitionId: "market", name: "시장", cost: 2, color: "TRADE" as const, description: "테스트", unique: false };
    target.city.push({ instanceId: "graveyard-test", definitionId: "graveyard", name: "묘지", cost: 5, color: "UNIQUE", description: "테스트", unique: true }, destroyed);
    target.gold = 1;
    engine.takeIncome(first.room, target.id, "GOLD");
    engine.skipAction(first.room, target.id);
    engine.endTurn(first.room, target.id);

    warlord.gold = 20;
    engine.takeIncome(first.room, warlord.id, "GOLD");
    engine.useWarlordAbility(first.room, warlord.id, target.id, destroyed.instanceId);

    expect(first.room.game.phase).toBe(GamePhase.ACTION);
    expect(first.room.game.discard).not.toContainEqual(destroyed);
    expect(engine.toPrivateState(first.room, target.id).graveyardRecoveryCard).toEqual(destroyed);
    expect(engine.toPrivateState(first.room, warlord.id).graveyardRecoveryCard).toBeNull();
    expect(() => engine.skipAction(first.room, warlord.id)).toThrow("묘지 회수");
    expect(() => engine.chooseGraveyardRecovery(first.room, warlord.id, true)).toThrow("묘지 회수");

    engine.chooseGraveyardRecovery(first.room, target.id, true);
    expect(target.gold).toBe(2);
    expect(target.hand).toContainEqual(destroyed);
    expect(first.room.game.discard).not.toContainEqual(destroyed);
    expect(first.room.game.phase).toBe(GamePhase.BUILD);
  });

  it("automatically discards a pending graveyard recovery when its time expires", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const card = { instanceId: "expired-card", definitionId: "market", name: "시장", cost: 2, color: "TRADE" as const, description: "테스트", unique: false };
    first.room.game.phase = GamePhase.ACTION;
    first.room.game.pendingGraveyardRecovery = { playerId: first.session.playerId, card, expiresAt: Date.now() - 1 };
    expect(engine.expireGraveyardRecovery(first.room)).toBe(true);
    expect(first.room.game.discard).toContainEqual(card);
    expect(first.room.game.phase).toBe(GamePhase.BUILD);
  });

  it("safely declines an expired graveyard recovery request", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const card = { instanceId: "expired-request-card", definitionId: "market", name: "시장", cost: 2, color: "TRADE" as const, description: "테스트", unique: false };
    first.room.game.phase = GamePhase.ACTION;
    first.room.game.pendingGraveyardRecovery = { playerId: first.session.playerId, card, expiresAt: Date.now() - 1 };
    engine.chooseGraveyardRecovery(first.room, first.session.playerId, true);
    expect(first.room.game.discard).toContainEqual(card);
    expect(first.room.game.phase).toBe(GamePhase.BUILD);
  });

  it("lets the haunted city fill a missing color for the final color-completion bonus", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const player = first.room.players.get(first.session.playerId)!;
    player.city.push(
      { instanceId: "other-unique", definitionId: "library", name: "대도서관", cost: 6, color: "UNIQUE", description: "테스트", unique: true },
      { instanceId: "haunted-test", definitionId: "haunted_city", name: "유령 도시", cost: 2, color: "UNIQUE", description: "테스트", unique: true },
      { instanceId: "noble-test", definitionId: "manor", name: "장원", cost: 3, color: "NOBLE", description: "테스트", unique: false },
      { instanceId: "religious-test", definitionId: "chapel", name: "예배당", cost: 1, color: "RELIGIOUS", description: "테스트", unique: false },
      { instanceId: "trade-test", definitionId: "market", name: "시장", cost: 2, color: "TRADE", description: "테스트", unique: false }
    );
    const score = new ScoreManager().calculate(first.room)[0];
    expect(score.colorBonus).toBe(3);
  });

  it("automatically advances a disconnected player's role choice and turn with safe defaults", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    const firstPlayer = first.room.players.get(first.session.playerId)!;
    firstPlayer.socketId = null;
    expect(engine.autoAdvanceDisconnectedPlayer(first.room, firstPlayer.id)).toBe(true);
    expect(first.room.game.rolesByPlayerId.size).toBe(1);

    engine.selectRole(first.room, second.session.playerId, engine.toPrivateState(first.room, second.session.playerId).roleChoices.sort((left, right) => right.rank - left.rank)[0]!.id);
    expect(engine.autoAdvanceDisconnectedPlayer(first.room, firstPlayer.id)).toBe(true);
    engine.selectRole(first.room, second.session.playerId, engine.toPrivateState(first.room, second.session.playerId).roleChoices.sort((left, right) => right.rank - left.rank)[0]!.id);
    expect(first.room.game.phase).toBe(GamePhase.INCOME);
    expect(engine.autoAdvanceDisconnectedPlayer(first.room, firstPlayer.id)).toBe(true);
    expect(first.room.game.phase).toBe(GamePhase.ACTION);
    expect(engine.autoAdvanceDisconnectedPlayer(first.room, firstPlayer.id)).toBe(true);
    expect(first.room.game.phase).toBe(GamePhase.BUILD);
    expect(engine.autoAdvanceDisconnectedPlayer(first.room, firstPlayer.id)).toBe(true);
    expect(engine.toPublicState(first.room).currentPlayerId).not.toBeNull();
  });

  it("lets only the host reset a finished game for a rematch", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.game.phase = GamePhase.GAME_END;
    first.room.players.forEach((player) => {
      player.isReady = true;
      player.gold = 5;
      player.hand.push({ instanceId: `${player.id}-card`, definitionId: "market", name: "시장", cost: 2, color: "TRADE", description: "테스트", unique: false });
    });
    expect(() => rooms.restart(first.room, second.session.playerId)).toThrow("방장만");
    rooms.restart(first.room, first.session.playerId);
    expect(first.room.game.phase).toBe(GamePhase.LOBBY);
    expect(first.room.players.get(first.session.playerId)!.isReady).toBe(false);
    expect(first.room.players.get(first.session.playerId)!.hand).toEqual([]);
    expect(first.room.players.get(first.session.playerId)!.gold).toBe(0);
  });

  it("keeps the scholar's five private research choices out of public state", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.roleSetId = "DARK_CITY";
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "scholar");
    engine.selectRole(first.room, second.session.playerId, "witch");
    completeRoleSelection(engine, first.room);

    const scholar = first.room.players.get(first.session.playerId)!;
    const witch = first.room.players.get(second.session.playerId)!;
    engine.takeIncome(first.room, witch.id, "GOLD");
    engine.skipAction(first.room, witch.id);
    engine.endTurn(first.room, witch.id);
    engine.takeIncome(first.room, scholar.id, "GOLD");
    engine.useScholarAbility(first.room, scholar.id);
    const choices = engine.toPrivateState(first.room, scholar.id).scholarChoices;
    expect(choices).toHaveLength(5);
    expect(JSON.stringify(rooms.toPublic(first.room))).not.toContain(choices[0].instanceId);
    engine.chooseScholarCard(first.room, scholar.id, choices[0].instanceId);
    expect(scholar.hand).toContainEqual(choices[0]);
    expect(first.room.game.phase).toBe(GamePhase.BUILD);
  });

  it("lets the artist decorate one city district and adds its value to scoring", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.rankNineEnabled = true;
    first.room.rankNineRoleId = "artist";
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "assassin");
    engine.selectRole(first.room, second.session.playerId, "artist");
    completeRoleSelection(engine, first.room);

    const assassin = first.room.players.get(first.session.playerId)!;
    const artist = first.room.players.get(second.session.playerId)!;
    const district = artist.hand[0];
    artist.hand = artist.hand.slice(1);
    artist.city.push(district);
    engine.takeIncome(first.room, assassin.id, "GOLD");
    engine.skipAction(first.room, assassin.id);
    engine.endTurn(first.room, assassin.id);
    engine.takeIncome(first.room, artist.id, "GOLD");
    engine.useArtistAbility(first.room, artist.id, district.instanceId);
    expect(district.decorationBonus).toBe(2);
    expect(() => engine.useArtistAbility(first.room, artist.id, district.instanceId)).toThrow("현재 단계");
    const score = new ScoreManager().calculate(first.room).find((item) => item.playerId === artist.id)!;
    expect(score.decorationPoints).toBe(2);
  });

  it("lets the spy draw one card for each other city matching the chosen color", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    const third = rooms.join(first.room.code, "세번째", "socket-3");
    first.room.roleSetId = "DARK_CITY";
    first.room.rankNineEnabled = true;
    first.room.rankNineRoleId = "artist";
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "spy");
    engine.selectRole(first.room, second.session.playerId, "witch");
    engine.selectRole(first.room, third.session.playerId, "bishop");
    completeRoleSelection(engine, first.room);

    const spy = first.room.players.get(first.session.playerId)!;
    const witch = first.room.players.get(second.session.playerId)!;
    const observer = first.room.players.get(third.session.playerId)!;
    observer.city.push({ instanceId: "spy-trade", definitionId: "spy-trade", name: "정찰 시장", cost: 2, color: "TRADE", description: "테스트 건물", unique: false });
    engine.takeIncome(first.room, witch.id, "GOLD");
    engine.skipAction(first.room, witch.id);
    engine.endTurn(first.room, witch.id);
    engine.takeIncome(first.room, spy.id, "GOLD");
    const before = spy.hand.length;
    engine.useSpyAbility(first.room, spy.id, "TRADE");
    expect(spy.hand).toHaveLength(before + 1);
    expect(first.room.game.phase).toBe(GamePhase.BUILD);
  });

  it("lets the seer swap two other players' private hands", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    const third = rooms.join(first.room.code, "세번째", "socket-3");
    const fourth = rooms.join(first.room.code, "네번째", "socket-4");
    first.room.roleSetId = "DARK_CITY";
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    restoreDiscardedRolesForAbilityTest(first.room);
    engine.selectRole(first.room, first.session.playerId, "seer");
    engine.selectRole(first.room, second.session.playerId, "witch");
    engine.selectRole(first.room, third.session.playerId, "merchant");
    engine.selectRole(first.room, fourth.session.playerId, "bishop");

    const seer = first.room.players.get(first.session.playerId)!;
    const witch = first.room.players.get(second.session.playerId)!;
    const left = first.room.players.get(third.session.playerId)!;
    const right = first.room.players.get(fourth.session.playerId)!;
    const leftHand = left.hand;
    const rightHand = right.hand;
    engine.takeIncome(first.room, witch.id, "GOLD");
    engine.skipAction(first.room, witch.id);
    engine.endTurn(first.room, witch.id);
    engine.takeIncome(first.room, seer.id, "GOLD");
    engine.useSeerAbility(first.room, seer.id, left.id, right.id);
    expect(left.hand).toBe(rightHand);
    expect(right.hand).toBe(leftHand);
    expect(JSON.stringify(rooms.toPublic(first.room))).not.toContain(leftHand[0].instanceId);
  });

  it("lets the wizard take one server-random card from another private hand", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.roleSetId = "NEW_COURT";
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "wizard");
    engine.selectRole(first.room, second.session.playerId, "thief");
    completeRoleSelection(engine, first.room);

    const wizard = first.room.players.get(first.session.playerId)!;
    const thief = first.room.players.get(second.session.playerId)!;
    const beforeWizard = wizard.hand.length;
    const beforeThief = thief.hand.length;
    engine.takeIncome(first.room, thief.id, "GOLD");
    engine.skipAction(first.room, thief.id);
    engine.endTurn(first.room, thief.id);
    engine.takeIncome(first.room, wizard.id, "GOLD");
    engine.useWizardAbility(first.room, wizard.id, thief.id);
    expect(wizard.hand).toHaveLength(beforeWizard + 1);
    expect(thief.hand).toHaveLength(beforeThief - 1);
  });

  it("charges a magistrate-marked player's next construction one additional gold", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.roleSetId = "NEW_COURT";
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    restoreDiscardedRolesForAbilityTest(first.room);
    engine.selectRole(first.room, first.session.playerId, "magistrate");
    engine.selectRole(first.room, second.session.playerId, "trader");
    completeRoleSelection(engine, first.room);

    const magistrate = first.room.players.get(first.session.playerId)!;
    const target = first.room.players.get(second.session.playerId)!;
    engine.takeIncome(first.room, magistrate.id, "GOLD");
    engine.useMagistrateAbility(first.room, magistrate.id, target.id);
    engine.endTurn(first.room, magistrate.id);
    const card = target.hand[0];
    target.gold = 20;
    engine.takeIncome(first.room, target.id, "GOLD");
    engine.skipAction(first.room, target.id);
    engine.buildDistrict(first.room, target.id, card.instanceId);
    expect(target.gold).toBe(22 - card.cost - 1);
    expect(first.room.game.magistrateThreatenedPlayerId).toBeNull();
    expect(JSON.stringify(rooms.toPublic(first.room).game)).not.toContain("magistrateThreatenedPlayerId");
  });

  it("rewards the queen when its circular seat is adjacent to the rank-four player", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    const third = rooms.join(first.room.code, "세번째", "socket-3");
    const fourth = rooms.join(first.room.code, "네번째", "socket-4");
    const fifth = rooms.join(first.room.code, "다섯번째", "socket-5");
    first.room.rankNineEnabled = true;
    first.room.rankNineRoleId = "queen";
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    restoreDiscardedRolesForAbilityTest(first.room);
    engine.selectRole(first.room, first.session.playerId, "queen");
    engine.selectRole(first.room, second.session.playerId, "king");
    engine.selectRole(first.room, third.session.playerId, "assassin");
    engine.selectRole(first.room, fourth.session.playerId, "architect");
    engine.selectRole(first.room, fifth.session.playerId, "warlord");

    const assassin = first.room.players.get(third.session.playerId)!;
    const king = first.room.players.get(second.session.playerId)!;
    const queen = first.room.players.get(first.session.playerId)!;
    engine.takeIncome(first.room, assassin.id, "GOLD");
    engine.skipAction(first.room, assassin.id);
    engine.endTurn(first.room, assassin.id);
    engine.takeIncome(first.room, king.id, "GOLD");
    engine.skipAction(first.room, king.id);
    engine.endTurn(first.room, king.id);
    const architect = first.room.players.get(fourth.session.playerId)!;
    engine.takeIncome(first.room, architect.id, "GOLD");
    engine.skipAction(first.room, architect.id);
    engine.endTurn(first.room, architect.id);
    const warlord = first.room.players.get(fifth.session.playerId)!;
    engine.takeIncome(first.room, warlord.id, "GOLD");
    engine.skipAction(first.room, warlord.id);
    engine.endTurn(first.room, warlord.id);
    engine.takeIncome(first.room, queen.id, "GOLD");
    engine.useAbility(first.room, queen.id);
    expect(queen.gold).toBe(7);
    expect(rooms.toPublic(first.room).players.map((player) => player.seatNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it("lets the witch take over a chosen role's income and build turn with her own resources", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.roleSetId = "DARK_CITY";
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "witch");
    engine.selectRole(first.room, second.session.playerId, "merchant");
    completeRoleSelection(engine, first.room);

    const witch = first.room.players.get(first.session.playerId)!;
    const merchant = first.room.players.get(second.session.playerId)!;
    engine.takeIncome(first.room, witch.id, "GOLD");
    engine.useAbility(first.room, witch.id, "merchant");
    engine.endTurn(first.room, witch.id);
    expect(engine.toPublicState(first.room).currentPlayerId).toBe(witch.id);
    expect(engine.toPrivateState(first.room, witch.id).canTakeIncome).toBe(true);
    engine.takeIncome(first.room, witch.id, "GOLD");
    expect(witch.gold).toBe(6);
    expect(merchant.gold).toBe(2);
    expect(() => engine.takeIncome(first.room, merchant.id, "GOLD")).toThrow();
  });

  it("applies observatory card income and smithy district abilities on the server", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "assassin");
    engine.selectRole(first.room, second.session.playerId, "warlord");
    completeRoleSelection(engine, first.room);

    const player = first.room.players.get(first.session.playerId)!;
    player.city.push({ instanceId: "observatory-test", definitionId: "observatory", name: "별빛 관측소", cost: 4, color: "UNIQUE", description: "테스트", unique: true });
    player.city.push({ instanceId: "smithy-test", definitionId: "smithy", name: "대장간", cost: 5, color: "UNIQUE", description: "테스트", unique: true });
    engine.takeIncome(first.room, player.id, "CARDS");
    const choices = engine.toPrivateState(first.room, player.id).incomeChoices;
    expect(choices).toHaveLength(3);
    engine.chooseIncomeCard(first.room, player.id, choices[0].instanceId);
    engine.skipAction(first.room, player.id);
    player.gold = 10;
    const before = player.hand.length;
    engine.useDistrictAbility(first.room, player.id, { type: "SMITHY" });
    expect(player.gold).toBe(8);
    expect(player.hand).toHaveLength(before + 3);
    expect(() => engine.useDistrictAbility(first.room, player.id, { type: "SMITHY" })).toThrow("이미 건물 능력");
  });

  it("lets the library select two cards and scores map room and imperial treasury bonuses", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    restoreDiscardedRolesForAbilityTest(first.room);
    engine.selectRole(first.room, first.session.playerId, "assassin");
    engine.selectRole(first.room, second.session.playerId, "warlord");
    completeRoleSelection(engine, first.room);

    const player = first.room.players.get(first.session.playerId)!;
    player.city.push({ instanceId: "library-test", definitionId: "library", name: "대도서관", cost: 6, color: "UNIQUE", description: "테스트", unique: true });
    engine.takeIncome(first.room, player.id, "CARDS");
    const firstChoices = engine.toPrivateState(first.room, player.id).incomeChoices;
    expect(firstChoices).toHaveLength(3);
    engine.chooseIncomeCard(first.room, player.id, firstChoices[0].instanceId);
    expect(first.room.game.phase).toBe(GamePhase.INCOME);
    expect(engine.toPrivateState(first.room, player.id).incomeSelectionsRemaining).toBe(1);
    const secondChoices = engine.toPrivateState(first.room, player.id).incomeChoices;
    engine.chooseIncomeCard(first.room, player.id, secondChoices[0].instanceId);
    expect(player.hand).toHaveLength(6);
    expect(first.room.game.phase).toBe(GamePhase.ACTION);

    player.city.push({ instanceId: "university-test", definitionId: "university", name: "대학", cost: 6, color: "UNIQUE", description: "테스트", unique: true });
    player.city.push({ instanceId: "dragon-test", definitionId: "dragon_gate", name: "용의 관문", cost: 6, color: "UNIQUE", description: "테스트", unique: true });
    player.city.push({ instanceId: "map-room-test", definitionId: "map_room", name: "지도실", cost: 5, color: "UNIQUE", description: "테스트", unique: true });
    player.city.push({ instanceId: "treasury-test", definitionId: "imperial_treasury", name: "황제의 보물고", cost: 5, color: "UNIQUE", description: "테스트", unique: true });
    player.gold = 8;
    const score = new ScoreManager().calculate(first.room).find((item) => item.playerId === player.id)!;
    expect(score.specialDistrictPoints).toBe(12);
  });

  it("lets only the host choose a role set in the lobby", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");

    expect(first.room.roleSetId).toBe("CLASSIC");
    expect(() => rooms.setRoleSet(first.room, second.session.playerId, "DARK_CITY")).toThrow("방장만");
    rooms.setRoleSet(first.room, first.session.playerId, "DARK_CITY");
    expect(first.room.rankNineRoleId).toBe("artist");
    expect(first.room.rankNineCustomMode).toBe(false);
    expect(() => rooms.setRankNine(first.room, second.session.playerId, true, "artist", true)).toThrow("방장만");
    rooms.setRankNine(first.room, first.session.playerId, true, "artist", true);
    expect(rooms.toPublic(first.room).roleSetId).toBe("DARK_CITY");
    expect(rooms.toPublic(first.room).roleSets).toHaveLength(3);
    expect(rooms.toPublic(first.room).rankNineEnabled).toBe(true);
    expect(rooms.toPublic(first.room).rankNineRoleId).toBe("artist");
    expect(rooms.toPublic(first.room).rankNineRoles.map((role) => role.id)).toEqual(["queen", "artist", "tax_collector"]);

    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    const choices = engine.toPrivateState(first.room, first.session.playerId).roleChoices;
    expect(choices).toHaveLength(8);
    engine.selectRole(first.room, first.session.playerId, "artist");
    engine.selectRole(first.room, second.session.playerId, "witch");
    completeRoleSelection(engine, first.room);
    expect(first.room.game.turnOrder.map((turn) => turn.playerId)).toEqual([second.session.playerId, first.session.playerId]);
    expect(() => rooms.setRoleSet(first.room, first.session.playerId, "CLASSIC")).toThrow("로비에서만");
    expect(() => rooms.setRankNine(first.room, first.session.playerId, false, "artist", true)).toThrow("로비에서만");
  });

  it("enforces revised rank-nine requirements on the server", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    rooms.join(first.room.code, "두번째", "socket-2");
    rooms.join(first.room.code, "세번째", "socket-3");
    first.room.players.forEach((player) => { player.isReady = true; });

    expect(() => engine.start(first.room, first.session.playerId)).toThrow("3인 게임에서는 9번 직업을 사용해야");
    expect(() => rooms.setRankNine(first.room, first.session.playerId, true, "queen", false)).toThrow("여왕");
    rooms.setRankNine(first.room, first.session.playerId, true, "artist", true);
    engine.start(first.room, first.session.playerId);
    expect(first.room.game.phase).toBe(GamePhase.ROLE_SELECTION);
  });

  it("discards the required public and private roles without exposing private roles", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    rooms.join(first.room.code, "두번째", "socket-2");
    rooms.join(first.room.code, "세번째", "socket-3");
    rooms.join(first.room.code, "네번째", "socket-4");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);

    expect(first.room.game.faceUpDiscardedRoles).toHaveLength(2);
    expect(first.room.game.faceUpDiscardedRoles.some((role) => role.rank === 4)).toBe(false);
    expect(first.room.game.faceDownDiscardedRoleIds).toHaveLength(1);
    expect(first.room.game.availableRoleIds).toHaveLength(5);
    const publicPayload = JSON.stringify(rooms.toPublic(first.room).game);
    expect(publicPayload).toContain(first.room.game.faceUpDiscardedRoles[0]!.id);
    expect(publicPayload).not.toContain(first.room.game.faceDownDiscardedRoleIds[0]!);
  });

  it("keeps the initial facedown role unavailable to the final player in a seven-player game", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    for (let index = 2; index <= 7; index += 1) rooms.join(first.room.code, `${index}번째`, `socket-${index}`);
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    const initialFaceDownRoleId = first.room.game.faceDownDiscardedRoleIds[0]!;

    for (let index = 0; index < 6; index += 1) {
      const playerId = first.room.game.selectionOrder[first.room.game.selectionIndex]!;
      const choice = engine.toPrivateState(first.room, playerId).roleChoices[0]!;
      engine.selectRole(first.room, playerId, choice.id);
    }
    const finalPlayerId = first.room.game.selectionOrder[first.room.game.selectionIndex]!;
    const finalChoices = engine.toPrivateState(first.room, finalPlayerId).roleChoices;
    expect(finalChoices).toHaveLength(1);
    expect(finalChoices.map((role) => role.id)).not.toContain(initialFaceDownRoleId);

    engine.selectRole(first.room, finalPlayerId, finalChoices[0]!.id);
    expect(first.room.game.faceDownDiscardedRoleIds).toHaveLength(1);
    expect(first.room.game.faceDownDiscardedRoleIds).toContain(initialFaceDownRoleId);
    expect(first.room.game.turnOrder).toHaveLength(7);
  });

  it("keeps all two-player private exclusions server-controlled", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);

    for (const playerId of [first.session.playerId, second.session.playerId]) {
      const role = engine.toPrivateState(first.room, playerId).roleChoices[0]!;
      engine.selectRole(first.room, playerId, role.id);
    }
    const firstSecondChoice = engine.toPrivateState(first.room, first.session.playerId);
    expect(firstSecondChoice.canChooseRolePair).toBe(false);
    engine.selectRole(first.room, first.session.playerId, firstSecondChoice.roleChoices[0]!.id);

    const secondSecondChoice = engine.toPrivateState(first.room, second.session.playerId);
    expect(secondSecondChoice.canChooseRolePair).toBe(false);
    engine.selectRole(first.room, second.session.playerId, secondSecondChoice.roleChoices[0]!.id);
    expect(first.room.game.phase).toBe(GamePhase.INCOME);
    expect(first.room.game.turnOrder).toHaveLength(4);
    expect(first.room.game.faceDownDiscardedRoleIds).toHaveLength(4);
  });

  it("has the server randomly discard one role after the first three-player selection round", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    const third = rooms.join(first.room.code, "세번째", "socket-3");
    first.room.rankNineEnabled = true;
    first.room.rankNineRoleId = "artist";
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);

    for (const playerId of [first.session.playerId, second.session.playerId, third.session.playerId]) {
      const role = engine.toPrivateState(first.room, playerId).roleChoices[0]!;
      engine.selectRole(first.room, playerId, role.id);
    }
    expect(engine.toPrivateState(first.room, third.session.playerId).canDiscardRole).toBe(false);
    expect(first.room.game.faceDownDiscardedRoleIds).toHaveLength(2);
    completeRoleSelection(engine, first.room, true);

    expect(first.room.game.turnOrder).toHaveLength(6);
    expect(first.room.game.faceDownDiscardedRoleIds).toHaveLength(3);
    expect(first.room.game.phase).toBe(GamePhase.INCOME);
  });

  it("moves the crown to the king and starts the next role selection from that seat", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    const third = rooms.join(first.room.code, "세번째", "socket-3");
    const fourth = rooms.join(first.room.code, "네번째", "socket-4");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    restoreDiscardedRolesForAbilityTest(first.room);
    engine.selectRole(first.room, first.session.playerId, "warlord");
    engine.selectRole(first.room, second.session.playerId, "assassin");
    engine.selectRole(first.room, third.session.playerId, "thief");
    engine.selectRole(first.room, fourth.session.playerId, "king");

    for (const playerId of [second.session.playerId, third.session.playerId]) {
      engine.takeIncome(first.room, playerId, "GOLD");
      engine.skipAction(first.room, playerId);
      engine.endTurn(first.room, playerId);
    }
    expect(first.room.crownHolderId).toBe(fourth.session.playerId);
    expect(rooms.toPublic(first.room).players.find((player) => player.id === fourth.session.playerId)?.hasCrown).toBe(true);

    engine.takeIncome(first.room, fourth.session.playerId, "GOLD");
    engine.skipAction(first.room, fourth.session.playerId);
    engine.endTurn(first.room, fourth.session.playerId);
    engine.takeIncome(first.room, first.session.playerId, "GOLD");
    engine.skipAction(first.room, first.session.playerId);
    engine.endTurn(first.room, first.session.playerId);
    expect(engine.toPublicState(first.room).selectionPlayerId).toBe(fourth.session.playerId);
  });

  it("finishes the current round and calculates final scores after a city reaches eight districts", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    engine.selectRole(first.room, first.session.playerId, "warlord");
    engine.selectRole(first.room, second.session.playerId, "assassin");
    completeRoleSelection(engine, first.room);

    const builder = first.room.players.get(second.session.playerId)!;
    const colors: DistrictColor[] = ["NOBLE", "RELIGIOUS", "TRADE", "MILITARY", "UNIQUE", "NOBLE", "TRADE"];
    builder.city = colors.map((color, index) => ({
      instanceId: `built-${index}`,
      definitionId: `built-definition-${index}`,
      name: `건물 ${index}`,
      cost: 2,
      color,
      description: "테스트 건물",
      unique: false
    }));
    builder.gold = 100;
    const eighth = builder.hand[0];
    engine.takeIncome(first.room, builder.id, "GOLD");
    engine.skipAction(first.room, builder.id);
    engine.buildDistrict(first.room, builder.id, eighth.instanceId);
    expect(first.room.game.gameEndTriggered).toBe(true);
    engine.endTurn(first.room, builder.id);
    expect(first.room.game.phase).toBe(GamePhase.INCOME);

    const lastPlayer = first.room.players.get(first.session.playerId)!;
    engine.takeIncome(first.room, lastPlayer.id, "GOLD");
    engine.skipAction(first.room, lastPlayer.id);
    engine.endTurn(first.room, lastPlayer.id);
    expect(first.room.game.phase).toBe(GamePhase.GAME_END);
    expect(first.room.game.finalScores[0].playerId).toBe(builder.id);
    expect(first.room.game.finalScores[0].colorBonus).toBe(3);
    expect(first.room.game.finalScores[0].completionBonus).toBe(4);
  });

  it("triggers the end of a four-player game when a city reaches seven districts", () => {
    const engine = new GameEngine();
    const rooms = new RoomManager(engine);
    const first = rooms.create("첫번째", "socket-1");
    const second = rooms.join(first.room.code, "두번째", "socket-2");
    const third = rooms.join(first.room.code, "세번째", "socket-3");
    const fourth = rooms.join(first.room.code, "네번째", "socket-4");
    first.room.players.forEach((player) => { player.isReady = true; });
    engine.start(first.room, first.session.playerId);
    restoreDiscardedRolesForAbilityTest(first.room);
    engine.selectRole(first.room, first.session.playerId, "warlord");
    engine.selectRole(first.room, second.session.playerId, "assassin");
    engine.selectRole(first.room, third.session.playerId, "thief");
    engine.selectRole(first.room, fourth.session.playerId, "magician");
    const builder = first.room.players.get(second.session.playerId)!;
    builder.city = Array.from({ length: 6 }, (_, index) => ({ instanceId: `four-player-${index}`, definitionId: `four-player-definition-${index}`, name: `건물 ${index}`, cost: 2, color: "TRADE" as const, description: "테스트", unique: false }));
    builder.gold = 100;
    engine.takeIncome(first.room, builder.id, "GOLD");
    engine.skipAction(first.room, builder.id);
    engine.buildDistrict(first.room, builder.id, builder.hand[0].instanceId);
    expect(first.room.game.gameEndTriggered).toBe(true);
  });
});
