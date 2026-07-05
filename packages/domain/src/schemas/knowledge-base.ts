import { z } from 'zod'

import { tenantTable } from './helper.ts'
import { KB_USAGE_MODES } from './shared.ts'

/**
 * Knowledge Base (ERD §1c): native RAG on Convex vector search. Indexes are
 * declared where they belong — at the schema definition site
 * (packages/convex/src/schema.ts): vector index on kbEmbeddings with
 * `tenant` + `documentId` filterFields, search indexes on chunks/documents.
 */

/** One embedding model per deployment; changing it means a reindex migration. */
export const EMBEDDING = {
	model: 'text-embedding-3-small',
	dimensions: 1536,
} as const

export const KB_DOCUMENT_TYPES = ['text', 'url', 'file'] as const
export type KbDocumentType = (typeof KB_DOCUMENT_TYPES)[number]
export const KB_DOCUMENT_STATUSES = ['processing', 'indexed', 'failed'] as const

export const kbDocuments = tenantTable('kbDocuments', () => ({
	name: z.string().min(1).max(200),
	type: z.enum(KB_DOCUMENT_TYPES),
	sourceUrl: z.string().optional(),
	/** Convex storage id of the original upload (file type). */
	storageId: z.string().optional(),
	/** text type / extracted text (may spill to storage if large). */
	content: z.string().optional(),
	/** auto = RAG retrieval; prompt = always injected verbatim at expand. */
	usageMode: z.enum(KB_USAGE_MODES).default('auto'),
	status: z.enum(KB_DOCUMENT_STATUSES).default('processing'),
	failureReason: z.string().optional(),
	sizeBytes: z.number().int().nonnegative().default(0),
	chunkCount: z.number().int().nonnegative().default(0),
}))

export const validateKbDocument = (d: {
	type: KbDocumentType
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

export const kbChunks = tenantTable('kbChunks', (id) => ({
	documentId: id('kbDocuments'),
	order: z.number().int().nonnegative(),
	/** The chunk content returned to the session. */
	text: z.string(),
	embeddingId: id('kbEmbeddings').optional(),
}))

export const kbEmbeddings = tenantTable('kbEmbeddings', (id) => ({
	embedding: z.array(z.number()),
	documentId: id('kbDocuments'),
}))
