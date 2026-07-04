import {
	readUIMessageStream,
	type ToolLoopAgent,
	type ToolSet,
	tool,
	toUIMessageStream,
	type UIMessage,
} from 'ai'
import { getUsage } from 'tokenlens'
import { z } from 'zod'

/**
 * Wrap a sub-agent `ToolLoopAgent` as a routing-tool on the orchestrator. The
 * tool's async-generator `execute` runs the sub-agent and yields its UIMessages
 * straight into the parent stream — `createAgentUIStreamResponse` merges them.
 * No manual writer / boundary / drain plumbing.
 *
 * Mirrors sunday's `apps/sunday/src/server/ai/agents/routing.ts` (adapted to AI
 * SDK v7-beta: the result's `.toUIMessageStream()` method was removed, so we use
 * the top-level `toUIMessageStream({ stream })`).
 */
export const routing = <TOOLS extends ToolSet>(opts: {
	description: string
	agent: ToolLoopAgent<never, TOOLS>
}) =>
	tool({
		description: `${opts.description}

Available tools: ${Object.keys(opts.agent.tools || {})
			.map(
				(t) =>
					`- ${t} (${opts.agent.tools[t]?.description || 'No description'})`,
			)
			.join('\n')}`,
		inputSchema: z.object({ prompt: z.string().min(1) }),
		execute: async function* ({ prompt }, { abortSignal }) {
			const result = await opts.agent.stream({ prompt, abortSignal })
			for await (const message of readUIMessageStream({
				stream: toUIMessageStream({ stream: result.stream }),
			})) {
				yield message
			}
		},
	})

/**
 * Like `routing`, but the caller supplies a custom `overrideTool` generator —
 * e.g. to pipe the sub-agent stream through `pipeJsonRender` for a UI renderer,
 * or to add caching. This is where special-case sub-agents (the equivalent of
 * ontology's JSON-render renderer / db-doctor) plug in without complicating the
 * default `routing` path.
 */
export const customRouting = <TOOLS extends ToolSet>(opts: {
	description: string
	agent: ToolLoopAgent<never, TOOLS>
	overrideTool: (opts: {
		prompt: string
		abortSignal: AbortSignal | undefined
		agent: ToolLoopAgent<never, TOOLS>
	}) => AsyncIterable<UIMessage>
}) =>
	tool({
		description: `${opts.description}

Available tools: ${Object.keys(opts.agent.tools || {}).join(', ')}`,
		inputSchema: z.object({ prompt: z.string().min(1) }),
		execute: async function* ({ prompt }, { abortSignal }) {
			yield* opts.overrideTool({ prompt, abortSignal, agent: opts.agent })
		},
	})
