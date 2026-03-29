import { describe, it, expect } from "vitest";
import {
  createInitialState, applyAction, getLegalActionChoices, getRuler,
  toPublicObservation, toPlayerObservation,
} from "./engine.js";
import { areRegionsAdjacent, getAdjacentRegions, CARD_LIBRARY } from "./cards.js";
import type { GameState, PlayerState } from "./types.js";

// --- Helpers ---

function createTestState(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialState("test", ["p1", "p2"], 42), ...overrides };
}

function draftBothPlayers(state: GameState): GameState {
  let s = applyAction(state, { type: "choose_faction", playerId: "p1", coalition: "afghan" });
  s = applyAction(s, { type: "choose_faction", playerId: "p2", coalition: "british" });
  return s;
}

function getPlayer(state: GameState, id: string): PlayerState {
  return state.players.find((p) => p.id === id)!;
}

// --- Region Adjacency ---

describe("Region adjacency", () => {
  it("kabul adjacent to herat, kandahar, punjab, transcaspia", () => {
    expect(areRegionsAdjacent("kabul", "herat")).toBe(true);
    expect(areRegionsAdjacent("kabul", "kandahar")).toBe(true);
    expect(areRegionsAdjacent("kabul", "punjab")).toBe(true);
    expect(areRegionsAdjacent("kabul", "transcaspia")).toBe(true);
  });
  it("kabul NOT adjacent to persia", () => {
    expect(areRegionsAdjacent("kabul", "persia")).toBe(false);
  });
  it("persia has 2 neighbors", () => {
    expect(getAdjacentRegions("persia").sort()).toEqual(["herat", "transcaspia"]);
  });
});

// --- Initialization ---

describe("createInitialState", () => {
  it("creates valid state with borders", () => {
    const state = createTestState();
    expect(state.board).toHaveLength(6);
    expect(state.borders).toHaveLength(9);
    expect(state.favoredSuit).toBe("political");
    expect(state.pendingMove).toBeNull();
  });
  it("borders have zero roads initially", () => {
    const state = createTestState();
    for (const border of state.borders) {
      expect(border.roads.afghan + border.roads.british + border.roads.russian).toBe(0);
    }
  });
  it("regions have no roads field", () => {
    const state = createTestState();
    expect((state.board[0] as any).roads).toBeUndefined();
  });
  it("throws for < 2 players", () => {
    expect(() => createInitialState("test", ["p1"])).toThrow();
  });
});

// --- Faction Draft ---

describe("faction draft", () => {
  it("transitions to main after all choose", () => {
    const s = draftBothPlayers(createTestState());
    expect(s.phase).toBe("main");
    expect(s.turn).toBe(1);
    expect(s.actionPointsRemaining).toBe(2);
  });
});

// --- Region Ruling ---

describe("getRuler", () => {
  it("returns null when no one has tribes", () => {
    const state = draftBothPlayers(createTestState());
    expect(getRuler(state, "kabul")).toBeNull();
  });
  it("player with tribes and plurality rules", () => {
    const state = draftBothPlayers(createTestState());
    state.board.find((r) => r.id === "kabul")!.tribesByPlayer["p1"] = 2;
    expect(getRuler(state, "kabul")).toBe("p1");
  });
  it("tied ruling pieces = no ruler", () => {
    const state = draftBothPlayers(createTestState());
    const kabul = state.board.find((r) => r.id === "kabul")!;
    kabul.tribesByPlayer["p1"] = 1;
    kabul.tribesByPlayer["p2"] = 1;
    // p1 has afghan armies (1), p2 has british armies (1)
    // p1: 1 tribe + 1 army = 2, p2: 1 tribe + 1 army = 2 -> tie
    expect(getRuler(state, "kabul")).toBeNull();
  });
});

// --- Build requires court card + ruling ---

describe("build action", () => {
  it("no build actions without a court card with build icon", () => {
    const state = draftBothPlayers(createTestState());
    // p1 has no court cards
    const actions = getLegalActionChoices(state, "p1");
    const builds = actions.filter((a) => a.action.type === "build");
    expect(builds).toHaveLength(0);
  });

  it("no build actions without ruling a region", () => {
    const state = draftBothPlayers(createTestState());
    // Give p1 a card with build icon but no tribes (can't rule)
    const buildCard = CARD_LIBRARY.find((c) => c.actionIcons.includes("build"))!;
    state.players[0].court.push(buildCard.id);
    state.players[0].courtCardSpies[buildCard.id] = {};
    const actions = getLegalActionChoices(state, "p1");
    const builds = actions.filter((a) => a.action.type === "build");
    expect(builds).toHaveLength(0);
  });

  it("build available when player has build card AND rules region", () => {
    const state = draftBothPlayers(createTestState());
    const buildCard = CARD_LIBRARY.find((c) => c.actionIcons.includes("build"))!;
    state.players[0].court.push(buildCard.id);
    state.players[0].courtCardSpies[buildCard.id] = {};
    // Give p1 tribes in kabul so they can rule
    state.board.find((r) => r.id === "kabul")!.tribesByPlayer["p1"] = 3;
    const actions = getLegalActionChoices(state, "p1");
    const builds = actions.filter((a) => a.action.type === "build");
    expect(builds.length).toBeGreaterThan(0);
  });

  it("build costs 2 rupees per piece", () => {
    const state = draftBothPlayers(createTestState());
    const buildCard = CARD_LIBRARY.find((c) => c.actionIcons.includes("build"))!;
    state.players[0].court.push(buildCard.id);
    state.players[0].courtCardSpies[buildCard.id] = {};
    state.board.find((r) => r.id === "kabul")!.tribesByPlayer["p1"] = 3;
    const before = getPlayer(state, "p1").rupees;
    const after = applyAction(state, {
      type: "build", playerId: "p1", cardId: buildCard.id,
      pieces: [{ pieceType: "army", regionId: "kabul" }],
    });
    expect(getPlayer(after, "p1").rupees).toBe(before - 2);
  });
});

// --- Battle restricted to card's region ---

describe("battle action", () => {
  it("battle only in the acting card's region", () => {
    const state = draftBothPlayers(createTestState());
    // Find a card with battle icon
    const battleCard = CARD_LIBRARY.find((c) => c.actionIcons.includes("battle"))!;
    state.players[0].court.push(battleCard.id);
    state.players[0].courtCardSpies[battleCard.id] = {};
    const actions = getLegalActionChoices(state, "p1");
    const battles = actions.filter((a) => a.action.type === "battle");
    // All battle actions should be in battleCard.region
    for (const b of battles) {
      if (b.action.type === "battle") {
        expect(b.action.regionId).toBe(battleCard.region);
      }
    }
  });

  it("battle capped by player presence", () => {
    const state = draftBothPlayers(createTestState());
    const battleCard = CARD_LIBRARY.find((c) => c.actionIcons.includes("battle") && c.rank >= 2)!;
    state.players[0].court.push(battleCard.id);
    state.players[0].courtCardSpies[battleCard.id] = {};
    // Set enemy armies high but player presence to 0 in that region
    const region = state.board.find((r) => r.id === battleCard.region)!;
    region.armies.afghan = 0; // p1's coalition
    region.armies.british = 5; // enemy
    // With 0 presence, battle should still be available (presence check is in handler)
    // But it should remove 0 pieces
    const after = applyAction(state, {
      type: "battle", playerId: "p1", cardId: battleCard.id, regionId: battleCard.region,
    });
    const afterRegion = after.board.find((r) => r.id === battleCard.region)!;
    // 0 presence = 0 removals
    expect(afterRegion.armies.british).toBe(5);
  });
});

// --- Move requires road ---

describe("move action", () => {
  it("army move requires road on border", () => {
    const state = draftBothPlayers(createTestState());
    const moveCard = CARD_LIBRARY.find((c) => c.actionIcons.includes("move"))!;
    state.players[0].court.push(moveCard.id);
    state.players[0].courtCardSpies[moveCard.id] = {};
    // No roads = no army move options
    const actions = getLegalActionChoices(state, "p1");
    const moves = actions.filter((a) => a.action.type === "move_army");
    expect(moves).toHaveLength(0);
  });
});

// --- gain_loyalty removed ---

describe("removed actions", () => {
  it("gain_loyalty does not exist", () => {
    const state = draftBothPlayers(createTestState());
    const actions = getLegalActionChoices(state, "p1");
    const gain = actions.filter((a) => (a.action as any).type === "gain_loyalty");
    expect(gain).toHaveLength(0);
  });
});

// --- Play card resolves impact icons ---

describe("play card", () => {
  it("playing a card initializes spy tracking", () => {
    const state = draftBothPlayers(createTestState());
    state.players[0].hand.push("card_9"); // Afghan Handicrafts, kabul, economic
    const after = applyAction(state, { type: "play_card", playerId: "p1", cardId: "card_9" });
    expect(getPlayer(after, "p1").court).toContain("card_9");
    expect(getPlayer(after, "p1").courtCardSpies["card_9"]).toBeDefined();
  });

  it("impact icons place pieces when card is played", () => {
    const state = draftBothPlayers(createTestState());
    // card_6 (Aminullah Khan Logari): kabul, afghan patriot, impactIcons: [tribe, army, spy]
    state.players[0].hand.push("card_6");
    const kabulBefore = state.board.find((r) => r.id === "kabul")!.armies.afghan;
    const after = applyAction(state, { type: "play_card", playerId: "p1", cardId: "card_6" });
    const kabulAfter = after.board.find((r) => r.id === "kabul")!;
    // Should have gained an army and a tribe from impact icons
    expect(kabulAfter.armies.afghan).toBeGreaterThan(kabulBefore);
    expect(kabulAfter.tribesByPlayer["p1"]).toBeGreaterThan(0);
  });
});

// --- Tax from valid sources ---

describe("tax action", () => {
  it("tax collects up to card rank", () => {
    const state = draftBothPlayers(createTestState());
    // Put rupees on a market card
    state.rupeesOnMarketCards["card_5"] = 3;
    const taxCard = CARD_LIBRARY.find((c) => c.actionIcons.includes("tax"))!;
    state.players[0].court.push(taxCard.id);
    state.players[0].courtCardSpies[taxCard.id] = {};
    const before = getPlayer(state, "p1").rupees;
    const after = applyAction(state, { type: "tax", playerId: "p1", cardId: taxCard.id });
    const collected = getPlayer(after, "p1").rupees - before;
    expect(collected).toBeLessThanOrEqual(taxCard.rank);
    expect(collected).toBeGreaterThan(0);
  });
});

// --- Gift ---

describe("gift action", () => {
  it("gift requires a court card with gift icon", () => {
    const state = draftBothPlayers(createTestState());
    // No court cards = no gift action
    const actions = getLegalActionChoices(state, "p1");
    const gifts = actions.filter((a) => a.action.type === "gift");
    expect(gifts).toHaveLength(0);
  });

  it("gift available with gift-icon court card", () => {
    const state = draftBothPlayers(createTestState());
    const giftCard = CARD_LIBRARY.find((c) => c.actionIcons.includes("gift"))!;
    state.players[0].court.push(giftCard.id);
    state.players[0].courtCardSpies[giftCard.id] = {};
    const actions = getLegalActionChoices(state, "p1");
    const gifts = actions.filter((a) => a.action.type === "gift");
    expect(gifts.length).toBeGreaterThan(0);
  });

  it("first gift costs 2", () => {
    const state = draftBothPlayers(createTestState());
    const giftCard = CARD_LIBRARY.find((c) => c.actionIcons.includes("gift"))!;
    state.players[0].court.push(giftCard.id);
    state.players[0].courtCardSpies[giftCard.id] = {};
    const before = getPlayer(state, "p1").rupees;
    const after = applyAction(state, { type: "gift", playerId: "p1" });
    expect(getPlayer(after, "p1").rupees).toBe(before - 2);
    expect(getPlayer(after, "p1").giftsCylinders).toBe(1);
  });
});

// --- Dominance check ---

describe("dominance check", () => {
  it("not available as a manual action (triggered by event cards only)", () => {
    const state = draftBothPlayers(createTestState());
    const actions = getLegalActionChoices(state, "p1");
    const domChecks = actions.filter((a) => a.action.type === "perform_dominance_check");
    expect(domChecks).toHaveLength(0);
  });
});

// --- Betray costs rupees ---

describe("betray action", () => {
  it("betray costs 2 rupees", () => {
    const state = draftBothPlayers(createTestState());
    const betrayCard = CARD_LIBRARY.find((c) => c.actionIcons.includes("betray"))!;
    state.players[0].court.push(betrayCard.id);
    state.players[0].courtCardSpies[betrayCard.id] = {};
    state.players[0].rupees = 10;
    // p2 has a card with p1's spy
    state.players[1].court.push("card_5");
    state.players[1].courtCardSpies["card_5"] = { p1: 1 };
    const after = applyAction(state, {
      type: "betray", playerId: "p1", cardId: betrayCard.id,
      targetCardId: "card_5", targetPlayerId: "p2",
    });
    expect(getPlayer(after, "p1").rupees).toBe(8);
    expect(getPlayer(after, "p2").court).not.toContain("card_5");
  });

  it("excluded when insufficient rupees", () => {
    const state = draftBothPlayers(createTestState());
    const betrayCard = CARD_LIBRARY.find((c) => c.actionIcons.includes("betray"))!;
    state.players[0].court.push(betrayCard.id);
    state.players[0].courtCardSpies[betrayCard.id] = {};
    state.players[0].rupees = 1;
    state.players[1].court.push("card_5");
    state.players[1].courtCardSpies["card_5"] = { p1: 1 };
    const actions = getLegalActionChoices(state, "p1");
    expect(actions.filter((a) => a.action.type === "betray")).toHaveLength(0);
  });
});

// --- Favored suit bonus actions ---

describe("favored suit bonus", () => {
  it("favored suit card action does not consume AP", () => {
    const state = draftBothPlayers(createTestState());
    state.favoredSuit = "economic";
    // Find an economic tax card
    const taxCard = CARD_LIBRARY.find((c) => c.suit === "economic" && c.actionIcons.includes("tax"))!;
    state.players[0].court.push(taxCard.id);
    state.players[0].courtCardSpies[taxCard.id] = {};
    state.rupeesOnMarketCards["card_1"] = 5;
    const apBefore = state.actionPointsRemaining;
    const after = applyAction(state, { type: "tax", playerId: "p1", cardId: taxCard.id });
    expect(after.actionPointsRemaining).toBe(apBefore); // Not decremented
  });
});

// --- Observations ---

describe("observations", () => {
  it("public observation includes borders", () => {
    const state = draftBothPlayers(createTestState());
    const pub = toPublicObservation(state);
    expect(pub.borders).toHaveLength(9);
  });
  it("player observation includes legal actions", () => {
    const state = draftBothPlayers(createTestState());
    const obs = toPlayerObservation(state, "p1");
    expect(obs.legalActions.length).toBeGreaterThan(0);
  });
});

// --- Card library ---

describe("card library", () => {
  it("100 cards", () => {
    expect(CARD_LIBRARY).toHaveLength(100);
  });
  it("no duplicate IDs", () => {
    const ids = CARD_LIBRARY.map((c) => c.id);
    expect(new Set(ids).size).toBe(100);
  });
  it("all cards have impactIcons", () => {
    for (const card of CARD_LIBRARY) {
      expect(Array.isArray(card.impactIcons), `${card.id} missing impactIcons`).toBe(true);
    }
  });
});

// --- Used card tracking ---

describe("used card per turn", () => {
  it("resets on turn advance", () => {
    const state = draftBothPlayers(createTestState());
    state.usedCardThisTurn = ["card_1"];
    const after = applyAction(state, { type: "pass", playerId: "p1" });
    expect(after.usedCardThisTurn).toEqual([]);
  });
});
