import type { SessionSnapshot, RuntimeStatus } from "../../../packages/contracts/dist/index.js";

function formatIsoForMarkdown(value: string) {
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function sanitizeFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildSessionSummaryMarkdown(snapshot: SessionSnapshot, runtime: RuntimeStatus, generatedAt: string) {
  const fileStamp = generatedAt.slice(0, 10);
  const lines: string[] = [];

  lines.push(`# Session Summary - ${snapshot.campaignTitle}`);
  lines.push("");
  lines.push(`- Generated: ${formatIsoForMarkdown(generatedAt)}`);
  lines.push(`- Current Scene: ${snapshot.currentScene}`);
  lines.push(`- Table PIN: ${snapshot.tablePin}`);
  lines.push(`- Join URL: ${snapshot.joinUrl}`);
  lines.push(`- Runtime Status: ${runtime.status} (${runtime.mode})`);
  lines.push("");
  lines.push("## Party State");
  lines.push("");

  for (const character of snapshot.party) {
    lines.push(`### ${character.name} - ${character.classLabel}`);
    lines.push(`- HP: ${character.hp.current}/${character.hp.max}`);
    lines.push(`- AC: ${character.armorClass}`);
    lines.push(
      `- Conditions: ${character.conditions.length ? character.conditions.join(", ") : "None"}`
    );
    lines.push(
      `- Claimed By: ${character.claimedByLabel ? character.claimedByLabel : "Unclaimed"}`
    );
    lines.push(
      `- Resources: ${
        character.resources.length
          ? character.resources.map((resource) => `${resource.label} ${resource.current}/${resource.max}`).join(", ")
          : "None"
      }`
    );
    lines.push(
      `- Inventory: ${
        character.inventory.length
          ? character.inventory
              .map((item) => `${item.name} x${item.quantity}${item.detail ? ` (${item.detail})` : ""}`)
              .join(", ")
          : "None"
      }`
    );
    if (character.notes.length) {
      lines.push(`- Notes: ${character.notes.join(" | ")}`);
    }
    lines.push("");
  }

  lines.push("## Campaign Progress", "");
  for (const entry of snapshot.campaignProgress?.entries ?? []) {
    lines.push(`- [${entry.kind}/${entry.status}; ${entry.visibility}] ${entry.title}: ${entry.detail}`, `  Approved outcome: ${entry.resolution || "Pending"}`);
  }
  for (const action of snapshot.campaignProgress?.actions ?? []) {
    lines.push(`- ${action.description} (DC ${action.dc ?? "unset"}): ${action.participants.map(p => `${p.actorName} ${p.total}: ${p.success === null ? "unresolved" : p.success ? "success" : "failure"}`).join("; ")}`,
      `  Approved consequence: ${action.consequence || "Pending GM approval"}`);
  }
  lines.push("");
  lines.push("## Recent Rolls");
  lines.push("");
  if (snapshot.rollLog.length) {
    for (const roll of snapshot.rollLog) {
      lines.push(
        `- ${formatIsoForMarkdown(roll.timestamp)} - ${roll.actorName} rolled ${roll.total} (${roll.rolled} + ${roll.modifier}) for ${roll.note}`
      );
    }
  } else {
    lines.push("- No rolls recorded.");
  }
  lines.push("");

  lines.push("## Recent Table Events");
  lines.push("");
  if (snapshot.eventLog.length) {
    for (const entry of snapshot.eventLog) {
      lines.push(
        `- ${formatIsoForMarkdown(entry.timestamp)} - [${entry.category}] ${entry.summary} (${entry.actor.label}; ${entry.visibility})`
      );
    }
  } else {
    lines.push("- No table events recorded.");
  }
  lines.push("");

  lines.push("## Pending Approval Queue");
  lines.push("");
  if (snapshot.approvalQueue.length) {
    for (const proposal of snapshot.approvalQueue) {
      lines.push(
        `- ${formatIsoForMarkdown(proposal.createdAt)} - ${proposal.summary} (queued by ${proposal.submittedBy.label})`
      );
    }
  } else {
    lines.push("- No queued state changes.");
  }
  lines.push("");

  lines.push("## Presence Snapshot");
  lines.push("");
  if (runtime.clients.length) {
    for (const client of runtime.clients) {
      lines.push(
        `- ${client.role} - ${client.playerLabel ?? client.clientId} - ${client.status} - last seen ${formatIsoForMarkdown(client.lastSeenAt)}`
      );
    }
  } else {
    lines.push("- No connected clients.");
  }
  lines.push("");
  lines.push("---");
  lines.push(
    `Export file hint: ${sanitizeFilePart(snapshot.campaignTitle)}-session-summary-${fileStamp}.md`
  );

  return lines.join("\n");
}
