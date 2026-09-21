import type { ChatMessage, DistrictCard, FinalScore, RoleDefinition } from "@citadel/shared";
import { GamePhase } from "@citadel/shared";

export interface Player {
  id: string;
  token: string;
  nickname: string;
  socketId: string | null;
  isReady: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
  aiControlled: boolean;
  gold: number;
  hand: DistrictCard[];
  city: DistrictCard[];
}

export interface InternalGameState {
  phase: GamePhase;
  round: number;
  selectionOrder: string[];
  selectionIndex: number;
  availableRoleIds: string[];
  faceUpDiscardedRoles: RoleDefinition[];
  faceDownDiscardedRoleIds: string[];
  pendingRoleDiscardPlayerId: string | null;
  rolesByPlayerId: Map<string, RoleDefinition[]>;
  turnOrder: Array<{ playerId: string; role: RoleDefinition }>;
  turnIndex: number;
  deck: DistrictCard[];
  discard: DistrictCard[];
  pendingIncomeByPlayerId: Map<string, DistrictCard[]>;
  pendingIncomeSelectionsByPlayerId: Map<string, number>;
  pendingScholarByPlayerId: Map<string, DistrictCard[]>;
  pendingGraveyardRecovery: { playerId: string; card: DistrictCard; expiresAt: number } | null;
  abilityUsed: boolean;
  districtAbilityUsed: boolean;
  assassinatedRoleId: string | null;
  robbedRoleId: string | null;
  magistrateThreatenedPlayerId: string | null;
  witchTargetRoleId: string | null;
  builtThisTurn: number;
  logs: Array<{ id: number; round: number; message: string }>;
  nextLogId: number;
  gameEndTriggered: boolean;
  firstCompletedPlayerId: string | null;
  finalScores: FinalScore[];
}

export interface Room {
  code: string;
  name: string;
  roleSetId: string;
  rankNineEnabled: boolean;
  rankNineRoleId: string;
  rankNineCustomMode: boolean;
  crownHolderId: string;
  hostId: string;
  players: Map<string, Player>;
  spectators: Map<string, { id: string; token: string; nickname: string; socketId: string | null }>;
  chat: ChatMessage[];
  nextChatId: number;
  game: InternalGameState;
}
