import { z } from 'zod'

import { tenantTable } from './helper.ts'

/**
 * Stable product identity for component-owned Knowledge Base content.
 * Text, metadata, chunks, embeddings, filters, and entry lifecycle live in
 * `@convex-dev/rag`; this row only coordinates the ready entry and tombstone.
 */
export const kbDocuments = tenantTable('kbDocuments', () => ({
	activeEntryId: z.string().min(1).optional(),
	lastError: z.string().min(1).optional(),
	archived: z.boolean().default(false),
	archivedAt: z.string().optional(),
}))
