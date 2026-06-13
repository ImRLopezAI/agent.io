import { redis } from './redis'

const CACHE_PREFIX = 'convex:'
const DEFAULT_TTL = 300 // 5 minutes default

// TTL presets for different use cases
export const TTL = {
	SHORT: 60, // 1 minute - for frequently changing data
	DEFAULT: 300, // 5 minutes - default
	MEDIUM: 900, // 15 minutes - for semi-static data
	LONG: 3600, // 1 hour - for rarely changing data
	AGENT_LOOKUP: 43200, // 12 hours - for agent ID lookups
} as const

export type CacheOptions = {
	ttl?: number | keyof typeof TTL // TTL in seconds or preset name
	skip?: boolean // Skip cache entirely (default: false)
}

export function resolveTTL(ttl: number | keyof typeof TTL | undefined): number {
	if (ttl === undefined) return DEFAULT_TTL
	if (typeof ttl === 'number') return ttl
	return TTL[ttl]
}

function getCacheKey(module: string, method: string, args: unknown): string {
	const argsHash = args ? JSON.stringify(args) : ''
	return `${CACHE_PREFIX}${module}:${method}:${argsHash}`
}

export const cache = {
	async get<T>(
		module: string,
		method: string,
		args: unknown,
	): Promise<T | null> {
		const key = getCacheKey(module, method, args)
		try {
			return await redis.get<T>(key)
		} catch (error) {
			console.error('Cache get error:', error)
			return null
		}
	},

	async set<T>(
		module: string,
		method: string,
		args: unknown,
		value: T,
		ttl: number,
	): Promise<void> {
		const key = getCacheKey(module, method, args)
		try {
			await redis.set(key, value, { ex: ttl })
		} catch (error) {
			console.error('Cache set error:', error)
		}
	},

	async invalidate(module: string): Promise<void> {
		try {
			const pattern = `${CACHE_PREFIX}${module}:*`
			await invalidatePattern(pattern)
		} catch (error) {
			console.error('Cache invalidate error:', error)
		}
	},

	async flush(): Promise<void> {
		try {
			await invalidatePattern(`${CACHE_PREFIX}*`)
		} catch (error) {
			console.error('Cache flush error:', error)
		}
	},

	async getStats(): Promise<{ keys: number }> {
		try {
			const keys = await redis.keys(`${CACHE_PREFIX}*`)
			return { keys: keys.length }
		} catch (error) {
			console.error('Cache stats error:', error)
			return { keys: 0 }
		}
	},

	DEFAULT_TTL,
}

async function invalidatePattern(pattern: string): Promise<number> {
	try {
		const keys = await redis.keys(pattern)
		if (keys.length > 0) {
			await redis.del(...keys)
		}
		return keys.length
	} catch (error) {
		console.error('invalidatePattern error:', error)
		return 0
	}
}
