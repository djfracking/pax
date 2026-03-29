# Pax Pamir 2e Rules Specification

This document specifies the exact mechanics for court card actions as implemented
in the engine. Derived from the PP2e rulebook and verified against the BGA implementation.

## Region Adjacency (9 borders)

```
            Transcaspia
           / |        \
     Persia  |         Kabul
         \   |        / |
          Herat------+  |
            \       /   |
           Kandahar    Punjab
              \       /
               +-----+
```

| Border | Regions |
|--------|---------|
| herat_persia | Herat <-> Persia |
| herat_transcaspia | Herat <-> Transcaspia |
| herat_kabul | Herat <-> Kabul |
| herat_kandahar | Herat <-> Kandahar |
| kabul_transcaspia | Kabul <-> Transcaspia |
| kabul_kandahar | Kabul <-> Kandahar |
| kabul_punjab | Kabul <-> Punjab |
| kandahar_punjab | Kandahar <-> Punjab |
| persia_transcaspia | Persia <-> Transcaspia |

## Turn Structure

- Players take up to **2 actions** per turn.
- **Bonus actions** (actions on favored-suit cards) do NOT count against the 2-action limit.
- Each court card can only be used for **one action per turn**, regardless of how many icons it has.
- A player may take 0, 1, or 2 actions.

## Court Card Actions

### Tax

- **Icon:** Tax icon on court card.
- **Cost:** 0 rupees. Costs 1 action (or bonus if favored suit).
- **Mechanic:** Take rupees up to the acting card's **rank** from:
  - Players who have at least one court card associated with a region you **rule**, OR
  - Cards in the market (rupees sitting on market cards).
- **Tax shelter:** Gold stars in your court = number of rupees shielded from being taxed by others.
- **Key detail:** You choose how to split the collection across valid sources, up to the card's rank total.

### Gift

- **Icon:** Gift icon (on loyalty dial, not on court cards).
- **Cost:** 2, 4, or 6 rupees (as marked on the loyalty dial gift spaces).
- **Mechanic:** Place one of your cylinders on an empty gift space on your loyalty dial. Each gift = 1 influence point in your coalition.
- **Key detail:** Gifts are lost when you change loyalty. Gift spaces fill cheapest-first (2, then 4, then 6).

### Build

- **Icon:** Build icon on court card.
- **Cost:** 2 rupees per unit placed. Costs 1 action.
- **Mechanic:** Place up to 3 armies and/or roads in regions you **rule**. Roads go on borders adjacent to ruled regions.
- **Key detail:** Current engine uses 1 rupee per unit. PP2e is 2 rupees per unit.

### Move

- **Icon:** Move icon on court card.
- **Cost:** 0 rupees. Costs 1 action.
- **Mechanic:** For each **rank** of the acting card, move one loyal army or spy.
  - The same unit can be moved multiple times in a single move action.
  - **Armies** require a matching-loyalty road on the border to cross.
  - **Spies** move between court cards (not regions). They move as if all court cards form a single continuous track.
- **Key detail:** Move count = card rank. A rank-2 card gives 2 moves total (could be 2 different pieces or the same piece moved twice).

### Battle

- **Icon:** Battle icon on court card.
- **Cost:** 0 rupees. Costs 1 action.
- **Mechanic:** In one region (the acting card's region), remove any combination of enemy pieces up to the acting card's **rank**.
  - Removable pieces: tribes, spies, roads, armies.
  - **Cannot** remove more pieces than you have armies+spies present in that region.
  - **Cannot** remove your own coalition's armies or roads.
  - **Cannot** remove tribes belonging to players who share your loyalty (but CAN remove their spies).
- **Key detail:** Battle strength is capped by both the card's rank AND your presence in the region (min of the two).

### Betray

- **Icon:** Betray icon on court card.
- **Cost:** **2 rupees.** Costs 1 action.
- **Mechanic:** Discard one card where you have a spy (can be in any player's court, including your own).
  - All spies on the betrayed card are removed.
  - You may accept the betrayed card as a **prize** (tucked behind loyalty dial).
  - If the prize differs from your current loyalty, you must: remove all gifts, prizes, and patriots matching your **previous** loyalty. Then switch loyalty.
- **Key detail:** You need a spy on the target card. Betray costs rupees. Cascading loyalty switch is a major game mechanic.

## Piece Limits

- **Coalition blocks:** 12 per coalition (used for armies and roads).
- **Player cylinders:** 10 usable (11 total, 1 on VP track). Used for tribes, spies, and gifts.
- **Rupees:** 36 total in the game.
- If asked to place a piece and none remain in supply, you must take a piece from anywhere in play (excluding pieces placed this turn).

## Court and Hand Limits

- **Court limit:** 3 + sum of purple stars on cards in your court.
- **Hand limit:** 2 + sum of blue stars on cards in your court.
- Excess discarded during cleanup phase.

## Influence

Influence = 1 (base) + patriots in court + prizes behind dial + gifts on dial.

Used during successful dominance checks to determine VP allocation.

## Dominance Check

### Successful Check
A single coalition has the most blocks in play AND at least **4 more** than every other coalition individually.
- Players loyal to dominant coalition score by influence: 1st = 5 VP, 2nd = 3 VP, 3rd = 1 VP.
- After scoring, **remove all coalition blocks from the board**.

### Unsuccessful Check
No coalition has a 4+ lead.
- Players score by **cylinders in play** (tribes + spies, NOT on player board): 1st = 3 VP, 2nd = 1 VP.
- Ties: pool points and split evenly among tied players.

### Final Dominance Check
All points earned are **doubled**.

### Early End
Game ends immediately if a player has 4+ more VP than second place after any dominance check.

## Favored Suit

- One suit is always favored.
- Actions on favored-suit cards are **bonus actions** (don't count against 2-action limit).
- When **military** is favored, purchase costs are **doubled**.
- Changes when cards with favored-suit impact icons are played.

## Region Control (Ruling)

To rule a region, a player must have:
1. At least one tribe in the region, AND
2. More ruling pieces (tribes + loyal armies) than any other individual player.

Ties = no one rules.

## Play Card (Purchase & Play)

### Purchase
- Cost = column position in market (leftmost = 0 for first row).
- Rupees paid are placed on cards to the left in the same row.
- Cannot purchase a card that had rupees placed on it this turn.
- Military favored suit: costs doubled.

### Play to Court
- If you don't rule the card's region and someone else does, pay bribe = ruler's tribes in that region.
- Resolve impact icons top-to-bottom: armies, roads, tribes, spies, rupees (leverage), favored suit change.
- **Patriots:** If the card is a patriot that doesn't match your loyalty, you must switch loyalty (losing all gifts/prizes/patriots of previous loyalty).

## Overthrow Rule

- If you lose your last tribe in a region, immediately discard all political cards from that region in your court.
- If you lose your last political card of a region, immediately remove all your tribes in that region.

## Hostage Rule

If a single enemy player has more spies on your court card than every other player, the card is "held hostage." To use that card's actions, you must pay 2 rupees to the hostage-holder. Special abilities are never held hostage.
