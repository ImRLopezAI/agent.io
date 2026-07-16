import type { Entry, EntryId } from '@convex-dev/rag'
import { v } from 'convex/values'
import { z } from 'zod'

import { internal } from '../_generated/api'
import type { Doc } from '../_generated/dataModel'
import { internalQuery } from '../_generated/server'
import { nativePaginationOpts, now, stampCreate, stampUpdate } from '../lib'
import {
	rag,
	type KnowledgeEntryMetadata,
	type KnowledgeFilterTypes,
} from '../rag'
import {
	authAction,
	requirePermission,
	resolveTenantId,
	tenantMutation,
	tenantQuery,
	triggeredInternalMutation,
} from '../utils'

const metadataSchema = z.object({
	title: z.string().min(1).max(200),
	sourceType: z.enum(['text', 'url', 'file']).default('text'),
	sourceUrl: z.string().url().nullable().default(null),
})

const ragKey = (documentId: string) => `kb:${documentId}`

type KnowledgeEntry = Entry<KnowledgeFilterTypes, KnowledgeEntryMetadata>

export const toKnowledgeDocumentDto = (
	document: Pick<
		Doc<'kbDocuments'>,
		| '_id'
		| '_creationTime'
		| 'activeEntryId'
		| 'lastError'
		| 'archived'
		| 'archivedAt'
		| 'createdAt'
		| 'updatedAt'
	>,
	entry: KnowledgeEntry | null,
) => {
	const ready =
		!document.archived &&
		entry?.status === 'ready' &&
		entry.entryId === document.activeEntryId
	return {
		id: document._id,
		availability: document.archived
			? ('archived' as const)
			: ready
				? ('ready' as const)
				: ('unavailable' as const),
		entryId: ready ? entry.entryId : undefined,
		title: ready ? (entry.metadata?.title ?? entry.title) : undefined,
		sourceType: ready ? entry.metadata?.sourceType : undefined,
		sourceUrl: ready ? entry.metadata?.sourceUrl : undefined,
		componentStatus: entry?.status,
		lastError: document.lastError,
		archivedAt: document.archivedAt,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt,
		creationTime: document._creationTime,
	}
}

const readActiveEntry = async (
	ctx: Parameters<typeof rag.getEntry>[0],
	document: Doc<'kbDocuments'>,
) => {
	if (!document.activeEntryId) return null
	try {
		return await rag.getEntry(ctx, {
			entryId: document.activeEntryId as EntryId,
		})
	} catch {
		return null
	}
}

export const resolveDocument = internalQuery({
	args: { documentId: v.string() },
	handler: async (ctx, { documentId }) => {
		const id = ctx.db.normalizeId('kbDocuments', documentId)
		return id ? ctx.db.get(id) : null
	},
})

export const createDocument = tenantMutation({
	args: {},
	handler: async (ctx) => {
		requirePermission(ctx.org, 'prompts:write')
		return ctx.db.insert(
			'kbDocuments',
			stampCreate(ctx.tenant, { archived: false }),
		)
	},
})

export const listDocuments = tenantQuery({
	args: {
		archived: z.boolean().default(false),
		paginationOpts: nativePaginationOpts,
	},
	handler: async (ctx, { archived, paginationOpts }) => {
		requirePermission(ctx.org, 'prompts:read')
		const result = await ctx.db
			.query('kbDocuments')
			.withIndex('by_tenant_and_archived', (q) =>
				q.eq('tenant', ctx.tenant).eq('archived', archived),
			)
			.order('desc')
			.paginate(paginationOpts)
		const page = await Promise.all(
			result.page.map(async (document) =>
				toKnowledgeDocumentDto(document, await readActiveEntry(ctx, document)),
			),
		)
		return { ...result, page }
	},
})

export const getDocument = tenantQuery({
	args: { documentId: z.string() },
	handler: async (ctx, { documentId }) => {
		requirePermission(ctx.org, 'prompts:read')
		const id = await resolveTenantId(
			ctx,
			'kbDocuments',
			documentId,
			'knowledge document',
		)
		const document = await ctx.db.get(id)
		if (!document) throw new Error('knowledge document not found')
		return toKnowledgeDocumentDto(
			document,
			await readActiveEntry(ctx, document),
		)
	},
})

export const listDocumentChunks = tenantQuery({
	args: { documentId: z.string(), paginationOpts: nativePaginationOpts },
	handler: async (ctx, { documentId, paginationOpts }) => {
		requirePermission(ctx.org, 'prompts:read')
		const id = await resolveTenantId(
			ctx,
			'kbDocuments',
			documentId,
			'knowledge document',
		)
		const document = await ctx.db.get(id)
		if (!document?.activeEntryId || document.archived) {
			throw new Error('knowledge content is unavailable')
		}
		const result = await rag.listChunks(ctx, {
			entryId: document.activeEntryId as EntryId,
			paginationOpts,
		})
		return {
			...result,
			page: result.page.map((chunk) => ({
				order: chunk.order,
				state: chunk.state,
				text: chunk.text,
				metadata: chunk.metadata,
			})),
		}
	},
})

export const upsertKnowledgeContent = authAction({
	args: {
		documentId: z.string(),
		text: z.string().min(1),
		metadata: metadataSchema.optional(),
	},
	handler: async (ctx, { documentId, text, metadata }) => {
		requirePermission(ctx.org, 'prompts:write')
		const document = await ctx.runQuery(
			internal.api.knowledgeBase.resolveDocument,
			{ documentId },
		)
		if (!document || document.tenant !== ctx.org.organizationId) {
			throw new Error('document not found')
		}
		if (document.archived) throw new Error('document is archived')
		const entryMetadata = metadata ?? {
			title: documentId,
			sourceType: 'text' as const,
			sourceUrl: null,
		}

		try {
			const result = await rag.add(ctx, {
				namespace: document.tenant,
				key: ragKey(documentId),
				text,
				title: entryMetadata.title,
				metadata: entryMetadata,
				filterValues: [{ name: 'documentId', value: documentId }],
			})
			if (result.status !== 'ready') {
				throw new Error(`knowledge entry finished with ${result.status} status`)
			}
			const activated = await ctx.runMutation(
				internal.api.knowledgeBase.activateEntry,
				{ documentId: document._id, entryId: result.entryId },
			)
			if (!activated) {
				await rag.delete(ctx, { entryId: result.entryId })
				throw new Error('document was archived while content was being added')
			}
			return result
		} catch (error) {
			await ctx.runMutation(internal.api.knowledgeBase.recordFailure, {
				documentId: document._id,
				message: 'Knowledge content ingestion failed',
			})
			throw error
		}
	},
})

export const archiveDocument = authAction({
	args: { documentId: z.string() },
	handler: async (ctx, { documentId }) => {
		requirePermission(ctx.org, 'prompts:write')
		const document = await ctx.runQuery(
			internal.api.knowledgeBase.resolveDocument,
			{ documentId },
		)
		if (!document || document.tenant !== ctx.org.organizationId) {
			throw new Error('document not found')
		}
		await ctx.runMutation(internal.api.knowledgeBase.markArchived, {
			documentId: document._id,
		})
		const namespace = await rag.getNamespace(ctx, {
			namespace: document.tenant,
		})
		if (namespace) {
			await rag.deleteByKey(ctx, {
				namespaceId: namespace.namespaceId,
				key: ragKey(documentId),
			})
		}
	},
})

export const activateEntry = triggeredInternalMutation({
	args: {
		documentId: v.id('kbDocuments'),
		entryId: v.string(),
	},
	handler: async (ctx, { documentId, entryId }) => {
		const document = await ctx.db.get(documentId)
		if (!document || document.archived) return false
		await ctx.db.patch(
			documentId,
			stampUpdate({ activeEntryId: entryId, lastError: undefined }),
		)
		return true
	},
})

export const recordFailure = triggeredInternalMutation({
	args: {
		documentId: v.id('kbDocuments'),
		message: v.string(),
	},
	handler: async (ctx, { documentId, message }) => {
		const document = await ctx.db.get(documentId)
		if (!document) return
		await ctx.db.patch(documentId, stampUpdate({ lastError: message }))
	},
})

export const markArchived = triggeredInternalMutation({
	args: { documentId: v.id('kbDocuments') },
	handler: async (ctx, { documentId }) => {
		const document = await ctx.db.get(documentId)
		if (!document) return
		await ctx.db.patch(
			documentId,
			stampUpdate({
				archived: true,
				archivedAt: now(),
				activeEntryId: undefined,
			}),
		)
	},
})
