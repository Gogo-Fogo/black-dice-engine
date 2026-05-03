/**
 * AI Adapter for Black Dice Engine
 *
 * Supports Ollama (local) and OpenAI (remote) LLM providers.
 * Provides structured prompts for narration, scene proposals, and director guidance.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

// ─── Configuration ───────────────────────────────────────────────────────────

const provider = process.env.BDE_LLM_PROVIDER?.trim().toLowerCase() || "ollama";
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
const ollamaModel = process.env.OLLAMA_MODEL?.trim() || "qwen2.5:7b";
const openaiBaseUrl = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || "";
const openaiModel = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const directorModeModel = process.env.BDE_DIRECTOR_MODE_MODEL?.trim() || "";

const gmPromptPath = join(currentDir, "../../../prompts/gm-system-prompt.md");
const directorPromptPath = join(currentDir, "../../../prompts/director-prompt.md");

let gmSystemPrompt = "";
try {
  gmSystemPrompt = readFileSync(gmPromptPath, "utf8");
} catch {
  gmSystemPrompt = "You are a helpful tabletop RPG game master assistant.";
}

let directorPrompt = "";
try {
  directorPrompt = readFileSync(directorPromptPath, "utf8");
} catch {
  directorPrompt = "You are a director for a tabletop RPG session.";
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface AiCompletionResult {
  text: string;
  provider: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  error?: string;
}

export interface RollResultContext {
  actorName: string;
  actionDescription: string;
  diceLabel: string;
  total: number;
  modifier: number;
  rawRoll: number;
  success: boolean;
  critical?: "success" | "failure" | null;
  contested?: boolean;
  opponentName?: string;
  opponentTotal?: number;
}

export interface SceneContext {
  campaignTitle: string;
  currentScene: string;
  sceneDescription?: string;
  location?: { name: string; summary: string };
  tone: string[];
  facts: string[];
  activeCharacters: Array<{ name: string; raceClass: string; hp: number; maxHp: number }>;
  recentEvents: string[];
}

// ─── Low-level completion ────────────────────────────────────────────────────

export async function aiChatCompletion(
  messages: AiMessage[],
  opts: AiCompletionOptions = {}
): Promise<AiCompletionResult> {
  if (provider === "openai" || provider === "chatgpt") {
    return callOpenAi(messages, opts);
  }
  return callOllama(messages, opts);
}

async function callOllama(
  messages: AiMessage[],
  opts: AiCompletionOptions
): Promise<AiCompletionResult> {
  const url = `${ollamaBaseUrl}/api/chat`;
  const body = {
    model: ollamaModel,
    messages,
    stream: false,
    options: {
      temperature: opts.temperature ?? 0.8,
      num_predict: opts.maxTokens ?? 512
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30000)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      return { text: "", provider: "ollama", model: ollamaModel, error: `Ollama HTTP ${res.status}: ${text}` };
    }

    const data = (await res.json()) as { message?: { content?: string }; done?: boolean };
    const text = data.message?.content?.trim() || "";
    return { text, provider: "ollama", model: ollamaModel };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: "", provider: "ollama", model: ollamaModel, error: message };
  }
}

async function callOpenAi(
  messages: AiMessage[],
  opts: AiCompletionOptions
): Promise<AiCompletionResult> {
  if (!openaiApiKey) {
    return { text: "", provider: "openai", model: openaiModel, error: "OPENAI_API_KEY not configured" };
  }

  const url = `${openaiBaseUrl}/chat/completions`;
  const body = {
    model: openaiModel,
    messages,
    temperature: opts.temperature ?? 0.8,
    max_tokens: opts.maxTokens ?? 512
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30000)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      return { text: "", provider: "openai", model: openaiModel, error: `OpenAI HTTP ${res.status}: ${text}` };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    return {
      text,
      provider: "openai",
      model: openaiModel,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens
          }
        : undefined
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: "", provider: "openai", model: openaiModel, error: message };
  }
}

// ─── High-level generators ───────────────────────────────────────────────────

export async function generateNarration(
  context: SceneContext,
  roll: RollResultContext,
  opts?: AiCompletionOptions
): Promise<AiCompletionResult> {
  const system = gmSystemPrompt;
  const user = buildNarrationPrompt(context, roll);

  return aiChatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    { temperature: 0.85, maxTokens: 350, ...opts }
  );
}

export async function proposeSceneAction(
  context: SceneContext,
  previousAction?: string,
  rollOutcomes?: RollResultContext[],
  opts?: AiCompletionOptions
): Promise<AiCompletionResult> {
  const system = gmSystemPrompt;
  const user = buildActionPrompt(context, previousAction, rollOutcomes);

  return aiChatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    { temperature: 0.8, maxTokens: 400, ...opts }
  );
}

export async function generateDirectorGuidance(
  context: SceneContext,
  pendingApprovals: number,
  memoryCount: number,
  opts?: AiCompletionOptions
): Promise<AiCompletionResult> {
  const system = directorPrompt;
  const user = buildDirectorPrompt(context, pendingApprovals, memoryCount);

  return aiChatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    { temperature: 0.7, maxTokens: 450, ...opts }
  );
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

function buildNarrationPrompt(context: SceneContext, roll: RollResultContext): string {
  const parts = [
    `## Scene`,
    `Campaign: ${context.campaignTitle}`,
    `Location: ${context.location?.name || context.currentScene}`,
    `Description: ${context.location?.summary || context.sceneDescription || ""}`,
    `Tone: ${context.tone.join(", ")}`,
    ``,
    `## Characters Present`,
    context.activeCharacters.map((c) => `- ${c.name} (${c.raceClass}) HP ${c.hp}/${c.maxHp}`).join("\n"),
    ``,
    `## Roll Result`,
    `Actor: ${roll.actorName}`,
    `Action: ${roll.actionDescription}`,
    `Roll: ${roll.diceLabel} = ${roll.total} (raw ${roll.rawRoll}${roll.modifier >= 0 ? "+" : ""}${roll.modifier})`,
    `Result: ${roll.critical === "success" ? "CRITICAL SUCCESS" : roll.critical === "failure" ? "CRITICAL FAILURE" : roll.success ? "SUCCESS" : "FAILURE"}`
  ];

  if (roll.contested && roll.opponentName) {
    parts.push(`Contested against: ${roll.opponentName} (${roll.opponentTotal})`);
  }

  parts.push(
    ``,
    `## Recent Events`,
    context.recentEvents.slice(0, 5).join("\n") || "None",
    ``,
    `## Task`,
    `Write a vivid, cinematic narration (2-4 sentences) of what happens when ${roll.actorName} attempts this action.`,
    `Reflect the ${roll.success ? "success" : "failure"} in the outcome.`,
    `Keep it concise for live play. Do not invent permanent state changes.`,
    `Return ONLY the narration text, no markdown, no labels.`
  );

  return parts.join("\n");
}

function buildActionPrompt(
  context: SceneContext,
  previousAction?: string,
  rollOutcomes?: RollResultContext[]
): string {
  const parts = [
    `## Scene`,
    `Campaign: ${context.campaignTitle}`,
    `Current Scene: ${context.currentScene}`,
    `Location: ${context.location?.name || ""}`,
    `Description: ${context.location?.summary || context.sceneDescription || ""}`,
    `Tone: ${context.tone.join(", ")}`,
    `Facts: ${context.facts.slice(0, 4).join(" | ") || "None"}`,
    ``,
    `## Characters`,
    context.activeCharacters.map((c) => `- ${c.name} (${c.raceClass}) HP ${c.hp}/${c.maxHp}`).join("\n"),
    ``,
    `## Task`,
    `Propose the next action or skill check the party should attempt.`
  ];

  if (previousAction) {
    parts.push(`Previous action: ${previousAction}`);
  }

  if (rollOutcomes && rollOutcomes.length > 0) {
    parts.push(`Recent roll outcomes:`);
    rollOutcomes.forEach((r) => {
      parts.push(`- ${r.actorName}: ${r.actionDescription} -> ${r.success ? "success" : "failure"}`);
    });
  }

  parts.push(
    ``,
    `Return a JSON object with exactly these fields:`,
    `- "action": a short action description (1 sentence)`,
    `- "skill": the primary skill or ability (e.g. "Athletics", "Perception", "Persuasion", "Stealth")`,
    `- "difficulty": "easy", "medium", "hard", or "very hard"`,
    `- "description": 1-2 sentences describing what the players are attempting`,
    `- "consequences": brief note on what happens on success vs failure`
  );

  return parts.join("\n");
}

function buildDirectorPrompt(
  context: SceneContext,
  pendingApprovals: number,
  memoryCount: number
): string {
  return [
    `## Campaign State`,
    `Campaign: ${context.campaignTitle}`,
    `Current Scene: ${context.currentScene}`,
    `Location: ${context.location?.name || ""}`,
    `Tone: ${context.tone.join(", ")}`,
    `Facts: ${context.facts.slice(0, 4).join(" | ") || "None"}`,
    ``,
    `## Characters`,
    context.activeCharacters.map((c) => `- ${c.name} (${c.raceClass}) HP ${c.hp}/${c.maxHp}`).join("\n"),
    ``,
    `## Session Metrics`,
    `Pending approvals: ${pendingApprovals}`,
    `Memory entries: ${memoryCount}`,
    ``,
    `## Task`,
    `Provide director guidance for the next scene beat.`,
    `Suggest 2-3 possible directions the scene could go.`,
    `Note any reveals that should be held back.`,
    `Suggest an audio mood tag and whether a scene image would help.`,
    `Return concise bullet points, no more than 8 lines.`
  ].join("\n");
}

// ─── Status helpers ──────────────────────────────────────────────────────────

export function getAiAdapterStatus(): {
  provider: string;
  model: string;
  endpointConfigured: boolean;
  endpoint: string | null;
} {
  if (provider === "openai" || provider === "chatgpt") {
    return {
      provider: "openai",
      model: openaiModel,
      endpointConfigured: Boolean(openaiApiKey),
      endpoint: openaiBaseUrl
    };
  }
  return {
    provider: "ollama",
    model: ollamaModel,
    endpointConfigured: Boolean(ollamaBaseUrl),
    endpoint: ollamaBaseUrl
  };
}
