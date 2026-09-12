import type { DistrictCard } from "@citadel/shared";
import { createDistrictCards } from "./districts/districts.js";
import type { Room } from "./types.js";

export class DeckManager {
  setup(room: Room): void {
    room.game.deck = this.shuffle(createDistrictCards());
    room.game.discard = [];
    room.game.pendingIncomeByPlayerId.clear();
    room.game.pendingIncomeSelectionsByPlayerId.clear();
    for (const player of room.players.values()) {
      player.gold = 2;
      player.hand = this.draw(room, 4);
      player.city = [];
    }
  }

  draw(room: Room, count: number): DistrictCard[] {
    const cards: DistrictCard[] = [];
    while (cards.length < count) {
      if (room.game.deck.length === 0 && room.game.discard.length > 0) {
        room.game.deck = this.shuffle(room.game.discard.splice(0));
      }
      const card = room.game.deck.pop();
      if (!card) break;
      cards.push(card);
    }
    return cards;
  }

  offerIncomeCards(room: Room, playerId: string): void {
    const player = room.players.get(playerId)!;
    const hasObservatory = player.city.some((card) => card.definitionId === "observatory");
    const hasLibrary = player.city.some((card) => card.definitionId === "library");
    const count = hasObservatory || hasLibrary ? 3 : 2;
    const cards = this.draw(room, count);
    if (cards.length === 0) throw new Error("덱에 남은 카드가 없습니다. 금화 수입을 선택해 주세요.");
    room.game.pendingIncomeByPlayerId.set(playerId, cards);
    room.game.pendingIncomeSelectionsByPlayerId.set(playerId, hasLibrary ? Math.min(2, cards.length) : 1);
  }

  chooseIncomeCard(room: Room, playerId: string, instanceId: string): boolean {
    const choices = room.game.pendingIncomeByPlayerId.get(playerId) ?? [];
    const chosen = choices.find((card) => card.instanceId === instanceId);
    if (!chosen) throw new Error("선택할 수 없는 카드입니다.");
    room.players.get(playerId)!.hand.push(chosen);
    const remainingChoices = choices.filter((card) => card.instanceId !== instanceId);
    const selectionsRemaining = (room.game.pendingIncomeSelectionsByPlayerId.get(playerId) ?? 1) - 1;
    if (selectionsRemaining > 0 && remainingChoices.length > 0) {
      room.game.pendingIncomeByPlayerId.set(playerId, remainingChoices);
      room.game.pendingIncomeSelectionsByPlayerId.set(playerId, selectionsRemaining);
      return false;
    }
    room.game.discard.push(...remainingChoices);
    room.game.pendingIncomeByPlayerId.delete(playerId);
    room.game.pendingIncomeSelectionsByPlayerId.delete(playerId);
    return true;
  }

  private shuffle<T>(items: T[]): T[] {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [items[index], items[target]] = [items[target], items[index]];
    }
    return items;
  }
}
