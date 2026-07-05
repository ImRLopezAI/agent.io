import { z } from 'zod'

import { tenantTable } from './helper.ts'

/**
 * Knowledge Base (ERD §1c): native RAG on Convex vector search, following the
 * separate-vector-table pattern — metadata reads never load embeddings, and
 * `tenant` is a filterField INSIDE the vector index (isolation in the index).
 */

/** One embedding model per deployment; changing it means a reindex migration. */
export const EMBEDDING = {
	model: 'text-embedding-3-small',
	dimensions: 1536,
} as const

export const KbDocuments = tenantTable(
	'kbDocuments',
	() => ({
		name: z.string().min(1).max(200),
		type: z.enum(['text', 'url', 'file']),
		sourceUrl: z.string().optional(),
		/** Convex storage id of the original upload (file type). */
		storageId: z.string().optional(),
		/** text type / extracted text (may spill to storage if large). */
		content: z.string().optional(),
		/** auto = RAG retrieval; prompt = always injected verbatim at expand. */
		usageMode: z.enum(['auto', 'prompt']).default('auto'),
		status: z.enum(['processing', 'indexed', 'failed']).default('processing'),
		failureReason: z.string().optional(),
		sizeBytes: z.number().int().nonnegative().default(0),
		chunkCount: z.number().int().nonnegative().default(0),
	}),
	{
		searchIndexes: {
			search_name: { searchField: 'name', filterFields: ['tenant'] },
		},
	},
)

export const validateKbDocument = (d: {
	type: 'text' | 'url' | 'file'
	sourceUrl?: string
	storageId?: string
	content?: string
}): string | null => {
	if (d.type === 'url' && !d.sourceUrl) return 'url documents require sourceUrl'
	if (d.type === 'file' && !d.storageId)
		return 'file documents require storageId'
	if (d.type === 'text' && !d.content) return 'text documents require content'
	return null
}

export const KbChunks = tenantTable(
	'kbChunks',
	(id) => ({
		documentId: id('kbDocuments'),
		order: z.number().int().nonnegative(),
		/** The chunk content returned to the session. */
		text: z.string(),
		embeddingId: id('kbEmbeddings').optional(),
	}),
	{
		indexes: {
			by_document: ['documentId', 'order'],
			by_embedding: ['embeddingId'],
		},
		searchIndexes: {
			search_text: {
				searchField: 'text',
				filterFields: ['tenant', 'documentId'],
			},
		},
	},
)

export const KbEmbeddings = tenantTable(
	'kbEmbeddings',
	(id) => ({
		embedding: z.array(z.number()),
		documentId: id('kbDocuments'),
	}),
	{
		vectorIndexes: {
			by_embedding: {
				vectorField: 'embedding',
				dimensions: EMBEDDING.dimensions,
				filterFields: ['tenant', 'documentId'],
			},
		},
	},
)
