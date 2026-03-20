import { applyAction, createInitialState, getLegalActions } from "@pax/engine";

type Agent = {
  id: string;
  chooseAction: (args: {
    legalActions: ReturnType<typeof getLegalActions>;
  }) => ReturnType<typeof getLegalActions>[number];
};

const randomAgent = (id: string): Agent => ({
  id,
  chooseAction: ({ legalActions }) => {
    const index = Math.floor(Math.random() * legalActions.length);
    return legalActions[index];
  }
});

const agents: Agent[] = [
  randomAgent("p1"),
  randomAgent("p2"),
  randomAgent("p3"),
  randomAgent("p4"),
  randomAgent("p5")
];
let state = createInitialState(
  "sim-game",
  agents.map((agent) => agent.id),
  42
);

const maxTurns = 25;
for (let i = 0; i < maxTurns && !state.isFinished; i += 1) {
  const currentAgent = agents.find((agent) => agent.id === state.currentPlayerId);
  if (!currentAgent) {
    throw new Error("Current player not found in agent list.");
  }
  const legalActions = getLegalActions(state, currentAgent.id);
  if (legalActions.length === 0) {
    break;
  }
  const action = currentAgent.chooseAction({ legalActions });
  state = applyAction(state, action);
  console.log(
    JSON.stringify({
      turn: state.turn,
      action,
      currentPlayerId: state.currentPlayerId,
      marketRowCounts: state.marketRows.map((row) => row.length)
    })
  );
}

console.log("Simulation complete.");
