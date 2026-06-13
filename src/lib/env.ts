import { z } from 'zod'

export const env = z
	.object({
		NODE_ENV: z
			.enum(['development', 'production', 'test'])
			.default('development'),
		BASE_URL: z.string().default(''),
		// Database
		REDIS_REST_URL: z.string().default(''),
		REDIS_REST_TOKEN: z.string().default(''),
		// WorkOS AuthKit
		WORKOS_API_KEY: z.string().default(''),
		WORKOS_CLIENT_ID: z.string().default(''),
		WORKOS_REDIRECT_URI: z
			.string()
			.default('http://localhost:3000/api/auth/callback'),
		WORKOS_COOKIE_PASSWORD: z.string().default(''),
		// Communication
		RESEND_API_KEY: z.string().default(''),
		EMAIL_FROM: z.string().default('Helix <onboarding@resend.dev>'),
		// AI
		AI_GATEWAY_API_KEY: z.string().default(''),
		// Theme
		GOOGLE_FONTS_API_KEY: z.string().default(''),
	})
	.parse(process.env)
