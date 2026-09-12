import { GamePhase, type DistrictColor, type PrivatePlayerState, type PublicGameState } from "@citadel/shared";
import { RoleManager } from "./RoleManager.js";
import { TurnManager } from "./TurnManager.js";
import { DeckManager } from "./DeckManager.js";
import { AbilityManager, type MagicianAction } from "./AbilityManager.js";
import { LogManager } from "./LogManager.js";
import { ScoreManager } from "./ScoreManager.js";
import type { Room } from "./types.js";

export class GameEngine {
  constructor(
    private readonly roles = new RoleManager(),
    private readonly turns = new TurnManager(),
    private readonly deck = new DeckManager(),
    private readonly abilities = new AbilityManager(),
    private readonly logs = new LogManager(),
    private readonly scores = new ScoreManager()
  ) {}

  createInitialState(): Room["game"] {
    return {
      phase: GamePhase.LOBBY,
      round: 0,
      selectionOrder: [],
      selectionIndex: 0,
      availableRoleIds: [],
      faceUpDiscardedRoles: [],
      faceDownDiscardedRoleIds: [],
      pendingRoleDiscardPlayerId: null,
      rolesByPlayerId: new Map(),
      turnOrder: [],
      turnIndex: 0,
      deck: [],
      discard: [],
      pendingIncomeByPlayerId: new Map(),
      pendingIncomeSelectionsByPlayerId: new Map(),
      pendingScholarByPlayerId: new Map(),
      pendingGraveyardRecovery: null,
      abilityUsed: false,
      districtAbilityUsed: false,
      assassinatedRoleId: null,
      robbedRoleId: null,
      magistrateThreatenedPlayerId: null,
      witchTargetRoleId: null,
      builtThisTurn: 0,
      logs: [],
      nextLogId: 1,
      gameEndTriggered: false,
      firstCompletedPlayerId: null,
      finalScores: []
    };
  }

  start(room: Room, requesterId: string): void {
    if (room.game.phase !== GamePhase.LOBBY) throw new Error("이미 게임이 시작되었습니다.");
    if (room.hostId !== requesterId) throw new Error("방장만 게임을 시작할 수 있습니다.");
    if (room.players.size < 2) throw new Error("게임 시작에는 최소 2명이 필요합니다.");
    if ([...room.players.values()].some((player) => !player.isReady)) {
      throw new Error("모든 플레이어가 준비해야 합니다.");
    }
    this.validateRankNineRules(room);
    room.game.round = 1;
    this.deck.setup(room);
    this.logs.add(room, "게임이 시작되었습니다.");
    this.beginRoleSelection(room);
  }

  selectRole(room: Room, playerId: string, roleId: string): void {
    if (room.game.phase !== GamePhase.ROLE_SELECTION) throw new Error("역할 선택 단계가 아닙니다.");
    this.roles.select(room, playerId, roleId);
    if (room.game.pendingRoleDiscardPlayerId === null && room.game.selectionIndex >= room.game.selectionOrder.length) {
      this.turns.begin(room);
      this.startCurrentTurn(room);
    }
  }

  discardRole(room: Room, playerId: string, roleId: string): void {
    if (room.game.phase !== GamePhase.ROLE_SELECTION) throw new Error("역할 선택 단계가 아닙니다.");
    this.roles.discard(room, playerId, roleId);
    if (room.game.selectionIndex >= room.game.selectionOrder.length) {
      this.turns.begin(room);
      this.startCurrentTurn(room);
    }
  }

  takeIncome(room: Room, playerId: string, type: "GOLD" | "CARDS"): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.INCOME);
    if (room.game.pendingIncomeByPlayerId.has(playerId)) throw new Error("카드 한 장을 선택해 주세요.");
    const player = room.players.get(playerId)!;
    if (type === "GOLD") {
      player.gold += 2;
      room.game.phase = GamePhase.ACTION;
      this.logs.add(room, `${player.nickname}님이 금화 2개를 얻었습니다.`);
      return;
    }
    this.deck.offerIncomeCards(room, playerId);
  }

  chooseIncomeCard(room: Room, playerId: string, instanceId: string): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.INCOME);
    const completed = this.deck.chooseIncomeCard(room, playerId, instanceId);
    if (completed) {
      room.game.phase = GamePhase.ACTION;
      this.logs.add(room, `${room.players.get(playerId)!.nickname}님이 건물 카드 수입을 마쳤습니다.`);
    }
  }

  useAbility(room: Room, playerId: string, targetRoleId?: string): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    const result = this.abilities.use(room, playerId, targetRoleId);
    this.logs.add(room, result.message);
    room.game.phase = GamePhase.BUILD;
  }

  useColorIncomeAbility(room: Room, playerId: string, color: DistrictColor): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    const result = this.abilities.useColorIncome(room, playerId, color);
    this.logs.add(room, result.message);
    room.game.phase = GamePhase.BUILD;
  }

  useMagicianAbility(room: Room, playerId: string, action: MagicianAction): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    const result = this.abilities.useMagician(room, playerId, action);
    this.logs.add(room, result.message);
    room.game.phase = GamePhase.BUILD;
  }

  useWarlordAbility(room: Room, playerId: string, targetPlayerId: string, districtInstanceId: string): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    const result = this.abilities.useWarlord(room, playerId, targetPlayerId, districtInstanceId);
    this.logs.add(room, result.message);
    if (room.game.pendingGraveyardRecovery) {
      this.logs.add(room, `${room.players.get(targetPlayerId)!.nickname}님이 묘지로 건물 회수 여부를 결정합니다.`);
    } else {
      room.game.phase = GamePhase.BUILD;
    }
  }

  chooseGraveyardRecovery(room: Room, playerId: string, recover: boolean): void {
    const pending = room.game.pendingGraveyardRecovery;
    if (!pending || pending.playerId !== playerId) throw new Error("지금은 묘지 회수를 결정할 수 없습니다.");
    if (Date.now() >= pending.expiresAt) {
      this.expireGraveyardRecovery(room);
      return;
    }
    const player = room.players.get(playerId)!;
    if (recover) {
      if (player.gold < 1) throw new Error("묘지 회수에 필요한 금화 1개가 부족합니다.");
      player.gold -= 1;
      player.hand.push(pending.card);
      this.logs.add(room, `${player.nickname}님이 묘지로 ${pending.card.name}을(를) 손으로 회수했습니다.`);
    } else {
      room.game.discard.push(pending.card);
      this.logs.add(room, `${player.nickname}님이 묘지 회수를 포기했습니다.`);
    }
    room.game.pendingGraveyardRecovery = null;
    room.game.phase = GamePhase.BUILD;
  }

  expireGraveyardRecovery(room: Room): boolean {
    const pending = room.game.pendingGraveyardRecovery;
    if (!pending) return false;
    room.game.discard.push(pending.card);
    room.game.pendingGraveyardRecovery = null;
    room.game.phase = GamePhase.BUILD;
    this.logs.add(room, `${room.players.get(pending.playerId)!.nickname}님의 묘지 회수 시간이 지나 건물이 버린 카드 더미로 이동했습니다.`);
    return true;
  }

  useScholarAbility(room: Room, playerId: string): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    const role = this.currentTurnRole(room);
    if (role?.abilityType !== "SCHOLAR_DRAW") throw new Error("학자만 사용할 수 있는 능력입니다.");
    if (room.game.abilityUsed) throw new Error("이번 턴에는 이미 능력을 사용했습니다.");
    const cards = this.deck.draw(room, 5);
    if (cards.length === 0) throw new Error("연구할 설계도가 없습니다.");
    room.game.pendingScholarByPlayerId.set(playerId, cards);
    room.game.abilityUsed = true;
    this.logs.add(room, `${room.players.get(playerId)!.nickname}님이 비공개 설계도를 연구합니다.`);
  }

  useArtistAbility(room: Room, playerId: string, districtInstanceId: string): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    if (room.game.abilityUsed) throw new Error("이번 턴에는 이미 능력을 사용했습니다.");
    const role = this.currentTurnRole(room);
    if (role?.abilityType !== "ARTIST") throw new Error("예술가만 사용할 수 있는 능력입니다.");
    const player = room.players.get(playerId)!;
    const district = player.city.find((card) => card.instanceId === districtInstanceId);
    if (!district) throw new Error("내 도시에 있는 건물을 선택해 주세요.");
    if (district.decorationBonus) throw new Error("이미 장식한 건물입니다.");
    district.decorationBonus = 2;
    room.game.abilityUsed = true;
    this.logs.add(room, `${player.nickname}님이 ${district.name}을(를) 장식해 가치 2점을 더했습니다.`);
    room.game.phase = GamePhase.BUILD;
  }

  useSpyAbility(room: Room, playerId: string, color: DistrictColor): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    const result = this.abilities.useSpy(room, playerId, color);
    this.logs.add(room, result.message);
    room.game.phase = GamePhase.BUILD;
  }

  useSeerAbility(room: Room, playerId: string, firstPlayerId: string, secondPlayerId: string): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    const result = this.abilities.useSeer(room, playerId, firstPlayerId, secondPlayerId);
    this.logs.add(room, result.message);
    room.game.phase = GamePhase.BUILD;
  }

  useWizardAbility(room: Room, playerId: string, targetPlayerId: string): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    const result = this.abilities.useWizard(room, playerId, targetPlayerId);
    this.logs.add(room, result.message);
    room.game.phase = GamePhase.BUILD;
  }

  useMagistrateAbility(room: Room, playerId: string, targetPlayerId: string): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    const result = this.abilities.useMagistrate(room, playerId, targetPlayerId);
    this.logs.add(room, result.message);
    room.game.phase = GamePhase.BUILD;
  }

  useEmperorAbility(room: Room, playerId: string, targetPlayerId: string): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    const result = this.abilities.useEmperor(room, playerId, targetPlayerId);
    this.logs.add(room, result.message);
    room.game.phase = GamePhase.BUILD;
  }

  chooseScholarCard(room: Room, playerId: string, instanceId: string): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    const choices = room.game.pendingScholarByPlayerId.get(playerId) ?? [];
    const chosen = choices.find((card) => card.instanceId === instanceId);
    if (!chosen) throw new Error("연구할 수 없는 설계도입니다.");
    room.players.get(playerId)!.hand.push(chosen);
    room.game.discard.push(...choices.filter((card) => card.instanceId !== instanceId));
    room.game.pendingScholarByPlayerId.delete(playerId);
    room.game.phase = GamePhase.BUILD;
    this.logs.add(room, `${room.players.get(playerId)!.nickname}님이 설계도 1장을 연구했습니다.`);
  }

  skipAction(room: Room, playerId: string): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.ACTION);
    if (room.game.pendingGraveyardRecovery) throw new Error("묘지 회수 결정을 기다려야 합니다.");
    room.game.phase = GamePhase.BUILD;
  }

  buildDistrict(room: Room, playerId: string, instanceId: string): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.BUILD);
    const player = room.players.get(playerId)!;
    const card = player.hand.find((candidate) => candidate.instanceId === instanceId);
    if (!card) throw new Error("손에 없는 건물입니다.");
    const threatCost = room.game.magistrateThreatenedPlayerId === playerId ? 1 : 0;
    const totalCost = card.cost + threatCost;
    if (player.gold < totalCost) throw new Error("금화가 부족합니다.");
    if (player.city.some((built) => built.definitionId === card.definitionId)) {
      throw new Error("같은 이름의 건물은 중복 건설할 수 없습니다.");
    }
    player.gold -= totalCost;
    player.hand = player.hand.filter((candidate) => candidate.instanceId !== instanceId);
    player.city.push(card);
    room.game.builtThisTurn += 1;
    this.logs.add(room, `${player.nickname}님이 ${card.name}을(를) 건설했습니다.`);
    if (threatCost) {
      room.game.magistrateThreatenedPlayerId = null;
      this.logs.add(room, `${player.nickname}님이 위협 표식으로 추가 금화 1개를 냈습니다.`);
    }
    const taxCollector = [...room.game.rolesByPlayerId.entries()].find(([, roles]) => roles.some((role) => role.abilityType === "PASSIVE_TAX"));
    if (taxCollector && taxCollector[0] !== playerId) {
      const collector = room.players.get(taxCollector[0])!;
      collector.gold += 1;
      this.logs.add(room, `${collector.nickname}님이 건설 세금으로 금화 1개를 얻었습니다.`);
    }
    if (player.city.length >= this.completedCitySize(room) && !room.game.gameEndTriggered) {
      room.game.gameEndTriggered = true;
      room.game.firstCompletedPlayerId = player.id;
      this.logs.add(room, `${player.nickname}님이 도시를 완성했습니다. 이번 라운드 종료 후 점수를 계산합니다.`);
    }
    const role = this.currentTurnRole(room);
    if (room.game.builtThisTurn >= this.abilities.buildLimit(role, room.game.abilityUsed)) {
      room.game.phase = GamePhase.TURN_END;
    }
  }

  useDistrictAbility(room: Room, playerId: string, action: { type: "SMITHY" } | { type: "LABORATORY"; cardInstanceId: string }): void {
    this.requireCurrentPlayer(room, playerId, GamePhase.BUILD);
    if (room.game.districtAbilityUsed) throw new Error("이번 턴에는 이미 건물 능력을 사용했습니다.");
    const player = room.players.get(playerId)!;
    const requiredDistrict = action.type === "SMITHY" ? "smithy" : "laboratory";
    if (!player.city.some((card) => card.definitionId === requiredDistrict)) throw new Error("도시에 해당 효과 건물이 없습니다.");
    if (action.type === "SMITHY") {
      if (player.gold < 2) throw new Error("대장간 능력에 필요한 금화 2개가 부족합니다.");
      player.gold -= 2;
      const cards = this.deck.draw(room, 3);
      player.hand.push(...cards);
      room.game.districtAbilityUsed = true;
      this.logs.add(room, `${player.nickname}님이 대장간에서 설계도 ${cards.length}장을 만들었습니다.`);
      return;
    }
    const card = player.hand.find((candidate) => candidate.instanceId === action.cardInstanceId);
    if (!card) throw new Error("버릴 수 없는 손패입니다.");
    player.hand = player.hand.filter((candidate) => candidate.instanceId !== card.instanceId);
    room.game.discard.push(card);
    player.gold += 1;
    room.game.districtAbilityUsed = true;
    this.logs.add(room, `${player.nickname}님이 연구소에서 설계도 1장을 버리고 금화 1개를 얻었습니다.`);
  }

  endTurn(room: Room, playerId: string): void {
    if (![GamePhase.BUILD, GamePhase.TURN_END].includes(room.game.phase)) throw new Error("지금은 턴을 종료할 수 없습니다.");
    const result = this.turns.endTurn(room, this.currentTurnOwnerId(room));
    if (result === "ROUND_END") {
      this.completeRound(room);
    } else {
      if (!this.startCurrentTurn(room)) this.completeRound(room);
    }
  }

  autoAdvanceDisconnectedPlayer(room: Room, playerId: string): boolean {
    const player = room.players.get(playerId);
    if (!player || player.socketId) return false;
    if (room.game.phase === GamePhase.ROLE_SELECTION && room.game.selectionOrder[room.game.selectionIndex] === playerId) {
      if (room.game.pendingRoleDiscardPlayerId === playerId) {
        const role = this.roles.getDiscardChoices(room, playerId)[0];
        if (!role) return false;
        this.discardRole(room, playerId, role.id);
        this.logs.add(room, "연결이 끊긴 플레이어의 역할 카드가 비공개로 자동 제외되었습니다.");
        return true;
      }
      const role = this.roles.getChoices(room, playerId)[0];
      if (!role) return false;
      this.selectRole(room, playerId, role.id);
      this.logs.add(room, "연결이 끊긴 플레이어의 역할을 자동으로 선택했습니다.");
      return true;
    }
    if (![GamePhase.INCOME, GamePhase.ACTION, GamePhase.BUILD, GamePhase.TURN_END].includes(room.game.phase)) return false;
    if (room.game.pendingGraveyardRecovery) return false;
    if (this.currentActingPlayerId(room) !== playerId) return false;
    if (room.game.phase === GamePhase.INCOME) {
      this.takeIncome(room, playerId, "GOLD");
      this.logs.add(room, `${player.nickname}님의 연결 끊김으로 금화 수입을 자동 선택했습니다.`);
      return true;
    }
    if (room.game.phase === GamePhase.ACTION) {
      this.skipAction(room, playerId);
      this.logs.add(room, `${player.nickname}님의 연결 끊김으로 역할 능력을 건너뛰었습니다.`);
      return true;
    }
    if ([GamePhase.BUILD, GamePhase.TURN_END].includes(room.game.phase)) {
      this.endTurn(room, playerId);
      this.logs.add(room, `${player.nickname}님의 연결 끊김으로 턴을 자동 종료했습니다.`);
      return true;
    }
    return false;
  }

  toPublicState(room: Room): PublicGameState {
    const hasActiveTurn = [GamePhase.TURN_START, GamePhase.INCOME, GamePhase.ACTION, GamePhase.BUILD, GamePhase.TURN_END].includes(room.game.phase);
    const currentPlayerId = hasActiveTurn
      ? this.currentActingPlayerId(room)
      : null;
    const currentRole = hasActiveTurn ? this.currentTurnRole(room) : null;
    return {
      phase: room.game.phase,
      round: room.game.round,
      currentPlayerId,
      currentRoleRank: currentRole?.rank ?? null,
      selectionPlayerId: room.game.phase === GamePhase.ROLE_SELECTION
        ? room.game.selectionOrder[room.game.selectionIndex] ?? null
        : null,
      selectedCount: [...room.game.rolesByPlayerId.values()].reduce((count, roles) => count + roles.length, 0),
      totalSelections: room.game.selectionOrder.length,
      faceUpDiscardedRoles: room.game.faceUpDiscardedRoles,
      deckCount: room.game.deck.length,
      logs: room.game.logs,
      finalScores: room.game.finalScores
    };
  }

  toPrivateState(room: Room, playerId: string): Omit<PrivatePlayerState, "playerToken"> {
    const player = room.players.get(playerId)!;
    const ownRoles = room.game.rolesByPlayerId.get(playerId) ?? [];
    const hasActiveTurn = [GamePhase.INCOME, GamePhase.ACTION, GamePhase.BUILD, GamePhase.TURN_END].includes(room.game.phase);
    const isCurrentActingPlayer = hasActiveTurn && this.currentActingPlayerId(room) === playerId;
    const role = hasActiveTurn && this.currentTurnOwnerId(room) === playerId ? this.currentTurnRole(room) : ownRoles.at(-1);
    const buildLimit = this.abilities.buildLimit(role, room.game.abilityUsed);
    return {
      playerId,
      selectedRole: role ?? null,
      selectedRoles: ownRoles,
      roleChoices: room.game.phase === GamePhase.ROLE_SELECTION ? this.roles.getChoices(room, playerId) : [],
      canSelectRole: room.game.phase === GamePhase.ROLE_SELECTION
        && room.game.selectionOrder[room.game.selectionIndex] === playerId
        && room.game.pendingRoleDiscardPlayerId === null,
      roleDiscardChoices: room.game.phase === GamePhase.ROLE_SELECTION ? this.roles.getDiscardChoices(room, playerId) : [],
      canDiscardRole: room.game.phase === GamePhase.ROLE_SELECTION && room.game.pendingRoleDiscardPlayerId === playerId,
      gold: player.gold,
      hand: player.hand,
      incomeChoices: room.game.pendingIncomeByPlayerId.get(playerId) ?? [],
      incomeSelectionsRemaining: room.game.pendingIncomeSelectionsByPlayerId.get(playerId) ?? 0,
      scholarChoices: room.game.pendingScholarByPlayerId.get(playerId) ?? [],
      graveyardRecoveryCard: room.game.pendingGraveyardRecovery?.playerId === playerId
        ? room.game.pendingGraveyardRecovery.card
        : null,
      graveyardRecoveryPending: room.game.pendingGraveyardRecovery !== null,
      canTakeIncome: room.game.phase === GamePhase.INCOME
        && isCurrentActingPlayer
        && !room.game.pendingIncomeByPlayerId.has(playerId),
      canBuild: room.game.phase === GamePhase.BUILD
        && isCurrentActingPlayer,
      canUseAbility: room.game.phase === GamePhase.ACTION
        && isCurrentActingPlayer
        && this.currentTurnOwnerId(room) === playerId
        && !room.game.abilityUsed
        && !room.game.pendingScholarByPlayerId.has(playerId)
        && this.abilities.canUse(role),
      canUseDistrictAbility: room.game.phase === GamePhase.BUILD
        && isCurrentActingPlayer
        && !room.game.districtAbilityUsed,
      abilityTargets: room.game.phase === GamePhase.ACTION
        && room.game.turnOrder[room.game.turnIndex]?.playerId === playerId
        ? this.abilities.targets(room, role)
        : [],
      abilityUsed: room.game.abilityUsed && isCurrentActingPlayer,
      buildsRemaining: isCurrentActingPlayer
        ? Math.max(0, buildLimit - room.game.builtThisTurn)
        : 0
    };
  }

  private beginRoleSelection(room: Room): void {
    room.game.phase = GamePhase.ROLE_SELECTION;
    this.roles.setup(room);
    room.game.assassinatedRoleId = null;
    room.game.robbedRoleId = null;
    room.game.magistrateThreatenedPlayerId = null;
    room.game.witchTargetRoleId = null;
    room.game.pendingScholarByPlayerId.clear();
    room.game.pendingGraveyardRecovery = null;
  }

  private validateRankNineRules(room: Room): void {
    const playerCount = room.players.size;
    if ([3, 8].includes(playerCount) && !room.rankNineEnabled) {
      throw new Error(`${playerCount}인 게임에서는 9번 직업을 사용해야 합니다.`);
    }
    if ([3, 4].includes(playerCount) && room.rankNineEnabled && room.rankNineRoleId === "queen") {
      throw new Error(`${playerCount}인 게임에서는 여왕을 9번 직업으로 사용할 수 없습니다.`);
    }
  }

  private requireCurrentPlayer(room: Room, playerId: string, phase: GamePhase): void {
    if (room.game.phase !== phase) throw new Error("현재 단계에서 할 수 없는 행동입니다.");
    if (this.currentActingPlayerId(room) !== playerId) throw new Error("현재는 내 턴이 아닙니다.");
  }

  private resetTurnActions(room: Room): void {
    room.game.abilityUsed = false;
    room.game.districtAbilityUsed = false;
    room.game.builtThisTurn = 0;
  }

  private startCurrentTurn(room: Room): boolean {
    while (room.game.turnIndex < room.game.turnOrder.length) {
      const player = this.currentPlayer(room);
      const role = this.currentTurnRole(room)!;
      if (role.id === room.game.assassinatedRoleId) {
        this.logs.add(room, `${role.name} 역할의 행동이 봉쇄되어 ${player.nickname}님의 턴을 건너뜁니다.`);
        room.game.turnIndex += 1;
        continue;
      }
      if (role.id === room.game.robbedRoleId) {
        const thief = [...room.game.rolesByPlayerId.entries()].find(([, candidates]) => candidates.some((candidate) => candidate.abilityType === "STEAL_GOLD"));
        if (thief) {
          const thiefPlayer = room.players.get(thief[0])!;
          const amount = player.gold;
          player.gold = 0;
          thiefPlayer.gold += amount;
          this.logs.add(room, `${player.nickname}님의 금화 ${amount}개가 도둑에게 넘어갔습니다.`);
        }
      }
      if (["king", "patrician"].includes(role.id) && room.crownHolderId !== player.id) {
        room.crownHolderId = player.id;
        this.logs.add(room, `${player.nickname}님이 왕관을 가져와 다음 역할 선택을 시작합니다.`);
      }
      this.resetTurnActions(room);
      room.game.phase = GamePhase.INCOME;
      this.logs.add(room, `${player.nickname}님의 턴이 시작되었습니다.`);
      return true;
    }
    return false;
  }

  private completeRound(room: Room): void {
    if (room.game.gameEndTriggered) {
      room.game.phase = GamePhase.GAME_END;
      room.game.finalScores = this.scores.calculate(room);
      this.logs.add(room, "게임이 종료되어 최종 점수를 계산했습니다.");
      return;
    }
    room.game.phase = GamePhase.ROUND_END;
    room.game.round += 1;
    this.beginRoleSelection(room);
  }

  private currentPlayer(room: Room) {
    return room.players.get(this.currentActingPlayerId(room))!;
  }

  private completedCitySize(room: Room): number {
    return room.players.size <= 3 ? 8 : 7;
  }

  private currentTurnOwnerId(room: Room): string {
    return room.game.turnOrder[room.game.turnIndex]!.playerId;
  }

  private currentTurnRole(room: Room) {
    return room.game.turnOrder[room.game.turnIndex]?.role;
  }

  private currentActingPlayerId(room: Room): string {
    const ownerId = this.currentTurnOwnerId(room);
    const ownerRole = this.currentTurnRole(room);
    const witchPlayerId = [...room.game.rolesByPlayerId.entries()].find(([, roles]) => roles.some((role) => role.abilityType === "WITCH_CONTROL"))?.[0];
    return ownerRole?.id === room.game.witchTargetRoleId && witchPlayerId ? witchPlayerId : ownerId;
  }
}
