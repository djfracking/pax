import type { GameAction, LegalActionChoice } from "./actions.js";
import { CARD_LIBRARY, validateCardLibrary, type Coalition } from "./cards.js";
import type { GameState, PlayerId, PlayerObservation, PublicObservation, RegionState } from "./types.js";

export function createInitialState(
  gameId: string,
  playerIds: PlayerId[],
  seed = Date.now()
): GameState {
  if (playerIds.length < 2) {
    throw new Error("At least two players are required.");
  }

  const deck = shuffle(
    CARD_LIBRARY.map((card) => card.id),
    seed
  );
  const players = playerIds.map((id, index) => {
    return {
      id,
      name: `Player ${index + 1}`,
      hand: [],
      court: [],
      coalition: "none" as Coalition,
      loyalty: 0,
      rupees: 4,
      victoryPoints: 0
    };
  });
  const marketRows = createInitialMarketRows(deck);

  return {
    gameId,
    seed,
    phase: "faction_draft",
    turn: 0,
    actionPointsRemaining: 0,
    currentPlayerId: playerIds[0],
    players,
    marketRows,
    deck,
    board: createInitialBoard(playerIds),
    deckCount: deck.length,
    dominanceChecksRemaining: 4,
    lastDominanceResult: null,
    discard: [],
    isFinished: false,
    winnerPlayerId: null
  };
}

const CARD_BY_ID = new Map(CARD_LIBRARY.map((card) => [card.id, card]));
const cardValidationErrors = validateCardLibrary(CARD_LIBRARY);
if (cardValidationErrors.length > 0) {
  throw new Error(`Invalid card library: ${cardValidationErrors.join("; ")}`);
}

function createInitialBoard(playerIds: PlayerId[]): RegionState[] {
  const regions = ["kabul", "kandahar", "punjab", "herat", "persia", "transcaspia"];
  return regions.map((region) => ({
    id: region,
    armies: { afghan: 1, british: 1, russian: 1 },
    roads: { afghan: 0, british: 0, russian: 0 },
    tribesByPlayer: Object.fromEntries(playerIds.map((id) => [id, 0]))
  }));
}

function drawCard(deck: string[]): string | undefined {
  return deck.shift();
}

function shuffle(cards: string[], seed: number): string[] {
  const result = [...cards];
  let value = seed >>> 0;
  for (let i = result.length - 1; i > 0; i -= 1) {
    value = (1664525 * value + 1013904223) >>> 0;
    const j = value % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createInitialMarketRows(deck: string[]): string[][] {
  return [fillMarketRow(deck), fillMarketRow(deck)];
}

function fillMarketRow(deck: string[]): string[] {
  const row: string[] = [];
  while (row.length < 5) {
    const next = drawCard(deck);
    if (!next) {
      break;
    }
    row.push(next);
  }
  return row;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand], court: [...p.court] })),
    marketRows: state.marketRows.map((row) => [...row]),
    deck: [...state.deck],
    board: state.board.map((r) => ({
      ...r,
      armies: { ...r.armies },
      roads: { ...r.roads },
      tribesByPlayer: { ...r.tribesByPlayer }
    })),
    discard: [...state.discard]
  };
}

function getBuyCardCost(column: number): number {
  return column;
}

function refillMarket(state: GameState): void {
  for (const row of state.marketRows) {
    while (row.length < 5) {
      const nextCard = drawCard(state.deck);
      if (!nextCard) {
        break;
      }
      row.push(nextCard);
    }
  }
  state.deckCount = state.deck.length;
}

function spendActionPointOrAdvanceTurn(state: GameState): void {
  state.actionPointsRemaining -= 1;
  if (state.actionPointsRemaining <= 0) {
    advanceTurn(state);
  }
}

function advanceTurn(state: GameState): void {
  const currentIndex = state.players.findIndex((p) => p.id === state.currentPlayerId);
  const nextIndex = (currentIndex + 1) % state.players.length;
  state.currentPlayerId = state.players[nextIndex].id;
  state.turn += 1;
  state.actionPointsRemaining = 2;
}

export function getLegalActions(state: GameState, playerId: PlayerId): GameAction[] {
  return getLegalActionChoices(state, playerId).map((choice) => choice.action);
}

export function getLegalActionChoices(state: GameState, playerId: PlayerId): LegalActionChoice[] {
  if (state.isFinished || state.currentPlayerId !== playerId) {
    return [];
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    return [];
  }

  const actions: LegalActionChoice[] = [];
  if (state.phase === "faction_draft") {
    for (const coalition of ["russian", "british", "afghan"] as const) {
      actions.push({
        id: `choose-${coalition}`,
        label: `Choose faction: ${coalition}`,
        action: { type: "choose_faction", playerId, coalition }
      });
    }
    return actions;
  }

  for (let row = 0; row < state.marketRows.length; row += 1) {
    const cards = state.marketRows[row];
    for (let column = 0; column < cards.length; column += 1) {
      const cardId = cards[column];
      const card = CARD_BY_ID.get(cardId);
      const cost = getBuyCardCost(column);
      if (player.rupees < cost) {
        continue;
      }
      actions.push({
        id: `buy-${row}-${column}-${cardId}`,
        label: `Buy ${card?.name ?? cardId} from row ${row + 1}, slot ${column + 1} (cost ${cost})`,
        action: { type: "buy_card", playerId, row, column }
      });
    }
  }

  for (const cardId of player.hand) {
    const card = CARD_BY_ID.get(cardId);
    actions.push({
      id: `play-${cardId}`,
      label: `Play ${card?.name ?? cardId} to court`,
      action: { type: "play_card", playerId, cardId }
    });
  }

  if (player.coalition !== "none") {
    for (const region of state.board) {
      actions.push({
        id: `build-army-${region.id}`,
        label: `Build 1 ${player.coalition} army in ${region.id} (cost 1)`,
        action: { type: "build_army", playerId, regionId: region.id }
      });
      actions.push({
        id: `build-road-${region.id}`,
        label: `Build 1 ${player.coalition} road in ${region.id} (cost 1)`,
        action: { type: "build_road", playerId, regionId: region.id }
      });
    }
    actions.push({
      id: "gain-loyalty",
      label: `Gain 1 loyalty with ${player.coalition}`,
      action: { type: "gain_loyalty", playerId }
    });
  }
  actions.push({
    id: "dominance-check",
    label: "Perform dominance check",
    action: { type: "perform_dominance_check", playerId }
  });
  actions.push({
    id: "take-rupee",
    label: "Take 1 rupee",
    action: { type: "take_rupee", playerId }
  });
  actions.push({
    id: "pass",
    label: "End turn",
    action: { type: "pass", playerId }
  });

  return actions;
}

export function applyAction(state: GameState, action: GameAction): GameState {
  const legal = getLegalActions(state, action.playerId).some((candidate) =>
    isActionEqual(candidate, action)
  );
  if (!legal) {
    throw new Error(`Illegal action: ${action.type}`);
  }

  const nextState = cloneState(state);
  const player = nextState.players.find((p) => p.id === action.playerId);
  if (!player) {
    throw new Error("Player not found.");
  }

  if (action.type === "buy_card") {
    const row = nextState.marketRows[action.row];
    if (!row) {
      throw new Error("Invalid market row.");
    }
    const [card] = row.splice(action.column, 1);
    if (!card) {
      throw new Error("Invalid market slot.");
    }
    const cost = getBuyCardCost(action.column);
    player.rupees -= cost;
    player.hand.push(card);
    refillMarket(nextState);
    spendActionPointOrAdvanceTurn(nextState);
  } else if (action.type === "play_card") {
    const idx = player.hand.indexOf(action.cardId);
    if (idx < 0) {
      throw new Error("Card not in hand.");
    }
    player.hand.splice(idx, 1);
    player.court.push(action.cardId);
    spendActionPointOrAdvanceTurn(nextState);
  } else if (action.type === "take_rupee") {
    player.rupees += 1;
    spendActionPointOrAdvanceTurn(nextState);
  } else if (action.type === "build_army") {
    if (player.coalition === "none") {
      throw new Error("Choose a faction before building coalition pieces.");
    }
    if (player.rupees < 1) {
      throw new Error("Not enough rupees to build army.");
    }
    const region = nextState.board.find((r) => r.id === action.regionId);
    if (!region) {
      throw new Error("Invalid region.");
    }
    player.rupees -= 1;
    region.armies[player.coalition] += 1;
    spendActionPointOrAdvanceTurn(nextState);
  } else if (action.type === "build_road") {
    if (player.coalition === "none") {
      throw new Error("Choose a faction before building coalition pieces.");
    }
    if (player.rupees < 1) {
      throw new Error("Not enough rupees to build road.");
    }
    const region = nextState.board.find((r) => r.id === action.regionId);
    if (!region) {
      throw new Error("Invalid region.");
    }
    player.rupees -= 1;
    region.roads[player.coalition] += 1;
    spendActionPointOrAdvanceTurn(nextState);
  } else if (action.type === "gain_loyalty") {
    if (player.coalition === "none") {
      throw new Error("Choose a faction before gaining loyalty.");
    }
    player.loyalty += 1;
    spendActionPointOrAdvanceTurn(nextState);
  } else if (action.type === "pass") {
    advanceTurn(nextState);
  } else if (action.type === "choose_faction") {
    if (nextState.phase !== "faction_draft") {
      throw new Error("Faction selection is only allowed during draft.");
    }
    player.coalition = action.coalition;
    player.loyalty = 1;
    const nextPlayer = nextState.players.find((p) => p.coalition === "none");
    if (nextPlayer) {
      nextState.currentPlayerId = nextPlayer.id;
    } else {
      nextState.phase = "main";
      nextState.turn = 1;
      nextState.actionPointsRemaining = 2;
      nextState.currentPlayerId = nextState.players[0].id;
    }
  } else if (action.type === "perform_dominance_check") {
    if (nextState.phase !== "main") {
      throw new Error("Dominance check is only allowed in main phase.");
    }
    if (nextState.dominanceChecksRemaining <= 0) {
      throw new Error("No dominance checks remaining.");
    }
    const result = resolveDominanceCheck(nextState);
    nextState.lastDominanceResult = result;
    nextState.dominanceChecksRemaining -= 1;
    for (const playerState of nextState.players) {
      playerState.victoryPoints += result.awardedVictoryPoints[playerState.id] ?? 0;
    }
    spendActionPointOrAdvanceTurn(nextState);
  }

  nextState.deckCount = nextState.deck.length;
  return nextState;
}

function isActionEqual(a: GameAction, b: GameAction): boolean {
  if (a.type !== b.type || a.playerId !== b.playerId) {
    return false;
  }
  if (a.type === "buy_card" && b.type === "buy_card") {
    return a.row === b.row && a.column === b.column;
  }
  if (a.type === "play_card" && b.type === "play_card") {
    return a.cardId === b.cardId;
  }
  if (a.type === "choose_faction" && b.type === "choose_faction") {
    return a.coalition === b.coalition;
  }
  if (a.type === "perform_dominance_check" && b.type === "perform_dominance_check") {
    return true;
  }
  if (a.type === "build_army" && b.type === "build_army") {
    return a.regionId === b.regionId;
  }
  if (a.type === "build_road" && b.type === "build_road") {
    return a.regionId === b.regionId;
  }
  if (a.type === "gain_loyalty" && b.type === "gain_loyalty") {
    return true;
  }
  return true;
}

function resolveDominanceCheck(state: GameState): NonNullable<GameState["lastDominanceResult"]> {
  const coalitionStrength = {
    afghan: 0,
    british: 0,
    russian: 0
  };
  for (const region of state.board) {
    coalitionStrength.afghan += region.armies.afghan + region.roads.afghan;
    coalitionStrength.british += region.armies.british + region.roads.british;
    coalitionStrength.russian += region.armies.russian + region.roads.russian;
  }

  const entries = Object.entries(coalitionStrength) as Array<
    [Exclude<Coalition, "none">, number]
  >;
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const second = sorted[1];
  const dominantCoalition = top[1] > second[1] ? top[0] : null;

  const awardedVictoryPoints: Record<PlayerId, number> = {};
  if (!dominantCoalition) {
    return { dominantCoalition: null, coalitionStrength, awardedVictoryPoints };
  }

  const supporters = state.players
    .filter((p) => p.coalition === dominantCoalition)
    .sort((a, b) => b.loyalty - a.loyalty || b.victoryPoints - a.victoryPoints);
  const rewardTrack = [5, 3, 1];
  supporters.forEach((supporter, index) => {
    const points = rewardTrack[index] ?? 0;
    if (points > 0) {
      awardedVictoryPoints[supporter.id] = points;
    }
  });

  return { dominantCoalition, coalitionStrength, awardedVictoryPoints };
}

export function toPublicObservation(state: GameState): PublicObservation {
  return {
    gameId: state.gameId,
    phase: state.phase,
    turn: state.turn,
    actionPointsRemaining: state.actionPointsRemaining,
    currentPlayerId: state.currentPlayerId,
    players: state.players.map(({ hand, ...publicPlayer }) => publicPlayer),
    board: state.board.map((region) => ({
      ...region,
      armies: { ...region.armies },
      roads: { ...region.roads },
      tribesByPlayer: { ...region.tribesByPlayer }
    })),
    marketRows: state.marketRows.map((row) => [...row]),
    deckCount: state.deckCount,
    dominanceChecksRemaining: state.dominanceChecksRemaining,
    lastDominanceResult: state.lastDominanceResult
      ? {
          dominantCoalition: state.lastDominanceResult.dominantCoalition,
          coalitionStrength: { ...state.lastDominanceResult.coalitionStrength },
          awardedVictoryPoints: { ...state.lastDominanceResult.awardedVictoryPoints }
        }
      : null,
    discardCount: state.discard.length,
    isFinished: state.isFinished
  };
}

export function toPlayerObservation(state: GameState, playerId: PlayerId): PlayerObservation {
  const self = state.players.find((p) => p.id === playerId);
  if (!self) {
    throw new Error("Player not found.");
  }
  return {
    ...toPublicObservation(state),
    self: {
      id: self.id,
      hand: [...self.hand],
      rupees: self.rupees,
      coalition: self.coalition
    },
    legalActions: getLegalActionChoices(state, playerId)
  };
}
