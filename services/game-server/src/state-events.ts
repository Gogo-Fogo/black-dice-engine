import { isStateEventRequest, type Character, type StateEventRequest, type TableEventRecord, type SessionSnapshot } from "../../../packages/contracts/dist/index.js";

type StateEventHooks = {
  resolveCharacter(id: string): Character | null;
  recordTableEvent(event: Omit<TableEventRecord, "id" | "timestamp">): TableEventRecord;
  publishSessionState(): SessionSnapshot;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function createStateEvents({ resolveCharacter, recordTableEvent, publishSessionState }: StateEventHooks) {
  function applyStateEvent(event: StateEventRequest, actorLabel = "GM Dashboard") {
    if (!isStateEventRequest(event)) return { ok: false as const, statusCode: 400, body: { error: "Invalid state event." } };
    const character = resolveCharacter(event.characterId);

    if (!character) {
      return {
        ok: false as const,
        statusCode: 404,
        body: {
          error: "Character not found"
        }
      };
    }

    if (event.type === "hp_delta") {
      if (typeof event.amount !== "number" || Number.isNaN(event.amount)) {
        return {
          ok: false as const,
          statusCode: 400,
          body: {
            error: "Numeric amount is required"
          }
        };
      }

      const previous = character.hp.current;
      character.hp.current = clamp(character.hp.current + event.amount, 0, character.hp.max);
      recordTableEvent({
        category: "state",
        type: "hp_changed",
        actor: {
          id: "gm-dashboard",
          kind: "gm",
          label: actorLabel
        },
        visibility: "player_visible",
        summary: `${character.name} HP ${previous} -> ${character.hp.current}`,
        payload: {
          characterId: character.id,
          characterName: character.name,
          previous,
          current: character.hp.current,
          delta: event.amount
        }
      });
      return {
        ok: true as const,
        statusCode: 200,
        body: {
          ok: true,
          sessionSnapshot: publishSessionState()
        }
      };
    }

    if (event.type === "condition_add") {
      const condition = typeof event.condition === "string" ? event.condition.trim() : "";

      if (!condition) {
        return {
          ok: false as const,
          statusCode: 400,
          body: {
            error: "Condition is required"
          }
        };
      }

      if (!character.conditions.includes(condition)) {
        character.conditions.push(condition);
        recordTableEvent({
          category: "state",
          type: "condition_added",
          actor: {
            id: "gm-dashboard",
            kind: "gm",
            label: actorLabel
          },
          visibility: "player_visible",
          summary: `${character.name} gained condition: ${condition}`,
          payload: {
            characterId: character.id,
            characterName: character.name,
            condition
          }
        });
      }

      return {
        ok: true as const,
        statusCode: 200,
        body: {
          ok: true,
          sessionSnapshot: publishSessionState()
        }
      };
    }

    if (event.type === "condition_remove") {
      const condition = typeof event.condition === "string" ? event.condition.trim() : "";

      if (!condition) {
        return {
          ok: false as const,
          statusCode: 400,
          body: {
            error: "Condition is required"
          }
        };
      }

      const hadCondition = character.conditions.includes(condition);
      character.conditions = character.conditions.filter((entry) => entry !== condition);
      if (hadCondition) {
        recordTableEvent({
          category: "state",
          type: "condition_removed",
          actor: {
            id: "gm-dashboard",
            kind: "gm",
            label: actorLabel
          },
          visibility: "player_visible",
          summary: `${character.name} cleared condition: ${condition}`,
          payload: {
            characterId: character.id,
            characterName: character.name,
            condition
          }
        });
      }
      return {
        ok: true as const,
        statusCode: 200,
        body: {
          ok: true,
          sessionSnapshot: publishSessionState()
        }
      };
    }

    if (event.type === "resource_set") {
      if (typeof event.resourceId !== "string" || typeof event.value !== "number" || Number.isNaN(event.value)) {
        return {
          ok: false as const,
          statusCode: 400,
          body: {
            error: "resourceId and numeric value are required"
          }
        };
      }

      const resource = character.resources.find((entry) => entry.id === event.resourceId);

      if (!resource) {
        return {
          ok: false as const,
          statusCode: 404,
          body: {
            error: "Resource not found"
          }
        };
      }

      const previous = resource.current;
      resource.current = clamp(event.value, 0, resource.max);
      recordTableEvent({
        category: "state",
        type: "resource_changed",
        actor: {
          id: "gm-dashboard",
          kind: "gm",
          label: actorLabel
        },
        visibility: "player_visible",
        summary: `${character.name} ${resource.label} ${previous}/${resource.max} -> ${resource.current}/${resource.max}`,
        payload: {
          characterId: character.id,
          characterName: character.name,
          resourceId: resource.id,
          resourceLabel: resource.label,
          previous,
          current: resource.current,
          max: resource.max
        }
      });
      return {
        ok: true as const,
        statusCode: 200,
        body: {
          ok: true,
          sessionSnapshot: publishSessionState()
        }
      };
    }

    if (event.type === "initiative_set") {
      const value = typeof event.value === "number" && !Number.isNaN(event.value) ? event.value : null;

      character.initiative = value;
      recordTableEvent({
        category: "state",
        type: "initiative_set",
        actor: {
          id: "gm-dashboard",
          kind: "gm",
          label: actorLabel
        },
        visibility: "player_visible",
        summary: value !== null ? `${character.name} initiative set to ${value}` : `${character.name} initiative cleared`,
        payload: {
          characterId: character.id,
          characterName: character.name,
          initiative: event.value
        }
      });
      return {
        ok: true as const,
        statusCode: 200,
        body: {
          ok: true,
          sessionSnapshot: publishSessionState()
        }
      };
    }

    return {
      ok: false as const,
      statusCode: 400,
      body: {
        error: "Unsupported state event type"
      }
    };
  }

  function summarizeStateEvent(event: StateEventRequest) {
    const character = resolveCharacter(event.characterId);
    const characterName = character?.name ?? "Unknown character";

    if (event.type === "hp_delta") {
      const direction = event.amount >= 0 ? "+" : "";
      return `${characterName} HP ${direction}${event.amount}`;
    }

    if (event.type === "condition_add") {
      return `${characterName} add condition: ${event.condition}`;
    }

    if (event.type === "condition_remove") {
      return `${characterName} remove condition: ${event.condition}`;
    }

    return `${characterName} set resource`;
  }

  return { apply: applyStateEvent, summarize: summarizeStateEvent };
}
