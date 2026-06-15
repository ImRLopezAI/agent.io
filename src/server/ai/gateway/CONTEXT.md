# Context: Vercel AI Gateway adapter for TanStack AI

Glossary for the `src/server/ai/gateway/` integration. Terms only — no
implementation detail.

## Terms

- **Gateway adapter** — A TanStack AI adapter that reaches models through the
  Vercel AI Gateway. The integration is a _suite_ of per-activity adapters
  (text, image, video), not a single object.

- **Bridge** (a.k.a. _translator_) — The conversion layer between two distinct
  event vocabularies: TanStack AI's AG-UI `StreamChunk` events and the AI SDK's
  `LanguageModelV3` stream parts. "Wiring the gateway" means writing this
  bridge in both directions; it is not a passthrough.

- **AG-UI StreamChunk** — TanStack AI's streaming event type (from
  `@ag-ui/core`): `RUN_STARTED`, `TEXT_MESSAGE_*`, `TOOL_CALL_*`,
  `REASONING_*`, `RUN_FINISHED`, `RUN_ERROR`. What every TanStack adapter must
  yield. The gateway adapter _owns_ emitting this lifecycle.

- **LanguageModelV3** — The AI SDK provider-spec model object returned by
  `gateway(modelId)`. Stateless and **single-turn**: one `doStream()` call
  per turn. It does the transport (HTTP, auth, provider routing, observability)
  and nothing else.

- **Tool loop ownership** — TanStack AI's `chat()` owns the agentic tool loop
  (it calls the adapter, sees tool calls, runs tools, loops). The gateway and
  the adapter do **not** run the loop; the adapter is a single-turn translator.

- **AIAdapter** — The TanStack umbrella _union type_ across activity kinds
  (text | summarize | image | audio | video | tts | transcription). It denotes
  _which activity_, not _which model_. `chat()` requires the narrower
  `AnyTextAdapter`, so the text adapter must satisfy `TextAdapter` specifically.

- **Model coverage** — The set of models the adapter can reach. It comes from
  passing the `provider/model` id string through to `gateway(modelId)`, not
  from any type. One text adapter therefore reaches every gateway _chat_ model.

- **Env-first auth** — The adapter authenticates exactly as the AI SDK does:
  read `AI_GATEWAY_API_KEY` from the environment by default; fall back to the
  Vercel OIDC token; allow overriding the key / settings through config.

- **Adapter responsibility boundary** — The adapter does faithful _single-turn
  translation_ (options in, AG-UI events out) and complete option
  pass-through. It does **not** run the agentic tool loop, middleware, MCP, or
  tool _execution_ — those belong to `chat()` (the engine). "Support everything
  `chat()` supports" therefore means: drop no option and translate each
  faithfully; the loop comes for free.

- **Faithful / general adapter** — The design goal: a reusable gateway provider
  with full `TextAdapter` parity, not an app-specific shim. Any gateway model
  (id passthrough), all tools (function _and_ provider-executed), and the full
  `chat()` option surface (system prompts, `modelOptions`/`providerOptions`,
  `toolChoice`, structured output, multimodal input, reasoning).

## Scope (current)

In: **text**, **image**, **video** adapters. **Summarize** is a near-free
add-on (wraps text). Out for now: **tts** and **transcription** — the pinned
`@ai-sdk/gateway@3.0.127` exposes no speech/transcription model
(`KNOWN_MODEL_TYPES = embedding, image, language, reranking, video`); they
require a gateway upgrade and a real caller before being built.

The **text** adapter targets complete `TextAdapter` parity (per the _faithful /
general adapter_ goal). The **image** and **video** adapters bridge
`ImageModelV3` / `Experimental_VideoModelV3` `doGenerate` to the TanStack
`generateImage` / `generateVideo` activities.
