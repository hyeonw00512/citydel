import { randomBytes, randomUUID } from "node:crypto";
import { GamePhase, type ChatMessage, type PublicRoomState, type SessionData } from "@citadel/shared";
import { GameEngine } from "../game/GameEngine.js";
import type { Player, Room } from "../game/types.js";
import { getRankNineRole, getRankNineSummaries, getRoleSet, getRoleSetSummaries } from "../game/roles/roles.js";

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly engine: GameEngine) {}

  create(nickname: string, socketId: string): { room: Room; session: SessionData } {
    const player = this.newPlayer(nickname, socketId);
    const code = this.uniqueCode();
    const room: Room = {
      code,
      name: `${nickname}의 도시`,
      roleSetId: "CLASSIC",
      rankNineEnabled: false,
      rankNineRoleId: "queen",
      rankNineCustomMode: false,
      crownHolderId: player.id,
      hostId: player.id,
      players: new Map([[player.id, player]]),
      spectators: new Map(),
      chat: [],
      nextChatId: 1,
      game: this.engine.createInitialState()
    };
    this.rooms.set(code, room);
    return { room, session: this.session(room, player) };
  }

  join(codeInput: string, nickname: string, socketId: string, token?: string): { room: Room; session: SessionData } {
    const code = codeInput.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new Error("존재하지 않는 방입니다.");
    if (token) {
      const existing = [...room.players.values()].find((player) => player.token === token);
      if (existing) {
        existing.socketId = socketId;
        existing.disconnectedAt = null;
        return { room, session: this.session(room, existing) };
      }
    }
    if (room.game.phase !== "LOBBY") throw new Error("진행 중인 게임에는 새로 참가할 수 없습니다.");
    if (room.players.size >= 8) throw new Error("방이 가득 찼습니다.");
    const player = this.newPlayer(nickname, socketId);
    room.players.set(player.id, player);
    return { room, session: this.session(room, player) };
  }

  spectate(codeInput: string, nickname: string, socketId: string, token?: string): { room: Room; session: SessionData } {
    const code = codeInput.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new Error("존재하지 않는 방입니다.");
    const existing = token ? [...room.spectators.values()].find((spectator) => spectator.token === token) : undefined;
    const spectator = existing ?? { id: randomUUID(), token: randomBytes(24).toString("hex"), nickname: nickname.trim().slice(0, 16), socketId };
    if (spectator.nickname.length < 2) throw new Error("닉네임은 2자 이상 입력해 주세요.");
    spectator.socketId = socketId;
    room.spectators.set(spectator.id, spectator);
    return { room, session: { roomCode: room.code, playerId: spectator.id, playerToken: spectator.token, isSpectator: true } };
  }

  get(code: string): Room | undefined { return this.rooms.get(code.toUpperCase()); }

  listPublicRooms(): Room[] { return [...this.rooms.values()]; }

  findBySocket(socketId: string): { room: Room; player: Player } | undefined {
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.socketId === socketId) return { room, player };
      }
    }
    return undefined;
  }

  findChatSession(socketId: string): { room: Room; participant: { id: string; nickname: string } } | undefined {
    const playerSession = this.findBySocket(socketId);
    if (playerSession) return { room: playerSession.room, participant: playerSession.player };
    for (const room of this.rooms.values()) {
      const spectator = [...room.spectators.values()].find((item) => item.socketId === socketId);
      if (spectator) return { room, participant: { id: spectator.id, nickname: `${spectator.nickname} (관전)` } };
    }
    return undefined;
  }

  disconnect(socketId: string): Room | undefined {
    const found = this.findBySocket(socketId);
    if (!found) {
      for (const room of this.rooms.values()) {
        const spectator = [...room.spectators.values()].find((item) => item.socketId === socketId);
        if (spectator) { spectator.socketId = null; return room; }
      }
      return undefined;
    }
    found.player.socketId = null;
    found.player.disconnectedAt = Date.now();
    return found.room;
  }

  setRoleSet(room: Room, requesterId: string, roleSetId: string): void {
    if (room.game.phase !== "LOBBY") throw new Error("로비에서만 직업 세트를 바꿀 수 있습니다.");
    if (room.hostId !== requesterId) throw new Error("방장만 직업 세트를 바꿀 수 있습니다.");
    const roleSet = getRoleSet(roleSetId);
    room.roleSetId = roleSetId;
    room.rankNineRoleId = roleSet.recommendedRankNineRoleId;
    room.rankNineCustomMode = false;
  }

  setRankNine(room: Room, requesterId: string, enabled: boolean, roleId: string, customMode: boolean): void {
    if (room.game.phase !== "LOBBY") throw new Error("로비에서만 9번 직업 모드를 바꿀 수 있습니다.");
    if (room.hostId !== requesterId) throw new Error("방장만 9번 직업 모드를 바꿀 수 있습니다.");
    const recommendedRoleId = getRoleSet(room.roleSetId).recommendedRankNineRoleId;
    if (!customMode && roleId !== recommendedRoleId) throw new Error("권장 조합에서는 세트에 연결된 9번 직업만 사용할 수 있습니다.");
    const selectedRoleId = customMode ? roleId : recommendedRoleId;
    getRankNineRole(selectedRoleId);
    const playerCount = room.players.size;
    if ([3, 8].includes(playerCount) && !enabled) throw new Error(`${playerCount}인 게임에서는 9번 직업을 끌 수 없습니다.`);
    if ([3, 4].includes(playerCount) && enabled && selectedRoleId === "queen") {
      throw new Error(`${playerCount}인 게임에서는 여왕을 9번 직업으로 사용할 수 없습니다.`);
    }
    room.rankNineEnabled = enabled;
    room.rankNineRoleId = selectedRoleId;
    room.rankNineCustomMode = customMode;
  }

  restart(room: Room, requesterId: string): void {
    if (room.game.phase !== GamePhase.GAME_END) throw new Error("게임이 끝난 뒤에만 재대결을 시작할 수 있습니다.");
    if (room.hostId !== requesterId) throw new Error("방장만 재대결을 시작할 수 있습니다.");
    for (const player of room.players.values()) {
      player.isReady = false;
      player.gold = 0;
      player.hand = [];
      player.city = [];
    }
    room.game = this.engine.createInitialState();
  }

  sendChat(room: Room, participantInput: string | { id: string; nickname: string }, messageInput: string): ChatMessage {
    const participant = typeof participantInput === "string" ? room.players.get(participantInput) : participantInput;
    if (!participant) throw new Error("방 참가자만 채팅을 보낼 수 있습니다.");
    const message = messageInput.trim().replace(/\s+/g, " ");
    if (!message) throw new Error("채팅 내용을 입력해 주세요.");
    if (message.length > 300) throw new Error("채팅은 300자 이하로 입력해 주세요.");
    const chat: ChatMessage = { id: room.nextChatId++, playerId: participant.id, nickname: participant.nickname, message, sentAt: Date.now() };
    room.chat.push(chat);
    if (room.chat.length > 100) room.chat.splice(0, room.chat.length - 100);
    return chat;
  }

  toPublic(room: Room): PublicRoomState {
    return {
      code: room.code,
      name: room.name,
      roleSetId: room.roleSetId,
      roleSets: getRoleSetSummaries(),
      rankNineEnabled: room.rankNineEnabled,
      rankNineRoleId: room.rankNineRoleId,
      rankNineCustomMode: room.rankNineCustomMode,
      rankNineRoles: getRankNineSummaries(),
      players: [...room.players.values()].map((player, index) => ({
        id: player.id,
        nickname: player.nickname,
        isHost: player.id === room.hostId,
        isReady: player.isReady,
        isConnected: player.socketId !== null,
        hasCrown: player.id === room.crownHolderId,
        seatNumber: index + 1,
        gold: player.gold,
        handCount: player.hand.length,
        city: player.city
      })),
      spectators: [...room.spectators.values()].map((spectator) => ({ id: spectator.id, nickname: spectator.nickname, isConnected: spectator.socketId !== null })),
      chat: room.chat,
      game: this.engine.toPublicState(room)
    };
  }

  private newPlayer(nicknameInput: string, socketId: string): Player {
    const nickname = nicknameInput.trim().slice(0, 16);
    if (nickname.length < 2) throw new Error("닉네임은 2자 이상 입력해 주세요.");
    return {
      id: randomUUID(), token: randomBytes(24).toString("hex"), nickname, socketId,
      isReady: false, joinedAt: Date.now(), disconnectedAt: null,
      gold: 0, hand: [], city: []
    };
  }

  private session(room: Room, player: Player): SessionData {
    return { roomCode: room.code, playerId: player.id, playerToken: player.token };
  }

  private uniqueCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    do {
      let code = "";
      for (let index = 0; index < 6; index += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
      if (!this.rooms.has(code)) return code;
    } while (true);
  }
}
