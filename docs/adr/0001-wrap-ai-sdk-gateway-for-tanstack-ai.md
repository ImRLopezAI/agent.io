# 1. Wrap `@ai-sdk/gateway` and bridge `LanguageModelV3` to TanStack AI

- Status: Accepted
- Date: 2026-06-13
- Area: `src/server/ai/gateway/`

## Context

We are migrating off the Vercel AI SDK (`ai`, `@ai-sdk/react`) to
`@tanstack/ai`, but we want to keep using the **Vercel AI Gateway** as the
model connector — same API keys, OIDC auth, provider routing, observability,
and 100+ models.

`@tanstack/ai`'s `chat()` requires a `TextAdapter` that yields **AG-UI**
`StreamChunk` events (`@ag-ui/core`). The gateway is reachable two ways:

1. Its **proprietary** `/v4/ai` endpoint, spoken by `@ai-sdk/gateway`, whose
   `gateway(modelId)` returns an AI SDK **`LanguageModelV3`**.
2. Its **OpenAI-compatible** `/v1` endpoint, which `@tanstack/openai-base` can
   drive directly.

Key facts established during design:

- `@ai-sdk/gateway@3.0.127` is a **lean** dependency: it pulls in only
  `@ai-sdk/provider`, `@ai-sdk/provider-utils`, and `@vercel/oidc` — **not** the
  large `ai` package. Wrapping it does not block removing `ai`/`@ai-sdk/react`.
- `LanguageModelV3` is **stateless and single-turn**. The agentic tool loop,
  middleware, MCP, and tool execution belong to `chat()`, not to the gateway or
  the adapter.
- TanStack's `AIAdapter` is a union over **activities** (text | image | audio |
  video | tts | transcription | summarize), not over models. `chat()` needs the
  narrower `AnyTextAdapter`. Model coverage comes from passing the
  `provider/model` id through to `gateway(modelId)`, not from any type.
- The installed gateway exposes `KNOWN_MODEL_TYPES = embedding, image,
language, reranking, video`. It has **no** speech/transcription model, so TTS
  and transcription adapters are not buildable without upgrading the gateway.

## Decision

Build a **faithful, general gateway provider** for TanStack AI by wrapping
`@ai-sdk/gateway` and writing a **bidirectional bridge** between TanStack's
AG-UI events and the AI SDK `LanguageModelV3` spec.

- **Substrate:** `gateway(modelId).doStream()` / `.doGenerate()`; convert
  options in and stream-parts out. No reimplementation of transport/auth.
- **Auth:** env-first (`AI_GATEWAY_API_KEY` → Vercel OIDC), overridable via
  config; default to the `gateway` singleton through a shared
  `createGatewayProvider(config?)`.
- **Scope now:** `GatewayTextAdapter` (full `TextAdapter` parity — any model,
  function **and** provider-executed tools, full `chat()` option surface,
  multimodal input, reasoning, structured output), plus `GatewayImageAdapter`
  and `GatewayVideoAdapter`. Summarize is a near-free wrapper over text.
- **Deferred:** TTS and transcription (need a gateway upgrade + a real caller).
- **Boundary:** the adapter is a single-turn translator; it never runs the
  tool loop / middleware / MCP.

## Consequences

**Positive**

- Reuses Vercel's exact connector (auth, OIDC, routing, o11y, model catalog).
- Keeps `@ai-sdk/gateway` as a lean dep while `ai` + `@ai-sdk/react` are removed.
- One text adapter reaches every gateway chat model.

**Negative**

- We commit non-trivial bridge code coupled to the `@ai-sdk/provider`
  `LanguageModelV3` spec; a future major spec bump (V4) is a maintenance event.
- Provider-executed tool mapping and the V3→AG-UI tool-streaming
  correspondence are the highest-risk surfaces for bugs.
- We still depend on an AI SDK package after the migration — surprising on its
  face, justified by the connector value above.

**Neutral**

- Video uses the **experimental** `Experimental_VideoModelV3` (job-poll shape);
  its API may change.

## Alternatives considered

1. **Subclass `@tanstack/openai-base` on the gateway `/v1` OpenAI-compatible
   endpoint.** Near-zero conversion code (openai-base does it). Rejected as the
   primary approach because it does not reuse `@ai-sdk/gateway` and speaks the
   compat surface rather than native `/v4/ai`; kept on record as the cheaper
   fallback if the V3 bridge proves too costly.
2. **Hand-roll a raw adapter hitting the gateway HTTP API directly.** Maximum
   control, maximum surface to own (auth, OIDC, routing, SSE parsing).
   Rejected — it reimplements exactly what `@ai-sdk/gateway` already provides.
3. **Type the adapter as `AIAdapter`.** Rejected: `AIAdapter` is wider than
   `AnyTextAdapter` and will not satisfy `chat()`; it also does not confer model
   coverage. Each concrete adapter implements its specific activity interface.
4. **Build the full six-modality suite now.** Rejected: TTS/transcription have
   no gateway model in the pinned version, and no caller exists for the
   non-text modalities yet. Scoped to text + image + video.
