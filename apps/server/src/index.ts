import Fastify from "fastify";
import cors from "@fastify/cors";
import { WebSocketServer } from "ws";
import {
  applyAction,
  createInitialState,
  getLegalActionChoices,
  getLegalActions,
  toPlayerObservation,
  toPublicObservation,
  CARD_LIBRARY,
  EVENT_CARDS,
  type GameAction,
  type GameState,
  type PublicObservation,
} from "@pax/engine";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
const port = Number(process.env.PORT ?? 4000);

const CARD_BY_ID = new Map(CARD_LIBRARY.map((c) => [c.id, c]));
const EVENT_BY_ID = new Map(EVENT_CARDS.map((c) => [c.id, c]));

const games = new Map<string, GameState>();
const gameEvents = new Map<string, GameEvent[]>();
const autoplayTimers = new Map<string, NodeJS.Timeout>();

type GameEvent = {
  turn: number;
  action: GameAction;
  note: string;
  at: string;
  stateSnapshot: GameState;
};

app.get("/health", async () => ({ ok: true }));

app.post<{ Body: { gameId: string; playerIds: string[] } }>("/games", async (request, reply) => {
  const { gameId, playerIds } = request.body;
  if (games.has(gameId)) {
    return reply.status(409).send({ error: "Game already exists." });
  }
  const state = createInitialState(gameId, playerIds);
  games.set(gameId, state);
  gameEvents.set(gameId, []);
  return { state: toFullState(state) };
});

app.get<{ Params: { gameId: string } }>("/games/:gameId", async (request, reply) => {
  const state = games.get(request.params.gameId);
  if (!state) {
    return reply.status(404).send({ error: "Game not found." });
  }
  return { state: toFullState(state) };
});

app.get<{ Params: { gameId: string; playerId: string } }>(
  "/games/:gameId/legal-actions/:playerId",
  async (request, reply) => {
    const state = games.get(request.params.gameId);
    if (!state) {
      return reply.status(404).send({ error: "Game not found." });
    }
    return {
      actions: getLegalActions(state, request.params.playerId),
      choices: getLegalActionChoices(state, request.params.playerId)
    };
  }
);

app.get<{ Params: { gameId: string; playerId: string } }>(
  "/games/:gameId/view/:playerId",
  async (request, reply) => {
    const state = games.get(request.params.gameId);
    if (!state) {
      return reply.status(404).send({ error: "Game not found." });
    }
    try {
      return { view: toPlayerObservation(state, request.params.playerId) };
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message });
    }
  }
);

app.get<{ Params: { gameId: string } }>("/games/:gameId/events", async (request, reply) => {
  if (!games.has(request.params.gameId)) {
    return reply.status(404).send({ error: "Game not found." });
  }
  const events = gameEvents.get(request.params.gameId) ?? [];
  // Return events without state snapshots for the list view (too large)
  return {
    events: events.map(({ stateSnapshot, ...rest }) => rest)
  };
});

app.get<{ Params: { gameId: string; index: string } }>(
  "/games/:gameId/events/:index/state",
  async (request, reply) => {
    const events = gameEvents.get(request.params.gameId);
    if (!events) return reply.status(404).send({ error: "Game not found." });
    const idx = parseInt(request.params.index, 10);
    if (idx < 0 || idx >= events.length) return reply.status(404).send({ error: "Event not found." });
    return { state: toFullState(events[idx].stateSnapshot) };
  }
);

app.post<{ Params: { gameId: string }; Body: { action: GameAction } }>(
  "/games/:gameId/action",
  async (request, reply) => {
    const state = games.get(request.params.gameId);
    if (!state) {
      return reply.status(404).send({ error: "Game not found." });
    }
    try {
      const nextState = applyAction(state, request.body.action);
      games.set(request.params.gameId, nextState);
      appendEvent(request.params.gameId, state.turn, request.body.action, state);
      broadcastGameUpdate(request.params.gameId, nextState);
      return { state: toFullState(nextState) };
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }
  }
);

app.post<{ Params: { gameId: string }; Body: { intervalMs?: number } }>(
  "/games/:gameId/autoplay/start",
  async (request, reply) => {
    const state = games.get(request.params.gameId);
    if (!state) {
      return reply.status(404).send({ error: "Game not found." });
    }
    if (autoplayTimers.has(request.params.gameId)) {
      return { status: "already_running" };
    }
    const intervalMs = Math.max(200, Number(request.body?.intervalMs ?? 800));
    const timer = setInterval(() => stepBotTurn(request.params.gameId), intervalMs);
    autoplayTimers.set(request.params.gameId, timer);
    broadcastSystemEvent(request.params.gameId, `Autoplay started (${intervalMs}ms)`);
    return { status: "started", intervalMs };
  }
);

app.post<{ Params: { gameId: string } }>("/games/:gameId/autoplay/stop", async (request, reply) => {
  if (!games.has(request.params.gameId)) {
    return reply.status(404).send({ error: "Game not found." });
  }
  stopAutoplay(request.params.gameId);
  broadcastSystemEvent(request.params.gameId, "Autoplay stopped");
  return { status: "stopped" };
});

await app.listen({ port, host: "0.0.0.0" });
const wss = new WebSocketServer({ server: app.server });
const subscriptions = new Map<string, Set<import("ws").WebSocket>>();

wss.on("connection", (socket) => {
  socket.on("message", (raw) => {
    try {
      const payload = JSON.parse(String(raw)) as { type: "subscribe"; gameId: string };
      if (payload.type !== "subscribe") return;
      const set = subscriptions.get(payload.gameId) ?? new Set();
      set.add(socket);
      subscriptions.set(payload.gameId, set);
      const state = games.get(payload.gameId);
      if (state) {
        socket.send(JSON.stringify({ type: "state", gameId: payload.gameId, state: toFullState(state) }));
      }
    } catch { /* Ignore malformed */ }
  });
  socket.on("close", () => {
    for (const sockets of subscriptions.values()) sockets.delete(socket);
  });
});

// Spectator mode: broadcast full state including hands
function toFullState(state: GameState): any {
  const pub = toPublicObservation(state);
  return {
    ...pub,
    // Override players to include hands
    players: state.players.map((p) => ({
      ...p,
      hand: [...p.hand],
      influence: { ...p.influence },
      courtCardSpies: Object.fromEntries(
        Object.entries(p.courtCardSpies).map(([k, v]) => [k, { ...v }])
      ),
    })),
  };
}

function broadcastGameUpdate(gameId: string, state: GameState): void {
  const sockets = subscriptions.get(gameId);
  if (!sockets || sockets.size === 0) return;
  const data = JSON.stringify({ type: "state", gameId, state: toFullState(state) });
  for (const socket of sockets) socket.send(data);
}

function broadcastSystemEvent(gameId: string, message: string): void {
  const sockets = subscriptions.get(gameId);
  if (!sockets || sockets.size === 0) return;
  const data = JSON.stringify({ type: "info", gameId, message });
  for (const socket of sockets) socket.send(data);
}

function appendEvent(gameId: string, turn: number, action: GameAction, stateBeforeAction: GameState): void {
  const events = gameEvents.get(gameId) ?? [];
  events.push({
    turn,
    action,
    note: describeAction(action),
    at: new Date().toISOString(),
    stateSnapshot: stateBeforeAction,
  });
  gameEvents.set(gameId, events);
}

function getCardName(cardId: string): string {
  const court = CARD_BY_ID.get(cardId);
  if (court) return court.name;
  const event = EVENT_BY_ID.get(cardId);
  if (event) return event.name;
  return cardId;
}

function describeAction(action: GameAction): string {
  switch (action.type) {
    case "buy_card": return `${action.playerId} buys row ${action.row + 1}, slot ${action.column + 1}`;
    case "play_card": return `${action.playerId} plays ${getCardName(action.cardId)}`;
    case "choose_faction": return `${action.playerId} chooses ${action.coalition}`;
    case "take_rupee": return `${action.playerId} takes 1 rupee`;
    case "build": {
      const cardName = getCardName(action.cardId);
      const pieces = action.pieces.map((p) => p.pieceType === "army" ? `army in ${p.regionId}` : `road on ${p.borderId}`).join(", ");
      return `${action.playerId} builds ${pieces} using ${cardName}`;
    }
    case "perform_dominance_check": return `${action.playerId} performs dominance check`;
    case "tax": return `${action.playerId} taxes with ${getCardName(action.cardId)}`;
    case "gift": return `${action.playerId} purchases gift`;
    case "start_move": return `${action.playerId} starts moving with ${getCardName(action.cardId)}`;
    case "move_army": return `${action.playerId} moves army ${action.fromRegionId} → ${action.toRegionId}`;
    case "move_spy": return `${action.playerId} moves spy from ${getCardName(action.fromCardId)} to ${getCardName(action.toCardId)}`;
    case "end_move": return `${action.playerId} ends move`;
    case "battle": return `${action.playerId} battles in ${action.regionId} using ${getCardName(action.cardId)}`;
    case "betray": return `${action.playerId} betrays ${getCardName(action.targetCardId)} in ${action.targetPlayerId}'s court`;
    case "pass": return `${action.playerId} passes`;
  }
}

function chooseBotAction(state: GameState, playerId: string): GameAction | null {
  const actions = getLegalActions(state, playerId);
  if (actions.length === 0) return null;
  const nonPass = actions.filter((a) => a.type !== "pass");
  if (nonPass.length > 0) {
    const idx = Math.floor(Math.random() * nonPass.length);
    return nonPass[idx];
  }
  return actions[0];
}

function stepBotTurn(gameId: string): void {
  const state = games.get(gameId);
  if (!state) { stopAutoplay(gameId); return; }
  if (state.isFinished) {
    stopAutoplay(gameId);
    broadcastSystemEvent(gameId, `Game finished! Winner: ${state.winnerPlayerId ?? "none"}`);
    return;
  }
  if (state.turn > 100) {
    stopAutoplay(gameId);
    broadcastSystemEvent(gameId, "Autoplay reached max turn limit (100)");
    return;
  }
  const action = chooseBotAction(state, state.currentPlayerId);
  if (!action) {
    stopAutoplay(gameId);
    broadcastSystemEvent(gameId, "No legal actions left");
    return;
  }
  try {
    const prev = state;
    const next = applyAction(state, action);
    games.set(gameId, next);
    appendEvent(gameId, prev.turn, action, prev);
    broadcastGameUpdate(gameId, next);
  } catch (error) {
    stopAutoplay(gameId);
    app.log.error(error, `Autoplay failed for ${gameId}`);
  }
}

function stopAutoplay(gameId: string): void {
  const timer = autoplayTimers.get(gameId);
  if (!timer) return;
  clearInterval(timer);
  autoplayTimers.delete(gameId);
}

app.log.info(`Server listening on port ${port}`);
