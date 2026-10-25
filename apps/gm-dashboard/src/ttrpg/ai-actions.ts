import { actionFromProposal, isActionConfirmation, isNarrationToggleConfirmation, isActionProposalResponse,
  type ActionProposal } from "../../../../packages/contracts/dist/index.js";
import { readHostResponse } from "./read-host-response";

export function createAiActions(request: typeof fetch) {
  async function post(path: string, body: unknown) {
    const response = await request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("AI control request failed");
    return response;
  }
  return {
    async propose() { return readHostResponse(await post("/api/ai/propose-action", {}), isActionProposalResponse); },
    async apply(proposal: ActionProposal) {
      const expected = actionFromProposal(proposal);
      const data = await readHostResponse(await post("/api/set-action", expected), isActionConfirmation);
      if (data.action.type !== expected.type || data.action.description !== expected.description ||
        data.action.ability !== expected.ability || data.action.dc !== expected.dc) throw new Error("Action not confirmed");
      return data.action;
    },
    async toggle(enabled: boolean) {
      const data = await readHostResponse(await post("/api/ai/narration-toggle", { enabled }), isNarrationToggleConfirmation);
      if (data.enabled !== enabled) throw new Error("Narration setting not confirmed");
      return data.enabled;
    }
  };
}
