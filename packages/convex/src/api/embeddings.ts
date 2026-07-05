import { EMBEDDING } from '@agent.io/domain/schemas'
import { embed, embedMany } from 'ai'

/**
 * Embeddings via the AI SDK — model strings resolve through the Vercel AI
 * Gateway (AI_GATEWAY_API_KEY in convex env), no hand-rolled fetch. One
 * embedding model per deployment (EMBEDDING constant); changing it means a
 * reindex migration.
 */
const MODEL = `openai/${EMBEDDING.model}`

export const embedTexts = async (texts: string[]): Promise<number[][]> => {
	const { embeddings } = await embedMany({ model: MODEL, values: texts })
	return embeddings
}

export const embedText = async (text: string): Promise<number[]> => {
	const { embedding } = await embed({ model: MODEL, value: text })
	return embedding
}
