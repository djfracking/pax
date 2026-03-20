import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CARD_LIBRARY, type GameAction, type LegalActionChoice, type PlayerObservation, type PublicObservation } from "@pax/engine";

const SERVER_URL = "http://localhost:4000";
const WS_URL = "ws://localhost:4000";
const CARD_BY_ID = new Map(CARD_LIBRARY.map((card) => [card.id, card]));

type GameEvent = {
  turn: number;
  action: GameAction;
  note: string;
  at: string;
};

function App() {
  const [gameId, setGameId] = useState("demo-game");
  const [playerId, setPlayerId] = useState("p1");
  const [playerCount, setPlayerCount] = useState(5);
  const [state, setState] = useState<PublicObservation | null>(null);
  const [playerView, setPlayerView] = useState<PlayerObservation | null>(null);
  const [legalChoices, setLegalChoices] = useState<LegalActionChoice[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [status, setStatus] = useState("idle");

  const isMyTurn = useMemo(
    () => playerView?.currentPlayerId === playerId || state?.currentPlayerId === playerId,
    [playerView, state, playerId]
  );

  async function createGame() {
    setStatus("creating");
    const playerIds = Array.from({ length: playerCount }, (_, idx) => `p${idx + 1}`);
    const res = await fetch(`${SERVER_URL}/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameId,
        playerIds
      })
    });
    const json = (await res.json()) as { state?: PublicObservation; error?: string };
    if (!res.ok || !json.state) {
      setStatus(json.error ?? "failed to create");
      return;
    }
    setState(json.state);
    setPlayerView(null);
    setLegalChoices([]);
    setEvents([]);
    setStatus("created");
  }

  async function fetchState() {
    const res = await fetch(`${SERVER_URL}/games/${gameId}`);
    const json = (await res.json()) as { state?: PublicObservation; error?: string };
    if (!res.ok || !json.state) {
      setStatus(json.error ?? "failed to fetch");
      return;
    }
    setState(json.state);
    setStatus("loaded");
    await fetchPlayerView();
    await fetchEvents();
  }

  async function sendAction(action: GameAction) {
    const res = await fetch(`${SERVER_URL}/games/${gameId}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action })
    });
    const json = (await res.json()) as { state?: PublicObservation; error?: string };
    if (!res.ok || !json.state) {
      setStatus(json.error ?? "action rejected");
      return;
    }
    setState(json.state);
    setStatus("action applied");
    await fetchPlayerView();
    await fetchEvents();
  }

  async function fetchPlayerView() {
    const res = await fetch(`${SERVER_URL}/games/${gameId}/view/${playerId}`);
    const json = (await res.json()) as { view?: PlayerObservation; error?: string };
    if (!res.ok || !json.view) {
      setPlayerView(null);
      setLegalChoices([]);
      setStatus(json.error ?? "failed to fetch player view");
      return;
    }
    setPlayerView(json.view);
    setState(json.view);
    setLegalChoices(json.view.legalActions);
  }

  async function fetchLegalActions() {
    const res = await fetch(`${SERVER_URL}/games/${gameId}/legal-actions/${playerId}`);
    const json = (await res.json()) as {
      choices?: LegalActionChoice[];
      error?: string;
    };
    if (!res.ok || !json.choices) {
      setLegalChoices([]);
      setStatus(json.error ?? "failed to load legal actions");
      return;
    }
    setLegalChoices(json.choices);
  }

  async function fetchEvents() {
    const res = await fetch(`${SERVER_URL}/games/${gameId}/events`);
    const json = (await res.json()) as { events?: GameEvent[]; error?: string };
    if (!res.ok || !json.events) {
      setStatus(json.error ?? "failed to load events");
      return;
    }
    setEvents(json.events);
  }

  function connectWs() {
    const socket = new WebSocket(WS_URL);
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "subscribe", gameId }));
      setStatus("ws connected");
    };
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as
        | { type: "state"; state: PublicObservation }
        | { type: "info"; message: string };
      if (payload.type === "state") {
        setState(payload.state);
        void fetchPlayerView();
        void fetchLegalActions();
        void fetchEvents();
      } else if (payload.type === "info") {
        setStatus(payload.message);
      }
    };
    socket.onerror = () => setStatus("ws error");
  }

  return (
    <main style={{ fontFamily: "sans-serif", margin: "2rem auto", maxWidth: "800px" }}>
      <h1>Pax Pamir Online - Starter</h1>
      <p>Use this shell app to create/join a match while building the real board UI.</p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input value={gameId} onChange={(e) => setGameId(e.target.value)} placeholder="game id" />
        <input
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          placeholder="player id"
        />
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          Players
          <select
            value={playerCount}
            onChange={(e) => setPlayerCount(Number(e.target.value))}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button onClick={createGame}>Create game</button>
        <button onClick={fetchState}>Fetch state</button>
        <button onClick={fetchPlayerView}>Fetch my view</button>
        <button onClick={fetchLegalActions}>Fetch legal actions</button>
        <button onClick={fetchEvents}>Fetch events</button>
        <button onClick={connectWs}>Subscribe WS</button>
      </div>

      <p>Status: {status}</p>

      {state ? (
        <section>
          <h2>Game {state.gameId}</h2>
          <p>
            Phase {state.phase} - Turn {state.turn} - Current player: <strong>{state.currentPlayerId}</strong>
          </p>
          <p>
            Action points remaining: <strong>{state.actionPointsRemaining}</strong>
          </p>
          <h3>Market (2 rows x up to 5 cards)</h3>
          {state.marketRows.map((row, rowIdx) => (
            <section key={`row-${rowIdx}`} style={{ marginBottom: "0.75rem" }}>
              <p style={{ marginBottom: "0.35rem" }}>
                <strong>Row {rowIdx + 1}</strong>
              </p>
              {row.length === 0 ? (
                <p>(empty)</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.5rem" }}>
                  {row.map((cardId, colIdx) => {
                    const card = CARD_BY_ID.get(cardId);
                    return (
                      <div
                        key={`${rowIdx}-${colIdx}-${cardId}`}
                        style={{
                          border: "1px solid #bbb",
                          borderRadius: "8px",
                          padding: "0.5rem",
                          background: "#fafafa"
                        }}
                      >
                        <p style={{ margin: 0 }}>
                          <strong>Slot {colIdx + 1}</strong> (cost {colIdx})
                        </p>
                        <p style={{ margin: "0.25rem 0 0 0" }}>
                          {card?.name ?? cardId}
                        </p>
                        <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
                          {card
                            ? `${card.suit} | ${card.region} | ${card.coalition} | rank ${card.rank}`
                            : "Unknown card"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
          <p>Deck count: {state.deckCount} | Discard count: {state.discardCount}</p>
          <p>Dominance checks remaining: {state.dominanceChecksRemaining}</p>
          {state.lastDominanceResult ? (
            <p>
              Last dominance:{" "}
              {state.lastDominanceResult.dominantCoalition
                ? `dominant=${state.lastDominanceResult.dominantCoalition}`
                : "failed (no dominant coalition)"}{" "}
              | strengths A/B/R:{" "}
              {state.lastDominanceResult.coalitionStrength.afghan}/
              {state.lastDominanceResult.coalitionStrength.british}/
              {state.lastDominanceResult.coalitionStrength.russian}
            </p>
          ) : (
            <p>Last dominance: none yet</p>
          )}

          <h3>Regions</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.5rem" }}>
            {state.board.map((region) => (
              <div
                key={region.id}
                style={{
                  border: "1px solid #bbb",
                  borderRadius: "8px",
                  padding: "0.5rem",
                  background: "#f8f8ff"
                }}
              >
                <p style={{ margin: 0 }}>
                  <strong>{region.id}</strong>
                </p>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.92rem" }}>
                  Armies A/B/R: {region.armies.afghan}/{region.armies.british}/{region.armies.russian}
                </p>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.92rem" }}>
                  Roads A/B/R: {region.roads.afghan}/{region.roads.british}/{region.roads.russian}
                </p>
              </div>
            ))}
          </div>

          <h3>Players</h3>
          <ul>
            {state.players.map((player) => (
              <li key={player.id}>
                {player.id} - rupees: {player.rupees}, coalition: {player.coalition}, loyalty:{" "}
                {player.loyalty}, VP: {player.victoryPoints}, court: {player.court.length}
              </li>
            ))}
          </ul>

          <h3>My known state ({playerId})</h3>
          {playerView ? (
            <div>
              <p>
                Hand: {playerView.self.hand.join(", ") || "(empty)"} | Rupees: {playerView.self.rupees} |
                Coalition: {playerView.self.coalition} | Loyalty:{" "}
                {state.players.find((p) => p.id === playerView.self.id)?.loyalty ?? 0}
              </p>
            </div>
          ) : (
            <p>Load player view to see private information.</p>
          )}

          <h3>Legal actions</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {legalChoices.map((choice) => (
              <button
                key={choice.id}
                disabled={!isMyTurn}
                onClick={() => sendAction(choice.action as GameAction)}
                style={{ textAlign: "left" }}
              >
                {choice.label}
              </button>
            ))}
            {legalChoices.length === 0 ? <p>No legal actions listed.</p> : null}
          </div>

          <h3 style={{ marginTop: "1.25rem" }}>Move history</h3>
          <ol>
            {events.map((event, index) => (
              <li key={`${event.turn}-${index}`}>
                Turn {event.turn}: {event.note}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
