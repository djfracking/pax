# Rules Coverage Checklist

This checklist tracks rules-fidelity progress.

## Core turn system

- [x] Turn order and active player tracking
- [x] Action point scaffolding per turn
- [ ] Full Pax Pamir action economy and sequencing

## Market and card flow

- [x] Data-driven card schema
- [x] Card library validation
- [x] Market buy action with slot cost scaffold
- [x] Market refill from draw deck
- [ ] Full market pricing rules and edge cases

## Court and card effects

- [x] Play-to-court action scaffold
- [x] Card effect hook schema (`on_play`, `on_buy`, etc.)
- [ ] Real effects resolver and conditional timing windows

## Board systems

- [x] Region board state scaffold (armies/roads/tribes)
- [ ] Coalition piece placement/movement/combat
- [ ] Gifts, leverage/influence, loyalty shifts

## Dominance and scoring

- [ ] Dominance check timing
- [ ] Dominance scoring
- [ ] Endgame and tie-break logic

## Card catalog status

- [ ] Import complete real Pax Pamir 2e deck data
- [ ] Verify every card text and icon against source
