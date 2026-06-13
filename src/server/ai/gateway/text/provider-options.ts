/**
 * Per-call provider options for the gateway text adapter.
 *
 * Forwarded verbatim into the V3 request as `providerOptions` (the gateway
 * relays them to the upstream provider). Keyed by provider name, mirroring the
 * project's `PROVIDER_OPTIONS` constant — e.g.
 * `{ anthropic: { thinking: {...} }, openai: { reasoningEffort: 'low' } }`.
 *
 * @see https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/advanced
 */
export interface GatewayProviderOptions {
	[provider: string]: Record<string, unknown> | undefined
}
