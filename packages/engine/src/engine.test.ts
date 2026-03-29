import { describe, it, expect } from "vitest";
import {
  createInitialState,
  applyAction,
  getLegalActionChoices,
  getLegalActions,
  toPublicObservation,
  toPlayerObservation,
} from "./engine.js";
import { areRegionsAdjacent, getAdjacentRegions, CARD_LIBRARY } from "./cards.js";
import type { GameState, PlayerState } from "./types.js";
import type { GameAction } from "./actions.js";

// --- Test Helpers ---

function createTestState(overrides: Partial<GameState> = {}): GameState {
  const base = createInitialState("test-game", ["p1", "p2"], 42);
  return { ...base, ...overrides };
}

function advanceToDraft(state: GameState): GameState {
  // Both players choose factions
  let s = applyAction(state, { type: "choose_faction", playerId: "p1", coalition: "afghan" });
  s = applyAction(s, { type: "choose_faction", playerId: "p2", coalition: "british" });
  return s;
}

function getPlayer(state: GameState, playerId: string): PlayerState {
  const p = state.players.find((p) => p.id === playerId);
  if (!p) throw new Error(`Player ${playerId} not found`);
  return p;
}

// --- Region Adjacency Tests ---

describe("Region adjacency", () => {
  it("kabul is adjacent to herat, kandahar, punjab, transcaspia", () => {
    expect(areRegionsAdjacent("kabul", "herat")).toBe(true);
    expect(areRegionsAdjacent("kabul", "kandahar")).toBe(true);
    expect(areRegionsAdjacent("kabul", "punjab")).toBe(true);
    expect(areRegionsAdjacent("kabul", "transcaspia")).toBe(true);
  });

  it("kabul is NOT adjacent to persia", () => {
    expect(areRegionsAdjacent("kabul", "persia")).toBe(false);
  });

  it("persia is adjacent to herat and transcaspia only", () => {
    const adj = getAdjacentRegions("persia");
    expect(adj.sort()).toEqual(["herat", "transcaspia"]);
  });

  it("adjacency is symmetric", () => {
    expect(areRegionsAdjacent("herat", "kabul")).toBe(true);
    expect(areRegionsAdjacent("kabul", "herat")).toBe(true);
  });

  it("punjab has 2 adjacent regions", () => {
    const adj = getAdjacentRegions("punjab");
    expect(adj.sort()).toEqual(["kabul", "kandahar"]);
  });
});

// --- Initialization Tests ---

describe("createInitialState", () => {
  it("creates a valid initial state", () => {
    const state = createTestState();
    expect(state.phase).toBe("faction_draft");
    expect(state.players).toHaveLength(2);
    expect(state.board).toHaveLength(6);
  });

  it("initializes players with correct defaults", () => {
    const state = createTestState();
    const p1 = getPlayer(state, "p1");
    expect(p1.rupees).toBe(4);
    expect(p1.coalition).toBe("none");
    expect(p1.influence).toEqual({ afghan: 0, british: 0, russian: 0 });
    expect(p1.courtCardSpies).toEqual({});
    expect(p1.giftsCylinders).toBe(0);
  });

  it("throws for less than 2 players", () => {
    expect(() => createInitialState("test", ["p1"])).toThrow("At least two players");
  });
});

// --- Faction Draft Tests ---

describe("faction draft", () => {
  it("transitions to main phase after all players choose", () => {
    const state = createTestState();
    const afterDraft = advanceToDraft(state);
    expect(afterDraft.phase).toBe("main");
    expect(afterDraft.turn).toBe(1);
    expect(afterDraft.actionPointsRemaining).toBe(2);
  });

  it("sets coalition and loyalty on faction choice", () => {
    const state = createTestState();
    const after = applyAction(state, { type: "choose_faction", playerId: "p1", coalition: "russian" });
    const p1 = getPlayer(after, "p1");
    expect(p1.coalition).toBe("russian");
    expect(p1.loyalty).toBe(1);
  });
});

// --- isActionEqual Tests ---

describe("isActionEqual (via applyAction legality)", () => {
  it("rejects illegal actions", () => {
    const state = advanceToDraft(createTestState());
    expect(() =>
      applyAction(state, { type: "build_army", playerId: "p2", regionId: "kabul" })
    ).toThrow("Illegal action");
  });

  it("pass action works for current player", () => {
    const state = advanceToDraft(createTestState());
    const after = applyAction(state, { type: "pass", playerId: "p1" });
    expect(after.currentPlayerId).toBe("p2");
  });

  it("take_rupee works for current player", () => {
    const state = advanceToDraft(createTestState());
    const before = getPlayer(state, "p1").rupees;
    const after = applyAction(state, { type: "take_rupee", playerId: "p1" });
    expect(getPlayer(after, "p1").rupees).toBe(before + 1);
  });
});

// --- Build Rupee Validation Tests ---

describe("build rupee validation", () => {
  it("excludes build_army when player has < 2 rupees", () => {
    let state = advanceToDraft(createTestState());
    // Set p1 rupees to 1
    const p1 = state.players.find((p) => p.id === "p1")!;
    p1.rupees = 1;
    const actions = getLegalActionChoices(state, "p1");
    const buildActions = actions.filter(
      (a) => a.action.type === "build_army" || a.action.type === "build_road"
    );
    expect(buildActions).toHaveLength(0);
  });

  it("includes build actions when player has >= 2 rupees", () => {
    const state = advanceToDraft(createTestState());
    const p1 = getPlayer(state, "p1");
    expect(p1.rupees).toBeGreaterThanOrEqual(2);
    const actions = getLegalActionChoices(state, "p1");
    const buildActions = actions.filter(
      (a) => a.action.type === "build_army" || a.action.type === "build_road"
    );
    expect(buildActions.length).toBeGreaterThan(0);
  });

  it("build_army costs 2 rupees", () => {
    const state = advanceToDraft(createTestState());
    const before = getPlayer(state, "p1").rupees;
    const after = applyAction(state, { type: "build_army", playerId: "p1", regionId: "kabul" });
    expect(getPlayer(after, "p1").rupees).toBe(before - 2);
  });
});

// --- Clone State Tests ---

describe("cloneState isolation", () => {
  it("mutations to cloned state don't affect original", () => {
    const state = advanceToDraft(createTestState());
    // Give p1 a court card with spy tracking
    state.players[0].court.push("card_9");
    state.players[0].courtCardSpies["card_9"] = { p2: 1 };

    const after = applyAction(state, { type: "take_rupee", playerId: "p1" });

    // Original spy data should be untouched
    expect(state.players[0].courtCardSpies["card_9"]).toEqual({ p2: 1 });
    expect(after.players[0].courtCardSpies["card_9"]).toEqual({ p2: 1 });
  });
});

// --- Play Card Tests ---

describe("play_card", () => {
  it("initializes courtCardSpies entry for played card", () => {
    let state = advanceToDraft(createTestState());
    // Put a card in p1's hand
    state.players[0].hand.push("card_9");

    const after = applyAction(state, { type: "play_card", playerId: "p1", cardId: "card_9" });
    const p1 = getPlayer(after, "p1");
    expect(p1.court).toContain("card_9");
    expect(p1.courtCardSpies["card_9"]).toEqual({});
  });
});

// --- Court Card Action Tests ---

describe("tax action", () => {
  it("collects rupees equal to card rank", () => {
    let state = advanceToDraft(createTestState());
    // Put a tax card in p1's court
    state.players[0].court.push("card_9"); // Afghan Handicrafts: tax+move, rank 1
    state.players[0].courtCardSpies["card_9"] = {};
    const before = getPlayer(state, "p1").rupees;

    const after = applyAction(state, { type: "tax", playerId: "p1", cardId: "card_9" });
    expect(getPlayer(after, "p1").rupees).toBe(before + 1);
  });

  it("appears in legal actions when player has tax-icon card in court", () => {
    let state = advanceToDraft(createTestState());
    state.players[0].court.push("card_9"); // has tax icon
    state.players[0].courtCardSpies["card_9"] = {};
    const actions = getLegalActionChoices(state, "p1");
    const taxActions = actions.filter((a) => a.action.type === "tax");
    expect(taxActions.length).toBeGreaterThan(0);
  });
});

describe("gift action", () => {
  it("costs 2 rupees for first gift", () => {
    let state = advanceToDraft(createTestState());
    const before = getPlayer(state, "p1").rupees;
    const after = applyAction(state, { type: "gift", playerId: "p1" });
    const p1 = getPlayer(after, "p1");
    expect(p1.rupees).toBe(before - 2);
    expect(p1.giftsCylinders).toBe(1);
    expect(p1.influence.afghan).toBe(1);
  });

  it("costs 4 rupees for second gift", () => {
    let state = advanceToDraft(createTestState());
    state.players[0].giftsCylinders = 1;
    state.players[0].rupees = 10;
    const after = applyAction(state, { type: "gift", playerId: "p1" });
    expect(getPlayer(after, "p1").rupees).toBe(6); // 10 - 4
    expect(getPlayer(after, "p1").giftsCylinders).toBe(2);
  });

  it("excluded from legal actions when insufficient rupees", () => {
    let state = advanceToDraft(createTestState());
    state.players[0].rupees = 1;
    const actions = getLegalActionChoices(state, "p1");
    const giftActions = actions.filter((a) => a.action.type === "gift");
    expect(giftActions).toHaveLength(0);
  });
});

describe("battle action", () => {
  it("removes enemy armies from region", () => {
    let state = advanceToDraft(createTestState());
    state.players[0].court.push("card_2"); // battle icon, rank 2
    state.players[0].courtCardSpies["card_2"] = {};
    // Kabul has 1 british + 1 russian army by default
    const after = applyAction(state, {
      type: "battle", playerId: "p1", cardId: "card_2", regionId: "kabul"
    });
    const kabul = after.board.find((r) => r.id === "kabul")!;
    // Rank 2 removes 2 pieces: 1 british army + 1 russian army
    expect(kabul.armies.british).toBe(0);
    expect(kabul.armies.russian).toBe(0);
    // Afghan army untouched (p1's coalition)
    expect(kabul.armies.afghan).toBe(1);
  });

  it("appears in legal actions when enemy pieces exist in region", () => {
    let state = advanceToDraft(createTestState());
    state.players[0].court.push("card_2"); // battle icon
    state.players[0].courtCardSpies["card_2"] = {};
    const actions = getLegalActionChoices(state, "p1");
    const battleActions = actions.filter((a) => a.action.type === "battle");
    expect(battleActions.length).toBeGreaterThan(0);
  });
});

describe("move_army action", () => {
  it("moves army between adjacent regions", () => {
    let state = advanceToDraft(createTestState());
    state.players[0].court.push("card_2"); // move icon, rank 2
    state.players[0].courtCardSpies["card_2"] = {};
    // Kabul starts with 1 afghan army
    const after = applyAction(state, {
      type: "move_army", playerId: "p1", cardId: "card_2",
      fromRegionId: "kabul", toRegionId: "herat"
    });
    const kabul = after.board.find((r) => r.id === "kabul")!;
    const herat = after.board.find((r) => r.id === "herat")!;
    expect(kabul.armies.afghan).toBe(0);
    expect(herat.armies.afghan).toBe(2); // 1 existing + 1 moved
  });

  it("rejects move between non-adjacent regions", () => {
    let state = advanceToDraft(createTestState());
    state.players[0].court.push("card_2");
    state.players[0].courtCardSpies["card_2"] = {};
    // Kabul is NOT adjacent to persia
    expect(() =>
      applyAction(state, {
        type: "move_army", playerId: "p1", cardId: "card_2",
        fromRegionId: "kabul", toRegionId: "persia"
      })
    ).toThrow("Illegal action");
  });
});

describe("move_spy action", () => {
  it("moves spy between court cards", () => {
    let state = advanceToDraft(createTestState());
    // p1 has move card and a spy on p2's court card
    state.players[0].court.push("card_34"); // move icon
    state.players[0].courtCardSpies["card_34"] = {};
    state.players[1].court.push("card_5");
    state.players[1].courtCardSpies["card_5"] = { p1: 1 };
    state.players[1].court.push("card_6");
    state.players[1].courtCardSpies["card_6"] = {};

    const after = applyAction(state, {
      type: "move_spy", playerId: "p1", cardId: "card_34",
      fromCardId: "card_5", toCardId: "card_6"
    });

    expect(after.players[1].courtCardSpies["card_5"]["p1"] ?? 0).toBe(0);
    expect(after.players[1].courtCardSpies["card_6"]["p1"]).toBe(1);
  });
});

describe("betray action", () => {
  it("removes target card from opponent court and costs 2 rupees", () => {
    let state = advanceToDraft(createTestState());
    state.players[0].court.push("card_34"); // betray icon
    state.players[0].courtCardSpies["card_34"] = {};
    state.players[0].rupees = 10;
    // p2 has a card with p1's spy on it
    state.players[1].court.push("card_5");
    state.players[1].courtCardSpies["card_5"] = { p1: 1 };

    const after = applyAction(state, {
      type: "betray", playerId: "p1", cardId: "card_34",
      targetCardId: "card_5", targetPlayerId: "p2"
    });

    expect(getPlayer(after, "p1").rupees).toBe(8); // 10 - 2
    expect(getPlayer(after, "p2").court).not.toContain("card_5");
    expect(after.discard).toContain("card_5");
  });

  it("excluded from legal actions when insufficient rupees", () => {
    let state = advanceToDraft(createTestState());
    state.players[0].court.push("card_34"); // betray icon
    state.players[0].courtCardSpies["card_34"] = {};
    state.players[0].rupees = 1; // not enough for betray
    state.players[1].court.push("card_5");
    state.players[1].courtCardSpies["card_5"] = { p1: 1 };

    const actions = getLegalActionChoices(state, "p1");
    const betrayActions = actions.filter((a) => a.action.type === "betray");
    expect(betrayActions).toHaveLength(0);
  });

  it("excluded when no spy on any opponent card", () => {
    let state = advanceToDraft(createTestState());
    state.players[0].court.push("card_34"); // betray icon
    state.players[0].courtCardSpies["card_34"] = {};
    state.players[0].rupees = 10;
    // p2 has cards but no p1 spies
    state.players[1].court.push("card_5");
    state.players[1].courtCardSpies["card_5"] = {};

    const actions = getLegalActionChoices(state, "p1");
    const betrayActions = actions.filter((a) => a.action.type === "betray");
    expect(betrayActions).toHaveLength(0);
  });
});

// --- Dominance Check Tests ---

describe("dominance check", () => {
  it("successful check awards VP by influence", () => {
    let state = advanceToDraft(createTestState());
    // Give afghan a big lead: +10 armies in kabul
    const kabul = state.board.find((r) => r.id === "kabul")!;
    kabul.armies.afghan = 12;
    kabul.armies.british = 1;
    kabul.armies.russian = 1;

    const after = applyAction(state, { type: "perform_dominance_check", playerId: "p1" });
    expect(after.lastDominanceResult?.dominantCoalition).toBe("afghan");
    // p1 is afghan, should get VP
    expect(getPlayer(after, "p1").victoryPoints).toBeGreaterThan(0);
  });

  it("unsuccessful check awards VP by cylinders in play", () => {
    let state = advanceToDraft(createTestState());
    // All coalitions are roughly equal (default state)
    // Add some tribes for p1
    state.board[0].tribesByPlayer["p1"] = 3;

    const after = applyAction(state, { type: "perform_dominance_check", playerId: "p1" });
    expect(after.lastDominanceResult?.dominantCoalition).toBeNull();
    // p1 has most cylinders, should get 3 VP
    expect(getPlayer(after, "p1").victoryPoints).toBe(3);
  });
});

// --- Observation Tests ---

describe("observations", () => {
  it("public observation hides player hands", () => {
    const state = advanceToDraft(createTestState());
    state.players[0].hand.push("card_9");
    const pub = toPublicObservation(state);
    // PublicObservation players omit 'hand'
    expect((pub.players[0] as any).hand).toBeUndefined();
  });

  it("player observation includes self hand and legal actions", () => {
    const state = advanceToDraft(createTestState());
    state.players[0].hand.push("card_9");
    const obs = toPlayerObservation(state, "p1");
    expect(obs.self.hand).toContain("card_9");
    expect(obs.legalActions.length).toBeGreaterThan(0);
  });

  it("player observation includes influence and spy data", () => {
    const state = advanceToDraft(createTestState());
    state.players[0].influence.afghan = 2;
    const pub = toPublicObservation(state);
    expect(pub.players[0].influence.afghan).toBe(2);
  });
});

// --- Integration Tests ---

describe("multi-action sequences", () => {
  it("build army then move it", () => {
    let state = advanceToDraft(createTestState());
    state.players[0].court.push("card_2"); // move icon
    state.players[0].courtCardSpies["card_2"] = {};

    // Build afghan army in kabul
    state = applyAction(state, { type: "build_army", playerId: "p1", regionId: "kabul" });
    const kabulAfter = state.board.find((r) => r.id === "kabul")!;
    expect(kabulAfter.armies.afghan).toBe(2); // 1 initial + 1 built

    // p1 used action point, now p2's turn. Advance back to p1.
    state = applyAction(state, { type: "pass", playerId: "p1" });
    state = applyAction(state, { type: "pass", playerId: "p2" });

    // Move army from kabul to herat
    state = applyAction(state, {
      type: "move_army", playerId: "p1", cardId: "card_2",
      fromRegionId: "kabul", toRegionId: "herat"
    });
    expect(state.board.find((r) => r.id === "kabul")!.armies.afghan).toBe(1);
    expect(state.board.find((r) => r.id === "herat")!.armies.afghan).toBe(2);
  });

  it("gift increases influence for dominance check", () => {
    let state = advanceToDraft(createTestState());
    state = applyAction(state, { type: "gift", playerId: "p1" });
    const p1 = getPlayer(state, "p1");
    expect(p1.giftsCylinders).toBe(1);
    expect(p1.influence.afghan).toBe(1);
  });
});

// --- Card Library Tests ---

describe("card library", () => {
  it("most cards have action icons (2 exceptions: Dost Mohammad, Fath-Ali Shah)", () => {
    const noIconCards = CARD_LIBRARY.filter((c) => c.actionIcons.length === 0);
    expect(noIconCards.map((c) => c.id).sort()).toEqual(["card_7", "card_76"]);
  });

  it("all cards have valid ranks", () => {
    for (const card of CARD_LIBRARY) {
      expect(card.rank).toBeGreaterThanOrEqual(1);
      expect(card.rank).toBeLessThanOrEqual(3);
    }
  });

  it("no duplicate card IDs", () => {
    const ids = CARD_LIBRARY.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// --- Used Card Per Turn Tests ---

describe("used card tracking", () => {
  it("card used for tax cannot be used again this turn", () => {
    let state = advanceToDraft(createTestState());
    state.players[0].court.push("card_9"); // tax icon
    state.players[0].courtCardSpies["card_9"] = {};

    state = applyAction(state, { type: "tax", playerId: "p1", cardId: "card_9" });
    expect(state.usedCardThisTurn).toContain("card_9");

    // Should not have tax action for card_9 anymore
    const actions = getLegalActionChoices(state, "p1");
    const taxActions = actions.filter(
      (a) => a.action.type === "tax" && a.action.cardId === "card_9"
    );
    expect(taxActions).toHaveLength(0);
  });

  it("used cards reset on turn advance", () => {
    let state = advanceToDraft(createTestState());
    state.usedCardThisTurn = ["card_9"];
    state = applyAction(state, { type: "pass", playerId: "p1" });
    expect(state.usedCardThisTurn).toEqual([]);
  });
});
