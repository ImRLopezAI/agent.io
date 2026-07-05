import { EMBEDDING } from '@agent.io/domain/schemas'

/**
 * Embed texts via the AI gateway (AI_GATEWAY_API_KEY in convex env). One
 * embedding model per deployment (EMBEDDING constant); changing models means
 * a reindex migration.
 */
export const embedTexts = async (texts: string[]): Promise<number[][]> => {
	const apiKey = process.env.AI_GATEWAY_API_KEY
	if (!apiKey) throw new Error('AI_GATEWAY_API_KEY is not configured')
	const res = await fetch('https://ai-gateway.vercel.sh/v1/embeddings', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${apiKey}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify({ model: `openai/${EMBEDDING.model}`, input: texts }),
	})
	if (!res.ok) {
		throw new Error(
			`embedding request failed: ${res.status} ${await res.text()}`,
		)
	}
	const body = (await res.json()) as { data: { embedding: number[] }[] }
	return body.data.map((d) => d.embedding)
}
