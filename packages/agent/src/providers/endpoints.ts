import type { DialectEndpoint } from '../types'

/** Verified against docs/.references/openai-realtime.md (2026-07 snapshot). */
export const OPENAI: DialectEndpoint = {
	id: 'openai',
	restBaseUrl: 'https://api.openai.com/v1',
	wsUrl: 'wss://api.openai.com/v1/realtime',
	modelAllowlist: ['gpt-realtime', 'gpt-realtime-1.5', 'gpt-realtime-2'],
	quirks: {
		webrtc: true,
		semanticVad: true,
		textDeltaAliases: ['response.output_text.delta'],
		secretValidForCallAttach: true,
		fixedInputRate: 24_000,
	},
}

/**
 * xAI Grok Voice is an OpenAI-Realtime dialect (docs/.references/xai-voice.md):
 * base-URL swap + quirk table, same driver.
 */
export const XAI: DialectEndpoint = {
	id: 'xai',
	restBaseUrl: 'https://api.x.ai/v1',
	wsUrl: 'wss://api.x.ai/v1/realtime',
	modelAllowlist: [
		'grok-voice-latest',
		'grok-voice-think-fast-1.0',
		'grok-voice-fast-1.0',
	],
	quirks: {
		webrtc: false,
		semanticVad: false,
		textDeltaAliases: ['response.text.delta', 'response.output_text.delta'],
		secretValidForCallAttach: false,
	},
}

export const ENDPOINTS: Record<'openai' | 'xai', DialectEndpoint> = {
	openai: OPENAI,
	xai: XAI,
}
