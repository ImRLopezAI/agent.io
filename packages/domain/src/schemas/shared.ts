import { z } from 'zod'

/** Normalized audio formats across providers (see docs/voice-provider-adapter.md). */
export const audioFormat = z.enum(['pcm16', 'g711_ulaw', 'g711_alaw'])
export type AudioFormat = z.infer<typeof audioFormat>

export const audioConfig = z.object({
	input: z.object({
		format: audioFormat,
		transcription: z.boolean().default(true),
	}),
	output: z.object({
		format: audioFormat,
		speed: z.number().min(0.25).max(1.5).optional(),
	}),
})
export type AudioConfig = z.infer<typeof audioConfig>

/** Turn detection. semantic_vad downgrades to server_vad on providers without it. */
export const vadConfig = z.discriminatedUnion('mode', [
	z.strictObject({
		mode: z.literal('server_vad'),
		silenceMs: z.number().int().positive().optional(),
		idleTimeoutMs: z.number().int().positive().optional(),
	}),
	z.strictObject({
		mode: z.literal('semantic_vad'),
		eagerness: z.enum(['low', 'medium', 'high']).optional(),
	}),
	z.strictObject({ mode: z.literal('manual') }),
])
export type VadConfig = z.infer<typeof vadConfig>

export const modelRef = z.object({
	provider: z.enum(['openai', 'xai']),
	model: z.string(),
})
export type ModelRef = z.infer<typeof modelRef>

export const dynamicVariables = z.record(z.string(), z.string())

/** The seven platform built-ins (CONTEXT.md: System Tool). */
export const systemToolSlug = z.enum([
	'end_call',
	'language_detection',
	'transfer_to_agent',
	'transfer_to_number',
	'skip_turn',
	'play_keypad_touch_tone',
	'voicemail_detection',
])
export type SystemToolSlug = z.infer<typeof systemToolSlug>

export const systemToolsConfig = z.strictObject({
	end_call: z.object({ enabled: z.boolean() }).optional(),
	language_detection: z.object({ enabled: z.boolean() }).optional(),
	transfer_to_agent: z
		.object({
			enabled: z.boolean(),
			transfers: z.array(
				z.object({ agentId: z.string(), condition: z.string() }),
			),
		})
		.optional(),
	transfer_to_number: z
		.object({
			enabled: z.boolean(),
			transfers: z.array(
				z.object({ target: z.string(), condition: z.string() }),
			),
		})
		.optional(),
	skip_turn: z.object({ enabled: z.boolean() }).optional(),
	play_keypad_touch_tone: z.object({ enabled: z.boolean() }).optional(),
	voicemail_detection: z
		.object({
			enabled: z.boolean(),
			voicemailMessage: z.string().optional(),
		})
		.optional(),
})
export type SystemToolsConfig = z.infer<typeof systemToolsConfig>

/** Composio-style subset filter: enable XOR disable. */
export const enableDisable = z.union([
	z.strictObject({ enable: z.array(z.string()) }),
	z.strictObject({ disable: z.array(z.string()) }),
])
export type EnableDisable = z.infer<typeof enableDisable>

/** Per-agent scoping of an MCP connection (the R6 conditional-tools subset). */
export const mcpScope = z.object({
	connectionId: z.string(),
	toolkits: enableDisable.optional(),
	tools: z.record(z.string(), enableDisable).optional(),
	requireApproval: z.enum(['never', 'always']).optional(),
})
export type McpScope = z.infer<typeof mcpScope>

export const kbAttachment = z.object({
	documentId: z.string(),
	usageMode: z.enum(['auto', 'prompt']),
})
export type KbAttachment = z.infer<typeof kbAttachment>
