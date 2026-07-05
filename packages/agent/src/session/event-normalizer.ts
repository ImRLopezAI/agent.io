import type { NormalizedEvent, QuirkTable } from '../types'

interface WireEvent {
	type?: string
	[key: string]: unknown
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * Wire → NormalizedEvent, quirk-aware (handles xAI aliases). Unknown events
 * return null and are dropped, never thrown.
 */
export class EventNormalizer {
	constructor(private readonly quirks: QuirkTable) {}

	toNormalized(raw: WireEvent): NormalizedEvent | null {
		const type = raw.type ?? ''
		if (this.quirks.textDeltaAliases.includes(type)) {
			return {
				type: 'agent.transcript',
				text: str(raw.delta),
				final: false,
				itemId: str(raw.item_id),
			}
		}
		switch (type) {
			case 'session.created':
				return { type: 'session.ready' }
			case 'input_audio_buffer.speech_started':
				return { type: 'user.speech_started' }
			case 'input_audio_buffer.speech_stopped':
				return { type: 'user.speech_stopped' }
			case 'conversation.item.input_audio_transcription.delta':
				return { type: 'user.transcript', text: str(raw.delta), final: false }
			case 'conversation.item.input_audio_transcription.completed':
				return {
					type: 'user.transcript',
					text: str(raw.transcript),
					final: true,
				}
			case 'response.output_audio.delta':
			case 'response.audio.delta':
				return {
					type: 'agent.audio',
					chunkBase64: str(raw.delta),
					itemId: str(raw.item_id),
				}
			case 'response.output_audio_transcript.delta':
			case 'response.audio_transcript.delta':
				return {
					type: 'agent.transcript',
					text: str(raw.delta),
					final: false,
					itemId: str(raw.item_id),
				}
			case 'response.output_audio_transcript.done':
			case 'response.audio_transcript.done':
				return {
					type: 'agent.transcript',
					text: str(raw.transcript),
					final: true,
					itemId: str(raw.item_id),
				}
			case 'response.created': {
				const response = raw.response as { id?: string } | undefined
				return {
					type: 'agent.response_started',
					responseId: response?.id ?? '',
				}
			}
			case 'response.done': {
				const response = raw.response as
					| {
							id?: string
							status?: string
							usage?: { input_tokens?: number; output_tokens?: number }
					  }
					| undefined
				return {
					type: 'agent.response_done',
					responseId: response?.id ?? '',
					status:
						(response?.status as 'completed' | 'cancelled' | 'failed') ??
						'completed',
					usage: response?.usage
						? {
								inputTokens: response.usage.input_tokens ?? 0,
								outputTokens: response.usage.output_tokens ?? 0,
							}
						: undefined,
				}
			}
			case 'response.function_call_arguments.done':
				return {
					type: 'tool.call',
					callId: str(raw.call_id),
					name: str(raw.name),
					argsJson: str(raw.arguments),
				}
			case 'input_audio_buffer.dtmf_event_received':
				return { type: 'dtmf', digits: str(raw.digits ?? raw.digit) }
			case 'input_audio_buffer.timeout_triggered':
				return { type: 'idle_timeout' }
			case 'error': {
				const error = raw.error as
					| { code?: string; message?: string }
					| undefined
				return {
					type: 'error',
					code: error?.code ?? 'unknown',
					message: error?.message ?? '',
					fatal: false,
				}
			}
			default:
				return null
		}
	}
}
