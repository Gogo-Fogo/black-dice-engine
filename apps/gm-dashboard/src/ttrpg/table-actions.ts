import { isSnapshotResponse } from "../../../../packages/contracts/dist/index.js";
import { readHostResponse } from "./read-host-response";
import type { Dispatch, SetStateAction } from "react";
import { getOrCreatePendingRequestId, clearPendingRequestId } from "./pending-requests";
import type { StateEventDraft, SessionSnapshot } from "./types";

export type TableActionHooks = {
  queueApprovalMode: boolean;
  setPendingActionKey(value: string): void;
  setSnapshot(value: SessionSnapshot): void;
  setConditionDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  requestIds?: { get(fingerprint: string): string; clear(fingerprint: string): void };
};

export function createTableActions({ queueApprovalMode, setPendingActionKey, setSnapshot, setConditionDrafts,
  request, requestIds = { get: getOrCreatePendingRequestId, clear: clearPendingRequestId } }: TableActionHooks) {
async function submitStateEvent(
    event: StateEventDraft,
    fingerprint: string,
    actionKey: string,
    options?: { clearConditionDraftFor?: string }
  ) {
    setPendingActionKey(actionKey);

    try {
      const requestId = requestIds.get(fingerprint);
      const endpoint = queueApprovalMode ? "/api/state-events/propose" : "/api/state-events";
      const response = await request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...event,
          requestId,
          submittedBy: queueApprovalMode
            ? {
                id: "gm-dashboard",
                kind: "gm",
                label: "GM Dashboard"
              }
            : undefined
        })
      });

      if (!response.ok) {
        return;
      }

      const json = await readHostResponse(response, isSnapshotResponse);
      setSnapshot(json.sessionSnapshot);
      requestIds.clear(fingerprint);

      if (options?.clearConditionDraftFor) {
        const characterId = options.clearConditionDraftFor;
        setConditionDrafts((current) => ({
          ...current,
          [characterId]: ""
        }));
      }
    } finally {
      setPendingActionKey("");
    }
  }

async function resolveProposal(proposalId: string, action: "approve" | "reject") {
    setPendingActionKey(`${action}-${proposalId}`);
    try {
      const response = await request(`/api/state-events/${proposalId}/${action}`, {
        method: "POST"
      });

      if (!response.ok) {
        return;
      }

      const json = await readHostResponse(response, isSnapshotResponse);
      setSnapshot(json.sessionSnapshot);
    } finally {
      setPendingActionKey("");
    }
  }
return { submitStateEvent, resolveProposal };
}
