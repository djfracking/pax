import type { PlayerId, CardId } from "./types.js";
import type { Coalition, Region } from "./cards.js";

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
      cardId: CardId;
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
      regionId: Region;
    }
  | {
      type: "build_road";
      playerId: PlayerId;
      regionId: Region;
    }
  | {
      type: "choose_faction";
      playerId: PlayerId;
      coalition: Exclude<Coalition, "none">;
    }
  | {
      type: "perform_dominance_check";
      playerId: PlayerId;
    }
  | {
      type: "tax";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      type: "gift";
      playerId: PlayerId;
    }
  | {
      type: "move_army";
      playerId: PlayerId;
      cardId: CardId;
      fromRegionId: Region;
      toRegionId: Region;
    }
  | {
      type: "move_spy";
      playerId: PlayerId;
      cardId: CardId;
      fromCardId: CardId;
      toCardId: CardId;
    }
  | {
      type: "battle";
      playerId: PlayerId;
      cardId: CardId;
      regionId: Region;
    }
  | {
      type: "betray";
      playerId: PlayerId;
      cardId: CardId;
      targetCardId: CardId;
      targetPlayerId: PlayerId;
    };

export type LegalActionChoice = {
  id: string;
  label: string;
  action: GameAction;
};
