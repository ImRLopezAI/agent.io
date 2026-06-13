import { createRPCRouter, publicProcedure } from '@server/rpc/init'

export const healthRouter = createRPCRouter(
	{
		health: publicProcedure.handler(async () => {
			return {
				message: 'Hello, world!',
			}
		}),
	},
	{
		tags: ['Health'],
	},
)
