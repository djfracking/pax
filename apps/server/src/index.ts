import Fastify from "fastify";
import { WebSocketServer } from "ws";
import {
  applyAction,
  createInitialState,
  getLegalActionChoices,
  getLegalActions,
  toPlayerObservation,
  toPublicObservation,
  type GameAction,
  type GameState
} from "@pax/engine";

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 4000);

const games = new Map<string, GameState>();
const gameEvents = new Map<string, GameEvent[]>();
const autoplayTimers = new Map<string, NodeJS.Timeout>();

type GameEvent = {
  turn: number;
  action: GameAction;
  note: string;
  at: string;
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
  return { state: toPublicObservation(state) };
});

app.get<{ Params: { gameId: string } }>("/games/:gameId", async (request, reply) => {
  const state = games.get(request.params.gameId);
  if (!state) {
    return reply.status(404).send({ error: "Game not found." });
  }
  return { state: toPublicObservation(state) };
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
  return { events: gameEvents.get(request.params.gameId) ?? [] };
});

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
      appendEvent(request.params.gameId, nextState.turn - 1, request.body.action);
      broadcastGameUpdate(request.params.gameId, nextState);
      return { state: toPublicObservation(nextState) };
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
      if (payload.type !== "subscribe") {
        return;
      }
      const set = subscriptions.get(payload.gameId) ?? new Set();
      set.add(socket);
      subscriptions.set(payload.gameId, set);
      const state = games.get(payload.gameId);
      if (state) {
        socket.send(
          JSON.stringify({
            type: "state",
            gameId: payload.gameId,
            state: toPublicObservation(state)
          })
        );
      }
    } catch {
      // Ignore malformed websocket payload.
    }
  });

  socket.on("close", () => {
    for (const sockets of subscriptions.values()) {
      sockets.delete(socket);
    }
  });
});

function broadcastGameUpdate(gameId: string, state: GameState): void {
  const sockets = subscriptions.get(gameId);
  if (!sockets || sockets.size === 0) {
    return;
  }
  const data = JSON.stringify({ type: "state", gameId, state: toPublicObservation(state) });
  for (const socket of sockets) {
    socket.send(data);
  }
}

function broadcastSystemEvent(gameId: string, message: string): void {
  const sockets = subscriptions.get(gameId);
  if (!sockets || sockets.size === 0) {
    return;
  }
  const data = JSON.stringify({ type: "info", gameId, message });
  for (const socket of sockets) {
    socket.send(data);
  }
}

function appendEvent(gameId: string, turn: number, action: GameAction): void {
  const events = gameEvents.get(gameId) ?? [];
  events.push({
    turn,
    action,
    note: describeAction(action),
    at: new Date().toISOString()
  });
  gameEvents.set(gameId, events);
}

function describeAction(action: GameAction): string {
  if (action.type === "buy_card") {
    return `${action.playerId} buys row ${action.row + 1}, slot ${action.column + 1}`;
  }
  if (action.type === "play_card") {
    return `${action.playerId} plays ${action.cardId}`;
  }
  if (action.type === "choose_faction") {
    return `${action.playerId} chooses ${action.coalition}`;
  }
  if (action.type === "take_rupee") {
    return `${action.playerId} takes 1 rupee`;
  }
  if (action.type === "gain_loyalty") {
    return `${action.playerId} gains 1 loyalty`;
  }
  if (action.type === "build_army") {
    return `${action.playerId} builds army in ${action.regionId}`;
  }
  if (action.type === "build_road") {
    return `${action.playerId} builds road in ${action.regionId}`;
  }
  if (action.type === "perform_dominance_check") {
    return `${action.playerId} performs a dominance check`;
  }
  return `${action.playerId} passes`;
}

function chooseBotAction(state: GameState, playerId: string): GameAction | null {
  const actions = getLegalActions(state, playerId);
  if (actions.length === 0) {
    return null;
  }
  const nonPass = actions.filter((a) => a.type !== "pass");
  if (nonPass.length > 0) {
    const idx = Math.floor(Math.random() * nonPass.length);
    return nonPass[idx];
  }
  return actions[0];
}

function stepBotTurn(gameId: string): void {
  const state = games.get(gameId);
  if (!state) {
    stopAutoplay(gameId);
    return;
  }
  if (state.turn > 60) {
    stopAutoplay(gameId);
    broadcastSystemEvent(gameId, "Autoplay reached max turn limit (60)");
    return;
  }
  const action = chooseBotAction(state, state.currentPlayerId);
  if (!action) {
    stopAutoplay(gameId);
    broadcastSystemEvent(gameId, "No legal actions left");
    return;
  }
  try {
    const next = applyAction(state, action);
    games.set(gameId, next);
    appendEvent(gameId, next.turn - 1, action);
    broadcastGameUpdate(gameId, next);
  } catch (error) {
    stopAutoplay(gameId);
    app.log.error(error, `Autoplay failed for ${gameId}`);
  }
}

function stopAutoplay(gameId: string): void {
  const timer = autoplayTimers.get(gameId);
  if (!timer) {
    return;
  }
  clearInterval(timer);
  autoplayTimers.delete(gameId);
}

app.log.info(`Server listening on port ${port}`);
