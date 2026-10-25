import type express from "express";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionSnapshot, RuntimeStatus } from "../../../packages/contracts/dist/index.js";
import { buildSessionSummaryMarkdown, sanitizeFilePart } from "./session-summary.js";
import { identityFor } from "./session-http.js";
import { SessionError } from "./session-authority.js";

type TableReads = {
  snapshot(): SessionSnapshot;
  runtime(): RuntimeStatus;
  summaryDirectory: string;
  now(): number;
};

/** Install after session access/projection middleware. No ownership of state or storage. */
export function installTableReadRoutes(app: express.Express, reads: TableReads) {
  app.get("/api/party", (_request, response) => {
    response.json(reads.snapshot().party.map(character => ({
      name: character.name, classLabel: character.classLabel, hp: character.hp,
      claimedByLabel: character.claimedByLabel || "unclaimed"
    })));
  });
  // Preserve the compact response of the formerly first (reachable) GET handler.
  app.get("/api/rolls", (_request, response) => {
    response.json(reads.snapshot().rollLog.slice(0, 20).map(roll => ({
      name: roll.actorName, dice: roll.dice, modifier: roll.modifier, total: roll.total, note: roll.note, time: roll.timestamp
    })));
  });
  app.get("/api/runtime-status", (_request, response) => { response.json(reads.runtime()); });
  app.get("/api/session-snapshot", (_request, response) => { response.json(reads.snapshot()); });
  app.get("/api/session-summary.md", (request, response) => {
    // Non-host summaries are projected and returned by session middleware before this handler.
    // Refuse private export if the installer is accidentally mounted without that interception.
    if (identityFor(request).role !== "gm") throw new SessionError(403, "Host access required.");
    const snapshot = reads.snapshot();
    const generatedAt = new Date(reads.now()).toISOString();
    const filename = `${sanitizeFilePart(snapshot.campaignTitle)}-session-summary-${generatedAt.slice(0, 10)}.md`;
    const markdown = buildSessionSummaryMarkdown(snapshot, reads.runtime(), generatedAt);
    mkdirSync(reads.summaryDirectory, { recursive: true });
    const exportPath = join(reads.summaryDirectory, filename);
    writeFileSync(exportPath, markdown, "utf8");
    response.setHeader("Content-Type", "text/markdown; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.setHeader("X-Export-Path", exportPath);
    response.send(markdown);
  });
}
