import type express from "express";
import { randomUUID } from "node:crypto";
import type { Character, TableEventRecord, SessionSnapshot } from "../../../packages/contracts/dist/index.js";

type CharacterRouteHooks = {
  party: Character[];
  recordTableEvent(event: Omit<TableEventRecord, "id" | "timestamp">): TableEventRecord;
  publishSessionState(): SessionSnapshot;
  persistState(): void;
  requireRole(...roles: ("gm" | "admin" | "player")[]): express.RequestHandler;
};

// Separate installers preserve their existing positions among unrelated routes.
// Both require session access and the synchronous command boundary installed first.
export function installCharacterCreationRoute(app: express.Express, {
  party, recordTableEvent, publishSessionState, persistState, requireRole
}: CharacterRouteHooks) {
  app.post("/api/characters", requireRole("gm", "admin"), (request, response) => {
    const name = typeof request.body.name === "string" ? request.body.name.trim() : "";
    const classLabel = typeof request.body.classLabel === "string" ? request.body.classLabel.trim() : "";
    const maxHp = typeof request.body.maxHp === "number" ? request.body.maxHp : 10;
    const armorClass = typeof request.body.armorClass === "number" ? request.body.armorClass : 10;
    const level = typeof request.body.level === "number" ? request.body.level : 1;
    const clientNotes = Array.isArray(request.body.notes) ? request.body.notes.filter((n: unknown) => typeof n === "string") as string[] : [];
    const image = typeof request.body.image === "string" && request.body.image.length > 0 ? request.body.image : null;

    if (!name || !classLabel) {
      response.status(400).json({ error: "name and classLabel are required" });
      return;
    }

    const notes = clientNotes.length > 0 ? clientNotes : [`Created at level ${level}`];

    const character: Character = {
      id: randomUUID(),
      name,
      classLabel,
      hp: { current: maxHp, max: maxHp },
      armorClass,
      initiative: null,
      conditions: [],
      resources: [],
      inventory: [],
      notes,
      image,
      claimedByClientId: null,
      claimedByLabel: null
    };

    party.push(character);

    recordTableEvent({
      category: "state",
      type: "character_created",
      actor: { id: "gm", kind: "gm", label: "GM" },
      visibility: "gm_only",
      summary: `Character ${name} created`,
      payload: { characterId: character.id, name, classLabel }
    });

    publishSessionState();

    persistState();
    response.status(201).json(character);
  });
}

export function installCharacterClaimRoutes(app: express.Express, {
  party, recordTableEvent, publishSessionState, persistState, requireRole
}: CharacterRouteHooks) {
  app.post("/api/claim-character", requireRole("player", "gm", "admin"), (request, response) => {
    const clientId = typeof request.body.clientId === "string" ? request.body.clientId.trim() : "";
    const characterId = typeof request.body.characterId === "string" ? request.body.characterId.trim() : "";
    const playerLabelRaw =
      typeof request.body.playerLabel === "string" ? request.body.playerLabel.trim() : "";
    const playerLabel = playerLabelRaw || "Player";


    if (!clientId || !characterId) {
      response.status(400).json({
        error: "clientId and characterId are required"
      });
      return;
    }

    const character = party.find((entry) => entry.id === characterId);

    if (!character) {
      response.status(404).json({
        error: "Character not found"
      });
      return;
    }

    if (character.claimedByClientId && character.claimedByClientId !== clientId) {
      response.status(409).json({
        error: "Character already claimed"
      });
      return;
    }

    for (const entry of party) {
      if (entry.claimedByClientId === clientId && entry.id !== characterId) {
        entry.claimedByClientId = null;
        entry.claimedByLabel = null;
      }
    }

    character.claimedByClientId = clientId;
    character.claimedByLabel = playerLabel;
    recordTableEvent({
      category: "claim",
      type: "character_claimed",
      actor: {
        id: clientId,
        kind: "player",
        label: playerLabel
      },
      visibility: "player_visible",
      summary: `${playerLabel} claimed ${character.name}`,
      payload: {
        clientId,
        characterId: character.id,
        characterName: character.name,
        playerLabel
      }
    });

    const sessionSnapshot = publishSessionState();
    persistState();
    const result = {
      ok: true,
      sessionSnapshot
    };
    response.json(result);
  });

  app.post("/api/release-character", requireRole("player", "gm", "admin"), (request, response) => {
    const clientId = typeof request.body.clientId === "string" ? request.body.clientId.trim() : "";


    if (!clientId) {
      response.status(400).json({
        error: "clientId is required"
      });
      return;
    }

    for (const character of party) {
      if (character.claimedByClientId === clientId) {
        const previousLabel = character.claimedByLabel ?? "Player";
        character.claimedByClientId = null;
        character.claimedByLabel = null;
        recordTableEvent({
          category: "claim",
          type: "character_released",
          actor: {
            id: clientId,
            kind: "player",
            label: previousLabel
          },
          visibility: "player_visible",
          summary: `${previousLabel} released ${character.name}`,
          payload: {
            clientId,
            characterId: character.id,
            characterName: character.name,
            playerLabel: previousLabel
          }
        });
      }
    }

    const sessionSnapshot = publishSessionState();
    persistState();
    const result = {
      ok: true,
      sessionSnapshot
    };
    response.json(result);
  });
}
