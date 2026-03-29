# TODOs

## Piece Pool Limits
**What:** Add finite piece pool tracking (12 armies, 6 roads per coalition per PP2e) and enforce limits on build_army/build_road.
**Why:** Battle balance depends on scarcity. Without limits, building has no strategic cost and battle outcomes don't matter as much.
**Context:** Outside voice flagged during eng review 2026-03-29. The current engine allows infinite pieces. Fix requires adding pool counts to GameState and checking in getLegalActionChoices + applyAction.
**Depends on:** Nothing. Independent change.
**Added:** 2026-03-29 | Branch: feature/initial-contribution

## Court Card Limits
**What:** Enforce court card limits based on player influence level.
**Why:** Court size is a key resource constraint in PP2e. Without it, players can hoard unlimited cards, breaking play_card and betray balance.
**Context:** PP2e ties court size to influence track. Betray (removing opponent cards) frees slots, making it strategically meaningful. Requires the influence system (being added for gift action).
**Depends on:** Influence system landing (in current PR).
**Added:** 2026-03-29 | Branch: feature/initial-contribution

## Communicate with Repo Owner
**What:** After PR1 (engine foundations) is submitted, open an issue/discussion on djfracking/pax describing the court card actions plan (PR2 scope) and proposed rule interpretations.
**Why:** This is someone else's repo. Getting buy-in before writing 400+ lines of game logic is respectful and prevents wasted work. The owner may have opinions on rule interpretation, data model choices, or prioritization.
**Context:** CEO review flagged this. PR1 is uncontroversial (data model + tests + bug fix). PR2 is the real game logic where rule interpretation matters. Share the rules-spec.md as part of the discussion.
**Depends on:** PR1 submitted.
**Priority:** P1 (do between PR1 and PR2)
**Added:** 2026-03-29 | Branch: feature/initial-contribution

## Turn Structure Audit
**What:** Audit and correct the turn/action-point model against PP2e rules. PP2e distinguishes "card actions" (using court card icons) from other types, and some actions (like take_rupee) may not be standard actions.
**Why:** Wrong turn structure means every action's legality generation is subtly wrong. The current engine treats all actions as "1 AP" uniformly.
**Context:** Outside voice flagged during eng review. The existing simplified model works for the scaffold but will need correction as more PP2e rules are implemented. This may require restructuring how existing actions interact with action points.
**Depends on:** Rulebook verification.
**Added:** 2026-03-29 | Branch: feature/initial-contribution
