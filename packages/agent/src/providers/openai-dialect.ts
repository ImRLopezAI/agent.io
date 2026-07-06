import {
	OpenAIRealtimeWebSocket,
	RealtimeSession,
	type RealtimeSessionConfig,
} from '@openai/agents-realtime'
import OpenAI from 'openai'

import { buildRealtimeAgent } from '../agents/resolver'
import { EventNormalizer } from '../session/event-normalizer'
import { RealtimeVoiceSession } from '../session/realtime-voice-session'
import type {
	ClientSecret,
	DialectEndpoint,
	ProviderCapabilities,
	SessionConfig,
} from '../types'
import { RealtimeTelephony } from './telephony'

const WIRE_FORMATS = {
	pcm16: { type: 'audio/pcm' as const, rate: 24000 as const },
	g711_ulaw: { type: 'audio/pcmu' as const },
	g711_alaw: { type: 'audio/pcma' as const },
}

/** One driver serves both endpoints (xAI is an OpenAI-Realtime dialect). */
export class OpenAIDialectProvider {
	/** Official `openai` SDK client — baseURL swap makes it serve xAI too. */
	readonly client: OpenAI
	/** SIP call control: accept / reject / refer / hangup. */
	readonly telephony: RealtimeTelephony

	constructor(
		readonly endpoint: DialectEndpoint,
		private readonly apiKey: string,
		client?: OpenAI,
	) {
		this.client =
			client ?? new OpenAI({ apiKey, baseURL: endpoint.restBaseUrl })
		this.telephony = new RealtimeTelephony(
			endpoint,
			this.client,
			(cfg, attach) => this.connect(cfg, attach),
			(cfg) => this.toWireSession(cfg),
		)
	}

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

	/**
	 * REST wire shape (snake_case) for client_secrets / calls.accept — distinct
	 * from the agents-SDK camelCase RealtimeSessionConfig used on the WS path.
	 */
	toWireSession(cfg: SessionConfig): Record<string, unknown> {
		const requested = cfg.vad
		const turnDetection =
			requested.mode === 'semantic_vad' && !this.endpoint.quirks.semanticVad
				? { type: 'server_vad' }
				: requested.mode === 'semantic_vad'
					? { type: 'semantic_vad', eagerness: requested.eagerness }
					: requested.mode === 'server_vad'
						? {
								type: 'server_vad',
								silence_duration_ms: requested.silenceMs,
								idle_timeout_ms: requested.idleTimeoutMs,
							}
						: null
		return {
			type: 'realtime',
			model: cfg.model.model,
			instructions: cfg.instructions,
			output_modalities: ['audio'],
			audio: {
				input: {
					format: WIRE_FORMATS[cfg.audio.input.format],
					transcription: cfg.audio.input.transcription
						? { model: 'whisper-1' }
						: undefined,
					turn_detection: turnDetection,
				},
				output: {
					format: WIRE_FORMATS[cfg.audio.output.format],
					voice: cfg.voice,
					speed: cfg.audio.output.speed,
				},
			},
			tools: cfg.mcpTools,
		}
	}

	/** Browser/widget path — official SDK, no hand-rolled fetch. */
	async mintClientSecret(
		cfg: SessionConfig,
		ttlSecs = 600,
	): Promise<ClientSecret> {
		const secret = await this.client.realtime.clientSecrets.create({
			expires_after: { anchor: 'created_at', seconds: ttlSecs },
			session: this.toWireSession(cfg) as never,
		})
		return {
			value: secret.value,
			expiresAt: secret.expires_at,
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
		const agent = buildRealtimeAgent({
			...cfg,
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
