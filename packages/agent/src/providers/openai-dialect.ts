import {
	OpenAIRealtimeWebSocket,
	RealtimeAgent,
	RealtimeSession,
	type RealtimeSessionConfig,
} from '@openai/agents-realtime'

import { EventNormalizer } from '../session/event-normalizer'
import { RealtimeVoiceSession } from '../session/realtime-voice-session'
import type {
	ClientSecret,
	DialectEndpoint,
	ProviderCapabilities,
	SessionConfig,
} from '../types'

const WIRE_FORMATS = {
	pcm16: { type: 'audio/pcm' as const, rate: 24000 as const },
	g711_ulaw: { type: 'audio/pcmu' as const },
	g711_alaw: { type: 'audio/pcma' as const },
}

/** One driver serves both endpoints (xAI is an OpenAI-Realtime dialect). */
export class OpenAIDialectProvider {
	constructor(
		readonly endpoint: DialectEndpoint,
		private readonly apiKey: string,
	) {}

	get id() {
		return this.endpoint.id
	}

	get capabilities(): ProviderCapabilities {
		const quirks = this.endpoint.quirks
		return {
			webrtc: quirks.webrtc,
			semanticVad: quirks.semanticVad,
			outboundTelephony: false,
			inputSampleRates: quirks.fixedInputRate
				? [quirks.fixedInputRate]
				: [8000, 16000, 24000, 44100, 48000],
			outputFormats: ['pcm16', 'g711_ulaw', 'g711_alaw'],
			maxClientSecretTtlSecs: this.endpoint.id === 'openai' ? 7200 : 3600,
		}
	}

	/** Map our SessionConfig → SDK GA config shape; downgrade, don't fail. */
	toSessionConfig(cfg: SessionConfig): Partial<RealtimeSessionConfig> {
		const requested = cfg.vad
		const turnDetection =
			requested.mode === 'semantic_vad' && !this.endpoint.quirks.semanticVad
				? ({ type: 'server_vad' } as const) // quirk downgrade (logged upstream)
				: requested.mode === 'semantic_vad'
					? ({ type: 'semantic_vad', eagerness: requested.eagerness } as const)
					: requested.mode === 'server_vad'
						? ({
								type: 'server_vad',
								silence_duration_ms: requested.silenceMs,
								idle_timeout_ms: requested.idleTimeoutMs,
							} as const)
						: null
		return {
			outputModalities: ['audio'],
			voice: cfg.voice,
			audio: {
				input: {
					format: WIRE_FORMATS[cfg.audio.input.format],
					transcription: cfg.audio.input.transcription
						? { model: 'whisper-1' }
						: undefined,
					turnDetection,
				},
				output: {
					format: WIRE_FORMATS[cfg.audio.output.format],
					speed: cfg.audio.output.speed,
				},
			},
		} as Partial<RealtimeSessionConfig>
	}

	/** Browser/widget path — plain REST, no SDK server-side. */
	async mintClientSecret(
		cfg: SessionConfig,
		ttlSecs = 600,
	): Promise<ClientSecret> {
		const res = await fetch(
			`${this.endpoint.restBaseUrl}/realtime/client_secrets`,
			{
				method: 'POST',
				headers: {
					authorization: `Bearer ${this.apiKey}`,
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					expires_after: { anchor: 'created_at', seconds: ttlSecs },
					session: {
						type: 'realtime',
						model: cfg.model.model,
						instructions: cfg.instructions,
						...this.toSessionConfig(cfg),
					},
				}),
			},
		)
		if (!res.ok) {
			throw new Error(
				`client_secrets failed: ${res.status} ${await res.text()}`,
			)
		}
		const body = (await res.json()) as { value: string; expires_at: number }
		return {
			value: body.value,
			expiresAt: body.expires_at,
			connectHint: {
				transport: this.endpoint.quirks.webrtc ? 'webrtc' : 'websocket',
				url: this.endpoint.wsUrl,
			},
		}
	}

	/** Server-side path (v-inbound / v-outbound own the socket). */
	async connect(
		cfg: SessionConfig,
		attach?: { callId?: string },
	): Promise<RealtimeVoiceSession> {
		const url = attach?.callId
			? `${this.endpoint.wsUrl}?call_id=${attach.callId}`
			: this.endpoint.wsUrl
		const transport = new OpenAIRealtimeWebSocket({
			url,
			useInsecureApiKey: true, // raw API key, server-side only
		})
		const agent = new RealtimeAgent({
			name: cfg.agentRef?.agentId ?? 'agent',
			instructions: cfg.instructions,
			voice: cfg.voice,
			tools: [...cfg.tools, ...(cfg.mcpTools as never[])],
		})
		const inner = new RealtimeSession(agent, {
			transport,
			model: cfg.model.model,
			config: this.toSessionConfig(cfg),
		})
		await inner.connect({ apiKey: this.apiKey })
		return new RealtimeVoiceSession(
			inner,
			new EventNormalizer(this.endpoint.quirks),
		)
	}
}
