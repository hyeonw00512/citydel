import type { RankNineRoleSummary, RoleDefinition, RoleSetSummary } from "@citadel/shared";

export interface RoleSetDefinition extends Omit<RoleSetSummary, "roles"> { roles: RoleDefinition[]; }

const none = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "NONE", abilityLabel: "이 능력은 다음 개발 단계에서 활성화됩니다."
});
const income = (id: string, name: string, rank: number, description: string, color: string, incomeColor: NonNullable<RoleDefinition["incomeColor"]>): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "COLOR_INCOME", incomeColor, abilityLabel: `${name} 수입 받기`
});
const architect = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "ARCHITECT_DRAW", abilityLabel: "설계 도면 2장 받기"
});
const targeted = (id: string, name: string, rank: number, description: string, color: string, abilityType: "ASSASSINATE" | "STEAL_GOLD", abilityLabel: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType, abilityLabel
});
const magician = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "MAGICIAN", abilityLabel: "손패 교환 또는 다시 뽑기"
});
const passiveTax = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "PASSIVE_TAX", abilityLabel: "다른 플레이어의 건설 세금 징수"
});
const warlord = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "WARLORD", incomeColor: "MILITARY", abilityLabel: "군사 수입과 건물 파괴"
});
const scholar = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "SCHOLAR_DRAW", abilityLabel: "설계도 5장 중 1장 연구"
});
const artist = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "ARTIST", abilityLabel: "도시 건물 하나 장식 (+2점)"
});
const spy = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "SPY_COLOR", abilityLabel: "정찰할 도시 색상 지정"
});
const seer = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "SEER_SWAP", abilityLabel: "두 플레이어의 손패 흐름 바꾸기"
});
const wizard = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "WIZARD_BORROW", abilityLabel: "다른 손패에서 설계도 1장 가져오기"
});
const magistrate = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "MAGISTRATE_THREAT", abilityLabel: "다음 건설에 위협 표식 배치"
});
const queen = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "QUEEN_ADJACENT", abilityLabel: "4번 역할 인접 보상 받기"
});
const witch = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "WITCH_CONTROL", abilityLabel: "위임받을 역할 지정"
});
const emperor = (id: string, name: string, rank: number, description: string, color: string): RoleDefinition => ({
  id, name, rank, description, color, abilityType: "EMPEROR_CROWN", incomeColor: "NOBLE", abilityLabel: "왕관 이전과 자원 받기"
});

export const RANK_NINE_ROLES: readonly RoleDefinition[] = [
  queen("queen", "여왕", 9, "원형 좌석에서 4번 역할 플레이어와 이웃하면 금화 3개를 얻습니다.", "#db2777"),
  artist("artist", "예술가", 9, "자신의 도시에서 건물 하나를 장식해 최종 가치에 2점을 더합니다.", "#9333ea"),
  passiveTax("tax_collector", "세금징수관", 9, "다른 플레이어가 건물을 지을 때마다 금화 1개를 받습니다.", "#059669")
];

export const ROLE_SETS: readonly RoleSetDefinition[] = [
  { id: "CLASSIC", name: "기본 직업 세트", description: "처음 플레이하기 좋은 정석 구성입니다.", recommendedRankNineRoleId: "queen", roles: [
    targeted("assassin", "암살자", 1, "비밀리에 대상 역할을 지목해 이번 라운드 행동을 막습니다.", "#64748b", "ASSASSINATE", "봉쇄할 역할 지정"),
    targeted("thief", "도둑", 2, "비밀리에 대상 역할을 지목해 해당 플레이어의 금화를 가져옵니다.", "#16a34a", "STEAL_GOLD", "노릴 역할 지정"),
    magician("magician", "마술사", 3, "다른 플레이어와 손패를 교환하거나 새 카드로 바꿉니다.", "#7c3aed"),
    income("king", "왕", 4, "턴을 시작하면 왕관을 가져옵니다. 이후 귀족 건물마다 금화 1개를 얻습니다.", "#ca8a04", "NOBLE"),
    income("bishop", "주교", 5, "신앙 건물에서 수입을 얻습니다.", "#2563eb", "RELIGIOUS"),
    income("merchant", "상인", 6, "상업 건물에서 수입을 얻습니다.", "#0891b2", "TRADE"),
    architect("architect", "건축가", 7, "카드 2장을 받고 최대 3채를 건설합니다.", "#ea580c"),
    warlord("warlord", "장군", 8, "군사 건물 수입을 얻고, 비용보다 1 적은 금화로 다른 도시의 건물을 파괴합니다.", "#dc2626")
  ]},
  { id: "DARK_CITY", name: "마녀~외교관 세트", description: "자원 변화와 상호작용이 많은 변형 구성입니다.", recommendedRankNineRoleId: "artist", roles: [
    witch("witch", "마녀", 1, "비밀 역할 하나를 지정해 그 역할의 차례를 자신의 자원과 손패로 진행합니다.", "#475569"),
    spy("spy", "밀정", 2, "도시 색상을 지정해 해당 색상 건물을 가진 다른 플레이어 수만큼 설계도를 얻습니다.", "#15803d"),
    seer("seer", "예언자", 3, "다른 두 플레이어를 지정해 두 사람의 손패를 서로 교환합니다.", "#6d28d9"),
    emperor("emperor", "황제", 4, "왕관을 다른 플레이어에게 넘기고 기존 보유자에게서 금화 또는 무작위 설계도 1장을 받습니다.", "#b7791f"),
    income("bishop", "주교", 5, "신앙 건물에서 수입을 얻습니다.", "#1d4ed8", "RELIGIOUS"),
    income("merchant", "상인", 6, "상업 건물에서 수입을 얻습니다.", "#0e7490", "TRADE"),
    scholar("scholar", "학자", 7, "설계도 5장 중 하나를 연구해 손패에 추가합니다.", "#c2410c"),
    income("diplomat", "외교관", 8, "군사 건물에서 수입을 얻습니다.", "#b91c1c", "MILITARY")
  ]},
  { id: "NEW_COURT", name: "치안판사~육군대장 세트", description: "심리전과 도시 운영을 강조한 새로운 궁정 구성입니다.", recommendedRankNineRoleId: "tax_collector", roles: [
    magistrate("magistrate", "치안판사", 1, "다른 플레이어의 다음 건설에 위협 표식을 배치해 추가 금화 1개를 징수합니다.", "#475569"),
    targeted("thief", "도둑", 2, "비밀리에 대상 역할을 지목해 해당 플레이어의 금화를 가져옵니다.", "#15803d", "STEAL_GOLD", "노릴 역할 지정"),
    wizard("wizard", "마법사", 3, "다른 플레이어를 지정해 그 손패에서 무작위 설계도 1장을 가져옵니다.", "#6d28d9"),
    income("patrician", "귀족", 4, "귀족 건물에서 보상을 얻습니다.", "#b7791f", "NOBLE"),
    income("bishop", "주교", 5, "신앙 건물에서 수입을 얻습니다.", "#1d4ed8", "RELIGIOUS"),
    income("trader", "교역상", 6, "상업 건물에서 수입을 얻습니다.", "#0e7490", "TRADE"),
    architect("architect", "건축가", 7, "카드 2장을 받고 최대 3채를 건설합니다.", "#c2410c"),
    income("marshal", "육군대장", 8, "군사 건물에서 수입을 얻습니다.", "#b91c1c", "MILITARY")
  ]}
];

export function getRoleSet(id: string): RoleSetDefinition {
  const roleSet = ROLE_SETS.find((candidate) => candidate.id === id);
  if (!roleSet) throw new Error("존재하지 않는 직업 세트입니다.");
  return roleSet;
}

export function getRoleSetSummaries(): RoleSetSummary[] {
  return ROLE_SETS.map((set) => ({ id: set.id, name: set.name, description: set.description, recommendedRankNineRoleId: set.recommendedRankNineRoleId, roles: set.roles.map(({ rank, name }) => ({ rank, name })) }));
}

export function getRankNineRole(id: string): RoleDefinition {
  const role = RANK_NINE_ROLES.find((candidate) => candidate.id === id);
  if (!role) throw new Error("존재하지 않는 9번 직업입니다.");
  return role;
}

export function getRankNineSummaries(): RankNineRoleSummary[] {
  return RANK_NINE_ROLES.map(({ id, name, description }) => ({ id, name, description }));
}
