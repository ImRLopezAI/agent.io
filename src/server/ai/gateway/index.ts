/**
 * Vercel AI Gateway adapters for `@tanstack/ai`.
 *
 * Wraps `@ai-sdk/gateway` (`LanguageModelV3` / `ImageModelV3` /
 * `Experimental_VideoModelV3`) and bridges it to TanStack AI's activity
 * adapters, keeping Vercel's auth, OIDC, routing, and observability while the
 * app migrates off the Vercel AI SDK. See `CONTEXT.md` and
 * `docs/adr/0001-wrap-ai-sdk-gateway-for-tanstack-ai.md`.
 */

export { GatewayImageAdapter, gatewayImage } from './image/adapter'
export { createGatewayProvider, type GatewayProviderConfig } from './provider'
export {
	type GatewayModelId,
	type GatewayProviderOptions,
	GatewayTextAdapter,
	gatewayText,
} from './text/adapter'
export { GatewayVideoAdapter, gatewayVideo } from './video/adapter'
