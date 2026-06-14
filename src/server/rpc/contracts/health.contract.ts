import { z } from 'zod'
import { base } from './base'

export const healthContract = base
	.route({
		method: 'GET',
		path: '/health',
		tags: ['Health'],
		summary: 'Liveness probe',
	})
	.output(z.object({ message: z.string() }))
