import { os } from '@server/rpc/init'

export const healthRouter = os.health.handler(async () => {
	return {
		message: 'Hello, world!',
	}
})
