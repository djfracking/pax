import type { LegalActionChoice } from "./actions.js";
import type { Coalition, Region } from "./cards.js";

export type PlayerId = string;
export type CardId = string;

export interface PlayerState {
  id: PlayerId;
  name: string;
  hand: CardId[];
  court: CardId[];
  coalition: Coalition;
  loyalty: number;
  rupees: number;
  victoryPoints: number;
  influence: Record<Exclude<Coalition, "none">, number>;
  courtCardSpies: Record<CardId, Record<PlayerId, number>>;
  giftsCylinders: number;
}

export interface RegionState {
  id: Region;
  armies: {
    afghan: number;
    british: number;
    russian: number;
  };
  roads: {
    afghan: number;
    british: number;
    russian: number;
  };
  tribesByPlayer: Record<PlayerId, number>;
}

export interface GameState {
  gameId: string;
  seed: number;
  phase: "faction_draft" | "main";
  turn: number;
  actionPointsRemaining: number;
  currentPlayerId: PlayerId;
  players: PlayerState[];
  marketRows: CardId[][];
  deck: CardId[];
  board: RegionState[];
  deckCount: number;
  dominanceChecksRemaining: number;
  lastDominanceResult: {
    dominantCoalition: Exclude<Coalition, "none"> | null;
    coalitionStrength: Record<Exclude<Coalition, "none">, number>;
    awardedVictoryPoints: Record<PlayerId, number>;
  } | null;
  discard: CardId[];
  isFinished: boolean;
  winnerPlayerId: PlayerId | null;
  usedCardThisTurn: CardId[];
}

export interface PublicObservation {
  gameId: string;
  phase: "faction_draft" | "main";
  turn: number;
  actionPointsRemaining: number;
  currentPlayerId: PlayerId;
  players: Omit<PlayerState, "hand">[];
  board: RegionState[];
  marketRows: CardId[][];
  deckCount: number;
  dominanceChecksRemaining: number;
  lastDominanceResult: GameState["lastDominanceResult"];
  discardCount: number;
  isFinished: boolean;
}

export interface PlayerObservation extends PublicObservation {
  self: {
    id: PlayerId;
    hand: CardId[];
    rupees: number;
    coalition: Coalition;
  };
  legalActions: LegalActionChoice[];
}
