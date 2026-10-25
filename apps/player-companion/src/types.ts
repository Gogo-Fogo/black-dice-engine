export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type Character = {
  id: string;
  name: string;
  classLabel: string;
  hp: { current: number; max: number };
  armorClass: number;
  initiative: number | null;
  conditions: string[];
  resources: Array<{
    id: string;
    label: string;
    current: number;
    max: number;
  }>;
  inventory: Array<{
    id: string;
    name: string;
    quantity: number;
    detail?: string;
  }>;
  notes: string[];
  image?: string | null;
  stats?: Record<AbilityKey, number> & { skills: string[] };
  claimedByClientId: string | null;
  claimedByLabel: string | null;
};

export type RollRecord = {
  id: string;
  actorId: string;
  actorName: string;
  dice: string;
  modifier: number;
  rolled: number | number[];
  total: number;
  advantage: boolean | null;
  note: string;
  timestamp: string;
};

export type MemoryEntry = {
  id: string;
  kind: string;
  visibility: string;
  summary: string;
  createdAt: string;
};

export type CurrentAction = {
  type: string;
  description: string;
  ability: string;
  dc: number | null;
};

export type SessionSnapshot = {
  campaignId: string;
  campaignTitle: string;
  currentScene: string;
  tablePin: string;
  joinUrl: string;
  party: Character[];
  rollLog: RollRecord[];
  memoryEntries: MemoryEntry[];
  currentAction?: CurrentAction | null;
};

export type PlayerSocketEnvelope =
  | { type: "connected"; payload: { sessionSnapshot: SessionSnapshot } }
  | { type: "session_snapshot"; payload: SessionSnapshot }
  | { type: "roll_recorded"; payload: RollRecord };

export type ConnectionState = "connecting" | "connected" | "reconnecting";

export type RollMode = "normal" | "adv" | "dis";
