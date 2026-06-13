/**
 * Shared Vercel AI Gateway provider construction for the TanStack AI adapters.
 *
 * Env-first auth, identical to the AI SDK: with no config we return the default
 * `gateway` singleton (reads `AI_GATEWAY_API_KEY` from the environment, falling
 * back to the Vercel OIDC token); with config we hand it to `createGateway`,
 * which lets callers override the key, base URL, headers, or fetch. All three
 * gateway adapters (text/image/video) obtain their provider here so auth and
 * routing behave identically across modalities.
 */
import {
	createGateway,
	type GatewayProvider,
	type GatewayProviderSettings,
	gateway,
} from '@ai-sdk/gateway'

/** Config surface for the gateway adapters — a subset of the AI SDK's settings. */
export type GatewayProviderConfig = GatewayProviderSettings

/**
 * Resolve a configured {@link GatewayProvider}. Returns the env-authed `gateway`
 * singleton when no meaningful config is supplied, otherwise builds a provider
 * via `createGateway`.
 */
export function createGatewayProvider(
	config?: GatewayProviderConfig,
): GatewayProvider {
	if (!config || Object.keys(config).length === 0) {
		return gateway
	}
	return createGateway(config)
}
