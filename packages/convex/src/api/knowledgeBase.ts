import { validateKbDocument } from '@agent.io/domain/schemas'
import { v } from 'convex/values'
import { z } from 'zod'

import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import { now, stampCreate } from '../lib'
import {
	tenantMutation,
	tenantQuery,
	triggeredInternalMutation,
} from '../utils'
import { embedTexts } from './embeddings'

/** Paragraph-first chunking with a max-size cap (tune with real documents). */
export const chunkText = (text: string, maxChars = 2000): string[] => {
	const paragraphs = text
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean)
	const chunks: string[] = []
	let current = ''
	for (const paragraph of paragraphs) {
		if (paragraph.length > maxChars) {
			if (current) {
				chunks.push(current)
				current = ''
			}
			for (let i = 0; i < paragraph.length; i += maxChars) {
				chunks.push(paragraph.slice(i, i + maxChars))
			}
			continue
		}
		if (current.length + paragraph.length + 2 > maxChars) {
			chunks.push(current)
			current = paragraph
		} else {
			current = current ? `${current}\n\n${paragraph}` : paragraph
		}
	}
	if (current) chunks.push(current)
	return chunks
}

export const createDocument = tenantMutation({
	args: {
		name: z.string().min(1).max(200),
		type: z.enum(['text', 'url', 'file']),
		content: z.string().optional(),
		sourceUrl: z.string().optional(),
		storageId: z.string().optional(),
		usageMode: z.enum(['auto', 'prompt']).default('auto'),
	},
	handler: async (ctx, args) => {
		const violation = validateKbDocument(args)
		if (violation) throw new Error(violation)
		const documentId = await ctx.db.insert(
			'kbDocuments',
			stampCreate(ctx.tenant, {
				...args,
				status: 'processing',
				sizeBytes: args.content?.length ?? 0,
				chunkCount: 0,
			}),
		)
		await ctx.scheduler.runAfter(0, internal.api.knowledgeBase.ingest, {
			documentId,
		})
		return documentId
	},
})

export const listDocuments = tenantQuery({
	args: {},
	handler: async (ctx) =>
		ctx.db
			.query('kbDocuments')
			.withIndex('by_tenant', (q) => q.eq('tenant', ctx.tenant))
			.collect(),
})

export const removeDocument = tenantMutation({
	args: { id: z.string() },
	handler: async (ctx, { id }) => {
		const documentId = ctx.db.normalizeId('kbDocuments', id)
		if (!documentId) throw new Error('invalid document id')
		// cascade (chunks + embeddings) runs via the kbDocuments delete trigger
		await ctx.db.delete(documentId)
	},
})

/**
 * Ingestion saga (plan Unit 9): the ACTION computes chunks + embeddings in
 * memory; all rows land through idempotent internal mutations keyed by
 * (documentId, order) — a retry after mid-batch failure upserts, never
 * duplicates. Document status is the saga marker.
 */
export const ingest = internalAction({
	args: { documentId: v.id('kbDocuments') },
	handler: async (ctx, { documentId }) => {
		const doc = await ctx.runQuery(internal.api.internals.kbDocuments.read, {
			id: documentId,
		})
		if (!doc) return
		try {
			// text extraction: text type only for now (url/file fetch/parse
			// deferred per plan Open Questions)
			const text = doc.content ?? ''
			if (!text) throw new Error(`no extractable text for ${doc.type} document`)
			const chunks = chunkText(text)
			const vectors = await embedTexts(chunks)
			await ctx.runMutation(internal.api.knowledgeBase.writeChunks, {
				documentId,
				chunks: chunks.map((chunkTextValue, order) => ({
					order,
					text: chunkTextValue,
					embedding: vectors[order] ?? [],
				})),
			})
		} catch (error) {
			await ctx.runMutation(internal.api.internals.kbDocuments.update, {
				id: documentId,
				patch: { status: 'failed', failureReason: String(error) },
			})
		}
	},
})

/** Transactional, idempotent chunk+embedding write; flips status to indexed. */
export const writeChunks = triggeredInternalMutation({
	args: {
		documentId: v.id('kbDocuments'),
		chunks: v.array(
			v.object({
				order: v.number(),
				text: v.string(),
				embedding: v.array(v.number()),
			}),
		),
	},
	handler: async (ctx, { documentId, chunks }) => {
		const doc = await ctx.db.get(documentId)
		if (!doc) return
		// idempotency: clear any partial prior attempt for this document
		const existing = await ctx.db
			.query('kbChunks')
			.withIndex('by_document', (q) => q.eq('documentId', documentId))
			.collect()
		for (const chunk of existing) {
			if (chunk.embeddingId) await ctx.db.delete(chunk.embeddingId)
			await ctx.db.delete(chunk._id)
		}
		for (const chunk of chunks) {
			const embeddingId = await ctx.db.insert('kbEmbeddings', {
				tenant: doc.tenant,
				documentId,
				embedding: chunk.embedding,
				createdAt: now(),
			})
			await ctx.db.insert('kbChunks', {
				tenant: doc.tenant,
				documentId,
				order: chunk.order,
				text: chunk.text,
				embeddingId,
				createdAt: now(),
			})
		}
		await ctx.db.patch(documentId, {
			status: 'indexed',
			failureReason: undefined,
			updatedAt: now(),
		})
	},
})
