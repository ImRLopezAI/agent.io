import { RAG } from '@convex-dev/rag'

import { components } from './_generated/api'

export const RAG_EMBEDDING = {
	model: 'openai/text-embedding-3-small',
	dimensions: 1536,
} as const

export type KnowledgeFilterTypes = {
	documentId: string
}

export type KnowledgeEntryMetadata = {
	title: string
	sourceType: 'text' | 'url' | 'file'
	sourceUrl: string | null
}

export const rag = new RAG<KnowledgeFilterTypes, KnowledgeEntryMetadata>(
	components.rag,
	{
		textEmbeddingModel: RAG_EMBEDDING.model,
		embeddingDimension: RAG_EMBEDDING.dimensions,
		filterNames: ['documentId'],
	},
)
