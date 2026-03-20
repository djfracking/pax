import type { PlayerId } from "./types.js";
import type { Coalition } from "./cards.js";

export type GameAction =
  | {
      type: "buy_card";
      playerId: PlayerId;
      row: number;
      column: number;
    }
  | {
      type: "play_card";
      playerId: PlayerId;
      cardId: string;
    }
  | {
      type: "pass";
      playerId: PlayerId;
    }
  | {
      type: "take_rupee";
      playerId: PlayerId;
    }
  | {
      type: "gain_loyalty";
      playerId: PlayerId;
    }
  | {
      type: "build_army";
      playerId: PlayerId;
      regionId: string;
    }
  | {
      type: "build_road";
      playerId: PlayerId;
      regionId: string;
    }
  | {
      type: "choose_faction";
      playerId: PlayerId;
      coalition: Exclude<Coalition, "none">;
    }
  | {
      type: "perform_dominance_check";
      playerId: PlayerId;
    };

export type LegalActionChoice = {
  id: string;
  label: string;
  action: GameAction;
};
