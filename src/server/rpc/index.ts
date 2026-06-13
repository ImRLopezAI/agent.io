import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { onError } from '@orpc/server'
import { CompressionPlugin } from '@orpc/server/fetch'
import { BatchHandlerPlugin, ResponseHeadersPlugin } from '@orpc/server/plugins'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { createRPCRouter, createRpcContext, type RpcContext } from './init'
import { healthRouter } from './routes/health.router'

const rpcRouter = createRPCRouter({
	health: healthRouter,
})
export type RPCRouter = typeof rpcRouter

const handler = new OpenAPIHandler(rpcRouter, {
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
				// Note: Sunday uses Clerk cookie-based auth, not Bearer tokens.
				// Do NOT add global `security` here — it causes the OpenAPI UI
				// to send an empty `Authorization: Bearer` header, which Clerk
				// rejects before it can fall back to the valid session cookie.
			},
		}),
	],
})

export { createRpcContext, handler, rpcRouter }
