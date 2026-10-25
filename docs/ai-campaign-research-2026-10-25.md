# Campaign AI research — 25 October 2026

Research and recommendations only. No cloud provider was enabled, model downloaded, model inference run, or runtime update installed. TTS is not wanted for this campaign; text narration and image generation remain wanted.

## Recommendation

### Clarification: benchmark status and newer Gemini models

No hands-on model benchmark was run. This shortlist compares official pricing, documented features, and integration effort. It does not establish a winner for storytelling, latency, continuity, or character likeness.

Google's current lineup also includes Gemini 3.8 Flash and the flagship Gemini 4 Argon. Omitting them from the initial brief made the cheap-model shortlist look like a current-model overview; it was incomplete. Include 3.8 Flash in the practical campaign comparison and Argon as a higher-cost quality reference. Argon's standard introductory price is $2/M input and $10/M output through November 30, 2026, rising to $4/$20 on December 1. On the illustrative workload below that is $6 now or $12 afterward, excluding extra reasoning and other charges. These are cost calculations, not quality measurements. [Current Gemini models](https://ai.google.dev/gemini-api/docs/models), [official pricing](https://ai.google.dev/gemini-api/docs/pricing).

DeepSeek Flash is specifically the V4.1-Flash-1017 backend behind `deepseek-flash`, not the retired V4 Flash backend.

Use an inexpensive hosted text model for live narration and GM proposals, keeping the RTX 5070 Ti available for local character and scene images. Shortlist GPT-6 Luna, DeepSeek Flash, and Claude Haiku 5.5. Choose using an original/demo campaign comparison, rather than coding leaderboards. Keep a local model as an optional offline fallback.

GPT-6 Luna is my first integration candidate because this repository already has an OpenAI transport, although its request parameters still need compatibility checks. DeepSeek Flash is a reasonable competing candidate, especially with repeated cached context. Haiku requires a new provider transport here. None has been benchmarked in this app, so this is an integration/cost recommendation, not a demonstrated storytelling ranking.

## Live text API cost comparison

USD per million tokens, standard interactive processing, uncached input; checked against official pages on the date above. Batch/Flex discounts are excluded because live play needs timely responses.

| Model | Input | Output | Illustrative session cost |
| --- | ---: | ---: | ---: |
| GPT-6 Luna | $0.10 | $0.50 | $0.30 |
| Claude Haiku 5.5 | $0.10 | $0.50 | $0.30 |
| DeepSeek Flash, off-peak | $0.15 | $0.60 | $0.42 |
| DeepSeek Flash, peak | $0.30 | $1.20 | $0.84 |
| Gemini 3.5 Flash-Lite | $0.30 | $2.50 | $1.10 |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | $0.28 |

Illustration: 500 requests averaging 4,000 input and 400 output tokens = 2M input + 0.2M output tokens. This is an assumed workload, not measured usage. Tokenizers differ. Reasoning, retries, tools, reference-image input, taxes, and cache charges can change costs.

- [OpenAI Luna model and pricing](https://developers.openai.com/api/docs/models/gpt-6-luna): Standard rates above; Batch/Flex are half-price. Long prompts have higher rates. Supports structured outputs and explicit reasoning control.
- [Claude Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/overview): quoted rates apply to prompts up to 100,000 tokens; longer prompts cost $0.50 input/$2.50 output. Adaptive thinking defaults on; sampling parameters must be omitted.
- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/): use `deepseek-flash`, currently served by DeepSeek-V4.1-Flash-1017. Thinking defaults on. Peak hours: 01:00–04:00 and 06:00–10:00 UTC on weekdays excluding Chinese public holidays; all other times are off-peak. Cache-hit input is $0.003/M off-peak, $0.006/M peak. Cache performance must be measured before estimating savings.
- [Google pricing](https://ai.google.dev/gemini-api/docs/pricing): 2.5 Flash-Lite remains a low-price comparison candidate; newer does not necessarily mean cheaper. Paid standard-tier and free-tier data treatment differ; use the appropriate paid terms for campaign material.

Small differences in session text spend are less important than continuity, latency, usable output, and avoiding repeated failed calls. Do not resend the full campaign history every turn. Send a compact approved state summary and relevant memories, preserving audience labels.

## Local GM assistant assessment

The code implements a GM assistant/director, not a separate dedicated content-moderation model.

Confirmed from the repository and local metadata checks:

- GPU: NVIDIA GeForce RTX 5070 Ti, 16,303 MiB reported total VRAM. This is shared by local LLM and image workloads.
- Default configuration: Ollama at loopback port 11434 using `qwen2.5:7b`; OpenAI transport defaults to `gpt-4o-mini`. These are defaults, not confirmation of live environment overrides.
- Installed Ollama CLI reported version 0.23.0. The local API refused connections during inspection; installed/loaded model inventory and actual inference speed could not be verified.
- [Latest official Ollama release](https://github.com/ollama/ollama/releases/tag/v0.40.11) is 0.40.11, released 24 October 2026. Updating runtime and changing model are separate operations. The latest release alone does not establish a campaign-quality improvement.
- The Ollama adapter sets temperature/output length but does not set schema-constrained `format`, thinking controls, context length, or residency/unload behavior. Director-model configuration is read but not used to select a distinct model in the adapter.
- Prompts correctly treat AI suggestions as proposals and reserve authoritative state changes for validated commands/GM review. Keep that boundary regardless of provider.

Qwen2.5 7B is a sensible baseline, but I would evaluate a newer small model before investing more in it. First local candidate: [Qwen3.5 4B](https://ollama.com/library/qwen3.5:4b); compare 9B only if quality gains justify memory use and latency. The 4B page lists roughly 3.3–4.0 GB artifacts depending on backend; artifact size is not total VRAM consumption. Its advertised family benchmark table describes the much larger flagship, not proof of 4B campaign quality.

Before changing models, add [supported thinking controls](https://docs.ollama.com/capabilities/thinking), [schema-constrained output](https://docs.ollama.com/capabilities/structured-outputs), bounded context, and model unloading/scheduling around image jobs. Inspect the selected model's supported thinking values rather than assuming all models accept the same controls. Keep bounded timeouts and a playable manual fallback.

## Images and no TTS

Keep TTS unstarted and exclude speech synthesis from the critical path. The current Kokoro service does not explicitly select a GPU backend, so a large VRAM saving from removing TTS has not been established. Avoiding a resident local LLM is the more direct way to reserve GPU capacity for images.

Keep the current local reference-image pipeline as the first path. Queue generation, reuse approved character references and appearance descriptions, and approve results before sharing. A seed helps repeatability but does not by itself preserve identity. GPU likeness and simultaneous LLM/image memory use still need real measurements.

A hosted fallback worth testing is Gemini 3.1 Flash Lite Image: approximately $0.0336 output cost per 1K image, plus input/text costs. One hundred outputs are about $3.36 before those additions and retries. It supports generation/editing; reference fidelity needs its own comparison. [Official image pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite-image). Do not use the retired Gemini 2.5 Flash Image endpoint.

## Small next-work checklist

- [ ] Run the same 20 original/demo prompts through the three text finalists: narration, NPC dialogue, continuity, missing context, GM-only secrets, and valid proposals.
- [ ] Record answer latency, completion rate, token cost, schema validity, continuity mistakes, and unwanted reasoning/refusals; choose with blind output review.
- [ ] Add provider-specific reasoning/token/schema handling before enabling the winner; preserve existing remote-AI approval requirements.
- [ ] Restore/verify the local Ollama endpoint; update only with approval and enough time for rollback and demo checks.
- [ ] Evaluate Qwen3.5 4B as an optional offline fallback; compare image-job memory pressure with it unloaded.
- [ ] Measure local scene latency and likeness using approved demo references; compare hosted image editing only if local quality/latency falls short.
- [ ] Keep TTS off; prioritize character fidelity, image completion status, and graceful failure over extra media features.

## Inspection side effect

The Ollama CLI metadata query unexpectedly auto-started its desktop app. Its automatic updater downloaded an installer outside the repository; I did not execute it. I stopped the desktop process created by that query. No models or campaign content were loaded by these research checks. Future inventory checks should use the local read-only HTTP endpoints when available, avoiding CLI auto-start.

## D&D-specific follow-up: continuity and progression

User priority: inexpensive campaign AI with stable canon and a continuing campaign that delivers visible progress. Repeated dialogue, reset obstacles, recycled clues, and endless prerequisite quests are unacceptable. TTS remains unwanted. Model choice must be evaluated on these requirements.

### Relevant published evidence reviewed

- [NCP-Bench](https://github.com/NLP2CT/NCP-Bench#-main-results) evaluates interactive narrative facts, commitments, and player interventions. Its six-model comparison includes GPT-5.2, GPT-4o-mini, DeepSeek-V3.2 and other older models, not our exact current shortlist. Fact-conflict incidence was 40–68% under its adversarial protocol. Its hierarchical-memory comparison reduced commitment conflicts but increased conflicts with player input. It supports auditing both continuity and agency; it does not justify copying a fixed plot or claiming memory scaffolding always helps.
- [WSE-bench, August 2026 preprint](https://arxiv.org/html/2608.15654v1) separates continued generation, consistency, and meaningful development. Across its tested architectures GPT-5.6-sol and Gemini-3.1-Pro favored consistency, while DeepSeek-V4-Pro favored narrative richness. These results do not transfer directly to Luna, Gemini 3.8 Flash, or V4.1 Flash. More output or a larger model is not itself evidence of better progression. Its world-simulation setting differs from a live human D&D table.
- [MiniMax Role-play Benchmark](https://huggingface.co/datasets/MiniMaxAI/role-play-bench/blob/main/README.md) uses 100-turn conversations and explicitly evaluates stagnation, repetition, world logic, and user agency. Its published table covers older model versions; it is vendor-authored and its released scenarios skew toward conversational roleplay. It supplies useful evaluation categories, not an independently established winner for our campaign.
- [CriticaLLM, October 2026 preprint](https://arxiv.org/html/2610.21525v1) is directly about automated tabletop GMs, but evaluates simplified three-room adventures rather than proving reliability across an open-ended campaign. Its bounded adventure structure and retained story context are relevant design examples.

No hands-on benchmark has been run here. No reviewed source establishes the best current cheap API for our exact campaign flow. The previous first-choice API recommendation was based on cost and transport reuse, not demonstrated campaign quality.

### Repository gap confirmed

In `services/game-server/src/ai-adapter.ts`, action suggestions receive up to four facts and optional recent outcomes; director guidance receives up to four facts and a memory-entry count. Narration receives up to five recent events. These builders do not supply a dedicated progress ledger, completed-objective list, resolved-obstacle list, or no-progress counter. Memory storage elsewhere does not establish that the narrator sees the relevant remembered content.

The proposed fix is explicit campaign state and pacing checks, retaining the existing deterministic commands and host approvals. Prompt instructions alone are insufficient. No runtime behavior was changed during this research.

### Proposed campaign behavior

1. Persist confirmed facts with stable entity IDs, NPC status/knowledge, important promises and outcomes, discovered clues, and source/audience labels. Give each request the relevant records, rather than just a count or the first few stored facts.
2. Track objectives as active, completed, failed, or abandoned. Record actual progress: discoveries, meaningful choices, relationships, locations, rewards, and GM-approved milestones. A solved obstacle stays solved unless a recorded world change justifies reopening it.
3. Give scenes a purpose and explicit resolution conditions. Allow several routes and player-created solutions. Complete arcs, grant earned rewards through validated commands, and open a new arc rather than indefinitely extending the current prerequisite chain.
4. Resolve failed checks with an approved consequence or alternative route when appropriate: cost, time, danger, or a changed opportunity. Failure must still be possible; do not manufacture success or alter dice. Avoid repeating identical checks without a meaningful change in approach or circumstances.
5. Track whether consequential action resolutions actually changed knowledge, objectives, relationships, resources, or world state. After three consecutive resolutions without meaningful change, flag possible stagnation to the GM. This is a proposed tunable threshold, not a rule for every dialogue turn; player-chosen conversation can remain slow.
6. On a stall, propose a concrete, causally justified development or available exit. Do not seize player decisions, invent permanent canon, automatically reveal secrets, or force a predetermined story route. Validate proposals and require existing host approval for state changes.
7. Show players a concise journal of discovered information, current goals, completed goals, and earned milestones. Visible progression should reflect saved events, not an arbitrary progress bar or AI prose alone.

Example: Once the party obtains an archive key, the archive can be opened. The model cannot silently require another seal, then another password, then another errand. A genuine newly introduced barrier needs a justified recorded event and GM approval.

### Revised budget decision and acceptance checks

Treat DeepSeek V4.1 Flash as a provisional budget candidate, not a proven continuity winner. Compare it with Gemini 3.8 Flash and GPT-6 Luna using the same compact approved context and progress tracking. Use a stronger model only if measured improvement justifies the extra cost. A stronger scene planner used occasionally is an option to evaluate, not an implemented router or guaranteed cure.

- [ ] Create original demo adventures with known facts, solvable goals, branching routes, and expected milestone opportunities.
- [ ] Run at least 50 turns per adventure with multiple runs per model; record exact model version, settings, prompt, total tokens and cost.
- [ ] Check delayed recall, resolved-obstacle preservation, NPC identity/status, GM-secret boundaries, and continuity after save/reload.
- [ ] Test repeated questions, several failed checks, rejected hooks, unexpected player plans, and deliberate slow conversation.
- [ ] Grade contradictions, unjustified reopened gates, repeated proposals, consecutive stalled action resolutions, agency violations, completed objectives, and latency.
- [ ] Compare cost per useful completed scene or objective, not just price per token. Reject a cheap model if correction calls and wasted play make it worse value.
- [ ] Implement and verify the smallest persistent progress/scene-resolution flow before relying on a model to sustain the campaign.

These are proposed next steps. Live remote benchmarks, paid calls, cloud enablement and new model downloads have not been performed or authorized by this research request.

## Deeper implementation review and decision

Follow-up inspection of the actual callers confirms that the highest-value first work is correcting the information supplied to the model and retaining campaign progress. A more expensive narrator cannot reconstruct outcomes it was never given.

### Concrete findings

| Finding | Code evidence | Campaign implication |
| --- | --- | --- |
| Historical proposal context uses a fixed DC | `/api/ai/propose-action` in `services/game-server/src/index.ts` maps recent rolls to `success: r.total >= 10` | A roll of 12 against DC 15 can be presented to the model as a success. Persist and reuse the resolved outcome and actual action/DC. |
| Group narration gets one roll | `services/game-server/src/ttrpg-action-routes.ts` builds its AI roll context from `rollsForAction[0]` despite collecting the claimed party's rolls | A mixed party result is not fully represented to the narrator. Give narration a validated aggregate plus the relevant individual outcomes. |
| The main AI context builder omits memory records | `services/game-server/src/ai-context.ts` constructs context from current scene facts, events, and party; director callers separately supply only `memoryEntries.length` | Saved memory summaries elsewhere in the app are not automatically available to the actual model. Add relevant approved memory content with audience filtering. |
| Recent-state arrays are bounded | `recordTableEvent` trims the event buffer to 20; `createMemoryEntry` trims the memory buffer to eight in `services/game-server/src/index.ts` | These buffers alone are insufficient evidence of a durable full-campaign ledger. Preserve confirmed facts, decisions and objective state separately rather than relying on recent summaries. |
| No explicit objective lifecycle is passed to the director | Current director input has scene/party/facts and administrative metrics | Completed gates and remaining goals cannot be reliably enforced or displayed from that context. |

Public-demo narration intentionally receives a stricter visibility subset than GM guidance. Do not fix missing context by indiscriminately sending GM or player-private material to public narration. Build audience-appropriate outcome and memory records instead.

### Recommended order

1. Correct action/roll history and represent group resolutions accurately.
2. Persist a compact ledger of confirmed canon, active/completed/failed objectives, resolved obstacles, and pending consequences; recover it on reconnect/restart.
3. Feed the relevant ledger records and last few resolved beats into a scene proposal. The model proposes consequences and a next opportunity; approved deterministic commands establish actual progress.
4. Prevent accidental resurrection of resolved obstacles. Add a GM-visible stall signal and voluntary pacing control; do not force movement during player-chosen roleplay.
5. Compare DeepSeek V4.1 Flash and Gemini 3.8 Flash in repeated 50-turn original demo scenarios using the same corrected context. Include a stronger-model reference on a small sample only if the cheap candidates fail.

A default pace can aim for a substantive payoff every few scenes, while letting the GM choose slower exploration or faster adventure. Ending a scene is not enough: a payoff should leave a real discovery, relationship change, resolved goal, resource consequence or earned milestone. Progress can include a meaningful failure; it must not be fabricated success.

### Budget interpretation

Current standard Gemini 3.8 Flash pricing is $0.75/M input and $3.75/M output through December 31, 2026, rising to $1.50/$7.50 on January 1, 2027. On the earlier 2M-input/0.2M-output illustration, that is $2.25 now, before extras. DeepSeek Flash is $0.42 off-peak or $0.84 peak on the same assumed token counts. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing), [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/).

That makes both plausible campaign budgets. Prefer Gemini if a controlled comparison shows materially fewer contradictions or stalls; prefer DeepSeek if it meets the same acceptance criteria at lower spend. The roughly $1–2 difference in this illustrative workload is smaller than the cost of losing table time. No current benchmark reviewed establishes which of those exact models will win.

I would keep the local LLM as an optional offline fallback and keep image generation independent from text-provider selection. There is no requirement to buy narration and image generation from the same provider. This follow-up changes the research recommendation only; no code fixes, paid API calls, model changes or live-service restarts were performed.
