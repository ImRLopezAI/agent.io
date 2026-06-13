import { env } from '@lib/env'
import { Redis } from '@upstash/redis'
export const redis = new Redis({
	url: env.REDIS_REST_URL,
	token: env.REDIS_REST_TOKEN,
})
