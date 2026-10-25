import type express from "express";
import { randomUUID } from "node:crypto";
import type { StateEventRequest, StateEventProposal, TableEventRecord, SessionSnapshot } from "../../../packages/contracts/dist/index.js";
import type { createStateEvents } from "./state-events.js";

type StateEventRoutes = {
  approvalQueue: StateEventProposal[];
  events: ReturnType<typeof createStateEvents>;
  recordTableEvent(event: Omit<TableEventRecord, "id" | "timestamp">): TableEventRecord;
  publishSessionState(): SessionSnapshot;
  createMemoryEntry(trigger: string): unknown;
  requireRole(...roles: ("gm" | "admin" | "player")[]): express.RequestHandler;
  now(): number;
};

/** Install after session and command middleware; mutations stay inside its atomic boundary. */
export function installStateEventRoutes(app: express.Express, {
  approvalQueue, events, recordTableEvent, publishSessionState, createMemoryEntry, requireRole, now
}: StateEventRoutes) {
  app.get("/api/state-event-queue", requireRole("gm", "admin"), (_request, response) => {
    response.json(approvalQueue);
  });

  app.post("/api/state-events/propose", requireRole("gm", "player", "admin"), (request, response) => {
    const body = request.body as Partial<StateEventRequest> & {
      submittedBy?: { id?: string; kind?: string; label?: string };
    };


    if (typeof body.type !== "string" || typeof body.characterId !== "string") {
      response.status(400).json({
        error: "type and characterId are required"
      });
      return;
    }

    const event = body as StateEventRequest;
    const submittedBy = {
      id: typeof body.submittedBy?.id === "string" ? body.submittedBy.id : "gm-dashboard",
      kind: body.submittedBy?.kind === "player" ? "player" : "gm",
      label:
        typeof body.submittedBy?.label === "string" && body.submittedBy.label.trim()
          ? body.submittedBy.label.trim()
          : "GM Dashboard"
    } as StateEventProposal["submittedBy"];

    const proposal: StateEventProposal = {
      id: randomUUID(),
      createdAt: new Date(now()).toISOString(),
      summary: events.summarize(event),
      submittedBy,
      event
    };

    approvalQueue.unshift(proposal);
    approvalQueue.splice(12);
    const result = {
      ok: true,
      proposal,
      sessionSnapshot: publishSessionState()
    };


    response.status(201).json(result);
  });

  app.post("/api/state-events/:proposalId/approve", requireRole("gm", "admin"), (request, response) => {
    const proposalIndex = approvalQueue.findIndex((entry) => entry.id === String(request.params.proposalId));

    if (proposalIndex === -1) {
      response.status(404).json({
        error: "Proposal not found"
      });
      return;
    }

    const [proposal] = approvalQueue.splice(proposalIndex, 1);
    const applied = events.apply(proposal.event, `GM Approved: ${proposal.submittedBy.label}`);

    if (!applied.ok) {
      approvalQueue.unshift(proposal);
      response.status(applied.statusCode).json(applied.body);
      return;
    }

    recordTableEvent({
      category: "state",
      type: "proposal_approved",
      actor: {
        id: "gm-dashboard",
        kind: "gm",
        label: "GM Dashboard"
      },
      visibility: "gm_only",
      summary: `Approved queued change: ${proposal.summary}`,
      payload: {
        proposalId: proposal.id,
        proposalType: proposal.event.type
      }
    });

    createMemoryEntry(`Approved: ${proposal.summary}`);

    response.json({
      ok: true,
      sessionSnapshot: publishSessionState()
    });
  });

  app.post("/api/state-events/:proposalId/reject", requireRole("gm", "admin"), (request, response) => {
    const proposalIndex = approvalQueue.findIndex((entry) => entry.id === String(request.params.proposalId));

    if (proposalIndex === -1) {
      response.status(404).json({
        error: "Proposal not found"
      });
      return;
    }

    const [proposal] = approvalQueue.splice(proposalIndex, 1);
    recordTableEvent({
      category: "state",
      type: "proposal_rejected",
      actor: {
        id: "gm-dashboard",
        kind: "gm",
        label: "GM Dashboard"
      },
      visibility: "gm_only",
      summary: `Rejected queued change: ${proposal.summary}`,
      payload: {
        proposalId: proposal.id,
        proposalType: proposal.event.type
      }
    });

    response.json({
      ok: true,
      sessionSnapshot: publishSessionState()
    });
  });

  app.post("/api/state-events", requireRole("gm", "admin"), (request, response) => {
    const body = request.body as Partial<StateEventRequest>;


    if (typeof body.type !== "string" || typeof body.characterId !== "string") {
      response.status(400).json({
        error: "type and characterId are required"
      });
      return;
    }

    const applied = events.apply(body as StateEventRequest);


    response.status(applied.statusCode).json(applied.body);
  });

}
