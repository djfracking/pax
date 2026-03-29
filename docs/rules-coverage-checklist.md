# Rules Coverage Checklist

This checklist tracks rules-fidelity progress.

## Core turn system

- [x] Turn order and active player tracking
- [x] Action point scaffolding per turn
- [x] Used-card-per-turn tracking (each court card used once per turn)
- [ ] Favored suit bonus actions (don't count against 2-action limit)
- [ ] Full Pax Pamir action economy and sequencing

## Market and card flow

- [x] Data-driven card schema
- [x] Card library validation
- [x] Market buy action with slot cost scaffold
- [x] Market refill from draw deck
- [ ] Full market pricing rules and edge cases
- [ ] Military favored suit doubles purchase cost
- [ ] Rupees placed on leftward cards during purchase

## Court and card effects

- [x] Play-to-court action scaffold
- [x] Spy tracking initialized on play-to-court
- [x] Card effect hook schema (`on_play`, `on_buy`, etc.)
- [ ] Real effects resolver and conditional timing windows
- [ ] Impact icon resolution on play (armies, roads, tribes, spies, leverage, favored suit)
- [ ] Patriot loyalty enforcement on play

## Board systems

- [x] Region board state scaffold (armies/roads/tribes)
- [x] Region adjacency graph (9 borders verified against PP2e map)
- [x] Build army/road actions (2 rupees per unit)
- [x] Move army between adjacent regions
- [x] Move spy between court cards
- [x] Battle action (remove enemy pieces up to card rank)
- [x] Betray action (discard card with spy, costs 2 rupees)
- [x] Tax action (collect rupees up to card rank, simplified targeting)
- [x] Gift action (purchase influence, escalating cost 2/4/6)
- [ ] Full tax targeting (from players in ruled regions, from market)
- [ ] Battle presence cap (can't remove more than your armies+spies)
- [ ] Road requirement for army movement
- [ ] Betray prize acceptance and loyalty cascade
- [ ] Hostage rule (spy majority on court card)
- [ ] Overthrow rule (lose last tribe/political card cascade)

## Influence and loyalty

- [x] Influence tracking per coalition
- [x] Gift cylinders as influence points
- [ ] Influence = 1 base + patriots + prizes + gifts
- [ ] Coalition switching mechanics
- [ ] Court card and hand size limits (3+purple stars, 2+blue stars)

## Dominance and scoring

- [x] Dominance check action
- [x] Successful check: coalition 4+ lead, score by influence
- [x] Unsuccessful check: score by cylinders in play (tribes + spies)
- [ ] Remove all coalition blocks after successful check
- [ ] Final dominance check points doubled
- [ ] Early end (4+ VP lead after check)
- [ ] Endgame and tie-break logic

## Piece limits

- [ ] Coalition block pools (12 per coalition)
- [ ] Player cylinder pools (10 usable)
- [ ] Piece recycling when supply empty

## Card catalog status

- [ ] Import complete real Pax Pamir 2e deck data
- [ ] Verify every card text and icon against source
