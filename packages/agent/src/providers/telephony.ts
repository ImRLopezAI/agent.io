import type OpenAI from 'openai'

import type { RealtimeVoiceSession } from '../session/realtime-voice-session'
import type { DialectEndpoint, SessionConfig } from '../types'

/**
 * SIP telephony control via the official `openai` SDK
 * (`client.realtime.calls.*` — docs/.references/openai-realtime-ts-calls.md).
 * The same client serves xAI (baseURL swap): refer/hangup share paths; accept
 * differs by dialect — OpenAI accepts via REST then attaches, xAI accepts by
 * connecting the WS with ?call_id.
 */
export class RealtimeTelephony {
	constructor(
		private readonly endpoint: DialectEndpoint,
		private readonly client: OpenAI,
		private readonly connect: (
			cfg: SessionConfig,
			attach: { callId: string },
		) => Promise<RealtimeVoiceSession>,
		private readonly toWireSession: (
			cfg: SessionConfig,
		) => Record<string, unknown>,
	) {}

	/** Answer an incoming SIP call and attach the realtime session to it. */
	async acceptCall(
		callId: string,
		cfg: SessionConfig,
	): Promise<RealtimeVoiceSession> {
		if (this.endpoint.id === 'openai') {
			await this.client.realtime.calls.accept(
				callId,
				this.toWireSession(cfg) as never,
			)
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
	async transfer(callId: string, target: string): Promise<void> {
		await this.client.realtime.calls.refer(callId, { target_uri: target })
	}

	/** End the active call. */
	async hangup(callId: string): Promise<void> {
		await this.client.realtime.calls.hangup(callId)
	}
}
