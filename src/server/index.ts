import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'
import { agentRequestHandler } from './ai'
import { createRpcContext, handler as rpcHandler } from './rpc'

const BODY_PARSER_METHODS = [
	'arrayBuffer',
	'blob',
	'formData',
	'json',
	'text',
] as const
type BodyParserMethod = (typeof BODY_PARSER_METHODS)[number]
const bodyParserMethodSet: ReadonlySet<BodyParserMethod> = new Set(
	BODY_PARSER_METHODS,
)

export const app = new Hono()

app.use(requestId())
app.use(logger())

if (process.env.NODE_ENV !== 'production') {
	app.on(['GET', 'POST'], '/api/dev/seed', async (c) => {
		try {
			return c.json({ success: true })
		} catch (error) {
			console.error('[dev seed] error', error)
			return c.json(
				{
					success: false,
					error: error instanceof Error ? error.message : 'Seed failed',
				},
				500,
			)
		}
	})
}

app.on('POST', ['/api/agents', '/api/chat'], async (c) => {
	const request = c.req.raw
	return await agentRequestHandler(request)
})


app.use('/api/rpc/*', async (c, next) => {
	try {
		const request = new Proxy(c.req.raw, {
			get(target, prop) {
				if (bodyParserMethodSet.has(prop as BodyParserMethod)) {
					return () => c.req[prop as BodyParserMethod]()
				}
				return Reflect.get(target, prop, target)
			},
		})
		const context = await createRpcContext({
			headers: request.headers,
		})
		const { matched, response } = await rpcHandler.handle(request, {
			prefix: '/api/rpc',
			context,
		})
		return matched ? c.newResponse(response.body, response) : next()
	} catch (error) {
		const isProd = process.env.NODE_ENV === 'production'
		console.error('[rpc] error', error)
		return c.json(
			{
				status: 'error',
				error:
					!isProd && error instanceof Error
						? error.message
						: 'Internal server error',
			},
			500,
		)
	}
})
export const handler = app.fetch
