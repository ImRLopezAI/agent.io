import type { ReactNode } from 'react'

export type ToolSet = Record<string, unknown>

export type TextStreamPart<_TOOLS extends ToolSet = ToolSet> =
	| {
			type: 'text-delta'
			id: string
			text: string
	  }
	| {
			type: 'text-end'
			id?: string
	  }
	| {
			type:
				| 'error'
				| 'finish'
				| 'reasoning-delta'
				| 'start'
				| 'tool-call'
				| 'tool-result'
			[key: string]: unknown
	  }

export type FileUIPart = {
	type: 'file'
	url?: string
	mediaType?: string
	filename?: string
	[key: string]: unknown
}

export type SourceDocumentUIPart = {
	type: 'source-document'
	title?: string
	filename?: string
	mediaType?: string
	[key: string]: unknown
}

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error' | 'idle'

export type LanguageModelUsage = {
	inputTokens?: number
	outputTokens?: number
	totalTokens?: number
	reasoningTokens?: number
	cachedInputTokens?: number
	[key: string]: unknown
}

export type Tool = {
	description?: string
	inputSchema?: unknown
	jsonSchema?: unknown
	[key: string]: unknown
}

export type ToolUIPartState =
	| 'input-streaming'
	| 'input-available'
	| 'approval-requested'
	| 'approval-responded'
	| 'output-available'
	| 'output-denied'
	| 'output-error'

export type ToolUIPart = {
	type: `tool-${string}`
	state: ToolUIPartState
	input?: unknown
	output?: ReactNode
	errorText?: string
	[key: string]: unknown
}

export type DynamicToolUIPart = {
	type: 'dynamic-tool'
	state: ToolUIPartState
	toolName: string
	input?: unknown
	output?: ReactNode
	errorText?: string
	[key: string]: unknown
}

export type Experimental_GeneratedImage = {
	base64: string
	uint8Array?: Uint8Array
	mediaType: string
	[key: string]: unknown
}

export type Experimental_SpeechResult = {
	audio: {
		base64: string
		mediaType: string
		[key: string]: unknown
	}
	[key: string]: unknown
}

export type Experimental_TranscriptionResult = {
	segments: Array<{
		text: string
		startSecond: number
		endSecond: number
		[key: string]: unknown
	}>
	[key: string]: unknown
}
