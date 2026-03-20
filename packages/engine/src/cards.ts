export type Coalition = "afghan" | "british" | "russian" | "none";
export type Suit = "political" | "intelligence" | "economic" | "military";
export type Region = "kabul" | "kandahar" | "punjab" | "herat" | "persia" | "transcaspia";

export type CardEffectHook =
  | "on_play"
  | "on_buy"
  | "on_turn_start"
  | "on_battle"
  | "on_betray"
  | "on_dominance_check";

export interface CardEffect {
  id: string;
  hook: CardEffectHook;
  ruleText: string;
}

export interface CardDefinition {
  id: string;
  name: string;
  suit: Suit;
  region: Region;
  coalition: Coalition;
  rank: number;
  stars: number;
  effects: CardEffect[];
}

// Milestone scaffolding card set. This shape is ready for full deck data import.
export const CARD_LIBRARY: CardDefinition[] = [
  {
    id: "pamir-001",
    name: "Court Chronicler",
    suit: "political",
    region: "kabul",
    coalition: "none",
    rank: 1,
    stars: 0,
    effects: [{ id: "gain-rupee", hook: "on_play", ruleText: "Gain 1 rupee." }]
  },
  {
    id: "pamir-002",
    name: "Border Quartermaster",
    suit: "military",
    region: "kandahar",
    coalition: "british",
    rank: 1,
    stars: 1,
    effects: [{ id: "road-discount", hook: "on_turn_start", ruleText: "Road actions cost -1." }]
  },
  {
    id: "pamir-003",
    name: "Russian Envoy",
    suit: "political",
    region: "transcaspia",
    coalition: "russian",
    rank: 2,
    stars: 1,
    effects: [{ id: "tax-bonus", hook: "on_buy", ruleText: "Gain 1 rupee after buying." }]
  },
  {
    id: "pamir-004",
    name: "Herat Merchant",
    suit: "economic",
    region: "herat",
    coalition: "none",
    rank: 1,
    stars: 0,
    effects: [{ id: "market-discount", hook: "on_buy", ruleText: "Left-most market card costs 0." }]
  },
  {
    id: "pamir-005",
    name: "Khyber Scout",
    suit: "intelligence",
    region: "kabul",
    coalition: "afghan",
    rank: 1,
    stars: 0,
    effects: [{ id: "spy-mobility", hook: "on_turn_start", ruleText: "You may move a spy 1 region." }]
  },
  {
    id: "pamir-006",
    name: "Punjab Banker",
    suit: "economic",
    region: "punjab",
    coalition: "none",
    rank: 2,
    stars: 0,
    effects: [{ id: "income-boost", hook: "on_play", ruleText: "Gain 2 rupees." }]
  },
  {
    id: "pamir-007",
    name: "Tribal Warlord",
    suit: "military",
    region: "kandahar",
    coalition: "afghan",
    rank: 2,
    stars: 1,
    effects: [{ id: "battle-bonus", hook: "on_battle", ruleText: "First battle action each turn is stronger." }]
  },
  {
    id: "pamir-008",
    name: "Imperial Clerk",
    suit: "political",
    region: "persia",
    coalition: "british",
    rank: 1,
    stars: 0,
    effects: [{ id: "gift-discount", hook: "on_turn_start", ruleText: "Gifts cost 1 less." }]
  },
  {
    id: "pamir-009",
    name: "Caravan Broker",
    suit: "economic",
    region: "herat",
    coalition: "none",
    rank: 1,
    stars: 0,
    effects: [{ id: "market-refund", hook: "on_buy", ruleText: "Refund 1 rupee after purchase." }]
  },
  {
    id: "pamir-010",
    name: "Shadow Operative",
    suit: "intelligence",
    region: "transcaspia",
    coalition: "russian",
    rank: 2,
    stars: 0,
    effects: [{ id: "betray-cost", hook: "on_betray", ruleText: "Betray costs 1 less rupee." }]
  }
];

export function validateCardLibrary(cards: CardDefinition[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.id)) {
      issues.push(`Duplicate id: ${card.id}`);
    }
    seen.add(card.id);
    if (!card.name.trim()) {
      issues.push(`Card ${card.id} has empty name`);
    }
    if (card.rank < 1 || card.rank > 3) {
      issues.push(`Card ${card.id} rank out of range`);
    }
  }
  return issues;
}
