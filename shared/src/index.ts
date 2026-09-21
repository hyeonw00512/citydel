export enum GamePhase {
  LOBBY = "LOBBY",
  ROLE_SETUP = "ROLE_SETUP",
  ROLE_SELECTION = "ROLE_SELECTION",
  TURN_START = "TURN_START",
  INCOME = "INCOME",
  ACTION = "ACTION",
  BUILD = "BUILD",
  TURN_END = "TURN_END",
  ROUND_END = "ROUND_END",
  GAME_END = "GAME_END"
}

export interface RoleDefinition {
  id: string;
  name: string;
  rank: number;
  description: string;
  color: string;
  abilityType: "NONE" | "COLOR_INCOME" | "ARCHITECT_DRAW" | "ASSASSINATE" | "STEAL_GOLD" | "MAGICIAN" | "PASSIVE_TAX" | "WARLORD" | "SCHOLAR_DRAW" | "ARTIST" | "SPY_COLOR" | "SEER_SWAP" | "WIZARD_BORROW" | "MAGISTRATE_THREAT" | "QUEEN_ADJACENT" | "WITCH_CONTROL" | "EMPEROR_CROWN";
  incomeColor?: DistrictColor;
  abilityLabel: string;
}

export type DistrictColor = "NOBLE" | "RELIGIOUS" | "TRADE" | "MILITARY" | "UNIQUE";

export interface DistrictCard {
  instanceId: string;
  definitionId: string;
  name: string;
  cost: number;
  color: DistrictColor;
  description: string;
  unique: boolean;
  decorationBonus?: number;
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  isAiControlled: boolean;
  hasCrown: boolean;
  seatNumber: number;
  gold: number;
  handCount: number;
  city: DistrictCard[];
}

export interface PublicGameState {
  phase: GamePhase;
  round: number;
  currentPlayerId: string | null;
  currentRoleRank: number | null;
  selectionPlayerId: string | null;
  selectedCount: number;
  totalSelections: number;
  faceUpDiscardedRoles: RoleDefinition[];
  deckCount: number;
  logs: GameLogEntry[];
  finalScores: FinalScore[];
}

export interface FinalScore {
  playerId: string;
  nickname: string;
  districtPoints: number;
  decorationPoints: number;
  specialDistrictPoints: number;
  colorBonus: number;
  completionBonus: number;
  total: number;
}

export interface GameLogEntry {
  id: number;
  round: number;
  message: string;
}

export interface PublicRoomState {
  code: string;
  name: string;
  roleSetId: string;
  roleSets: RoleSetSummary[];
  rankNineEnabled: boolean;
  rankNineRoleId: string;
  rankNineCustomMode: boolean;
  rankNineRoles: RankNineRoleSummary[];
  players: PublicPlayer[];
  spectators: Array<{ id: string; nickname: string; isConnected: boolean }>;
  chat: ChatMessage[];
  game: PublicGameState;
}

export interface ChatMessage {
  id: number;
  playerId: string;
  nickname: string;
  message: string;
  sentAt: number;
}

export interface RoleSetSummary {
  id: string;
  name: string;
  description: string;
  recommendedRankNineRoleId: string;
  roles: Array<{ rank: number; name: string }>;
}

export interface RankNineRoleSummary {
  id: string;
  name: string;
  description: string;
}

export interface PrivatePlayerState {
  playerId: string;
  playerToken: string;
  selectedRole: RoleDefinition | null;
  selectedRoles: RoleDefinition[];
  roleChoices: RoleDefinition[];
  canSelectRole: boolean;
  rolePairChoices: RoleDefinition[];
  canChooseRolePair: boolean;
  roleDiscardChoices: RoleDefinition[];
  canDiscardRole: boolean;
  gold: number;
  hand: DistrictCard[];
  incomeChoices: DistrictCard[];
  incomeSelectionsRemaining: number;
  scholarChoices: DistrictCard[];
  graveyardRecoveryCard: DistrictCard | null;
  graveyardRecoveryPending: boolean;
  canTakeIncome: boolean;
  canBuild: boolean;
  canUseAbility: boolean;
  canUseDistrictAbility: boolean;
  abilityTargets: RoleDefinition[];
  abilityUsed: boolean;
  buildsRemaining: number;
}

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface JoinPayload {
  roomCode: string;
  nickname: string;
  playerToken?: string;
}

export interface SessionData {
  roomCode: string;
  playerId: string;
  playerToken: string;
  isSpectator?: boolean;
  nickname?: string;
}

export interface ClientToServerEvents {
  "room:create": (nickname: string, callback: (result: ActionResult<SessionData>) => void) => void;
  "room:join": (payload: JoinPayload, callback: (result: ActionResult<SessionData>) => void) => void;
  "room:spectate": (payload: JoinPayload, callback: (result: ActionResult<SessionData>) => void) => void;
  "room:leave": (callback: (result: ActionResult) => void) => void;
  "platform:join": (payload: { joinToken: string }, callback: (result: ActionResult<SessionData>) => void) => void;
  "room:ready": (ready: boolean, callback: (result: ActionResult) => void) => void;
  "room:role-set": (roleSetId: string, callback: (result: ActionResult) => void) => void;
  "room:rank-nine": (payload: { enabled: boolean; roleId: string; customMode: boolean }, callback: (result: ActionResult) => void) => void;
  "game:start": (callback: (result: ActionResult) => void) => void;
  "game:rematch": (callback: (result: ActionResult) => void) => void;
  "role:select": (roleId: string, callback: (result: ActionResult) => void) => void;
  "role:choose-pair": (payload: { roleId: string; discardRoleId: string }, callback: (result: ActionResult) => void) => void;
  "role:discard": (roleId: string, callback: (result: ActionResult) => void) => void;
  "income:take": (type: "GOLD" | "CARDS", callback: (result: ActionResult) => void) => void;
  "income:choose": (cardInstanceId: string, callback: (result: ActionResult) => void) => void;
  "district:build": (cardInstanceId: string, callback: (result: ActionResult) => void) => void;
  "district:ability": (payload: { type: "SMITHY" } | { type: "LABORATORY"; cardInstanceId: string }, callback: (result: ActionResult) => void) => void;
  "ability:use": (targetRoleId: string | undefined, callback: (result: ActionResult) => void) => void;
  "ability:color-income": (color: DistrictColor, callback: (result: ActionResult) => void) => void;
  "ability:magician": (payload: { type: "SWAP"; targetPlayerId: string } | { type: "REDRAW" }, callback: (result: ActionResult) => void) => void;
  "ability:warlord": (payload: { targetPlayerId: string; districtInstanceId: string }, callback: (result: ActionResult) => void) => void;
  "ability:scholar": (callback: (result: ActionResult) => void) => void;
  "ability:artist": (districtInstanceId: string, callback: (result: ActionResult) => void) => void;
  "ability:spy": (color: DistrictColor, callback: (result: ActionResult) => void) => void;
  "ability:seer": (payload: { firstPlayerId: string; secondPlayerId: string }, callback: (result: ActionResult) => void) => void;
  "ability:wizard": (targetPlayerId: string, callback: (result: ActionResult) => void) => void;
  "ability:magistrate": (targetPlayerId: string, callback: (result: ActionResult) => void) => void;
  "ability:emperor": (targetPlayerId: string, callback: (result: ActionResult) => void) => void;
  "scholar:choose": (cardInstanceId: string, callback: (result: ActionResult) => void) => void;
  "graveyard:recover": (recover: boolean, callback: (result: ActionResult) => void) => void;
  "action:skip": (callback: (result: ActionResult) => void) => void;
  "turn:end": (callback: (result: ActionResult) => void) => void;
  "chat:send": (message: string, callback: (result: ActionResult) => void) => void;
}

export interface ServerToClientEvents {
  "room:state": (state: PublicRoomState) => void;
  "player:private": (state: PrivatePlayerState) => void;
  "game:error": (message: string) => void;
  "chat:message": (message: ChatMessage) => void;
}
