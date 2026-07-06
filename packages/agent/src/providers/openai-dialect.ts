import {
	OpenAIRealtimeWebSocket,
	RealtimeSession,
	type RealtimeSessionConfig,
} from '@openai/agents-realtime'
import OpenAI from 'openai'
import type { RealtimeSessionCreateRequest } from 'openai/resources/realtime/realtime.mjs'

import {
	buildMcpServers,
	buildRealtimeAgent,
	connectMcpServers,
} from '../agents/resolver'
import { EventNormalizer } from '../session/event-normalizer'
import { RealtimeVoiceSession } from '../session/realtime-voice-session'
import type {
	ClientSecret,
	DialectEndpoint,
	ProviderCapabilities,
	SessionConfig,
	VoiceProvider,
	VoiceSession,
} from '../types'

const WIRE_FORMATS = {
	pcm16: { type: 'audio/pcm' as const, rate: 24000 as const },
	g711_ulaw: { type: 'audio/pcmu' as const },
	g711_alaw: { type: 'audio/pcma' as const },
}

/**
 * One driver serves both endpoints (xAI is an OpenAI-Realtime dialect).
 * Implements the full VoiceProvider contract — sessions, client secrets, AND
 * SIP telephony (accept/reject/refer/hangup via `client.realtime.calls`,
 * docs/.references/openai-realtime-ts-calls.md). The official `openai`
 * client serves xAI too via baseURL swap.
 */
export class OpenAIDialectProvider implements VoiceProvider {
	readonly client: OpenAI

	constructor(
		readonly endpoint: DialectEndpoint,
		private readonly apiKey: string,
		client?: OpenAI,
	) {
		this.client =
			client ?? new OpenAI({ apiKey, baseURL: endpoint.restBaseUrl })
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

	// -------------------------------------------------------------------
	// Config mapping — TWO dialects of the same session config:
	// toSessionConfig = agents-SDK camelCase (WS path)
	// toWireSession   = REST snake_case (client_secrets, calls.accept)
	// -------------------------------------------------------------------

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

	toWireSession(cfg: SessionConfig): RealtimeSessionCreateRequest {
		const requested = cfg.vad
		const turnDetection =
			requested.mode === 'semantic_vad' && !this.endpoint.quirks.semanticVad
				? { type: 'server_vad' as const }
				: requested.mode === 'semantic_vad'
					? { type: 'semantic_vad' as const, eagerness: requested.eagerness }
					: requested.mode === 'server_vad'
						? {
								type: 'server_vad' as const,
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
			// REST/browser path: hosted MCP is part of the session wire schema
			// (the API connects to the servers server-side — no local lifecycle)
			tools: cfg.mcpServers.map((ref) => ({
				type: 'mcp',
				server_label: ref.serverLabel,
				server_url: ref.serverUrl,
				headers: ref.headers,
				allowed_tools: ref.allowedTools,
				require_approval: ref.requireApproval,
			})),
		}
	}

	// -------------------------------------------------------------------
	// Sessions
	// -------------------------------------------------------------------

	/** Browser/widget path — official SDK, no hand-rolled fetch. */
	async mintClientSecret(
		cfg: SessionConfig,
		ttlSecs = 600,
	): Promise<ClientSecret> {
		const secret = await this.client.realtime.clientSecrets.create({
			expires_after: { anchor: 'created_at', seconds: ttlSecs },
			session: this.toWireSession(cfg),
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

	/**
	 * Server-side path (v-inbound / v-outbound own the socket). Function tools
	 * ride RealtimeAgent.tools; MCP servers are a SEPARATE channel —
	 * MCPServerStreamableHttp instances connected before the session and
	 * closed with it.
	 */
	async connect(
		cfg: SessionConfig,
		attach?: { callId?: string },
	): Promise<VoiceSession> {
		const url = attach?.callId
			? `${this.endpoint.wsUrl}?call_id=${attach.callId}`
			: this.endpoint.wsUrl
		const transport = new OpenAIRealtimeWebSocket({
			url,
			useInsecureApiKey: true, // raw API key, server-side only
		})

		const mcpServers = await connectMcpServers(
			buildMcpServers(cfg.mcpServers),
			cfg.warnings,
		)
		const inner = new RealtimeSession(buildRealtimeAgent(cfg, mcpServers), {
			transport,
			model: cfg.model.model,
			config: this.toSessionConfig(cfg),
		})
		await inner.connect({ apiKey: this.apiKey })
		return new RealtimeVoiceSession(
			inner,
			new EventNormalizer(this.endpoint.quirks),
			async () => {
				await Promise.allSettled(mcpServers.map((server) => server.close()))
			},
		)
	}

	// -------------------------------------------------------------------
	// SIP telephony (part of the contract, not a side object)
	// -------------------------------------------------------------------

	/** Answer an incoming call and attach the realtime session to it. */
	async acceptCall(callId: string, cfg: SessionConfig): Promise<VoiceSession> {
		if (this.endpoint.id === 'openai') {
			// OpenAI: REST accept with the wire session, then attach the WS
			await this.client.realtime.calls.accept(callId, this.toWireSession(cfg))
		}
		// xAI: connecting the WS with ?call_id IS the accept (no REST endpoint)
		return this.connect(cfg, { callId })
	}

	/** Decline an incoming call (SIP status code, default 603 Decline). */
	async rejectCall(callId: string, sipCode?: number): Promise<void> {
		if (this.endpoint.id !== 'openai') {
			throw new Error(
				`${this.endpoint.id} does not support rejecting calls — let it ring out or accept+hangup`,
			)
		}
		await this.client.realtime.calls.reject(
			callId,
			sipCode ? { status_code: sipCode } : undefined,
		)
	}

	/** Transfer the active call (SIP REFER) to tel:+E.164 or sip:uri. */
	async transferCall(callId: string, target: string): Promise<void> {
		await this.client.realtime.calls.refer(callId, { target_uri: target })
	}

	/** End the active call. */
	async hangupCall(callId: string): Promise<void> {
		await this.client.realtime.calls.hangup(callId)
	}
}
