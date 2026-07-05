import type {
	KbAttachment,
	McpScope,
	ModelRef,
	SystemToolsConfig,
	VadConfig,
	VersionConfig,
} from '@agent.io/domain/schemas'
import type { FunctionTool } from '@openai/agents-realtime'

export type ProviderId = 'openai' | 'xai'

export interface QuirkTable {
	webrtc: boolean
	semanticVad: boolean
	/** Event-name aliases that normalize to output_text deltas. */
	textDeltaAliases: string[]
	/** xAI rejects client secrets when attaching to a SIP call_id session. */
	secretValidForCallAttach: boolean
	/** OpenAI accepts pcm input at 24kHz only. */
	fixedInputRate?: number
}

export interface DialectEndpoint {
	id: ProviderId
	restBaseUrl: string
	wsUrl: string
	modelAllowlist: string[]
	quirks: QuirkTable
}

export interface ProviderCapabilities {
	webrtc: boolean
	semanticVad: boolean
	outboundTelephony: boolean
	inputSampleRates: number[]
	outputFormats: string[]
	maxClientSecretTtlSecs: number
}

export interface HostedMcpTool {
	type: 'mcp'
	server_label: string
	server_url: string
	headers?: Record<string, string>
	allowed_tools?: string[]
	require_approval?: 'never' | 'always'
}

/** Provider-agnostic session request (expanded from an Agent Version). */
export interface SessionConfig {
	agentRef?: { agentId: string; versionId: string }
	model: ModelRef
	instructions: string
	voice: string
	vad: VadConfig
	tools: FunctionTool[]
	mcpTools: HostedMcpTool[]
	audio: {
		input: {
			format: 'pcm16' | 'g711_ulaw' | 'g711_alaw'
			transcription: boolean
		}
		output: { format: 'pcm16' | 'g711_ulaw' | 'g711_alaw'; speed?: number }
	}
	dynamicVariables?: Record<string, string>
	/** Non-fatal degradations collected during expansion (Composio outage…). */
	warnings: string[]
}

export interface ClientSecret {
	value: string
	expiresAt: number
	connectHint: { transport: 'webrtc' | 'websocket'; url: string }
}

export type NormalizedEvent =
	| { type: 'session.ready' }
	| { type: 'user.speech_started' }
	| { type: 'user.speech_stopped' }
	| { type: 'user.transcript'; text: string; final: boolean }
	| { type: 'agent.audio'; chunkBase64: string; itemId: string }
	| { type: 'agent.transcript'; text: string; final: boolean; itemId: string }
	| { type: 'agent.response_started'; responseId: string }
	| {
			type: 'agent.response_done'
			responseId: string
			status: 'completed' | 'cancelled' | 'failed' | 'incomplete'
			usage?: { inputTokens: number; outputTokens: number }
	  }
	| { type: 'tool.call'; callId: string; name: string; argsJson: string }
	| { type: 'dtmf'; digits: string }
	| { type: 'idle_timeout' }
	| { type: 'error'; code: string; message: string; fatal: boolean }
	| { type: 'closed'; reason: string }

/**
 * Injected Convex ingest interface (plan Unit 11 dependency rule):
 * @agent.io/agent MUST NOT import @agent.io/convex — the apps (and the
 * contract suite) bind these to the real machine-path functions.
 */
export interface ConvexIngest {
	start(args: {
		ownerKind: 'phoneNumber' | 'agentVersion'
		ownerId: string
		agentVersionId?: string
		provider: ProviderId
		channel: 'voice_inbound' | 'voice_outbound' | 'whatsapp' | 'sms' | 'web'
		direction: 'inbound' | 'outbound'
		externalNumber?: string
	}): Promise<string>
	append(args: {
		conversationId: string
		role: 'user' | 'agent' | 'system'
		text?: string
		toolCalls?: { callId: string; name: string; argsJson: string }[]
		toolResults?: { callId: string; output: string; isError: boolean }[]
		interrupted: boolean
	}): Promise<{ sequence: number }>
	finish(args: {
		conversationId: string
		status: 'done' | 'failed'
		terminationReason?: string
		durationSecs?: number
	}): Promise<void>
	searchKnowledgeBase(args: {
		conversationId: string
		query: string
	}): Promise<{ text: string; score: number; documentId: string }[]>
}

/** Session-side control surface handed to system-tool executables. */
export interface CallControl {
	hangup(reason?: string): Promise<void>
	transfer(target: string): Promise<void>
	playDtmf(digits: string): Promise<void>
	markVoicemail(): Promise<void>
	skipTurn(): Promise<void>
	detectLanguage(language: string): Promise<void>
	transferToAgent(agentId: string): Promise<void>
}

/** Loaded Agent Version, as the resolver consumes it. */
export interface ResolvedAgentVersion {
	versionId: string
	agentId: string
	tenant: string
	config: VersionConfig
}

export type {
	KbAttachment,
	McpScope,
	SystemToolsConfig,
	VadConfig,
	VersionConfig,
}
