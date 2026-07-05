import type { ConvexIngest, NormalizedEvent } from '../types'

interface PendingTurn {
	role: 'user' | 'agent'
	text: string
	interrupted: boolean
	toolCalls: { callId: string; name: string; argsJson: string }[]
}

/**
 * TranscriptRecorder (plan Unit 13): NormalizedEvent stream → conversation
 * substrate via the injected ConvexIngest. Buffers per-turn state, appends on
 * final transcripts, finishes on close. Appends are queued serially and
 * retried once — a transient failure never breaks sequence ordering.
 */
export class TranscriptRecorder {
	private conversationId: string | null = null
	private queue: Promise<void> = Promise.resolve()
	private currentAgentTurn: PendingTurn | null = null
	private startedAt = Date.now()
	private failedStatus: string | null = null

	constructor(private readonly ingest: ConvexIngest) {}

	bind(conversationId: string) {
		this.conversationId = conversationId
		this.startedAt = Date.now()
	}

	/** Serialized, once-retried append — preserves ordering under failures. */
	private enqueue(work: () => Promise<unknown>) {
		this.queue = this.queue.then(async () => {
			try {
				await work()
			} catch {
				await work().catch(() => {
					this.failedStatus = 'append failed after retry'
				})
			}
		})
		return this.queue
	}

	onEvent(event: NormalizedEvent) {
		const conversationId = this.conversationId
		if (!conversationId) return
		switch (event.type) {
			case 'user.transcript':
				if (event.final && event.text) {
					this.enqueue(() =>
						this.ingest.append({
							conversationId,
							role: 'user',
							text: event.text,
							interrupted: false,
						}),
					)
				}
				break
			case 'user.speech_started':
				if (this.currentAgentTurn) this.currentAgentTurn.interrupted = true
				break
			case 'agent.transcript':
				if (!this.currentAgentTurn) {
					this.currentAgentTurn = {
						role: 'agent',
						text: '',
						interrupted: false,
						toolCalls: [],
					}
				}
				if (event.final) this.currentAgentTurn.text = event.text
				break
			case 'tool.call':
				if (!this.currentAgentTurn) {
					this.currentAgentTurn = {
						role: 'agent',
						text: '',
						interrupted: false,
						toolCalls: [],
					}
				}
				this.currentAgentTurn.toolCalls.push({
					callId: event.callId,
					name: event.name,
					argsJson: event.argsJson,
				})
				break
			case 'agent.response_done': {
				const turn = this.currentAgentTurn
				this.currentAgentTurn = null
				if (turn && (turn.text || turn.toolCalls.length > 0)) {
					this.enqueue(() =>
						this.ingest.append({
							conversationId,
							role: 'agent',
							text: turn.text || undefined,
							toolCalls: turn.toolCalls.length ? turn.toolCalls : undefined,
							interrupted: turn.interrupted,
						}),
					)
				}
				break
			}
			case 'closed':
				this.enqueue(() =>
					this.ingest.finish({
						conversationId,
						status: this.failedStatus ? 'failed' : 'done',
						terminationReason: this.failedStatus ?? event.reason,
						durationSecs: Math.round((Date.now() - this.startedAt) / 1000),
					}),
				)
				break
			default:
				break
		}
	}

	/** Await all pending writes (tests + graceful shutdown). */
	flush() {
		return this.queue
	}
}
