import { tool } from '@openai/agents-realtime'
import { z } from 'zod'

import type { CallControl, SystemToolsConfig } from '../types'

/**
 * The seven platform built-ins as SDK tool() executables. Each receives the
 * transport-agnostic CallControl — unit-testable without a live session.
 */
export const buildSystemTools = (
	config: SystemToolsConfig,
	control: CallControl,
) => {
	const tools = []
	if (config.end_call?.enabled) {
		tools.push(
			tool({
				name: 'end_call',
				description:
					'End the call when the conversation has reached a natural conclusion or the caller asks to hang up.',
				parameters: z.object({ reason: z.string().nullable() }),
				execute: async ({ reason }) => {
					await control.hangup(reason ?? undefined)
					return 'call ended'
				},
			}),
		)
	}
	if (config.language_detection?.enabled) {
		tools.push(
			tool({
				name: 'language_detection',
				description:
					'Switch the conversation language when the caller speaks a different language.',
				parameters: z.object({ language: z.string() }),
				execute: async ({ language }) => {
					await control.detectLanguage(language)
					return `language set to ${language}`
				},
			}),
		)
	}
	if (config.transfer_to_agent?.enabled) {
		const transfers = config.transfer_to_agent.transfers
		tools.push(
			tool({
				name: 'transfer_to_agent',
				description: `Transfer to another agent when their condition applies: ${transfers
					.map((t) => `${t.agentId}: ${t.condition}`)
					.join('; ')}`,
				parameters: z.object({ agentId: z.string() }),
				execute: async ({ agentId }) => {
					if (!transfers.some((t) => t.agentId === agentId)) {
						return `error: ${agentId} is not a configured transfer target`
					}
					await control.transferToAgent(agentId)
					return `transferred to ${agentId}`
				},
			}),
		)
	}
	if (config.transfer_to_number?.enabled) {
		const transfers = config.transfer_to_number.transfers
		tools.push(
			tool({
				name: 'transfer_to_number',
				description: `Transfer the call to a human when a condition applies: ${transfers
					.map((t) => `${t.target}: ${t.condition}`)
					.join('; ')}`,
				parameters: z.object({ target: z.string() }),
				execute: async ({ target }) => {
					if (!transfers.some((t) => t.target === target)) {
						return `error: ${target} is not a configured transfer target`
					}
					await control.transfer(target)
					return `transferring to ${target}`
				},
			}),
		)
	}
	if (config.skip_turn?.enabled) {
		tools.push(
			tool({
				name: 'skip_turn',
				description:
					'Skip your turn when the caller is not done speaking or pauses briefly.',
				parameters: z.object({}),
				execute: async () => {
					await control.skipTurn()
					return 'turn skipped'
				},
			}),
		)
	}
	if (config.play_keypad_touch_tone?.enabled) {
		tools.push(
			tool({
				name: 'play_keypad_touch_tone',
				description:
					'Play DTMF keypad tones to navigate automated phone menus.',
				parameters: z.object({ digits: z.string() }),
				execute: async ({ digits }) => {
					await control.playDtmf(digits)
					return `played ${digits}`
				},
			}),
		)
	}
	if (config.voicemail_detection?.enabled) {
		const message = config.voicemail_detection.voicemailMessage
		tools.push(
			tool({
				name: 'voicemail_detection',
				description:
					'Call this when you detect the call reached a voicemail system rather than a person.',
				parameters: z.object({}),
				execute: async () => {
					await control.markVoicemail()
					return message
						? `voicemail detected — leave this message verbatim: ${message}`
						: 'voicemail detected — end the call'
				},
			}),
		)
	}
	return tools
}
