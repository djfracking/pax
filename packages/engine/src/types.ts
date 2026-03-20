import type { LegalActionChoice } from "./actions.js";
import type { Coalition } from "./cards.js";

export type PlayerId = string;

export interface PlayerState {
  id: PlayerId;
  name: string;
  hand: string[];
  court: string[];
  coalition: Coalition;
  loyalty: number;
  rupees: number;
  victoryPoints: number;
}

export interface RegionState {
  id: string;
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
  marketRows: string[][];
  deck: string[];
  board: RegionState[];
  deckCount: number;
  dominanceChecksRemaining: number;
  lastDominanceResult: {
    dominantCoalition: Exclude<Coalition, "none"> | null;
    coalitionStrength: Record<Exclude<Coalition, "none">, number>;
    awardedVictoryPoints: Record<PlayerId, number>;
  } | null;
  discard: string[];
  isFinished: boolean;
  winnerPlayerId: PlayerId | null;
}

export interface PublicObservation {
  gameId: string;
  phase: "faction_draft" | "main";
  turn: number;
  actionPointsRemaining: number;
  currentPlayerId: PlayerId;
  players: Omit<PlayerState, "hand">[];
  board: RegionState[];
  marketRows: string[][];
  deckCount: number;
  dominanceChecksRemaining: number;
  lastDominanceResult: GameState["lastDominanceResult"];
  discardCount: number;
  isFinished: boolean;
}

export interface PlayerObservation extends PublicObservation {
  self: {
    id: PlayerId;
    hand: string[];
    rupees: number;
    coalition: Coalition;
  };
  legalActions: LegalActionChoice[];
}
