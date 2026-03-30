import type { GameAction, LegalActionChoice } from "./actions.js";
import {
  CARD_LIBRARY, validateCardLibrary, areRegionsAdjacent, getAdjacentRegions,
  REGION_BORDERS, DOMINANCE_CHECK_CARDS, OTHER_EVENT_CARDS,
  isEventCard, isDominanceCheckCard, getEventCard,
  type Coalition, type Region, type Suit, type CardDefinition, type ImpactIcon,
} from "./cards.js";
import type {
  BorderId, BorderState, CardId, GameState, PlayerId, PlayerObservation,
  PlayerState, PublicObservation, RegionState,
} from "./types.js";

const CARD_BY_ID = new Map(CARD_LIBRARY.map((card) => [card.id, card]));
const cardValidationErrors = validateCardLibrary(CARD_LIBRARY);
if (cardValidationErrors.length > 0) {
  throw new Error(`Invalid card library: ${cardValidationErrors.join("; ")}`);
}

const COALITIONS: Array<Exclude<Coalition, "none">> = ["afghan", "british", "russian"];

// ============================================================
// Initialization
// ============================================================

export function createInitialState(
  gameId: string,
  playerIds: PlayerId[],
  seed = Date.now()
): GameState {
  if (playerIds.length < 2) throw new Error("At least two players are required.");

  const deck = buildDeck(playerIds.length, seed);
  const players: PlayerState[] = playerIds.map((id, i) => ({
    id,
    name: `Player ${i + 1}`,
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
  const marketRows = [fillMarketRow(deck), fillMarketRow(deck)];

  return {
    gameId, seed,
    phase: "faction_draft",
    turn: 0,
    actionPointsRemaining: 0,
    currentPlayerId: playerIds[0],
    players,
    marketRows,
    deck,
    board: createInitialBoard(playerIds),
    borders: createInitialBorders(),
    deckCount: deck.length,
    dominanceChecksRemaining: 4,
    lastDominanceResult: null,
    discard: [],
    isFinished: false,
    winnerPlayerId: null,
    usedCardThisTurn: [],
    favoredSuit: "political",
    rupeesOnMarketCards: {},
    pendingMove: null,
    lastDominanceCheckRound: -1,
  };
}

function createInitialBoard(playerIds: PlayerId[]): RegionState[] {
  const regions: Region[] = ["kabul", "kandahar", "punjab", "herat", "persia", "transcaspia"];
  return regions.map((region) => ({
    id: region,
    armies: { afghan: 0, british: 0, russian: 0 },
    tribesByPlayer: Object.fromEntries(playerIds.map((id) => [id, 0])),
  }));
}

function createInitialBorders(): BorderState[] {
  return REGION_BORDERS.map(([a, b]) => ({
    id: `${a}_${b}`,
    regions: [a, b],
    roads: { afghan: 0, british: 0, russian: 0 },
  }));
}

// ============================================================
// Helpers
// ============================================================

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

function buildDeck(playerCount: number, seed: number): string[] {
  const n = playerCount;
  const courtCardsPerPile = 5 + n;

  // PP2e deck: 4 dominance + 6 event + 6*(5+n) court cards
  // Total for 2p=52, 3p=58, 4p=64, 5p=70
  const allCourt = shuffle(CARD_LIBRARY.map((c) => c.id), seed);
  const courtCards = allCourt.slice(0, courtCardsPerPile * 6);

  // 4 dominance check cards (all used)
  const dominanceIds = shuffle(DOMINANCE_CHECK_CARDS.map((c) => c.id), seed + 1);

  // 6 event cards (randomly selected from 12 available)
  const allEvents = shuffle(OTHER_EVENT_CARDS.map((c) => c.id), seed + 2);
  const eventIds = allEvents.slice(0, 6);

  // Build 6 piles per PP2e rules:
  // Pile 1: 5+n court cards only
  // Pile 2: 5+n court + 2 events
  // Pile 3: 5+n court + 1 event + 1 dominance
  // Pile 4: 5+n court + 1 event + 1 dominance
  // Pile 5: 5+n court + 1 event + 1 dominance
  // Pile 6: 5+n court + 1 event + 1 dominance
  // Total events: 2 + 1 + 1 + 1 + 1 = 6
  const piles: string[][] = [];
  let courtIdx = 0;
  let eventIdx = 0;
  let domIdx = 0;

  for (let pileNum = 1; pileNum <= 6; pileNum++) {
    const pile: string[] = [];

    for (let i = 0; i < courtCardsPerPile && courtIdx < courtCards.length; i++) {
      pile.push(courtCards[courtIdx++]);
    }

    // Pile 2 gets 2 event cards, piles 3-6 get 1 each
    if (pileNum === 2) {
      if (eventIdx < eventIds.length) pile.push(eventIds[eventIdx++]);
      if (eventIdx < eventIds.length) pile.push(eventIds[eventIdx++]);
    } else if (pileNum >= 3) {
      if (eventIdx < eventIds.length) pile.push(eventIds[eventIdx++]);
    }

    // Piles 3-6 get 1 dominance check card
    if (pileNum >= 3 && domIdx < dominanceIds.length) {
      pile.push(dominanceIds[domIdx++]);
    }

    piles.push(shuffle(pile, seed + 100 + pileNum));
  }

  // Stack: pile 1 on top (drawn first), pile 6 on bottom
  const deck: string[] = [];
  for (const pile of piles) {
    deck.push(...pile);
  }

  return deck;
}

function fillMarketRow(deck: string[]): string[] {
  const row: string[] = [];
  while (row.length < 5) {
    const next = deck.shift();
    if (!next) break;
    row.push(next);
  }
  return row;
}

function refillMarket(state: GameState): void {
  for (const row of state.marketRows) {
    while (row.length < 5) {
      const next = state.deck.shift();
      if (!next) break;
      row.push(next);
    }
  }
  state.deckCount = state.deck.length;

  // Check for two dominance check cards anywhere in the market — both auto-execute
  let domCardsInMarket: Array<{ row: number; col: number; cardId: string }> = [];
  for (let r = 0; r < state.marketRows.length; r++) {
    for (let c = 0; c < state.marketRows[r].length; c++) {
      if (isDominanceCheckCard(state.marketRows[r][c])) {
        domCardsInMarket.push({ row: r, col: c, cardId: state.marketRows[r][c] });
      }
    }
  }
  if (domCardsInMarket.length >= 2) {
    // Remove all dominance cards from market (reverse order to preserve indices)
    for (const dc of [...domCardsInMarket].reverse()) {
      state.marketRows[dc.row].splice(dc.col, 1);
    }
    // Resolve each one
    for (const dc of domCardsInMarket) {
      if (state.isFinished) break;
      resolveEventCard(state, dc.cardId, false);
    }
    // Refill after removing
    for (const row of state.marketRows) {
      while (row.length < 5) {
        const next = state.deck.shift();
        if (!next) break;
        row.push(next);
      }
    }
    state.deckCount = state.deck.length;
  }

  // Auto-trigger event cards at position 0 (leftmost, cost = 0)
  for (const row of state.marketRows) {
    while (row.length > 0 && isEventCard(row[0])) {
      const eventCardId = row.shift()!;
      resolveEventCard(state, eventCardId, false);
      const next = state.deck.shift();
      if (next) row.unshift(next);
      else break;
    }
  }
  state.deckCount = state.deck.length;
}

// ============================================================
// Region Ruling
// ============================================================

export function getRuler(state: GameState, regionId: Region): PlayerId | null {
  const region = state.board.find((r) => r.id === regionId);
  if (!region) return null;

  let bestPlayer: PlayerId | null = null;
  let bestCount = 0;
  let tied = false;

  for (const player of state.players) {
    const tribes = region.tribesByPlayer[player.id] ?? 0;
    if (tribes === 0) continue;
    const coalition = player.coalition;
    const loyalArmies = coalition !== "none" ? region.armies[coalition] : 0;
    const rulingPieces = tribes + loyalArmies;

    if (rulingPieces > bestCount) {
      bestCount = rulingPieces;
      bestPlayer = player.id;
      tied = false;
    } else if (rulingPieces === bestCount) {
      tied = true;
    }
  }

  return tied ? null : bestPlayer;
}

// ============================================================
// Border Helpers
// ============================================================

function getBorderBetween(state: GameState, a: Region, b: Region): BorderState | undefined {
  return state.borders.find(
    (border) =>
      (border.regions[0] === a && border.regions[1] === b) ||
      (border.regions[0] === b && border.regions[1] === a)
  );
}

function getBordersForRegion(state: GameState, regionId: Region): BorderState[] {
  return state.borders.filter(
    (b) => b.regions[0] === regionId || b.regions[1] === regionId
  );
}

function hasRoadOnBorder(state: GameState, a: Region, b: Region, coalition: Exclude<Coalition, "none">): boolean {
  const border = getBorderBetween(state, a, b);
  return border ? border.roads[coalition] > 0 : false;
}

// ============================================================
// State Cloning
// ============================================================

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      hand: [...p.hand],
      court: [...p.court],
      influence: { ...p.influence },
      courtCardSpies: cloneSpies(p.courtCardSpies),
    })),
    marketRows: state.marketRows.map((row) => [...row]),
    deck: [...state.deck],
    board: state.board.map((r) => ({
      ...r,
      armies: { ...r.armies },
      tribesByPlayer: { ...r.tribesByPlayer },
    })),
    borders: state.borders.map((b) => ({
      ...b,
      regions: [...b.regions] as [Region, Region],
      roads: { ...b.roads },
    })),
    discard: [...state.discard],
    usedCardThisTurn: [...state.usedCardThisTurn],
    rupeesOnMarketCards: { ...state.rupeesOnMarketCards },
    pendingMove: state.pendingMove ? { ...state.pendingMove } : null,
  };
}

function cloneSpies(spies: Record<CardId, Record<PlayerId, number>>): Record<CardId, Record<PlayerId, number>> {
  const result: Record<CardId, Record<PlayerId, number>> = {};
  for (const cardId of Object.keys(spies)) result[cardId] = { ...spies[cardId] };
  return result;
}

// ============================================================
// Turn Management
// ============================================================

function getBuyCardCost(column: number, favoredSuit: Suit): number {
  // TODO: military favored suit doubles purchase cost
  return column;
}

function spendActionPointOrAdvanceTurn(state: GameState, cardId?: CardId): void {
  // Favored suit: court card actions on favored-suit cards are bonus actions
  if (cardId) {
    const card = CARD_BY_ID.get(cardId);
    if (card && card.suit === state.favoredSuit) {
      // Bonus action: don't decrement AP
      return;
    }
  }
  state.actionPointsRemaining -= 1;
  if (state.actionPointsRemaining <= 0) {
    advanceTurn(state);
  }
}

function advanceTurn(state: GameState): void {
  // Cleanup phase for current player before advancing
  const currentPlayer = state.players.find((p) => p.id === state.currentPlayerId);
  if (currentPlayer) {
    enforceCourtLimit(state, currentPlayer);
    enforceHandLimit(state, currentPlayer);
  }

  const currentIndex = state.players.findIndex((p) => p.id === state.currentPlayerId);
  const nextIndex = (currentIndex + 1) % state.players.length;
  state.currentPlayerId = state.players[nextIndex].id;
  state.turn += 1;
  state.actionPointsRemaining = 2;
  state.usedCardThisTurn = [];
  state.pendingMove = null;
}

function getCurrentRound(state: GameState): number {
  return Math.floor(state.turn / state.players.length);
}

// ============================================================
// Suit Rank Helpers
// ============================================================

function getSuitRanks(player: PlayerState, suit: string): number {
  let total = 0;
  for (const cardId of player.court) {
    const card = CARD_BY_ID.get(cardId);
    if (card && card.suit === suit) total += card.rank;
  }
  return total;
}

function getCourtLimit(player: PlayerState): number {
  return 3 + getSuitRanks(player, "political");
}

function getHandLimit(player: PlayerState): number {
  return 2 + getSuitRanks(player, "intelligence");
}

function getTaxShelter(player: PlayerState): number {
  return getSuitRanks(player, "economic");
}

function getMilitaryRanks(player: PlayerState): number {
  return getSuitRanks(player, "military");
}

// ============================================================
// Cleanup Phase (end of turn)
// ============================================================

function enforceCourtLimit(state: GameState, player: PlayerState): void {
  const limit = getCourtLimit(player);
  while (player.court.length > limit) {
    // Discard the last card added (simplified: bot discards from end)
    const discarded = player.court.pop();
    if (discarded) {
      delete player.courtCardSpies[discarded];
      state.discard.push(discarded);
      // Recalculate limit since discarding a political card changes it
    }
  }
}

function enforceHandLimit(state: GameState, player: PlayerState): void {
  const limit = getHandLimit(player);
  while (player.hand.length > limit) {
    const discarded = player.hand.pop();
    if (discarded) state.discard.push(discarded);
  }
}

// ============================================================
// Event Card Resolution
// ============================================================

function resolveEventCard(state: GameState, cardId: string, purchased: boolean): void {
  const eventCard = getEventCard(cardId);
  if (!eventCard) return;

  state.discard.push(cardId);

  if (eventCard.type === "dominance_check") {
    // Trigger dominance check
    if (state.dominanceChecksRemaining > 0) {
      const isFinal = state.dominanceChecksRemaining === 1;
      const result = resolveDominanceCheck(state, isFinal);
      state.lastDominanceResult = result;
      state.dominanceChecksRemaining -= 1;

      for (const p of state.players) {
        p.victoryPoints += result.awardedVictoryPoints[p.id] ?? 0;
      }

      if (result.dominantCoalition) {
        for (const region of state.board) {
          for (const c of COALITIONS) region.armies[c] = 0;
        }
        for (const border of state.borders) {
          for (const c of COALITIONS) border.roads[c] = 0;
        }
      }

      // Early end check
      const vpSorted = [...state.players].sort((a, b) => b.victoryPoints - a.victoryPoints);
      if (vpSorted.length >= 2 && vpSorted[0].victoryPoints >= vpSorted[1].victoryPoints + 4) {
        state.isFinished = true;
        state.winnerPlayerId = vpSorted[0].id;
      }

      // Final dominance check: game always ends
      if (isFinal && !state.isFinished) {
        state.isFinished = true;
        // Determine winner: highest VP, military tiebreaker
        const vpSortedFinal = [...state.players].sort((a, b) => {
          if (b.victoryPoints !== a.victoryPoints) return b.victoryPoints - a.victoryPoints;
          return getMilitaryRanks(b) - getMilitaryRanks(a);
        });
        state.winnerPlayerId = vpSortedFinal[0]?.id ?? null;
      }
    }
    return;
  }

  // Other event cards: simplified effects for now
  // Many effects are complex and temporary ("until next Dominance Check")
  // For MVP: implement the simple immediate effects, skip temporary modifiers
  if (!purchased) {
    // Unpurchased effect (card reached position 0)
    if (eventCard.unpurchasedEffect.includes("Riots in")) {
      // Remove all tribes and armies in a specific region
      const regionMatch = eventCard.unpurchasedEffect.match(/Riots in (\w+)/);
      if (regionMatch) {
        const regionName = regionMatch[1].toLowerCase() as Region;
        const region = state.board.find((r) => r.id === regionName);
        if (region) {
          for (const c of COALITIONS) region.armies[c] = 0;
          for (const pid of Object.keys(region.tribesByPlayer)) region.tribesByPlayer[pid] = 0;
        }
      }
    } else if (eventCard.unpurchasedEffect.includes("Confidence Failure")) {
      for (const p of state.players) {
        if (p.hand.length > 0) {
          const discarded = p.hand.pop()!;
          state.discard.push(discarded);
        }
      }
    } else if (eventCard.unpurchasedEffect.includes("Failure to Impress")) {
      // All discard all loyalty prizes - simplified: no prize tracking yet
    }
  } else {
    // Purchased effects - simplified for MVP
    if (eventCard.purchasedEffect.includes("Take three rupees")) {
      const buyer = state.players.find((p) => p.id === state.currentPlayerId);
      if (buyer) buyer.rupees += 3;
    }
    // Other purchased effects involve temporary state modifiers that
    // persist "until next Dominance Check" - deferred for now
  }
}

// ============================================================
// Impact Icon Resolution (PP2e: resolved when card is played)
// ============================================================

function resolveImpactIcons(state: GameState, player: PlayerState, card: CardDefinition): void {
  if (!card.impactIcons) return;

  for (const icon of card.impactIcons) {
    switch (icon) {
      case "army": {
        if (player.coalition !== "none") {
          const region = state.board.find((r) => r.id === card.region);
          if (region) region.armies[player.coalition] += 1;
        }
        break;
      }
      case "road": {
        const roadCoalition = player.coalition;
        if (roadCoalition !== "none") {
          const borders = getBordersForRegion(state, card.region);
          const target = borders.find((b) => b.roads[roadCoalition] === 0) ?? borders[0];
          if (target) target.roads[roadCoalition] += 1;
        }
        break;
      }
      case "tribe": {
        const region = state.board.find((r) => r.id === card.region);
        if (region) region.tribesByPlayer[player.id] = (region.tribesByPlayer[player.id] ?? 0) + 1;
        break;
      }
      case "spy": {
        // Place a spy on any court card matching the played card's region
        // For bots: place on first opponent's court card in that region
        for (const otherPlayer of state.players) {
          if (otherPlayer.id === player.id) continue;
          for (const courtCardId of otherPlayer.court) {
            const courtCard = CARD_BY_ID.get(courtCardId);
            if (courtCard && courtCard.region === card.region) {
              if (!otherPlayer.courtCardSpies[courtCardId]) {
                otherPlayer.courtCardSpies[courtCardId] = {};
              }
              otherPlayer.courtCardSpies[courtCardId][player.id] =
                (otherPlayer.courtCardSpies[courtCardId][player.id] ?? 0) + 1;
              return; // Place one spy per icon
            }
          }
        }
        // If no opponent card in region, place on own court card
        for (const courtCardId of player.court) {
          const courtCard = CARD_BY_ID.get(courtCardId);
          if (courtCard && courtCard.region === card.region) {
            if (!player.courtCardSpies[courtCardId]) player.courtCardSpies[courtCardId] = {};
            player.courtCardSpies[courtCardId][player.id] =
              (player.courtCardSpies[courtCardId][player.id] ?? 0) + 1;
            return;
          }
        }
        break;
      }
      case "leverage": {
        player.rupees += 2;
        break;
      }
      case "suit_political":
      case "suit_intelligence":
      case "suit_economic":
      case "suit_military": {
        const suit = icon.replace("suit_", "") as Suit;
        state.favoredSuit = suit;
        break;
      }
    }
  }
}

// ============================================================
// Overthrow Rule
// ============================================================

function checkOverthrow(state: GameState, playerId: PlayerId): void {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;

  // Check each region: if player lost last tribe, discard political cards from that region
  for (const region of state.board) {
    const tribes = region.tribesByPlayer[playerId] ?? 0;
    if (tribes === 0) {
      // Remove all political cards from this region in player's court
      const toRemove = player.court.filter((cardId) => {
        const card = CARD_BY_ID.get(cardId);
        return card && card.suit === "political" && card.region === region.id;
      });
      for (const cardId of toRemove) {
        const idx = player.court.indexOf(cardId);
        if (idx >= 0) {
          player.court.splice(idx, 1);
          delete player.courtCardSpies[cardId];
          state.discard.push(cardId);
        }
      }
    }
  }

  // Check each region: if player lost last political card for a region, remove tribes
  const regionsWithPolitical = new Set<string>();
  for (const cardId of player.court) {
    const card = CARD_BY_ID.get(cardId);
    if (card && card.suit === "political") regionsWithPolitical.add(card.region);
  }
  for (const region of state.board) {
    if (!regionsWithPolitical.has(region.id) && (region.tribesByPlayer[playerId] ?? 0) > 0) {
      region.tribesByPlayer[playerId] = 0;
    }
  }
}

// ============================================================
// Legal Action Generation
// ============================================================

export function getLegalActions(state: GameState, playerId: PlayerId): GameAction[] {
  return getLegalActionChoices(state, playerId).map((c) => c.action);
}

export function getLegalActionChoices(state: GameState, playerId: PlayerId): LegalActionChoice[] {
  if (state.isFinished || state.currentPlayerId !== playerId) return [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];

  const actions: LegalActionChoice[] = [];

  // Faction draft phase
  if (state.phase === "faction_draft") {
    for (const coalition of COALITIONS) {
      actions.push({
        id: `choose-${coalition}`,
        label: `Choose faction: ${coalition}`,
        action: { type: "choose_faction", playerId, coalition },
      });
    }
    return actions;
  }

  // Mid-move: only allow more moves with the same card, or end move
  if (state.pendingMove) {
    const { cardId, movesRemaining } = state.pendingMove;
    const card = CARD_BY_ID.get(cardId);
    if (card && movesRemaining > 0) {
      // Army moves
      if (player.coalition !== "none") {
        for (const region of state.board) {
          if (region.armies[player.coalition] > 0) {
            for (const adj of getAdjacentRegions(region.id)) {
              if (hasRoadOnBorder(state, region.id, adj, player.coalition)) {
                actions.push({
                  id: `move-army-${cardId}-${region.id}-${adj}`,
                  label: `Move army ${region.id} -> ${adj} (${movesRemaining} moves left)`,
                  action: { type: "move_army", playerId, cardId, fromRegionId: region.id, toRegionId: adj },
                });
              }
            }
          }
        }
      }
      // Spy moves
      for (const op of state.players) {
        for (const ocId of op.court) {
          if ((op.courtCardSpies[ocId]?.[playerId] ?? 0) > 0) {
            for (const tp of state.players) {
              for (const tcId of tp.court) {
                if (tcId !== ocId) {
                  actions.push({
                    id: `move-spy-${cardId}-${ocId}-${tcId}`,
                    label: `Move spy ${ocId} -> ${tcId} (${movesRemaining} moves left)`,
                    action: { type: "move_spy", playerId, cardId, fromCardId: ocId, toCardId: tcId },
                  });
                }
              }
            }
          }
        }
      }
    }
    actions.push({
      id: "end-move",
      label: "End move action",
      action: { type: "end_move", playerId },
    });
    return actions;
  }

  // === Main phase actions ===

  // Buy from market
  for (let row = 0; row < state.marketRows.length; row++) {
    for (let col = 0; col < state.marketRows[row].length; col++) {
      const cardId = state.marketRows[row][col];
      const cost = getBuyCardCost(col, state.favoredSuit);
      if (player.rupees < cost) continue;
      const card = CARD_BY_ID.get(cardId);
      actions.push({
        id: `buy-${row}-${col}-${cardId}`,
        label: `Buy ${card?.name ?? cardId} (cost ${cost})`,
        action: { type: "buy_card", playerId, row, column: col },
      });
    }
  }

  // Play from hand (check bribe cost)
  for (const cardId of player.hand) {
    const card = CARD_BY_ID.get(cardId);
    if (!card) continue;
    const ruler = getRuler(state, card.region);
    let bribeCost = 0;
    if (ruler && ruler !== playerId) {
      const region = state.board.find((r) => r.id === card.region);
      bribeCost = region?.tribesByPlayer[ruler] ?? 0;
    }
    if (player.rupees < bribeCost) continue; // Can't afford bribe
    actions.push({
      id: `play-${cardId}`,
      label: `Play ${card.name} to court${bribeCost > 0 ? ` (bribe ${bribeCost})` : ""}`,
      action: { type: "play_card", playerId, cardId },
    });
  }

  // Court card actions (each card used once per turn)
  for (const courtCardId of player.court) {
    if (state.usedCardThisTurn.includes(courtCardId)) continue;
    const card = CARD_BY_ID.get(courtCardId);
    if (!card) continue;

    for (const icon of card.actionIcons) {
      switch (icon) {
        case "tax":
          actions.push({
            id: `tax-${courtCardId}`,
            label: `Tax using ${card.name} (rank ${card.rank})`,
            action: { type: "tax", playerId, cardId: courtCardId },
          });
          break;

        case "build": {
          // Build requires ruling the region. Can place up to 3 units.
          // For legal action generation: offer build if player rules at least one region
          // The build action itself specifies which pieces to place.
          if (player.coalition === "none" || player.rupees < 2) break;
          const ruledRegions = state.board.filter((r) => getRuler(state, r.id) === playerId);
          if (ruledRegions.length === 0) break;
          // Offer one build action per ruled region (simplified: 1 army per action for bots)
          for (const region of ruledRegions) {
            actions.push({
              id: `build-army-${courtCardId}-${region.id}`,
              label: `Build army in ${region.id} using ${card.name} (cost 2)`,
              action: {
                type: "build", playerId, cardId: courtCardId,
                pieces: [{ pieceType: "army", regionId: region.id }],
              },
            });
            // Roads on borders of ruled regions
            for (const border of getBordersForRegion(state, region.id)) {
              actions.push({
                id: `build-road-${courtCardId}-${border.id}`,
                label: `Build road on ${border.id} using ${card.name} (cost 2)`,
                action: {
                  type: "build", playerId, cardId: courtCardId,
                  pieces: [{ pieceType: "road", borderId: border.id }],
                },
              });
            }
          }
          break;
        }

        case "battle": {
          // Battle restricted to the acting card's region
          if (player.coalition === "none") break;
          const region = state.board.find((r) => r.id === card.region);
          if (!region) break;
          if (hasEnemyPieces(state, player, region)) {
            actions.push({
              id: `battle-${courtCardId}-${card.region}`,
              label: `Battle in ${card.region} using ${card.name}`,
              action: { type: "battle", playerId, cardId: courtCardId, regionId: card.region },
            });
          }
          break;
        }

        case "move": {
          // Move: offer if player has armies or spies to move
          let hasMovablePieces = false;
          if (player.coalition !== "none") {
            for (const region of state.board) {
              if (region.armies[player.coalition] > 0) {
                for (const adj of getAdjacentRegions(region.id)) {
                  if (hasRoadOnBorder(state, region.id, adj, player.coalition)) {
                    hasMovablePieces = true;
                    break;
                  }
                }
              }
              if (hasMovablePieces) break;
            }
          }
          // Check for movable spies
          if (!hasMovablePieces) {
            for (const op of state.players) {
              for (const ocId of op.court) {
                if ((op.courtCardSpies[ocId]?.[playerId] ?? 0) > 0) {
                  hasMovablePieces = true;
                  break;
                }
              }
              if (hasMovablePieces) break;
            }
          }
          if (hasMovablePieces) {
            actions.push({
              id: `move-${courtCardId}`,
              label: `Move using ${card.name} (${card.rank} moves)`,
              action: { type: "start_move", playerId, cardId: courtCardId },
            });
          }
          break;
        }

        case "betray": {
          if (player.rupees < 2) break;
          for (const op of state.players) {
            for (const ocId of op.court) {
              if ((op.courtCardSpies[ocId]?.[playerId] ?? 0) > 0) {
                actions.push({
                  id: `betray-${courtCardId}-${ocId}-${op.id}`,
                  label: `Betray ${CARD_BY_ID.get(ocId)?.name ?? ocId} in ${op.name}'s court`,
                  action: { type: "betray", playerId, cardId: courtCardId, targetCardId: ocId, targetPlayerId: op.id },
                });
              }
            }
          }
          break;
        }

        case "gift": {
          const nextGiftCost = getNextGiftCost(player);
          if (player.coalition !== "none" && nextGiftCost !== null && player.rupees >= nextGiftCost) {
            actions.push({
              id: `gift-${courtCardId}`,
              label: `Purchase gift using ${card.name} (cost ${nextGiftCost})`,
              action: { type: "gift", playerId },
            });
          }
          break;
        }

        case "spy":
          // Spy placement is an impact icon, not a court card action
          break;
      }
    }
  }

  // Dominance checks are triggered by event cards only (not a manual action).
  // Event cards are not yet implemented, so dominance checks don't occur.

  // Always available
  actions.push({ id: "pass", label: "End turn", action: { type: "pass", playerId } });

  return actions;
}

function hasEnemyPieces(state: GameState, player: PlayerState, region: RegionState): boolean {
  if (player.coalition === "none") return false;
  for (const c of COALITIONS) {
    if (c !== player.coalition && region.armies[c] > 0) return true;
  }
  // Enemy roads on borders of this region
  for (const border of getBordersForRegion(state, region.id)) {
    for (const c of COALITIONS) {
      if (c !== player.coalition && border.roads[c] > 0) return true;
    }
  }
  // Enemy tribes
  for (const [pid, count] of Object.entries(region.tribesByPlayer)) {
    if (pid === player.id || count === 0) continue;
    const op = state.players.find((p) => p.id === pid);
    if (op && op.coalition !== player.coalition) return true;
  }
  return false;
}

function getNextGiftCost(player: PlayerState): number | null {
  const costs = [2, 4, 6];
  return player.giftsCylinders < costs.length ? costs[player.giftsCylinders] : null;
}

// ============================================================
// Player presence in region (for battle cap)
// ============================================================

function getPlayerPresence(state: GameState, playerId: PlayerId, regionId: Region): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.coalition === "none") return 0;
  const region = state.board.find((r) => r.id === regionId);
  if (!region) return 0;
  let presence = region.armies[player.coalition];
  // Count spies on court cards in this region
  for (const op of state.players) {
    for (const cardId of op.court) {
      const card = CARD_BY_ID.get(cardId);
      if (card && card.region === regionId) {
        presence += op.courtCardSpies[cardId]?.[playerId] ?? 0;
      }
    }
  }
  return presence;
}

// ============================================================
// Action Application
// ============================================================

export function applyAction(state: GameState, action: GameAction): GameState {
  const legal = getLegalActions(state, action.playerId).some((c) => isActionEqual(c, action));
  if (!legal) throw new Error(`Illegal action: ${action.type}`);

  const next = cloneState(state);
  const player = next.players.find((p) => p.id === action.playerId);
  if (!player) throw new Error("Player not found.");

  switch (action.type) {
    case "buy_card": handleBuyCard(next, action, player); break;
    case "play_card": handlePlayCard(next, action, player); break;
    case "take_rupee": handleTakeRupee(next, player); break;
    case "build": handleBuild(next, action, player); break;
    case "pass": advanceTurn(next); break;
    case "choose_faction": handleChooseFaction(next, action, player); break;
    case "perform_dominance_check": throw new Error("Dominance checks are triggered by event cards only."); break;
    case "tax": handleTax(next, action, player); break;
    case "gift": handleGift(next, player); break;
    case "start_move": handleStartMove(next, action, player); break;
    case "move_army": handleMoveArmy(next, action, player); break;
    case "move_spy": handleMoveSpy(next, action, player); break;
    case "end_move": handleEndMove(next, player); break;
    case "battle": handleBattle(next, action, player); break;
    case "betray": handleBetray(next, action, player); break;
  }

  next.deckCount = next.deck.length;
  return next;
}

// ============================================================
// Action Handlers
// ============================================================

function handleBuyCard(state: GameState, action: Extract<GameAction, { type: "buy_card" }>, player: PlayerState): void {
  const row = state.marketRows[action.row];
  if (!row) throw new Error("Invalid market row.");
  const cost = getBuyCardCost(action.column, state.favoredSuit);
  // Place rupees on leftward cards
  for (let i = 0; i < action.column && i < row.length; i++) {
    const leftCard = row[i];
    if (leftCard) {
      state.rupeesOnMarketCards[leftCard] = (state.rupeesOnMarketCards[leftCard] ?? 0) + 1;
    }
  }
  const [card] = row.splice(action.column, 1);
  if (!card) throw new Error("Invalid market slot.");
  delete state.rupeesOnMarketCards[card];
  player.rupees -= cost;

  if (isEventCard(card)) {
    // Event card: trigger effect, don't add to hand
    resolveEventCard(state, card, true);
  } else {
    player.hand.push(card);
  }

  refillMarket(state);
  spendActionPointOrAdvanceTurn(state);
}

function handlePlayCard(state: GameState, action: Extract<GameAction, { type: "play_card" }>, player: PlayerState): void {
  const idx = player.hand.indexOf(action.cardId);
  if (idx < 0) throw new Error("Card not in hand.");
  const card = CARD_BY_ID.get(action.cardId);
  if (!card) throw new Error("Card not found.");

  // Bribe check: if someone else rules the card's region, pay bribe
  const ruler = getRuler(state, card.region);
  if (ruler && ruler !== player.id) {
    const rulerPlayer = state.players.find((p) => p.id === ruler);
    if (rulerPlayer) {
      const region = state.board.find((r) => r.id === card.region);
      const bribeCost = region?.tribesByPlayer[ruler] ?? 0;
      if (bribeCost > 0) {
        if (player.rupees < bribeCost) throw new Error("Cannot afford bribe.");
        player.rupees -= bribeCost;
        rulerPlayer.rupees += bribeCost;
      }
    }
  }

  player.hand.splice(idx, 1);
  player.court.push(action.cardId);
  player.courtCardSpies[action.cardId] = {};

  // Patriot check: if card is patriot and coalition doesn't match player's
  if (card.isPatriot && card.coalition !== "none" && card.coalition !== player.coalition) {
    // Loyalty switch: remove all gifts/prizes/patriots of old coalition
    if (player.coalition !== "none") {
      player.influence[player.coalition] = 0;
      player.giftsCylinders = 0;
      // Remove patriot cards of old coalition from court
      const toRemove = player.court.filter((cid) => {
        const c = CARD_BY_ID.get(cid);
        return c && c.isPatriot && c.coalition === player.coalition && cid !== action.cardId;
      });
      for (const cid of toRemove) {
        const i = player.court.indexOf(cid);
        if (i >= 0) { player.court.splice(i, 1); delete player.courtCardSpies[cid]; state.discard.push(cid); }
      }
    }
    player.coalition = card.coalition;
    player.loyalty = 1;
  }

  // Resolve impact icons
  resolveImpactIcons(state, player, card);

  spendActionPointOrAdvanceTurn(state);
}

function handleTakeRupee(_state: GameState, player: PlayerState): void {
  player.rupees += 1;
  spendActionPointOrAdvanceTurn(_state);
}

function handleBuild(state: GameState, action: Extract<GameAction, { type: "build" }>, player: PlayerState): void {
  const card = CARD_BY_ID.get(action.cardId);
  if (!card) throw new Error("Card not found.");
  if (player.coalition === "none") throw new Error("No coalition.");
  if (!card.actionIcons.includes("build")) throw new Error("Card has no build icon.");

  const totalPieces = action.pieces.length;
  if (totalPieces < 1 || totalPieces > 3) throw new Error("Build places 1-3 pieces.");
  if (player.rupees < totalPieces * 2) throw new Error("Not enough rupees.");

  for (const piece of action.pieces) {
    if (piece.pieceType === "army") {
      const ruler = getRuler(state, piece.regionId);
      if (ruler !== player.id) throw new Error(`You don't rule ${piece.regionId}.`);
      const region = state.board.find((r) => r.id === piece.regionId);
      if (!region) throw new Error("Invalid region.");
      region.armies[player.coalition] += 1;
    } else {
      // Road on border
      const border = state.borders.find((b) => b.id === piece.borderId);
      if (!border) throw new Error("Invalid border.");
      // Must be adjacent to a ruled region
      const rulesAdjacent = border.regions.some((r) => getRuler(state, r) === player.id);
      if (!rulesAdjacent) throw new Error("Border not adjacent to a ruled region.");
      border.roads[player.coalition] += 1;
    }
  }

  player.rupees -= totalPieces * 2;
  state.usedCardThisTurn.push(action.cardId);
  spendActionPointOrAdvanceTurn(state, action.cardId);
}

function handleChooseFaction(state: GameState, action: Extract<GameAction, { type: "choose_faction" }>, player: PlayerState): void {
  if (state.phase !== "faction_draft") throw new Error("Only during draft.");
  player.coalition = action.coalition;
  player.loyalty = 1;
  const next = state.players.find((p) => p.coalition === "none");
  if (next) {
    state.currentPlayerId = next.id;
  } else {
    state.phase = "main";
    state.turn = 1;
    state.actionPointsRemaining = 2;
    state.currentPlayerId = state.players[0].id;
  }
}

function handleDominanceCheck(state: GameState): void {
  if (state.phase !== "main") throw new Error("Only in main phase.");
  if (state.dominanceChecksRemaining <= 0) throw new Error("No dominance checks remaining.");

  const isFinal = state.dominanceChecksRemaining === 1;
  const result = resolveDominanceCheck(state, isFinal);
  state.lastDominanceResult = result;
  state.dominanceChecksRemaining -= 1;
  state.lastDominanceCheckRound = getCurrentRound(state);

  for (const p of state.players) {
    p.victoryPoints += result.awardedVictoryPoints[p.id] ?? 0;
  }

  // Successful check: remove all coalition blocks from board
  if (result.dominantCoalition) {
    for (const region of state.board) {
      for (const c of COALITIONS) { region.armies[c] = 0; }
    }
    for (const border of state.borders) {
      for (const c of COALITIONS) { border.roads[c] = 0; }
    }
  }

  // Early end check: 4+ VP lead
  const vpSorted = [...state.players].sort((a, b) => b.victoryPoints - a.victoryPoints);
  if (vpSorted.length >= 2 && vpSorted[0].victoryPoints >= vpSorted[1].victoryPoints + 4) {
    state.isFinished = true;
    state.winnerPlayerId = vpSorted[0].id;
  }

  // Final dominance check: game always ends
  if (isFinal && !state.isFinished) {
    state.isFinished = true;
    const vpSortedFinal = [...state.players].sort((a, b) => {
      if (b.victoryPoints !== a.victoryPoints) return b.victoryPoints - a.victoryPoints;
      return getMilitaryRanks(b) - getMilitaryRanks(a);
    });
    state.winnerPlayerId = vpSortedFinal[0]?.id ?? null;
  }


  spendActionPointOrAdvanceTurn(state);
}

function handleTax(state: GameState, action: Extract<GameAction, { type: "tax" }>, player: PlayerState): void {
  const card = CARD_BY_ID.get(action.cardId);
  if (!card) throw new Error("Card not found.");

  let collected = 0;
  const maxCollect = card.rank;

  // Collect from market cards with rupees
  for (const [cardId, rupees] of Object.entries(state.rupeesOnMarketCards)) {
    if (collected >= maxCollect) break;
    const take = Math.min(rupees, maxCollect - collected);
    state.rupeesOnMarketCards[cardId] -= take;
    if (state.rupeesOnMarketCards[cardId] <= 0) delete state.rupeesOnMarketCards[cardId];
    collected += take;
  }

  // Collect from players with court cards in regions this player rules
  if (collected < maxCollect) {
    for (const op of state.players) {
      if (op.id === player.id || collected >= maxCollect) continue;
      // Check if opponent has a court card in a region we rule
      const hasCardInRuledRegion = op.court.some((cid) => {
        const c = CARD_BY_ID.get(cid);
        return c && getRuler(state, c.region) === player.id;
      });
      if (hasCardInRuledRegion && op.rupees > 0) {
        // Tax shelter: economic ranks shield rupees from being taxed
        const shelter = getTaxShelter(op);
        const taxable = Math.max(0, op.rupees - shelter);
        if (taxable > 0) {
          const take = Math.min(taxable, maxCollect - collected);
          op.rupees -= take;
          collected += take;
        }
      }
    }
  }

  player.rupees += collected;
  state.usedCardThisTurn.push(action.cardId);
  spendActionPointOrAdvanceTurn(state, action.cardId);
}

function handleGift(state: GameState, player: PlayerState): void {
  const cost = getNextGiftCost(player);
  if (cost === null) throw new Error("No gift slots.");
  if (player.rupees < cost) throw new Error("Not enough rupees.");
  if (player.coalition === "none") throw new Error("No coalition.");
  player.rupees -= cost;
  player.giftsCylinders += 1;
  player.influence[player.coalition] += 1;
  spendActionPointOrAdvanceTurn(state);
}

function handleStartMove(state: GameState, action: Extract<GameAction, { type: "start_move" }>, _player: PlayerState): void {
  const card = CARD_BY_ID.get(action.cardId);
  if (!card) throw new Error("Card not found.");
  state.pendingMove = { cardId: action.cardId, movesRemaining: card.rank };
  state.usedCardThisTurn.push(action.cardId);
  // Don't spend AP yet — that happens when move ends
}

function handleMoveArmy(state: GameState, action: Extract<GameAction, { type: "move_army" }>, player: PlayerState): void {
  if (player.coalition === "none") throw new Error("No coalition.");
  if (!state.pendingMove) throw new Error("No pending move. Use start_move first.");

  if (!areRegionsAdjacent(action.fromRegionId, action.toRegionId)) {
    throw new Error("Regions not adjacent.");
  }
  if (!hasRoadOnBorder(state, action.fromRegionId, action.toRegionId, player.coalition)) {
    throw new Error("No matching road on border.");
  }
  const from = state.board.find((r) => r.id === action.fromRegionId);
  const to = state.board.find((r) => r.id === action.toRegionId);
  if (!from || !to) throw new Error("Invalid region.");
  if (from.armies[player.coalition] < 1) throw new Error("No army to move.");

  from.armies[player.coalition] -= 1;
  to.armies[player.coalition] += 1;
  state.pendingMove!.movesRemaining -= 1;

  if (state.pendingMove!.movesRemaining <= 0) {
    const cardId = state.pendingMove!.cardId;
    state.pendingMove = null;
    spendActionPointOrAdvanceTurn(state, cardId);
  }
}

function handleMoveSpy(state: GameState, action: Extract<GameAction, { type: "move_spy" }>, player: PlayerState): void {
  if (!state.pendingMove) throw new Error("No pending move. Use start_move first.");

  const fromOwner = state.players.find((p) => p.court.includes(action.fromCardId));
  const toOwner = state.players.find((p) => p.court.includes(action.toCardId));
  if (!fromOwner || !toOwner) throw new Error("Card not in court.");
  const spyCount = fromOwner.courtCardSpies[action.fromCardId]?.[player.id] ?? 0;
  if (spyCount < 1) throw new Error("No spy to move.");

  fromOwner.courtCardSpies[action.fromCardId][player.id] -= 1;
  if (fromOwner.courtCardSpies[action.fromCardId][player.id] <= 0) {
    delete fromOwner.courtCardSpies[action.fromCardId][player.id];
  }
  if (!toOwner.courtCardSpies[action.toCardId]) toOwner.courtCardSpies[action.toCardId] = {};
  toOwner.courtCardSpies[action.toCardId][player.id] =
    (toOwner.courtCardSpies[action.toCardId][player.id] ?? 0) + 1;

  state.pendingMove!.movesRemaining -= 1;
  if (state.pendingMove!.movesRemaining <= 0) {
    const cardId = state.pendingMove!.cardId;
    state.pendingMove = null;
    spendActionPointOrAdvanceTurn(state, cardId);
  }
}

function handleEndMove(state: GameState, _player: PlayerState): void {
  if (!state.pendingMove) throw new Error("No pending move.");
  const cardId = state.pendingMove.cardId;
  state.pendingMove = null;
  spendActionPointOrAdvanceTurn(state, cardId);
}

function handleBattle(state: GameState, action: Extract<GameAction, { type: "battle" }>, player: PlayerState): void {
  const card = CARD_BY_ID.get(action.cardId);
  if (!card) throw new Error("Card not found.");
  if (player.coalition === "none") throw new Error("No coalition.");
  if (card.region !== action.regionId) throw new Error("Battle must be in card's region.");

  const region = state.board.find((r) => r.id === action.regionId);
  if (!region) throw new Error("Invalid region.");

  const presence = getPlayerPresence(state, player.id, action.regionId);
  const maxRemovals = Math.min(card.rank, presence);
  let removals = 0;

  // Auto-remove: enemy armies, then roads on borders, then tribes
  const enemyCoalitions = COALITIONS.filter((c) => c !== player.coalition);

  for (const c of enemyCoalitions) {
    while (region.armies[c] > 0 && removals < maxRemovals) {
      region.armies[c] -= 1;
      removals += 1;
    }
  }

  // Remove roads on borders of this region
  for (const border of getBordersForRegion(state, action.regionId)) {
    for (const c of enemyCoalitions) {
      while (border.roads[c] > 0 && removals < maxRemovals) {
        border.roads[c] -= 1;
        removals += 1;
      }
    }
  }

  // Remove enemy tribes (not from allies)
  for (const op of state.players) {
    if (op.id === player.id || op.coalition === player.coalition) continue;
    while ((region.tribesByPlayer[op.id] ?? 0) > 0 && removals < maxRemovals) {
      region.tribesByPlayer[op.id] -= 1;
      removals += 1;
    }
  }

  // Remove enemy spies on court cards in this region
  for (const op of state.players) {
    if (op.id === player.id || op.coalition === player.coalition) continue;
    for (const cardId of op.court) {
      const courtCard = CARD_BY_ID.get(cardId);
      if (courtCard && courtCard.region === action.regionId) {
        for (const [spyOwner, count] of Object.entries(op.courtCardSpies[cardId] ?? {})) {
          if (spyOwner === player.id) continue; // Don't remove own spies
          const spyPlayer = state.players.find((p) => p.id === spyOwner);
          if (spyPlayer && spyPlayer.coalition !== player.coalition) {
            while ((op.courtCardSpies[cardId]?.[spyOwner] ?? 0) > 0 && removals < maxRemovals) {
              op.courtCardSpies[cardId][spyOwner] -= 1;
              if (op.courtCardSpies[cardId][spyOwner] <= 0) delete op.courtCardSpies[cardId][spyOwner];
              removals += 1;
            }
          }
        }
      }
    }
  }

  // Check overthrow for affected players
  for (const op of state.players) {
    if (op.id !== player.id) checkOverthrow(state, op.id);
  }

  state.usedCardThisTurn.push(action.cardId);
  spendActionPointOrAdvanceTurn(state, action.cardId);
}

function handleBetray(state: GameState, action: Extract<GameAction, { type: "betray" }>, player: PlayerState): void {
  if (player.rupees < 2) throw new Error("Not enough rupees.");
  const targetPlayer = state.players.find((p) => p.id === action.targetPlayerId);
  if (!targetPlayer) throw new Error("Target player not found.");
  const targetIdx = targetPlayer.court.indexOf(action.targetCardId);
  if (targetIdx < 0) throw new Error("Target card not in court.");
  const spyCount = targetPlayer.courtCardSpies[action.targetCardId]?.[player.id] ?? 0;
  if (spyCount < 1) throw new Error("No spy on target card.");

  player.rupees -= 2;

  // Remove card from target's court
  targetPlayer.court.splice(targetIdx, 1);
  delete targetPlayer.courtCardSpies[action.targetCardId];

  // Card goes to discard (prize acceptance simplified: always discard for now)
  // TODO: implement prize acceptance choice
  state.discard.push(action.targetCardId);

  // Check overthrow for target player
  checkOverthrow(state, action.targetPlayerId);

  state.usedCardThisTurn.push(action.cardId);
  spendActionPointOrAdvanceTurn(state, action.cardId);
}

// ============================================================
// Action Equality
// ============================================================

function isActionEqual(a: GameAction, b: GameAction): boolean {
  if (a.type !== b.type || a.playerId !== b.playerId) return false;
  switch (a.type) {
    case "buy_card": return a.row === (b as typeof a).row && a.column === (b as typeof a).column;
    case "play_card": return a.cardId === (b as typeof a).cardId;
    case "choose_faction": return a.coalition === (b as typeof a).coalition;
    case "build": return a.cardId === (b as typeof a).cardId && JSON.stringify(a.pieces) === JSON.stringify((b as typeof a).pieces);
    case "tax": return a.cardId === (b as typeof a).cardId;
    case "gift": return true;
    case "start_move": return a.cardId === (b as typeof a).cardId;
    case "move_army": return a.cardId === (b as typeof a).cardId && a.fromRegionId === (b as typeof a).fromRegionId && a.toRegionId === (b as typeof a).toRegionId;
    case "move_spy": return a.cardId === (b as typeof a).cardId && a.fromCardId === (b as typeof a).fromCardId && a.toCardId === (b as typeof a).toCardId;
    case "end_move": return true;
    case "battle": return a.cardId === (b as typeof a).cardId && a.regionId === (b as typeof a).regionId;
    case "betray": return a.cardId === (b as typeof a).cardId && a.targetCardId === (b as typeof a).targetCardId && a.targetPlayerId === (b as typeof a).targetPlayerId;
    case "perform_dominance_check":
    case "pass":
    case "take_rupee":
      return true;
    default: return false;
  }
}

// ============================================================
// Dominance Check
// ============================================================

function resolveDominanceCheck(state: GameState, isFinal: boolean): NonNullable<GameState["lastDominanceResult"]> {
  const coalitionStrength: Record<Exclude<Coalition, "none">, number> = { afghan: 0, british: 0, russian: 0 };

  for (const region of state.board) {
    for (const c of COALITIONS) coalitionStrength[c] += region.armies[c];
  }
  for (const border of state.borders) {
    for (const c of COALITIONS) coalitionStrength[c] += border.roads[c];
  }

  const sorted = COALITIONS.map((c) => ({ c, s: coalitionStrength[c] })).sort((a, b) => b.s - a.s);
  const isSuccessful = sorted[0].s >= sorted[1].s + 4;
  const dominantCoalition = isSuccessful ? sorted[0].c : null;

  const awardedVictoryPoints: Record<PlayerId, number> = {};
  const multiplier = isFinal ? 2 : 1;

  if (dominantCoalition) {
    // Successful: score by influence
    const supporters = state.players
      .filter((p) => p.coalition === dominantCoalition)
      .map((p) => {
        // Influence = 1 base + gifts
        const patriots = p.court.filter((cid) => {
          const c = CARD_BY_ID.get(cid);
          return c && c.isPatriot && c.coalition === dominantCoalition;
        }).length;
        return { id: p.id, influence: 1 + p.giftsCylinders + patriots };
      })
      .sort((a, b) => b.influence - a.influence);

    const rewards = [5, 3, 1];
    supporters.forEach((s, i) => {
      const pts = (rewards[i] ?? 0) * multiplier;
      if (pts > 0) awardedVictoryPoints[s.id] = pts;
    });
  } else {
    // Unsuccessful: score by cylinders in play (tribes + spies)
    const cylinders: Array<{ id: PlayerId; count: number }> = state.players.map((p) => {
      let count = 0;
      for (const region of state.board) count += region.tribesByPlayer[p.id] ?? 0;
      for (const op of state.players) {
        for (const cardId of op.court) count += op.courtCardSpies[cardId]?.[p.id] ?? 0;
      }
      return { id: p.id, count };
    });
    cylinders.sort((a, b) => b.count - a.count);

    // Handle ties: pool and split
    if (cylinders.length >= 2 && cylinders[0].count === cylinders[1].count && cylinders[0].count > 0) {
      // Tie for first: pool 3+1=4 and split
      const tiedForFirst = cylinders.filter((c) => c.count === cylinders[0].count);
      const pooled = Math.floor(4 / tiedForFirst.length) * multiplier;
      for (const c of tiedForFirst) awardedVictoryPoints[c.id] = pooled;
    } else {
      if (cylinders[0]?.count > 0) awardedVictoryPoints[cylinders[0].id] = 3 * multiplier;
      if (cylinders.length >= 2 && cylinders[1]?.count > 0) {
        // Check tie for second
        const tiedForSecond = cylinders.filter((c, i) => i > 0 && c.count === cylinders[1].count && c.count > 0);
        if (tiedForSecond.length > 1) {
          const pooled = Math.floor(1 / tiedForSecond.length) * multiplier;
          for (const c of tiedForSecond) awardedVictoryPoints[c.id] = pooled;
        } else {
          awardedVictoryPoints[cylinders[1].id] = 1 * multiplier;
        }
      }
    }
  }

  return { dominantCoalition, coalitionStrength, awardedVictoryPoints };
}

// ============================================================
// Observations
// ============================================================

export function toPublicObservation(state: GameState): PublicObservation {
  return {
    gameId: state.gameId,
    phase: state.phase,
    turn: state.turn,
    actionPointsRemaining: state.actionPointsRemaining,
    currentPlayerId: state.currentPlayerId,
    players: state.players.map(({ hand, ...rest }) => ({
      ...rest,
      influence: { ...rest.influence },
      courtCardSpies: cloneSpies(rest.courtCardSpies),
    })),
    board: state.board.map((r) => ({
      ...r,
      armies: { ...r.armies },
      tribesByPlayer: { ...r.tribesByPlayer },
    })),
    borders: state.borders.map((b) => ({
      ...b,
      regions: [...b.regions] as [Region, Region],
      roads: { ...b.roads },
    })),
    marketRows: state.marketRows.map((row) => [...row]),
    deckCount: state.deckCount,
    dominanceChecksRemaining: state.dominanceChecksRemaining,
    lastDominanceResult: state.lastDominanceResult
      ? {
          dominantCoalition: state.lastDominanceResult.dominantCoalition,
          coalitionStrength: { ...state.lastDominanceResult.coalitionStrength },
          awardedVictoryPoints: { ...state.lastDominanceResult.awardedVictoryPoints },
        }
      : null,
    discardCount: state.discard.length,
    isFinished: state.isFinished,
    favoredSuit: state.favoredSuit,
    rupeesOnMarketCards: { ...state.rupeesOnMarketCards },
    pendingMove: state.pendingMove ? { ...state.pendingMove } : null,
  };
}

export function toPlayerObservation(state: GameState, playerId: PlayerId): PlayerObservation {
  const self = state.players.find((p) => p.id === playerId);
  if (!self) throw new Error("Player not found.");
  return {
    ...toPublicObservation(state),
    self: { id: self.id, hand: [...self.hand], rupees: self.rupees, coalition: self.coalition },
    legalActions: getLegalActionChoices(state, playerId),
  };
}
