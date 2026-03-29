import type { LegalActionChoice } from "./actions.js";
import type { Coalition, Region, Suit } from "./cards.js";

export type PlayerId = string;
export type CardId = string;
export type BorderId = string;

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
  armies: Record<Exclude<Coalition, "none">, number>;
  tribesByPlayer: Record<PlayerId, number>;
}

export interface BorderState {
  id: BorderId;
  regions: [Region, Region];
  roads: Record<Exclude<Coalition, "none">, number>;
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
  borders: BorderState[];
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
  favoredSuit: Suit;
  rupeesOnMarketCards: Record<CardId, number>;
  pendingMove: { cardId: CardId; movesRemaining: number } | null;
  lastDominanceCheckRound: number;
}

export interface PublicObservation {
  gameId: string;
  phase: "faction_draft" | "main";
  turn: number;
  actionPointsRemaining: number;
  currentPlayerId: PlayerId;
  players: Omit<PlayerState, "hand">[];
  board: RegionState[];
  borders: BorderState[];
  marketRows: CardId[][];
  deckCount: number;
  dominanceChecksRemaining: number;
  lastDominanceResult: GameState["lastDominanceResult"];
  discardCount: number;
  isFinished: boolean;
  favoredSuit: Suit;
  rupeesOnMarketCards: Record<CardId, number>;
  pendingMove: GameState["pendingMove"];
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
