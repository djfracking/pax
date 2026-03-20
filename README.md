# Pax Pamir Online (Monorepo Starter)

Starter repository for building:

- an online web version of Pax Pamir
- a deterministic game engine
- AI agent self-play and tournament simulation

## Structure

- `packages/engine`: headless rules engine and shared game types
- `apps/server`: authoritative real-time game server (WebSocket + HTTP)
- `apps/web`: browser client UI
- `apps/sim`: bot runner for AI-vs-AI matches

## Quick start

```bash
npm install
npm run dev:server
```

In another terminal:

```bash
npm run dev:web
```

### Useful scripts

- `npm run build`
- `npm run typecheck`
- `npm run dev:sim`

## Current status

This scaffold includes:

- rules-first engine scaffolding with card schema and validation
- player-specific observations that include private hand + legal actions
- legal action generation and click-to-act UI harness
- server endpoints for creating and joining matches
- websocket broadcasting of state and events
- minimal web UI to inspect board state and execute any legal action
- basic simulation CLI with random action selection

The full Pax Pamir 2e rules are not implemented yet; this milestone provides the architecture and UI harness for rules-accurate implementation.
