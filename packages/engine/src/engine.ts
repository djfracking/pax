import type { GameAction, LegalActionChoice } from "./actions.js";
import { CARD_LIBRARY, validateCardLibrary, areRegionsAdjacent, getAdjacentRegions, type Coalition, type Region } from "./cards.js";
import type { CardId, GameState, PlayerId, PlayerObservation, PlayerState, PublicObservation, RegionState } from "./types.js";

const CARD_BY_ID = new Map(CARD_LIBRARY.map((card) => [card.id, card]));
const cardValidationErrors = validateCardLibrary(CARD_LIBRARY);
if (cardValidationErrors.length > 0) {
  throw new Error(`Invalid card library: ${cardValidationErrors.join("; ")}`);
}

// --- Initialization ---

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
  const players: PlayerState[] = playerIds.map((id, index) => ({
    id,
    name: `Player ${index + 1}`,
    hand: [],
    court: [],
    coalition: "none" as Coalition,
    loyalty: 0,
    rupees: 4,
    victoryPoints: 0,
    influence: { afghan: 0, british: 0, russian: 0 },
    courtCardSpies: {},
    giftsCylinders: 0,
  }));
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
    winnerPlayerId: null,
    usedCardThisTurn: [],
    favoredSuit: "political",
    rupeesOnMarketCards: {},
  };
}

function createInitialBoard(playerIds: PlayerId[]): RegionState[] {
  const regions: Region[] = ["kabul", "kandahar", "punjab", "herat", "persia", "transcaspia"];
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

// --- State Cloning ---

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      hand: [...p.hand],
      court: [...p.court],
      influence: { ...p.influence },
      courtCardSpies: cloneCourtCardSpies(p.courtCardSpies),
    })),
    marketRows: state.marketRows.map((row) => [...row]),
    deck: [...state.deck],
    board: state.board.map((r) => ({
      ...r,
      armies: { ...r.armies },
      roads: { ...r.roads },
      tribesByPlayer: { ...r.tribesByPlayer }
    })),
    discard: [...state.discard],
    usedCardThisTurn: [...state.usedCardThisTurn],
    favoredSuit: state.favoredSuit,
    rupeesOnMarketCards: { ...state.rupeesOnMarketCards },
  };
}

function cloneCourtCardSpies(spies: Record<CardId, Record<PlayerId, number>>): Record<CardId, Record<PlayerId, number>> {
  const result: Record<CardId, Record<PlayerId, number>> = {};
  for (const cardId of Object.keys(spies)) {
    result[cardId] = { ...spies[cardId] };
  }
  return result;
}

// --- Turn Management ---

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
  state.usedCardThisTurn = [];
}

// --- Legal Action Generation ---

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

  // Buy from market
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

  // Play from hand
  for (const cardId of player.hand) {
    const card = CARD_BY_ID.get(cardId);
    actions.push({
      id: `play-${cardId}`,
      label: `Play ${card?.name ?? cardId} to court`,
      action: { type: "play_card", playerId, cardId }
    });
  }

  // Build army/road (requires coalition and rupees >= 2 per PP2e rules)
  if (player.coalition !== "none" && player.rupees >= 2) {
    for (const region of state.board) {
      actions.push({
        id: `build-army-${region.id}`,
        label: `Build 1 ${player.coalition} army in ${region.id} (cost 2)`,
        action: { type: "build_army", playerId, regionId: region.id }
      });
      actions.push({
        id: `build-road-${region.id}`,
        label: `Build 1 ${player.coalition} road in ${region.id} (cost 2)`,
        action: { type: "build_road", playerId, regionId: region.id }
      });
    }
  }

  if (player.coalition !== "none") {
    actions.push({
      id: "gain-loyalty",
      label: `Gain 1 loyalty with ${player.coalition}`,
      action: { type: "gain_loyalty", playerId }
    });
  }

  // Court card actions (each card can only be used once per turn)
  for (const courtCardId of player.court) {
    if (state.usedCardThisTurn.includes(courtCardId)) {
      continue;
    }
    const card = CARD_BY_ID.get(courtCardId);
    if (!card) continue;

    for (const icon of card.actionIcons) {
      if (icon === "tax") {
        actions.push({
          id: `tax-${courtCardId}`,
          label: `Tax using ${card.name} (rank ${card.rank})`,
          action: { type: "tax", playerId, cardId: courtCardId }
        });
      }
      if (icon === "battle") {
        for (const region of state.board) {
          if (hasEnemyPieces(state, player, region)) {
            actions.push({
              id: `battle-${courtCardId}-${region.id}`,
              label: `Battle in ${region.id} using ${card.name}`,
              action: { type: "battle", playerId, cardId: courtCardId, regionId: region.id }
            });
          }
        }
      }
      if (icon === "move") {
        // Move army options
        if (player.coalition !== "none") {
          for (const region of state.board) {
            const armyCount = region.armies[player.coalition];
            if (armyCount > 0) {
              for (const adjRegion of getAdjacentRegions(region.id)) {
                actions.push({
                  id: `move-army-${courtCardId}-${region.id}-${adjRegion}`,
                  label: `Move ${player.coalition} army ${region.id} -> ${adjRegion} using ${card.name}`,
                  action: { type: "move_army", playerId, cardId: courtCardId, fromRegionId: region.id, toRegionId: adjRegion }
                });
              }
            }
          }
        }
        // Move spy options
        for (const otherPlayer of state.players) {
          for (const otherCardId of otherPlayer.court) {
            const spyCount = otherPlayer.courtCardSpies[otherCardId]?.[playerId] ?? 0;
            if (spyCount > 0) {
              for (const targetPlayer of state.players) {
                for (const targetCardId of targetPlayer.court) {
                  if (targetCardId !== otherCardId) {
                    actions.push({
                      id: `move-spy-${courtCardId}-${otherCardId}-${targetCardId}`,
                      label: `Move spy from ${otherCardId} to ${targetCardId} using ${card.name}`,
                      action: { type: "move_spy", playerId, cardId: courtCardId, fromCardId: otherCardId, toCardId: targetCardId }
                    });
                  }
                }
              }
            }
          }
        }
      }
      if (icon === "betray") {
        if (player.rupees >= 2) {
          for (const otherPlayer of state.players) {
            for (const otherCardId of otherPlayer.court) {
              const spyCount = otherPlayer.courtCardSpies[otherCardId]?.[playerId] ?? 0;
              if (spyCount > 0) {
                actions.push({
                  id: `betray-${courtCardId}-${otherCardId}-${otherPlayer.id}`,
                  label: `Betray ${otherCardId} in ${otherPlayer.name}'s court using ${card.name}`,
                  action: { type: "betray", playerId, cardId: courtCardId, targetCardId: otherCardId, targetPlayerId: otherPlayer.id }
                });
              }
            }
          }
        }
      }
    }
  }

  // Gift (costs 2/4/6 rupees for gift slots)
  const nextGiftCost = getNextGiftCost(player);
  if (player.coalition !== "none" && nextGiftCost !== null && player.rupees >= nextGiftCost) {
    actions.push({
      id: "gift",
      label: `Purchase gift for ${player.coalition} (cost ${nextGiftCost})`,
      action: { type: "gift", playerId }
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

function hasEnemyPieces(state: GameState, player: PlayerState, region: RegionState): boolean {
  const coalition = player.coalition;
  if (coalition === "none") return false;
  const coalitions: Array<Exclude<Coalition, "none">> = ["afghan", "british", "russian"];
  for (const c of coalitions) {
    if (c !== coalition && (region.armies[c] > 0 || region.roads[c] > 0)) {
      return true;
    }
  }
  for (const [pid, count] of Object.entries(region.tribesByPlayer)) {
    if (pid !== player.id && count > 0) {
      const otherPlayer = state.players.find((p) => p.id === pid);
      if (otherPlayer && otherPlayer.coalition !== coalition) {
        return true;
      }
    }
  }
  return false;
}

function getNextGiftCost(player: PlayerState): number | null {
  const giftCosts = [2, 4, 6];
  if (player.giftsCylinders >= giftCosts.length) return null;
  return giftCosts[player.giftsCylinders];
}

// --- Action Application ---

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

  switch (action.type) {
    case "buy_card":
      handleBuyCard(nextState, action, player);
      break;
    case "play_card":
      handlePlayCard(nextState, action, player);
      break;
    case "take_rupee":
      handleTakeRupee(nextState, player);
      break;
    case "build_army":
      handleBuildArmy(nextState, action, player);
      break;
    case "build_road":
      handleBuildRoad(nextState, action, player);
      break;
    case "gain_loyalty":
      handleGainLoyalty(nextState, player);
      break;
    case "pass":
      advanceTurn(nextState);
      break;
    case "choose_faction":
      handleChooseFaction(nextState, action, player);
      break;
    case "perform_dominance_check":
      handleDominanceCheck(nextState);
      break;
    case "tax":
      handleTax(nextState, action, player);
      break;
    case "gift":
      handleGift(nextState, player);
      break;
    case "move_army":
      handleMoveArmy(nextState, action, player);
      break;
    case "move_spy":
      handleMoveSpy(nextState, action, player);
      break;
    case "battle":
      handleBattle(nextState, action, player);
      break;
    case "betray":
      handleBetray(nextState, action, player);
      break;
  }

  nextState.deckCount = nextState.deck.length;
  return nextState;
}

// --- Action Handlers ---

function handleBuyCard(state: GameState, action: Extract<GameAction, { type: "buy_card" }>, player: PlayerState): void {
  const row = state.marketRows[action.row];
  if (!row) throw new Error("Invalid market row.");
  const cost = getBuyCardCost(action.column);
  // Place rupees on leftward cards in the same row (PP2e rule)
  for (let i = 0; i < action.column && i < row.length; i++) {
    const leftCardId = row[i];
    if (leftCardId && leftCardId !== row[action.column]) {
      state.rupeesOnMarketCards[leftCardId] = (state.rupeesOnMarketCards[leftCardId] ?? 0) + 1;
    }
  }
  const [card] = row.splice(action.column, 1);
  if (!card) throw new Error("Invalid market slot.");
  // Remove rupee tracking for the bought card
  delete state.rupeesOnMarketCards[card];
  player.rupees -= cost;
  player.hand.push(card);
  refillMarket(state);
  spendActionPointOrAdvanceTurn(state);
}

function handlePlayCard(state: GameState, action: Extract<GameAction, { type: "play_card" }>, player: PlayerState): void {
  const idx = player.hand.indexOf(action.cardId);
  if (idx < 0) throw new Error("Card not in hand.");
  player.hand.splice(idx, 1);
  player.court.push(action.cardId);
  player.courtCardSpies[action.cardId] = {};
  // TODO: dispatch card effects (impact icons) here
  spendActionPointOrAdvanceTurn(state);
}

function handleTakeRupee(_state: GameState, player: PlayerState): void {
  player.rupees += 1;
  spendActionPointOrAdvanceTurn(_state);
}

function handleBuildArmy(state: GameState, action: Extract<GameAction, { type: "build_army" }>, player: PlayerState): void {
  if (player.coalition === "none") throw new Error("Choose a faction before building coalition pieces.");
  if (player.rupees < 2) throw new Error("Not enough rupees to build army.");
  const region = state.board.find((r) => r.id === action.regionId);
  if (!region) throw new Error("Invalid region.");
  player.rupees -= 2;
  region.armies[player.coalition] += 1;
  spendActionPointOrAdvanceTurn(state);
}

function handleBuildRoad(state: GameState, action: Extract<GameAction, { type: "build_road" }>, player: PlayerState): void {
  if (player.coalition === "none") throw new Error("Choose a faction before building coalition pieces.");
  if (player.rupees < 2) throw new Error("Not enough rupees to build road.");
  const region = state.board.find((r) => r.id === action.regionId);
  if (!region) throw new Error("Invalid region.");
  player.rupees -= 2;
  region.roads[player.coalition] += 1;
  spendActionPointOrAdvanceTurn(state);
}

function handleGainLoyalty(_state: GameState, player: PlayerState): void {
  if (player.coalition === "none") throw new Error("Choose a faction before gaining loyalty.");
  player.loyalty += 1;
  spendActionPointOrAdvanceTurn(_state);
}

function handleChooseFaction(state: GameState, action: Extract<GameAction, { type: "choose_faction" }>, player: PlayerState): void {
  if (state.phase !== "faction_draft") throw new Error("Faction selection is only allowed during draft.");
  player.coalition = action.coalition;
  player.loyalty = 1;
  const nextPlayer = state.players.find((p) => p.coalition === "none");
  if (nextPlayer) {
    state.currentPlayerId = nextPlayer.id;
  } else {
    state.phase = "main";
    state.turn = 1;
    state.actionPointsRemaining = 2;
    state.currentPlayerId = state.players[0].id;
  }
}

function handleDominanceCheck(state: GameState): void {
  if (state.phase !== "main") throw new Error("Dominance check is only allowed in main phase.");
  if (state.dominanceChecksRemaining <= 0) throw new Error("No dominance checks remaining.");
  const result = resolveDominanceCheck(state);
  state.lastDominanceResult = result;
  state.dominanceChecksRemaining -= 1;
  for (const playerState of state.players) {
    playerState.victoryPoints += result.awardedVictoryPoints[playerState.id] ?? 0;
  }
  spendActionPointOrAdvanceTurn(state);
}

function handleTax(state: GameState, action: Extract<GameAction, { type: "tax" }>, player: PlayerState): void {
  const card = CARD_BY_ID.get(action.cardId);
  if (!card) throw new Error("Card not found.");
  // Simplified tax: collect rupees up to card rank (from bank for now)
  // TODO: implement full tax targeting (from players with cards in ruled regions, from market)
  const amount = card.rank;
  player.rupees += amount;
  state.usedCardThisTurn.push(action.cardId);
  spendActionPointOrAdvanceTurn(state);
}

function handleGift(state: GameState, player: PlayerState): void {
  const cost = getNextGiftCost(player);
  if (cost === null) throw new Error("No gift slots available.");
  if (player.rupees < cost) throw new Error("Not enough rupees for gift.");
  if (player.coalition === "none") throw new Error("Must have coalition to gift.");
  player.rupees -= cost;
  player.giftsCylinders += 1;
  player.influence[player.coalition] += 1;
  spendActionPointOrAdvanceTurn(state);
}

function handleMoveArmy(state: GameState, action: Extract<GameAction, { type: "move_army" }>, player: PlayerState): void {
  if (player.coalition === "none") throw new Error("No coalition.");
  if (!areRegionsAdjacent(action.fromRegionId, action.toRegionId)) {
    throw new Error("Regions not adjacent.");
  }
  const fromRegion = state.board.find((r) => r.id === action.fromRegionId);
  const toRegion = state.board.find((r) => r.id === action.toRegionId);
  if (!fromRegion || !toRegion) throw new Error("Invalid region.");
  if (fromRegion.armies[player.coalition] < 1) throw new Error("No army to move.");
  fromRegion.armies[player.coalition] -= 1;
  toRegion.armies[player.coalition] += 1;
  state.usedCardThisTurn.push(action.cardId);
  spendActionPointOrAdvanceTurn(state);
}

function handleMoveSpy(state: GameState, action: Extract<GameAction, { type: "move_spy" }>, player: PlayerState): void {
  // Find which player owns the source card
  const fromOwner = state.players.find((p) => p.court.includes(action.fromCardId));
  const toOwner = state.players.find((p) => p.court.includes(action.toCardId));
  if (!fromOwner || !toOwner) throw new Error("Card not in any court.");
  const spyCount = fromOwner.courtCardSpies[action.fromCardId]?.[player.id] ?? 0;
  if (spyCount < 1) throw new Error("No spy to move.");
  fromOwner.courtCardSpies[action.fromCardId][player.id] -= 1;
  if (fromOwner.courtCardSpies[action.fromCardId][player.id] <= 0) {
    delete fromOwner.courtCardSpies[action.fromCardId][player.id];
  }
  if (!toOwner.courtCardSpies[action.toCardId]) {
    toOwner.courtCardSpies[action.toCardId] = {};
  }
  toOwner.courtCardSpies[action.toCardId][player.id] = (toOwner.courtCardSpies[action.toCardId][player.id] ?? 0) + 1;
  state.usedCardThisTurn.push(action.cardId);
  spendActionPointOrAdvanceTurn(state);
}

function handleBattle(state: GameState, action: Extract<GameAction, { type: "battle" }>, player: PlayerState): void {
  const card = CARD_BY_ID.get(action.cardId);
  if (!card) throw new Error("Card not found.");
  if (player.coalition === "none") throw new Error("No coalition.");

  const region = state.board.find((r) => r.id === action.regionId);
  if (!region) throw new Error("Invalid region.");

  // Max removals = card rank, capped by player's presence (armies + spies in region)
  // Simplified: for now, remove enemy armies up to card rank
  const maxRemovals = card.rank;
  let removals = 0;

  const enemyCoalitions: Array<Exclude<Coalition, "none">> = (["afghan", "british", "russian"] as const)
    .filter((c) => c !== player.coalition);

  // Remove enemy armies first, then roads
  for (const c of enemyCoalitions) {
    while (region.armies[c] > 0 && removals < maxRemovals) {
      region.armies[c] -= 1;
      removals += 1;
    }
  }
  for (const c of enemyCoalitions) {
    while (region.roads[c] > 0 && removals < maxRemovals) {
      region.roads[c] -= 1;
      removals += 1;
    }
  }
  // Remove enemy tribes (only from players not sharing loyalty)
  for (const otherPlayer of state.players) {
    if (otherPlayer.id === player.id) continue;
    if (otherPlayer.coalition === player.coalition) continue;
    const regionData = state.board.find((r) => r.id === action.regionId);
    if (!regionData) continue;
    while ((regionData.tribesByPlayer[otherPlayer.id] ?? 0) > 0 && removals < maxRemovals) {
      regionData.tribesByPlayer[otherPlayer.id] -= 1;
      removals += 1;
    }
  }

  // TODO: dispatch on_battle card effects
  state.usedCardThisTurn.push(action.cardId);
  spendActionPointOrAdvanceTurn(state);
}

function handleBetray(state: GameState, action: Extract<GameAction, { type: "betray" }>, player: PlayerState): void {
  if (player.rupees < 2) throw new Error("Not enough rupees for betray.");

  const targetPlayer = state.players.find((p) => p.id === action.targetPlayerId);
  if (!targetPlayer) throw new Error("Target player not found.");

  const targetCardIdx = targetPlayer.court.indexOf(action.targetCardId);
  if (targetCardIdx < 0) throw new Error("Target card not in court.");

  const spyCount = targetPlayer.courtCardSpies[action.targetCardId]?.[player.id] ?? 0;
  if (spyCount < 1) throw new Error("No spy on target card.");

  player.rupees -= 2;

  // Remove the card from target's court
  targetPlayer.court.splice(targetCardIdx, 1);

  // Remove all spies on the betrayed card
  delete targetPlayer.courtCardSpies[action.targetCardId];

  // Card goes to discard
  state.discard.push(action.targetCardId);

  // TODO: implement prize acceptance (tuck behind loyalty dial)
  // TODO: implement loyalty cascade if prize differs from current loyalty
  // TODO: dispatch on_betray card effects

  state.usedCardThisTurn.push(action.cardId);
  spendActionPointOrAdvanceTurn(state);
}

// --- Action Equality ---

function isActionEqual(a: GameAction, b: GameAction): boolean {
  if (a.type !== b.type || a.playerId !== b.playerId) {
    return false;
  }
  switch (a.type) {
    case "buy_card":
      return a.row === (b as typeof a).row && a.column === (b as typeof a).column;
    case "play_card":
      return a.cardId === (b as typeof a).cardId;
    case "choose_faction":
      return a.coalition === (b as typeof a).coalition;
    case "build_army":
    case "build_road":
      return a.regionId === (b as typeof a).regionId;
    case "tax":
      return a.cardId === (b as typeof a).cardId;
    case "gift":
      return true;
    case "move_army":
      return a.cardId === (b as typeof a).cardId
        && a.fromRegionId === (b as typeof a).fromRegionId
        && a.toRegionId === (b as typeof a).toRegionId;
    case "move_spy":
      return a.cardId === (b as typeof a).cardId
        && a.fromCardId === (b as typeof a).fromCardId
        && a.toCardId === (b as typeof a).toCardId;
    case "battle":
      return a.cardId === (b as typeof a).cardId
        && a.regionId === (b as typeof a).regionId;
    case "betray":
      return a.cardId === (b as typeof a).cardId
        && a.targetCardId === (b as typeof a).targetCardId
        && a.targetPlayerId === (b as typeof a).targetPlayerId;
    case "perform_dominance_check":
    case "pass":
    case "take_rupee":
    case "gain_loyalty":
      return true;
    default:
      return false;
  }
}

// --- Dominance Check ---

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

  // Successful check: dominant coalition has 4+ more than every other
  const isSuccessful = top[1] >= second[1] + 4;
  const dominantCoalition = isSuccessful ? top[0] : null;

  const awardedVictoryPoints: Record<PlayerId, number> = {};

  if (dominantCoalition) {
    // Successful: score by influence among dominant coalition supporters
    const supporters = state.players
      .filter((p) => p.coalition === dominantCoalition)
      .map((p) => ({
        id: p.id,
        influence: 1 + (p.influence[dominantCoalition] ?? 0) + p.giftsCylinders
      }))
      .sort((a, b) => b.influence - a.influence);
    const rewardTrack = [5, 3, 1];
    supporters.forEach((supporter, index) => {
      const points = rewardTrack[index] ?? 0;
      if (points > 0) {
        awardedVictoryPoints[supporter.id] = points;
      }
    });
  } else {
    // Unsuccessful: score by cylinders in play (tribes + spies)
    const cylinderCounts: Array<{ id: PlayerId; count: number }> = state.players.map((p) => {
      let count = 0;
      for (const region of state.board) {
        count += region.tribesByPlayer[p.id] ?? 0;
      }
      // Count spies on all court cards
      for (const otherPlayer of state.players) {
        for (const cardId of otherPlayer.court) {
          count += otherPlayer.courtCardSpies[cardId]?.[p.id] ?? 0;
        }
      }
      return { id: p.id, count };
    });
    cylinderCounts.sort((a, b) => b.count - a.count);
    if (cylinderCounts.length > 0 && cylinderCounts[0].count > 0) {
      awardedVictoryPoints[cylinderCounts[0].id] = 3;
    }
    if (cylinderCounts.length > 1 && cylinderCounts[1].count > 0) {
      awardedVictoryPoints[cylinderCounts[1].id] = 1;
    }
  }

  return { dominantCoalition, coalitionStrength, awardedVictoryPoints };
}

// --- Observations ---

export function toPublicObservation(state: GameState): PublicObservation {
  return {
    gameId: state.gameId,
    phase: state.phase,
    turn: state.turn,
    actionPointsRemaining: state.actionPointsRemaining,
    currentPlayerId: state.currentPlayerId,
    players: state.players.map(({ hand, ...publicPlayer }) => ({
      ...publicPlayer,
      influence: { ...publicPlayer.influence },
      courtCardSpies: cloneCourtCardSpies(publicPlayer.courtCardSpies),
    })),
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
    isFinished: state.isFinished,
    favoredSuit: state.favoredSuit,
    rupeesOnMarketCards: { ...state.rupeesOnMarketCards },
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
