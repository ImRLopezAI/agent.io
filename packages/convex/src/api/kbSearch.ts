import { v } from 'convex/values'

import { internal } from '../_generated/api'
import {
	internalAction,
	internalQuery as rawInternalQuery,
} from '../_generated/server'
import { embedTexts } from './embeddings'

/**
 * KB retrieval (plan Unit 9). Tenant is DERIVED, never passed: the session's
 * tool wrapper passes the conversationId it was resolved for; the action
 * loads that row, uses its tenant for the vector filter, and validates the
 * document scope. Same derive-from-owning-resource rule as machineMutation.
 */

export const scopeForConversation = rawInternalQuery({
	args: { conversationId: v.id('conversations') },
	handler: async (ctx, { conversationId }) => {
		const conversation = await ctx.db.get(conversationId)
		if (!conversation) throw new Error('conversation not found')
		const version = await ctx.db.get(conversation.agentVersionId)
		if (!version) throw new Error('agent version not found')
		const documentIds = version.config.knowledgeBase
			.filter((k: { usageMode: string }) => k.usageMode === 'auto')
			.map((k: { documentId: string }) => k.documentId)
		return { tenant: conversation.tenant, documentIds }
	},
})

export const loadChunksByEmbeddingIds = rawInternalQuery({
	args: { embeddingIds: v.array(v.id('kbEmbeddings')), tenant: v.string() },
	handler: async (ctx, { embeddingIds, tenant }) => {
		const chunks = []
		for (const embeddingId of embeddingIds) {
			const chunk = await ctx.db
				.query('kbChunks')
				.withIndex('by_embedding', (q) => q.eq('embeddingId', embeddingId))
				.unique()
			if (chunk && chunk.tenant === tenant) chunks.push(chunk)
		}
		return chunks
	},
})

/** Core search taking a precomputed vector — the public path embeds first. */
export const searchWithVector = internalAction({
	args: {
		conversationId: v.id('conversations'),
		vector: v.array(v.float64()),
		query: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { conversationId, vector, query, limit }) => {
		const scope = await ctx.runQuery(
			internal.api.kbSearch.scopeForConversation,
			{ conversationId },
		)
		if (scope.documentIds.length === 0) return []

		const results = await ctx.vectorSearch('kbEmbeddings', 'by_embedding', {
			vector,
			limit: Math.min(limit ?? 8, 64),
			filter: (q) =>
				q.or(
					...scope.documentIds.map((id: string) =>
						q.eq('documentId', id as never),
					),
				),
		})
		const chunks = await ctx.runQuery(
			internal.api.kbSearch.loadChunksByEmbeddingIds,
			{
				embeddingIds: results.map((r) => r._id),
				tenant: scope.tenant,
			},
		)
		const scoreByEmbedding = new Map(results.map((r) => [r._id, r._score]))
		// hybrid recall: merge exact-term hits (SKUs, names) embeddings miss
		const textHits = await ctx.runQuery(internal.api.kbSearch.textSearch, {
			tenant: scope.tenant,
			documentIds: scope.documentIds,
			query,
		})
		const byId = new Map<
			string,
			{ text: string; score: number; documentId: string }
		>()
		for (const chunk of chunks) {
			byId.set(chunk._id, {
				text: chunk.text,
				score: chunk.embeddingId
					? (scoreByEmbedding.get(chunk.embeddingId) ?? 0)
					: 0,
				documentId: chunk.documentId,
			})
		}
		for (const hit of textHits) {
			if (!byId.has(hit._id)) {
				byId.set(hit._id, {
					text: hit.text,
					score: 0.5,
					documentId: hit.documentId,
				})
			}
		}
		return [...byId.values()].sort((a, b) => b.score - a.score)
	},
})

export const textSearch = rawInternalQuery({
	args: {
		tenant: v.string(),
		documentIds: v.array(v.string()),
		query: v.string(),
	},
	handler: async (ctx, { tenant, documentIds, query }) => {
		const hits = await ctx.db
			.query('kbChunks')
			.withSearchIndex('search_text', (q) =>
				q.search('text', query).eq('tenant', tenant),
			)
			.take(16)
		const allowed = new Set(documentIds)
		return hits.filter((h) => allowed.has(h.documentId))
	},
})

/** Public entry for the session's search_knowledge_base tool. */
export const search = internalAction({
	args: {
		conversationId: v.id('conversations'),
		query: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (
		ctx,
		{ conversationId, query, limit },
	): Promise<{ text: string; score: number; documentId: string }[]> => {
		const [vector] = await embedTexts([query])
		return ctx.runAction(internal.api.kbSearch.searchWithVector, {
			conversationId,
			vector: vector ?? [],
			query,
			limit,
		})
	},
})
