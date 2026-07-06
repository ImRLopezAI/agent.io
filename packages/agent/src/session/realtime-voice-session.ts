import type { RealtimeSession } from '@openai/agents-realtime'

import type { NormalizedEvent } from '../types'
import type { EventNormalizer } from './event-normalizer'

type Handler = (event: NormalizedEvent) => void

/**
 * Thin wrapper over the SDK session: normalizes wire events (quirk-aware),
 * exposes our command surface. No tool plumbing — SDK tool() executables run
 * inside RealtimeSession.
 */
export class RealtimeVoiceSession {
	private readonly handlers = new Map<NormalizedEvent['type'], Set<Handler>>()
	private readonly anyHandlers = new Set<Handler>()

	constructor(
		private readonly inner: RealtimeSession,
		private readonly normalizer: EventNormalizer,
		private readonly cleanup?: () => Promise<void>,
	) {
		const transport = inner.transport as unknown as {
			on: (event: string, cb: (raw: unknown) => void) => void
		}
		transport.on('*', (raw) => {
			const event = this.normalizer.toNormalized(
				raw as { type?: string; [k: string]: unknown },
			)
			if (event) this.emit(event)
		})
	}

	/** Test/bridge entry: feed a raw wire event through normalization. */
	ingestRaw(raw: { type?: string; [k: string]: unknown }) {
		const event = this.normalizer.toNormalized(raw)
		if (event) this.emit(event)
	}

	private emit(event: NormalizedEvent) {
		for (const handler of this.handlers.get(event.type) ?? []) handler(event)
		for (const handler of this.anyHandlers) handler(event)
	}

	on(type: NormalizedEvent['type'] | '*', handler: Handler) {
		if (type === '*') {
			this.anyHandlers.add(handler)
			return
		}
		const set = this.handlers.get(type) ?? new Set()
		set.add(handler)
		this.handlers.set(type, set)
	}

	sendAudio(chunk: Uint8Array) {
		this.inner.sendAudio(chunk.buffer as ArrayBuffer)
	}

	injectMessage(text: string) {
		this.inner.sendMessage(text)
	}

	cancelResponse() {
		this.inner.interrupt()
	}

	mute(muted: boolean) {
		this.inner.mute(muted)
	}

	close() {
		this.inner.close()
		void this.cleanup?.()
		this.emit({ type: 'closed', reason: 'local' })
	}
}
