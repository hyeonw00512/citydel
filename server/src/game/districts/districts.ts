import type { DistrictCard, DistrictColor } from "@citadel/shared";

interface DistrictDefinition {
  id: string; name: string; cost: number; color: DistrictColor;
  description: string; unique: boolean; copies: number;
}

const DEFINITIONS: readonly DistrictDefinition[] = [
  { id: "market", name: "시장", cost: 2, color: "TRADE", description: "상인들이 모이는 활기찬 거리입니다.", unique: false, copies: 8 },
  { id: "harbor", name: "항구", cost: 4, color: "TRADE", description: "먼 도시와 교역하는 관문입니다.", unique: false, copies: 5 },
  { id: "chapel", name: "예배당", cost: 1, color: "RELIGIOUS", description: "도시 주민들이 평온을 찾는 곳입니다.", unique: false, copies: 8 },
  { id: "abbey", name: "수도원", cost: 3, color: "RELIGIOUS", description: "오랜 기록과 지혜를 보관합니다.", unique: false, copies: 5 },
  { id: "watch", name: "감시탑", cost: 1, color: "MILITARY", description: "성벽 너머의 위험을 살핍니다.", unique: false, copies: 8 },
  { id: "fort", name: "요새", cost: 3, color: "MILITARY", description: "도시의 주요 길목을 지킵니다.", unique: false, copies: 5 },
  { id: "manor", name: "장원", cost: 3, color: "NOBLE", description: "도시 귀족들의 품격 있는 저택입니다.", unique: false, copies: 8 },
  { id: "palace", name: "궁정", cost: 5, color: "NOBLE", description: "도시의 위엄을 상징합니다.", unique: false, copies: 5 },
  { id: "observatory", name: "별빛 관측소", cost: 4, color: "UNIQUE", description: "카드 수입을 선택하면 카드 3장을 보고, 그중 1장을 손패에 추가합니다.", unique: true, copies: 1 },
  { id: "library", name: "대도서관", cost: 6, color: "UNIQUE", description: "카드 수입을 선택하면 카드 3장을 보고, 그중 2장을 손패에 추가합니다.", unique: true, copies: 1 },
  { id: "smithy", name: "대장간", cost: 5, color: "UNIQUE", description: "턴마다 금화 2개로 설계도 3장을 얻습니다.", unique: true, copies: 1 },
  { id: "laboratory", name: "연구소", cost: 5, color: "UNIQUE", description: "턴마다 손패 1장을 버리고 금화 1개를 얻습니다.", unique: true, copies: 1 },
  { id: "keep", name: "성채", cost: 3, color: "UNIQUE", description: "장군의 파괴 능력으로 파괴할 수 없습니다.", unique: true, copies: 1 },
  { id: "graveyard", name: "묘지", cost: 5, color: "UNIQUE", description: "장군에게 파괴된 다른 건물을 금화 1개로 손으로 회수할 수 있습니다.", unique: true, copies: 1 },
  { id: "great_wall", name: "성벽", cost: 6, color: "UNIQUE", description: "장군이 이 도시의 건물을 파괴하려면 추가 금화 1개를 냅니다.", unique: true, copies: 1 },
  { id: "school_of_magic", name: "마법 학교", cost: 6, color: "UNIQUE", description: "색상 수입을 받을 때 원하는 색의 건물로 취급합니다.", unique: true, copies: 1 },
  { id: "map_room", name: "지도실", cost: 5, color: "UNIQUE", description: "게임 종료 시 손패 카드 한 장당 추가 1점을 얻습니다.", unique: true, copies: 1 },
  { id: "imperial_treasury", name: "황제의 보물고", cost: 5, color: "UNIQUE", description: "게임 종료 시 보유 금화 3개당 추가 1점을 얻습니다.", unique: true, copies: 1 },
  { id: "haunted_city", name: "유령 도시", cost: 2, color: "UNIQUE", description: "게임 종료 시 색상 완성 보너스를 계산할 때 원하는 색으로 취급합니다.", unique: true, copies: 1 },
  { id: "university", name: "대학", cost: 6, color: "UNIQUE", description: "게임 종료 시 추가 2점을 얻습니다.", unique: true, copies: 1 },
  { id: "dragon_gate", name: "용의 관문", cost: 6, color: "UNIQUE", description: "게임 종료 시 추가 2점을 얻습니다.", unique: true, copies: 1 },
  { id: "garden", name: "공중 정원", cost: 5, color: "UNIQUE", description: "성벽 위에 조성된 경이로운 정원입니다.", unique: true, copies: 1 }
];

export function createDistrictCards(): DistrictCard[] {
  return DEFINITIONS.flatMap((definition) => Array.from({ length: definition.copies }, (_, index) => ({
    instanceId: `${definition.id}-${index + 1}`,
    definitionId: definition.id,
    name: definition.name,
    cost: definition.cost,
    color: definition.color,
    description: definition.description,
    unique: definition.unique
  })));
}
