import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { onError } from '@orpc/server'
import { CompressionPlugin } from '@orpc/server/fetch'
import { BatchHandlerPlugin, ResponseHeadersPlugin } from '@orpc/server/plugins'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { createRpcContext, os, type RpcContext } from './init'
import { healthRouter } from './routes/health.router'
import { workOsRouter } from './routes/work-os.router'

const router = os.router({
	health: healthRouter,
	workOs: workOsRouter,
})
export type AppRouter = typeof router

const rpcHandler = new OpenAPIHandler(router, {
	interceptors: [
		onError((error) => {
			console.error(error)
		}),
	],
	plugins: [
		new ResponseHeadersPlugin<RpcContext>(),
		new BatchHandlerPlugin(),
		new CompressionPlugin(),
		new OpenAPIReferencePlugin({
			docsTitle: 'Sunday Operations API Docs',
			schemaConverters: [new ZodToJsonSchemaConverter()],
			specGenerateOptions: {
				info: {
					title: 'Sunday Operations API',
					version: '1.0.0',
					description:
						'API documentation for the Clerk-backed Sunday RPC surface that powers canonical department workflows.',
				},
				components: {
					securitySchemes: {
						bearerAuth: {
							type: 'http',
							scheme: 'bearer',
							description: 'Bearer token authentication for Sunday operators',
						},
					},
				},
			},
		}),
	],
})

export { createRpcContext, rpcHandler, router }
