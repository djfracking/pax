import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CARD_LIBRARY, getAdjacentRegions, type GameAction, type PublicObservation, type Region } from "@pax/engine";

const SERVER_URL = "http://localhost:4000";
const WS_URL = "ws://localhost:4000";
const CARD_BY_ID = new Map(CARD_LIBRARY.map((card) => [card.id, card]));

// --- Coalition Colors (Russian = yellow per PP2e) ---

const COALITION_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  afghan: { bg: "#2d5a27", text: "#a8e6a1", accent: "#4caf50" },
  british: { bg: "#5a2727", text: "#e6a1a1", accent: "#ef5350" },
  russian: { bg: "#5a5227", text: "#e6dda1", accent: "#fdd835" },
  none: { bg: "#3a3a3a", text: "#999", accent: "#666" },
};

const SUIT_COLORS: Record<string, string> = {
  political: "#a78bfa",
  intelligence: "#60a5fa",
  economic: "#fbbf24",
  military: "#f87171",
};

const ACTION_LABELS: Record<string, string> = {
  tax: "Tax",
  gift: "Gift",
  build: "Bld",
  move: "Mov",
  battle: "Btl",
  betray: "Bty",
  spy: "Spy",
};

type GameEvent = { turn: number; action: GameAction; note: string; at: string };

// --- Region Card ---

function RegionCard({ region, borders }: { region: PublicObservation["board"][0]; borders: PublicObservation["borders"] }) {
  const adjacent = getAdjacentRegions(region.id as Region);
  const totalArmies = region.armies.afghan + region.armies.british + region.armies.russian;
  const regionBorders = borders.filter(
    (b) => b.regions[0] === region.id || b.regions[1] === region.id
  );

  return (
    <div style={{
      background: "#16213e",
      border: "1px solid #334155",
      borderRadius: 8,
      padding: "10px 12px",
      minHeight: 110,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8" }}>
          {region.id}
        </span>
      </div>

      {/* Armies */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6, alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "#475569", width: 36 }}>Armies</span>
        {(["afghan", "british", "russian"] as const).map((c) => {
          const count = region.armies[c];
          if (count === 0) return null;
          return Array.from({ length: count }, (_, i) => (
            <span key={`a-${c}-${i}`} style={{
              display: "inline-block", width: 12, height: 12,
              borderRadius: "50%", background: COALITION_COLORS[c].accent,
              border: "1px solid rgba(255,255,255,0.2)",
            }} title={`${c} army`} />
          ));
        })}
        {totalArmies === 0 && <span style={{ fontSize: 10, color: "#475569" }}>none</span>}
      </div>

      {/* Roads on borders */}
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: "#475569" }}>Roads</span>
        {regionBorders.map((border) => {
          const otherRegion = border.regions[0] === region.id ? border.regions[1] : border.regions[0];
          const totalRoads = border.roads.afghan + border.roads.british + border.roads.russian;
          if (totalRoads === 0) return null;
          return (
            <div key={border.id} style={{ display: "flex", gap: 3, alignItems: "center", marginTop: 2, marginLeft: 4 }}>
              <span style={{ fontSize: 8, color: "#475569", minWidth: 55 }}>to {otherRegion}</span>
              {(["afghan", "british", "russian"] as const).map((c) =>
                Array.from({ length: border.roads[c] }, (_, i) => (
                  <span key={`r-${c}-${i}`} style={{
                    display: "inline-block", width: 14, height: 4,
                    borderRadius: 2, background: COALITION_COLORS[c].accent,
                  }} title={`${c} road`} />
                ))
              )}
            </div>
          );
        })}
        {regionBorders.every((b) => b.roads.afghan + b.roads.british + b.roads.russian === 0) &&
          <span style={{ fontSize: 10, color: "#475569", marginLeft: 4 }}>none</span>}
      </div>

      {/* Border connections */}
      <div style={{ fontSize: 9, color: "#475569", marginTop: 4 }}>
        Borders: {adjacent.join(", ")}
      </div>
    </div>
  );
}

// --- Market Card ---

function MarketCard({ cardId, cost, rupeesOn }: { cardId: string; cost: number; rupeesOn: number }) {
  const card = CARD_BY_ID.get(cardId);
  if (!card) return <div style={{ background: "#222", borderRadius: 6, padding: 8 }}>?</div>;

  const colors = COALITION_COLORS[card.coalition];
  return (
    <div style={{
      background: "#1e293b",
      border: `1px solid ${colors.accent}40`,
      borderLeft: `3px solid ${colors.accent}`,
      borderRadius: 6,
      padding: "8px 10px",
      fontSize: 12,
      minWidth: 130,
      flex: 1,
      position: "relative",
    }}>
      {/* Rupees on this card */}
      {rupeesOn > 0 && (
        <div style={{
          position: "absolute", top: -6, right: -6,
          background: "#fbbf24", color: "#000", borderRadius: "50%",
          width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, border: "2px solid #1e293b",
        }} title={`${rupeesOn} rupee${rupeesOn > 1 ? "s" : ""} on this card`}>
          {rupeesOn}
        </div>
      )}
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3, color: "#e2e8f0" }}>
        {card.name}
      </div>
      <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 3 }}>
        <span style={{
          background: SUIT_COLORS[card.suit] + "33",
          color: SUIT_COLORS[card.suit],
          borderRadius: 3, padding: "0 5px", fontSize: 9, fontWeight: 700,
        }}>{card.suit.slice(0, 3).toUpperCase()}</span>
        <span style={{ color: "#94a3b8", fontSize: 10 }}>{card.region}</span>
        {card.coalition !== "none" && (
          <span style={{ color: colors.accent, fontSize: 10 }}>{card.coalition}</span>
        )}
        <span style={{ color: "#94a3b8", fontSize: 10 }}>R{card.rank}</span>
        {card.stars > 0 && <span style={{ color: "#fbbf24", fontSize: 10 }}>{"*".repeat(card.stars)}</span>}
      </div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {card.actionIcons.map((icon) => (
          <span key={icon} style={{
            background: "#0f172a", border: "1px solid #475569",
            borderRadius: 3, padding: "0 4px", fontSize: 8, color: "#cbd5e1",
          }}>{ACTION_LABELS[icon] ?? icon}</span>
        ))}
      </div>
      <div style={{ color: "#64748b", fontSize: 10, marginTop: 3 }}>
        Cost: {cost}
      </div>
    </div>
  );
}

// --- Small Court Card (for player display) ---

function CourtCardMini({ cardId }: { cardId: string }) {
  const card = CARD_BY_ID.get(cardId);
  if (!card) return <span style={{ fontSize: 9, color: "#475569" }}>?</span>;
  const colors = COALITION_COLORS[card.coalition];
  return (
    <div style={{
      background: "#1e293b",
      border: `1px solid ${colors.accent}55`,
      borderLeft: `2px solid ${colors.accent}`,
      borderRadius: 4,
      padding: "3px 6px",
      fontSize: 10,
      lineHeight: 1.3,
    }}>
      <div style={{ fontWeight: 600, color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 100 }}>
        {card.name}
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 1 }}>
        <span style={{ color: SUIT_COLORS[card.suit], fontSize: 8, fontWeight: 700 }}>
          {card.suit.slice(0, 3).toUpperCase()}
        </span>
        {card.actionIcons.slice(0, 3).map((icon) => (
          <span key={icon} style={{ fontSize: 7, color: "#64748b" }}>{ACTION_LABELS[icon]}</span>
        ))}
      </div>
    </div>
  );
}

// --- Player Strip ---

function PlayerStrip({ player, isCurrent }: {
  player: PublicObservation["players"][0];
  isCurrent: boolean;
}) {
  const colors = COALITION_COLORS[player.coalition];
  return (
    <div style={{
      background: isCurrent ? `${colors.accent}22` : "#0f172a",
      border: `1px solid ${isCurrent ? colors.accent : "#334155"}`,
      borderRadius: 8,
      padding: "8px 12px",
      flex: 1,
      minWidth: 180,
      transition: "all 0.3s ease",
      boxShadow: isCurrent ? `0 0 12px ${colors.accent}33` : "none",
    }}>
      {/* Court cards (in front — public) */}
      {player.court.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {player.court.map((cardId) => (
            <CourtCardMini key={cardId} cardId={cardId} />
          ))}
        </div>
      )}
      {player.court.length === 0 && (
        <div style={{ fontSize: 10, color: "#475569", marginBottom: 6 }}>No court cards</div>
      )}
      {/* Player identity + stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.accent, display: "inline-block" }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: isCurrent ? colors.text : "#94a3b8" }}>
          {player.id}
        </span>
        <span style={{ fontSize: 10, color: colors.accent }}>{player.coalition !== "none" ? player.coalition : ""}</span>
        {isCurrent && <span style={{ fontSize: 9, color: colors.accent, fontWeight: 700, marginLeft: "auto" }}>ACTIVE</span>}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
        <span style={{ color: "#fbbf24" }}>{player.rupees} rupees</span>
        {" | "}
        <span style={{ color: "#a78bfa" }}>{player.victoryPoints} VP</span>
        {" | "}
        L:{player.loyalty}
        {" | "}
        Gifts:{player.giftsCylinders}
      </div>
      {/* Hand is hidden in public observation — spectator can't see it */}
    </div>
  );
}

// --- Event Log ---

function EventLog({ events }: { events: GameEvent[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div style={{
      background: "#0f172a", border: "1px solid #334155", borderRadius: 8,
      padding: 12, height: "100%", overflowY: "auto", fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
        Event Log
      </div>
      {events.length === 0 && <div style={{ color: "#475569" }}>No events yet.</div>}
      {events.map((event, i) => {
        const isLatest = i === events.length - 1;
        return (
          <div key={`${event.turn}-${i}`} style={{
            padding: "3px 6px", marginBottom: 1, borderRadius: 3,
            background: isLatest ? "#1e3a5f" : "transparent",
            color: isLatest ? "#e2e8f0" : "#64748b",
            transition: "background 0.3s",
          }}>
            <span style={{ color: "#475569", marginRight: 6, fontSize: 10 }}>T{event.turn}</span>
            {event.note}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

// --- Main App ---

function SpectatorApp() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [state, setState] = useState<PublicObservation | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [status, setStatus] = useState("Ready");
  const [speed, setSpeed] = useState(2000);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerCount, setPlayerCount] = useState(2);
  const wsRef = useRef<WebSocket | null>(null);

  const connectWs = useCallback((gid: string) => {
    if (wsRef.current) wsRef.current.close();
    const socket = new WebSocket(WS_URL);
    wsRef.current = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "subscribe", gameId: gid }));
      setStatus("Connected");
    };
    socket.onmessage = (msg) => {
      const payload = JSON.parse(msg.data);
      if (payload.type === "state") {
        setState(payload.state);
        fetch(`${SERVER_URL}/games/${gid}/events`)
          .then((r) => r.json())
          .then((j: { events?: GameEvent[] }) => { if (j.events) setEvents(j.events); })
          .catch(() => {});
      } else if (payload.type === "info") {
        setStatus(payload.message);
      }
    };
    socket.onerror = () => setStatus("WebSocket error");
    socket.onclose = () => setStatus("Disconnected");
  }, []);

  async function startGame() {
    const gid = `game-${Date.now()}`;
    const playerIds = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
    setStatus("Creating...");
    const res = await fetch(`${SERVER_URL}/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameId: gid, playerIds }),
    });
    const json = await res.json();
    if (!res.ok) { setStatus(json.error ?? "Failed"); return; }
    setGameId(gid);
    setState(json.state);
    setEvents([]);
    connectWs(gid);
    setStatus("Game created");
  }

  async function toggleAutoplay() {
    if (!gameId) return;
    if (isPlaying) {
      await fetch(`${SERVER_URL}/games/${gameId}/autoplay/stop`, { method: "POST" });
      setIsPlaying(false);
      setStatus("Paused");
    } else {
      await fetch(`${SERVER_URL}/games/${gameId}/autoplay/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intervalMs: speed }),
      });
      setIsPlaying(true);
      setStatus("Playing...");
    }
  }

  async function changeSpeed(newSpeed: number) {
    setSpeed(newSpeed);
    if (isPlaying && gameId) {
      await fetch(`${SERVER_URL}/games/${gameId}/autoplay/stop`, { method: "POST" });
      await fetch(`${SERVER_URL}/games/${gameId}/autoplay/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intervalMs: newSpeed }),
      });
    }
  }

  useEffect(() => {
    if (state && state.phase === "faction_draft" && gameId && !isPlaying) {
      fetch(`${SERVER_URL}/games/${gameId}/autoplay/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intervalMs: speed }),
      }).then(() => setIsPlaying(true));
    }
  }, [state?.phase, gameId]);

  const regionOrder: string[] = ["transcaspia", "kabul", "punjab", "persia", "herat", "kandahar"];

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: 1200, margin: "0 auto", padding: "12px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #334155" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e2e8f0", letterSpacing: -0.5 }}>
            Pax Pamir
          </h1>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>Spectator Mode</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!gameId && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                Players
                <select value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value))}
                  style={{ background: "#1e293b", color: "#e2e8f0", border: "1px solid #475569", borderRadius: 4, padding: "3px 6px", fontSize: 12 }}>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
              </label>
              <button onClick={startGame} style={{
                background: "#4caf50", color: "#fff", border: "none", borderRadius: 6,
                padding: "7px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>New Game</button>
            </>
          )}
          {gameId && (
            <>
              <button onClick={toggleAutoplay} style={{
                background: isPlaying ? "#ef5350" : "#4caf50",
                color: "#fff", border: "none", borderRadius: 6,
                padding: "7px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>{isPlaying ? "Pause" : "Play"}</button>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: "#64748b" }}>Speed</span>
                <input type="range" min={200} max={2000} step={100} value={speed}
                  onChange={(e) => changeSpeed(Number(e.target.value))} style={{ width: 80 }} />
                <span style={{ fontSize: 10, color: "#94a3b8", minWidth: 36 }}>{speed}ms</span>
              </div>
            </>
          )}
          <span style={{ fontSize: 10, color: "#475569" }}>{status}</span>
        </div>
      </div>

      {!state ? (
        <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#9876;</div>
          <div style={{ fontSize: 16 }}>Create a game to start watching</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>Bots will play automatically. Watch the state transitions unfold.</div>
        </div>
      ) : (
        <>
          {/* Game info bar */}
          <div style={{ display: "flex", gap: 12, marginBottom: 10, fontSize: 11, color: "#94a3b8", flexWrap: "wrap", alignItems: "center" }}>
            <span>Phase: <strong style={{ color: "#e2e8f0" }}>{state.phase}</strong></span>
            <span>Turn: <strong style={{ color: "#e2e8f0" }}>{state.turn}</strong></span>
            <span>AP: <strong style={{ color: "#fbbf24" }}>{state.actionPointsRemaining}</strong></span>
            <span>Deck: <strong style={{ color: "#e2e8f0" }}>{state.deckCount}</strong></span>
            <span>Dom checks: <strong style={{ color: "#e2e8f0" }}>{state.dominanceChecksRemaining}</strong></span>
            {/* Favored Suit */}
            <span>
              Favored suit:{" "}
              <strong style={{ color: SUIT_COLORS[state.favoredSuit] ?? "#94a3b8" }}>
                {state.favoredSuit}
              </strong>
            </span>
            {state.lastDominanceResult && (
              <span>Last dom: <strong style={{
                color: state.lastDominanceResult.dominantCoalition
                  ? COALITION_COLORS[state.lastDominanceResult.dominantCoalition].accent
                  : "#94a3b8"
              }}>
                {state.lastDominanceResult.dominantCoalition ?? "unsuccessful"}
              </strong></span>
            )}
          </div>

          {/* Main grid: Board + Events */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>
                Regions
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {regionOrder.map((rid) => {
                  const region = state.board.find((r) => r.id === rid);
                  return region ? <RegionCard key={rid} region={region} borders={state.borders} /> : null;
                })}
              </div>
            </div>
            <div style={{ maxHeight: 340 }}>
              <EventLog events={events} />
            </div>
          </div>

          {/* Market */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>
              Market
            </div>
            {state.marketRows.map((row, rowIdx) => (
              <div key={`row-${rowIdx}`} style={{ display: "flex", gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: "#475569", minWidth: 14, paddingTop: 8 }}>{rowIdx + 1}</span>
                {row.map((cardId, colIdx) => (
                  <MarketCard
                    key={`${rowIdx}-${colIdx}-${cardId}`}
                    cardId={cardId}
                    cost={colIdx}
                    rupeesOn={state.rupeesOnMarketCards?.[cardId] ?? 0}
                  />
                ))}
                {row.length === 0 && <span style={{ fontSize: 10, color: "#475569", paddingTop: 8 }}>(empty)</span>}
              </div>
            ))}
          </div>

          {/* Players */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>
              Players
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {state.players.map((player) => (
                <PlayerStrip key={player.id} player={player} isCurrent={player.id === state.currentPlayerId} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SpectatorApp />
  </React.StrictMode>
);
