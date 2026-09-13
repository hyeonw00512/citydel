import type { FinalScore } from "@citadel/shared";
import type { Room } from "./types.js";

export class ScoreManager {
  calculate(room: Room): FinalScore[] {
    return [...room.players.values()]
      .map((player) => {
        const districtPoints = player.city.reduce((sum, district) => sum + district.cost, 0);
        const decorationPoints = player.city.reduce((sum, district) => sum + (district.decorationBonus ?? 0), 0);
        const fixedSpecialPoints = player.city.filter((district) => ["university", "dragon_gate"].includes(district.definitionId)).length * 2;
        const mapRoomPoints = player.city.some((district) => district.definitionId === "map_room") ? player.hand.length : 0;
        const treasuryPoints = player.city.some((district) => district.definitionId === "imperial_treasury") ? Math.floor(player.gold / 3) : 0;
        const specialDistrictPoints = fixedSpecialPoints + mapRoomPoints + treasuryPoints;
        const colorsWithoutHauntedCity = new Set(player.city
          .filter((district) => district.definitionId !== "haunted_city")
          .map((district) => district.color));
        const hasColorCompletion = new Set(player.city.map((district) => district.color)).size >= 5
          || (player.city.some((district) => district.definitionId === "haunted_city")
            && (["NOBLE", "RELIGIOUS", "TRADE", "MILITARY", "UNIQUE"] as const)
              .some((color) => new Set([...colorsWithoutHauntedCity, color]).size >= 5));
        const colorBonus = hasColorCompletion ? 3 : 0;
        const completionBonus = player.city.length >= 8
          ? player.id === room.game.firstCompletedPlayerId ? 4 : 2
          : 0;
        return { score: {
          playerId: player.id,
          nickname: player.nickname,
          districtPoints,
          colorBonus,
          completionBonus,
          decorationPoints,
          specialDistrictPoints,
          total: districtPoints + decorationPoints + specialDistrictPoints + colorBonus + completionBonus
        }, districtPoints, gold: player.gold };
      })
      .sort((left, right) => right.score.total - left.score.total || right.districtPoints - left.districtPoints || right.gold - left.gold || left.score.nickname.localeCompare(right.score.nickname, "ko"))
      .map(({ score }) => score);
  }
}
