export const RESOURCE_CONFIG = [
  { key: "food", label: "Еда", availableId: "troopAvailableFood" },
  { key: "wood", label: "Дерево", availableId: "troopAvailableWood" },
  { key: "metal", label: "Металл", availableId: "troopAvailableMetal" },
  { key: "fuel", label: "Топливо", availableId: "troopAvailableFuel" }
];

export const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const TRANSFER_STORAGE_KEY = "harvesthub_troop_training_transfer";
export const TURBO_WEEK_STATE_PREFIX = "harvesthub_turbo_vs_week_state:";

export const TROOP_COST_PRESETS = {
  training: {
    8: { food: 194000, wood: 194000, metal: 38800, fuel: 9700, time: "02:42:37" },
    9: { food: 485000, wood: 485000, metal: 97000, fuel: 24250, time: "02:58:52" },
    10: { food: 970000, wood: 970000, metal: 194000, fuel: 48500, time: "05:25:13" }
  },
  upgrade: {
    9: { food: 291000, wood: 291000, metal: 58200, fuel: 14550, time: "00:16:16" },
    10: { food: 485000, wood: 485000, metal: 97000, fuel: 24250, time: "02:26:21" }
  }
};