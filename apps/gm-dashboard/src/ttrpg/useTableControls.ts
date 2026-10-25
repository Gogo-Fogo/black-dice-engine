import { useState } from "react";
import type { SessionSnapshot } from "./types";
import { createTableActions } from "./table-actions";
import { apiFetch } from "../../../session-client";

export function useTableControls({ setSnapshot, setPendingActionKey }: { setSnapshot(value: SessionSnapshot): void; setPendingActionKey(value: string): void }) {
const [conditionDrafts, setConditionDrafts] = useState<Record<string, string>>({});
const [queueApprovalMode, setQueueApprovalMode] = useState(false);
const [combatMode, setCombatMode] = useState(false);
const [combatRound, setCombatRound] = useState(1);
const [combatTurnIndex, setCombatTurnIndex] = useState(0);
const actions = createTableActions({ queueApprovalMode, setSnapshot, setPendingActionKey, setConditionDrafts, request: apiFetch });
return { conditionDrafts, setConditionDrafts, queueApprovalMode, setQueueApprovalMode, combatMode, setCombatMode, combatRound, setCombatRound, combatTurnIndex, setCombatTurnIndex, ...actions };
}
