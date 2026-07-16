import type { EntryId } from '@convex-dev/rag'
import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction, internalQuery } from '../_generated/server'
import { rag } from '../rag'

const MAX_PROMPT_DOCUMENT_CHUNKS = 512

export const scopeForConversation = internalQuery({
	args: { conversationId: v.id('conversations') },
	handler: async (ctx, { conversationId }) => {
		const conversation = await ctx.db.get(conversationId)
		if (!conversation) throw new Error('conversation not found')
		const version = await ctx.db.get(conversation.agentVersionId)
		if (!version || version.tenant !== conversation.tenant) {
			throw new Error('agent version not found')
		}

		const documentIds = []
		for (const attachment of version.config.knowledgeBase) {
			if (attachment.usageMode !== 'auto') continue
			const documentId = ctx.db.normalizeId(
				'kbDocuments',
				attachment.documentId,
			)
			if (!documentId) continue
			const document = await ctx.db.get(documentId)
			if (
				document?.tenant === conversation.tenant &&
				document.activeEntryId &&
				!document.archivedAt
			) {
				documentIds.push(documentId)
			}
		}
		return { tenant: conversation.tenant, documentIds }
	},
})

export const promptScopeForConversation = internalQuery({
	args: { conversationId: v.id('conversations') },
	handler: async (ctx, { conversationId }) => {
		const conversation = await ctx.db.get(conversationId)
		if (!conversation) throw new Error('conversation not found')
		const version = await ctx.db.get(conversation.agentVersionId)
		if (!version || version.tenant !== conversation.tenant) {
			throw new Error('agent version not found')
		}

		const documents: {
			documentId: string
			entryId: string | null
		}[] = []
		for (const attachment of version.config.knowledgeBase) {
			if (attachment.usageMode !== 'prompt') continue
			const documentId = ctx.db.normalizeId(
				'kbDocuments',
				attachment.documentId,
			)
			if (!documentId) {
				documents.push({ documentId: attachment.documentId, entryId: null })
				continue
			}
			const document = await ctx.db.get(documentId)
			documents.push({
				documentId,
				entryId:
					document?.tenant === conversation.tenant &&
					document.activeEntryId &&
					!document.archivedAt
						? document.activeEntryId
						: null,
			})
		}
		return { documents }
	},
})

export const loadPromptKnowledge = internalAction({
	args: { conversationId: v.id('conversations') },
	handler: async (ctx, { conversationId }) => {
		const scope: {
			documents: { documentId: string; entryId: string | null }[]
		} = await ctx.runQuery(internal.api.kbSearch.promptScopeForConversation, {
			conversationId,
		})
		const documents: {
			documentId: string
			name: string
			content: string
		}[] = []
		const warnings: string[] = []

		for (const scopedDocument of scope.documents) {
			if (!scopedDocument.entryId) {
				warnings.push(
					`knowledge document ${scopedDocument.documentId} is unavailable - skipped`,
				)
				continue
			}
			const entryId = scopedDocument.entryId as EntryId
			const entry = await rag.getEntry(ctx, { entryId })
			if (!entry || entry.status !== 'ready') {
				warnings.push(
					`knowledge document ${scopedDocument.documentId} is unavailable - skipped`,
				)
				continue
			}

			const chunks: string[] = []
			let cursor: string | null = null
			let complete = false
			while (chunks.length < MAX_PROMPT_DOCUMENT_CHUNKS) {
				const result = await rag.listChunks(ctx, {
					entryId,
					paginationOpts: {
						cursor,
						numItems: Math.min(64, MAX_PROMPT_DOCUMENT_CHUNKS - chunks.length),
					},
				})
				chunks.push(...result.page.map((chunk) => chunk.text))
				if (result.isDone) {
					complete = true
					break
				}
				cursor = result.continueCursor
			}
			if (!complete) {
				warnings.push(
					`knowledge document ${scopedDocument.documentId} exceeds the prompt chunk limit - skipped`,
				)
				continue
			}

			documents.push({
				documentId: scopedDocument.documentId,
				name: entry.metadata?.title ?? entry.title ?? scopedDocument.documentId,
				content: chunks.join('\n\n'),
			})
		}

		return { documents, warnings }
	},
})

export const searchKnowledge = internalAction({
	args: {
		conversationId: v.id('conversations'),
		query: v.string(),
		limit: v.optional(v.number()),
		vectorScoreThreshold: v.optional(v.number()),
		chunkContext: v.optional(
			v.object({ before: v.number(), after: v.number() }),
		),
		callId: v.optional(v.string()),
	},
	handler: async (
		ctx,
		{
			conversationId,
			query,
			limit = 8,
			vectorScoreThreshold = 0.5,
			chunkContext = { before: 1, after: 1 },
			callId,
		},
	) => {
		if (limit < 1 || limit > 20)
			throw new Error('limit must be between 1 and 20')
		if (vectorScoreThreshold < 0 || vectorScoreThreshold > 1) {
			throw new Error('vectorScoreThreshold must be between 0 and 1')
		}
		if (
			chunkContext.before < 0 ||
			chunkContext.before > 3 ||
			chunkContext.after < 0 ||
			chunkContext.after > 3
		) {
			throw new Error('chunkContext values must be between 0 and 3')
		}

		const scope = await ctx.runQuery(
			internal.api.kbSearch.scopeForConversation,
			{
				conversationId,
			},
		)
		const result =
			scope.documentIds.length === 0
				? { text: '', results: [], entries: [], usage: { tokens: 0 } }
				: await rag.search(ctx, {
						namespace: scope.tenant,
						query,
						filters: scope.documentIds.map((documentId: string) => ({
							name: 'documentId' as const,
							value: documentId,
						})),
						limit,
						vectorScoreThreshold,
						chunkContext,
					})
		await ctx.runMutation(internal.api.conversations.appendMessage, {
			ownerId: conversationId,
			role: 'agent',
			toolResults: [
				{
					callId: callId ?? `knowledge:${Date.now()}`,
					output: result.text,
					isError: false,
					retrievalEntryIds: result.entries.map((entry) => entry.entryId),
				},
			],
			interrupted: false,
		})
		return result
	},
})

/** Runtime alias retained while the Agent resolver migrates in U3. */
export const search = searchKnowledge
